import { Router, Response } from 'express';
import { KnowledgeBaseModel } from '../../models/KnowledgeBase';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { validate, validateQuery, validateUUID, knowledgeBaseCreateSchema, knowledgeBaseUpdateSchema, paginationSchema } from '../../middleware/validation';
import { rateLimitAdmin } from '../../middleware/rateLimiter';
import { asyncHandler, NotFoundError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';

const router = Router();

// Apply authentication and rate limiting to all KB routes
router.use(authenticateToken);
router.use(rateLimitAdmin);

/**
 * GET /admin/kb
 * Get all knowledge base entries with pagination and filtering
 */
router.get('/',
  validateQuery(paginationSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { page = 1, limit = 20 } = req.query as any;
    const { category, status, search } = req.query as any;

    logger.info('Knowledge base entries requested', { 
      admin_id: user.id,
      page,
      limit,
      category,
      status,
      search
    });

    let entries;
    
    if (search) {
      entries = await KnowledgeBaseModel.search(search);
    } else if (category) {
      entries = await KnowledgeBaseModel.findByCategory(category);
    } else {
      entries = await KnowledgeBaseModel.findAll();
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginatedEntries = entries.slice(offset, offset + limit);

    res.json({
      entries: paginatedEntries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: entries.length,
        pages: Math.ceil(entries.length / limit)
      },
      filters: {
        category,
        status,
        search
      }
    });
  })
);

/**
 * GET /admin/kb/:id
 * Get a specific knowledge base entry
 */
router.get('/:id',
  validateUUID('id'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    
    const entry = await KnowledgeBaseModel.findById(id);
    if (!entry) {
      throw new NotFoundError('Knowledge base entry not found');
    }

    res.json(entry);
  })
);

/**
 * POST /admin/kb
 * Create a new knowledge base entry
 */
router.post('/',
  validate(knowledgeBaseCreateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    
    logger.info('Creating knowledge base entry', { 
      admin_id: user.id,
      category: req.body.category 
    });

    const newEntry = await KnowledgeBaseModel.create(req.body, user.email);

    res.status(201).json({
      message: 'Knowledge base entry created successfully',
      entry: newEntry
    });
  })
);

/**
 * PUT /admin/kb/:id
 * Update a knowledge base entry
 */
router.put('/:id',
  validateUUID('id'),
  validate(knowledgeBaseUpdateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    logger.info('Updating knowledge base entry', { 
      admin_id: user.id,
      entry_id: id 
    });

    const updatedEntry = await KnowledgeBaseModel.update(id, req.body, user.email);
    if (!updatedEntry) {
      throw new NotFoundError('Knowledge base entry not found');
    }

    res.json({
      message: 'Knowledge base entry updated successfully',
      entry: updatedEntry
    });
  })
);

/**
 * DELETE /admin/kb/:id
 * Delete (soft delete) a knowledge base entry
 */
router.delete('/:id',
  validateUUID('id'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    logger.info('Deleting knowledge base entry', { 
      admin_id: user.id,
      entry_id: id 
    });

    const deleted = await KnowledgeBaseModel.delete(id, user.email);
    if (!deleted) {
      throw new NotFoundError('Knowledge base entry not found');
    }

    res.json({
      message: 'Knowledge base entry deleted successfully'
    });
  })
);

/**
 * GET /admin/kb/stats
 * Get knowledge base statistics
 */
router.get('/stats',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await KnowledgeBaseModel.getStats();
    res.json(stats);
  })
);

/**
 * POST /admin/kb/search
 * Advanced search in knowledge base
 */
router.post('/search',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, category, limit = 20 } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Search query is required'
      });
    }

    let results;
    if (category) {
      const categoryEntries = await KnowledgeBaseModel.findByCategory(category);
      results = categoryEntries.filter(entry => 
        entry.primary_question.toLowerCase().includes(query.toLowerCase()) ||
        entry.alternate_questions.some(alt => 
          alt.toLowerCase().includes(query.toLowerCase())
        ) ||
        entry.answer_text.toLowerCase().includes(query.toLowerCase())
      );
    } else {
      results = await KnowledgeBaseModel.search(query);
    }

    res.json({
      results: results.slice(0, limit),
      total: results.length,
      query,
      category
    });
  })
);

/**
 * POST /admin/kb/:id/toggle-status
 * Toggle active/inactive status of a knowledge base entry
 */
router.post('/:id/toggle-status',
  validateUUID('id'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { id } = req.params;

    // Get current entry
    const currentEntry = await KnowledgeBaseModel.findById(id);
    if (!currentEntry) {
      throw new NotFoundError('Knowledge base entry not found');
    }

    // Toggle status
    const newStatus = currentEntry.status === 'active' ? 'inactive' : 'active';
    const updatedEntry = await KnowledgeBaseModel.update(
      id, 
      { status: newStatus }, 
      user.email
    );

    logger.info('Knowledge base entry status toggled', {
      admin_id: user.id,
      entry_id: id,
      old_status: currentEntry.status,
      new_status: newStatus
    });

    res.json({
      message: `Knowledge base entry ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully`,
      entry: updatedEntry
    });
  })
);

export default router;