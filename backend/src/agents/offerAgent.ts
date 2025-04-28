import { AgentResponse, Offer } from '../models/types';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// Azure OpenAI configuration
const azureOpenAIKey = process.env.AZURE_OPENAI_API_KEY || '';
const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureOpenAIDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '';
const azureOpenAIApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2023-05-15';

// Check if Azure OpenAI is properly configured
const isAzureOpenAIConfigured = !!(azureOpenAIKey && azureOpenAIEndpoint && azureOpenAIDeploymentName);

// In-memory database for offers
let offers: Offer[] = [];

// Export offers for the CRM dashboard
export const getAllOffers = (): Offer[] => {
  return offers;
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

// Create a solar offer with pricing
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
    
    // Create offer object
    const offer: Offer = {
      id: `offer-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userEmail: userEmail || 'anonymous',
      solarPanelCount: panelCount,
      estimatedCost: systemCost,
      estimatedSavings: annualSavings,
      estimatedInstallationTime: '2-3 days', 
      systemSize: systemSizeKW,
      annualProduction: annualProduction
    };
    
    // Save to in-memory database
    offers.push(offer);
    
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
    const systemPrompt = `You are a professional solar sales consultant. Create a personalized solar proposal based on the following offer data. Be friendly, professional, and persuasive without being pushy. Emphasize the benefits like saving money, environmental impact, and energy independence. Format the response nicely with sections and bullet points.`;
    
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
- **System Size**: ${offerData.systemSizeKW} kW (${offerData.panelCount} panels)
- **Estimated Annual Production**: ${offerData.annualProduction.toLocaleString()} kWh
- **Estimated Installation Time**: 2-3 days

### Financial Benefits
- **System Cost**: $${offerData.systemCost.toLocaleString()}
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
    // Create the offer even if the user is anonymous
    const offerData = await createOffer(message, userEmail);
    
    // If email is not provided, but we need a quote-specific response
    if (!userEmail || userEmail === 'anonymous') {
      // Generate response with a gentle reminder about providing email
      const responseText = await generateOfferResponse(offerData, message);
      
      return {
        text: responseText + "\n\nNote: To save this quote for future reference, you can provide your email address in your next message.",
        type: 'offer',
        data: offerData
      };
    }
    
    // Generate response
    const responseText = await generateOfferResponse(offerData, message);
    
    return {
      text: responseText,
      type: 'offer',
      data: offerData
    };
  } catch (error) {
    console.error('Error creating offer:', error);
    
    return {
      text: "I apologize, but I encountered an issue while creating your solar quote. Would you like to try again or speak with one of our solar consultants directly?",
      type: 'text'
    };
  }
}; 