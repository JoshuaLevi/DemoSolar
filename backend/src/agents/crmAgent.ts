import { AgentResponse, Appointment, ConversationTurn, CRMEntry, User, AgentType } from '../models/types';
import { crmAgentPrompt } from './systemPrompts';
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

// In-memory database for appointments
let appointments: Appointment[] = [];
let users: { [key: string]: User } = {};

// Export appointments for the CRM dashboard
export const getAllAppointments = (): Appointment[] => {
  return appointments;
};

// Export CRM entries
let crmEntries: CRMEntry[] = [];
export const getCRMEntries = (): CRMEntry[] => {
  return crmEntries;
};

// Add a CRM entry
export const addCRMEntry = (entry: CRMEntry): void => {
  crmEntries.push(entry);
};

// Extended user interface with additional properties
interface ExtendedUser extends User {
  lastContact: string;
  preferredContactMethod?: string;
  appointments?: string[];
}

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

// Update user profile
const updateUserProfile = (userEmail: string, userData: Partial<ExtendedUser>): ExtendedUser => {
  // Create user if it doesn't exist
  if (!users[userEmail]) {
    users[userEmail] = {
      email: userEmail,
      leadScore: 0,
      leadStatus: 'new',
      conversationHistory: [],
      lastContact: new Date().toISOString(),
      preferredContactMethod: 'email'
    } as ExtendedUser;
  }
  
  // Update user data
  users[userEmail] = {
    ...users[userEmail],
    ...userData,
    lastContact: new Date().toISOString() // Always update last contact
  } as ExtendedUser;
  
  return users[userEmail] as ExtendedUser;
};

// Get user profile
export const getUserProfile = (userEmail: string): ExtendedUser | null => {
  return users[userEmail] as ExtendedUser || null;
};

