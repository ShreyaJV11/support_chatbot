import { Router, Request, Response } from 'express';
import { ChatService } from '../services/ChatService';
import { validate, chatRequestSchema } from '../middleware/validation';
import { rateLimitChat } from '../middleware/rateLimiter';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = Router();
const chatService = new ChatService();

/**
 * POST /api/chat
 * Main chat endpoint - processes user questions
 * This implements the exact API contract specified in requirements
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

      // Process the question through our chat service
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

      // Return response in exact format specified
      res.json(response);

    } catch (error) {
      logger.error('Chat processing error:', error);
      
      // Return error response in specified format
      res.status(500).json({
        response_type: 'ERROR',
        message: 'Sorry, something went wrong on our end. Your request has been escalated to our support team.'
      });
    }
  })
);

/**
 * GET /api/chat/health
 * Health check endpoint for chat service
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
 * Get the initial greeting message
 * Optional query parameter: name
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
 * Get current chat configuration (for debugging/admin)
 */
router.get('/config', 
  asyncHandler(async (req: Request, res: Response) => {
    res.json({
      confidence_threshold: chatService.getConfidenceThreshold(),
      static_messages: {
        initial: "Hi {name}, I'm the MPS Support Assistant. I can help with DOI, Access, Hosting-related queries and other tech queries by generating context understood technical responses. In other cases, I can help raise a salesforce support ticket. How can I help you today?",
        confidence_response: "You are in good hands! I can help you with it",
        escalation: "Thanks for your question. I wasn't able to confidently answer this, but I've raised a support ticket for you. Salesforce case no: {case_id}. Our team will get back to you shortly.",
        error: "Sorry, something went wrong on our end. Your request has been escalated to our support team."
      }
    });
  })
);

export default router;