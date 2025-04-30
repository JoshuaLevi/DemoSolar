import { AgentResponse, ConversationTurn, Offer, PropertyAssessment, FinancingOption, AgentType } from '../models/types';
import { proposalAgentPrompt } from './systemPrompts';
import { getAllAssessments } from './solarAssessmentAgent';
import { assessmentsContainer, proposalsContainer } from '../utils/cosmosClient';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// In-memory database for offers
let offers: Offer[] = [];

// Export offers for the CRM dashboard
export const getAllOffers = (): Offer[] => {
  return offers;
};

// Constants for calculations (NL Context)
const COST_PER_WATT = 1.5; // €1.50 per watt installed (Assumption)
const PANEL_WATTAGE = 400; // 400W per panel
const FEDERAL_TAX_CREDIT = 0.0; // Geen directe landelijke tax credit zoals in US; BTW teruggave apart.
const PANELS_PER_KW = 1000 / PANEL_WATTAGE; 
const AVG_ELECTRICITY_RATE = 0.30; // €0.30 per kWh (Assumption)

// Helper to parse energy usage string (simple version)
const parseEnergyUsage = (usageString?: string): { annualKWh?: number, monthlyBill?: number } => {
    if (!usageString) return {};
    const lowerUsage = usageString.toLowerCase();

    // Look for kWh patterns
    const kwhYearMatch = lowerUsage.match(/(\d+(?:[,.]\d+)*)\s*kwh\s*(?:\/|per|a)?\s*year/);
    if (kwhYearMatch && kwhYearMatch[1]) {
        return { annualKWh: parseInt(kwhYearMatch[1].replace(/[,.]/g, '')) };
    }
    const kwhMonthMatch = lowerUsage.match(/(\d+(?:[,.]\d+)*)\s*kwh\s*(?:\/|per|a)?\s*month/);
    if (kwhMonthMatch && kwhMonthMatch[1]) {
        return { annualKWh: parseInt(kwhMonthMatch[1].replace(/[,.]/g, '')) * 12 };
    }

    // Look for currency patterns (assuming monthly bill)
    const billMatch = lowerUsage.match(/(?:\$|usd|eur|euro|bill.*?)\s*(\d+(?:[,.]\d+)*)/);
    if (billMatch && billMatch[1]) {
        return { monthlyBill: parseInt(billMatch[1].replace(/[,.]/g, '')) };
    }

    // Fallback: try to extract any number as kWh/month if it contains 'kwh'
    const genericKwhMatch = lowerUsage.match(/(\d+(?:[,.]\d+)*)\s*kwh/);
    if (genericKwhMatch && genericKwhMatch[1]) {
         return { annualKWh: parseInt(genericKwhMatch[1].replace(/[,.]/g, '')) * 12 };
    }

    // Fallback: try to extract any number as monthly bill
    const genericNumMatch = lowerUsage.match(/(\d+(?:[,.]\d+)*)/);
     if (genericNumMatch && genericNumMatch[1]) {
        return { monthlyBill: parseInt(genericNumMatch[1].replace(/[,.]/g, '')) };
    }

    return {};
}

// Find the most recent property assessment for this *conversation*
const findConversationAssessment = async (conversationId: string): Promise<PropertyAssessment | null> => {
  try {
    const querySpec = {
      query: "SELECT TOP 1 * FROM c WHERE c.conversationId = @conversationId ORDER BY c.timestamp DESC",
      parameters: [
        { name: "@conversationId", value: conversationId }
      ]
    };
    const { resources: items } = await assessmentsContainer.items.query(querySpec).fetchAll();
    return items.length > 0 ? items[0] : null;
  } catch (error) {
      console.error(`Error fetching assessment for conversation ${conversationId}:`, error);
      return null;
  }
};

// Extract system size from message if mentioned
const extractSystemSize = (message: string): number | null => {
  // Look for kW mentions
  const kwMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:kw|kilowatt)/i);
  if (kwMatch && kwMatch[1]) {
    return parseFloat(kwMatch[1]);
  }
  
  // Look for panel count mentions
  const panelMatch = message.match(/(\d+)\s*(?:panel|panels)/i);
  if (panelMatch && panelMatch[1]) {
    const panelCount = parseInt(panelMatch[1]);
    return panelCount * PANEL_WATTAGE / 1000; // Convert to kW
  }
  
  return null;
};

// Extract budget from message if mentioned
const extractBudget = (message: string): number | null => {
  const budgetMatch = message.match(/budget.*?(\d+(?:,\d+)*)/i) || 
                      message.match(/afford.*?(\d+(?:,\d+)*)/i) ||
                      message.match(/(\d+(?:,\d+)*)\s*(?:dollars|usd|\$)/i);
  
  if (budgetMatch && budgetMatch[1]) {
    return parseInt(budgetMatch[1].replace(/,/g, ''));
  }
  
  return null;
};

