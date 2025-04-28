import { AgentResponse, Appointment } from '../models/types';
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

  // Extract date
  const datePatterns = [
    /(?:on|for|this|next) (monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
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
        info.date = tomorrow.toLocaleDateString();
      } else if (match[0].toLowerCase().includes('day after tomorrow')) {
        const dayAfter = new Date();
        dayAfter.setDate(dayAfter.getDate() + 2);
        info.date = dayAfter.toLocaleDateString();
      } else if (match[0].toLowerCase().includes('next week')) {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        info.date = nextWeek.toLocaleDateString();
      } else if (match[1]) {
        info.date = match[1];
      }
      break;
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
    info.phone = phoneMatch[1];
  }

  // Extract name (simplistic approach)
  const namePattern = /(?:my name is|this is) ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/i;
  const nameMatch = message.match(namePattern);
  if (nameMatch && nameMatch[1]) {
    info.name = nameMatch[1];
  }

  // Extract location
  const locationPattern = /(?:at|in) ([A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)/i;
  const locationMatch = message.match(locationPattern);
  if (locationMatch && locationMatch[1] && !timePattern.test(locationMatch[1])) {
    info.location = locationMatch[1];
  }

  return info;
};

// Find available time slots for appointments
const getAvailableTimeSlots = (requestedDate?: string): string[] => {
  // Default to tomorrow if no date specified
  const date = requestedDate ? new Date(requestedDate) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  
  // Set the date to start of day to ensure proper comparison
  const requestedDay = new Date(date.setHours(0, 0, 0, 0));
  
  // Available hours (9am to 5pm, 1-hour slots)
  const availableHours = [9, 10, 11, 13, 14, 15, 16, 17];
  
  // Filter out already booked slots
  const bookedTimes = appointments
    .filter(a => {
      const aptDate = new Date(a.scheduledTime);
      return aptDate.toDateString() === requestedDay.toDateString();
    })
    .map(a => new Date(a.scheduledTime).getHours());
  
  // Look for any existing appointments scheduled through the calendar system
  // In a real-world implementation, this would check a database or external calendar API
  
  const availableSlots = availableHours
    .filter(hour => !bookedTimes.includes(hour))
    .map(hour => {
      const slot = new Date(requestedDay);
      slot.setHours(hour, 0, 0, 0);
      return {
        time: `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`,
        hour: hour,
        date: slot.toISOString()
      };
    });
  
  // Convert to formatted strings for display
  return availableSlots.map(slot => slot.time);
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
const getSuggestedAppointmentSlots = (): string[] => {
  const suggestions = [];
  const availableDays = getAvailableDays();
  
  // Get available times for each available day
  for (const day of availableDays) {
    const availableTimes = getAvailableTimeSlots(day.date.toISOString());
    
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

// Schedule an appointment
const scheduleAppointment = (
  userEmail: string,
  date: string,
  time: string,
  info: { name?: string; phone?: string; location?: string }
): Appointment => {
  // Parse date and time strings
  const dateObj = new Date(date);
  
  // Parse time (e.g., "10:00 AM")
  const timeParts = time.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (timeParts) {
    let hours = parseInt(timeParts[1]);
    if (timeParts[3].toLowerCase() === 'pm' && hours < 12) hours += 12;
    if (timeParts[3].toLowerCase() === 'am' && hours === 12) hours = 0;
    
    const minutes = timeParts[2] ? parseInt(timeParts[2]) : 0;
    
    dateObj.setHours(hours, minutes, 0, 0);
  }
  
  // Create appointment
  const appointment: Appointment = {
    id: `appt-${Date.now()}`,
    timestamp: new Date().toISOString(),
    scheduledTime: dateObj.toISOString(),
    userEmail,
    phoneNumber: info.phone,
    address: info.location,
    notes: info.name ? `Customer name: ${info.name}` : undefined,
    appointmentType: 'virtual',
    status: 'scheduled'
  };
  
  appointments.push(appointment);
  return appointment;
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

  return `
Great! I've scheduled your appointment for ${formattedDate} at ${formattedTime}.

Appointment Details:
- Type: Virtual Consultation
- Status: Confirmed
${appointment.phoneNumber ? `- Contact Number: ${appointment.phoneNumber}` : ''}

One of our solar consultants will contact you at the scheduled time. Is there anything specific you'd like to discuss during your consultation?
  `.trim();
};

// Handle appointment booking requests
export const handleAppointmentBooking = async (message: string, userEmail?: string): Promise<AgentResponse> => {
  try {
    // Extract appointment information
    const appointmentInfo = extractAppointmentInfo(message);
    
    // If email is not provided, but we can still provide scheduling info
    if (!userEmail || userEmail === 'anonymous') {
      // Get suggested appointment slots from calendar
      const suggestedSlots = getSuggestedAppointmentSlots();
      const slotsText = suggestedSlots.join('\n• ');
      
      // Generate helpful response with email reminder
      return {
        text: `I'd be happy to schedule a consultation for you. Here are some available time slots in our calendar:\n\n• ${slotsText}\n\nTo confirm your appointment, please choose one of these times and provide your email address.`,
        type: 'text'
      };
    }
    
    // Check if we have enough information
    if (!appointmentInfo.date || !appointmentInfo.time) {
      // Get suggested appointment slots from calendar
      const suggestedSlots = getSuggestedAppointmentSlots();
      const slotsText = suggestedSlots.join('\n• ');
      
      let missingInfo = [];
      if (!appointmentInfo.date) missingInfo.push("preferred date");
      if (!appointmentInfo.time) missingInfo.push("preferred time");
      
      const missingInfoText = missingInfo.join(' and ');
      
      // Generate response using Azure OpenAI if available
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
            type: 'text'
          };
        }
      }
      
      // Fallback response
      return {
        text: `I'd be happy to schedule a consultation for you. Could you please let me know your ${missingInfoText}? Here are some available slots in our calendar:\n\n• ${slotsText}\n\nPlease let me know which time works best for you.`,
        type: 'text'
      };
    }
    
    // Check if the requested slot is actually available
    const requestedDate = new Date(appointmentInfo.date);
    const availableSlots = getAvailableTimeSlots(requestedDate.toISOString());
    const requestedTimeSlot = appointmentInfo.time.toUpperCase();
    
    if (!availableSlots.some(slot => slot.toUpperCase().includes(requestedTimeSlot))) {
      // Get suggested appointment slots from calendar
      const suggestedSlots = getSuggestedAppointmentSlots();
      const slotsText = suggestedSlots.join('\n• ');
      
      return {
        text: `I'm sorry, but the time you requested (${appointmentInfo.time} on ${appointmentInfo.date}) is no longer available. Here are the current available slots in our calendar:\n\n• ${slotsText}\n\nPlease let me know which one of these times works for you.`,
        type: 'text'
      };
    }
    
    // Schedule the appointment
    const appointment = scheduleAppointment(
      userEmail,
      appointmentInfo.date,
      appointmentInfo.time,
      {
        name: appointmentInfo.name,
        phone: appointmentInfo.phone,
        location: appointmentInfo.location
      }
    );
    
    // Format the response
    const responseText = formatAppointmentDetails(appointment);
    
    return {
      text: responseText,
      type: 'appointment',
      data: appointment
    };
  } catch (error) {
    console.error('Error booking appointment:', error);
    
    return {
      text: "I apologize, but I encountered an issue while scheduling your appointment. Could you please try again with the date and time you'd prefer?",
      type: 'text'
    };
  }
};

