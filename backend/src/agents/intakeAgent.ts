// =====================================================
// DEPRECATED: This file is deprecated and will be removed. 
// Please use crmAgent.ts instead.
// Only kept for backward compatibility with mainAgent.ts and crmRoutes.ts.
// =====================================================

import { AgentResponse, Appointment } from '../models/types';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
// Import Cosmos DB client for appointments
import { appointmentsContainer, proposalsContainer } from '../utils/cosmosClient';
import { v4 as uuidv4 } from 'uuid'; // For generating unique IDs

dotenv.config();

// Azure OpenAI configuration
const azureOpenAIKey = process.env.AZURE_OPENAI_API_KEY || '';
const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
const azureOpenAIDeploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '';
const azureOpenAIApiVersion = process.env.AZURE_OPENAI_API_VERSION || '2023-05-15';

// Check if Azure OpenAI is properly configured
const isAzureOpenAIConfigured = !!(azureOpenAIKey && azureOpenAIEndpoint && azureOpenAIDeploymentName);

// --- Remove In-Memory Storage ---
// let appointments: Appointment[] = [];

// Add in-memory cache for recently booked appointments (to prevent race conditions)
interface RecentBooking {
  date: string; // YYYY-MM-DD format
  hour: number;
  timestamp: number; // For cleanup
}

// Cache will hold recent bookings for 60 seconds to prevent double-booking
const recentBookingsCache: RecentBooking[] = [];

// Helper to cleanup old cache entries
const cleanupRecentBookingsCache = () => {
  const now = Date.now();
  // Remove entries older than 60 seconds
  const cacheTimeout = 60 * 1000; // 60 seconds
  
  // Filter out old entries
  const validEntries = recentBookingsCache.filter(entry => 
    (now - entry.timestamp) < cacheTimeout
  );
  
  // Clear the array and add back valid entries
  recentBookingsCache.length = 0;
  recentBookingsCache.push(...validEntries);
};