// Extract financing preference from message if mentioned
const extractFinancingPreference = (message: string): string | null => {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('cash') || lowerMessage.includes('pay upfront') || lowerMessage.includes('lump sum')) {
    return 'cash';
  }
  
  if (lowerMessage.includes('loan') || lowerMessage.includes('finance')) {
    return 'loan';
  }
  
  if (lowerMessage.includes('lease')) {
    return 'lease';
  }
  
  if (lowerMessage.includes('ppa') || lowerMessage.includes('power purchase')) {
    return 'ppa';
  }
  
  return null;
};

// Calculate system cost based on size
const calculateSystemCost = (systemSizeKW: number): number => {
  const baseCost = systemSizeKW * 1000 * COST_PER_WATT;
  // Note: BTW teruggave is complex, laten we buiten beschouwing voor nu.
  return Math.round(baseCost); 
};

// Calculate monthly savings based on production
const calculateMonthlySavings = (annualProduction: number): number => {
  const annualSavings = annualProduction * AVG_ELECTRICITY_RATE;
  return Math.round(annualSavings / 12); 
};

// Generate financing options based on system cost (NL context)
const generateFinancingOptions = (systemCost: number): FinancingOption[] => {
  const options: FinancingOption[] = [];
  
  // Cash option (apply BTW estimate? No, keep it simple)
  options.push({
    type: 'cash',
    totalCost: systemCost // Total cost without complex tax adjustments
  });
  
  // Loan option - e.g., Energiebespaarlening (Simplified Example)
  const loanAmount = systemCost;
  const interestRateLoan = 0.04; // Example rate 4%
  const termYearsLoan = 10;
  const monthlyPaymentLoan = calculateLoanPayment(loanAmount, interestRateLoan, termYearsLoan);
  
  options.push({
    type: 'loan',
    termYears: termYearsLoan,
    interestRate: interestRateLoan,
    monthlyPayment: monthlyPaymentLoan,
    downPayment: 0,
    // Total cost over term, not adjusted for potential future rate changes
    totalCost: Math.round(monthlyPaymentLoan * termYearsLoan * 12)
  });
  
  // Lease option (Simplified Example)
  options.push({
    type: 'lease',
    termYears: 15, // Example lease term
    monthlyPayment: Math.round(systemCost / (15 * 12) * 0.9), // Example lease payment factor
    downPayment: 0
  });
  
  return options;
};

// Calculate loan payment
const calculateLoanPayment = (loanAmount: number, annualInterestRate: number, termYears: number): number => {
  const monthlyRate = annualInterestRate / 12;
  const numberOfPayments = termYears * 12;
  const payment = (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -numberOfPayments));
  return Math.round(payment);
};

// Verify calculations using metacognition
const verifyCalculations = (
  systemSizeKW: number, 
  annualProduction: number, 
  systemCost: number, 
  monthlySavings: number
): { valid: boolean, correctedValues: any } => {
  const corrections: any = {};
  let needsCorrection = false;
  
  // Check if system size is reasonable (typically 3-12kW for residential)
  if (systemSizeKW < 1 || systemSizeKW > 20) {
    corrections.systemSizeKW = Math.max(3, Math.min(12, systemSizeKW));
    needsCorrection = true;
  }
  
  // Check if production estimate is reasonable (typically 1200-1600 kWh per kW per year)
  const expectedProduction = systemSizeKW * 1400; // Average of 1400 kWh per kW
  if (annualProduction < systemSizeKW * 800 || annualProduction > systemSizeKW * 2000) {
    corrections.annualProduction = Math.round(expectedProduction);
    needsCorrection = true;
  }
  
  // Check if system cost is reasonable ($3-5 per watt installed)
  const expectedCost = systemSizeKW * 1000 * COST_PER_WATT;
  if (systemCost < expectedCost * 0.7 || systemCost > expectedCost * 1.3) {
    corrections.systemCost = Math.round(expectedCost);
    needsCorrection = true;
  }
  
  // Check if monthly savings are reasonable
  const expectedMonthlySavings = calculateMonthlySavings(annualProduction);
  if (Math.abs(monthlySavings - expectedMonthlySavings) > expectedMonthlySavings * 0.2) {
    corrections.monthlySavings = expectedMonthlySavings;
    needsCorrection = true;
  }
  
  return {
    valid: !needsCorrection,
    correctedValues: corrections
  };
};

