import { Router, Response } from 'express';
import { ChatLogModel } from '../../models/ChatLog';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { validateQuery, paginationSchema } from '../../middleware/validation';
import { rateLimitAdmin } from '../../middleware/rateLimiter';
import { asyncHandler } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { db } from '../../database/connection';

const router = Router();

// Apply authentication and rate limiting to all routes
router.use(authenticateToken);
router.use(rateLimitAdmin);

/**
 * GET /admin/chat-logs
 * Get all chat logs with pagination and filtering
 * This implements the exact "Chat Logs" admin screen specified
 */
router.get('/',
  validateQuery(paginationSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { page = 1, limit = 50 } = req.query as any;
    const { response_type, start_date, end_date } = req.query as any;

    logger.info('Chat logs requested', { 
      admin_id: user.id,
      page,
      limit,
      response_type,
      start_date,
      end_date
    });

    const offset = (page - 1) * limit;
    let logs;
    let total;

    // Apply filters
    if (response_type) {
      logs = await ChatLogModel.findByResponseType(response_type);
      total = logs.length;
      // Apply pagination manually for filtered results
      logs = logs.slice(offset, offset + limit);
    } else if (start_date && end_date) {
      logs = await ChatLogModel.findByDateRange(new Date(start_date), new Date(end_date));
      total = logs.length;
      logs = logs.slice(offset, offset + limit);
    } else {
      const result = await ChatLogModel.findAll(limit, offset);
      logs = result.logs;
      total = result.total;
    }

    // Format response according to admin screen specifications
    const formattedLogs = logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      user_question: log.user_question,
      response_type: log.response_type,
      confidence_score: log.confidence_score,
      salesforce_case_id: log.salesforce_case_id,
      matched_question: log.matched_question || null,
      processing_time_ms: log.processing_time_ms,
      user_session_id: log.user_session_id
    }));

    res.json({
      logs: formattedLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        response_type,
        start_date,
        end_date
      }
    });
  })
);

/**
 * GET /admin/chat-logs/stats
 * Get chat logs statistics
 */
router.get('/stats',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const stats = await ChatLogModel.getDashboardStats();
    res.json(stats);
  })
);

/**
 * GET /admin/chat-logs/by-type/:type
 * Get chat logs by response type
 */
router.get('/by-type/:type',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { type } = req.params;
    
    if (!['ANSWERED', 'ESCALATED', 'ERROR'].includes(type)) {
      return res.status(400).json({
        error: 'Invalid response type. Must be one of: ANSWERED, ESCALATED, ERROR'
      });
    }

    const logs = await ChatLogModel.findByResponseType(type as any);

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        user_question: log.user_question,
        response_type: log.response_type,
        confidence_score: log.confidence_score,
        salesforce_case_id: log.salesforce_case_id,
        matched_question: log.matched_question || null,
        processing_time_ms: log.processing_time_ms
      })),
      response_type: type,
      count: logs.length
    });
  })
);

/**
 * POST /admin/chat-logs/search
 * Search chat logs by user question
 */
router.post('/search',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { query, limit = 50 } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Search query is required'
      });
    }

    const results = await ChatLogModel.searchByQuestion(query, limit);

    res.json({
      results: results.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        user_question: log.user_question,
        response_type: log.response_type,
        confidence_score: log.confidence_score,
        salesforce_case_id: log.salesforce_case_id,
        matched_question: log.matched_question || null,
        processing_time_ms: log.processing_time_ms
      })),
      total: results.length,
      query
    });
  })
);

/**
 * GET /admin/chat-logs/export
 * Export chat logs as CSV (for reporting)
 */
router.get('/export',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { start_date, end_date, response_type } = req.query as any;

    logger.info('Chat logs export requested', { 
      admin_id: user.id,
      start_date,
      end_date,
      response_type
    });

    let logs;
    if (start_date && end_date) {
      logs = await ChatLogModel.findByDateRange(new Date(start_date), new Date(end_date));
    } else if (response_type) {
      logs = await ChatLogModel.findByResponseType(response_type);
    } else {
      const result = await ChatLogModel.findAll(1000, 0); // Export up to 1000 records
      logs = result.logs;
    }

    // Generate CSV content
    const csvHeader = 'ID,Timestamp,User Question,Response Type,Confidence Score,Salesforce Case ID,Processing Time (ms),Session ID\n';
    const csvRows = logs.map(log => 
      `"${log.id}","${log.timestamp}","${log.user_question.replace(/"/g, '""')}","${log.response_type}","${log.confidence_score || ''}","${log.salesforce_case_id || ''}","${log.processing_time_ms || ''}","${log.user_session_id || ''}"`
    ).join('\n');

    const csvContent = csvHeader + csvRows;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="chat_logs_${new Date().toISOString().split('T')[0]}.csv"`);
    
    res.send(csvContent);
  })
);

/**
 * GET /admin/chat-logs/recent-escalations
 * Get recent escalations for dashboard
 */
router.get('/recent-escalations',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { limit = 10 } = req.query as any;
    const recentEscalations = await ChatLogModel.getRecentEscalations(parseInt(limit));
    
    res.json({
      escalations: recentEscalations.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        user_question: log.user_question,
        salesforce_case_id: log.salesforce_case_id,
        confidence_score: log.confidence_score
      })),
      count: recentEscalations.length
    });
  })
);

/**
 * GET /admin/chat-logs/top-categories
 * Get top categories from chat logs
 */
router.get('/top-categories',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { limit = 5 } = req.query as any;
    const topCategories = await ChatLogModel.getTopCategories(parseInt(limit));
    
    res.json({
      categories: topCategories,
      count: topCategories.length
    });
  })
);

/**
 * GET /admin/chat-logs/performance-metrics
 * Get performance metrics for monitoring
 */
router.get('/performance-metrics',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { days = 7 } = req.query as any;
    
    // Get performance metrics for the specified number of days
    const result = await db.query(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as total_questions,
        COUNT(CASE WHEN response_type = 'ANSWERED' THEN 1 END) as answered,
        COUNT(CASE WHEN response_type = 'ESCALATED' THEN 1 END) as escalated,
        COUNT(CASE WHEN response_type = 'ERROR' THEN 1 END) as errors,
        ROUND(AVG(confidence_score), 4) as avg_confidence,
        ROUND(AVG(processing_time_ms)) as avg_processing_time,
        MIN(processing_time_ms) as min_processing_time,
        MAX(processing_time_ms) as max_processing_time
      FROM chat_logs
      WHERE timestamp >= NOW() - INTERVAL '${parseInt(days)} days'
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);

    res.json({
      metrics: result.rows,
      period_days: parseInt(days)
    });
  })
);

export default router;