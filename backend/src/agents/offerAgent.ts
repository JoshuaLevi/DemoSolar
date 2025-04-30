import { AgentResponse, Offer } from '../models/types';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
// Import Cosmos DB client for proposals
import { proposalsContainer } from '../utils/cosmosClient';

dotenv.config();

// Azure OpenAI configuration
const azureOpenAIKey = process.env.AZURE_OPENAI_API_KEY || '';
const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureOpenAIDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '';
const azureOpenAIApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2023-05-15';

// Check if Azure OpenAI is properly configured
const isAzureOpenAIConfigured = !!(azureOpenAIKey && azureOpenAIEndpoint && azureOpenAIDeploymentName);

// Export offers for the CRM dashboard (now queries Cosmos DB)
export const getAllOffers = async (limit: number = 100): Promise<Offer[]> => {
  try {
    const querySpec = {
      query: `SELECT * FROM c ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit`,
      parameters: [
        { name: '@limit', value: limit }
      ]
    };
    const { resources } = await proposalsContainer.items.query<Offer>(querySpec).fetchAll();
    return resources;
  } catch (error) {
    console.error('Error fetching offers from Cosmos DB:', error);
    return [];
  }
};

// Constants for solar calculations
const COST_PER_WATT = 3.0; // $3.00 per watt installed
const PANEL_WATTAGE = 400; // 400W per panel
const FEDERAL_TAX_CREDIT = 0.30; // 30% federal tax credit
const AVG_ELECTRICITY_RATE = 0.15; // $0.15 per kWh national average