// Format the proposal response (NL Currency)
const formatProposalResponse = (offer: Offer): string => {
  // Format financing options
  const financingText = offer.financingOptions?.map(option => {
    const formatEuro = (amount?: number) => amount?.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }) || 'N/A';
    
    if (option.type === 'cash') {
      return `**Koop:**\n- Totale Kosten: ${formatEuro(option.totalCost)}\n- Geschatte Terugverdientijd: ~${Math.round((option.totalCost || 0) / ((offer.estimatedSavings || 1) / 12))} maanden`;
    } else if (option.type === 'loan') {
      return `**Lening (${option.termYears} jaar):**\n- Maandelijkse Betaling: ${formatEuro(option.monthlyPayment)}\n- Rentepercentage: ${(option.interestRate || 0) * 100}%\n- Netto Maandelijkse Kosten/Besparing: ${formatEuro(((offer.estimatedSavings || 0) / 12) - (option.monthlyPayment || 0))}`;
    } else if (option.type === 'lease') {
      return `**Lease (${option.termYears} jaar):**\n- Maandelijkse Betaling: ${formatEuro(option.monthlyPayment)}\n- Geen aanbetaling\n- Geschatte Netto Besparing: ${formatEuro(((offer.estimatedSavings || 0) / 12) - (option.monthlyPayment || 0))} per maand`;
    }
    return ''; // Should not happen
  }).join('\n\n');

  const formatEuroSavings = (amount?: number) => amount?.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }) || 'N/A';

  return `
## Indicatief Voorstel Zonnepanelen

Op basis van de verstrekte gegevens, hier is een indicatief voorstel:

### Systeem Details
- Geschatte Systeemgrootte: ${offer.systemSize} kWp (${Math.round((offer.systemSize || 0) * PANELS_PER_KW)} panelen)
- Geschatte Jaarproductie: ${offer.annualProduction?.toLocaleString('nl-NL')} kWh
- Geschatte Jaarlijkse Besparing: ${formatEuroSavings(offer.estimatedSavings)}
- Geschatte Installatietijd: ${offer.estimatedInstallationTime}

### Financieringsopties
${financingText}

Let op: Dit is een indicatie. Voor een definitieve offerte is een inspectie nodig.
Wilt u doorgaan of de parameters aanpassen?
`.trim();
};

// Generate a proposal based on the assessment and user requirements
const generateProposal = async (
  assessment: PropertyAssessment | null, 
  userEmail: string | undefined,
  message: string
): Promise<Offer> => {
  // Default values
  let systemSizeKW = 7; // Default 7kW
  let annualProduction = 10000; // Default 10,000 kWh

  // Try to estimate based on assessment energy usage
  const parsedUsage = parseEnergyUsage(assessment?.energyUsage);
  if (parsedUsage.annualKWh) {
      // Estimate size based on annual kWh (e.g., assume 1300 kWh/kWp/year)
      annualProduction = parsedUsage.annualKWh;
      systemSizeKW = Math.round((annualProduction / 1300) * 10) / 10; // Round to 1 decimal
  } else if (parsedUsage.monthlyBill) {
      // Estimate annual kWh based on monthly bill and avg rate
      annualProduction = Math.round((parsedUsage.monthlyBill / AVG_ELECTRICITY_RATE) * 12);
      systemSizeKW = Math.round((annualProduction / 1300) * 10) / 10; // Round to 1 decimal
  }

  // Allow user message to override estimate
  const userSpecifiedSize = extractSystemSize(message);
  if (userSpecifiedSize) {
      systemSizeKW = userSpecifiedSize;
      // Re-estimate production if size is specified
      annualProduction = Math.round(systemSizeKW * 1300);
  }
  
  // Use assessment estimates if they exist (from a potentially smarter assessment agent later)
  if (assessment?.estimatedSystemSize) {
    systemSizeKW = assessment.estimatedSystemSize;
  }
  if (assessment?.estimatedProduction) {
    annualProduction = assessment.estimatedProduction;
  }
  
  // Calculate system details
  const systemCost = calculateSystemCost(systemSizeKW);
  const monthlySavings = calculateMonthlySavings(annualProduction);
  const annualSavings = monthlySavings * 12;
  
  // Verify calculations
  const verification = verifyCalculations(systemSizeKW, annualProduction, systemCost, monthlySavings);
  
  // Use corrected values if needed
  const finalSystemSize = verification.correctedValues.systemSizeKW || systemSizeKW;
  const finalAnnualProduction = verification.correctedValues.annualProduction || annualProduction;
  const finalSystemCost = verification.correctedValues.systemCost || systemCost;
  const finalMonthlySavings = verification.correctedValues.monthlySavings || monthlySavings;
  const finalAnnualSavings = finalMonthlySavings * 12;
  
  // Generate financing options
  const financingOptions = generateFinancingOptions(finalSystemCost);
  
  // Calculate installation time
  const installationTime = finalSystemSize <= 5 ? "1-2 days" : 
                         finalSystemSize <= 10 ? "2-3 days" : "3-5 days";
  
  // Create the offer object - Ensure it has an id for Cosmos DB
  const offerId = uuidv4();
  const offer: Offer = {
    id: offerId, // Use uuid for the primary key / partition key
    timestamp: new Date().toISOString(),
    userEmail: userEmail || assessment?.userEmail || 'anonymous',
    solarPanelCount: Math.round(finalSystemSize * PANELS_PER_KW),
    estimatedCost: finalSystemCost,
    estimatedSavings: finalAnnualSavings,
    estimatedInstallationTime: installationTime,
    systemSize: finalSystemSize,
    annualProduction: finalAnnualProduction,
    financingOptions,
    roofType: assessment?.roofType,
    panelType: 'Monocrystalline', // Default panel type
    assessmentId: assessment?.id 
  };
  
  return offer;
};