// Calculate lead score based on user behavior - now using Azure OpenAI for analysis
const calculateLeadScore = async (user: ExtendedUser, message: string): Promise<number> => {
  let score = user.leadScore || 0;
  
  try {
    // First use rule-based scoring
    const lowerMessage = message.toLowerCase();
    
    // Increase score based on engagement indicators
    if (lowerMessage.includes('appointment') || lowerMessage.includes('book') || lowerMessage.includes('schedule')) {
      score += 20; // High intent
    }
    
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('quote')) {
      score += 15; // Price inquiry
    }
    
    if (lowerMessage.includes('install') || lowerMessage.includes('when can')) {
      score += 10; // Timeline inquiry
    }
    
    if (user.conversationHistory && user.conversationHistory.length > 5) {
      score += 5; // Sustained engagement
    }
    
    if (user.appointments && user.appointments.length > 0) {
      score += 25; // Has booked appointments
    }

    // Then augment with AI analysis if available
    if (isAzureOpenAIConfigured) {
      const systemPrompt = 'You are an AI assistant that analyzes customer conversations to determine their level of interest in solar installations. Rate the likelihood of conversion on a scale of 0-100 based on the conversation history and latest message.';
      
      // Prepare conversation history for context
      const conversationContext = user.conversationHistory 
        ? user.conversationHistory.map(turn => 
            `Customer: ${turn.userQuery}\nAgent: ${turn.agentResponse}`).join('\n\n')
        : '';
      
      const content = await callAzureOpenAI(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Conversation history:\n${conversationContext}\n\nLatest message: ${message}\n\nProvide a lead score between 0-100 as a single number with no other text.` }
        ],
        { temperature: 0.1, maxTokens: 10 }
      );
      
      if (content) {
        const aiScore = parseInt(content.trim());
        if (!isNaN(aiScore) && aiScore >= 0 && aiScore <= 100) {
          // Blend rule-based and AI scores (70% rule-based, 30% AI)
          score = Math.round(score * 0.7 + aiScore * 0.3);
        }
      }
    }
  } catch (error) {
    console.error('Error calculating lead score with Azure OpenAI:', error);
    // Fallback to rule-based score only
  }
  
  return Math.min(score, 100); // Cap at 100
};

// Update lead status based on score and behavior
const updateLeadStatus = (user: ExtendedUser): 'new' | 'qualified' | 'proposal' | 'negotiation' | 'closed' => {
  const score = user.leadScore || 0;
  
  if (score >= 80) {
    return 'negotiation';
  } else if (score >= 50) {
    return 'proposal';
  } else if (score >= 20) {
    return 'qualified';
  } else {
    return 'new';
  }
};

// Find available appointment slots
const findAvailableSlots = (requestedDate?: string): string[] => {
  // If no date is specified, default to tomorrow
  const startDate = requestedDate 
    ? new Date(requestedDate) 
    : new Date(Date.now() + 24 * 60 * 60 * 1000);
  
  // Set hours to 0 to start at beginning of day
  startDate.setHours(0, 0, 0, 0);
  
  const slots: string[] = [];
  const existingAppointments = appointments.map(a => new Date(a.scheduledTime).getTime());
  
  // Generate slots for the next 7 days
  for (let day = 0; day < 7; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + day);
    
    // Skip Sundays (day 0)
    if (currentDate.getDay() === 0) continue;
    
    // Only offer appointments from 9 AM to 5 PM
    for (let hour = 9; hour < 17; hour++) {
      // Only offer appointments at the top of the hour and half hour
      for (let minute of [0, 30]) {
        const appointmentTime = new Date(currentDate);
        appointmentTime.setHours(hour, minute, 0, 0);
        
        // Skip if this slot is already booked
        if (existingAppointments.includes(appointmentTime.getTime())) {
          continue;
        }
        
        // Skip if this time is in the past
        if (appointmentTime.getTime() < Date.now()) {
          continue;
        }
        
        slots.push(appointmentTime.toISOString());
      }
    }
  }
  
  return slots;
};

// Format date and time in a user-friendly way
const formatAppointmentTime = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
};

// Extract contact information from user message
const extractContactInfo = (message: string): { 
  address?: string; 
  phoneNumber?: string;
  name?: string;
  preferredTime?: string;
} => {
  const info: { 
    address?: string; 
    phoneNumber?: string;
    name?: string;
    preferredTime?: string;
  } = {};
  
  // Phone patterns
  const phonePattern = /(?:phone|call|text|phone number)(?:[^\d]+)?(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i;
  const phoneMatch = message.match(phonePattern);
  if (phoneMatch && phoneMatch[1]) {
    info.phoneNumber = phoneMatch[1].replace(/[-.\s]/g, '');
  }
  
  // Address patterns (simplified)
  const addressPattern = /(?:address|location|property at|house at|live at)[^\d]*([\d]+[^,\n.]{5,})/i;
  const addressMatch = message.match(addressPattern);
  if (addressMatch && addressMatch[1]) {
    info.address = addressMatch[1].trim();
  }
  
  // Name patterns
  const namePattern = /(?:name is|I am|I'm|this is) ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/;
  const nameMatch = message.match(namePattern);
  if (nameMatch && nameMatch[1]) {
    info.name = nameMatch[1].trim();
  }
  
  // Time preference patterns
  const timePattern = /(?:prefer|available|good for me) (?:at|on) ([^,.]+)/i;
  const timeMatch = message.match(timePattern);
  if (timeMatch && timeMatch[1]) {
    info.preferredTime = timeMatch[1].trim();
  }
  
  return info;
};

// Create a new appointment
const createAppointment = (
  userEmail: string, 
  scheduledTime: string, 
  contactInfo: { address?: string; phoneNumber?: string; name?: string; }
): Appointment => {
  const appointmentId = `apt-${Date.now()}`;
  
  const appointment: Appointment = {
    id: appointmentId,
    timestamp: new Date().toISOString(),
    scheduledTime: scheduledTime,
    userEmail: userEmail,
    status: 'scheduled',
    appointmentType: 'virtual', // Changed from 'consultation' to valid enum value
    address: contactInfo.address,
    phoneNumber: contactInfo.phoneNumber,
    notes: `Customer name: ${contactInfo.name || 'Not provided'}`
  };
  
  // Add to appointments database
  appointments.push(appointment);
  
  // Update user profile with appointment
  updateUserProfile(userEmail, { 
    leadScore: 70, // Booking an appointment is a strong signal
    leadStatus: 'proposal', // Changed from 'warm' to valid enum value
    appointments: [...((users[userEmail] as ExtendedUser)?.appointments || []), appointmentId]
  });
  
  return appointment;
};

// Cancel or reschedule appointment
const updateAppointment = (
  appointmentId: string, 
  action: 'cancel' | 'reschedule',
  newTime?: string
): { success: boolean; appointment?: Appointment; message: string } => {
  const appointmentIndex = appointments.findIndex(a => a.id === appointmentId);
  
  if (appointmentIndex === -1) {
    return { 
      success: false, 
      message: 'Appointment not found. Please check the appointment ID and try again.' 
    };
  }
  
  if (action === 'cancel') {
    appointments[appointmentIndex].status = 'cancelled';
    return { 
      success: true, 
      appointment: appointments[appointmentIndex],
      message: 'Appointment has been cancelled successfully.' 
    };
  } else if (action === 'reschedule' && newTime) {
    appointments[appointmentIndex].scheduledTime = newTime;
    appointments[appointmentIndex].status = 'scheduled'; // Changed from 'rescheduled' to valid enum value
    return { 
      success: true, 
      appointment: appointments[appointmentIndex],
      message: 'Appointment has been rescheduled successfully.' 
    };
  }
  
  return { 
    success: false, 
    message: 'Invalid action or missing new appointment time for reschedule.' 
  };
};

// Get user's existing appointments
const getUserAppointments = (userEmail: string): Appointment[] => {
  return appointments.filter(a => 
    a.userEmail === userEmail && 
    a.status !== 'cancelled' &&
    new Date(a.scheduledTime).getTime() > Date.now()
  );
};

// Format a response for appointment booking
const formatAppointmentResponse = (appointment: Appointment): string => {
  return `
Great! I've scheduled your consultation appointment for ${formatAppointmentTime(appointment.scheduledTime)}.

Appointment Details:
- Type: Initial Solar Consultation
- Status: Confirmed
${appointment.address ? `- Location: ${appointment.address}` : ''}
${appointment.phoneNumber ? `- Contact Number: ${appointment.phoneNumber}` : ''}

A confirmation email has been sent to ${appointment.userEmail}. One of our solar consultants will contact you before the appointment.

If you need to reschedule or cancel, simply let me know. Is there anything else you'd like to know about the appointment or our solar installation process?
  `.trim();
};

// Extract date from message
const extractDateFromMessage = (message: string): string | null => {
  // Try to extract date patterns
  const tomorrow = /tomorrow/i;
  const dayAfterTomorrow = /day after tomorrow/i;
  const thisWeek = /this week/i;
  const nextWeek = /next week/i;
  const specificDay = /(?:on|this|next) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;
  const specificDate = /(?:on|at) (\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i;
  
  const now = new Date();
  let resultDate: Date | null = null;
  
  if (tomorrow.test(message)) {
    resultDate = new Date(now);
    resultDate.setDate(now.getDate() + 1);
  } else if (dayAfterTomorrow.test(message)) {
    resultDate = new Date(now);
    resultDate.setDate(now.getDate() + 2);
  } else if (thisWeek.test(message)) {
    resultDate = new Date(now);
    // Find next workday this week
    const dayOfWeek = now.getDay();
    const daysToAdd = dayOfWeek === 5 ? 3 : dayOfWeek === 6 ? 2 : 1;
    resultDate.setDate(now.getDate() + daysToAdd);
  } else if (nextWeek.test(message)) {
    resultDate = new Date(now);
    // Set to next Monday
    resultDate.setDate(now.getDate() + (8 - now.getDay()) % 7);
  } else if (specificDay.test(message)) {
    const dayMatch = message.match(specificDay);
    if (dayMatch && dayMatch[1]) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const targetDay = days.indexOf(dayMatch[1].toLowerCase());
      
      resultDate = new Date(now);
      const currentDay = now.getDay();
      
      // Calculate days to add
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Next week if day has passed
      
      // If message mentions "next", add another week
      if (message.toLowerCase().includes('next ' + dayMatch[1].toLowerCase())) {
        daysToAdd += 7;
      }
      
      resultDate.setDate(now.getDate() + daysToAdd);
    }
  } else if (specificDate.test(message)) {
    const dateMatch = message.match(specificDate);
    if (dateMatch && dateMatch[1]) {
      const dateParts = dateMatch[1].split('/');
      let month = parseInt(dateParts[0]) - 1; // Months are 0-indexed
      let day = parseInt(dateParts[1]);
      
      // Handle year if provided, otherwise use current year
      let year = dateParts.length > 2 ? parseInt(dateParts[2]) : now.getFullYear();
      if (year < 100) year += 2000; // Convert 2-digit year to 4-digit
      
      resultDate = new Date(year, month, day);
    }
  }
  
  return resultDate ? resultDate.toISOString().split('T')[0] : null;
};

// Check if query suggests a handoff to another agent
const checkForHandoff = (query: string): { needsHandoff: boolean, nextAgent?: string, reason?: string } => {
  const lowerQuery = query.toLowerCase();
  
  // Check for assessment-related queries
  if (
    lowerQuery.includes('assessment') ||
    lowerQuery.includes('my roof') ||
    lowerQuery.includes('property suitable') ||
    lowerQuery.includes('sun exposure')
  ) {
    return { 
      needsHandoff: true, 
      nextAgent: 'solarAssessment',
      reason: 'Query suggests customer wants property assessment'
    };
  }
  
  // Check for proposal-related queries
  if (
    lowerQuery.includes('proposal') ||
    lowerQuery.includes('quote') ||
    lowerQuery.includes('cost') ||
    lowerQuery.includes('price') ||
    lowerQuery.includes('how much') ||
    lowerQuery.includes('finance') ||
    lowerQuery.includes('loan')
  ) {
    return { 
      needsHandoff: true, 
      nextAgent: 'proposal',
      reason: 'Query suggests customer wants pricing or proposal information'
    };
  }
  
  // Check for general information queries
  if (
    lowerQuery.includes('how do solar panels work') ||
    lowerQuery.includes('benefits of solar') ||
    lowerQuery.includes('about solar') ||
    lowerQuery.includes('why should')
  ) {
    return { 
      needsHandoff: true, 
      nextAgent: 'customerSupport',
      reason: 'Query suggests customer wants general information about solar'
    };
  }
  
  return { needsHandoff: false };
};

// The main CRM agent handler function - now with Azure OpenAI integration
export const handleCRM = async (
  message: string, 
  userEmail?: string,
  conversationHistory: ConversationTurn[] = []
): Promise<AgentResponse> => {
  if (!userEmail) {
    return {
      text: "I need your email to help you better. Could you please provide it?",
      type: 'text'
    };
  }
  
  // Get or create user profile
  let user = getUserProfile(userEmail) || updateUserProfile(userEmail, {});
  
  // Add the new message to conversation history
  const updatedHistory = [
    ...(user.conversationHistory || []),
    { 
      timestamp: new Date().toISOString(),
      userQuery: message,
      agentResponse: '', // Will be filled in later
      agentType: 'crm' as AgentType
    }
  ];
  
  // Extract contact information from message
  const contactInfo = extractContactInfo(message);
  if (contactInfo.name || contactInfo.phoneNumber || contactInfo.address) {
    user = updateUserProfile(userEmail, {
      name: contactInfo.name || user.name,
      phoneNumber: contactInfo.phoneNumber || user.phoneNumber,
      address: contactInfo.address || user.address
    });
  }
  
  // Check for appointment related intents
  const lowerMessage = message.toLowerCase();
  const dateInfo = extractDateFromMessage(message);
  
  // Handle appointment booking
  if (
    (lowerMessage.includes('appointment') || lowerMessage.includes('schedule') || lowerMessage.includes('book')) &&
    !lowerMessage.includes('cancel') &&
    !lowerMessage.includes('reschedule')
  ) {
    // Find available slots
    const availableSlots = findAvailableSlots(dateInfo || undefined);
    
    if (availableSlots.length === 0) {
      const response: AgentResponse = {
        text: "I'm sorry, but I couldn't find any available appointment slots in the next 7 days. Would you like to check availability for dates beyond that?",
        type: 'text'
      };
      
      // Update conversation history with response
      updatedHistory[updatedHistory.length - 1].agentResponse = response.text;
      updateUserProfile(userEmail, { conversationHistory: updatedHistory });
      
      return response;
    }
    
    // If we have all the info, book the appointment
    if (dateInfo && user.phoneNumber) {
      const exactMatch = availableSlots.find(slot => new Date(slot).toISOString() === dateInfo);
      const slot = exactMatch || availableSlots[0];
      
      const appointment = createAppointment(userEmail, slot, {
        name: user.name,
        phoneNumber: user.phoneNumber,
        address: user.address
      });
      
      const formattedTime = formatAppointmentTime(appointment.scheduledTime);
      const response: AgentResponse = {
        text: `Great! I've scheduled your virtual consultation for ${formattedTime}. One of our solar consultants will contact you at ${user.phoneNumber} at the scheduled time. Would you like to add this to your calendar?`,
        type: 'appointment',
        data: appointment
      };
      
      // Update conversation history with response
      updatedHistory[updatedHistory.length - 1].agentResponse = response.text;
      updateUserProfile(userEmail, { conversationHistory: updatedHistory });
      
      // Calculate updated lead score asynchronously
      calculateLeadScore(user, message).then(score => {
        updateUserProfile(userEmail, { 
          leadScore: score,
          leadStatus: updateLeadStatus({...user, leadScore: score})
        });
      });
      
      return response;
    } else {
      // We need more information to book the appointment
      let missingInfo = [];
      if (!dateInfo) missingInfo.push("preferred date and time");
      if (!user.phoneNumber) missingInfo.push("phone number");
      
      const response: AgentResponse = {
        text: `I'd be happy to schedule an appointment for you. Could you please provide your ${missingInfo.join(', ')}?`,
        type: 'text'
      };
      
      updatedHistory[updatedHistory.length - 1].agentResponse = response.text;
      updateUserProfile(userEmail, { conversationHistory: updatedHistory });
      
      return response;
    }
  }
  
  // Check for appointment cancellation
  if (lowerMessage.includes('cancel') && lowerMessage.includes('appointment')) {
    const userAppointments = getUserAppointments(userEmail);
    
    if (userAppointments.length === 0) {
      const response: AgentResponse = {
        text: "I don't see any scheduled appointments for you. Would you like to schedule one?",
        type: 'text'
      };
      
      updatedHistory[updatedHistory.length - 1].agentResponse = response.text;
      updateUserProfile(userEmail, { conversationHistory: updatedHistory });
      
      return response;
    }
    
    // Cancel the latest appointment if there are multiple
    const latestAppointment = userAppointments[userAppointments.length - 1];
    const result = updateAppointment(latestAppointment.id, 'cancel');
    
    const response: AgentResponse = {
      text: result.message,
      type: 'text',
      data: result.appointment
    };
    
    updatedHistory[updatedHistory.length - 1].agentResponse = response.text;
    updateUserProfile(userEmail, { conversationHistory: updatedHistory });
    
    return response;
  }
  
  // Check if we should hand off to another agent
  const handoff = checkForHandoff(message);
  if (handoff.needsHandoff && handoff.nextAgent) {
    const response: AgentResponse = {
      text: `I'll connect you with our ${handoff.nextAgent} specialist who can better assist you with that.`,
      type: 'handoff',
      nextAgent: handoff.nextAgent as AgentType
    };
    
    updatedHistory[updatedHistory.length - 1].agentResponse = response.text;
    updateUserProfile(userEmail, { conversationHistory: updatedHistory });
    
    return response;
  }
  
  // For all other queries, use Azure OpenAI to generate a response
  try {
    if (isAzureOpenAIConfigured) {
      // Prepare user information for context
      const userInfo = `
        Name: ${user.name || 'Not provided'}
        Email: ${user.email}
        Phone: ${user.phoneNumber || 'Not provided'}
        Address: ${user.address || 'Not provided'}
        Lead Status: ${user.leadStatus || 'new'}
        Lead Score: ${user.leadScore || 0}
      `;
      
      // Format conversation history for context
      const conversationContext = updatedHistory
        .slice(0, -1) // Exclude current message since we haven't generated a response yet
        .map(turn => `Customer: ${turn.userQuery}\nAgent: ${turn.agentResponse}`)
        .join('\n\n');
      
      const responseText = await callAzureOpenAI(
        [
          { role: 'system', content: crmAgentPrompt + `\nCustomer Information:\n${userInfo}` },
          { role: 'user', content: conversationContext ? `Previous conversation:\n${conversationContext}\n\nCustomer: ${message}` : message }
        ],
        { temperature: 0.7, maxTokens: 400 }
      );
      
      if (responseText) {
        const response: AgentResponse = {
          text: responseText,
          type: 'text'
        };
        
        // Update conversation history with AI-generated response
        updatedHistory[updatedHistory.length - 1].agentResponse = responseText;
        updateUserProfile(userEmail, { conversationHistory: updatedHistory });
        
        // Update lead score asynchronously
        calculateLeadScore(user, message).then(score => {
          updateUserProfile(userEmail, { 
            leadScore: score,
            leadStatus: updateLeadStatus({...user, leadScore: score})
          });
        });
        
        return response;
      }
    }
    
    // Fallback for if Azure OpenAI is unavailable
    const response: AgentResponse = {
      text: "I'm here to help with your solar installation questions and schedule appointments with our consultants. What questions do you have about going solar?",
      type: 'text'
    };
    
    updatedHistory[updatedHistory.length - 1].agentResponse = response.text;
    updateUserProfile(userEmail, { conversationHistory: updatedHistory });
    
    return response;
    
  } catch (error) {
    console.error('Error in CRM agent:', error);
    
    // Fallback response
    const response: AgentResponse = {
      text: "I apologize, but I'm having trouble processing your request. Please try again or call our customer service at (555) 123-4567 for immediate assistance.",
      type: 'text'
    };
    
    updatedHistory[updatedHistory.length - 1].agentResponse = response.text;
    updateUserProfile(userEmail, { conversationHistory: updatedHistory });
    
    return response;
  }
}; 