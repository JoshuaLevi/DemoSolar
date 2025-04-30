import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file from backend root *before* other imports that might need it
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import askRoutes from './routes/askRoutes';
import crmRoutes from './routes/crmRoutes';
import { ensureIndexExists, addDocumentsToIndex } from './services/searchService'; // Import search functions
import { container as cosmosContainer } from './utils/cosmosClient'; // Import cosmos client for logging later
import { searchClient } from './utils/searchClient'; // Import search client for RAG later
// import adminRoutes from './routes/adminRoutes'; // Comment out admin routes for now
import feedbackRoutes from './routes/feedbackRoutes'; // Import feedback routes

// Sample data for the knowledge base
const sampleKnowledgeBase = [
  {
    id: "faq-1",
    title: "What are the main benefits of solar panels?",
    content: "The main benefits of solar panels include reducing electricity bills, lowering your carbon footprint, increasing home value, and potentially earning credits from utility companies for excess power generated. Solar energy is a clean, renewable resource.",
    category: "Benefits"
  },
  {
    id: "faq-2",
    title: "How much do solar panels cost?",
    content: "The cost of solar panels varies based on system size, equipment quality, roof characteristics, and location. An average residential system might cost between $15,000 and $25,000 before incentives. We provide personalized quotes.",
    category: "Pricing"
  },
  {
    id: "faq-3",
    title: "How long does the installation process take?",
    content: "The physical installation of solar panels on your roof typically takes 1-3 days. However, the entire process including design, permitting, and utility approval can take several weeks to a few months.",
    category: "Installation"
  },
  {
    id: "faq-4",
    title: "Do solar panels work on cloudy days?",
    content: "Yes, solar panels still generate electricity on cloudy days, although their output is lower than on bright sunny days. They produce power from daylight (photons), not direct sunlight or heat.",
    category: "Technical"
  },
  {
    id: "faq-5",
    title: "What maintenance do solar panels require?",
    content: "Solar panels require very little maintenance. Occasional cleaning might be beneficial in dusty areas or after snowfall. Most systems come with monitoring to detect any performance issues.",
    category: "Maintenance"
  }
];

async function initializeApp() {
  console.log("Initializing application...");

  // Ensure Cosmos DB client is initialized (already done by import, log confirms)
  // You can add a check here if needed, using the exported cosmosClient

  // Ensure Azure AI Search index exists and seed data
  try {
    await ensureIndexExists();
    // Check if index is empty before seeding (optional, prevents re-seeding)
    const searchResults = await searchClient.search("*", { top: 0, includeTotalCount: true });
    if (searchResults.count === 0) {
        console.log("Index is empty, seeding with sample data...");
        await addDocumentsToIndex(sampleKnowledgeBase);
    } else {
        console.log(`Index already contains ${searchResults.count} documents. Skipping seeding.`);
    }

  } catch (error) {
    console.error("Failed to initialize Azure AI Search:", error);
    process.exit(1); // Exit if search setup fails
  }

  const app = express();
  const PORT = process.env.PORT || 5001;

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Routes
  app.use('/api', askRoutes);
  app.use('/api/crm', crmRoutes);
  // app.use('/api/admin', adminRoutes); // Comment out admin routes usage for now
  app.use('/api/feedback', feedbackRoutes); // Use feedback routes

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Solar AI Agent System is running' });
  });

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Start the initialization and server
initializeApp().catch(error => {
    console.error("Application failed to start:", error);
    process.exit(1);
}); 