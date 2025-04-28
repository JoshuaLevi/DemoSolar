import { AgentResponse, ConversationTurn, KnowledgeDocument } from '../models/types';
import { customerSupportAgentPrompt } from './systemPrompts';
// Temporarily comment out OpenAI imports due to persistent TS errors
// import { OpenAIClient, AzureKeyCredential } from "@azure/openai";
import dotenv from 'dotenv';
// Import the search service function
import { performKeywordSearch } from '../services/searchService';
// Import Cosmos container for logging (if needed later)
// import { container as cosmosContainer } from '../utils/cosmosClient';

dotenv.config();

// Temporarily comment out OpenAI client initialization
// const client = new OpenAIClient(
//   process.env.AZURE_OPENAI_ENDPOINT || '',
//   new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY || '')
// );

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
      return generateResponse(query);
    }
  } catch (error) {
    console.error('Error during Azure AI Search or processing:', error);
    console.log("Error during RAG, falling back to generateResponse (currently disabled).");
     // Call the disabled generateResponse function
    return generateResponse(query, "I encountered an issue searching my knowledge base.");
  }
};

// Temporarily disable the body of generateResponse
const generateResponse = async (query: string, context?: string): Promise<{ answer: string, confidence: number, sources: string[] }> => {
  console.warn("generateResponse called, but OpenAI client is currently disabled due to import issues.");
  // Return a placeholder response
  return {
    answer: "I found some information in my knowledge base, but I'm currently unable to generate a more detailed response. Please check the provided source.",
    // If RAG failed, we might not even have a source, provide generic error
    // answer: "I'm currently unable to process this request fully due to an internal issue. Please try again later or rephrase your query.",
    confidence: 0.3, // Low confidence as it's not a full response
    sources: ['OpenAI Fallback Disabled']
  };
  /* // Original OpenAI call commented out
  try {
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini';
    const messages = [
      { role: 'system', content: customerSupportAgentPrompt },
      // Add context if provided (e.g., about search failure)
      ...(context ? [{ role: 'system', content: `Context: ${context}` }] : []),
      { role: 'user', content: query }
    ];

    const response = await client.getChatCompletions(
      deployment,
      messages,
      { temperature: 0.7, maxTokens: 500 }
    );

    const content = response.choices[0]?.message?.content || 'I apologize, I couldn\'t generate a helpful response.';

    return {
      answer: content,
      confidence: 0.6, // Keep slightly lower confidence for purely generated answers
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
  */
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

// Apply Metacognition (remains mostly the same, sources are now different)
const applyMetacognition = (response: { answer: string, confidence: number, sources: string[] }, query: string): { answer: string, confidence: number, sources: string[] } => {
    // ... existing metacognition logic ...
  // If confidence is low, acknowledge uncertainty
  if (response.confidence < 0.4 && !response.sources.includes('OpenAI Fallback Disabled')) {
    const improvedResponse = {
      answer: `I'm not entirely certain about this, but based on my general knowledge: ${response.answer} Would you like me to connect you with a solar specialist who can provide more detailed information?`,
      confidence: response.confidence,
      sources: response.sources
    };
    return improvedResponse;
  }
  
  // If we have specific sources (from RAG), cite them
  if (response.sources && response.sources.length > 0 && response.sources[0].startsWith('Knowledge Base:')) {
    // Avoid double citing if already present
    if (!response.answer.toLowerCase().includes('based on my knowledge base') && !response.answer.toLowerCase().includes(response.sources[0].toLowerCase())) {
       const improvedResponse = {
        answer: `${response.answer}\n\n(Source: ${response.sources[0]})`,
        confidence: response.confidence,
        sources: response.sources
      };
      return improvedResponse;
    }
  }
  
  return response;
};

// Main handler function - updated to call findRelevantInformation
export const handleCustomerSupport = async (
  message: string,
  userEmail?: string,
  conversationHistory?: ConversationTurn[]
): Promise<AgentResponse> => {
  // 1. Check for handoff first
  const handoffCheck = checkForHandoff(message);
  if (handoffCheck.needsHandoff && handoffCheck.nextAgent) {
    // ... existing handoff return block ...
    return {
      text: `I'd be happy to help with that. Let me connect you with our ${handoffCheck.nextAgent === 'solarAssessment' ? 'Solar Assessment' : handoffCheck.nextAgent === 'proposal' ? 'Proposal' : 'Customer Service'} team who can better assist with your ${handoffCheck.nextAgent === 'solarAssessment' ? 'property assessment' : handoffCheck.nextAgent === 'proposal' ? 'pricing questions' : 'scheduling needs'}.`,
      type: 'handoff',
      nextAgent: handoffCheck.nextAgent as any,
      confidence: 0.9
    };
  }

  // 2. If no handoff, find relevant information using RAG (or fallback generator)
  let agentResponse = await findRelevantInformation(message);

  // 3. Apply metacognition (e.g., add source citation or uncertainty)
  agentResponse = applyMetacognition(agentResponse, message);

  // 4. TODO: Log the interaction to Cosmos DB
  // Example:
  // const conversationId = conversationHistory?.[0]?.conversationId || crypto.randomUUID(); // Get or create conv ID
  // logConversationStep(conversationId, message, agentResponse.answer, 'CustomerSupportAgent');

  // 5. Return the final response
  return {
    text: agentResponse.answer,
    type: 'text',
    confidence: agentResponse.confidence,
    sources: agentResponse.sources
  };
}; 