// Function to make Azure OpenAI API calls
async function callAzureOpenAI(messages: Array<{role: string, content: string}>, options = { temperature: 0.7, maxTokens: 400 }) {
  try {
    if (!isAzureOpenAIConfigured) {
      throw new Error('Azure OpenAI not configured');
    }

    const response = await fetch(
      `${azureOpenAIEndpoint}/openai/deployments/${azureOpenAIDeploymentName}/chat/completions?api-version=${azureOpenAIApiVersion}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': azureOpenAIKey
        },
        body: JSON.stringify({
          messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error calling Azure OpenAI:', error);
    return null;
  }
}

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
  
  // Look for roof size mentions
  const roofSizeMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:square meter|square meters|m2|sq\.? ?m)/i);
  if (roofSizeMatch && roofSizeMatch[1]) {
    const roofSize = parseFloat(roofSizeMatch[1]);
    // Assume average of 200W per square meter (accounts for panel efficiency and spacing)
    return roofSize * 0.2; // Convert to kW
  }
  
  return null;
};

// Create a solar offer with pricing and save to Cosmos DB
const createOffer = async (message: string, userEmail?: string) => {
  try {
    // Extract system size or use default
    const systemSizeKW = extractSystemSize(message) || 6; // Default 6kW if not specified
    
    const panelCount = Math.ceil(systemSizeKW * 1000 / PANEL_WATTAGE);
    const systemCost = systemSizeKW * 1000 * COST_PER_WATT;
    const federalTaxCredit = systemCost * FEDERAL_TAX_CREDIT;
    const netCost = systemCost - federalTaxCredit;
    
    // Estimate annual production (1,400 kWh/kW is US average)
    const annualProduction = systemSizeKW * 1400;
    const annualSavings = annualProduction * AVG_ELECTRICITY_RATE;
    const monthlySavings = annualSavings / 12;
    
    // Calculate payback period in years
    const paybackPeriod = netCost / annualSavings;
    
    // Calculate monthly loan payment (25-year loan at 5% interest)
    const interestRate = 0.05 / 12; // Monthly interest rate
    const numberOfPayments = 25 * 12; // 25 years in months
    const monthlyLoanPayment = (systemCost * interestRate) / (1 - Math.pow(1 + interestRate, -numberOfPayments));
    
    // Create offer object with a proper ID for Cosmos DB
    const offer: Offer = {
      id: `offer-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`, // More unique ID
      timestamp: new Date().toISOString(),
      userEmail: userEmail || 'anonymous',
      solarPanelCount: panelCount,
      estimatedCost: systemCost,
      estimatedSavings: annualSavings,
      estimatedInstallationTime: '2-3 days', 
      systemSize: systemSizeKW,
      annualProduction: annualProduction,
      // Add financing options and other details if calculated
    };
    
    // --- Save to Cosmos DB ---
    try {
        // Partition key likely based on userEmail or potentially timestamp/ID
        // Assuming userEmail is a good partition key candidate if users view their proposals.
        // If anonymous, might use a default partition or partition by ID.
        // Let's use userEmail as partition key for this example.
        const { resource: createdOffer } = await proposalsContainer.items.create(offer);
        console.log(`Saved offer ${createdOffer?.id} to Cosmos DB for user ${offer.userEmail}.`);
    } catch (dbError) {
        console.error(`Error saving offer ${offer.id} to Cosmos DB:`, dbError);
        // Decide if this should prevent returning the offer data to the user.
        // For now, log the error but continue.
    }

    // Return the calculated data including the ID used in the database
    return {
      ...offer,
      federalTaxCredit,
      netCost,
      monthlySavings,
      paybackPeriod,
      monthlyLoanPayment,
      roofSize: message.includes('square meter') || message.includes('m2') ? 
        (extractSystemSize(message) || systemSizeKW) * 5 : null
    };
  } catch (error) {
    console.error('Error creating offer:', error);
    throw error;
  }
};

// Generate a customized offer response
const generateOfferResponse = async (offerData: any, originalMessage: string): Promise<string> => {
  if (isAzureOpenAIConfigured) {
    const systemPrompt = `You are a professional solar sales consultant for DemoSolar. Create a personalized solar proposal in **English** based on the following offer data. Be friendly, professional, and persuasive without being pushy. Emphasize the benefits like saving money, environmental impact, and energy independence. Format the response nicely with Markdown sections (using ## for main sections and ### for subsections) and bullet points. Ensure all monetary values are preceded by a dollar sign ($).`;
    
    const offerDataFormatted = JSON.stringify(offerData, null, 2);
    
    const responseText = await callAzureOpenAI(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Customer message: "${originalMessage}"\n\nOffer data: ${offerDataFormatted}\n\nCreate a personalized solar proposal response that presents this information in a compelling way. Include the key financial details and benefits.` }
      ],
      { temperature: 0.7, maxTokens: 600 }
    );
    
    if (responseText) {
      return responseText;
    }
  }
  
  // Fallback if Azure OpenAI is unavailable
  return `
## Your Custom Solar Proposal

Based on your requirements, here's a personalized solar solution:

### System Details
- **System Size**: ${offerData.systemSize} kW (${offerData.solarPanelCount} panels) // Updated field names
- **Estimated Annual Production**: ${offerData.annualProduction.toLocaleString()} kWh
- **Estimated Installation Time**: ${offerData.estimatedInstallationTime}

### Financial Benefits
- **System Cost**: $${offerData.estimatedCost.toLocaleString()}
- **Federal Tax Credit**: $${offerData.federalTaxCredit.toLocaleString()}
- **Net Cost After Incentives**: $${offerData.netCost.toLocaleString()}
- **Estimated Monthly Savings**: $${offerData.monthlySavings.toFixed(2)}
- **Payback Period**: ${offerData.paybackPeriod.toFixed(1)} years

### Financing Options
- **Cash Purchase**: $${offerData.netCost.toLocaleString()} after tax credit
- **Solar Loan**: $${offerData.monthlyLoanPayment.toFixed(2)}/month (25-year fixed)

Would you like to schedule a consultation to finalize your solar system design? Or do you have any questions about this proposal?
  `;
};

// Handle offer creation requests
export const handleOfferCreation = async (message: string, userEmail?: string): Promise<AgentResponse> => {
  try {
    // Create the offer and save to Cosmos DB
    const offerDataWithCalculations = await createOffer(message, userEmail);
    
    // Generate response text
    const responseText = await generateOfferResponse(offerDataWithCalculations, message);

    // Prepare the final response data (excluding extra calculation fields not in Offer type)
    const responseData: Offer = {
        id: offerDataWithCalculations.id,
        timestamp: offerDataWithCalculations.timestamp,
        userEmail: offerDataWithCalculations.userEmail,
        solarPanelCount: offerDataWithCalculations.solarPanelCount,
        estimatedCost: offerDataWithCalculations.estimatedCost,
        estimatedSavings: offerDataWithCalculations.estimatedSavings,
        estimatedInstallationTime: offerDataWithCalculations.estimatedInstallationTime,
        systemSize: offerDataWithCalculations.systemSize,
        annualProduction: offerDataWithCalculations.annualProduction,
        // Copy other optional fields from Offer type if they exist in offerDataWithCalculations
        roofType: offerDataWithCalculations.roofType,
        panelType: offerDataWithCalculations.panelType,
        financingOptions: offerDataWithCalculations.financingOptions,
        assessmentId: offerDataWithCalculations.assessmentId,
    };
    
    // Add reminder note if user is anonymous
    const finalResponseText = (!userEmail || userEmail === 'anonymous')
      ? responseText + "\n\nNote: To save this quote for future reference, you can provide your email address in your next message."
      : responseText;

    return {
      text: finalResponseText,
      type: 'offer',
      data: responseData, // Return only the Offer data structure
      confidence: userEmail && userEmail !== 'anonymous' ? 0.95 : 0.9, // Adjust confidence based on email
      reasoning: "Generated a personalized solar offer based on extracted or default system size and saved to database."
    };
  } catch (error) {
    console.error('Error handling offer creation:', error);
    
    return {
      text: "I apologize, but I encountered an issue while creating your solar quote. Would you like to try again or speak with one of our solar consultants directly?",
      type: 'text',
      confidence: 0.4,
      reasoning: "An internal error occurred while trying to generate the solar offer."
    };
  }
}; 