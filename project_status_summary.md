# DemoSolar AI Agent System - Project Status Summary for AI

## 1. Project Goal and Context

**Objective:** Develop the DemoSolar AI Agent System to reduce the sales cycle and customer acquisition costs for solar installation companies.

**Mechanism:**
- Educate potential customers (Customer Support Agent).
- Provide instant, personalized quotes (Solar Assessment Agent).
- Schedule consultations automatically (Proposal Agent).
- Capture interactions in a CRM (CRM Agent).

**Target Metrics:**
- 60% reduction in lead qualification time.
- 45% decrease in cost per qualified lead.
- 3x improvement in conversion rate (inquiry to appointment).

**Hackathon Strategy:**
- Primary Target: Best Agent in JavaScript/TypeScript.
- Secondary Target: Best Overall Agent.
- Potential Bonus: Best Azure AI Agent Service Usage.

## 2. Planned Architecture: Multi-Agent System

Based on lessons from the "AI Agents for Beginners" course (specifically Lesson 8: Multi-Agent Design Pattern) and the hackathon plan, the system utilizes a multi-agent architecture:

- **Orchestration Agent:** Routes queries to specialized agents.
- **Customer Support Agent:** Handles initial inquiries, provides solar education using Agentic RAG (Lesson 5) and deep knowledge. Aims for personalization and query understanding.
- **Solar Assessment Agent:** Collects property details, performs utility bill analysis (using Azure Document Intelligence - Lesson 4 Tool Use), integrates weather data, and uses planning (Lesson 7) for multi-step assessments.
- **Proposal Agent:** Generates dynamic, customized proposals with visualizations, ROI calculations, and applies metacognitive verification (Lesson 9) for accuracy.
- **CRM Agent:** Manages customer data, performs lead scoring, schedules follow-ups, and provides analytics.

**Agent Communication:** Requires a defined protocol for handoffs between agents.
**Consistency:** A system message framework (Lesson 6) will ensure consistent agent behaviors and personas.
**Framework Choice:** Considering Semantic Kernel (JS/TS) due to the current stack, or potentially Azure AI Agent Service (Lesson 2).

## 3. Key Techniques and Technologies

The project leverages concepts from the "AI Agents for Beginners" course and plans integration with specific Azure services:

**Core AI Concepts:**
- **Agentic Design Patterns (Lesson 3):** Defining agent spaces, interaction times, and core LLM behaviors.
- **Tool Use (Lesson 4):** Integrating external tools (APIs, databases) via function calling. MCP (Lesson 11) is considered for standardization.
- **Agentic RAG (Lesson 5):** Autonomous, iterative retrieval, evaluation, and refinement of information from a knowledge base (Azure AI Search).
- **Trustworthiness (Lesson 6):** System messages, human-in-the-loop (HITL) for critical decisions (e.g., quote approval), evaluation frameworks.
- **Planning (Lesson 7):** Step-by-step, hierarchical, or reflective planning for complex tasks.
- **Multi-Agent Systems (Lesson 8):** Coordination and communication between specialized agents.
- **Metacognition (Lesson 9):** Self-evaluation, verification, and reflection loops for improved accuracy and reduced hallucination.
- **Production Considerations (Lesson 10):** Observability, scalability, security.

**3.1. Continuous Improvement & Learning Loops (Strategy):**
- **Goal:** Enable the agent system to learn and improve from interactions during testing and usage.
- **Approach (Hackathon Scope):**
    - **Comprehensive Logging:** Log conversations, agent decisions, tool usage, outcomes, and feedback to Azure Cosmos DB. This forms the basis for analysis.
    - **Feedback Mechanisms:** Implement *basic* mechanisms. Start with logging task success (implicit) and potentially a simple explicit feedback option (e.g., 👍/👎 logged) if time permits.
    - **Offline Analysis & Refinement:** Use logged data *after* interactions to manually analyze performance, identify weaknesses (e.g., poor RAG results, incorrect tool use), and refine prompts, system messages, or RAG knowledge sources.
    - **Foundation for Automation:** While full automated retraining/refinement is out of scope for the hackathon, the logging and basic feedback lay the groundwork and demonstrate the *potential* for future self-improvement.

**Azure Services (Planned/In Progress):**
- **Azure OpenAI (GPT-4o-mini):** Core LLM (Status: Connected).
- **Azure AI Search:** For Agentic RAG knowledge base (Status: To be implemented).
- **Azure Cosmos DB:** Persistence for conversation history, customer data, quotes, vector embeddings for memory (Status: To be implemented).
- **Azure Document Intelligence:** Utility bill/document processing (Status: To be implemented).
- **Azure Speech Services:** Potential voice interaction (Status: To be implemented).
- **Azure AI Agent Service:** Potential deployment/management framework (Status: Evaluating).

## 4. Current Progress (Based on hackathon-tasks.md)

**Completed:**
- Initial Azure Login (`az login --use-device-code`).
- Connection to Azure OpenAI with GPT-4o-mini.

**In Progress/To Do (High Priority - Architecture & Agents):**
- Implement the specialized agent framework (orchestrator, communication protocol).
- Develop the System Message Framework (templates, generation, personas).
- Build out functionalities for each specialized agent (Customer Support, Solar Assessment, Proposal, CRM) incorporating the AI concepts mentioned above.

