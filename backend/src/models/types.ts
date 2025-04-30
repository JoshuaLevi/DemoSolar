// Agent types
export type AgentType = 'orchestration' | 'customerSupport' | 'solarAssessment' | 'proposal' | 'crm' | 'info' | 'offer' | 'intake';

// Response types
export interface AgentResponse {
  text: string;
  type: 'text' | 'offer' | 'appointment' | 'assessment' | 'handoff' | 'confirmation';
  data?: any;
  confidence?: number;
  sources?: string[];
  nextAgent?: AgentType;
}

// CRM Entry type for logging interactions
export interface CRMEntry {
  id: string;
  timestamp: string;
  query: string;
  response: string;
  agentType: AgentType;
  userEmail: string;
  data: any;
  conversationId: string;
}

// Offer type
export interface Offer {
  id: string;
  timestamp: string;
  userEmail: string;
  solarPanelCount: number;
  estimatedCost: number;
  estimatedSavings: number;
  estimatedInstallationTime: string;
  roofType?: string;
  panelType?: string;
  financingOptions?: FinancingOption[];
  systemSize?: number;
  annualProduction?: number;
  assessmentId?: string;
}

// Appointment type
export interface Appointment {
  id: string;
  timestamp: string;
  scheduledTime: string;
  userEmail: string;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed';
  appointmentType: 'virtual' | 'in-person';
  address?: string;
  phoneNumber?: string;
  notes?: string;
  appointmentReason?: string;
}

// Property Assessment type (new)
export interface PropertyAssessment {
  id: string;
  timestamp: string;
  userEmail: string;
  address?: string;
  roofType?: string;
  roofAge?: number;
  averageMonthlyBill?: number;
  squareFootage?: number;
  orientation?: string;
  shadingIssues?: boolean;
  estimatedSystemSize?: number;
  estimatedProduction?: number;
  confidence: number;
  energyUsage?: string;
  conversationId?: string;
}

// User type (new)
export interface User {
  email: string;
  name?: string;
  phoneNumber?: string;
  address?: string;
  leadScore?: number;
  leadStatus?: 'new' | 'qualified' | 'proposal' | 'negotiation' | 'closed';
  notes?: string[];
  conversationHistory?: ConversationTurn[];
  lastContact?: string;
  preferredContactMethod?: string;
  appointments?: string[];
}

// Conversation memory types (new)
export interface ConversationTurn {
  timestamp: string;
  userQuery: string;
  agentResponse: string;
  agentType: AgentType;
  conversationId: string;
}

// Financing option type (new)
export interface FinancingOption {
  type: 'cash' | 'loan' | 'lease' | 'ppa';
  termYears?: number;
  interestRate?: number;
  monthlyPayment?: number;
  downPayment?: number;
  totalCost?: number;
}

// Tool result type (new)
export interface ToolResult {
  toolName: string;
  result: any;
  error?: string;
  timestamp: string;
}

// Knowledge Base document structure from Azure AI Search
export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  category?: string;
  // Add other fields from your index definition if needed
  // embedding?: number[]; // If you were retrieving embeddings

  // Azure Search specific fields (optional, depending on what you select)
  '@search.score'?: number;
  '@search.highlights'?: { [key: string]: string[] };
} 