// Add booking to the cache
const addToRecentBookingsCache = (scheduledTime: string) => {
  try {
    const bookingDate = new Date(scheduledTime);
    const dateStr = bookingDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    const hour = bookingDate.getHours();
    
    recentBookingsCache.push({
      date: dateStr,
      hour,
      timestamp: Date.now()
    });
    
    console.log(`Added to recent bookings cache: ${dateStr} at ${hour}:00`);
    console.log(`Current cache size: ${recentBookingsCache.length}`);
    
    // Cleanup old entries
    cleanupRecentBookingsCache();
  } catch (error) {
    console.error("Error adding to recent bookings cache:", error);
  }
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

// Extract appointment info from user message
const extractAppointmentInfo = (message: string): {
  date?: string;
  time?: string;
  location?: string;
  phone?: string;
  name?: string;
} => {
  const info: {
    date?: string;
    time?: string;
    location?: string;
    phone?: string;
    name?: string;
  } = {};

  const lowerMessage = message.toLowerCase();

  // Extract date
  // First check for exact day names (Monday, Tuesday, etc.)
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const today = new Date();
  const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  for (let i = 0; i < dayNames.length; i++) {
    const dayIndex = i + 1; // Convert to 1 = Monday, 2 = Tuesday, etc.
    if (lowerMessage.includes(dayNames[i])) {
      // Calculate days to add to get to the requested day
      let daysToAdd = dayIndex - currentDay;
      if (daysToAdd <= 0) {
        daysToAdd += 7; // If the day has passed this week, assume next week
      }
      
      const dateObj = new Date();
      dateObj.setDate(today.getDate() + daysToAdd);
      info.date = dateObj.toLocaleDateString(); // Use locale date string for parsing later
      break;
    }
  }

  // If no day name found, try other date patterns
  if (!info.date) {
    const datePatterns = [
      /(?:on|for) (\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
      /(?:on|for) (january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(\d{4}))?/i,
      /(?:tomorrow|day after tomorrow|next week)/i
    ];

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        if (match[0].toLowerCase().includes('tomorrow')) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          info.date = tomorrow.toLocaleDateString(); // Use locale date string for parsing later
        } else if (match[0].toLowerCase().includes('day after tomorrow')) {
          const dayAfter = new Date();
          dayAfter.setDate(dayAfter.getDate() + 2);
          info.date = dayAfter.toLocaleDateString();
        } else if (match[0].toLowerCase().includes('next week')) {
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7);
          info.date = nextWeek.toLocaleDateString();
        } else if (match[1]) {
            // Handle different potential date formats (e.g., MM/DD/YYYY, Month DD, YYYY)
            // This might need more robust date parsing depending on expected inputs
            info.date = match[0].replace(/^(on|for)\s+/i, ''); // Clean up prefix
        }
        break;
      }
    }
  }

  // Extract time
  const timePattern = /(?:at|around) (\d{1,2}(?::\d{2})?\s*(?:am|pm))/i;
  const timeMatch = message.match(timePattern);
  if (timeMatch && timeMatch[1]) {
    info.time = timeMatch[1];
  }

  // Extract phone number
  const phonePattern = /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/i;
  const phoneMatch = message.match(phonePattern);
  if (phoneMatch && phoneMatch[1]) {
    info.phone = phoneMatch[1].replace(/[-.\s]/g, ''); // Normalize phone number
  }

  // Extract name (simplistic approach)
  const namePattern = /(?:my name is|this is) ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i;
  const nameMatch = message.match(namePattern);
  if (nameMatch && nameMatch[1]) {
    info.name = nameMatch[1].trim();
  }

  // Extract location
  const locationPattern = /(?:at|in) ([A-Za-z0-9\s.,#-]+)/i;
  const locationMatch = message.match(locationPattern);
  // Avoid matching times or simple prepositions
  if (locationMatch && locationMatch[1] && 
      !/^(am|pm|\d{1,2}(:\d{2})?)$/i.test(locationMatch[1].trim()) &&
      locationMatch[1].trim().length > 3) { // Basic check for actual location
    info.location = locationMatch[1].trim();
  }

  console.log("Extracted appointment info:", info);
  return info;
};

// Find available time slots for appointments using Cosmos DB
const getAvailableTimeSlots = async (requestedDate?: string): Promise<string[]> => {
  // Default to tomorrow if no date specified
  const date = requestedDate ? new Date(requestedDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  
  // Get date in YYYY-MM-DD format for querying
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const datePrefix = `${year}-${month}-${day}`;
  const dateStr = `${year}-${month}-${day}`;

  // Available hours (9am to 5pm, 1-hour slots)
  const availableHours = [9, 10, 11, 13, 14, 15, 16, 17]; // Skip 12 PM (lunch)

  try {
      // Cleanup the cache before checking
      cleanupRecentBookingsCache();
      
      // Check the cache for recently booked slots
      const recentlyBookedHours = recentBookingsCache
          .filter(entry => entry.date === dateStr)
          .map(entry => entry.hour);
      
      // Query Cosmos DB for appointments starting on the requested date
      const querySpec = {
          query: "SELECT c.scheduledTime FROM c WHERE STARTSWITH(c.scheduledTime, @datePrefix)",
          parameters: [
              { name: "@datePrefix", value: datePrefix }
          ]
      };

      const { resources: bookedAppointments } = await appointmentsContainer.items.query<{ scheduledTime: string }>(querySpec).fetchAll();
      
      // Get both the booked hours and the hours after them (for 1-hour duration)
      const unavailableHours = new Set<number>();
      
      // Add hours from database
      bookedAppointments.forEach(appointment => {
          const appointmentDate = new Date(appointment.scheduledTime);
          const appointmentHour = appointmentDate.getHours();
          
          // Mark the appointment hour as unavailable
          unavailableHours.add(appointmentHour);
          
          // Also mark the next hour as unavailable if it's not past closing time (5 PM)
          if (appointmentHour < 17) {
              unavailableHours.add(appointmentHour + 1);
          }
      });
      
      // Also add recently booked hours from cache to prevent race conditions
      recentlyBookedHours.forEach(hour => {
          unavailableHours.add(hour);
          
          // Also mark the next hour as unavailable
          if (hour < 17) {
              unavailableHours.add(hour + 1);
          }
      });

      console.log(`Date ${datePrefix}: Unavailable hours:`, Array.from(unavailableHours));

      // Filter available hours based on unavailable slots
      const availableSlots = availableHours
          .filter(hour => !unavailableHours.has(hour)) // Only include hours that are not unavailable
          .map(hour => {
              return `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
          });

      return availableSlots;

  } catch (error) {
      console.error(`Error fetching available slots for ${datePrefix} from Cosmos DB:`, error);
      return []; // Return empty array on error
  }
};

// Get available days for appointments in the next week
const getAvailableDays = (): { date: Date; dateString: string }[] => {
  const days = [];
  const today = new Date();
  
  // Check the next 7 days
  for (let i = 1; i <= 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (date.getDay() !== 0 && date.getDay() !== 6) {
      const dateString = date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric'
      });
      
      days.push({ date, dateString });
    }
  }
  
  return days;
};

// Get a list of specific available timeslots for multiple days
const getSuggestedAppointmentSlots = async (): Promise<string[]> => {
  const suggestions = [];
  const availableDays = getAvailableDays();
  
  // Get available times for each available day
  for (const day of availableDays) {
    // Fetch available times from Cosmos DB for this day
    const availableTimes = await getAvailableTimeSlots(day.date.toISOString());
    
    // Only suggest a couple times per day to avoid overwhelming the user
    if (availableTimes.length > 0) {
      // Add morning and afternoon option if available
      const morningTimes = availableTimes.filter(time => time.includes('AM'));
      const afternoonTimes = availableTimes.filter(time => time.includes('PM'));
      
      if (morningTimes.length > 0) {
        suggestions.push(`${day.dateString} at ${morningTimes[0]}`);
      }
      
      if (afternoonTimes.length > 0) {
        suggestions.push(`${day.dateString} at ${afternoonTimes[0]}`);
      }
      
      // Limit to 6 total suggestions
      if (suggestions.length >= 6) {
        break;
      }
    }
  }
  
  return suggestions;
};

// Schedule an appointment and save to Cosmos DB
const scheduleAppointment = async (
  userEmail: string,
  date: string,
  time: string,
  info: { name?: string; phone?: string; location?: string },
  conversationId?: string
): Promise<Appointment> => {
  // Parse date and time strings robustly
  let dateObj: Date;
  try {
      // Attempt to parse common date formats + the locale string from extraction
      dateObj = new Date(date); 
      if (isNaN(dateObj.getTime())) { // Check if parsing failed
          throw new Error('Invalid date format');
      }
  } catch (e) {
      console.error(`Failed to parse date string: ${date}`);
      throw new Error('Could not understand the provided date.');
  }

  // Parse time (e.g., "10:00 AM")
  const timeParts = time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeParts) {
    let hours = parseInt(timeParts[1]);
    if (timeParts[3].toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (timeParts[3].toLowerCase() === 'am' && hours === 12) hours = 0; // Midnight case
    
    const minutes = timeParts[2] ? parseInt(timeParts[2]) : 0;
    
    // Set time on the parsed date object
    dateObj.setHours(hours, minutes, 0, 0);
  } else {
      throw new Error('Could not understand the provided time.');
  }
  
  // Do a final check for availability to prevent race conditions
  const hour = dateObj.getHours();
  const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
  
  // Cleanup the cache and check for conflicts
  cleanupRecentBookingsCache();
  
  // Check if this hour is in the recent bookings cache
  const isRecentlyBooked = recentBookingsCache.some(booking => 
    booking.date === dateStr && booking.hour === hour
  );
  
  if (isRecentlyBooked) {
    throw new Error('This time slot was just booked by someone else. Please choose another time.');
  }
  
  // Generate conversation ID if not provided
  const finalConversationId = conversationId || uuidv4();
  
  // Try to find the latest proposal for this conversation
  let proposalData = undefined;
  if (conversationId) {
    try {
      // Query the latest proposal for this conversation
      const querySpec = {
        query: "SELECT TOP 1 * FROM c WHERE c.conversationId = @conversationId ORDER BY c.timestamp DESC",
        parameters: [
          { name: "@conversationId", value: conversationId }
        ]
      };
      
      const { resources: proposals } = await proposalsContainer.items.query(querySpec).fetchAll();
      const latestProposal = proposals.length > 0 ? proposals[0] : null;
      
      // If a proposal was found, extract its data
      if (latestProposal) {
        proposalData = {
          id: latestProposal.id,
          systemSize: latestProposal.systemSize,
          panelCount: latestProposal.solarPanelCount,
          annualProduction: latestProposal.annualProduction,
          estimatedCost: latestProposal.estimatedCost,
          financingOptions: latestProposal.financingOptions
        };
      }
    } catch (error) {
      console.error(`Error fetching proposal for conversation ${conversationId}:`, error);
      // Continue without proposal data if there's an error
    }
  }
  
  // Create appointment object with unique ID
  const appointment: Appointment = {
    id: `appt-${uuidv4()}`, // Use UUID for uniqueness
    timestamp: new Date().toISOString(),
    scheduledTime: dateObj.toISOString(), // Store as ISO string
    userEmail, // Use userEmail as potential partition key?
    phoneNumber: info.phone,
    address: info.location,
    notes: info.name ? `Customer name: ${info.name}` : undefined,
    appointmentType: 'virtual', // Default or determine based on context/location
    status: 'scheduled',
    conversationId: finalConversationId,
    proposalData // Add proposal data if found
  };
  
  // Add to recent bookings cache immediately to prevent race conditions
  addToRecentBookingsCache(appointment.scheduledTime);
  
  // --- Save to Cosmos DB ---
  try {
      // Partition key could be userEmail or perhaps based on scheduledTime (e.g., YYYY-MM)
      // Let's assume userEmail is the partition key for consistency with users container
      const { resource: createdAppointment } = await appointmentsContainer.items.create(appointment);
      console.log(`Saved appointment ${createdAppointment?.id} to Cosmos DB for user ${userEmail}.`);
      return createdAppointment!; // Return the created appointment
  } catch (dbError) {
      console.error(`Error saving appointment ${appointment.id} to Cosmos DB:`, dbError);
      throw dbError; // Re-throw the error to be caught by the handler
  }
};

// Format appointment details for response
const formatAppointmentDetails = (appointment: Appointment): string => {
  const dateObj = new Date(appointment.scheduledTime);
  const formattedDate = dateObj.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  const formattedTime = dateObj.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true 
  });

  // Include name if available in notes
  const nameMatch = appointment.notes?.match(/Customer name: (.*)/i);
  const customerName = nameMatch ? nameMatch[1] : 'there';

  let responseText = `
Hi ${customerName}, your appointment is confirmed!

**Date:** ${formattedDate}
**Time:** ${formattedTime}
**Type:** ${appointment.appointmentType || 'Virtual Consultation'}
**Status:** ${appointment.status}
${appointment.phoneNumber ? `**Contact:** ${appointment.phoneNumber}` : ''}

One of our solar consultants will be ready for you. Let us know if you need to reschedule!
  `.trim();

  // Add proposal information if available
  if (appointment.proposalData) {
    responseText += `\n\nI've attached your solar proposal to this appointment. Our consultant will discuss your:
- ${appointment.proposalData.systemSize} kW system with ${appointment.proposalData.panelCount} panels
- Estimated annual production of ${appointment.proposalData.annualProduction.toLocaleString()} kWh
- Estimated cost of €${appointment.proposalData.estimatedCost.toLocaleString()}

Our consultant will have all these details ready for your appointment.`;
  }

  return responseText;
};

// Handle appointment booking requests
export const handleAppointmentBooking = async (message: string, userEmail?: string, conversationId?: string): Promise<AgentResponse> => {
  try {
    // Extract appointment information
    const appointmentInfo = extractAppointmentInfo(message);
    const effectiveUserEmail = userEmail || 'anonymous';
    
    // If email is not provided, prompt for it while showing slots
    if (effectiveUserEmail === 'anonymous') {
      const suggestedSlots = await getSuggestedAppointmentSlots(); // Now async
      const slotsText = suggestedSlots.length > 0 ? suggestedSlots.join('\n• ') : 'No upcoming slots found.';
      
      return {
        text: `To book a consultation, I need your email address. Once you provide it, I can show you available times. Currently, we have openings around:\n\n• ${slotsText}\n\nPlease provide your email to proceed.`,
        type: 'text',
        confidence: 0.80,
        reasoning: "Prompting for email before scheduling, showing available slots."
      };
    }
    
    // If user provided a specific date but no time, show available times for that date
    if (appointmentInfo.date && !appointmentInfo.time) {
      try {
        // Parse the specified date
        const requestedDate = new Date(appointmentInfo.date);
        
        if (!isNaN(requestedDate.getTime())) {
          // Query for available slots on that specific date
          const formattedDate = requestedDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            month: 'long', 
            day: 'numeric'
          });
          
          const availableSlots = await getAvailableTimeSlots(requestedDate.toISOString());
          
          if (availableSlots.length === 0) {
            return {
              text: `I see you're interested in booking on ${formattedDate}. Unfortunately, we don't have any available slots on that day. Could you consider one of these alternative times?\n\n• ${(await getSuggestedAppointmentSlots()).join('\n• ')}`,
              type: 'text',
              confidence: 0.85,
              reasoning: "User specified date has no availability, suggesting alternatives."
            };
          }
          
          const slotsText = availableSlots.join('\n• ');
          return {
            text: `Great! For ${formattedDate}, we have the following time slots available:\n\n• ${slotsText}\n\nWhich time would work best for you?`,
            type: 'text',
            confidence: 0.85,
            reasoning: "User specified a date but no time, providing available slots for that date."
          };
        }
      } catch (e) {
        console.error("Error parsing user-specified date:", e);
        // Continue with normal flow if date parsing failed
      }
    }
    
    // Check if we have enough information (date and time)
    if (!appointmentInfo.date || !appointmentInfo.time) {
      const suggestedSlots = await getSuggestedAppointmentSlots(); // Now async
      const slotsText = suggestedSlots.length > 0 ? suggestedSlots.join('\n• ') : 'No upcoming slots found.';
      
      let missingInfo = [];
      if (!appointmentInfo.date) missingInfo.push("preferred date");
      if (!appointmentInfo.time) missingInfo.push("preferred time");
      const missingInfoText = missingInfo.join(' and ');
      
      // Try using Azure OpenAI to formulate a response
      if (isAzureOpenAIConfigured) {
        const systemPrompt = `You are a helpful assistant for a solar company. The customer wants to schedule an appointment but is missing some information. Ask for the missing information politely and provide available time slots.`;
        
        const responseText = await callAzureOpenAI(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Customer message: "${message}"\n\nMissing information: ${missingInfoText}\n\nAvailable time slots: ${suggestedSlots.join(', ')}\n\nCreate a response asking for the missing information and offering available slots.` }
          ],
          { temperature: 0.7, maxTokens: 300 }
        );
        
        if (responseText) {
          return {
            text: responseText,
            type: 'text',
            confidence: 0.65,
            reasoning: "Used Azure OpenAI to respond to an incomplete appointment request."
          };
        }
      }
      
      // Fallback response if OpenAI fails or not configured
      return {
        text: `I need a bit more info to book your appointment. Could you please tell me the ${missingInfoText}? \nWe have availability around these times:\n\n• ${slotsText}\n\nLet me know what works best!`,
        type: 'text',
        confidence: 0.5,
        reasoning: "Could not extract necessary date/time information, providing suggestions."
      };
    }
    
    // Check if the requested slot is actually available using Cosmos DB check
    const requestedDateString = new Date(appointmentInfo.date).toISOString();
    const availableSlots = await getAvailableTimeSlots(requestedDateString);
    const requestedTimeUpper = appointmentInfo.time.toUpperCase(); // Normalize requested time
    
    // More robust check: ensure the exact formatted time exists
    const isAvailable = availableSlots.some(slot => slot.toUpperCase() === requestedTimeUpper);

    if (!isAvailable) {
      const formattedDate = new Date(appointmentInfo.date).toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric'
      });
      
      // Check if there are still available slots on the requested date
      if (availableSlots.length > 0) {
        const slotsText = availableSlots.join('\n• ');
        return {
          text: `Unfortunately, the time slot ${appointmentInfo.time} on ${formattedDate} is not available. However, we do have these other times open on that day:\n\n• ${slotsText}\n\nWould any of these work for you?`,
          type: 'text',
          confidence: 0.9,
          reasoning: "Requested time slot is unavailable, but offering alternatives on the same day."
        };
      } else {
        // No slots available on the requested date, suggest alternatives
        const suggestedSlots = await getSuggestedAppointmentSlots();
        const slotsText = suggestedSlots.length > 0 ? suggestedSlots.join('\n• ') : 'no other slots currently open.';
        return {
          text: `I'm sorry, but we don't have any availability on ${formattedDate}. Here are our next available slots:\n\n• ${slotsText}\n\nWould any of these work for you instead?`,
          type: 'text',
          confidence: 0.9,
          reasoning: "No availability on requested date, offering alternative dates."
        };
      }
    }
    
    try {
      // Schedule the appointment (now async and saves to DB)
      const appointment = await scheduleAppointment(
        effectiveUserEmail,
        appointmentInfo.date,
        appointmentInfo.time,
        {
          name: appointmentInfo.name,
          phone: appointmentInfo.phone,
          location: appointmentInfo.location
        },
        conversationId // Pass conversationId to link proposal with appointment
      );
      
      // Format the confirmation response
      const responseText = formatAppointmentDetails(appointment);
      
      return {
        text: responseText,
        type: 'appointment',
        data: appointment,
        confidence: 0.98,
        reasoning: "Successfully scheduled the appointment and saved to database."
      };
    } catch (error: any) {
      // Handle the specific case of a race condition when the slot was just booked
      if (error.message?.includes('just booked by someone else')) {
        const suggestedSlots = await getSuggestedAppointmentSlots();
        const slotsText = suggestedSlots.length > 0 ? suggestedSlots.join('\n• ') : 'no other slots currently open.';
        
        return {
          text: `I'm sorry, but it looks like someone else just booked that time slot while we were talking! Here are the current available times:\n\n• ${slotsText}\n\nWould any of these work for you?`,
          type: 'text',
          confidence: 0.9,
          reasoning: "Race condition detected, slot was booked by someone else."
        };
      }
      
      // For other errors, rethrow to be caught by the outer catch
      throw error;
    }

  } catch (error: any) { // Catch specific errors or generic any
    console.error('Error booking appointment:', error);
    
    // Provide more specific feedback if possible
    let errorMessage = "I apologize, but I encountered an issue while trying to book your appointment. Could you please try again or contact us directly for assistance?";
    if (error.message?.includes('Could not understand')) {
        errorMessage = `I had trouble understanding the ${error.message.includes('date') ? 'date' : 'time'} you provided. Can you please try formatting it differently (e.g., MM/DD/YYYY or 'Tomorrow at 2 PM')?`;
    } else if (error.code) { // Cosmos DB errors often have a code
        errorMessage = "Sorry, there was a problem saving your appointment. Please try again in a moment.";
    }

    return {
      text: errorMessage,
      type: 'text',
      confidence: 0.4,
      reasoning: `An internal error occurred: ${error.message || 'Unknown error'}`
    };
  }
};

