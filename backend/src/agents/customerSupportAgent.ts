import { AgentResponse, ConversationTurn, KnowledgeDocument, AgentType } from '../models/types';
import { AzureOpenAI, OpenAI } from "openai"; // Import the main client from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'; // Import specific type
import "@azure/openai/types"; // Import Azure-specific types (side effects)
import { customerSupportAgentPrompt } from './systemPrompts';
// Removed old @azure/openai import
import dotenv from 'dotenv';
// Import the search service function
import { performKeywordSearch } from '../services/searchService';
// Import Cosmos container for logging
import { container as cosmosContainer } from '../utils/cosmosClient';
import { v4 as uuidv4 } from 'uuid'; // Import uuid for generating unique IDs

dotenv.config();

// --- Correct AzureOpenAI Client Initialization ---
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-04-01-preview'; // Use a recent API version

// Endpoint and Key should be loaded from .env by dotenv
if (!process.env.AZURE_OPENAI_ENDPOINT) {
    throw new Error("AZURE_OPENAI_ENDPOINT is not set in environment variables.");
}
if (!process.env.AZURE_OPENAI_API_KEY) {
    throw new Error("AZURE_OPENAI_API_KEY is not set in environment variables.");
}

// Initialize the client using the correct class and options
const client = new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: apiVersion,
    // deployment: deployment, // Deployment name can often be omitted here if specified in the call
});

console.log(`Initialized AzureOpenAI client for deployment '${deployment}' and apiVersion '${apiVersion}'`);

// --- Remove the hardcoded solarFAQ array --- 
// const solarFAQ = [...]; 

// --- Reworked findRelevantFAQs to use Azure AI Search --- 
/**
 * Finds relevant information from the Azure AI Search index based on the user query.
 * @param query The user's query.
 * @returns An object containing the answer, confidence, and sources.
 */
const findRelevantInformation = async (query: string): Promise<{ answer: string, confidence: number, sources: string[] }> => {
  // Define a minimum relevance score threshold
  // Increased threshold based on observed scores
  const SCORE_THRESHOLD = 1.5; // Adjust this value based on testing

  try {
    // Request top 1 result, including the score
    const searchResults: KnowledgeDocument[] = await performKeywordSearch(query, { top: 1 });

    // Check if there is a result AND if its score meets the threshold
    if (searchResults && searchResults.length > 0 && searchResults[0]['@search.score'] && searchResults[0]['@search.score'] >= SCORE_THRESHOLD) {
      const topResult: KnowledgeDocument = searchResults[0];
      console.log(`RAG Match Found: ID=${topResult.id}, Title=${topResult.title}, Score=${topResult['@search.score']}`);
      return {
        answer: topResult.content || "I found some information, but it seems incomplete.",
        // You could potentially adjust confidence based on score
        confidence: 0.85, // Keep high confidence for good RAG hits
        sources: [`Knowledge Base: ${topResult.title}`]
      };
    } else {
      // Log why the fallback is triggered
      if (searchResults && searchResults.length > 0) {
         console.log(`No RAG match found (Top score ${searchResults[0]['@search.score']} below threshold ${SCORE_THRESHOLD}), falling back to generateResponse.`);
      } else {
         console.log("No RAG documents found, falling back to generateResponse.");
      }
      // Call the disabled generateResponse function
      return generateResponse(query);
    }
  } catch (error) {
    console.error('Error during Azure AI Search or processing:', error);
    console.log("Error during RAG, falling back to generateResponse (currently disabled).");
     // Call the disabled generateResponse function
    return generateResponse(query, "I encountered an issue searching my knowledge base.");
  }
};

// Re-enable the body of generateResponse
const generateResponse = async (query: string, context?: string): Promise<{ answer: string, confidence: number, sources: string[] }> => {
   try {
    // Explicitly define the type for the messages array
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: customerSupportAgentPrompt },
      // Add context if provided (e.g., about search failure)
      ...(context ? [{ role: 'system' as const, content: `Context: ${context}` }] : []),
      { role: 'user', content: query }
    ];
    if (!client) throw new Error("OpenAI client is not initialized.");

    // Use the deployment name in the create call
    const response = await client.chat.completions.create({
        model: deployment, // Specify the deployment name here
        messages: messages, // Pass the correctly typed array
        temperature: 0.7,
        max_tokens: 500
    });

    const content = response.choices[0]?.message?.content || 'I apologize, I couldn\'t generate a helpful response.';
    return {
      answer: content,
      confidence: 0.6,
      sources: ['Generated response based on general knowledge']
    };
  } catch (error) {
    console.error('Error generating response with Azure OpenAI:', error);
    return {
      answer: "I'm sorry, I'm having trouble processing that request right now. Could you try rephrasing?",
      confidence: 0.1,
      sources: []
    };
  }
};

