import { MatchingEngine } from './MatchingEngine';
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
   * Process a user question and return appropriate response
   * This is the main chat processing function implementing the exact flow specified:
   * 1. Answer ONLY if high-confidence match exists in KB
   * 2. Escalate all low-confidence or unknown questions to Salesforce
   * 3. NEVER generate new answers
   * 4. NEVER guess
   * 5. ALWAYS prefer escalation over uncertainty
   */
  async processQuestion(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();
    
    try {
      logger.info('Processing user question', { 
        question: request.user_question.substring(0, 100) + '...',
        session_id: request.user_session_id,
        has_user_info: !!request.user_info
      });

      // Input validation
      if (!request.user_question || request.user_question.trim().length === 0) {
        return await this.handleError('Empty input', request, startTime);
      }

      if (request.user_question.length > 1000) {
        return await this.handleError('Excessively long input', request, startTime);
      }

      // If user info is provided, this is likely a retry of an escalation
      // Skip matching and go straight to escalation
      if (request.user_info && request.user_info.name && request.user_info.email && request.user_info.organization) {
        logger.info('User info provided - proceeding with escalation', {
          question: request.user_question.substring(0, 50) + '...',
          user_name: request.user_info.name
        });
        
        // Create a mock match result for escalation
        const mockMatchResult = {
          is_confident: false,
          confidence_score: 0.0,
          matched_entry: null
        };
        
        return await this.handleEscalation(request, mockMatchResult, startTime);
      }

      // Step 1: Try to find a high-confidence match
      const matchResult = await this.matchingEngine.findBestMatch(request.user_question.trim());

      if (matchResult.is_confident && matchResult.matched_entry) {
        // HIGH CONFIDENCE → ANSWER
        return await this.handleAnswered(request, matchResult, startTime);
      } else {
        // LOW CONFIDENCE OR NO MATCH → ESCALATE
        return await this.handleEscalation(request, matchResult, startTime);
      }

    } catch (error) {
      logger.error('Error processing question:', error);
      return await this.handleError('System error', request, startTime);
    }
  }

  /**
   * Handle high-confidence matches (ANSWERED response)
   */
  private async handleAnswered(
    request: ChatRequest, 
    matchResult: any, 
    startTime: number
  ): Promise<ChatResponse> {
    try {
      const processingTime = Date.now() - startTime;
      
      // Static response as specified: "You are in good hands! I can help you with it"
      const responseText = `${STATIC_MESSAGES.CONFIDENCE_RESPONSE}\n\n${matchResult.matched_entry.answer_text}`;

      // Log the interaction
      await ChatLogModel.create({
        user_question: request.user_question,
        matched_kb_id: matchResult.matched_entry.id,
        confidence_score: matchResult.confidence_score,
        response_type: 'ANSWERED',
        user_session_id: request.user_session_id,
        response_text: responseText,
        processing_time_ms: processingTime
      });

      logger.info('Question answered successfully', {
        kb_id: matchResult.matched_entry.id,
        confidence: matchResult.confidence_score,
        processing_time: processingTime
      });

      return {
        response_type: 'ANSWERED',
        answer: responseText,
        confidence_score: matchResult.confidence_score
      };

    } catch (error) {
      logger.error('Error handling answered response:', error);
      // Fallback to escalation if logging fails
      return await this.handleEscalation(request, matchResult, Date.now());
    }
  }

  /**
   * Handle low-confidence matches or no matches (ESCALATED response)
   */
  private async handleEscalation(
    request: ChatRequest, 
    matchResult: any, 
    startTime: number
  ): Promise<ChatResponse> {
    try {
      const processingTime = Date.now() - startTime;
      
      // Check if we have user information for escalation
      if (!request.user_info || !request.user_info.name || !request.user_info.email || !request.user_info.organization) {
        // Need to collect user information first
        logger.info('User information needed for escalation', {
          session_id: request.user_session_id,
          has_name: !!request.user_info?.name,
          has_email: !!request.user_info?.email,
          has_org: !!request.user_info?.organization
        });

        return {
          response_type: 'COLLECT_INFO',
          message: STATIC_MESSAGES.COLLECT_INFO,
          info_needed: ['name', 'email', 'organization']
        };
      }

      // Detect category for better Salesforce case organization
      const detectedCategory = this.matchingEngine.detectCategory(request.user_question);

      // Create Salesforce case with user information
      let salesforceCaseId: string;
      try {
        salesforceCaseId = await this.salesforceService.createCase({
          userQuestion: request.user_question,
          detectedCategory,
          confidenceScore: matchResult.confidence_score,
          userName: request.user_info.name,
          userEmail: request.user_info.email,
          userOrganization: request.user_info.organization
        });
      } catch (salesforceError) {
        logger.error('Salesforce case creation failed:', salesforceError);
        // Generate a fallback case ID for user communication
        salesforceCaseId = `SF-${Date.now()}`;
      }

      // Create formatted escalation message with user info
      const escalationMessage = STATIC_MESSAGES.ESCALATION_WITH_INFO
        .replace('{name}', request.user_info.name)
        .replace('{email}', request.user_info.email)
        .replace('{organization}', request.user_info.organization)
        .replace('{case_id}', salesforceCaseId);

      // Log the escalation
      await ChatLogModel.create({
        user_question: request.user_question,
        matched_kb_id: matchResult.matched_entry?.id || null,
        confidence_score: matchResult.confidence_score,
        response_type: 'ESCALATED',
        salesforce_case_id: salesforceCaseId,
        user_session_id: request.user_session_id,
        response_text: escalationMessage,
        processing_time_ms: processingTime
      });

      // Create unanswered question entry for admin review
      await UnansweredQuestionModel.create({
        user_question: request.user_question,
        detected_category: detectedCategory,
        confidence_score: matchResult.confidence_score,
        salesforce_case_id: salesforceCaseId
      });

      logger.info('Question escalated successfully', {
        case_id: salesforceCaseId,
        category: detectedCategory,
        confidence: matchResult.confidence_score,
        processing_time: processingTime,
        user_name: request.user_info.name,
        user_email: request.user_info.email
      });

      return {
        response_type: 'ESCALATED',
        message: escalationMessage,
        case_id: salesforceCaseId
      };

    } catch (error) {
      logger.error('Error handling escalation:', error);
      // Fallback to error response
      return await this.handleError('Escalation failed', request, Date.now());
    }
  }

  /**
   * Handle system errors (ERROR response)
   */
  private async handleError(
    errorType: string, 
    request: ChatRequest, 
    startTime: number
  ): Promise<ChatResponse> {
    try {
      const processingTime = Date.now() - startTime;

      // Log the error interaction
      await ChatLogModel.create({
        user_question: request.user_question,
        response_type: 'ERROR',
        user_session_id: request.user_session_id,
        response_text: STATIC_MESSAGES.ERROR,
        processing_time_ms: processingTime
      });

      logger.warn('Question resulted in error response', {
        error_type: errorType,
        processing_time: processingTime
      });

      // Static error message as specified
      return {
        response_type: 'ERROR',
        message: STATIC_MESSAGES.ERROR
      };

    } catch (loggingError) {
      logger.error('Error logging failed interaction:', loggingError);
      
      // Return error response even if logging fails
      return {
        response_type: 'ERROR',
        message: STATIC_MESSAGES.ERROR
      };
    }
  }

  /**
   * Get initial greeting message
   * This returns the static initial message as specified
   */
  getInitialMessage(userName?: string): string {
    if (userName) {
      return STATIC_MESSAGES.INITIAL.replace('{name}', userName);
    }
    return STATIC_MESSAGES.INITIAL.replace('{name}', 'there');
  }

  /**
   * Health check for the chat service
   */
  async healthCheck(): Promise<{
    matching_engine: any;
    salesforce: boolean;
    overall_status: 'healthy' | 'degraded' | 'unhealthy';
  }> {
    try {
      const [matchingHealth, salesforceHealth] = await Promise.all([
        this.matchingEngine.healthCheck(),
        this.salesforceService.healthCheck()
      ]);

      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (!matchingHealth.embedding_service || !matchingHealth.knowledge_base) {
        overallStatus = 'unhealthy';
      } else if (!salesforceHealth) {
        overallStatus = 'degraded'; // Can still answer questions, but can't escalate
      }

      return {
        matching_engine: matchingHealth,
        salesforce: salesforceHealth,
        overall_status: overallStatus
      };
    } catch (error) {
      logger.error('Health check failed:', error);
      return {
        matching_engine: { embedding_service: false, knowledge_base: false, threshold: 0 },
        salesforce: false,
        overall_status: 'unhealthy'
      };
    }
  }

  /**
   * Update confidence threshold (admin function)
   */
  updateConfidenceThreshold(newThreshold: number): void {
    this.matchingEngine.updateConfidenceThreshold(newThreshold);
  }

  /**
   * Get current confidence threshold
   */
  getConfidenceThreshold(): number {
    return this.matchingEngine.getConfidenceThreshold();
  }
}

export default ChatService;