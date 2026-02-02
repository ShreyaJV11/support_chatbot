// Mock database connection for testing without PostgreSQL
import { logger } from '../utils/logger';

// In-memory storage
const mockData = {
  knowledge_base: [
    {
      id: '1',
      primary_question: 'How do I access my DOI?',
      alternate_questions: ['Where can I find my DOI?', 'DOI access help', 'Cannot access DOI', 'Find my DOI', 'How to access DOI', 'DOI location'],
      answer_text: 'To access your DOI, please log into your account dashboard and navigate to the Publications section. Your DOI will be listed next to each published item.',
      category: 'DOI',
      confidence_weight: 0.95,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: '2',
      primary_question: 'What hosting options are available?',
      alternate_questions: ['Hosting plans', 'Available hosting', 'Hosting services', 'What hosting do you offer', 'Hosting tiers', 'Server options'],
      answer_text: 'We offer three hosting tiers: Basic (shared hosting), Professional (VPS), and Enterprise (dedicated servers). Each tier includes different storage, bandwidth, and support levels.',
      category: 'Hosting',
      confidence_weight: 0.90,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: '3',
      primary_question: 'I cannot access my account',
      alternate_questions: ['Login issues', 'Account access problems', 'Cannot log in', 'How do I login', 'Login help', 'Password problems', 'Account locked'],
      answer_text: 'If you cannot access your account, please try resetting your password using the "Forgot Password" link. If issues persist, contact our support team.',
      category: 'Access',
      confidence_weight: 0.85,
      status: 'active',
      created_at: new Date(),
      updated_at: new Date()
    }
  ],
  chat_logs: [],
  unanswered_questions: [],
  admin_audit_logs: [],
  admins: [
    {
      id: '1',
      email: 'admin@example.com',
      password_hash: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VcSAg/9qm', // admin123
      role: 'super_admin',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]
};

class MockDatabase {
  async query(text: string, params?: any[]): Promise<any> {
    logger.debug('Mock query executed', { text, params });
    
    // Simple query parsing for basic operations
    const lowerText = text.toLowerCase().trim();
    
    if (lowerText.includes('select now()')) {
      return { rows: [{ now: new Date() }] };
    }
    
    if (lowerText.includes('select * from knowledge_base')) {
      return { rows: mockData.knowledge_base.filter(kb => kb.status === 'active') };
    }
    
    if (lowerText.includes('select * from admins')) {
      return { rows: mockData.admins };
    }
    
    if (lowerText.includes('insert into chat_logs')) {
      const newLog = {
        id: Date.now().toString(),
        timestamp: new Date(),
        user_question: params?.[0] || 'test question',
        matched_kb_id: params?.[1] || null,
        confidence_score: params?.[2] || null,
        response_type: params?.[3] || 'ANSWERED',
        salesforce_case_id: params?.[4] || null,
        user_session_id: params?.[5] || null,
        response_text: params?.[6] || null,
        processing_time_ms: params?.[7] || null
      };
      mockData.chat_logs.push(newLog);
      return { rows: [newLog] };
    }
    
    if (lowerText.includes('insert into unanswered_questions')) {
      const newQuestion = {
        id: Date.now().toString(),
        user_question: params?.[0] || 'test question',
        detected_category: params?.[1] || 'Unknown',
        confidence_score: params?.[2] || null,
        salesforce_case_id: params?.[3] || 'SF-' + Date.now(),
        status: 'open',
        created_at: new Date()
      };
      mockData.unanswered_questions.push(newQuestion);
      return { rows: [newQuestion] };
    }
    
    // Default response for other queries
    return { rows: [], rowCount: 0 };
  }

  async getClient() {
    return {
      query: this.query.bind(this),
      release: () => {}
    };
  }

  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    return await callback(client);
  }

  async close(): Promise<void> {
    logger.info('Mock database connection closed');
  }
}

export const db = new MockDatabase();
export default db;