import { AgentResponse } from '../models/types';

/**
 * Enhances agent responses with Responsible AI features
 * Adds confidence scores, reasoning, and source tracking
 */
export const enhanceWithResponsibleAI = (response: AgentResponse, options?: {
  defaultConfidence?: number;
  defaultReasoning?: string;
  sources?: string[];
}): AgentResponse => {
  // Set default options
  const opts = {
    defaultConfidence: 0.7,
    defaultReasoning: "Response generated based on available information",
    ...options
  };

  // Ensure confidence score exists
  if (response.confidence === undefined) {
    response.confidence = opts.defaultConfidence;
  }
  
  // Add reasoning if not present
  if (!response.reasoning) {
    response.reasoning = opts.defaultReasoning;
  }
  
  // Add sources if provided and not already present
  if (opts.sources && opts.sources.length > 0 && (!response.sources || response.sources.length === 0)) {
    response.sources = opts.sources;
  }
  
  return response;
};

/**
 * Rates the confidence of a response based on content analysis
 * @param text The response text to analyze
 * @returns A confidence score between 0 and 1
 */
export const calculateConfidence = (text: string): number => {
  // Check for uncertainty markers
  const uncertaintyPhrases = [
    "i'm not sure", "not certain", "might be", "could be", 
    "possibly", "perhaps", "i think", "approximately",
    "i don't know", "uncertain", "unclear"
  ];
  
  const textLower = text.toLowerCase();
  const hasUncertainty = uncertaintyPhrases.some(phrase => textLower.includes(phrase));
  
  // Check for specificity (numbers, technical terms, etc.)
  const hasSpecificInfo = /\d+(\.\d+)?%|\$\d+|kWh/i.test(text);
  
  // Calculate base confidence
  let confidence = 0.7; // Default moderate confidence
  
  if (hasUncertainty) {
    confidence -= 0.2; // Reduce for uncertainty
  }
  
  if (hasSpecificInfo) {
    confidence += 0.15; // Increase for specific information
  }
  
  // Keep within bounds
  return Math.min(Math.max(confidence, 0.3), 0.95);
};

/**
 * Generates a user-friendly explanation for why a certain response was given
 * @param response The agent response
 * @param query The user's query
 * @returns A natural language explanation
 */
export const generateReasoning = (response: AgentResponse, query: string): string => {
  if (response.confidence >= 0.85) {
    return "High confidence response based on verified information in our knowledge base";
  } else if (response.confidence >= 0.7) {
    return "Response based on general information about solar energy systems";
  } else if (response.confidence >= 0.5) {
    return "This is a best estimate based on limited information";
  } else {
    return "Limited information available to answer this specific question with high confidence";
  }
};

/**
 * Adds feedback mechanisms to the response data
 * @param response The agent response to enhance with feedback options
 * @returns The enhanced response with feedback options in data
 */
export const addFeedbackOptions = (response: AgentResponse): AgentResponse => {
  response.data = {
    ...response.data,
    feedbackOptions: {
      showOptions: true,
      options: [
        { id: "helpful", label: "Helpful" },
        { id: "not_helpful", label: "Not Helpful" },
        { id: "inaccurate", label: "Contains Inaccurate Information" }
      ]
    }
  };
  
  return response;
}; 