// --- getAvailableTimeSlotsForDate needs update for Cosmos DB ---
export const getAvailableTimeSlotsForDate = async (dateString: string): Promise<{ time: string; hour: number; available: boolean }[]> => {
  const date = new Date(dateString);
  const daySlots = [];
  const allHours = [9, 10, 11, 12, 13, 14, 15, 16, 17]; // Include lunch hour for display

  try {
    // Get date in YYYY-MM-DD format for querying
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const datePrefix = `${year}-${month}-${day}`;
    const dateStr = `${year}-${month}-${day}`;

    // Cleanup the cache before checking
    cleanupRecentBookingsCache();
    
    // Check the cache for recently booked slots
    const recentlyBookedHours = recentBookingsCache
        .filter(entry => entry.date === dateStr)
        .map(entry => entry.hour);

    const querySpec = {
        query: "SELECT c.scheduledTime FROM c WHERE STARTSWITH(c.scheduledTime, @datePrefix)",
        parameters: [
            { name: "@datePrefix", value: datePrefix }
        ]
    };
    const { resources: bookedAppointments } = await appointmentsContainer.items.query<{ scheduledTime: string }>(querySpec).fetchAll();
    
    // Get both the booked hours and the hour after them (for 1-hour duration)
    const unavailableHours = new Set<number>();
    
    // Add hours from database
    bookedAppointments.forEach(appointment => {
        const appointmentDate = new Date(appointment.scheduledTime);
        const appointmentHour = appointmentDate.getHours();
        
        // Mark the appointment hour as unavailable
        unavailableHours.add(appointmentHour);
        
        // Also mark the next hour as unavailable if it's not past closing time (5 PM)
        if (appointmentHour < 17) {
            unavailableHours.add(appointmentHour + 1);
        }
    });
    
    // Also add recently booked hours from cache
    recentlyBookedHours.forEach(hour => {
        unavailableHours.add(hour);
        
        // Also mark the next hour as unavailable
        if (hour < 17) {
            unavailableHours.add(hour + 1);
        }
    });

    // Build the list of all slots with availability
    for (const hour of allHours) {
        daySlots.push({
            time: `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`,
            hour,
            available: hour !== 12 && !unavailableHours.has(hour) // Mark lunch (12) and booked slots as unavailable
        });
    }
    return daySlots;

  } catch (error) {
      console.error(`Error fetching slots for date ${dateString}:`, error);
      // Return all slots as unavailable on error?
      for (const hour of allHours) {
          daySlots.push({
              time: `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`,
              hour,
              available: false
          });
      }
      return daySlots;
  }
};

