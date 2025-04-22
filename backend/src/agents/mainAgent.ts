import { handleInfoQuery } from './infoAgent';
import { handleOfferCreation } from './offerAgent';
import { handleAppointmentBooking } from './intakeAgent';
import { CRMEntry, AgentType } from '../models/types';

// Mock CRM database (in-memory for this prototype)
let crmDatabase: CRMEntry[] = [];

// Export the CRM database for access in the admin dashboard
export const getCRMEntries = (): CRMEntry[] => {
  return crmDatabase;
};

// Determine which agent should handle the query
const determineAgentType = (message: string): AgentType => {
  const lowerMessage = message.toLowerCase();
  
  // Check if this is an appointment request
  if (
    lowerMessage.includes('schedule') || 
    lowerMessage.includes('appointment') || 
    lowerMessage.includes('book') || 
    lowerMessage.includes('visit') ||
    lowerMessage.includes('meet')
  ) {
    return 'intake';
  }
  
  // Check if this is an offer/quote request
  if (
    lowerMessage.includes('quote') || 
    lowerMessage.includes('price') || 
    lowerMessage.includes('cost') || 
    lowerMessage.includes('offer') ||
    lowerMessage.includes('solar panel') ||
    lowerMessage.includes('install')
  ) {
    return 'offer';
  }
  
  // Default to info agent for general questions
  return 'info';
};

export const handleUserQuery = async (message: string, userEmail?: string) => {
  // Determine which agent should handle the request
  const agentType = determineAgentType(message);
  let response;
  
  // Route to the appropriate agent
  switch (agentType) {
    case 'info':
      response = await handleInfoQuery(message);
      break;
    case 'offer':
      response = await handleOfferCreation(message, userEmail);
      break;
    case 'intake':
      response = await handleAppointmentBooking(message, userEmail);
      break;
    default:
      response = {
        text: "I'm not sure how to help with that. Could you please rephrase your question?",
        type: 'text'
      };
  }
  
  // Log the interaction in our CRM
  const crmEntry: CRMEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    query: message,
    response: response.text,
    agentType,
    userEmail: userEmail || 'anonymous',
    data: response.data || {}
  };
  
  crmDatabase.push(crmEntry);
  
  return response;
}; 