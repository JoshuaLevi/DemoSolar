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
import fetch from 'node-fetch'; // Import node-fetch

// Remove the placeholder declaration
// declare function web_search(args: { search_term: string, explanation: string }): Promise<any>;

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
 * Finds relevant information from the Azure AI Search index based on the user query,
 * falling back to web search and then generative response if needed.
 * @param query The user\'s query.
 * @returns An object containing the answer, confidence, and sources.
 */
const findRelevantInformation = async (query: string): Promise<{ answer: string, confidence: number, sources: string[] }> => {
  const SCORE_THRESHOLD = 3.0;
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
  let webContextText: string | null = null;
  let webContextSourceTitle: string | null = null;
  let webContextSourceUrl: string | null = null;

  // 1. Try Azure AI Search (RAG)
  try {
    console.log(`Attempting RAG search for query: "${query}"`);
    const searchResults: KnowledgeDocument[] = await performKeywordSearch(query, { top: 1 });

    if (searchResults && searchResults.length > 0 && searchResults[0]['@search.score'] && searchResults[0]['@search.score'] >= SCORE_THRESHOLD) {
      const topResult: KnowledgeDocument = searchResults[0];
      console.log(`RAG Match Found: ID=${topResult.id}, Title=${topResult.title}, Score=${topResult['@search.score']}`);
      // Return RAG result directly if score is high enough
      return {
        answer: topResult.content || "I found relevant information in our knowledge base, but it seems incomplete.",
        confidence: 0.85,
        sources: [`Knowledge Base: ${topResult.title}`]
      };
    } else {
       if (searchResults && searchResults.length > 0) {
         console.log(`RAG result found but score (${searchResults[0]['@search.score']}) is below threshold ${SCORE_THRESHOLD}. Proceeding to web search.`);
      } else {
         console.log("No relevant documents found via RAG. Proceeding to web search.");
      }
    }
  } catch (error) {
    console.error('Error during Azure AI Search (RAG):', error);
    // Proceed to web search even if RAG fails
  }

  // 2. Attempt Web Search if RAG wasn't sufficient
  if (BRAVE_API_KEY) {
    console.log("Attempting web search via Brave API.");
    try {
        const encodedQuery = encodeURIComponent(query);
        const apiUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodedQuery}&count=3`;
        console.log(`Calling Brave Search API: ${apiUrl}`);
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'X-Subscription-Token': BRAVE_API_KEY }
        });

        if (!response.ok) {
            throw new Error(`Brave API error: ${response.status} ${response.statusText} - ${await response.text()}`);
        }
        const data = await response.json();

        if (data?.web?.results && data.web.results.length > 0) {
            const topWebResult = data.web.results[0];
            webContextText = topWebResult.description || null;
            webContextSourceUrl = topWebResult.url || null;
            webContextSourceTitle = topWebResult.title || 'Web Result';
            console.log(`Web search successful. Found context: ${webContextSourceTitle}`);
        } else {
            console.log("Web search did not return usable results.", data);
      }
    } catch (error) {
        console.error('Error during Brave Search API call:', error);
        // Continue to generative fallback even if web search fails
    }
  } else {
    console.warn("BRAVE_API_KEY not set. Skipping web search.");
  }

  // 3. Always Fallback to Generative Response (potentially using web context)
  console.log("Proceeding to generative response using Azure OpenAI" + (webContextText ? " with web context." : "."));
  try {
      const genResult = await generateResponse(query, webContextText, webContextSourceTitle);
      // Add web source URL if web context was used in generation
      const finalSources = webContextSourceUrl ? [...genResult.sources, webContextSourceUrl] : genResult.sources;
      return { ...genResult, sources: finalSources };
    
  } catch (error) {
      console.error('Error during generative fallback:', error);
    return { 
          answer: "I'm sorry, I encountered multiple issues trying to find an answer. Could you please rephrase or try again later?",
          confidence: 0.1,
      sources: []
    };
  }
};

// Re-enable the body of generateResponse
const generateResponse = async (
    query: string, 
    webContextText?: string | null, 
    webContextSourceTitle?: string | null
): Promise<{ answer: string, confidence: number, sources: string[] }> => {
  try {
    let contextMessage = "Answer the user's query based on your general knowledge.";
    if (webContextText) {
        contextMessage = `Answer the user's query in English using your general knowledge, prioritizing the following context found from a web search${webContextSourceTitle ? ` (Source: ${webContextSourceTitle})` : ''}: "${webContextText}". Synthesize this information into a comprehensive answer. If the web context seems irrelevant, rely on your general knowledge but mention the search was attempted.`;
    }
    
    const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: customerSupportAgentPrompt },
      { role: 'system', content: contextMessage }, // Add the dynamic context message
        { role: 'user', content: query }
    ];
    
    if (!client) throw new Error("OpenAI client is not initialized.");

    const response = await client.chat.completions.create({
        model: deployment, 
        messages: messages, 
        temperature: 0.7,
        max_tokens: 500
    });

    const content = response.choices[0]?.message?.content || 'I apologize, I couldn\'t generate a helpful response.';
    // Base sources array - might include web source URL later in findRelevantInformation
    const baseSources = ['Generated response' + (webContextText ? ' synthesized with web context' : ' based on general knowledge')];
    
    return {
      answer: content,
      confidence: webContextText ? 0.75 : 0.6, // Slightly higher confidence if web context was used
      sources: baseSources 
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
    // Also cite web search URL if present (added in findRelevantInformation)
    let sourceCitation = "";
  if (response.sources && response.sources.length > 0) {
       const knowledgeBaseSource = response.sources.find(s => s.startsWith('Knowledge Base:'));
       const webSourceUrl = response.sources.find(s => s.startsWith('http')); // Find the URL
       
       if (knowledgeBaseSource) {
         sourceCitation = `\n\n(Source: ${knowledgeBaseSource})`;
       } else if (webSourceUrl) {
         // Try to extract title from reasoning if possible, otherwise just use URL
         const titleMatch = response.reasoning?.match(/using information from: (.*?)( - https?:|$)/);
         const sourceDisplay = titleMatch && titleMatch[1] ? `${titleMatch[1].trim()} - ${webSourceUrl}` : webSourceUrl;
         sourceCitation = `\n\n(Source: ${sourceDisplay})`;
       } 
    }

    if (sourceCitation && !response.text.toLowerCase().includes("(source:")) { // Avoid double citing
        const improvedResponse: AgentResponse = {
            ...response,
            text: response.text + sourceCitation
      };
      return improvedResponse;
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
    reasoning: agentResponse.reasoning, // Log reasoning
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
  query: string, 
  userEmail?: string,
  // conversationHistory is passed by orchestrator, but not directly used here anymore
  // It might be useful for future context enrichment, but RAG/generateResponse handles current context
  conversationHistory?: ConversationTurn[], 
  conversationId?: string // Added conversationId for logging
): Promise<AgentResponse> => {
  try {
    console.log(`Handling customer support query: "${query}" for conversation: ${conversationId}`);
    
    // 1. Check for Handoff first
    const handoffCheck = checkForHandoff(query);
  if (handoffCheck.needsHandoff && handoffCheck.nextAgent) {
      const handoffResponse: AgentResponse = {
        text: `Let me connect you with our ${handoffCheck.nextAgent === 'solarAssessment' ? 'Solar Assessment' : handoffCheck.nextAgent === 'proposal' ? 'Proposal' : 'Scheduling'} team to help with that.`, // Corrected handoff text
      type: 'handoff',
        nextAgent: handoffCheck.nextAgent as AgentType, // Assert type
        confidence: 0.95, // High confidence in handoff decision
        reasoning: handoffCheck.reason || `User query matches criteria for ${handoffCheck.nextAgent} agent.`,
        data: {} // No specific data needed for handoff text
      };
      
      // Log the handoff decision
      if (conversationId) {
        await logConversationStep(conversationId, query, handoffResponse);
      } else {
        console.warn("Cannot log handoff step: conversationId is missing.");
      }
      
      return handoffResponse;
    }

    // 2. Find relevant information using RAG or generate response with web context
    const { answer, confidence, sources } = await findRelevantInformation(query);
  
    // 3. Construct initial response object
    let baseResponse: AgentResponse = {
      text: answer, // This is now the potentially synthesized answer
      type: 'text', 
      confidence: confidence,
      sources: sources, // Includes web URL if applicable
      reasoning: `Generated response with confidence ${confidence.toFixed(2)}${sources.length > 0 && sources.some(s => s.startsWith('http')) ? ' using information from web search' : sources.length > 0 && sources[0].startsWith('Knowledge Base:') ? ' using information from Knowledge Base' : '.'}`, // Updated reasoning
      data: {} // Initialize empty data object
    };

    // 4. Apply Metacognition (which now handles adding source citation)
    let finalResponse = applyMetacognition(baseResponse, query);

    // 5. Log the final response
    if (conversationId) {
      await logConversationStep(conversationId, query, finalResponse);
    } else {
       console.warn("Cannot log customer support step: conversationId is missing.");
    }
    
    return finalResponse;

  } catch (error) {
    console.error('Error in customer support agent:', error);
    
    // Construct a standard error response
    const errorResponse: AgentResponse = {
      text: "I apologize, but I encountered an error processing your question. Could you please try asking in a different way?",
    type: 'text',
      confidence: 0.3,
      reasoning: "Internal error occurred while processing the query.",
      data: {}
    };
    
    // Log the error interaction if possible
    if (conversationId) {
      await logConversationStep(conversationId, query, errorResponse, 'customerSupport');
    }

    return errorResponse;  
  }
}; 