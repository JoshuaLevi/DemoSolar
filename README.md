# DemoSolar AI Agent System

This is a prototype for a business-oriented AI agent system designed for solar panel installation companies. The system enables customers to interact with different specialized AI agents through a chatbot interface.

## Project Structure

The project is organized as a fullstack JavaScript/TypeScript application:

```
demosolar/
├── frontend/           # React frontend
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── styles/      # CSS files
│   │   └── ...
│   └── ...
└── backend/            # Node.js/Express backend
    ├── src/
    │   ├── agents/      # AI agent modules
    │   ├── routes/      # API routes
    │   ├── models/      # Type definitions
    │   ├── utils/       # Utility functions
    │   └── index.ts     # Server entry point
    └── ...
```

## Features

### Frontend
- **Homepage**: Showcases the solar panel company's services and benefits
- **Chatbot**: Floating chat interface for customer interactions
- **CRM Dashboard**: Admin view of quotes, appointments, and customer interactions
- **Mock Login**: Simple demonstration login (no real authentication)

### Backend
- **AI Agent System**: Routes customer inquiries to specialized agents
  - **Info Agent**: Answers common questions from a FAQ database
  - **Offer Agent**: Generates custom solar panel installation quotes
  - **Intake Agent**: Schedules consultation appointments
- **API Endpoints**:
  - `/api/ask`: Main endpoint for chatbot queries
  - `/api/crm/...`: Endpoints for the CRM dashboard

## Getting Started

### Prerequisites
- Node.js (v14 or later)
- npm or yarn

### Installation

1. Clone the repository
```
git clone https://github.com/JoshuaLevi/Solar-Demo
cd demosolar
```

2. Install dependencies for both frontend and backend
```
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

3. Start the development servers

In one terminal:
```
# Start the backend server
cd backend
npm run dev
```

In another terminal:
```
# Start the frontend server
cd frontend
npm start
```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

### Customer Experience
- Visit the homepage and interact with the chatbot
- Ask questions about solar panels
- Request a quote by specifying how many solar panels you want
- Schedule a consultation appointment

### Admin Dashboard
- Click "Login" in the navbar (any username/password combination works)
- View the CRM dashboard with tabs for:
  - Quotes: See all generated quotes
  - Appointments: View scheduled consultations
  - Interactions: Review all customer conversations

## Development Notes

- The backend uses in-memory storage for this prototype. In a production environment, you would integrate with a database.
- Email functionality is mocked in the `intakeAgent.ts` file. Uncomment and configure the nodemailer code for actual email sending.
- The different agents use simple keyword matching for this prototype. In a real application, you would integrate with more sophisticated NLP/LLM services.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
