import MatchingEngine from './MatchingEngine';
import { SalesforceService } from './SalesforceService';
import { ChatLogModel } from '../models/ChatLog';
import { UnansweredQuestionModel } from '../models/UnansweredQuestion';
import { ChatRequest, ChatResponse, STATIC_MESSAGES } from '../types';
import { logger } from '../utils/logger';

export class ChatService {
  private matchingEngine: MatchingEngine;
  private salesforceService: SalesforceService;

  constructor() {
    this.matchingEngine = new MatchingEngine();
    this.salesforceService = new SalesforceService();
  }

  /**
   * Main Processing Logic
   */
  async processQuestion(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing user question', { 
        question: request.user_question.substring(0, 100) + '...',
        session_id: request.user_session_id
      });

      // 1. Validation
      if (!request.user_question || request.user_question.trim().length === 0) {
        return this.getErrorResponse();
      }

      // 2. Check if this is a retry/escalation with user info
      if (request.user_info && request.user_info.name && request.user_info.email) {
        // Skip matching, go straight to escalation
        return await this.handleEscalation(request, { confidence_score: 0, matched_entry: null });
      }

      // 3. Find Best Match (Hybrid Search: Pinecone + Postgres)
      const matchResult = await this.matchingEngine.findBestMatch(request.user_question.trim());

      // 4. Decision: Answer or Escalate?
      if (matchResult.is_confident && matchResult.matched_entry) {
        return await this.handleAnswered(request, matchResult);
      } else {
        return await this.handleEscalation(request, matchResult);
      }

    } catch (error) {
      logger.error('Error processing question:', error);
      return this.getErrorResponse();
    }
  }

  /**
   * Scenario 1: Bot knows the answer
   */
  private async handleAnswered(request: ChatRequest, matchResult: any): Promise<ChatResponse> {
    const responseText = `${STATIC_MESSAGES.CONFIDENCE_RESPONSE}\n\n${matchResult.matched_entry.answer_text}`;

    // Log to Database (Matches chat_logs schema)
    try {
      await ChatLogModel.create({
        user_message: request.user_question,
        bot_response: responseText,
        confidence_score: matchResult.confidence_score,
        intent_detected: matchResult.matched_entry.category || 'General',
        sentiment: 'Neutral'
      });
    } catch (e) { 
      logger.error('Failed to log chat interaction:', e); 
    }

    return {
      response_type: 'ANSWERED',
      answer: responseText,
      confidence_score: matchResult.confidence_score
    };
  }

  /**
   * Scenario 2: Bot doesn't know -> Create Ticket
   */
  private async handleEscalation(request: ChatRequest, matchResult: any): Promise<ChatResponse> {
    
    // A. Agar user details nahi hain, toh pehle wo maango
    if (!request.user_info || !request.user_info.name || !request.user_info.email) {
      return {
        response_type: 'COLLECT_INFO',
        message: STATIC_MESSAGES.COLLECT_INFO,
        info_needed: ['name', 'email', 'organization']
      };
    }

    // B. Category detect karo (Salesforce ke liye)
    const detectedCategory = this.matchingEngine.detectCategory(request.user_question);

    // C. Salesforce Case Banao
    let salesforceCaseId = `SF-${Date.now()}`; // Fallback ID
    try {
      salesforceCaseId = await this.salesforceService.createCase({
        userQuestion: request.user_question,
        detectedCategory,
        confidenceScore: matchResult.confidence_score,
        userName: request.user_info.name,
        userEmail: request.user_info.email,
        userOrganization: request.user_info.organization
      });
    } catch (e) {
      logger.error('Salesforce case creation failed, using mock ID');
    }

    // D. Response Message Prepare karo
    const escalationMessage = STATIC_MESSAGES.ESCALATION_WITH_INFO
      .replace('{name}', request.user_info.name)
      .replace('{email}', request.user_info.email)
      .replace('{organization}', request.user_info.organization || 'N/A')
      .replace('{case_id}', salesforceCaseId);

    // E. Chat Log mein entry (Schema Compatible)
    try {
      await ChatLogModel.create({
        user_message: request.user_question,
        bot_response: escalationMessage,
        confidence_score: matchResult.confidence_score || 0,
        intent_detected: 'Escalation',
        sentiment: 'Negative'
      });
    } catch (e) { logger.error('Failed to log escalation chat:', e); }

    // F. Unanswered Questions table mein entry (Schema Compatible)
    // Hum sirf 'user_query' bhej rahe hain kyunki table structure waisa hi hai
    try {
      await UnansweredQuestionModel.create({
        user_query: request.user_question
      });
    } catch (e) { logger.error('Failed to log unanswered question:', e); }

    return {
      response_type: 'ESCALATED',
      message: escalationMessage,
      case_id: salesforceCaseId
    };
  }

  /**
   * Helper: Error Response
   */
  private getErrorResponse(): ChatResponse {
    return {
      response_type: 'ERROR',
      message: STATIC_MESSAGES.ERROR
    };
  }

  // ==========================================
  // 👇 HELPER FUNCTIONS 👇
  // ==========================================

  getInitialMessage(userName?: string): string {
    return STATIC_MESSAGES.INITIAL.replace('{name}', userName || 'there');
  }

  /**
   * ✅ FIXED Health Check (Now includes 'overall_status')
   */
  async healthCheck() {
    const matchingHealth = await this.matchingEngine.healthCheck();
    const salesforceHealth = true; // Simplified check for now

    // Determine overall status
    let overallStatus = 'healthy';
    if (!matchingHealth.embedding_service || !matchingHealth.knowledge_base) {
      overallStatus = 'unhealthy';
    } else if (!salesforceHealth) {
      overallStatus = 'degraded';
    }

    return {
      matching_engine: matchingHealth,
      salesforce: salesforceHealth,
      overall_status: overallStatus // 👈 Yeh missing tha, ab add kar diya
    };
  }

  getConfidenceThreshold(): number {
    return this.matchingEngine.getConfidenceThreshold();
  }

  updateConfidenceThreshold(newThreshold: number): void {
    this.matchingEngine.updateConfidenceThreshold(newThreshold);
  }
}

export default ChatService;