// --- addCalendarAppointment needs update for Cosmos DB ---
export const addCalendarAppointment = async (appointmentData: {
  title?: string;
  scheduledTime: string;
  endTime?: string;
  userEmail: string;
  phoneNumber?: string;
  address?: string;
  notes?: string;
  appointmentType?: 'virtual' | 'in-person';
  conversationId?: string; // Voeg conversationId als optionele parameter toe
}): Promise<Appointment> => {
  // Parse the scheduled time
  const scheduledTime = new Date(appointmentData.scheduledTime);
  
  // Check for conflicts in the cache
  const dateStr = scheduledTime.toISOString().split('T')[0]; // YYYY-MM-DD format
  const hour = scheduledTime.getHours();
  
  // Cleanup the cache and check for conflicts
  cleanupRecentBookingsCache();
  
  // Check if this hour is in the recent bookings cache
  const isRecentlyBooked = recentBookingsCache.some(booking => 
    booking.date === dateStr && booking.hour === hour
  );
  
  if (isRecentlyBooked) {
    throw new Error('This time slot was just booked by someone else. Please choose another time.');
  }

  // Create a new appointment object
  const appointment: Appointment = {
    id: `appt-${uuidv4()}`,
    timestamp: new Date().toISOString(),
    scheduledTime: appointmentData.scheduledTime,
    userEmail: appointmentData.userEmail,
    phoneNumber: appointmentData.phoneNumber,
    notes: appointmentData.notes || appointmentData.title,
    appointmentType: appointmentData.appointmentType as 'virtual' | 'in-person' || 'virtual',
    status: 'scheduled',
    conversationId: appointmentData.conversationId || uuidv4() // Voeg conversationId toe
  };
  
  // Add to the cache immediately to prevent race conditions
  addToRecentBookingsCache(appointment.scheduledTime);
  
  // --- Save to Cosmos DB ---
   try {
      const { resource: createdAppointment } = await appointmentsContainer.items.create(appointment);
      console.log(`Saved calendar appointment ${createdAppointment?.id} to Cosmos DB.`);
      return createdAppointment!;
  } catch (dbError) {
      console.error(`Error saving calendar appointment ${appointment.id} to Cosmos DB:`, dbError);
      throw dbError; // Re-throw to be handled by caller
  }
};

// Export the appointments for admin dashboard (now queries Cosmos DB)
export const getAllAppointments = async (limit: number = 100): Promise<Appointment[]> => {
  try {
    const querySpec = {
      query: `SELECT * FROM c ORDER BY c.timestamp DESC OFFSET 0 LIMIT @limit`,
      parameters: [
        { name: '@limit', value: limit }
      ]
    };
    const { resources } = await appointmentsContainer.items.query<Appointment>(querySpec).fetchAll();
    return resources;
  } catch (error) {
    console.error('Error fetching appointments from Cosmos DB:', error);
    return [];
  }
}; 