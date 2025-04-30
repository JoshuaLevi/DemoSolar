import express, { Request, Response } from 'express';
import { feedbackContainer } from '../utils/cosmosClient';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

interface FeedbackPayload {
  conversationId: string;
  messageIndex?: number; // Optional, depends on frontend implementation
  userQuery: string;
  agentResponse: string;
  feedbackType: 'helpful' | 'not_helpful' | 'inaccurate' | string; // Allow custom types?
  // Add any other relevant context fields
}

// POST /api/feedback
router.post('/', async (req: Request, res: Response) => {
  const payload = req.body as FeedbackPayload;

  // Basic validation
  if (!payload || !payload.conversationId || !payload.userQuery || !payload.agentResponse || !payload.feedbackType) {
    return res.status(400).json({ message: 'Missing required feedback fields.' });
  }

  try {
    const feedbackItem = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...payload,
    };

    // Save to Cosmos DB (using conversationId as partition key)
    await feedbackContainer.items.create(feedbackItem);

    console.log(`Feedback received and stored for conversation ${payload.conversationId}`);
    res.status(201).json({ message: 'Feedback received successfully.' });

  } catch (error) {
    console.error('Error storing feedback:', error);
    res.status(500).json({ message: 'Failed to store feedback.' });
  }
});

export default router; 