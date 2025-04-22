import { AgentResponse, Offer } from '../models/types';

// Mock database for offers
let offers: Offer[] = [];

// Constants for calculations
const COST_PER_PANEL = 800; // $800 per panel
const INSTALLATION_BASE_COST = 2000; // $2000 base installation cost
const AVERAGE_MONTHLY_SAVINGS_PER_PANEL = 25; // $25 savings per panel per month

// Helper to extract number of panels from message
const extractPanelCount = (message: string): number => {
  // Try to find numbers in the message
  const numberMatches = message.match(/\d+/g);
  
  if (numberMatches && numberMatches.length > 0) {
    // If there are numbers, assume the first one is the panel count
    return parseInt(numberMatches[0], 10);
  }
  
  // Default to a standard 10-panel system if no number is specified
  return 10;
};

// Calculate installation time based on system size
const calculateInstallationTime = (panelCount: number): string => {
  if (panelCount <= 10) {
    return '1-2 days';
  } else if (panelCount <= 20) {
    return '2-3 days';
  } else {
    return '3-5 days';
  }
};

// Calculate system cost
const calculateSystemCost = (panelCount: number): number => {
  return INSTALLATION_BASE_COST + (panelCount * COST_PER_PANEL);
};

// Calculate estimated monthly savings
const calculateMonthlySavings = (panelCount: number): number => {
  return panelCount * AVERAGE_MONTHLY_SAVINGS_PER_PANEL;
};

export const handleOfferCreation = async (message: string, userEmail?: string): Promise<AgentResponse> => {
  // Extract the number of panels from the message
  const panelCount = extractPanelCount(message);
  
  // Calculate system details
  const totalCost = calculateSystemCost(panelCount);
  const monthlySavings = calculateMonthlySavings(panelCount);
  const installationTime = calculateInstallationTime(panelCount);
  const annualSavings = monthlySavings * 12;
  
  // Create an offer
  const offer: Offer = {
    id: `offer-${Date.now()}`,
    timestamp: new Date().toISOString(),
    userEmail: userEmail || 'anonymous',
    solarPanelCount: panelCount,
    estimatedCost: totalCost,
    estimatedSavings: annualSavings,
    estimatedInstallationTime: installationTime
  };
  
  // Save the offer in our mock database
  offers.push(offer);
  
  // Format the response
  const responseText = `
Based on your requirements, here's a quote for a ${panelCount} panel solar system:

- Total Cost: $${totalCost.toLocaleString()}
- Estimated Monthly Savings: $${monthlySavings.toLocaleString()}
- Estimated Annual Savings: $${annualSavings.toLocaleString()}
- Estimated Installation Time: ${installationTime}
- System Size: ${panelCount} panels

Would you like to schedule a consultation to discuss this quote further?
`.trim();

  return {
    text: responseText,
    type: 'offer',
    data: offer
  };
};

// Export the offers for the CRM dashboard
export const getAllOffers = (): Offer[] => {
  return offers;
}; 