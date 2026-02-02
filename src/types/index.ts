// Type definitions for the Enterprise Support Chatbot

export interface KnowledgeBaseEntry {
  id: string;
  primary_question: string;
  alternate_questions: string[];
  answer_text: string;
  category: 'DOI' | 'Access' | 'Hosting';
  confidence_weight: number;
  status: 'active' | 'inactive';
  created_at: Date;
  updated_at: Date;
}

export interface ChatLog {
  id: string;
  timestamp: Date;
  user_question: string;
  matched_kb_id?: string;
  confidence_score?: number;
  response_type: 'ANSWERED' | 'ESCALATED' | 'ERROR';
  salesforce_case_id?: string;
  user_session_id?: string;
  response_text?: string;
  processing_time_ms?: number;
  matched_question?: string; // Added for admin queries
}

export interface UnansweredQuestion {
  id: string;
  user_question: string;
  detected_category?: 'DOI' | 'Access' | 'Hosting' | 'Unknown';
  confidence_score?: number;
  salesforce_case_id: string;
  status: 'open' | 'resolved' | 'converted_to_kb';
  created_at: Date;
  resolved_at?: Date;
  converted_kb_id?: string;
}

export interface AdminAuditLog {
  id: string;
  admin_user: string;
  action_type: string;
  resource_affected?: string;
  resource_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  timestamp: Date;
  ip_address?: string;
  user_agent?: string;
}

// API Request/Response Types
export interface ChatRequest {
  user_question: string;
  user_session_id?: string;
  user_info?: {
    name?: string;
    email?: string;
    organization?: string;
  };
}

export interface ChatResponse {
  response_type: 'ANSWERED' | 'ESCALATED' | 'ERROR' | 'COLLECT_INFO';
  answer?: string;
  message?: string;
  case_id?: string;
  confidence_score?: number;
  info_needed?: ('name' | 'email' | 'organization')[];
}

export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export interface DashboardStats {
  total_questions: number;
  answered_percentage: number;
  escalated_percentage: number;
  top_categories: Array<{
    category: string;
    count: number;
  }>;
  recent_escalations: UnansweredQuestion[];
}

export interface KnowledgeBaseCreateRequest {
  primary_question: string;
  alternate_questions: string[];
  answer_text: string;
  category: 'DOI' | 'Access' | 'Hosting';
  confidence_weight: number;
}

export interface KnowledgeBaseUpdateRequest extends Partial<KnowledgeBaseCreateRequest> {
  status?: 'active' | 'inactive';
}

// Salesforce Integration Types
export interface SalesforceCase {
  Subject: string;
  Description: string;
  Origin: string;
  Priority: string;
  Status: string;
  Type: string;
}

export interface SalesforceResponse {
  id: string;
  success: boolean;
  errors?: string[];
}

// Embedding Service Types
export interface EmbeddingRequest {
  text: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
}

// Configuration Types
export interface AppConfig {
  port: number;
  nodeEnv: string;
  database: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  confidenceThreshold: number;
  embeddingService: {
    url: string;
    apiKey?: string;
  };
  salesforce: {
    instanceUrl: string;
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
    securityToken: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  logging: {
    level: string;
    file: string;
  };
}

// Error Types
export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

// Middleware Types
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// Static Response Messages (as specified)
export const STATIC_MESSAGES = {
  INITIAL: "Hi {name}, I'm the MPS Support Assistant. I can help with DOI, Access, Hosting-related queries and other tech queries by generating context understood technical responses. In other cases, I can help raise a salesforce support ticket. How can I help you today?",
  CONFIDENCE_RESPONSE: "You are in good hands! I can help you with it",
  ESCALATION: "Thanks for your question. I wasn't able to confidently answer this, but I've raised a support ticket for you. Salesforce case no: {case_id}. Our team will get back to you shortly.",
  ESCALATION_WITH_INFO: `Thanks for your question. I wasn't able to confidently answer this, but I've raised a support ticket for you.

**Support Ticket Details:**
• **Name:** {name}
• **Email:** {email}  
• **Organization:** {organization}
• **Case ID:** {case_id}

Our team will get back to you shortly.`,
  COLLECT_INFO: "To create a support ticket for you, I'll need some information. Please provide your name, email, and organization.",
  ERROR: "Sorry, something went wrong on our end. Your request has been escalated to our support team."
} as const;