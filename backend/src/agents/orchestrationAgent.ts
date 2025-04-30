import { AgentResponse, AgentType, CRMEntry, User, ConversationTurn } from '../models/types';
import { orchestrationAgentPrompt } from './systemPrompts';
import { handleCustomerSupport } from './customerSupportAgent';
import { handleSolarAssessment } from './solarAssessmentAgent';
import { handleProposal } from './proposalAgent';
import { handleCRM } from './crmAgent';
import { AzureOpenAI } from "openai";
import "@azure/openai/types";
import dotenv from 'dotenv';
import { enhanceWithResponsibleAI, calculateConfidence, generateReasoning, addFeedbackOptions } from '../utils/responsibleAI';
// Import Cosmos DB clients
import { container as conversationsContainer, usersContainer } from '../utils/cosmosClient';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

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

// --- Remove In-Memory Storage ---
// let users: Record<string, User> = {};
// let conversations: Record<string, ConversationTurn[]> = {};
// let crmDatabase: CRMEntry[] = [];

// Add state for tracking expected next agent (this can remain in-memory for now)
let conversationState: Record<string, { expectedNextAgent?: AgentType }> = {};

// Export function to get CRM entries (now queries Cosmos DB)
export const getCRMEntries = async (limit: number = 100): Promise<ConversationTurn[]> => {
  try {
    // Query conversation turns, could be refined with specific criteria
    const querySpec = {
      query: `SELECT * FROM c ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit`,
      parameters: [
        { name: '@limit', value: limit }
      ]
    };
    const { resources } = await conversationsContainer.items.query<ConversationTurn>(querySpec).fetchAll();
    return resources;
  } catch (error) {
    console.error('Error fetching CRM entries from Cosmos DB:', error);
    return [];
  }
};

// Helper function to get or create a user in Cosmos DB
// Note: Using email as the ID for the user document. Ensure emails are unique.
const getOrCreateUser = async (email: string): Promise<User> => {
  try {
    // Attempt to read the user
    const { resource: existingUser } = await usersContainer.item(email, email).read<User>();
    if (existingUser) {
      return existingUser;
    }
  } catch (error: any) {
    // If not found (404), create a new user
    if (error.code !== 404) {
      console.error(`Error reading user ${email}:`, error);
      throw error; // Re-throw unexpected errors
    }
  }

  // User not found, create a new one
  const newUser: User = {
    // Use email as the ID, partition key can also be email
    id: email, 
    email,
    leadStatus: 'new',
    leadScore: 0,
    notes: [],
    conversationHistory: [], // Initialize history (might store references or latest turns)
    lastContact: new Date().toISOString()
  };

  try {
    const { resource: createdUser } = await usersContainer.items.create<User>(newUser);
    console.log(`Created new user: ${email}`);
    return createdUser!; // Non-null assertion, create should return resource
  } catch (error) {
    console.error(`Error creating user ${email}:`, error);
    // Handle potential race conditions or other creation errors if necessary
    throw error;
  }
};

// Helper function to determine the agent type using Azure OpenAI
const determineAgentType = async (message: string, conversationHistory: ConversationTurn[]): Promise<{ agentType: AgentType; confidence: number; reasoning: string }> => {
  // This function *expects* a string message for analysis
  // If an object is passed, we might need specific logic or default behavior
  if (typeof message !== 'string') {
    console.warn("determineAgentType received non-string message, defaulting to customerSupport");
    // Consider extracting text or using a default logic if objects can be passed here
    return { 
      agentType: 'customerSupport',
      confidence: 0.4,
      reasoning: "Non-string message received, defaulting to general support"
    }; 
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
    
    // Map the response to an agent type and add reasoning
    let agentType: AgentType = 'customerSupport';
    let confidence = 0.8;
    let reasoning = "Determined by Azure OpenAI based on conversation context";
    
    if (agentTypeResponse.includes('customersupport')) {
      agentType = 'customerSupport';
      reasoning = "Azure OpenAI identified this as a general customer support query";
    } else if (agentTypeResponse.includes('solarassessment')) {
      agentType = 'solarAssessment';
      confidence = 0.85;
      reasoning = "Azure OpenAI recognized this as a property assessment request";
    } else if (agentTypeResponse.includes('proposal')) {
      agentType = 'proposal';
      confidence = 0.85;
      reasoning = "Azure OpenAI identified this as a pricing or quotation request";
    } else if (agentTypeResponse.includes('crm')) {
      agentType = 'crm';
      confidence = 0.9;
      reasoning = "Azure OpenAI recognized this as an appointment or booking request";
    }
    
    return { agentType, confidence, reasoning };
  } catch (error) {
    console.error('Error determining agent type:', error);
    // Fall back to simple keyword matching if API call fails
    return fallbackAgentTypeDetermination(message);
  }
};

