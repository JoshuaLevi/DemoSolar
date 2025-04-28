import express from 'express';
// Import the specific agent handler we want to test
import { handleCustomerSupport } from '../agents/customerSupportAgent';
// Keep the old import commented out for now
// import { handleUserQuery } from '../agents/mainAgent';

const router = express.Router();

// /api/ask endpoint - Now directly calls Customer Support Agent
router.post('/ask', async (req, res) => {
  try {
    // Extract message and potentially userEmail and conversationHistory from body
    const { message, userEmail, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`Received query for /api/ask: "${message}"`);

    // Call the Customer Support Agent handler
    // Pass conversationHistory if available (though not used yet in the basic RAG)
    const response = await handleCustomerSupport(message, userEmail, conversationHistory);

    console.log(`Sending response from /api/ask:`, response);
    return res.status(200).json(response);

  } catch (error: any) {
    console.error('Error in /api/ask route:', error);
    // Provide more detailed error response if possible
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

export default router; 