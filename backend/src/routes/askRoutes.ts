import express from 'express';
// Import the main orchestrator handler
import { handleUserQuery } from '../agents/orchestrationAgent';
// Keep the old direct agent import commented
// import { handleCustomerSupport } from '../agents/customerSupportAgent';

const router = express.Router();

// /api/ask endpoint - Calls Orchestrator, handles both text and object messages
router.post('/ask', async (req, res) => {
  try {
    const { userEmail, conversationId } = req.body;
    let messageInput: string | object;

    // Check if the body contains a 'message' property (standard text query)
    // or if it's a structured object (like CRM update)
    if (req.body && typeof req.body.message === 'string') {
      messageInput = req.body.message;
      console.log(`Received text query for /api/ask: "${messageInput}" (Conversation ID: ${conversationId})`);
    } else if (req.body && typeof req.body === 'object' && req.body.type === 'crm_update') {
      // Assume the entire body is the structured message
      messageInput = req.body;
      console.log(`Received object query for /api/ask: Type=${(messageInput as any).type} (Conversation ID: ${conversationId})`);
    } else {
      // Handle unexpected format
      console.warn('Received ask request with unexpected body format:', req.body);
      return res.status(400).json({ error: 'Invalid message format. Expecting {message: string, ...} or {type: \'crm_update\', ...}.' });
    }

    // Call the Orchestrator handler with either the string or the object
    const response = await handleUserQuery(messageInput, userEmail, conversationId);

    console.log(`Sending response from /api/ask (Orchestrator):`, response);
    return res.status(200).json(response);

  } catch (error: any) {
    console.error('Error in /api/ask route:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return res.status(500).json({ error: errorMessage });
  }
});

export default router; 