// Check if query suggests a handoff to another agent is needed
const checkForHandoff = (query: string): { needsHandoff: boolean, nextAgent?: string, reason?: string } => {
  const lowerQuery = query.toLowerCase();
  
  // Check for assessment-related queries
  if (
    lowerQuery.includes('assessment') ||
    lowerQuery.includes('my roof') ||
    lowerQuery.includes('my property') ||
    lowerQuery.includes('suitable')
  ) {
    return { 
      needsHandoff: true, 
      nextAgent: 'solarAssessment',
      reason: 'Query suggests customer wants property assessment'
    };
  }
  
  // Check for scheduling/appointment-related queries
  if (
    lowerQuery.includes('schedule') || 
    lowerQuery.includes('appointment') || 
    lowerQuery.includes('meet') ||
    lowerQuery.includes('visit') ||
    lowerQuery.includes('book a')
  ) {
    return { 
      needsHandoff: true, 
      nextAgent: 'crm',
      reason: 'Query suggests customer wants to schedule an appointment'
    };
  }
  
  return { needsHandoff: false };
};

export const handleProposal = async (
  message: string,
  conversationId: string,
  userEmail?: string,
  conversationHistory: ConversationTurn[] = []
): Promise<AgentResponse> => {

  // --- Remove Stub Logic / Placeholder --- 
  
  // --- Activate Original Logic (Modified) ---
  
  // Check for handoff first (Keep or remove as needed)
  const handoffCheck = checkForHandoff(message);
  if (handoffCheck.needsHandoff && handoffCheck.nextAgent) {
    return {
      text: `I understand you're interested in ${handoffCheck.reason}. Let me connect you with the right agent.`,
      type: 'handoff',
      nextAgent: handoffCheck.nextAgent as any, // TODO: Use AgentType
      confidence: 0.9
    };
  }

  // 1. Fetch assessment using conversationId
  const assessment = await findConversationAssessment(conversationId);

  if (!assessment) {
      // Handle case where assessment is not found for the conversation
      return {
          text: "I couldn't find the previous assessment details for this conversation. Could you perhaps provide the property address and energy usage again?",
          type: 'text',
          confidence: 0.5,
          nextAgent: 'solarAssessment' // Go back to assessment
      };
  }

  // 2. Perform calculations (generate the offer object)
  const generatedOffer = await generateProposal(assessment, userEmail, message);

  // 4. Save proposal to proposalsContainer
  try {
      await proposalsContainer.items.create(generatedOffer);
      console.log(`Proposal ${generatedOffer.id} saved to Cosmos DB.`);
  } catch (error) {
      console.error("Error saving proposal to Cosmos DB:", error);
      // Decide how to handle this - maybe proceed without saving?
      // For now, return an error message
      return {
          text: "I was able to generate the proposal details, but encountered an error trying to save them. Please try again later.",
          type: 'text',
          confidence: 0.4
      };
  }
  
  // 3. Generate response text (LLM)
  // Using existing format function for now, could enhance with LLM later
  const responseText = formatProposalResponse(generatedOffer);

  // 5. Return response
  const response: AgentResponse = {
      text: responseText,
      type: 'offer', // Use 'offer' type for potential UI formatting
      confidence: 0.85, // High confidence as it's based on calculations
      nextAgent: 'crm', // Suggest CRM for next step after proposal
      data: generatedOffer // Include the offer data in the response
  };

  return response;
}; 