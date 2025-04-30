// =====================================================
// DEPRECATED: This file is deprecated and will be removed. 
// Please use customerSupportAgent.ts instead.
// Only kept for backward compatibility with mainAgent.ts.
// =====================================================

import { AgentResponse } from '../models/types';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

// Azure OpenAI configuration
const azureOpenAIKey = process.env.AZURE_OPENAI_API_KEY || '';
const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureOpenAIDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '';
const azureOpenAIApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2023-05-15';

// Check if Azure OpenAI is properly configured
const isAzureOpenAIConfigured = !!(azureOpenAIKey && azureOpenAIEndpoint && azureOpenAIDeploymentName);

// Simple conversation context tracking
type ConversationContext = {
  lastTopic?: string;
  evModel?: string;
  lastTimestamp: number;
};

// Keep track of recent conversations by user ID or IP
const conversationContexts: Map<string, ConversationContext> = new Map();

// Get or create conversation context
const getConversationContext = (userId: string = 'anonymous'): ConversationContext => {
  // Clear expired contexts (older than 30 minutes)
  const now = Date.now();
  for (const [id, context] of conversationContexts.entries()) {
    if (now - context.lastTimestamp > 30 * 60 * 1000) {
      conversationContexts.delete(id);
    }
  }

  // Get or create user's context
  if (!conversationContexts.has(userId)) {
    conversationContexts.set(userId, { lastTimestamp: now });
  } else {
    // Update timestamp
    const context = conversationContexts.get(userId)!;
    context.lastTimestamp = now;
    conversationContexts.set(userId, context);
  }

  return conversationContexts.get(userId)!;
};

// Update conversation context
const updateConversationContext = (userId: string = 'anonymous', updates: Partial<ConversationContext>) => {
  const context = getConversationContext(userId);
  conversationContexts.set(userId, { ...context, ...updates, lastTimestamp: Date.now() });
};

