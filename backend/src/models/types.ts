// Agent types
export type AgentType = 'info' | 'offer' | 'intake';

// Response types
export interface AgentResponse {
  text: string;
  type: 'text' | 'offer' | 'appointment';
  data?: any;
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
}

// Appointment type
export interface Appointment {
  id: string;
  timestamp: string;
  scheduledTime: string;
  userEmail: string;
  address?: string;
  phoneNumber?: string;
  notes?: string;
} 