// Get available time slots for a specific date (for API)
export const getAvailableTimeSlotsForDate = (dateString: string): { time: string; hour: number; available: boolean }[] => {
  const date = new Date(dateString);
  const daySlots = [];
  
  // Available hours (9am to 5pm, 1-hour slots)
  const allHours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  
  // Find booked slots
  const bookedHours = appointments
    .filter(a => {
      const aptDate = new Date(a.scheduledTime);
      return aptDate.toDateString() === date.toDateString();
    })
    .map(a => new Date(a.scheduledTime).getHours());
  
  // Build the list of all slots with availability
  for (const hour of allHours) {
    const slot = new Date(date);
    slot.setHours(hour, 0, 0, 0);
    
    // Skip lunch hour
    if (hour === 12) {
      daySlots.push({
        time: `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`,
        hour,
        available: false
      });
    } else {
      daySlots.push({
        time: `${hour % 12 || 12}:00 ${hour < 12 ? 'AM' : 'PM'}`,
        hour,
        available: !bookedHours.includes(hour)
      });
    }
  }
  
  return daySlots;
};

// Add an appointment from the calendar UI
export const addCalendarAppointment = (appointmentData: {
  title?: string;
  scheduledTime: string;
  endTime?: string;
  userEmail: string;
  phoneNumber?: string;
  notes?: string;
  appointmentType?: string;
}): Appointment => {
  // Create a new appointment
  const appointment: Appointment = {
    id: `appt-${Date.now()}`,
    timestamp: new Date().toISOString(),
    scheduledTime: appointmentData.scheduledTime,
    userEmail: appointmentData.userEmail,
    phoneNumber: appointmentData.phoneNumber,
    notes: appointmentData.notes || appointmentData.title,
    appointmentType: appointmentData.appointmentType as 'virtual' | 'in-person' || 'virtual',
    status: 'scheduled'
  };
  
  // Add to the appointment store
  appointments.push(appointment);
  
  return appointment;
};

// Export the appointments for admin dashboard
export const getAllAppointments = (): Appointment[] => {
  return appointments;
}; 