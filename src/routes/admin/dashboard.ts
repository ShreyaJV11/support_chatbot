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

// Apply authentication and rate limiting
router.use(authenticateToken);
router.use(rateLimitAdmin);

/**
 * GET /admin/dashboard
 * Main dashboard with statistics and overview
 */
router.get('/',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    logger.info('Dashboard accessed', { admin_id: user.id });

    // 1. Fetch Stats from Models
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

    // 2. Format Response (Mapping available data to expected format)
    const dashboardData = {
      // Main metrics
      total_questions: chatStats.total_questions,
      answered_percentage: parseFloat(chatStats.answered_percentage as string) || 0,
      escalated_percentage: parseFloat(chatStats.escalated_percentage as string) || 0,
      error_percentage: 0, // Not tracking errors separately in new schema
      
      // Performance metrics
      avg_confidence_score: parseFloat(chatStats.avg_confidence_score as string) || 0,
      avg_processing_time: 0, // Not tracking processing time in new schema
      
      // Top categories
      top_categories: topCategories,
      
      // Recent escalations
      recent_escalations: recentEscalations.map((escalation: any) => ({
        id: escalation.id,
        user_question: escalation.user_message, // Mapped from user_message
        salesforce_case_id: 'SF-View-Log', // Placeholder as column was removed
        timestamp: escalation.timestamp,
        confidence_score: escalation.confidence_score
      })),
      
      // Knowledge base overview
      knowledge_base: {
        total_entries: kbStats.total,
        by_category: kbStats.by_category
      },
      
      // Unanswered questions (Simplified due to schema changes)
      unanswered_questions: {
        total: unansweredStats.total,
        open: unansweredStats.total, // Assuming all are open
        resolved: 0,
        converted_to_kb: 0,
        by_category: []
      },
      
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
        errors: 0
      },
      knowledge_base: {
        total: kbStats.total,
        categories: kbStats.by_category.length
      },
      unanswered: {
        open: unansweredStats.total,
        pending_conversion: unansweredStats.total
      },
      performance: {
        answer_rate: chatStats.answered_percentage,
        avg_confidence: chatStats.avg_confidence_score,
        avg_response_time: 0
      }
    });
  })
);

/**
 * GET /admin/dashboard/stats/trends
 * Trending data (Updated SQL to use 'intent_detected' instead of 'response_type')
 */
router.get('/stats/trends',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await db.query(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as total_questions,
        COUNT(CASE WHEN intent_detected != 'Escalation' THEN 1 END) as answered,
        COUNT(CASE WHEN intent_detected = 'Escalation' THEN 1 END) as escalated,
        0 as errors,
        ROUND(AVG(confidence_score), 4) as avg_confidence,
        0 as avg_processing_time
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
 * Category breakdown (Updated SQL to use 'intent_detected')
 */
router.get('/stats/categories',
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const result = await db.query(`
      SELECT 
        intent_detected as category,
        COUNT(*) as total_questions,
        COUNT(CASE WHEN intent_detected != 'Escalation' THEN 1 END) as answered,
        ROUND(AVG(confidence_score), 4) as avg_confidence,
        0 as avg_processing_time
      FROM chat_logs
      WHERE timestamp >= NOW() - INTERVAL '30 days'
        AND intent_detected != 'Escalation'
        AND intent_detected != 'Unknown'
      GROUP BY intent_detected
      ORDER BY total_questions DESC
    `);

    res.json({
      category_stats: result.rows,
      period: '30_days'
    });
  })
);

export default router;