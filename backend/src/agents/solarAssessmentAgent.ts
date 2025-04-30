import { AgentResponse, ConversationTurn, PropertyAssessment, AgentType } from '../models/types';
import { solarAssessmentAgentPrompt } from './systemPrompts';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { assessmentsContainer } from '../utils/cosmosClient';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY || '',
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT}`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION || '2024-04-01-preview' },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY || '' }
});

// In-memory database for property assessments
let assessments: PropertyAssessment[] = [];

// Define a simple structure for the assessment record
interface SolarAssessment {
    id: string; // Unique ID for the assessment, used as partition key
    assessmentId: string; // Partition Key value (same as id)
    conversationId: string;
    userEmail?: string; // Optional for now
    timestamp: string;
    status: 'pending' | 'in-progress' | 'complete';
    address?: string;
    energyUsage?: string; // e.g., kWh per year or monthly bill amount
    notes?: string;
}

// Minimal state tracking for the assessment conversation (in-memory for now)
const assessmentState: { [conversationId: string]: Partial<SolarAssessment> } = {};

// Export assessments for admin dashboard
export const getAllAssessments = (): PropertyAssessment[] => {
  return assessments;
};

// Helper function to extract property information from message
const extractPropertyInfo = (message: string): Partial<PropertyAssessment> => {
  const propertyInfo: Partial<PropertyAssessment> = {};
  
  // Extract address
  const addressMatches = message.match(/(?:address|location|property at)[:\s]+([^,\.]*(?:,|\.|$))/i);
  if (addressMatches && addressMatches[1]) {
    propertyInfo.address = addressMatches[1].trim();
  }
  
  // Extract roof type
  const roofMatches = message.match(/(?:roof type|roof is|roofing)[:\s]+([^,\.]*(?:,|\.|$))/i);
  if (roofMatches && roofMatches[1]) {
    propertyInfo.roofType = roofMatches[1].trim();
  }
  
  // Extract roof age
  const ageMatches = message.match(/(?:roof age|roof is|installed)[:\s]+(\d+)[\s]*(?:years?|yrs?)/i);
  if (ageMatches && ageMatches[1]) {
    propertyInfo.roofAge = parseInt(ageMatches[1]);
  }
  
  // Extract monthly bill
  const billMatches = message.match(/(?:bill|electricity cost|power bill|energy bill|monthly)[:\s]*\$?(\d+)/i);
  if (billMatches && billMatches[1]) {
    propertyInfo.averageMonthlyBill = parseInt(billMatches[1]);
  }
  
  // Extract square footage
  const sqftMatches = message.match(/(?:square feet|sq ft|sqft|square footage)[:\s]*(\d+)/i);
  if (sqftMatches && sqftMatches[1]) {
    propertyInfo.squareFootage = parseInt(sqftMatches[1]);
  }
  
  // Extract orientation
  const orientationMatches = message.match(/(?:orientation|facing)[:\s]+([^,\.]*(?:,|\.|$))/i);
  if (orientationMatches && orientationMatches[1]) {
    propertyInfo.orientation = orientationMatches[1].trim();
  }
  
  // Extract shading issues
  const shadingMatches = message.match(/(?:shading|shade|shadows|trees)[:\s]+([^,\.]*(?:,|\.|$))/i);
  if (shadingMatches && shadingMatches[1]) {
    const shadingText = shadingMatches[1].toLowerCase();
    propertyInfo.shadingIssues = shadingText.includes('yes') || 
                               shadingText.includes('problem') || 
                               shadingText.includes('issue') ||
                               shadingText.includes('lot') ||
                               shadingText.includes('many');
  }
  
  return propertyInfo;
};

// Analyze property information using Azure OpenAI
const analyzeProperty = async (propertyInfo: Partial<PropertyAssessment>, message: string): Promise<PropertyAssessment> => {
  try {
    // Create a prompt to assess solar potential
    const prompt = `
You are a solar assessment expert. Analyze the following property information to determine solar potential:

${JSON.stringify(propertyInfo, null, 2)}

User's original message: "${message}"

Based on this information, estimate:
1. Recommended system size in kW
2. Estimated annual production in kWh
3. A confidence score (0-1) of this assessment based on the completeness of information
4. Any additional information that would improve the assessment

