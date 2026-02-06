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
 */
router.post('/', 
  rateLimitChat,
  validate(chatRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      logger.info('Chat request received', {
        ip: req.ip,
        question_length: req.body.user_question?.length || 0,
        session_id: req.body.user_session_id
      });

      // ✅ Service handles logging and unanswered questions on its own
      const response = await chatService.processQuestion({
        user_question: req.body.user_question,
        user_session_id: req.body.user_session_id,
        user_info: req.body.user_info 
      });

      const processingTime = Date.now() - startTime;
      
      logger.info('Chat response sent', {
        response_type: response.response_type,
        processing_time: processingTime
      });

      res.json(response);

    } catch (error) {
      logger.error('Chat processing error:', error);
      res.status(500).json({
        response_type: 'ERROR',
        message: 'Sorry, something went wrong on our end.'
      });
    }
  })
);

/**
 * GET /api/chat/health
 */
router.get('/health', 
  asyncHandler(async (req: Request, res: Response) => {
    const healthStatus: any = await chatService.healthCheck();
    
    const statusCode = healthStatus.overall_status === 'healthy' ? 200 : 503;
    
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
    const initialMessage = chatService.getInitialMessage();
    
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
        initial: "Hi${namePart}, I'm the MPS Support Assistant. I can help with DOI, Access, Hosting-related queries and other tech queries by generating context understood technical responses. In other cases, I can help raise a salesforce support ticket. To assist you better, please provide your **Name** and **Email** to start the chat.",
        confidence_response: "I can definitely help with that!",
        error: "Something went wrong..."
      }
    });
  })
);

export default router;