// Fallback method using keywords if Azure OpenAI is unavailable
const fallbackAgentTypeDetermination = (message: string): { agentType: AgentType; confidence: number; reasoning: string } => {
  // This also expects a string
  if (typeof message !== 'string') {
     console.warn("fallbackAgentTypeDetermination received non-string message, defaulting to customerSupport");
     return { 
       agentType: 'customerSupport',
       confidence: 0.4,
       reasoning: "Non-string message received, defaulting to general support"
     };
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
    return {
      agentType: 'crm',
      confidence: 0.9,
      reasoning: "Query contains appointment-related keywords suggesting the user wants to schedule a consultation"
    };
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
    return {
      agentType: 'proposal',
      confidence: 0.85,
      reasoning: "Query mentions pricing or quotation terms, indicating the user wants information about costs or a formal proposal"
    };
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
    return {
      agentType: 'solarAssessment',
      confidence: 0.8,
      reasoning: "Query references property or installation details, suggesting the user needs a solar assessment"
    };
  }
  
  // Default to customer support for general questions
  return {
    agentType: 'customerSupport',
    confidence: 0.7,
    reasoning: "No specific keywords matched other agent types, so defaulting to general customer support"
  };
};

// Store conversation turn in Cosmos DB
const storeConversation = async (
  userEmail: string,
  userQuery: string,
  agentResponse: AgentResponse,
  agentType: AgentType,
  conversationId: string
): Promise<void> => {
  
  const turn: ConversationTurn = {
    // Generate a unique ID for the turn
    id: uuidv4(), 
    timestamp: new Date().toISOString(),
    userQuery,
    agentResponse: agentResponse.text, // Store only text for history clarity? Or full response?
    agentType,
    conversationId: conversationId, // Use conversationId as partition key
    userEmail: userEmail // Store email for reference
    // Potentially add agentResponse.data, confidence, reasoning here if needed for detailed logging
  };
  
  try {
      // Use conversationId as the partition key
      await conversationsContainer.items.create(turn);
      console.log(`Stored conversation turn ${turn.id} for conversation ${conversationId}`);

      // Optionally update the user document's lastContact or a summary
      if (userEmail && userEmail !== 'anonymous') {
         try {
             const { resource: user } = await usersContainer.item(userEmail, userEmail).read<User>();
             if (user) {
                 // Update last contact time and potentially add note/summary
                 user.lastContact = turn.timestamp;
                 // Maybe store only last N turn IDs instead of full history object in user doc?
                 // user.conversationHistory?.push(turn.id); 
                 await usersContainer.item(userEmail, userEmail).replace(user);
             }
         } catch (userUpdateError) {
             console.error(`Failed to update user ${userEmail} after storing turn:`, userUpdateError);
             // Non-critical error, proceed
         }
      }

  } catch (error) {
      console.error(`Error storing conversation turn for ${conversationId}:`, error);
      // Decide how to handle logging errors (e.g., retry, log to console only?)
  }


  // Store the suggested next agent for the conversation state (remains in-memory)
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

// Get conversation history from Cosmos DB
const getConversationHistory = async (conversationId: string): Promise<ConversationTurn[]> => {
  try {
      // Query by conversationId (partition key), order by timestamp descending
      const querySpec = {
          query: "SELECT * FROM c WHERE c.conversationId = @conversationId ORDER BY c.timestamp DESC OFFSET 0 LIMIT 10", // Limit history length
          parameters: [
              { name: "@conversationId", value: conversationId }
          ]
      };
      const { resources } = await conversationsContainer.items.query<ConversationTurn>(querySpec).fetchAll();
      // Reverse to get chronological order for agent context
      return resources.reverse(); 
  } catch (error) {
      console.error(`Error fetching conversation history for ${conversationId}:`, error);
      return []; // Return empty history on error
  }
};

// Handle user query and route to appropriate agent
export const handleUserQuery = async (
  messageInput: string | object, // Updated parameter type
  userEmail?: string, 
  conversationId?: string
): Promise<AgentResponse> => {
  // Create a conversation ID if not provided
  const currentConversationId = conversationId || `conv-${uuidv4()}`; // Use uuid for new IDs
  const effectiveUserEmail = userEmail || 'anonymous';
  
  // Get conversation history from Cosmos DB
  const history = await getConversationHistory(currentConversationId);
  
  // Get or create user record in Cosmos DB
  let currentUser: User | null = null;
  if (effectiveUserEmail !== 'anonymous') {
     try {
       currentUser = await getOrCreateUser(effectiveUserEmail);
     } catch (userError) {
       console.error("Failed to get or create user:", userError);
       // Proceed without user context or return an error? For now, proceed.
     }
  }
  
  // --- Determine Agent --- 
  let agentType: AgentType;
  const state = conversationState[currentConversationId];
  
  // Extract text message for agent determination, handle object messages later
  const textMessageForDetermination = typeof messageInput === 'string' ? messageInput : null;

  if (state?.expectedNextAgent) {
      agentType = state.expectedNextAgent;
      console.log(`Orchestrator: Using expected next agent '${agentType}' for conversation ${currentConversationId}`);
      // Clear the state *after* the agent runs, or maybe before? Let's clear before.
      delete state.expectedNextAgent; 
  } else if (textMessageForDetermination) {
      // Determine agent based on text message and history
      const determination = await determineAgentType(textMessageForDetermination, history);
      agentType = determination.agentType;
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
  try {
      switch (agentType) {
        case 'customerSupport':
          // handleCustomerSupport likely expects a string, handle potential object input
          const supportMessage = typeof messageInput === 'string' ? messageInput : JSON.stringify(messageInput);
          // Pass conversationId for logging within the agent
          response = await handleCustomerSupport(supportMessage, effectiveUserEmail, history, currentConversationId); 
          break;
        case 'solarAssessment':
          const assessmentUserId = effectiveUserEmail || `anon_${currentConversationId}`;
          // handleSolarAssessment likely expects a string
          const assessmentMessage = typeof messageInput === 'string' ? messageInput : JSON.stringify(messageInput);
          response = await handleSolarAssessment(assessmentMessage, currentConversationId, assessmentUserId);
          break;
        case 'proposal':
          const proposalUserId = effectiveUserEmail || `anon_${currentConversationId}`;
          // handleProposal likely expects a string
          const proposalMessage = typeof messageInput === 'string' ? messageInput : JSON.stringify(messageInput);
          response = await handleProposal(proposalMessage, currentConversationId, proposalUserId, history);
          break;
        case 'crm':
          const crmUserId = effectiveUserEmail || `anon_${currentConversationId}`;
          // handleCRM is designed to accept string | object
          response = await handleCRM(currentConversationId, crmUserId, messageInput, history);
          break;
        default:
          response = {
            text: "I'm not sure how to help with that. Could you please rephrase your question?",
            type: 'text',
            confidence: 0.3,
            reasoning: "Orchestrator could not route to a specific agent."
          };
      }
  } catch (agentError) {
      console.error(`Error executing agent ${agentType}:`, agentError);
      response = {
          text: "I apologize, but I encountered an internal error while processing your request. Please try again later.",
          type: 'text',
          confidence: 0.2,
          reasoning: `Agent execution failed for ${agentType}.`
      };
  }
  
  // Apply Responsible AI enhancements (only if response exists and is not already enhanced)
  if (response && typeof messageInput === 'string') {
    // Calculate confidence if not provided by agent
    if (response.confidence === undefined) {
      response.confidence = calculateConfidence(response.text);
    }
    
    // Add reasoning if not provided
    if (!response.reasoning) {
      response.reasoning = generateReasoning(response, messageInput);
    }
    
    // Add feedback options to allow users to rate responses
    response = addFeedbackOptions(response);
  }
  
  // Store conversation history - use original text message if possible for query field
  const queryToStore = typeof messageInput === 'string' ? messageInput : `[${(messageInput as any)?.type || 'Object Action'}]`; // Better placeholder
  // Use the final agentType determined for storing
  await storeConversation(effectiveUserEmail, queryToStore, response, agentType, currentConversationId);
  
  // If another agent should handle the next turn, include that in the response
  // This check might need refinement if state is cleared before agent execution
  if (response.nextAgent && response.nextAgent !== agentType) {
    response.type = 'handoff';
    // Update conversation state for the *next* expected agent
    if (!conversationState[currentConversationId]) conversationState[currentConversationId] = {};
    conversationState[currentConversationId].expectedNextAgent = response.nextAgent;
  }
  
  // Add conversationId to the response data for the frontend
  response.data = { ...response.data, conversationId: currentConversationId };

  return response;
}; 