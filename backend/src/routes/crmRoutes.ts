import express from 'express';
import { getCRMEntries } from '../agents/mainAgent';
import { getAllOffers } from '../agents/offerAgent';
import { addCalendarAppointment, getAvailableTimeSlotsForDate } from '../agents/intakeAgent';
import { assessmentsContainer, appointmentsContainer } from '../utils/cosmosClient';

const router = express.Router();

// Get all CRM entries
router.get('/entries', (req, res) => {
  try {
    const entries = getCRMEntries();
    return res.status(200).json(entries);
  } catch (error) {
    console.error('Error fetching CRM entries:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all offers
router.get('/offers', (req, res) => {
  try {
    const offers = getAllOffers();
    console.warn("/api/crm/offers endpoint is potentially using in-memory data.");
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
    const { resources: appointmentItems } = await appointmentsContainer.items.readAll().fetchAll();
    return res.status(200).json(appointmentItems);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return res.status(500).json({ error: 'Internal server error fetching appointments' });
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
router.post('/appointments', (req, res) => {
  try {
    const { title, start, end, customer, phone, notes, type } = req.body;
    
    if (!start || !customer) {
      return res.status(400).json({ error: 'Start time and customer email are required' });
    }
    
    // Convert to format expected by intake agent
    const appointment = addCalendarAppointment({
      title,
      scheduledTime: new Date(start).toISOString(),
      endTime: new Date(end).toISOString(),
      userEmail: customer,
      phoneNumber: phone,
      notes,
      appointmentType: type || 'virtual'
    });
    
    return res.status(201).json(appointment);
  } catch (error) {
    console.error('Error creating appointment:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 