Respond in JSON format only:
{
  "estimatedSystemSize": number,
  "estimatedProduction": number,
  "confidence": number,
  "missingInfo": ["string"],
  "recommendations": ["string"]
}`;

    const response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a solar assessment expert that responds only in valid JSON format.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 500
    });

    const content = response.choices[0]?.message?.content || '{}';
    const analysis = JSON.parse(content);
    
    // Create and save the assessment
    const assessment: PropertyAssessment = {
      id: `assessment-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userEmail: propertyInfo.userEmail || 'anonymous',
      address: propertyInfo.address,
      roofType: propertyInfo.roofType,
      roofAge: propertyInfo.roofAge,
      averageMonthlyBill: propertyInfo.averageMonthlyBill,
      squareFootage: propertyInfo.squareFootage,
      orientation: propertyInfo.orientation,
      shadingIssues: propertyInfo.shadingIssues,
      estimatedSystemSize: analysis.estimatedSystemSize || 0,
      estimatedProduction: analysis.estimatedProduction || 0,
      confidence: analysis.confidence || 0.5
    };
    
    // Store the assessment
    assessments.push(assessment);
    
    return assessment;
  } catch (error) {
    console.error('Error analyzing property:', error);
    
    // Return a basic assessment with low confidence if analysis fails
    const defaultAssessment: PropertyAssessment = {
      id: `assessment-${Date.now()}`,
      timestamp: new Date().toISOString(),
      userEmail: propertyInfo.userEmail || 'anonymous',
      ...propertyInfo,
      estimatedSystemSize: 0,
      estimatedProduction: 0,
      confidence: 0.1
    };
    
    assessments.push(defaultAssessment);
    return defaultAssessment;
  }
};

// Determine if we have enough information for an assessment
const hasEnoughInformation = (assessment: Partial<PropertyAssessment>): boolean => {
  // Calculate how many key fields we have
  let fieldsPresent = 0;
  const totalFields = 5; // Key fields for a basic assessment
  
  if (assessment.averageMonthlyBill) fieldsPresent++;
  if (assessment.squareFootage) fieldsPresent++;
  if (assessment.orientation) fieldsPresent++;
  if (assessment.roofType) fieldsPresent++;
  if (assessment.shadingIssues !== undefined) fieldsPresent++;
  
  // Need at least 3 of 5 key fields for a basic assessment
  return fieldsPresent >= 3;
};

// Generate a response based on the assessment
const generateAssessmentResponse = async (assessment: PropertyAssessment, message: string): Promise<string> => {
  try {
    const response = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: solarAssessmentAgentPrompt },
        { role: 'user', content: `
Based on the following property assessment, provide a friendly and informative response to the user. 
Ask for any critical missing information and explain what we can determine so far.

Assessment details:
${JSON.stringify(assessment, null, 2)}

User's message: "${message}"

If confidence is low, acknowledge uncertainty and ask for specific information.
If confidence is high, provide detailed insights about the solar potential.
Recommend next steps based on the assessment.
` }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return response.choices[0]?.message?.content || "I've analyzed your property, but I'm having trouble generating a detailed response. Could you provide more information about your property?";
  } catch (error) {
    console.error('Error generating assessment response:', error);
    return "I've analyzed your property, but I'm having trouble generating a detailed response right now. Could we try again later?";
  }
};

// Ask for missing information
const askForMissingInfo = (assessment: Partial<PropertyAssessment>): string => {
  const missingItems = [];
  
  if (!assessment.address) missingItems.push("your property's location or zip code");
  if (!assessment.roofType) missingItems.push("your roof type (e.g., asphalt shingle, metal, tile)");
  if (!assessment.averageMonthlyBill) missingItems.push("your average monthly electricity bill");
  if (!assessment.squareFootage) missingItems.push("your home's approximate square footage");
  if (!assessment.orientation) missingItems.push("which direction your roof faces (e.g., south, southwest)");
  if (assessment.shadingIssues === undefined) missingItems.push("if there are any trees or buildings that shade your roof");
  
  if (missingItems.length === 0) {
    return "Thank you for providing all the necessary information. I can now complete a detailed solar assessment.";
  }
  
  if (missingItems.length > 3) {
    return `To provide you with an accurate solar assessment, I'll need a bit more information. Could you please tell me about ${missingItems.slice(0, 3).join(', ')}, and any other details about your property that might be relevant?`;
  }
  
  return `To provide you with a more accurate solar assessment, could you please tell me about ${missingItems.join(' and ')}?`;
};

