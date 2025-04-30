import { AgentResponse, AgentType, CRMEntry, User, ConversationTurn } from '../models/types';
import { orchestrationAgentPrompt } from './systemPrompts';
import { handleCustomerSupport } from './customerSupportAgent';
import { handleSolarAssessment } from './solarAssessmentAgent';
import { handleProposal } from './proposalAgent';
import { handleCRM } from './crmAgent';
import { AzureOpenAI } from "openai";
import "@azure/openai/types";
import dotenv from 'dotenv';

dotenv.config();

// --- Correct AzureOpenAI Client Initialization ---
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-04-01-preview'; // Use a recent API version

// Endpoint and Key should be loaded from .env by dotenv
if (!process.env.AZURE_OPENAI_ENDPOINT) {
    throw new Error("Orchestrator: AZURE_OPENAI_ENDPOINT is not set in environment variables.");
}
if (!process.env.AZURE_OPENAI_API_KEY) {
    throw new Error("Orchestrator: AZURE_OPENAI_API_KEY is not set in environment variables.");
}
if (!deployment) {
    throw new Error("Orchestrator: AZURE_OPENAI_DEPLOYMENT is not set in environment variables.");
}

// Initialize the client using the correct class and options
const client = new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: apiVersion,
    // deployment is needed for the call, not necessarily here
});

console.log(`Orchestrator initialized AzureOpenAI client for deployment '${deployment}' and apiVersion '${apiVersion}'`);

// Mock in-memory database for users and conversations
// This would be replaced with Cosmos DB in production
let users: Record<string, User> = {};
let conversations: Record<string, ConversationTurn[]> = {};
let crmDatabase: CRMEntry[] = [];
// Add state for tracking expected next agent
let conversationState: Record<string, { expectedNextAgent?: AgentType }> = {};

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
  // This function *expects* a string message for analysis
  // If an object is passed, we might need specific logic or default behavior
  if (typeof message !== 'string') {
    console.warn("determineAgentType received non-string message, defaulting to customerSupport");
    // Consider extracting text or using a default logic if objects can be passed here
    return 'customerSupport'; 
  }

  try {
    // Format conversation history for context
    const historyContext = conversationHistory
      .slice(-5) // Get last 5 turns for context
      .map(turn => `User: ${turn.userQuery}\nAssistant (${turn.agentType}): ${turn.agentResponse}`)
      .join('\n\n');
    
    // Prepare the system message
    const systemMessage = orchestrationAgentPrompt;
    
    // Call Azure OpenAI to determine agent type
    // Ensure client is initialized
    if (!client) throw new Error("Orchestrator: OpenAI client is not initialized.");
    const response = await client.chat.completions.create({
      model: deployment, // Use the deployment name from env
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: `Based on the following conversation history and the current user message, determine which specialized agent should handle this query. Respond with just the agent type: orchestration, customerSupport, solarAssessment, proposal, or crm.\n\nHistory:\n${historyContext}\n\nCurrent message: ${message}` }
      ] as any, // Using 'as any' to bypass strict type checks for now, align with ChatCompletionMessageParam later if needed
      temperature: 0.3,
      max_tokens: 50 // Use snake_case
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
  // This also expects a string
  if (typeof message !== 'string') {
     console.warn("fallbackAgentTypeDetermination received non-string message, defaulting to customerSupport");
     return 'customerSupport';
  }
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
  
  // Add to conversation history, including conversationId
  const turn: ConversationTurn = {
    timestamp: new Date().toISOString(),
    userQuery,
    agentResponse: agentResponse.text,
    agentType,
    conversationId: conversationId
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

  // Store the suggested next agent for the conversation state
  if (agentResponse.nextAgent) {
      if (!conversationState[conversationId]) {
          conversationState[conversationId] = {};
      }
      conversationState[conversationId].expectedNextAgent = agentResponse.nextAgent;
  } else {
    // Clear expected agent if none is suggested
    if (conversationState[conversationId]) {
        delete conversationState[conversationId].expectedNextAgent;
    }
  }
};

// Get conversation history
const getConversationHistory = (conversationId: string): ConversationTurn[] => {
  return conversations[conversationId] || [];
};

export const handleUserQuery = async (
  messageInput: string | object, // Updated parameter type
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
  
  // --- Determine Agent --- 
  let agentType: AgentType;
  const state = conversationState[currentConversationId];

  // Extract text message for agent determination, handle object messages later
  const textMessageForDetermination = typeof messageInput === 'string' ? messageInput : null;

  if (state?.expectedNextAgent) {
      agentType = state.expectedNextAgent;
      console.log(`Orchestrator: Using expected next agent '${agentType}' for conversation ${currentConversationId}`);
      delete state.expectedNextAgent; 
  } else if (textMessageForDetermination) {
      // Determine agent based on text message and history
      agentType = await determineAgentType(textMessageForDetermination, history);
      console.log(`Orchestrator: Determined agent type '${agentType}' for conversation ${currentConversationId}`);
  } else if (typeof messageInput === 'object' && (messageInput as any).type === 'crm_update') {
      // If it's a CRM update object, route directly to CRM agent
      agentType = 'crm';
      console.log(`Orchestrator: Routing CRM update object directly to CRM agent for conversation ${currentConversationId}`);
  } else {
      // Fallback if message is neither string nor known object type
      console.warn(`Orchestrator: Could not determine agent type for non-string input. Defaulting to customerSupport.`);
      agentType = 'customerSupport';
  }
  // --- End Determine Agent --- 

  let response: AgentResponse;
  
  // Route to the appropriate agent, passing the original messageInput
  switch (agentType) {
    case 'customerSupport':
      // handleCustomerSupport likely expects a string, handle potential object input
      const supportMessage = typeof messageInput === 'string' ? messageInput : JSON.stringify(messageInput);
      response = await handleCustomerSupport(supportMessage, userEmail, history);
      break;
    case 'solarAssessment':
      const assessmentUserId = userEmail || `anon_${currentConversationId}`;
      // handleSolarAssessment likely expects a string
      const assessmentMessage = typeof messageInput === 'string' ? messageInput : JSON.stringify(messageInput);
      response = await handleSolarAssessment(assessmentMessage, currentConversationId, assessmentUserId);
      break;
    case 'proposal':
      const proposalUserId = userEmail || `anon_${currentConversationId}`;
      // handleProposal likely expects a string
      const proposalMessage = typeof messageInput === 'string' ? messageInput : JSON.stringify(messageInput);
      response = await handleProposal(proposalMessage, currentConversationId, proposalUserId, history);
      break;
    case 'crm':
      const crmUserId = userEmail || `anon_${currentConversationId}`;
      // handleCRM is designed to accept string | object
      response = await handleCRM(currentConversationId, crmUserId, messageInput, history);
      break;
    default:
      response = {
        text: "I'm not sure how to help with that. Could you please rephrase your question?",
        type: 'text',
        confidence: 0.3
      };
  }
  
  // Store conversation history - use original text message if possible for query field
  const queryToStore = typeof messageInput === 'string' ? messageInput : `[CRM Update Action]`; // Placeholder for object actions
  storeConversation(userEmail || 'anonymous', queryToStore, response, agentType, currentConversationId);
  
  // If another agent should handle the next turn, include that in the response
  if (response.nextAgent && response.nextAgent !== agentType) {
    response.type = 'handoff';
  }
  
  return { ...response, data: { ...response.data, conversationId: currentConversationId } };
}; 