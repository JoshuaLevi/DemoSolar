import { AgentResponse, Appointment } from '../models/types';
import nodemailer from 'nodemailer';

// Mock database for appointments
let appointments: Appointment[] = [];

// Helper to generate a mock appointment date
const generateAppointmentTime = (): string => {
  const now = new Date();
  // Set appointment 3-7 days in the future
  const daysToAdd = Math.floor(Math.random() * 5) + 3;
  const appointmentDate = new Date(now.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
  
  // Set appointment between 9 AM and 4 PM
  appointmentDate.setHours(9 + Math.floor(Math.random() * 7), 0, 0, 0);
  
  return appointmentDate.toISOString();
};

// Send confirmation email (mock implementation)
const sendConfirmationEmail = async (appointment: Appointment): Promise<boolean> => {
  // In a real application, you would configure this with actual SMTP settings
  // For now, we'll just log the email that would be sent
  console.log(`[EMAIL MOCK] Sending confirmation email to ${appointment.userEmail}`);
  console.log(`Appointment scheduled for: ${new Date(appointment.scheduledTime).toLocaleString()}`);
  
  /* 
  // Real implementation would look something like this:
  const transporter = nodemailer.createTransport({
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    auth: {
      user: 'your-email@example.com',
      pass: 'your-password'
    }
  });
  
  const info = await transporter.sendMail({
    from: '"Solar Company" <info@solarcompany.com>',
    to: appointment.userEmail,
    subject: "Your Solar Consultation Appointment Confirmation",
    text: `Thank you for scheduling a consultation with us. Your appointment is confirmed for ${new Date(appointment.scheduledTime).toLocaleString()}.`,
    html: `<p>Thank you for scheduling a consultation with us.</p><p><strong>Your appointment is confirmed for ${new Date(appointment.scheduledTime).toLocaleString()}.</strong></p><p>If you need to reschedule, please contact us.</p>`
  });
  */
  
  return true;
};

// Extract address from message if present
const extractAddress = (message: string): string | undefined => {
  // This is a very simple implementation
  // In a real system, you would use NLP to extract structured address data
  const addressMatch = message.match(/at\s+([\w\s,\.]+)/i);
  if (addressMatch && addressMatch[1]) {
    return addressMatch[1].trim();
  }
  return undefined;
};

// Extract phone number if present
const extractPhoneNumber = (message: string): string | undefined => {
  const phoneMatch = message.match(/(\d{3}[-\.\s]??\d{3}[-\.\s]??\d{4}|\(\d{3}\)\s*\d{3}[-\.\s]??\d{4}|\d{10})/g);
  if (phoneMatch && phoneMatch[0]) {
    return phoneMatch[0];
  }
  return undefined;
};

export const handleAppointmentBooking = async (message: string, userEmail?: string): Promise<AgentResponse> => {
  if (!userEmail) {
    return {
      text: "I'd be happy to schedule an appointment for you. Could you please provide your email address so we can send you a confirmation?",
      type: 'text'
    };
  }
  
  const scheduledTime = generateAppointmentTime();
  const address = extractAddress(message);
  const phoneNumber = extractPhoneNumber(message);
  
  // Create the appointment
  const appointment: Appointment = {
    id: `appt-${Date.now()}`,
    timestamp: new Date().toISOString(),
    scheduledTime,
    userEmail,
    address,
    phoneNumber,
    notes: message // Store the original message as notes
  };
  
  // Save the appointment
  appointments.push(appointment);
  
  // Try to send confirmation email
  try {
    await sendConfirmationEmail(appointment);
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
  }
  
  // Format date for display
  const appointmentDate = new Date(scheduledTime);
  const formattedDate = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const responseText = `
Great! I've scheduled a consultation for you on ${formattedDate} at ${formattedTime}.

${userEmail ? `A confirmation email has been sent to ${userEmail}.` : ''}
${address ? `The appointment will take place at ${address}.` : 'One of our consultants will reach out to confirm the location.'}
${phoneNumber ? `We'll contact you at ${phoneNumber} if there are any changes.` : ''}

Is there anything specific you'd like to discuss during the consultation?
`.trim();

  return {
    text: responseText,
    type: 'appointment',
    data: appointment
  };
};

// Export the appointments for the CRM dashboard
export const getAllAppointments = (): Appointment[] => {
  return appointments;
}; 