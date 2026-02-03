import { Router, Request, Response } from 'express';
import UnansweredQuestionModel from '../../models/UnansweredQuestion';
import { db } from '../../database/connection'; // Direct DB access for delete/updates
import { logger } from '../../utils/logger';
import { asyncHandler } from '../../middleware/errorHandler';

const router = Router();

/**
 * GET /api/admin/unanswered
 * Database se saare unanswered questions fetch karne ke liye (With Pagination)
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    // Tumhare model ka findAll method jo DB query chalata hai
    const result = await UnansweredQuestionModel.findAll(limit, offset);

    res.json({
        success: true,
        data: result.questions,
        total: result.total,
        page,
        last_page: Math.ceil(result.total / limit)
    });
}));

/**
 * GET /api/admin/unanswered/stats
 * DB se total count nikalne ke liye
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
    const stats = await UnansweredQuestionModel.getStats();
    res.json({
        success: true,
        total_unanswered: stats.total
    });
}));

/**
 * DELETE /api/admin/unanswered/:id
 * Jab tum question ko Knowledge Base mein add kar do, toh use DB se delete karne ke liye
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    
    try {
        const deleteQuery = `DELETE FROM unanswered_questions WHERE id = $1 RETURNING *`;
        const result = await db.query(deleteQuery, [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: "Question not found in database" });
        }

        logger.info(`🗑️ Deleted unanswered question ID: ${id} from database`);
        res.json({ success: true, message: "Deleted successfully" });
    } catch (error) {
        logger.error('❌ DB Delete Error:', error);
        res.status(500).json({ success: false, error: "Database error during deletion" });
    }
}));

/**
 * POST /api/admin/unanswered/clear-all
 * Database ko saaf karne ke liye (Optional/Admin only)
 */
router.post('/clear-all', asyncHandler(async (req: Request, res: Response) => {
    await db.query('DELETE FROM unanswered_questions');
    logger.warn('⚠️ All unanswered questions cleared from database by Admin');
    res.json({ success: true, message: "Database table cleared" });
}));

export default router;