// Function to make Azure OpenAI API calls
async function callAzureOpenAI(messages: Array<{role: string, content: string}>, options = { temperature: 0.7, maxTokens: 400 }) {
  try {
    if (!isAzureOpenAIConfigured) {
      throw new Error('Azure OpenAI not configured');
    }

    const response = await fetch(
      `${azureOpenAIEndpoint}/openai/deployments/${azureOpenAIDeploymentName}/chat/completions?api-version=${azureOpenAIApiVersion}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': azureOpenAIKey
        },
        body: JSON.stringify({
          messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error calling Azure OpenAI:', error);
    return null;
  }
}

// Solar FAQ data for common questions
const solarFAQ = [
  {
    question: 'How do solar panels work?',
    answer: 'Solar panels work by absorbing sunlight with photovoltaic cells, generating direct current (DC) energy and then converting it to usable alternating current (AC) energy with the help of inverter technology. This AC energy then flows through your home\'s electrical panel to power your appliances and lights.'
  },
  {
    question: 'What are the benefits of solar energy?',
    answer: 'Solar energy offers numerous benefits including: reduced electricity bills, lower carbon footprint, increased home value, energy independence, and protection against rising energy costs. Additionally, there are often tax incentives and rebates available to offset installation costs.'
  },
  {
    question: 'How much do solar panels cost?',
    answer: 'The cost of solar panels varies based on system size, equipment quality, and installation complexity. For most residential installations, prices range from $15,000 to $25,000 before incentives. After federal tax credits and local incentives, the net cost can be reduced by 30% or more.'
  },
  {
    question: 'Can solar panels charge an electric car?',
    keywords: ['electric car', 'ev', 'charge', 'charging', 'tesla', 'vehicle'],
    answer: 'Yes, solar panels can definitely charge an electric vehicle (EV). To charge an EV with solar panels, you\'ll need a home solar system sized appropriately for both your home and vehicle needs, typically requiring an additional 8-10 panels (about 3-4 kW) specifically for the car. You can charge directly during the day when the sun is shining, or use a home battery system to store solar energy for nighttime charging. This setup can significantly reduce or eliminate your EV charging costs and further decrease your carbon footprint.'
  },
  {
    question: 'How many solar panels do I need for an electric car?',
    keywords: ['electric car', 'ev', 'charge', 'charging', 'tesla', 'vehicle', 'how many'],
    answer: 'To charge an electric vehicle (EV) with solar panels, you typically need 8-12 additional panels beyond what your home requires. This equals roughly 3-4 kW of extra capacity. The exact number depends on your driving habits, the efficiency of your EV, and your local solar conditions. On average, an EV requires about 2,000-4,000 kWh annually, which translates to approximately 8-10 additional 400W panels. A solar installer can provide a precise calculation based on your specific vehicle model and driving patterns.'
  },
  {
    question: 'What equipment do I need to charge an EV with solar?',
    keywords: ['electric car', 'ev', 'charge', 'charging', 'equipment', 'setup'],
    answer: 'To charge an electric vehicle with solar power, you\'ll need: 1) A solar panel system sized appropriately for both home and EV needs, 2) A grid-tie inverter to convert solar DC power to AC, 3) An EV charging station (Level 2 charger recommended for faster charging), 4) Optionally, a home battery system like Tesla Powerwall if you want to store solar energy for nighttime charging. This setup allows you to power your car with clean solar energy and can be integrated with your home\'s electrical system by a qualified solar installer.'
  },
  {
    question: 'What is a battery storage system?',
    keywords: ['battery', 'storage', 'system', 'powerwall', 'store', 'battery storage'],
    answer: 'A battery storage system for solar, like the Tesla Powerwall or LG RESU, stores excess electricity generated by your solar panels during the day for use when the sun isn\'t shining. These systems typically range from 10-16 kWh capacity and allow you to power your home and charge your EV at night or during cloudy days. They also provide backup power during grid outages. Adding battery storage to your solar setup increases energy independence and can be particularly valuable for EV owners who want to charge their vehicles with clean solar energy regardless of time of day.'
  }
];

// Function to find matching FAQ with improved keyword matching
const findMatchingFAQ = (message: string, context?: ConversationContext) => {
  const lowerMessage = message.toLowerCase();
  
  // Check for specific EV models - if found, prioritize using LLM over FAQs
  const hasSpecificEVModel = /tesla model|model [syxe3]|leaf|bolt|mach-e|id.4|ioniq|kona|polestar|rivian|mustang|taycan|etron/i.test(lowerMessage);
  if (hasSpecificEVModel) {
    // Extract the EV model for context tracking
    let evModel = "generic EV";
    if (lowerMessage.includes("tesla model y") || lowerMessage.includes("model y")) {
      evModel = "Tesla Model Y";
    } else if (lowerMessage.includes("tesla model 3") || lowerMessage.includes("model 3")) {
      evModel = "Tesla Model 3";
    } else if (lowerMessage.includes("tesla model s") || lowerMessage.includes("model s")) {
      evModel = "Tesla Model S";
    } else if (lowerMessage.includes("tesla model x") || lowerMessage.includes("model x")) {
      evModel = "Tesla Model X";
    }
    
    // Update context even if returning null
    if (context) {
      context.lastTopic = "ev_charging";
      context.evModel = evModel;
    }
    
    return null; // Return null to trigger LLM response for specific EV questions
  }
  
  // Check for follow-up questions about battery storage
  if (context?.lastTopic === "ev_charging" && 
      /battery|storage|store|powerwall|night|evening|after dark|save energy/i.test(lowerMessage)) {
    // Find the battery storage FAQ
    return solarFAQ.find(faq => faq.question.toLowerCase().includes("battery storage system"));
  }
  
  // First try exact phrase matching
  const exactMatch = solarFAQ.find(faq => 
    lowerMessage.includes(faq.question.toLowerCase())
  );
  
  if (exactMatch) {
    // Update context when we match a FAQ
    if (context) {
      context.lastTopic = exactMatch.question.toLowerCase().includes("battery storage") 
        ? "battery_storage"
        : exactMatch.question.toLowerCase().includes("electric car") 
          ? "ev_charging" 
          : "solar_general";
    }
    return exactMatch;
  }
  
  // Then try keyword matching for FAQs that have keywords
  for (const faq of solarFAQ) {
    if (faq.keywords) {
      const matchesKeywords = faq.keywords.some(keyword => 
        lowerMessage.includes(keyword.toLowerCase())
      );
      
      if (matchesKeywords) {
        // Update context when we match a FAQ by keywords
        if (context) {
          context.lastTopic = faq.question.toLowerCase().includes("battery storage") 
            ? "battery_storage"
            : faq.question.toLowerCase().includes("electric car") 
              ? "ev_charging" 
              : "solar_general";
        }
        return faq;
      }
    }
  }
  
  // Check for short follow-up questions when we have context
  if (context?.lastTopic && message.trim().split(/\s+/).length < 10) {
    if (context.lastTopic === "ev_charging" && /how|why|what|when|tell|explain/i.test(lowerMessage)) {
      // Return EV charging FAQ for short follow-ups after EV discussion
      return solarFAQ.find(faq => faq.question.toLowerCase().includes("how many solar panels"));
    }
  }
  
  return null;
};

// Handle information requests about solar
export const handleInfoQuery = async (message: string, userId: string = 'anonymous'): Promise<AgentResponse> => {
  try {
    // Get conversation context
    const context = getConversationContext(userId);
    
    // Check if the message is too short or non-specific
    if (message.trim().length < 5) {
      return {
        text: "I'd be happy to help you with any questions about solar energy. Could you please provide more details about what you'd like to know?",
        type: 'text',
        confidence: 0.9
      };
    }

    // Check if the query is about computers or non-solar topics
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('computer') || 
        lowerMessage.includes('laptop') || 
        lowerMessage.includes('phone') ||
        lowerMessage.includes('internet')) {
      return {
        text: "I specialize in solar energy solutions, not computer or technology issues. I'd be happy to answer any questions about solar panels, installation, or energy savings. Is there something specific about solar energy you'd like to know?",
        type: 'text',
        confidence: 0.8
      };
    }

    // Try to find a matching FAQ with improved matching
    const matchingFAQ = findMatchingFAQ(message, context);

    // Check for specific patterns
    const isAboutBatteryStorage = /battery|storage|store|powerwall|night|evening|after dark|save energy/i.test(lowerMessage);
    const hasSpecificEVDetails = /tesla model|model [syxe3]|leaf|bolt|mach-e|id.4|ioniq|kona|polestar|rivian|mustang|taycan|etron|kwh|battery|range/i.test(lowerMessage);
    const isFollowUpQuestion = message.trim().split(/\s+/).length < 15 && /what|how|why|when|where|explain|tell me about|mean by/i.test(lowerMessage);
    
    // If this is a short follow-up about battery storage after an EV question
    if (isFollowUpQuestion && isAboutBatteryStorage && context.lastTopic === "ev_charging") {
      updateConversationContext(userId, { lastTopic: "battery_storage" });
      
      return {
        text: "A battery storage system for solar, like the Tesla Powerwall or LG RESU, stores excess electricity generated by your solar panels during the day for use when the sun isn't shining. This is particularly useful for EV owners because:\n\n1. It allows you to charge your EV at night using stored solar energy instead of grid power\n2. It ensures you're using clean energy even when charging during non-daylight hours\n3. It can provide backup charging capability during power outages\n4. It helps maximize self-consumption of your solar generation\n\nFor a Tesla Model Y, combining solar panels with a battery storage system (typically 10-13.5 kWh capacity) creates a complete ecosystem where you can power both your home and vehicle with renewable energy 24/7.",
        type: 'text',
        confidence: 0.9
      };
    }

    // Use LLM for specific model questions or if no FAQ matches
    if (hasSpecificEVDetails || !matchingFAQ || isFollowUpQuestion) {
      // If Azure OpenAI is available, use it
      if (isAzureOpenAIConfigured) {
        const evModelContext = context.evModel ? `The user previously asked about a ${context.evModel}.` : '';
        const lastTopicContext = context.lastTopic ? `The last topic discussed was ${context.lastTopic.replace('_', ' ')}.` : '';

        const systemPrompt = `You are a knowledgeable assistant for a solar installation company specializing in solar panel systems for home and EV charging. 
Provide helpful, accurate information about solar energy, panels, installation, and benefits. 
Give specific, technical answers when asked about charging specific electric vehicle models.

${evModelContext} ${lastTopicContext}

For EV-specific questions, include these details in your answer:
- Tesla Model Y has a 75 kWh battery and gets about 3-4 miles per kWh
- Tesla Model 3 has a 60-75 kWh battery depending on version
- Tesla Model S and X have 100 kWh batteries
- Generally, EVs require 2,000-4,000 kWh annually depending on driving distance
- A typical home solar panel produces about 400W in ideal conditions
- Formula: Annual EV kWh needed / (solar panel kW * 1,400 hours) = panels needed

If asked about battery storage systems:
- Battery storage systems like Tesla Powerwall store excess solar energy for use at night
- A single Powerwall has 13.5 kWh of usable capacity
- Battery storage is ideal for EV owners who charge at night
- Batteries provide backup power during outages
- They typically cost $8,000-$12,000 per unit installed

Keep answers concise but informative. If the query is not about solar energy, politely redirect the conversation to solar topics.`;
        
        const responseText = await callAzureOpenAI(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
          ],
          { temperature: 0.7, maxTokens: 500 }
        );
        
        if (responseText) {
          // Update conversation context based on the message
          if (hasSpecificEVDetails) {
            updateConversationContext(userId, { lastTopic: "ev_charging" });
          } else if (isAboutBatteryStorage) {
            updateConversationContext(userId, { lastTopic: "battery_storage" });
          }
          
          return {
            text: responseText,
            type: 'text',
            confidence: 0.9
          };
        }
      }
      
      // If LLM fails or isn't configured, but it's a battery storage question
      if (isAboutBatteryStorage) {
        updateConversationContext(userId, { lastTopic: "battery_storage" });
        
        return {
          text: "A battery storage system for solar, like the Tesla Powerwall or LG RESU, stores excess electricity generated by your solar panels during the day for use when the sun isn't shining. This is particularly useful for EV owners because it allows you to charge your vehicle at night using stored solar energy instead of drawing from the grid. Battery systems typically range from 10-16 kWh capacity and can provide backup power during outages. They cost approximately $8,000-$12,000 per unit installed, but may qualify for incentives and will increase your overall solar self-consumption.",
          type: 'text',
          confidence: 0.8
        };
      }
      
      // If LLM fails or isn't configured, but it's a specific EV question
      if (hasSpecificEVDetails) {
        let evModel = "your EV";
        let kwhEstimate = "60-75";
        let panelsNeeded = "15-19";
        let milesPerKwh = "3-4";
        
        // Extract specific vehicle info and update context
        if (lowerMessage.includes("tesla model y") || lowerMessage.includes("model y")) {
          evModel = "Tesla Model Y";
          kwhEstimate = "75";
          panelsNeeded = "19";
          milesPerKwh = "3.5";
          updateConversationContext(userId, { lastTopic: "ev_charging", evModel: "Tesla Model Y" });
        } else if (lowerMessage.includes("tesla model 3") || lowerMessage.includes("model 3")) {
          evModel = "Tesla Model 3";
          kwhEstimate = "60-75";
          panelsNeeded = "15-19";
          milesPerKwh = "4";
          updateConversationContext(userId, { lastTopic: "ev_charging", evModel: "Tesla Model 3" });
        } else if (lowerMessage.includes("tesla model s") || lowerMessage.includes("model s")) {
          evModel = "Tesla Model S";
          kwhEstimate = "100";
          panelsNeeded = "25";
          milesPerKwh = "3";
          updateConversationContext(userId, { lastTopic: "ev_charging", evModel: "Tesla Model S" });
        } else if (lowerMessage.includes("tesla model x") || lowerMessage.includes("model x")) {
          evModel = "Tesla Model X";
          kwhEstimate = "100";
          panelsNeeded = "25";
          milesPerKwh = "2.5";
          updateConversationContext(userId, { lastTopic: "ev_charging", evModel: "Tesla Model X" });
        } else if (context.evModel) {
          // Use the model from context if available
          evModel = context.evModel;
          if (evModel === "Tesla Model Y") {
            kwhEstimate = "75";
            panelsNeeded = "19";
            milesPerKwh = "3.5";
          } else if (evModel === "Tesla Model 3") {
            kwhEstimate = "60-75";
            panelsNeeded = "15-19";
            milesPerKwh = "4";
          } else if (evModel === "Tesla Model S") {
            kwhEstimate = "100";
            panelsNeeded = "25";
            milesPerKwh = "3";
          } else if (evModel === "Tesla Model X") {
            kwhEstimate = "100";
            panelsNeeded = "25";
            milesPerKwh = "2.5";
          }
        } else {
          updateConversationContext(userId, { lastTopic: "ev_charging" });
        }
        
        return {
          text: `For a ${evModel} with approximately ${kwhEstimate} kWh battery capacity, you would need around ${panelsNeeded} solar panels (400W each) to generate enough electricity to fully charge it throughout the year, assuming typical driving patterns of 12,000-15,000 miles annually. This estimate accounts for both efficiency losses and seasonal variations in solar production. The ${evModel} typically gets about ${milesPerKwh} miles per kWh, meaning each full charge can provide approximately ${parseInt(kwhEstimate) * parseFloat(milesPerKwh)} miles of range. The exact number of panels may vary based on your specific driving habits, local solar conditions, and whether you'll be charging primarily during daylight hours or using a battery storage system.`,
          type: 'text',
          confidence: 0.8
        };
      }
      
      // If it's a simple follow-up and we have context
      if (isFollowUpQuestion && context.lastTopic) {
        if (context.lastTopic === "ev_charging") {
          // Handle follow-up to EV charging questions
          return {
            text: `To further explain about charging your ${context.evModel || "electric vehicle"} with solar: The key consideration is matching your daily driving needs with solar production. For typical driving of 30-40 miles per day, you'd need about 8-10 kWh of electricity, which can be produced by 2-3 solar panels in good conditions. However, since solar production varies by season and weather, we recommend the full system size mentioned earlier to ensure you have enough power year-round. Would you like to know more about battery storage options to charge your vehicle at night with solar energy?`,
            type: 'text',
            confidence: 0.7
          };
        }
      }
      
      // Use matching FAQ if available
      if (matchingFAQ) {
        return {
          text: matchingFAQ.answer,
          type: 'text',
          confidence: 0.9
        };
      }
    } else if (matchingFAQ) {
      // We have a matching FAQ and it's not a specific EV question
      return {
        text: matchingFAQ.answer,
        type: 'text',
        confidence: 0.9
      };
    }

    // General fallback response if all other methods fail
    return {
      text: "I'd be happy to help you learn more about solar energy solutions, including how they can work with electric vehicles. Could you let me know what specific aspect of solar power interests you? For example, installation costs, energy savings, or how solar panels can charge electric cars?",
      type: 'text',
      confidence: 0.6
    };
  } catch (error) {
    console.error('Error in info agent:', error);
    
    return {
      text: "I apologize, but I'm having trouble retrieving that information right now. Can I help you with something else about solar energy?",
      type: 'text',
      confidence: 0.4
    };
  }
}; 