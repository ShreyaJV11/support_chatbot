import { Router, Request, Response } from 'express';
import { ChatService } from '../services/ChatService';
import { validate, chatRequestSchema } from '../middleware/validation';
import { rateLimitChat } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import ChatLogModel from '../models/ChatLog';
import UnansweredQuestionModel from '../models/UnansweredQuestion';

const router = Router();
const chatService = new ChatService();

/**
 * POST /api/chat
 * Main chat endpoint - processes user questions
 */
router.post('/', 
  rateLimitChat,
  validate(chatRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      logger.info('Chat request received', {
        ip: req.ip,
        user_agent: req.get('User-Agent'),
        question_length: req.body.user_question.length,
        session_id: req.body.user_session_id
      });

      // 1. Process the question
      const response = await chatService.processQuestion({
        user_question: req.body.user_question,
        user_session_id: req.body.user_session_id
      });

      const processingTime = Date.now() - startTime;
      
      logger.info('Chat response sent', {
        response_type: response.response_type,
        confidence_score: response.confidence_score,
        case_id: response.case_id,
        processing_time: processingTime
      });

      // 2. Return response to user (Don't wait for DB)
      res.json(response);

      // ---------------------------------------------------------
      // 3. BACKGROUND TASKS: LOGGING TO DATABASE
      // ---------------------------------------------------------
      
      // Task A: Save to Chat Logs
      try {
        await ChatLogModel.create({
          user_message: req.body.user_question,
          bot_response: response.message,
          confidence_score: response.confidence_score || 0,
          intent_detected: response.response_type || 'Unknown',
          sentiment: 'Neutral'
        });
        logger.info('📝 Chat logged to DB successfully.');
      } catch (logError) {
        logger.error('❌ Failed to save chat log:', logError);
      }

      // Task B: If Escalated (Collect Info), Save to Unanswered Questions
      // ✅ FIX: "COLLECT_INFO" is the status when bot doesn't know the answer
      if (response.response_type === 'COLLECT_INFO' || response.response_type === 'ERROR') {
        try {
          if (UnansweredQuestionModel && UnansweredQuestionModel.create) {
             // ✅ FIX: 'as any' lagaya taaki TS count/last_asked pe na roye
             await UnansweredQuestionModel.create({
              user_query: req.body.user_question,
              count: 1,
              last_asked: new Date()
            } as any);
            logger.info('📝 Unanswered question saved to DB.');
          }
        } catch (unansweredError) {
          logger.error('❌ Failed to save unanswered question:', unansweredError);
        }
      }

    } catch (error) {
      logger.error('Chat processing error:', error);
      
      res.status(500).json({
        response_type: 'ERROR',
        message: 'Sorry, something went wrong on our end. Your request has been escalated to our support team.'
      });
    }
  })
);

/**
 * GET /api/chat/health
 */
router.get('/health', 
  asyncHandler(async (req: Request, res: Response) => {
    const healthStatus = await chatService.healthCheck();
    
    const statusCode = healthStatus.overall_status === 'healthy' ? 200 : 
                       healthStatus.overall_status === 'degraded' ? 206 : 503;
    
    res.status(statusCode).json({
      status: healthStatus.overall_status,
      timestamp: new Date().toISOString(),
      services: {
        matching_engine: healthStatus.matching_engine,
        salesforce: healthStatus.salesforce
      }
    });
  })
);

/**
 * GET /api/chat/initial-message
 */
router.get('/initial-message', 
  asyncHandler(async (req: Request, res: Response) => {
    const userName = req.query.name as string;
    const initialMessage = chatService.getInitialMessage(userName);
    
    res.json({
      message: initialMessage,
      timestamp: new Date().toISOString()
    });
  })
);

/**
 * GET /api/chat/config
 */
router.get('/config', 
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      confidence_threshold: chatService.getConfidenceThreshold(),
      static_messages: {
        initial: "Hi {name}, I'm the MPS Support Assistant...",
        confidence_response: "You are in good hands! I can help you with it",
        escalation: "Thanks for your question. I wasn't able to confidently answer this...",
        error: "Sorry, something went wrong on our end..."
      }
    });
  })
);

export default router;