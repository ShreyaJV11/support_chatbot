import { Router, Response } from 'express';
import { ChatLogModel } from '../../models/ChatLog';
import { UnansweredQuestionModel } from '../../models/UnansweredQuestion';
import { KnowledgeBaseModel } from '../../models/KnowledgeBase';
import { authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { rateLimitAdmin } from '../../middleware/rateLimiter';
import { asyncHandler } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { db } from '../../database/connection';

const router = Router();

// Apply authentication and rate limiting to all dashboard routes
router.use(authenticateToken);
router.use(rateLimitAdmin);

/**
 * GET /admin/dashboard
 * Main dashboard with statistics and overview
 * This implements the exact dashboard requirements specified
 */
router.get('/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    
    logger.info('Dashboard accessed', { admin_id: user.id });

    // Get all dashboard statistics in parallel
    const [
      chatStats,
      topCategories,
      recentEscalations,
      kbStats,
      unansweredStats
    ] = await Promise.all([
      ChatLogModel.getDashboardStats(),
      ChatLogModel.getTopCategories(5),
      ChatLogModel.getRecentEscalations(10),
      KnowledgeBaseModel.getStats(),
      UnansweredQuestionModel.getStats()
    ]);

    // Format response according to specifications
    const dashboardData = {
      // Main metrics
      total_questions: chatStats.total_questions,
      answered_percentage: chatStats.answered_percentage,
      escalated_percentage: chatStats.escalated_percentage,
      error_percentage: ((chatStats.error_count / chatStats.total_questions) * 100) || 0,
      
      // Performance metrics
      avg_confidence_score: chatStats.avg_confidence_score,
      avg_processing_time: chatStats.avg_processing_time,
      
      // Top categories (as specified in requirements)
      top_categories: topCategories,
      
      // Recent escalations (as specified in requirements)
      recent_escalations: recentEscalations.map(escalation => ({
        id: escalation.id,
        user_question: escalation.user_question,
        salesforce_case_id: escalation.salesforce_case_id,
        timestamp: escalation.timestamp,
        confidence_score: escalation.confidence_score
      })),
      
      // Knowledge base overview
      knowledge_base: {
        total_entries: kbStats.total,
        by_category: kbStats.by_category
      },
      
      // Unanswered questions overview
      unanswered_questions: {
        total: unansweredStats.total,
        open: unansweredStats.open,
        resolved: unansweredStats.resolved,
        converted_to_kb: unansweredStats.converted_to_kb,
        by_category: unansweredStats.by_category
      },
      
      // Timestamp
      generated_at: new Date().toISOString()
    };

    res.json(dashboardData);
  })
);

/**
 * GET /admin/dashboard/stats/overview
 * Quick overview stats for dashboard widgets
 */
router.get('/stats/overview',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const [chatStats, kbStats, unansweredStats] = await Promise.all([
      ChatLogModel.getDashboardStats(),
      KnowledgeBaseModel.getStats(),
      UnansweredQuestionModel.getStats()
    ]);

    res.json({
      questions: {
        total: chatStats.total_questions,
        answered: chatStats.answered_count,
        escalated: chatStats.escalated_count,
        errors: chatStats.error_count
      },
      knowledge_base: {
        total: kbStats.total,
        categories: kbStats.by_category.length
      },
      unanswered: {
        open: unansweredStats.open,
        pending_conversion: unansweredStats.open
      },
      performance: {
        answer_rate: chatStats.answered_percentage,
        avg_confidence: chatStats.avg_confidence_score,
        avg_response_time: chatStats.avg_processing_time
      }
    });
  })
);

/**
 * GET /admin/dashboard/stats/trends
 * Trending data for charts (last 30 days)
 */
router.get('/stats/trends',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    // Get daily stats for the last 30 days
    const result = await db.query(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as total_questions,
        COUNT(CASE WHEN response_type = 'ANSWERED' THEN 1 END) as answered,
        COUNT(CASE WHEN response_type = 'ESCALATED' THEN 1 END) as escalated,
        COUNT(CASE WHEN response_type = 'ERROR' THEN 1 END) as errors,
        ROUND(AVG(confidence_score), 4) as avg_confidence,
        ROUND(AVG(processing_time_ms)) as avg_processing_time
      FROM chat_logs
      WHERE timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(timestamp)
      ORDER BY date DESC
    `);

    res.json({
      daily_stats: result.rows,
      period: '30_days'
    });
  })
);

/**
 * GET /admin/dashboard/stats/categories
 * Category breakdown with detailed metrics
 */
router.get('/stats/categories',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await db.query(`
      SELECT 
        kb.category,
        COUNT(cl.*) as total_questions,
        COUNT(CASE WHEN cl.response_type = 'ANSWERED' THEN 1 END) as answered,
        ROUND(AVG(cl.confidence_score), 4) as avg_confidence,
        ROUND(AVG(cl.processing_time_ms)) as avg_processing_time
      FROM chat_logs cl
      JOIN knowledge_base kb ON cl.matched_kb_id = kb.id
      WHERE cl.timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY kb.category
      ORDER BY total_questions DESC
    `);

    res.json({
      category_stats: result.rows,
      period: '30_days'
    });
  })
);

export default router;