import express from 'express';
import { getCRMEntries } from '../agents/orchestrationAgent';
import { getAllOffers } from '../agents/proposalAgent';
import { addCalendarAppointment, getAvailableTimeSlotsForDate } from '../agents/intakeAgent';
import { assessmentsContainer, appointmentsContainer } from '../utils/cosmosClient';

const router = express.Router();

// Get all CRM entries
router.get('/entries', async (req, res) => {
  try {
    const entries = await getCRMEntries();
    return res.status(200).json(entries);
  } catch (error) {
    console.error('Error fetching CRM entries:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all offers
router.get('/offers', async (req, res) => {
  try {
    const offers = await getAllOffers();
    return res.status(200).json(offers);
  } catch (error) {
    console.error('Error fetching offers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all assessments
router.get('/assessments', async (req, res) => {
  try {
    const { resources: assessmentItems } = await assessmentsContainer.items.readAll().fetchAll();
    return res.status(200).json(assessmentItems);
  } catch (error) {
    console.error('Error fetching assessments:', error);
    return res.status(500).json({ error: 'Internal server error fetching assessments' });
  }
});

// Get all appointments
router.get('/appointments', async (req, res) => {
  try {
    const querySpec = {
      query: "SELECT * FROM c ORDER BY c.scheduledTime DESC"
    };
    
    const { resources: appointments } = await appointmentsContainer.items.query(querySpec).fetchAll();
    
    // Verrijk de appointments met proposal info waar beschikbaar
    const enrichedAppointments = appointments.map(appointment => {
      return {
        ...appointment,
        // Voeg een proposal indicator toe voor de frontend
        hasProposal: !!appointment.proposalData,
        // Voeg een samenvatting toe van de proposal, indien beschikbaar
        proposalSummary: appointment.proposalData ? 
          `${appointment.proposalData.systemSize}kW - €${appointment.proposalData.estimatedCost.toLocaleString('en-US')}` : 
          undefined
      };
    });
    
    res.json(enrichedAppointments);
  } catch (error) {
    console.error('Error getting appointments:', error);
    res.status(500).json({ error: 'Failed to retrieve appointments' });
  }
});

// Get available time slots for a specific date
router.get('/available-slots', (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ error: 'Date parameter is required in format YYYY-MM-DD' });
    }
    
    const availableSlots = getAvailableTimeSlotsForDate(date);
    return res.status(200).json(availableSlots);
  } catch (error) {
    console.error('Error fetching available slots:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a new appointment from the calendar
router.post('/appointments', async (req, res) => {
  try {
    const { title, start, end, customer, phone, notes, type, conversationId } = req.body;
    
    if (!start || !customer) {
      return res.status(400).json({ error: 'Start time and customer email are required' });
    }
    
    // Convert to format expected by intake agent
    const appointment = await addCalendarAppointment({
      title,
      scheduledTime: new Date(start).toISOString(),
      endTime: new Date(end).toISOString(),
      userEmail: customer,
      phoneNumber: phone,
      notes,
      appointmentType: type || 'virtual',
      conversationId: conversationId || undefined
    });
    
    return res.status(201).json(appointment);
  } catch (error) {
    console.error('Error creating appointment:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 