// Check for Handoff (remains the same)
const checkForHandoff = (query: string): { needsHandoff: boolean, nextAgent?: string, reason?: string } => {
    // ... existing handoff logic ...
  const lowerQuery = query.toLowerCase();
  
  // Check for assessment-related queries
  if (
    lowerQuery.includes('my house') || 
    lowerQuery.includes('my roof') || 
    lowerQuery.includes('my property') ||
    lowerQuery.includes('suitable') ||
    lowerQuery.includes('assessment')
  ) {
    return { 
      needsHandoff: true, 
      nextAgent: 'solarAssessment',
      reason: 'Query suggests customer wants property assessment'
    };
  }
  
  // Check for pricing/quote-related queries
  if (
    lowerQuery.includes('quote') || 
    lowerQuery.includes('price') || 
    lowerQuery.includes('cost') ||
    lowerQuery.includes('financing') ||
    lowerQuery.includes('how much would')
  ) {
    return { 
      needsHandoff: true, 
      nextAgent: 'proposal',
      reason: 'Query suggests customer wants pricing information'
    };
  }
  
  // Check for scheduling/appointment-related queries
  if (
    lowerQuery.includes('schedule') || 
    lowerQuery.includes('appointment') || 
    lowerQuery.includes('meet') ||
    lowerQuery.includes('calendar') ||
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

// Apply Metacognition - Updated to accept and return AgentResponse
const applyMetacognition = (
    response: AgentResponse, // Accept AgentResponse
    query: string
): AgentResponse => { // Return AgentResponse
    // If confidence is low, acknowledge uncertainty
    if (response.confidence && response.confidence < 0.4 && !response.sources?.includes('OpenAI Fallback Disabled')) {
        // Create a new AgentResponse object for the modified response
        const improvedResponse: AgentResponse = {
            ...response, // Copy existing fields
            text: `I'm not entirely certain about this, but based on my general knowledge: ${response.text} Would you like me to connect you with a solar specialist who can provide more detailed information?`
        };
        return improvedResponse;
    }

    // If we have specific sources (from RAG), cite them
    if (response.sources && response.sources.length > 0 && response.sources[0].startsWith('Knowledge Base:')) {
        // Avoid double citing if already present
        if (!response.text.toLowerCase().includes('based on my knowledge base') && !response.text.toLowerCase().includes(response.sources[0].toLowerCase())) {
            // Create a new AgentResponse object for the modified response
            const improvedResponse: AgentResponse = {
                ...response, // Copy existing fields
                text: `${response.text}\n\n(Source: ${response.sources[0]})`
            };
            return improvedResponse;
        }
    }

    // If no changes needed, return the original response object
    return response;
};

// --- Logging Function --- 
/**
 * Logs a conversation turn to Cosmos DB.
 */
async function logConversationStep(
    conversationId: string,
    userQuery: string,
    agentResponse: AgentResponse,
    agentName: AgentType = 'customerSupport'
) {
  const logItem = {
    id: uuidv4(), // Generate a unique ID for this log entry
    conversationId: conversationId, // Partition key
    timestamp: new Date().toISOString(),
    agentName: agentName,
    userQuery: userQuery,
    agentResponseText: agentResponse.text,
    type: agentResponse.type,
    confidence: agentResponse.confidence,
    sources: agentResponse.sources,
    // Add other relevant fields if needed, like userEmail if available
  };

  try {
    await cosmosContainer.items.create(logItem);
    console.log(`Logged conversation step for conversation ${conversationId} with id ${logItem.id}`);
  } catch (error) {
    console.error(`Error logging conversation step to Cosmos DB for conversation ${conversationId}:`, error);
    // Decide how to handle logging errors (e.g., continue without logging?)
  }
}

// Main handler function - updated to include logging
export const handleCustomerSupport = async (
  message: string,
  userEmail?: string,
  conversationHistory?: ConversationTurn[]
): Promise<AgentResponse> => {
  // --- Determine Conversation ID --- 
  // Try to get from history, otherwise start a new one
  // In a real app, the frontend/orchestrator might manage this more robustly
  const conversationId = conversationHistory?.[0]?.conversationId || uuidv4();
  console.log(`Handling support request for conversation ID: ${conversationId}`);

  // 1. Check for handoff first
  const handoffCheck = checkForHandoff(message);
  if (handoffCheck.needsHandoff && handoffCheck.nextAgent) {
    const handoffResponse: AgentResponse = {
        text: `I'd be happy to help with that. Let me connect you with our ${handoffCheck.nextAgent === 'solarAssessment' ? 'Solar Assessment' : handoffCheck.nextAgent === 'proposal' ? 'Proposal' : 'Customer Service'} team who can better assist with your ${handoffCheck.nextAgent === 'solarAssessment' ? 'property assessment' : handoffCheck.nextAgent === 'proposal' ? 'pricing questions' : 'scheduling needs'}.`,
        type: 'handoff',
        nextAgent: handoffCheck.nextAgent as any,
        confidence: 0.9
      };
    // Log the handoff decision *before* returning
    await logConversationStep(conversationId, message, handoffResponse, 'customerSupport');
    return handoffResponse;
  }

  // 2. If no handoff, find relevant information using RAG (or fallback generator)
  const infoResult = await findRelevantInformation(message);

  // 3. Construct the AgentResponse object *after* getting info
  let agentResponse: AgentResponse = {
    text: infoResult.answer,
    type: 'text',
    confidence: infoResult.confidence,
    sources: infoResult.sources,
  };

  // 4. Apply metacognition (e.g., add source citation or uncertainty)
  agentResponse = applyMetacognition(agentResponse, message);

  // 5. Log the interaction to Cosmos DB *before* returning response
  // Use await to ensure logging completes before sending response (optional)
  await logConversationStep(conversationId, message, agentResponse, 'customerSupport');

  // 6. Return the final response
  return agentResponse;
}; 