import { AgentResponse, AgentType, CRMEntry, User, ConversationTurn } from '../models/types';
import { orchestrationAgentPrompt } from './systemPrompts';
import { handleCustomerSupport } from './customerSupportAgent';
import { handleSolarAssessment } from './solarAssessmentAgent';
import { handleProposal } from './proposalAgent';
import { handleCRM } from './crmAgent';
import { OpenAI } from '@azure/openai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Azure OpenAI client
const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY || '',
  endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-04-01-preview'
});

// Mock in-memory database for users and conversations
// This would be replaced with Cosmos DB in production
let users: Record<string, User> = {};
let conversations: Record<string, ConversationTurn[]> = {};
let crmDatabase: CRMEntry[] = [];

// Export the CRM database for access in the admin dashboard
export const getCRMEntries = (): CRMEntry[] => {
  return crmDatabase;
};

// Helper function to get or create a user
const getOrCreateUser = (email: string): User => {
  if (!users[email]) {
    users[email] = {
      email,
      leadStatus: 'new',
      leadScore: 0,
      notes: [],
      conversationHistory: []
    };
  }
  return users[email];
};

// Helper function to determine the agent type using Azure OpenAI
const determineAgentType = async (message: string, conversationHistory: ConversationTurn[]): Promise<AgentType> => {
  try {
    // Format conversation history for context
    const historyContext = conversationHistory
      .slice(-5) // Get last 5 turns for context
      .map(turn => `User: ${turn.userQuery}\nAssistant (${turn.agentType}): ${turn.agentResponse}`)
      .join('\n\n');
    
    // Prepare the system message
    const systemMessage = orchestrationAgentPrompt;
    
    // Call Azure OpenAI to determine agent type
    const response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: `Based on the following conversation history and the current user message, determine which specialized agent should handle this query. Respond with just the agent type: orchestration, customerSupport, solarAssessment, proposal, or crm.\n\nHistory:\n${historyContext}\n\nCurrent message: ${message}` }
      ],
      temperature: 0.3,
      max_tokens: 50
    });
    
    // Extract the agent type from the response
    const agentTypeResponse = response.choices[0]?.message.content?.trim().toLowerCase() || '';
    
    // Map the response to an agent type
    if (agentTypeResponse.includes('customersupport')) return 'customerSupport';
    if (agentTypeResponse.includes('solarassessment')) return 'solarAssessment';
    if (agentTypeResponse.includes('proposal')) return 'proposal';
    if (agentTypeResponse.includes('crm')) return 'crm';
    
    // Default to customer support if no clear match
    return 'customerSupport';
  } catch (error) {
    console.error('Error determining agent type:', error);
    // Fall back to simple keyword matching if API call fails
    return fallbackAgentTypeDetermination(message);
  }
};

// Fallback method using keywords if Azure OpenAI is unavailable
const fallbackAgentTypeDetermination = (message: string): AgentType => {
  const lowerMessage = message.toLowerCase();
  
  // Check if this is an appointment or CRM-related request
  if (
    lowerMessage.includes('schedule') || 
    lowerMessage.includes('appointment') || 
    lowerMessage.includes('book') || 
    lowerMessage.includes('visit') ||
    lowerMessage.includes('meet') ||
    lowerMessage.includes('follow up') ||
    lowerMessage.includes('calendar')
  ) {
    return 'crm';
  }
  
  // Check if this is a proposal or quote request
  if (
    lowerMessage.includes('quote') || 
    lowerMessage.includes('price') || 
    lowerMessage.includes('cost') || 
    lowerMessage.includes('offer') ||
    lowerMessage.includes('financing') ||
    lowerMessage.includes('payment') ||
    lowerMessage.includes('loan') ||
    lowerMessage.includes('lease')
  ) {
    return 'proposal';
  }
  
  // Check if this is a property or system assessment query
  if (
    lowerMessage.includes('property') ||
    lowerMessage.includes('roof') ||
    lowerMessage.includes('house') ||
    lowerMessage.includes('home') ||
    lowerMessage.includes('shade') ||
    lowerMessage.includes('bill') ||
    lowerMessage.includes('usage') ||
    lowerMessage.includes('consumption') ||
    lowerMessage.includes('kwh') ||
    lowerMessage.includes('electricity')
  ) {
    return 'solarAssessment';
  }
  
  // Default to customer support for general questions
  return 'customerSupport';
};

// Store conversation history
const storeConversation = (
  userEmail: string, 
  userQuery: string, 
  agentResponse: AgentResponse, 
  agentType: AgentType,
  conversationId: string
): void => {
  // Create conversation ID if not exists
  if (!conversations[conversationId]) {
    conversations[conversationId] = [];
  }
  
  // Add to conversation history
  const turn: ConversationTurn = {
    timestamp: new Date().toISOString(),
    userQuery,
    agentResponse: agentResponse.text,
    agentType
  };
  
  conversations[conversationId].push(turn);
  
  // Also store in user history if we have an email
  if (userEmail && userEmail !== 'anonymous') {
    const user = getOrCreateUser(userEmail);
    if (!user.conversationHistory) {
      user.conversationHistory = [];
    }
    user.conversationHistory.push(turn);
  }
  
  // Log the interaction in our CRM
  const crmEntry: CRMEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    query: userQuery,
    response: agentResponse.text,
    agentType,
    userEmail: userEmail || 'anonymous',
    data: agentResponse.data || {},
    conversationId
  };
  
  crmDatabase.push(crmEntry);
};

// Get conversation history
const getConversationHistory = (conversationId: string): ConversationTurn[] => {
  return conversations[conversationId] || [];
};

export const handleUserQuery = async (
  message: string, 
  userEmail?: string, 
  conversationId?: string
): Promise<AgentResponse> => {
  // Create a conversation ID if not provided
  const currentConversationId = conversationId || `conv-${Date.now()}`;
  
  // Get conversation history
  const history = getConversationHistory(currentConversationId);
  
  // Create or update user record
  if (userEmail && userEmail !== 'anonymous') {
    getOrCreateUser(userEmail);
  }
  
  // Determine which agent should handle the request
  const agentType = await determineAgentType(message, history);
  
  let response: AgentResponse;
  
  // Route to the appropriate agent
  switch (agentType) {
    case 'customerSupport':
      response = await handleCustomerSupport(message, userEmail, history);
      break;
    case 'solarAssessment':
      response = await handleSolarAssessment(message, userEmail, history);
      break;
    case 'proposal':
      response = await handleProposal(message, userEmail, history);
      break;
    case 'crm':
      response = await handleCRM(message, userEmail, history);
      break;
    default:
      response = {
        text: "I'm not sure how to help with that. Could you please rephrase your question?",
        type: 'text',
        confidence: 0.3
      };
  }
  
  // Store conversation history
  storeConversation(userEmail || 'anonymous', message, response, agentType, currentConversationId);
  
  // If another agent should handle the next turn, include that in the response
  if (response.nextAgent && response.nextAgent !== agentType) {
    response.type = 'handoff';
  }
  
  return { ...response, data: { ...response.data, conversationId: currentConversationId } };
}; 