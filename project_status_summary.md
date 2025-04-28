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

## 6. Hackathon Sprint Plan & Progress (End of Day 1)

**Progress Day 1 (Actual):**
- [x] **Azure Cosmos DB Setup:**
  - [x] Created Database (`demosolar_db`) and Container (`conversations`).
  - [x] Implemented `cosmosClient.ts` in `backend/src/utils`.
  - [x] Secured Connection String using `.env` file.
- [x] **Azure AI Search Setup:**
  - [x] Created Search Service (`demosolar-ai-search`).
  - [x] Implemented `searchClient.ts` in `backend/src/utils`.
  - [x] Secured Endpoint & Admin Key using `.env` file.
- [x] **Basic RAG Implementation:**
  - [x] Defined Search Index (`demosolar-knowledgebase`) with fields (incl. vector prep).
  - [x] Implemented `searchService.ts` with `ensureIndexExists` and `performKeywordSearch`.
  - [x] Added index creation & sample data seeding on backend startup.
  - [x] Modified `customerSupportAgent.ts` to use `performKeywordSearch` (replacing static FAQ/LLM matching).
  - [x] Added score threshold (`SCORE_THRESHOLD = 1.5`) for relevance checking.
  - [x] Integrated `handleCustomerSupport` into `/api/ask` route.
- [ ] **OpenAI Integration:**
  - [ ] Connected Azure OpenAI (done previously).
  - [-] **Temporarily Disabled Fallback:** Commented out OpenAI client/calls in `customerSupportAgent.ts` due to persistent TS import errors (runtime confirmed working before commenting).
- [ ] **Basis Logging:**
  - [ ] Implement interaction logging to Cosmos DB.
- [ ] **Agent Framework/Orchestration:**
  - [ ] Implement basic Orchestrator Agent.
- [ ] **Other Agents (Minimal):**
  - [ ] Implement minimal Solar Assessment Agent (e.g., simple DB write).
  - [ ] Implement minimal Proposal/CRM Agent stubs.

**Plan Day 2 (Focus: Core Flow & Demo):**
- [ ] **Core Functionality:**
  - [ ] Implement **Basic Logging** to Cosmos DB within `handleCustomerSupport` (carry-over).
  - [ ] Implement **Minimal Orchestrator:** Modify `/api/ask` to call `orchestrationAgent.ts`, which routes to `handleCustomerSupport` (and potentially others later).
  - [ ] Implement **Minimal Solar Assessment Agent:** Create `handleSolarAssessment` that collects 1-2 data points (can be simulated/hardcoded questions for demo) and writes a basic record to a *new* Cosmos DB container (e.g., `assessments`). Add handoff logic in Orchestrator/SupportAgent.
  - [ ] Implement **Minimal Proposal/CRM Agent Stubs:** Create handlers that return simple placeholder text (e.g., "Proposal generated", "Lead logged") to demonstrate the flow. Add handoff logic.
- [ ] **End-to-End Flow:**
  - [ ] Test and refine the flow: Inquiry -> Support (RAG) -> Handoff -> Assessment (DB Write) -> Handoff -> Proposal/CRM Stubs -> Logging.
- [ ] **Demo & Documentation (Crucial):**
  - [ ] Prepare **Demo Script** highlighting multi-agent, RAG, Azure services, business value.
  - [ ] **Record 3-min Demo Video**.
  - [ ] Create/update **README.md** (setup, run instructions, architecture overview - maybe Mermaid diagram).
  - [ ] Create simple **Architecture Diagram**.
- [ ] **Nice-to-Haves (If Time):**
  - [ ] **Fix OpenAI Import Issue:** Debug the `@azure/openai` import problem and re-enable the generative fallback in `customerSupportAgent`.
  - [ ] Implement basic feedback logging (👍/👎 to Cosmos DB).
  - [ ] Add **Vector Search:** Implement embedding generation (on seeding & query) and update search logic.
  - [ ] Basic UI improvements (e.g., typing indicator).
  - [ ] Simple Metacognition (e.g., OpenAI self-critique on RAG result).

**Key Goal for Day 2:** Have a demonstrable end-to-end multi-agent flow using RAG and Cosmos DB, even if some agents are stubs, supported by clear documentation and a compelling video.