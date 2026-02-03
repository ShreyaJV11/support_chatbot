import express from 'express';
import { authenticateAdmin } from '../../middleware/auth';
import ChatLogModel from '../../models/ChatLog';
import { logger } from '../../utils/logger';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateAdmin);

/**
 * GET /api/admin/chat-logs
 * List all chat logs with pagination
 */
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // 1. Get real data from simplified DB
    const { logs, total } = await ChatLogModel.findAll(limit, offset);

    // 2. Map to Frontend format
    const mappedLogs = logs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      user_question: log.user_message, // DB column is user_message
      response_text: log.bot_response,
      
      // Derive response_type from intent
      response_type: log.intent_detected === 'Escalation' ? 'ESCALATED' : 'ANSWERED',
      
      confidence_score: log.confidence_score,
      matched_kb_id: log.intent_detected,
      
      // Mock missing fields to prevent Frontend crash
      salesforce_case_id: 'N/A', 
      processing_time_ms: 0
    }));

    res.json({
      logs: mappedLogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error('Error fetching chat logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * POST /api/admin/chat-logs/search
 * Search chat logs
 */
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    // Use the generic search method
    const results = await ChatLogModel.search(query);

    const mappedResults = results.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      user_question: log.user_message,
      response_text: log.bot_response,
      response_type: log.intent_detected === 'Escalation' ? 'ESCALATED' : 'ANSWERED',
      confidence_score: log.confidence_score,
      salesforce_case_id: 'N/A'
    }));

    res.json({ results: mappedResults });

  } catch (error) {
    logger.error('Search logs failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * GET /api/admin/chat-logs/stats
 * Get chat logs statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await ChatLogModel.getDashboardStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * GET /api/admin/chat-logs/recent-escalations
 */
router.get('/recent-escalations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const escalations = await ChatLogModel.getRecentEscalations(limit);
    
    res.json({
      escalations: escalations.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        user_question: log.user_message,
        confidence_score: log.confidence_score,
        salesforce_case_id: 'N/A'
      })),
      count: escalations.length
    });
  } catch (error) {
    logger.error('Error fetching escalations:', error);
    res.status(500).json({ error: 'Failed to fetch escalations' });
  }
});

/**
 * GET /api/admin/chat-logs/export
 * Simple CSV Export (Last 1000 records)
 */
router.get('/export', async (req, res) => {
  try {
    // Export last 1000 logs
    const { logs } = await ChatLogModel.findAll(1000, 0);

    const csvHeader = 'ID,Timestamp,User Question,Bot Response,Confidence,Intent\n';
    const csvRows = logs.map(log => 
      `"${log.id}","${log.timestamp}","${(log.user_message || '').replace(/"/g, '""')}","${(log.bot_response || '').replace(/"/g, '""')}","${log.confidence_score}","${log.intent_detected}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="logs_export.csv"`);
    res.send(csvHeader + csvRows);

  } catch (error) {
    logger.error('Export failed:', error);
    res.status(500).send('Export failed');
  }
});

// Placeholder routes to prevent 404s/Crashes if frontend calls old filters
router.get('/by-type/:type', (req, res) => res.json({ logs: [] }));
router.get('/date-range', (req, res) => res.json({ logs: [] }));
router.get('/top-categories', (req, res) => res.json({ categories: [], count: 0 }));
router.get('/performance-metrics', (req, res) => res.json({ metrics: [] }));

export default router;