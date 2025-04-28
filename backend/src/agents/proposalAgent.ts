import { AgentResponse, ConversationTurn, Offer, PropertyAssessment, FinancingOption } from '../models/types';
import { proposalAgentPrompt } from './systemPrompts';
import { getAllAssessments } from './solarAssessmentAgent';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// In-memory database for offers
let offers: Offer[] = [];

// Export offers for the CRM dashboard
export const getAllOffers = (): Offer[] => {
  return offers;
};

// Constants for calculations
const COST_PER_WATT = 3.0; // $3.00 per watt installed
const PANEL_WATTAGE = 400; // 400W per panel
const FEDERAL_TAX_CREDIT = 0.30; // 30% federal tax credit
const PANELS_PER_KW = 1000 / PANEL_WATTAGE; // Number of panels per kW
const AVG_ELECTRICITY_RATE = 0.15; // $0.15 per kWh national average

// Find the most recent property assessment for this user
const findUserAssessment = (userEmail: string): PropertyAssessment | null => {
  const userAssessments = getAllAssessments().filter(a => a.userEmail === userEmail);
  
  if (userAssessments.length === 0) {
    return null;
  }
  
  // Return the most recent assessment
  return userAssessments.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )[0];
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
  return Math.round(baseCost); // Round to nearest dollar
};

// Calculate monthly savings based on production
const calculateMonthlySavings = (annualProduction: number): number => {
  const annualSavings = annualProduction * AVG_ELECTRICITY_RATE;
  return Math.round(annualSavings / 12); // Monthly savings
};

