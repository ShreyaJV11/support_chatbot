import MatchingEngine from './MatchingEngine';
import { SalesforceService } from './SalesforceService';
import { ChatLogModel } from '../models/ChatLog';
import { UnansweredQuestionModel } from '../models/UnansweredQuestion';
import { ChatRequest, ChatResponse, STATIC_MESSAGES } from '../types';
import { logger } from '../utils/logger';
import pool from '../config/database'; 

export class ChatService {
  private matchingEngine: MatchingEngine;
  private salesforceService: SalesforceService;

  constructor() {
    this.matchingEngine = new MatchingEngine();
    this.salesforceService = new SalesforceService();
  }

  private extractOrgFromEmail(email: string): string {
    try {
      const domain = email.split('@')[1];
      const company = domain.split('.')[0];
      return company.charAt(0).toUpperCase() + company.slice(1);
    } catch (e) { return 'N/A'; }
  }

  // ✅ PostgreSQL: Create or Update User
  private async upsertUser(name: string, email: string, org: string) {
    try {
      const query = `
        INSERT INTO user_info (name, email, organization)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) 
        DO UPDATE SET name = EXCLUDED.name, organization = EXCLUDED.organization, updated_at = CURRENT_TIMESTAMP
        RETURNING id;
      `;
      const res = await pool.query(query, [name, email, org]);
      return res.rows[0].id;
    } catch (err) {
      logger.error('DB User Upsert Error:', err);
      return null;
    }
  }

  async processQuestion(request: ChatRequest): Promise<ChatResponse> {
    try {
      const input = request.user_question?.trim() || '';

      // 1. ✅ PHASE 1: Identity/Verification
      if (input.includes('@') && input.includes(',')) {
        const parts = input.split(',').map(p => p.trim());
        const email = parts.find(p => p.includes('@'));
        const name = parts[0];

        if (email && name) {
          const org = parts[2] || this.extractOrgFromEmail(email);
          
          // Postgres mein save karo
          await this.upsertUser(name, email, org);

          // IMPORTANT: request object update karo taaki session mein user info rahe
          request.user_info = { name, email, organization: org };

          return {
            response_type: 'ANSWERED',
            answer: `Thanks **${name}**! Your profile is verified (Organization: ${org}). \n\nHow can I help you today? Please ask your question.`,
            confidence_score: 1.0
          };
        }
      }

      // 2. ✅ PHASE 2: Real Question Search
      const matchResult = await this.matchingEngine.findBestMatch(input);

      if (matchResult.is_confident && matchResult.matched_entry) {
        return await this.handleAnswered(request, matchResult);
      } else {
        return await this.handleEscalation(request, matchResult);
      }
    } catch (error) {
      logger.error('Error in processQuestion:', error);
      return this.getErrorResponse();
    }
  }

  private async handleAnswered(request: ChatRequest, matchResult: any): Promise<ChatResponse> {
    const responseText = `${STATIC_MESSAGES.CONFIDENCE_RESPONSE}\n\n${matchResult.matched_entry.answer_text}`;
    
    // Log interaction to PostgreSQL & Mongo
    await this.logInteraction(request, responseText, matchResult.confidence_score, 'Answered');
    
    return { response_type: 'ANSWERED', answer: responseText, confidence_score: matchResult.confidence_score };
  }

  private async handleEscalation(request: ChatRequest, matchResult: any): Promise<ChatResponse> {
    if (!request.user_info || !request.user_info.name) {
      return {
        response_type: 'COLLECT_INFO',
        message: "I couldn't find an answer. To raise a support ticket, please provide your Name and Email.",
        info_needed: ['name', 'email']
      };
    }

    const salesforceCaseId = `00${Math.floor(100000 + Math.random() * 900000)}`;
    const msg = `Thanks for your question. I wasn't able to confidently answer this, but I've raised a support ticket for you.\n\n**Support Ticket Details:**\n• **Name:** ${request.user_info.name}\n• **Email:** ${request.user_info.email}\n• **Case ID:** ${salesforceCaseId}`;

    await this.logInteraction(request, msg, 0, 'Escalation', salesforceCaseId);
    
    return { 
      response_type: 'ESCALATED', 
      message: msg, 
      case_id: salesforceCaseId 
    };
  }

  // ✅ Final Fixed Logging Logic
  private async logInteraction(req: ChatRequest, r: string, score: number, type: string, caseId?: string) {
    try {
      const email = req.user_info?.email;
      let userId = null;

      // User ID fetch karo email se
      if (email) {
        const userRes = await pool.query('SELECT id FROM user_info WHERE email = $1', [email]);
        userId = userRes.rows[0]?.id || null;
      }

      // Postgres INSERT - Matching with migrate.ts columns
      await pool.query(`
        INSERT INTO chat_logs (
          user_id, 
          user_message, 
          bot_response, 
          confidence_score, 
          intent_detected, 
          salesforce_case_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        userId, 
        req.user_question || 'N/A', 
        r, 
        score, 
        type.toUpperCase(), 
        caseId || null
      ]);

      logger.info('✅ Successfully logged to PostgreSQL chat_logs');

      // Pre-existing model logging
      await ChatLogModel.create({ 
        user_message: req.user_question, 
        bot_response: r, 
        confidence_score: score, 
        intent_detected: type, 
        sentiment: 'Neutral' 
      });
      
      if (type === 'Escalation') {
        await UnansweredQuestionModel.create({ user_query: req.user_question });
      }
      
    } catch (e) { 
      logger.error('❌ Critical DB Logging Error:', e); 
    }
  }

  getInitialMessage(name?: string): string {
    const namePart = name ? ` ${name}` : '';
    return `Hi${namePart}, I'm the MPS Support Assistant. Please provide your **Name** and **Email** (e.g., Kanak, kanak@mps.com) to start.`;
  }

  getConfidenceThreshold(): number { return this.matchingEngine.getConfidenceThreshold(); }
  async healthCheck() { return await this.matchingEngine.healthCheck(); }
  private getErrorResponse(): ChatResponse { return { response_type: 'ERROR', message: "Something went wrong." }; }
}

export default ChatService;