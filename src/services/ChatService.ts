import MatchingEngine from './MatchingEngine';
import { SalesforceService } from './SalesforceService';
import { ChatLogModel } from '../models/ChatLog';
import { UnansweredQuestionModel } from '../models/UnansweredQuestion';
import { ChatRequest, ChatResponse, STATIC_MESSAGES } from '../types';
import { logger } from '../utils/logger';
import pool from '../config/database'; 

const sessionUserMap = new Map<string, {
  name: string;
  email: string;
  organization: string;
}>();

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

    /* --------------------------------------------------
       STEP 1: Restore user from session (FIRST)
    -------------------------------------------------- */
    if (!request.user_info && request.user_session_id) {
      const savedUser = sessionUserMap.get(request.user_session_id);
      if (savedUser) {
        request.user_info = savedUser;
      }
    }

    /* --------------------------------------------------
       STEP 2: Recalculate identity state
    -------------------------------------------------- */
    const hasIdentity =
      Boolean(request.user_info?.name) &&
      Boolean(request.user_info?.email);

    const looksLikeIdentity =
      input.includes(',') && input.includes('@');

    /* --------------------------------------------------
       STEP 3: HARD identity gate
    -------------------------------------------------- */
    if (!hasIdentity && !looksLikeIdentity) {
      return {
        response_type: 'COLLECT_INFO',
        message:
          "To start the conversation, please enter your **Name and Email** in this format:\n\n`Name, email@example.com`",
        info_needed: ['name', 'email']
      };
    }

    /* --------------------------------------------------
      STEP 4: Identity verification
    -------------------------------------------------- */
    if (hasIdentity && looksLikeIdentity) {
      return {
        response_type: 'ANSWERED',
        answer: `You're already verified 😊\n\nHow can I help you today?`,
        confidence_score: 1.0
      };
    }

    if (!hasIdentity && looksLikeIdentity) {
      const parts = input.split(',').map(p => p.trim());
      const email = parts.find(p => p.includes('@'));
      const name = parts[0];

      if (!email || !name) {
        return {
          response_type: 'COLLECT_INFO',
          message:
            "Invalid format. Please enter:\n\n`Name, email@example.com`",
          info_needed: ['name', 'email']
        };
      }

      const org = parts[2] || this.extractOrgFromEmail(email);

      await this.upsertUser(name, email, org);

      const userInfo = { name, email, organization: org };
      request.user_info = userInfo;

      if (request.user_session_id) {
        sessionUserMap.set(request.user_session_id, userInfo);
      }

      return {
        response_type: 'ANSWERED',
        answer:
          `Thanks **${name}**! Your profile is verified (Organization: ${org}).\n\nHow can I help you today?`,
        confidence_score: 1.0
      };
    }


    /* --------------------------------------------------
       STEP 5: Normal chatbot flow
    -------------------------------------------------- */
    const matchResult = await this.matchingEngine.findBestMatch(input);

    if (matchResult.is_confident && matchResult.matched_entry) {
      return await this.handleAnswered(request, matchResult);
    }

    return await this.handleEscalation(request, matchResult);

  } catch (error) {
    logger.error('Error in processQuestion:', error);
    return this.getErrorResponse();
  }
}


  private async handleAnswered(request: ChatRequest, matchResult: any): Promise<ChatResponse> {
    const responseText = `${STATIC_MESSAGES.CONFIDENCE_RESPONSE}\n\n${matchResult.matched_entry.answer_text}`;
    // Log interaction to PostgreSQL
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

  // Logging Logic
  private async logInteraction(req: ChatRequest, r: string, score: number, type: string, caseId?: string) {
    try {
      // const email = req.user_info?.email;
      // let userId = null;

      // // User ID fetch via email
      // if (email) {
      //   const userRes = await pool.query('SELECT id FROM user_info WHERE email = $1', [email]);
      //   userId = userRes.rows[0]?.id || null;
      // }

      // Postgres INSERT - Matching with migrate.ts columns
      // await pool.query(`
      //   INSERT INTO chat_logs (
      //     user_id, 
      //     user_message, 
      //     bot_response, 
      //     confidence_score, 
      //     intent_detected, 
      //     salesforce_case_id
      //   )
      //   VALUES ($1, $2, $3, $4, $5, $6)
      // `, [
      //   userId, 
      //   req.user_question || 'N/A', 
      //   r, 
      //   score, 
      //   type.toUpperCase(), 
      //   caseId || null
      // ]);

      // Pre-existing model logging
      await ChatLogModel.create({ 
        user_message: req.user_question, 
        bot_response: r, 
        confidence_score: score, 
        intent_detected: type, 
        sentiment: 'Neutral' 
      });

      logger.info('✅ Successfully logged to PostgreSQL chat_logs');
      
      if (type === 'Escalation') {
        await UnansweredQuestionModel.create({ user_query: req.user_question });
      }
      
    } catch (e) { 
      logger.error('❌ Critical DB Logging Error:', e); 
    }
  }

  getInitialMessage(name?: string): string {
    const namePart = name ? ` ${name}` : '';
    return `Hi${namePart}, I'm the MPS Support Assistant. I can help with DOI, Access, Hosting-related queries and other tech queries by generating context understood technical responses. In other cases, I can help raise a salesforce support ticket. To assist you better, please provide your **Name** and **Email** to start the chat.`;
  }

  getConfidenceThreshold(): number { return this.matchingEngine.getConfidenceThreshold(); }
  async healthCheck() { return await this.matchingEngine.healthCheck(); }
  private getErrorResponse(): ChatResponse { return { response_type: 'ERROR', message: "Something went wrong." }; }
}

export default ChatService;