// Generate financing options based on system cost
const generateFinancingOptions = (systemCost: number): FinancingOption[] => {
  const options: FinancingOption[] = [];
  
  // Cash option
  options.push({
    type: 'cash',
    totalCost: Math.round(systemCost * (1 - FEDERAL_TAX_CREDIT)) // Apply federal tax credit
  });
  
  // Loan option - 10 year
  const loanAmount10Year = systemCost;
  const interestRate10Year = 0.05; // 5% interest
  const termYears10 = 10;
  const monthlyPayment10 = calculateLoanPayment(loanAmount10Year, interestRate10Year, termYears10);
  
  options.push({
    type: 'loan',
    termYears: termYears10,
    interestRate: interestRate10Year,
    monthlyPayment: monthlyPayment10,
    downPayment: 0,
    totalCost: Math.round(monthlyPayment10 * termYears10 * 12 * (1 - FEDERAL_TAX_CREDIT)) // Apply tax credit
  });
  
  // Loan option - 20 year
  const loanAmount20Year = systemCost;
  const interestRate20Year = 0.055; // 5.5% interest
  const termYears20 = 20;
  const monthlyPayment20 = calculateLoanPayment(loanAmount20Year, interestRate20Year, termYears20);
  
  options.push({
    type: 'loan',
    termYears: termYears20,
    interestRate: interestRate20Year,
    monthlyPayment: monthlyPayment20,
    downPayment: 0,
    totalCost: Math.round(monthlyPayment20 * termYears20 * 12 * (1 - FEDERAL_TAX_CREDIT)) // Apply tax credit
  });
  
  // Lease option
  options.push({
    type: 'lease',
    termYears: 20,
    monthlyPayment: Math.round(systemCost / (20 * 12) * 0.8), // 80% of equivalent loan
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

// Format the proposal response
const formatProposalResponse = (offer: Offer): string => {
  // Format financing options
  const financingText = offer.financingOptions?.map(option => {
    if (option.type === 'cash') {
      return `**Cash Purchase:**\n- Total Cost (after tax credit): $${option.totalCost?.toLocaleString()}\n- Payback Period: ~${Math.round((option.totalCost || 0) / (offer.estimatedSavings / 12))} months`;
    } else if (option.type === 'loan') {
      return `**${option.termYears}-Year Solar Loan:**\n- Monthly Payment: $${option.monthlyPayment?.toLocaleString()}\n- Interest Rate: ${(option.interestRate || 0) * 100}%\n- Net Monthly Cost: $${Math.max(0, (option.monthlyPayment || 0) - (offer.estimatedSavings / 12)).toLocaleString()}`;
    } else {
      return `**Solar Lease (${option.termYears} years):**\n- Monthly Payment: $${option.monthlyPayment?.toLocaleString()}\n- No upfront cost\n- Estimated Net Savings: $${Math.max(0, (offer.estimatedSavings / 12) - (option.monthlyPayment || 0)).toLocaleString()} per month`;
    }
  }).join('\n\n');

  return `
## Solar Proposal

Based on your requirements, here's a personalized solar proposal:

### System Details
- System Size: ${offer.systemSize} kW (${Math.round(offer.systemSize || 0 * PANELS_PER_KW)} panels)
- Estimated Annual Production: ${offer.annualProduction?.toLocaleString()} kWh
- Estimated Annual Savings: $${offer.estimatedSavings?.toLocaleString()}
- Estimated Installation Time: ${offer.estimatedInstallationTime}

### Financing Options
${financingText}

Would you like to proceed with this proposal or would you prefer to adjust any of the parameters?
`.trim();
};

// Generate a proposal based on the assessment and user requirements
const generateProposal = async (
  assessment: PropertyAssessment | null, 
  userEmail: string, 
  message: string
): Promise<Offer> => {
  // Default values if no assessment is available
  let systemSizeKW = extractSystemSize(message) || 7; // Default 7kW if not specified
  let annualProduction = 10000; // Default 10,000 kWh per year
  
  // Use assessment data if available
  if (assessment) {
    systemSizeKW = assessment.estimatedSystemSize || systemSizeKW;
    annualProduction = assessment.estimatedProduction || annualProduction;
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
  
  // Create the offer
  const offer: Offer = {
    id: `offer-${Date.now()}`,
    timestamp: new Date().toISOString(),
    userEmail,
    solarPanelCount: Math.round(finalSystemSize * PANELS_PER_KW),
    estimatedCost: finalSystemCost,
    estimatedSavings: finalAnnualSavings,
    estimatedInstallationTime: installationTime,
    systemSize: finalSystemSize,
    annualProduction: finalAnnualProduction,
    financingOptions,
    roofType: assessment?.roofType,
    panelType: 'Monocrystalline' // Default panel type
  };
  
  // Save the offer
  offers.push(offer);
  
  return offer;
};

// Check if query suggests a handoff to another agent
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
  userEmail?: string,
  conversationHistory: ConversationTurn[] = []
): Promise<AgentResponse> => {
  // Check if the query suggests a handoff to another agent
  const handoffCheck = checkForHandoff(message);
  if (handoffCheck.needsHandoff && handoffCheck.nextAgent) {
    return {
      text: `I understand you're interested in ${handoffCheck.nextAgent === 'solarAssessment' ? 'assessing your property' : 'scheduling an appointment'}. Let me connect you with our ${handoffCheck.nextAgent === 'solarAssessment' ? 'Solar Assessment' : 'Customer Service'} team who can help you with that.`,
      type: 'handoff',
      nextAgent: handoffCheck.nextAgent as any,
      confidence: 0.9
    };
  }
  
  // If we don't have an email, we can't proceed
  if (!userEmail || userEmail === 'anonymous') {
    return {
      text: "I'd be happy to create a personalized solar proposal for you. Could you please provide your email address so I can save your proposal for future reference?",
      type: 'text',
      confidence: 0.9
    };
  }
  
  // Find assessment if available
  const assessment = findUserAssessment(userEmail);
  
  // If no assessment and message doesn't contain system size, suggest assessment
  const systemSizeKW = extractSystemSize(message);
  if (!assessment && !systemSizeKW) {
    return {
      text: "I'd like to create an accurate proposal for you, but I don't have enough information about your property yet. Would you like to go through a quick property assessment first, or would you prefer to specify the system size you're interested in (e.g., '5kW system' or '12 panels')?",
      type: 'text',
      nextAgent: 'solarAssessment',
      confidence: 0.8
    };
  }
  
  // Generate the proposal
  const offer = await generateProposal(assessment, userEmail, message);
  
  // Format the response
  const responseText = formatProposalResponse(offer);
  
  return {
    text: responseText,
    type: 'offer',
    data: offer,
    confidence: assessment ? 0.9 : 0.7 // Higher confidence if based on assessment
  };
}; 