// Get property information from conversation history
const getPropertyInfoFromHistory = (history: ConversationTurn[]): Partial<PropertyAssessment> => {
  let combinedInfo: Partial<PropertyAssessment> = {};
  
  // Go through conversation history to extract property information
  history.forEach(turn => {
    const extractedInfo = extractPropertyInfo(turn.userQuery);
    combinedInfo = { ...combinedInfo, ...extractedInfo };
  });
  
  return combinedInfo;
};

// Check if query suggests a handoff to another agent is needed
const checkForHandoff = (query: string): { needsHandoff: boolean, nextAgent?: string, reason?: string } => {
  const lowerQuery = query.toLowerCase();
  
  // Check for proposal-related queries
  if (
    lowerQuery.includes('quote') || 
    lowerQuery.includes('price') || 
    lowerQuery.includes('cost') ||
    lowerQuery.includes('how much') ||
    lowerQuery.includes('financing')
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
    lowerQuery.includes('visit') ||
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

/**
 * Handles user queries related to solar assessments.
 * For now, it asks for address and energy usage, then saves a basic record.
 */
export const handleSolarAssessment = async (
    message: string,
    conversationId: string,
    userEmail?: string // Optional user email
): Promise<AgentResponse> => {

    const state = assessmentState[conversationId] || { status: 'pending' };
    assessmentState[conversationId] = state; // Ensure state is tracked

    let responseText = '';
    let nextAgent: AgentType | undefined = undefined;
    let confidence = 0.8; // Higher confidence as it's a targeted flow

    // Simple state machine
    if (state.status === 'pending') {
        // Ask for address first
        responseText = "Okay, I can help start a solar assessment. To begin, could you please provide the full property address where the solar panels would be installed?";
        state.status = 'in-progress';
        state.notes = "Asked for address.";
    } else if (state.status === 'in-progress' && !state.address) {
        // Assume the message contains the address (basic parsing)
        state.address = message; // Very simple assumption
        responseText = `Got it. And approximately what is your average monthly electricity bill, or your annual usage in kWh? This helps estimate the system size.`;
        state.notes = "Received address, asked for energy usage.";
    } else if (state.status === 'in-progress' && state.address && !state.energyUsage) {
        // Assume the message contains energy usage info
        state.energyUsage = message; // Very simple assumption

        // Save the basic assessment record to Cosmos DB
        const assessmentId = uuidv4();
        const assessmentRecord: SolarAssessment = {
            id: assessmentId,
            assessmentId: assessmentId, // Use ID as partition key
            conversationId: conversationId,
            userEmail: userEmail, // Include if available
            timestamp: new Date().toISOString(),
            status: 'complete', // Mark as complete for this minimal version
            address: state.address,
            energyUsage: state.energyUsage,
            notes: "Initial assessment record created."
        };

        try {
            await assessmentsContainer.items.create(assessmentRecord);
            responseText = `Thanks! I've created an initial assessment record (ID: ${assessmentId}). A specialist may follow up if more details are needed. For now, is there anything else I can help with? Perhaps provide a proposal based on this?`;
            // Suggest handoff to proposal agent
            nextAgent = 'proposal';
            // Clean up state for this conversation
            delete assessmentState[conversationId];
        } catch (error) {
            console.error("Error saving assessment to Cosmos DB:", error);
            responseText = "Sorry, I encountered an error trying to save the assessment information. Please try again later.";
            state.status = 'pending'; // Reset state on error
            confidence = 0.3;
        }
    } else {
        // Fallback / unexpected state
        responseText = "I seem to have lost track of our assessment conversation. Could you please provide the property address again?";
        state.status = 'pending';
        confidence = 0.5;
    }

    const response: AgentResponse = {
        text: responseText,
        type: 'text', // Could be 'assessment-update' later
        confidence: confidence,
        nextAgent: nextAgent,
        data: { conversationId: conversationId } // Pass conversationId back
    };

    // Note: We are not explicitly adding this turn to the main 'conversations' log here.
    // The orchestrator or a dedicated logging mechanism should handle that.

    return response;
}; 