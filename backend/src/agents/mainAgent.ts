// =====================================================
// DEPRECATED: This file is deprecated and will be removed. 
// Please use orchestrationAgent.ts instead.
// Only kept for backward compatibility with crmRoutes.ts.
// =====================================================

import { handleInfoQuery } from './infoAgent';
import { handleOfferCreation } from './offerAgent';
import { handleAppointmentBooking } from './intakeAgent';
import { CRMEntry, AgentType } from '../models/types';

// Mock CRM database (in-memory for this prototype)
let crmDatabase: CRMEntry[] = [
  // Add some sample entries so dashboard shows data
  {
    id: '1',
    timestamp: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
    query: "How much do solar panels cost?",
    response: "The cost of solar panels depends on various factors including size, quality, and installation. Typically, for a residential installation, you can expect to pay between €5,000 and €15,000 for a complete system.",
    agentType: "info",
    userEmail: "sample@example.com",
    data: {},
    conversationId: "conv-sample1"
  },
  {
    id: '2',
    timestamp: new Date(new Date().setDate(new Date().getDate() - 2)).toISOString(),
    query: "I want to book an appointment for a consultation",
    response: "I'd be happy to help you schedule a consultation. What date and time works best for you?",
    agentType: "intake",
    userEmail: "customer@example.com",
    data: {},
    conversationId: "conv-sample2"
  },
  {
    id: '3',
    timestamp: new Date().toISOString(),
    query: "Can you give me a quote for solar installation?",
    response: "I'd be happy to provide a quote. To give you an accurate estimate, I'll need some information about your home and energy usage.",
    agentType: "offer",
    userEmail: "newcustomer@example.com",
    data: {},
    conversationId: "conv-sample3"
  }
];

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
  
  // Check if this is clearly an information-seeking query
  if (
    lowerMessage.includes('how') || 
    lowerMessage.includes('what') || 
    lowerMessage.includes('why') || 
    lowerMessage.includes('when') || 
    lowerMessage.includes('where') || 
    lowerMessage.includes('who') ||
    lowerMessage.includes('which') ||
    lowerMessage.includes('can you tell me') ||
    lowerMessage.includes('i want to know')
  ) {
    return 'info';
  }
  
  // Check if this is an offer/quote request with stronger indicators
  if (
    (lowerMessage.includes('quote') || 
     lowerMessage.includes('price') || 
     lowerMessage.includes('cost') || 
     lowerMessage.includes('offer') ||
     (lowerMessage.includes('how much') && 
      (lowerMessage.includes('solar panel') || lowerMessage.includes('install')))) ||
    ((lowerMessage.includes('solar panel') || lowerMessage.includes('install')) &&
     (lowerMessage.includes('my') || lowerMessage.includes('for me') || lowerMessage.includes('for my')))
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
    data: response.data || {},
    conversationId: `conv-${Date.now()}`
  };
  
  crmDatabase.push(crmEntry);
  
  return response;
}; 