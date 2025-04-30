import { AgentResponse, AgentType, Appointment, ConversationTurn, CRMEntry, User } from '../models/types';
import { crmAgentPrompt } from './systemPrompts';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { appointmentsContainer } from '../utils/cosmosClient';
import { addMinutes, format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale'; // Import English locale

// Make sure to load environment variables from the root .env file
dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env.local' });

// Azure OpenAI configuration
const azureOpenAIKey = process.env.AZURE_OPENAI_API_KEY || '';
const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureOpenAIDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '';
const azureOpenAIApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2023-05-15';

// Check if Azure OpenAI is properly configured
const isAzureOpenAIConfigured = !!(azureOpenAIKey && azureOpenAIEndpoint && azureOpenAIDeploymentName);

// If not configured, log warning
if (!isAzureOpenAIConfigured) {
  console.warn('Azure OpenAI is not fully configured. Check your environment variables.');
}

// Keep in-memory users for now, but appointments are moved to DB
// let appointments: Appointment[] = []; 
let users: { [key: string]: User } = {}; // <-- Keep users in memory for now

// Export appointments for the CRM dashboard - ** NEEDS TO READ FROM DB VIA API **
// export const getAllAppointments = (): Appointment[] => {
//   return []; // No longer reads from memory
// };

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

// In-memory state for CRM booking flow
interface CrmBookingState {
    step: 'idle' | 'awaitingConsultationType' | 'awaitingAppointmentReason' | 'awaitingPhoneNumber' | 'awaitingName' | 'awaitingAddress' | 'awaitingDateTimePreference' | 'awaitingSlotSelection' | 'awaitingConfirmation' | 'bookingConfirmed' | 'bookingFailed';
    conversationId: string;
    consultationType?: 'virtual' | 'in-person';
    appointmentReason?: string;
    phoneNumber?: string;
    name?: string;
    address?: string;
    requestedDate?: string;
    availableSlots?: string[];
    selectedSlot?: string;
    email?: string;
}

// Store state per conversation
const crmState: Record<string, CrmBookingState> = {};

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
const updateUserProfile = async (userId: string, profileData: Partial<User>): Promise<void> => {
    console.log(`(Placeholder) Updating profile for ${userId} with:`, profileData);
    // Removed usersContainer usage - implement actual user update logic if needed (e.g., via orchestrator or separate user service)
    // const { item } = await usersContainer.item(userId, userId).patch({ operations: Object.entries(profileData).map(([key, value]) => ({ op: 'add', path: `/${key}`, value })) });
    // console.log("User profile update result:", item);
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
const updateLeadStatus = (user: User): 'new' | 'qualified' | 'proposal' | 'negotiation' | 'closed' => {
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

// Find available appointment slots, checking against booked slots in Cosmos DB
const findAvailableSlots = async (requestedDate?: string): Promise<string[]> => {
    console.log("(Placeholder) Finding slots for requested date:", requestedDate);
    // Replace with actual logic (e.g., call external calendar API)
    
    let baseDate = new Date();
    if (requestedDate) {
        try {
            // Try to parse the date string
            const parsedDate = parseISO(requestedDate); 
            if (!isNaN(parsedDate.getTime())) {
                baseDate = parsedDate; // Use the requested date if valid
            } else {
                console.warn(`Could not parse requested date '${requestedDate}', defaulting to tomorrow.`);
                baseDate.setDate(baseDate.getDate() + 1);
            }
        } catch (e) {
             console.error(`Error parsing requested date '${requestedDate}':`, e);
             baseDate.setDate(baseDate.getDate() + 1); // Default to tomorrow on error
        }
    } else {
         baseDate.setDate(baseDate.getDate() + 1); // Default to tomorrow if no date requested
    }

    // Generate slots for the baseDate (UTC for consistency)
    // TODO: Filter these based on actual bookings from appointmentsContainer
    // TODO: Consider user's time preference (e.g., afternoon) if extracted
    return [
        `${format(baseDate, 'yyyy-MM-dd')}T09:00:00Z`,
        `${format(baseDate, 'yyyy-MM-dd')}T10:00:00Z`,
        `${format(baseDate, 'yyyy-MM-dd')}T11:00:00Z`,
        `${format(baseDate, 'yyyy-MM-dd')}T14:00:00Z`, // Afternoon slots
        `${format(baseDate, 'yyyy-MM-dd')}T15:00:00Z`,
        `${format(baseDate, 'yyyy-MM-dd')}T16:00:00Z`,
        `${format(baseDate, 'yyyy-MM-dd')}T17:00:00Z`,
    ];
};

// Format date and time in a user-friendly way (English)
const formatAppointmentTime = (isoString: string): string => {
  try {
      const date = parseISO(isoString); // Use parseISO which handles Z timezone correctly
      // Use English locale and Amsterdam time zone
      return format(date, 'PPPP p', { 
          locale: enUS, // Use English locale
          // awareOfUnicodeTokens: true // Needed for some complex formats if using them
      }); 
      // Example output: Wednesday, May 1st, 2025 at 5:00 PM GMT+2
      // Adjust format string ('PPPP p') as needed for desired output
  } catch (error) {
       console.error("Error formatting appointment time:", isoString, error);
       return isoString; // Fallback to ISO string
  }
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
  
  // Address patterns (Improved for NL style: Straatnaam Nummer, Postcode? Plaats?)
  // Regex tries to capture typical patterns like "Straatnaam 123", "Straatnaam 123a", optionally followed by more.
  // It looks for keywords like "address", "adres", "woon", "straat" etc.
  const addressKeywords = ["address", "adres", "location", "property at", "house at", "live at", "woon", "straat", "weg", "laan"];
  // Basic pattern: some text (street name) followed by digits (house number) potentially with a letter suffix
  const basicAddressPattern = /([a-zA-ZäöüÄÖÜß\.\-\s]+)\s+(\d+[a-zA-Z]?)(?:\s*,|\s+in|\s+te)?(?:\s+[a-zA-ZäöüÄÖÜß\s]+)?/i;
  // More specific pattern looking for keywords
  const keywordAddressPattern = new RegExp(`(?:${addressKeywords.join('|')})[:\s]*(${basicAddressPattern.source})`, 'i');

  let addressMatch = message.match(keywordAddressPattern);
  // If keyword pattern doesn't match, try the basic pattern anywhere in the message
  if (!addressMatch) {
      addressMatch = message.match(basicAddressPattern);
  }

  if (addressMatch && addressMatch[1] && addressMatch[2]) {
      // Combine matched street name and number parts
      info.address = `${addressMatch[1].trim()} ${addressMatch[2]}`;
      // Optionally try to capture more (like city if present after a comma/in/te)
      // This part is harder without more context or lookarounds
      // const maybeCity = addressMatch[0].split(/[,\s]+(?:in|te)\s+/i)[1];
      // if (maybeCity) info.address += `, ${maybeCity.trim()}`;
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

// Create a new appointment (Saves to DB)
const createAppointment = async (
  userEmail: string, 
  scheduledTime: string, 
  contactInfo: { address?: string; phoneNumber?: string; name?: string; appointmentReason?: string; },
  appointmentType: 'virtual' | 'in-person'
): Promise<Appointment> => {
  const appointmentId = uuidv4(); 
  
  // Format the appointment reason if it's just a number
  let formattedReason = contactInfo.appointmentReason || 'Not specified';
  if (formattedReason === '1' || formattedReason === '1.') {
    formattedReason = 'Solar panel installation consultation';
  } else if (formattedReason === '2' || formattedReason === '2.') {
    formattedReason = 'Energy efficiency assessment';
  } else if (formattedReason === '3' || formattedReason === '3.') {
    formattedReason = 'Maintenance or repair discussion';
  }
  
  const appointment: Appointment = {
    id: appointmentId,
    timestamp: new Date().toISOString(),
    scheduledTime: scheduledTime,
    userEmail: userEmail,
    status: 'scheduled',
    appointmentType: appointmentType,
    address: contactInfo.address,
    phoneNumber: contactInfo.phoneNumber,
    notes: `Customer name: ${contactInfo.name || 'Not provided'}\nReason: ${formattedReason}`,
    appointmentReason: formattedReason // Save the formatted reason here
  };
  
  // Save to Cosmos DB
  try {
    await appointmentsContainer.items.create(appointment);
    console.log(`Appointment ${appointment.id} saved to Cosmos DB.`);
  } catch (error) {
      console.error(`Error saving appointment ${appointment.id} to Cosmos DB:`, error);
      throw new Error("Failed to save appointment to database."); 
  }
  
  // Update user profile with appointment ID (uses in-memory 'users')
  const user = users[userEmail]; 
  if (user) {
  updateUserProfile(userEmail, { 
          leadScore: (user.leadScore || 0) + 30,
          leadStatus: 'proposal', 
          appointments: [...(user.appointments || []), appointmentId]
      });
  }
  
  return appointment;
};

// Cancel or reschedule appointment - ** NEEDS DB UPDATE **
const updateAppointment = async (
  appointmentId: string, 
  action: 'cancel' | 'reschedule',
  newTime?: string
): Promise<{ success: boolean; appointment?: Appointment; message: string }> => {
  // TODO: Implement update logic for Cosmos DB
  // Fetch the item by ID, update its status/scheduledTime, and replace it.
  // Example structure:
  /*
  try {
    const { resource: item } = await appointmentsContainer.item(appointmentId, appointmentId).read();
    if (!item) { throw new Error('Not found'); }
    if (action === 'cancel') { item.status = 'cancelled'; }
    else if (action === 'reschedule' && newTime) { item.scheduledTime = newTime; item.status = 'scheduled'; }
    else { throw new Error('Invalid action'); }
    const { resource: updatedItem } = await appointmentsContainer.item(appointmentId, appointmentId).replace(item);
    return { success: true, appointment: updatedItem, message: `Appointment ${action}led.` };
  } catch (error) {
      console.error(`Error updating appointment ${appointmentId}:`, error);
      return { success: false, message: 'Failed to update appointment.' };
  }
  */
  console.warn("updateAppointment not fully implemented for Cosmos DB yet.");
  return { success: false, message: 'Update functionality not implemented yet.' };
};

// Get user's existing appointments - ** NEEDS DB QUERY **
// const getUserAppointments = async (userEmail: string): Promise<Appointment[]> => {
//   // TODO: Implement query logic for Cosmos DB
//   // Example: Query appointmentsContainer where userEmail matches and status is not cancelled etc.
//   console.warn("getUserAppointments not fully implemented for Cosmos DB yet.");
//   return []; // Placeholder
// };

// Format a response for appointment booking (English)
const formatAppointmentResponse = (appointment: Appointment): string => {
  return `
Great! I've scheduled your ${appointment.appointmentType === 'in-person' ? 'In-Person Consultation' : 'Virtual Consultation'} appointment for ${formatAppointmentTime(appointment.scheduledTime)}.

Appointment Details:
- Type: ${appointment.appointmentType === 'in-person' ? 'In-Person Consultation' : 'Virtual Consultation'} (${appointment.status})
${appointment.address ? `- Location: ${appointment.address}` : ''}
${appointment.phoneNumber && appointment.phoneNumber !== 'Not provided' ? `- Contact Number: ${appointment.phoneNumber}` : ''}

We'll contact you via ${appointment.userEmail}${appointment.phoneNumber && appointment.phoneNumber !== 'Not provided' ? ` or ${appointment.phoneNumber}` : ''} before the appointment.

If you need to reschedule or cancel, simply let me know. Is there anything else you'd like to know?
  `.trim();
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

// Helper function to parse dates from user input
const parseDateFromInput = (input: string): string | null => {
    // Get today's date
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDate = today.getDate();
    
    // Try to extract day of week, date, and month
    const lowerInput = input.toLowerCase();
    
    // Check for specific days of the week
    const dayOfWeekMatch = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(lowerInput);
    if (dayOfWeekMatch) {
        const dayOfWeek = dayOfWeekMatch[1].toLowerCase();
        const daysMap: {[key: string]: number} = {
            'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 0
        };
        
        // Calculate the next occurrence of this day
        const targetDay = daysMap[dayOfWeek];
        const todayDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToAdd = (targetDay + 7 - todayDay) % 7 || 7; // If today, use next week
        
        const nextOccurrence = new Date(today);
        nextOccurrence.setDate(currentDate + daysToAdd);
        return format(nextOccurrence, 'yyyy-MM-dd');
    }
    
    // Check for specific date patterns like "May 2nd" or "2nd of May"
    const datePatterns = [
        /\b(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)\b/i, // "2nd May" or "2nd of May"
        /\b([a-z]+) (\d{1,2})(?:st|nd|rd|th)?\b/i         // "May 2nd"
    ];
    
    for (const pattern of datePatterns) {
        const match = lowerInput.match(pattern);
        if (match) {
            let day: number;
            let monthName: string;
            
            if (pattern === datePatterns[0]) {
                day = parseInt(match[1], 10);
                monthName = match[2].toLowerCase();
            } else {
                monthName = match[1].toLowerCase();
                day = parseInt(match[2], 10);
            }
            
            const monthsMap: {[key: string]: number} = {
                'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
                'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
                'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8, 'october': 9, 'oct': 9,
                'november': 10, 'nov': 10, 'december': 11, 'dec': 11
            };
            
            if (monthsMap.hasOwnProperty(monthName) && day >= 1 && day <= 31) {
                const month = monthsMap[monthName];
                // Use current year, but might need to adjust for past dates
                let year = currentYear;
                // If the requested month/day is earlier than current date, assume next year
                if (month < currentMonth || (month === currentMonth && day < currentDate)) {
                    year++;
                }
                
                // Create and validate the date
                const date = new Date(year, month, day);
                if (!isNaN(date.getTime())) {
                    return format(date, 'yyyy-MM-dd');
                }
            }
        }
    }
    
    // Check for "tomorrow", "next week", etc.
    if (lowerInput.includes('tomorrow')) {
        const tomorrow = new Date(today);
        tomorrow.setDate(currentDate + 1);
        return format(tomorrow, 'yyyy-MM-dd');
    }
    
    if (lowerInput.includes('next week')) {
        const nextWeek = new Date(today);
        nextWeek.setDate(currentDate + 7);
        return format(nextWeek, 'yyyy-MM-dd');
    }
    
    // No recognized date pattern
    return null;
};

// Helper function to format confirmation details (English)
function formatConfirmationDetails(state: CrmBookingState): string {
    const timeString = state.selectedSlot ? formatAppointmentTime(state.selectedSlot) : 'Time TBD';
    return `
Please confirm the details for your appointment:
- Name: ${state.name || 'Not provided'}
- Phone: ${state.phoneNumber && state.phoneNumber !== 'Not provided' ? state.phoneNumber : 'Not provided (optional)'}
- Type: ${state.consultationType}
${state.consultationType === 'in-person' ? `- Address: ${state.address || 'Not provided'}` : ''}
- Reason: ${state.appointmentReason || 'Not specified'}
- Time: ${timeString}

Does this look correct? (yes/no)
    `.trim();
}

// Consolidated Booking Logic Function
async function attemptBooking(state: CrmBookingState, userId: string): Promise<{ responseText: string; responseType: AgentResponse['type']; confidence: number; appointment: Appointment | null }> {
    if (!state.selectedSlot || !state.name || !state.consultationType) {
        // Should not happen if state machine is correct
        console.error(`Attempting booking with incomplete state for ${state.conversationId}`);
        // No need to delete state here, let the main handler do it
        return { responseText: "Something went wrong, state was incomplete. Please try again.", responseType:'text', confidence: 0.3, appointment: null };
    }

    // Verify that either phone or email is provided
    if ((!state.phoneNumber || state.phoneNumber === 'Not provided') && (!userId || userId === 'anonymous')) {
        console.error(`Booking attempt failed: No contact method provided (phone or email)`);
        return { 
            responseText: "I need either a phone number or email to book your appointment. Please provide at least one contact method.", 
            responseType: 'text', 
            confidence: 0.8, 
            appointment: null 
        };
    }

    // Pass name to createAppointment
    const contactInfoForBooking = {
        address: state.address,
        phoneNumber: state.phoneNumber,
        name: state.name, // Pass name here
        appointmentReason: state.appointmentReason // Pass reason here
    };

    const availableSlots = await findAvailableSlots(state.requestedDate ?? undefined);
    if (availableSlots.includes(state.selectedSlot)) { // Check if slot is still valid theoretically
        try {
            const appointment = await createAppointment(
                userId, // Use userId passed into the function
                state.selectedSlot,
                contactInfoForBooking,
                state.consultationType
            );
            // No need to delete state here, let the main handler do it
            return {
                responseText: formatAppointmentResponse(appointment),
                responseType: 'appointment',
                confidence: 0.9,
                appointment: appointment
            };
        } catch (dbError) {
            console.error("Database error during appointment creation:", dbError);
             // No need to delete state here, let the main handler do it
            return {
                responseText: "I have your details, but encountered an error trying to book the appointment. Please try again shortly.",
                responseType: 'text',
                confidence: 0.5,
                appointment: null
            };
        }
    } else {
        // Slot might have become unavailable - handle this
        // No need to delete state here, let the main handler do it
        return {
            responseText: `Unfortunately, the slot at ${formatAppointmentTime(state.selectedSlot)} is no longer available. Could you try scheduling again?`,
            responseType: 'text',
            confidence: 0.6,
            appointment: null
        };
    }
    // Should not reach here normally
    // return { responseText: "Booking failed unexpectedly.", responseType:'text', confidence: 0.3, appointment: null };
}

// Define the structure for the CRM update message payload
interface CrmUpdatePayload {
    name?: string;
    phoneNumber?: string;
    address?: string;
    reason?: string;
    // Add other editable fields if necessary
}

// Type guard to check if the input is a CRM update object
function isCrmUpdate(input: any): input is { type: 'crm_update'; payload: CrmUpdatePayload } {
    return input && typeof input === 'object' && input.type === 'crm_update' && typeof input.payload === 'object';
}

// The main CRM agent handler function
export const handleCRM = async (
  conversationId: string,
  userId: string,
  currentUserInput: string | object | null, // Allow object input for updates
  conversationHistory: ConversationTurn[]
): Promise<AgentResponse> => {
    console.log(`Entering handleCRM for conversationId: ${conversationId}`);

    // Initialize or retrieve state for this conversation
    if (!crmState[conversationId]) {
        console.log(`Initializing new CRM state for conversationId: ${conversationId}`);
        crmState[conversationId] = { step: 'idle', conversationId: conversationId };
    } else {
        console.log(`Retrieving existing CRM state for conversationId: ${conversationId}:`, crmState[conversationId]);
    }

    let currentState = crmState[conversationId];
    let nextState = { ...currentState }; // Clone state for modification
    let responseText = '';
    let responseType: AgentResponse['type'] = 'text'; // Default response type
    let responseData: any = {}; // Default response data

    // --- Define resetState helper function EARLIER --- START
    const resetState = () => {
        console.log(`Resetting CRM state for conversationId: ${conversationId}`);
        nextState = { step: 'idle', conversationId: conversationId };
        // Don't update crmState[conversationId] here directly, let it be updated at the end
    };
    // --- Define resetState helper function EARLIER --- END

    // --- Check for CRM Update Input --- START
    if (isCrmUpdate(currentUserInput)) {
        console.log(`CRM State: Received CRM update for conversationId: ${conversationId}`, currentUserInput.payload);
        const updates = currentUserInput.payload;
        if (updates.name !== undefined) nextState.name = updates.name;
        if (updates.phoneNumber !== undefined) nextState.phoneNumber = updates.phoneNumber;
        if (updates.address !== undefined) nextState.address = updates.address;
        if (updates.reason !== undefined) nextState.appointmentReason = updates.reason;
        nextState.step = 'awaitingConfirmation';
        currentState = { ...nextState };
        console.log(`CRM State: Updated state after CRM update for ${conversationId}:`, nextState);
        currentUserInput = null;
    } else if (typeof currentUserInput !== 'string' && currentUserInput !== null) {
        console.warn(`CRM State: Received unexpected object input for ${conversationId}:`, currentUserInput);
        responseText = "I received data in an unexpected format. Let's try that again.";
        resetState(); // Now resetState is defined
        currentUserInput = null;
    }
    // --- Check for CRM Update Input --- END

    const lowerMessage = typeof currentUserInput === 'string' ? currentUserInput?.toLowerCase()?.trim() : null;

    try { 
        if (nextState.step !== 'idle' || !responseText) {
          switch (currentState.step) {
            case 'idle':
                 console.log(`CRM State: Idle. Asking for consultation type.`);
                 nextState.step = 'awaitingConsultationType';
                 responseText = 'Would you like to schedule a virtual or an in-person appointment?';
                 break;

            case 'awaitingConsultationType':
                 if (lowerMessage?.includes('virtual') || lowerMessage?.includes('online')) {
                     nextState.consultationType = 'virtual';
                     nextState.step = 'awaitingPhoneNumber';
                     responseText = 'Okay, a virtual appointment. What is your phone number?';
                     console.log(`CRM State: Consultation type set to 'virtual'.`);
                 } else if (lowerMessage?.includes('location') || lowerMessage?.includes('in-person') || lowerMessage?.includes('person')) {
                     nextState.consultationType = 'in-person';
                     nextState.step = 'awaitingAppointmentReason';
                     responseText = 'Okay, an in-person appointment. What is the reason for your appointment? For example:\n1. Solar panel installation consultation\n2. Energy efficiency assessment\n3. Maintenance or repair discussion\nOr provide your own reason.';
                     console.log(`CRM State: Consultation type set to 'in-person'.`);
                 } else {
                     responseText = 'Sorry, I didn\'t understand the appointment type. Could you please say "virtual" or "in-person"?';
                 }
                 break;

            case 'awaitingAppointmentReason':
                 if (currentUserInput && typeof currentUserInput === 'string') {
                     // Check if user entered a number 1-3 corresponding to our example reasons
                     let reason = currentUserInput.trim();
                     // Store the full reason text, not just the number
                     if (reason === '1' || reason === '1.') {
                         reason = 'Solar panel installation consultation';
                     } else if (reason === '2' || reason === '2.') {
                         reason = 'Energy efficiency assessment';
                     } else if (reason === '3' || reason === '3.') {
                         reason = 'Maintenance or repair discussion';
                     }
                     
                     nextState.appointmentReason = reason;
                     nextState.step = 'awaitingPhoneNumber';
                     responseText = `Thank you. The appointment is for: "${reason}". What is your phone number? (Type "skip" if you prefer not to provide one)`;
                     console.log(`CRM State: Appointment reason received - ${reason}`);
                 } else {
                     responseText = 'I didn\'t catch the reason for your appointment. Could you please try again?';
                 }
                 break;

            case 'awaitingPhoneNumber':
                 // Clean input and use a more specific regex test
                 const cleanedInput = typeof currentUserInput === 'string' ? currentUserInput.replace(/[-\s]/g, '') : '';
                 const phoneRegex = /^\+?\d{10,}$/; // At least 10 digits, optional leading +
                 
                 // Check if user wants to skip providing phone number
                 const skipPhoneRegex = /^(skip|no|dont|don't|won't|won t|wont|not|no thanks|i don'?t want to)/i;
                 const isSkippingPhone = typeof currentUserInput === 'string' && skipPhoneRegex.test(currentUserInput);

                 // Check if user has provided email
                 const hasEmail = userId && userId !== 'anonymous';

                 if (phoneRegex.test(cleanedInput)) {
                     nextState.phoneNumber = cleanedInput; // Store the cleaned version
                     nextState.step = 'awaitingName';
                     responseText = `Thank you. Your number is ${nextState.phoneNumber}. What name should I put on the appointment?`;
                     console.log(`CRM State: Phone number received - ${nextState.phoneNumber}`);
                 } else if (isSkippingPhone && hasEmail) {
                     console.log(`CRM State: User skipped providing phone number, but has email: ${userId}`);
                     nextState.phoneNumber = 'Not provided';
                     nextState.step = 'awaitingName';
                     responseText = `That's fine, we'll use your email for contact. What name should I put on the appointment?`;
                 } else if (isSkippingPhone && !hasEmail) {
                     responseText = `I need either a phone number or email to book your appointment. Since you haven't provided an email, please enter a phone number.`;
                     console.log(`CRM State: User tried to skip phone but has no email either`);
                 } else {
                     console.log(`CRM State: Phone number validation failed for input: "${currentUserInput}", cleaned: "${cleanedInput}"`); // Add log
                     // Updated message to clarify format
                     if (hasEmail) {
                         responseText = 'That doesn\'t seem like a valid phone number (needs at least 10 digits, optionally starting with +). You can type "skip" if you prefer to use your email instead.';
                     } else {
                         responseText = 'That doesn\'t seem like a valid phone number (needs at least 10 digits, optionally starting with +). I need either a phone number or email to book your appointment.';
                     }
                 }
                 break;

            case 'awaitingName':
                if (currentUserInput && typeof currentUserInput === 'string') {
                    nextState.name = currentUserInput;
                    console.log(`CRM State: Name received - ${nextState.name}`);
                    if (nextState.consultationType === 'in-person') {
                         nextState.step = 'awaitingAddress';
                         responseText = `Thanks, ${nextState.name}. What is the address for the in-person appointment?`;
                     } else {
                         nextState.step = 'awaitingDateTimePreference';
                         responseText = `Thanks, ${nextState.name}. Do you have a preference for a specific day or time for the virtual appointment?`;
                    }
                 } else {
                     responseText = 'I didn\'t receive a name. What name should the appointment be under?';
                 }
                 break;

             case 'awaitingAddress':
                 if (currentUserInput && typeof currentUserInput === 'string') { 
                     nextState.address = currentUserInput;
                     console.log(`CRM State: Address received - ${currentUserInput}`);
                     nextState.step = 'awaitingDateTimePreference';
                     responseText = 'Thank you. Do you have a preference for a specific day or time for the appointment?';
                 } else {
                     responseText = 'I didn\'t receive an address. Could you please enter your address again?';
                 }
                 break;

            case 'awaitingDateTimePreference':
                 let requestedDate: string | null = null;
                 let timePreference: string | null = null;
                 
                 if (typeof currentUserInput === 'string' && lowerMessage) {
                    console.log(`CRM State: Parsing date/time from user input: "${currentUserInput}"`);
                    
                    // Try to parse the date using our custom function instead of Azure OpenAI
                    requestedDate = parseDateFromInput(currentUserInput);
                    console.log(`CRM State: Parsed date: ${requestedDate || 'None detected'}`);
                    
                    // Instead of using LLM for time preference, we could look for simple patterns
                    if (lowerMessage.includes('morning')) {
                        timePreference = 'morning';
                    } else if (lowerMessage.includes('afternoon')) {
                        timePreference = 'afternoon';
                    } else if (lowerMessage.includes('evening')) {
                        timePreference = 'evening';
                    }
                    
                    if (timePreference) {
                        console.log(`CRM State: Detected time preference - ${timePreference}`);
                    }
                    
                    // Set the state's requestedDate
                    if (requestedDate) {
                        nextState.requestedDate = requestedDate;
                    }
                 } else if (currentUserInput !== null) {
                     console.log("CRM State: No valid text input provided for date/time preference.");
                 }

                 responseText = "Okay, I'm looking for available time slots";
                 if (requestedDate) {
                     responseText += ` for ${format(parseISO(requestedDate), 'PPPP', { locale: enUS })}`;
                 }
                 responseText += "...";

                 try {
                     // Pass the parsed date to findAvailableSlots
                     const slots = await findAvailableSlots(requestedDate ?? undefined);
                     if (slots.length > 0) {
                         nextState.availableSlots = slots;
                         nextState.step = 'awaitingSlotSelection';
                         const formattedSlots = slots.slice(0, 5).map((slotISO, index) => {
                            const formattedDate = formatAppointmentTime(slotISO);
                            return `\n${index + 1}. ${formattedDate}`;
                         });
                         responseText = `I found the following ${formattedSlots.length} options:${formattedSlots.join('')}\nPlease choose the number of the time that works best for you.`;
                         if (slots.length > 5) {
                            responseText += "\n(More options are available if these don't fit.)";
                         }
                     } else {
                         responseText = `Unfortunately, I couldn't find any free slots${requestedDate ? ` on ${format(parseISO(requestedDate), 'PPPP', { locale: enUS })}` : ' for the near future'}. Would another day work for you?`;
                         nextState.step = 'awaitingDateTimePreference';
                     }
  } catch (error) {
                     console.error("Error finding available slots:", error);
                     responseText = "Something went wrong while searching for available times. Apologies for the inconvenience. Let's try again later.";
                     resetState();
                 }
                 break;

            case 'awaitingSlotSelection':
                 const chosenIndex = parseInt(lowerMessage || '', 10) - 1;
                 if (nextState.availableSlots && chosenIndex >= 0 && chosenIndex < nextState.availableSlots.length) {
                     nextState.selectedSlot = nextState.availableSlots[chosenIndex];
                     console.log(`CRM State: User selected slot - ${nextState.selectedSlot}`);
                     // --- TRANSITION TO CONFIRMATION --- START
                     // Instead of generating text, prepare data for confirmation UI
                     nextState.step = 'awaitingConfirmation';
                     responseText = 'Please review the details below.'; // Placeholder text
                     responseType = 'confirmation'; // Removed 'as any'
                     responseData = {
                         details: {
                             name: nextState.name || 'Not provided',
                             phone: nextState.phoneNumber && nextState.phoneNumber !== 'Not provided' 
                                    ? nextState.phoneNumber 
                                    : 'Not provided (optional)',
                             email: userId !== 'anonymous' ? userId : undefined,
                             type: nextState.consultationType,
                             address: nextState.consultationType === 'in-person' ? (nextState.address || 'Not provided') : undefined,
                             reason: nextState.appointmentReason || 'Not specified',
                             time: nextState.selectedSlot ? formatAppointmentTime(nextState.selectedSlot) : 'Time TBD'
                         },
                         prompt: 'Does this look correct?',
                         buttons: ['Yes', 'No', 'Edit']
                     };
                     // --- TRANSITION TO CONFIRMATION --- END
                 } else {
                     responseText = "That's not a valid choice. Could you please enter the number of one of the options?";
                     // Stay in awaitingSlotSelection
                 }
                 break;

            case 'awaitingConfirmation':
                if (currentUserInput === null && responseText === '') {
                     // Re-show confirmation after an edit
                     responseText = 'Please review the updated details below.';
                     responseType = 'confirmation'; // Removed 'as any'
                     responseData = {
                         details: {
                             name: nextState.name || 'Not provided',
                             phone: nextState.phoneNumber && nextState.phoneNumber !== 'Not provided' 
                                    ? nextState.phoneNumber 
                                    : 'Not provided (optional)',
                             email: userId !== 'anonymous' ? userId : undefined,
                             type: nextState.consultationType,
                             address: nextState.consultationType === 'in-person' ? (nextState.address || 'Not provided') : undefined,
                             reason: nextState.appointmentReason || 'Not specified',
                             time: nextState.selectedSlot ? formatAppointmentTime(nextState.selectedSlot) : 'Time TBD'
                         },
                         prompt: 'Does this look correct?',
                         buttons: ['Yes', 'No', 'Edit']
                     };
                 } else if (lowerMessage?.startsWith('yes')) {
                    if (nextState.selectedSlot && nextState.name && nextState.phoneNumber && nextState.consultationType) {
                         console.log(`CRM State: Confirmation received. Attempting to book appointment for ${nextState.name} at ${nextState.selectedSlot}`);
                         try {
                             const bookingResult = await attemptBooking(nextState, userId);
                             if (bookingResult.appointment) {
                                 console.log(`CRM State: Appointment booked successfully - ID: ${bookingResult.appointment.id}`);
                                 nextState.step = 'bookingConfirmed';
                                 responseText = bookingResult.responseText;
                                 responseType = 'appointment'; // Use specific type from booking result
                                 responseData = bookingResult.appointment; // Include appointment data
                                 resetState();
                             } else {
                                 console.error("CRM State: Booking attempt failed.", bookingResult.responseText);
                                 nextState.step = 'bookingFailed';
                                 responseText = bookingResult.responseText;
                                 resetState();
                             }
                         } catch (bookingError) {
                              console.error("Error during booking process:", bookingError);
                              nextState.step = 'bookingFailed';
                              responseText = "Unfortunately, something went wrong while finalizing your appointment. Please try again later or contact us directly.";
                              resetState();
                         }
                    } else {
                         console.error("CRM State Error: Reached confirmation logic with missing state details.");
                         responseText = "There's missing information needed to book the appointment. Let's start over.";
                         resetState();
                    }
                 } else if (lowerMessage?.startsWith('no')) {
                    console.log(`CRM State: User cancelled confirmation.`);
                    responseText = "Okay, I'm cancelling the booking process. Can I help you with anything else?";
                    resetState(); // Reset state as booking is cancelled
                 } else {
                     // If input is not yes/no/edit, re-prompt
                     responseText = 'Please review the details below and respond with Yes, No, or click Edit.';
                     responseType = 'confirmation'; // Removed 'as any'
                     responseData = {
                         details: {
                             name: currentState.name || 'Not provided',
                             phone: currentState.phoneNumber || 'Not provided',
                             email: currentState.email || undefined,
                             type: currentState.consultationType,
                             address: currentState.consultationType === 'in-person' ? (currentState.address || 'Not provided') : undefined,
                             reason: currentState.appointmentReason || 'Not specified',
                             time: currentState.selectedSlot ? formatAppointmentTime(currentState.selectedSlot) : 'Time TBD'
                         },
                         prompt: 'Does this look correct?',
                         buttons: ['Yes', 'No', 'Edit']
                     };
                 }
                 break;

            case 'bookingConfirmed':
                 console.log(`CRM State: Booking already confirmed. ConversationId: ${conversationId}`);
                 responseText = "You already have a confirmed appointment. Can I help with anything else?";
                 // Optionally reset state or transition to a different flow if needed
                 resetState();
                 break;

            case 'bookingFailed':
                 console.log(`CRM State: Booking previously failed. ConversationId: ${conversationId}`);
                 responseText = "There was a problem booking your appointment earlier. Would you like to try again?";
                 resetState(); // Reset to allow retry
                 break;

            default:
                 console.warn(`CRM State: Encountered unknown state '${currentState.step}' for conversationId: ${conversationId}. Resetting.`);
                 responseText = "An unexpected error occurred. Let's start over.";
                 resetState();
                 break;
        }
      }
  } catch (error) {
        console.error(`CRM State Machine Error for conversationId: ${conversationId}:`, error);
        responseText = "An internal error occurred. Apologies for the inconvenience. Let's start over.";
        resetState(); // Reset on any unexpected error
    }

    // Update the state in the global record *after* processing
    crmState[conversationId] = nextState;
    console.log(`Exiting handleCRM for conversationId: ${conversationId}. New state:`, nextState);

    // Construct the response using determined type and data
    const nextAgentType = (nextState.step !== 'idle' && nextState.step !== 'bookingConfirmed' && nextState.step !== 'bookingFailed') ? 'crm' : 'customerSupport';

    return {
        text: responseText,
        type: responseType,
        data: responseData,
        confidence: 0.9,
        nextAgent: nextAgentType
    };
}; 