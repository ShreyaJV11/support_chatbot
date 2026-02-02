import { Router } from 'express';
import chatRoutes from './chat';
import adminAuthRoutes from './admin/auth';
import adminDashboardRoutes from './admin/dashboard';
import adminKnowledgeBaseRoutes from './admin/knowledgeBase';
import adminUnansweredQuestionsRoutes from './admin/unansweredQuestions';
import adminChatLogsRoutes from './admin/chatLogs';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'enterprise-support-chatbot',
    version: '1.0.0'
  });
});

// Chat API routes (public)
router.use('/api/chat', chatRoutes);

// Admin authentication routes
router.use('/admin/auth', adminAuthRoutes);

// Admin panel routes (all require authentication)
router.use('/admin/dashboard', adminDashboardRoutes);
router.use('/admin/kb', adminKnowledgeBaseRoutes);
router.use('/admin/unanswered', adminUnansweredQuestionsRoutes);
router.use('/admin/chat-logs', adminChatLogsRoutes);

export default router;