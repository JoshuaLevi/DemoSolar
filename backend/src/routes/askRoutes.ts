import express from 'express';
import { handleUserQuery } from '../agents/mainAgent';

const router = express.Router();

// /api/ask endpoint
router.post('/ask', async (req, res) => {
  try {
    const { message, userEmail } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const response = await handleUserQuery(message, userEmail);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error handling user query:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 