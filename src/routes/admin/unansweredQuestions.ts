import { Router, Response } from 'express';
import { UnansweredQuestionModel } from '../../models/UnansweredQuestion';
import { KnowledgeBaseModel } from '../../models/KnowledgeBase';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { validate, validateQuery, validateUUID, knowledgeBaseCreateSchema, paginationSchema } from '../../middleware/validation';
import { rateLimitAdmin } from '../../middleware/rateLimiter';
import { asyncHandler, NotFoundError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

const router = Router();

// Apply authentication and rate limiting to all routes
router.use(authenticateToken);
router.use(rateLimitAdmin);

/**
 * GET /admin/unanswered
 * Get all unanswered questions with pagination and filtering
 * This implements the exact "Unanswered Questions" admin screen specified
 */
router.get('/',
  validateQuery(paginationSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { page = 1, limit = 20 } = req.query as any;
    const { status, category } = req.query as any;

    logger.info('Unanswered questions requested', { 
      admin_id: user.id,
      page,
      limit,
      status,
      category
    });

    const offset = (page - 1) * limit;
    const { questions, total } = await UnansweredQuestionModel.findAll(limit, offset);

    // Apply additional filters if specified
    let filteredQuestions = questions;
    if (status) {
      filteredQuestions = questions.filter(q => q.status === status);
    }
    if (category) {
      filteredQuestions = questions.filter(q => q.detected_category === category);
    }

    res.json({
      questions: filteredQuestions.map(q => ({
        id: q.id,
        user_question: q.user_question,
        detected_category: q.detected_category,
        confidence_score: q.confidence_score,
        salesforce_case_id: q.salesforce_case_id,
        status: q.status,
        created_at: q.created_at,
        resolved_at: q.resolved_at,
        converted_kb_id: q.converted_kb_id
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        status,
        category
      }
    });
  })
);

/**
 * GET /admin/unanswered/:id
 * Get a specific unanswered question
 */
router.get('/:id',
  validateUUID('id'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    
    const question = await UnansweredQuestionModel.findById(id);
    if (!question) {
      throw new NotFoundError('Unanswered question not found');
    }

    res.json(question);
  })
);

/**
 * POST /admin/unanswered/:id/convert-to-kb
 * Convert unanswered question to knowledge base entry
 * This implements the exact "Convert to KB" action specified
 */
router.post('/:id/convert-to-kb',
  validateUUID('id'),
  validate(knowledgeBaseCreateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    logger.info('Converting unanswered question to KB', { 
      admin_id: user.id,
      question_id: id 
    });

    // Check if question exists
    const question = await UnansweredQuestionModel.findById(id);
    if (!question) {
      throw new NotFoundError('Unanswered question not found');
    }

    if (question.status !== 'open') {
      return res.status(400).json({
        error: 'Only open questions can be converted to knowledge base entries'
      });
    }

    // Convert to knowledge base entry
    const result = await UnansweredQuestionModel.convertToKnowledgeBase(
      id,
      req.body,
      user.email
    );

    if (!result) {
      throw new NotFoundError('Failed to convert question');
    }

    logger.info('Question converted to KB successfully', {
      admin_id: user.id,
      question_id: id,
      kb_id: result.kbId
    });

    res.json({
      message: 'Question converted to knowledge base entry successfully',
      question: result.question,
      knowledge_base_id: result.kbId
    });
  })
);

/**
 * POST /admin/unanswered/:id/resolve
 * Mark an unanswered question as resolved
 */
router.post('/:id/resolve',
  validateUUID('id'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    logger.info('Resolving unanswered question', { 
      admin_id: user.id,
      question_id: id 
    });

    const updatedQuestion = await UnansweredQuestionModel.updateStatus(
      id, 
      'resolved', 
      user.email
    );

    if (!updatedQuestion) {
      throw new NotFoundError('Unanswered question not found');
    }

    res.json({
      message: 'Question marked as resolved successfully',
      question: updatedQuestion
    });
  })
);

/**
 * POST /admin/unanswered/:id/reopen
 * Reopen a resolved question
 */
router.post('/:id/reopen',
  validateUUID('id'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    logger.info('Reopening unanswered question', { 
      admin_id: user.id,
      question_id: id 
    });

    const updatedQuestion = await UnansweredQuestionModel.updateStatus(
      id, 
      'open', 
      user.email
    );

    if (!updatedQuestion) {
      throw new NotFoundError('Unanswered question not found');
    }

    res.json({
      message: 'Question reopened successfully',
      question: updatedQuestion
    });
  })
);

/**
 * GET /admin/unanswered/stats
 * Get unanswered questions statistics
 */
router.get('/stats',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await UnansweredQuestionModel.getStats();
    res.json(stats);
  })
);

/**
 * GET /admin/unanswered/recent
 * Get recent unanswered questions for dashboard
 */
router.get('/recent',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { limit = 10 } = req.query as any;
    const recentQuestions = await UnansweredQuestionModel.getRecent(parseInt(limit));
    
    res.json({
      questions: recentQuestions,
      count: recentQuestions.length
    });
  })
);

/**
 * POST /admin/unanswered/search
 * Search unanswered questions
 */
router.post('/search',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, limit = 20 } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Search query is required'
      });
    }

    const results = await UnansweredQuestionModel.search(query, limit);

    res.json({
      results,
      total: results.length,
      query
    });
  })
);

/**
 * GET /admin/unanswered/by-status/:status
 * Get unanswered questions by status
 */
router.get('/by-status/:status',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { status } = req.params;
    
    if (!['open', 'resolved', 'converted_to_kb'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: open, resolved, converted_to_kb'
      });
    }

    const questions = await UnansweredQuestionModel.findByStatus(status as any);

    res.json({
      questions,
      status,
      count: questions.length
    });
  })
);

/**
 * GET /admin/unanswered/by-category/:category
 * Get unanswered questions by category
 */
router.get('/by-category/:category',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { category } = req.params;
    
    if (!['DOI', 'Access', 'Hosting', 'Unknown'].includes(category)) {
      return res.status(400).json({
        error: 'Invalid category. Must be one of: DOI, Access, Hosting, Unknown'
      });
    }

    const questions = await UnansweredQuestionModel.findByCategory(category as any);

    res.json({
      questions,
      category,
      count: questions.length
    });
  })
);

export default router;