**To Do (Priority 2 - Azure Integration):**
- Replace any hardcoded LLM logic with Azure OpenAI calls.
- Implement Cosmos DB for persistence and memory.
- Implement Agentic RAG using Azure AI Search.
- Integrate Azure Document Intelligence.

**To Do (Priority 3 - Advanced Capabilities):**
- Implement Human-in-the-Loop system.
- Implement Metacognition features.
- Enhance Tool Integration (Mapping, Weather APIs, potentially using MCP).
- Improve Chatbot UX (typing indicators, file upload, voice).
- Develop a Comprehensive Agent Evaluation Framework.

**To Do (Priority 4 - Experience & Demo):**
- Create end-to-end user journeys.
- Prepare demo video and scenarios.
- Finalize documentation (architecture, prompts, metrics).

## 5. Summary for AI Assistant

You are assisting in the development of the DemoSolar AI Agent System. The core goal is to automate solar sales processes using a multi-agent architecture (Support, Assessment, Proposal, CRM Agents). We have successfully connected to Azure OpenAI. Key next steps involve building the agent framework, implementing individual agent logic using concepts like Agentic RAG, Tool Use, Planning, and Metacognition, and integrating core Azure services like AI Search, Cosmos DB, and Document Intelligence. Refer to `hackathon-tasks.md` for the detailed checklist and priorities. The knowledge from the "AI Agents for Beginners" course (`knowledge.md`) provides the theoretical foundation for these implementations. Focus on completing the Priority 1 (Agent Architecture) and Priority 2 (Azure Services Integration) tasks, including setting up the **foundational logging and basic RAG/DB integration** needed for potential future learning loops.

## 6. Hackathon Sprint Plan & Progress (Update: Mid-Day 2 - Revised Focus v2)

**Progress So Far (Mid-Day 2):**
- [x] **Azure Cosmos DB Setup:** (Database, `conversations`, `assessments`, `proposals` containers, `cosmosClient.ts`)
- [x] **Azure AI Search Setup:** (Service, `searchClient.ts`, Index, Seeding)
- [x] **Basic RAG Implementation:** (`customerSupportAgent` using keyword search, fallback via Orchestrator)
- [x] **OpenAI Integration:** (Connected, used in Orchestrator, basic proposal generation, CRM lead scoring)
- [x] **Basis Logging:** (Interactions logged to `conversations` container)
- [x] **Agent Framework/Orchestration:** (Minimal orchestrator, agent determination, state/handoff handling)
- [x] **Minimal Agents & Flow:**
  - [x] `handleSolarAssessment` (stateful, writes to `assessments` container)
  - [x] `handleProposal` (Basic generation, writes to `proposals` container)
  - [x] `handleCRM` (Stub, `updateUserProfile` commented out)
  - [x] End-to-end flow tested (Support -> Assess -> Proposal -> CRM Stubs)
- [x] **Frontend Integration:** (`Chatbot.js` handles `conversationId`, basic proposal styling)
- [x] **CRM Dashboard:** (Shows assessments from DB)

**Revised Plan Day 2 Rest/Day 3 (Focus: Core Functionality & Stability):**

**Priority 1: Fix CRM & Implement Booking (Current Focus)**
- [ ] **Fix CRM Agent Type Error:**
    - [ ] Analyze `updateUserProfile` call in `crmAgent.ts` and `User` / `ConversationTurn` types in `types.ts`.
    - [ ] Identify why `conversationHistory` causes a type mismatch (likely missing `conversationId` on turns created *within* `crmAgent`).
    - [ ] Correct the creation/handling of `ConversationTurn` objects within `crmAgent` before passing to `updateUserProfile`.
    - [ ] Re-enable the `updateUserProfile` call.
- [ ] **Implement Basic Appointment Booking:**
    - [ ] Activate intent detection for scheduling in `handleCRM`.
    - [ ] Ensure `findAvailableSlots` and `createAppointment` functions work correctly.
    - [ ] Create `appointments` container in Cosmos DB (**Action Needed by User**).
    - [ ] Modify `createAppointment` to save to the new Cosmos DB container (replace in-memory array).
    - [ ] Update `/api/crm/appointments` endpoint in `crmRoutes.ts` to read from Cosmos DB.
    - [ ] Verify `CRMPage.js` Calendar/Appointments tab displays data correctly from API.

**Priority 2: Core Value & Demo Readiness**
- [ ] **Centralize Offer Data:** Update `/api/crm/offers` endpoint to read from the `proposals` container.
- [ ] **Demo & Documentation (Crucial):**
  - [ ] Prepare Demo Script.
  - [ ] Record Demo Video.
  - [ ] Create/update README.md & Architecture Diagram.

**Priority 3: Stability & Polish**
- [ ] **Fix OpenAI Fallback in Support Agent:** Debug `@azure/openai` import issue, re-enable direct fallback.
- [ ] **Implement Basic Feedback Logging:** Add UI buttons, backend endpoint, log to DB.
- [ ] **Link Data in CRM:** Make `conversationId`/`userEmail` clickable.
- [ ] **Improve Assessment Agent:** Parse initial message.
- [ ] Add **Vector Search** to RAG.
- [ ] UI improvements.

**Key Goal for Day 2/3:** Deliver a compelling demo showcasing a multi-agent system that provides tangible value (assessment, proposal, *booking*), visible to both the user and the employee (via CRM dashboard), supported by solid documentation. Stabilize core functionality (CRM user updates).