import express from 'express';
import { getCRMEntries } from '../agents/mainAgent';
import { getAllOffers } from '../agents/offerAgent';
import { getAllAppointments } from '../agents/intakeAgent';

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
    return res.status(200).json(offers);
  } catch (error) {
    console.error('Error fetching offers:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all appointments
router.get('/appointments', (req, res) => {
  try {
    const appointments = getAllAppointments();
    return res.status(200).json(appointments);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 