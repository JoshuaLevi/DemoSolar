import express from 'express';
import cors from 'cors';
import askRoutes from './routes/askRoutes';
import crmRoutes from './routes/crmRoutes';

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', askRoutes);
app.use('/api/crm', crmRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Solar AI Agent System is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 