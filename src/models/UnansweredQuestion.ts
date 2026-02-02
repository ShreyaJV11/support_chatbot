import { db } from '../database/connection';
import { UnansweredQuestion } from '../types';
import { logger } from '../utils/logger';

export class UnansweredQuestionModel {
  
  /**
   * Create a new unanswered question entry
   */
  static async create(data: {
    user_question: string;
    detected_category?: 'DOI' | 'Access' | 'Hosting' | 'Unknown';
    confidence_score?: number;
    salesforce_case_id: string;
  }): Promise<UnansweredQuestion> {
    try {
      const result = await db.query(`
        INSERT INTO unanswered_questions (
          user_question, detected_category, confidence_score, salesforce_case_id
        ) VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [
        data.user_question,
        data.detected_category || 'Unknown',
        data.confidence_score || null,
        data.salesforce_case_id
      ]);

      const unansweredQuestion = result.rows[0];
      logger.info('Unanswered question created:', { 
        id: unansweredQuestion.id, 
        case_id: unansweredQuestion.salesforce_case_id 
      });
      
      return unansweredQuestion;
    } catch (error) {
      logger.error('Error creating unanswered question:', error);
      throw error;
    }
  }

  /**
   * Get all unanswered questions with pagination
   */
  static async findAll(limit: number = 50, offset: number = 0): Promise<{
    questions: UnansweredQuestion[];
    total: number;
  }> {
    try {
      const [questionsResult, countResult] = await Promise.all([
        db.query(`
          SELECT *
          FROM unanswered_questions
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2
        `, [limit, offset]),
        
        db.query('SELECT COUNT(*) as total FROM unanswered_questions')
      ]);

      return {
        questions: questionsResult.rows,
        total: parseInt(countResult.rows[0].total)
      };
    } catch (error) {
      logger.error('Error fetching unanswered questions:', error);
      throw error;
    }
  }

  /**
   * Get unanswered questions by status
   */
  static async findByStatus(status: 'open' | 'resolved' | 'converted_to_kb'): Promise<UnansweredQuestion[]> {
    try {
      const result = await db.query(`
        SELECT uq.*, kb.primary_question as converted_question
        FROM unanswered_questions uq
        LEFT JOIN knowledge_base kb ON uq.converted_kb_id = kb.id
        WHERE uq.status = $1
        ORDER BY uq.created_at DESC
      `, [status]);

      return result.rows;
    } catch (error) {
      logger.error('Error fetching unanswered questions by status:', error);
      throw error;
    }
  }

  /**
   * Get unanswered questions by category
   */
  static async findByCategory(category: 'DOI' | 'Access' | 'Hosting' | 'Unknown'): Promise<UnansweredQuestion[]> {
    try {
      const result = await db.query(`
        SELECT *
        FROM unanswered_questions
        WHERE detected_category = $1
        ORDER BY created_at DESC
      `, [category]);

      return result.rows;
    } catch (error) {
      logger.error('Error fetching unanswered questions by category:', error);
      throw error;
    }
  }

  /**
   * Get a single unanswered question by ID
   */
  static async findById(id: string): Promise<UnansweredQuestion | null> {
    try {
      const result = await db.query(
        'SELECT * FROM unanswered_questions WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching unanswered question by ID:', error);
      throw error;
    }
  }

  /**
   * Update unanswered question status
   */
  static async updateStatus(
    id: string, 
    status: 'open' | 'resolved' | 'converted_to_kb',
    adminUser: string,
    convertedKbId?: string
  ): Promise<UnansweredQuestion | null> {
    try {
      const currentQuestion = await this.findById(id);
      if (!currentQuestion) {
        return null;
      }

      const updateData: any[] = [status];
      let query = 'UPDATE unanswered_questions SET status = $1';
      let paramIndex = 2;

      if (status === 'resolved' || status === 'converted_to_kb') {
        query += `, resolved_at = CURRENT_TIMESTAMP`;
      }

      if (convertedKbId && status === 'converted_to_kb') {
        query += `, converted_kb_id = $${paramIndex++}`;
        updateData.push(convertedKbId);
      }

      query += ` WHERE id = $${paramIndex} RETURNING *`;
      updateData.push(id);

      const result = await db.query(query, updateData);
      const updatedQuestion = result.rows[0];

      // Log admin action
      await this.logAdminAction(
        adminUser, 
        'UPDATE_STATUS', 
        'unanswered_questions', 
        id, 
        currentQuestion, 
        updatedQuestion
      );

      logger.info('Unanswered question status updated:', { 
        id, 
        status, 
        admin: adminUser 
      });
      
      return updatedQuestion;
    } catch (error) {
      logger.error('Error updating unanswered question status:', error);
      throw error;
    }
  }

  /**
   * Convert unanswered question to knowledge base entry
   */
  static async convertToKnowledgeBase(
    id: string,
    kbData: {
      primary_question: string;
      alternate_questions: string[];
      answer_text: string;
      category: 'DOI' | 'Access' | 'Hosting';
      confidence_weight: number;
    },
    adminUser: string
  ): Promise<{ question: UnansweredQuestion; kbId: string } | null> {
    try {
      return await db.transaction(async (client) => {
        // Create knowledge base entry
        const kbResult = await client.query(`
          INSERT INTO knowledge_base (
            primary_question, alternate_questions, answer_text, category, confidence_weight
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `, [
          kbData.primary_question,
          JSON.stringify(kbData.alternate_questions),
          kbData.answer_text,
          kbData.category,
          kbData.confidence_weight
        ]);

        const kbId = kbResult.rows[0].id;

        // Update unanswered question status
        const questionResult = await client.query(`
          UPDATE unanswered_questions 
          SET status = 'converted_to_kb', resolved_at = CURRENT_TIMESTAMP, converted_kb_id = $1
          WHERE id = $2
          RETURNING *
        `, [kbId, id]);

        const updatedQuestion = questionResult.rows[0];
        if (!updatedQuestion) {
          throw new Error('Unanswered question not found');
        }

        // Log admin actions
        await this.logAdminAction(
          adminUser, 
          'CONVERT_TO_KB', 
          'unanswered_questions', 
          id, 
          null, 
          { converted_kb_id: kbId }
        );

        logger.info('Unanswered question converted to KB:', { 
          question_id: id, 
          kb_id: kbId, 
          admin: adminUser 
        });

        return { question: updatedQuestion, kbId };
      });
    } catch (error) {
      logger.error('Error converting unanswered question to KB:', error);
      throw error;
    }
  }

  /**
   * Get recent unanswered questions for dashboard
   */
  static async getRecent(limit: number = 10): Promise<UnansweredQuestion[]> {
    try {
      const result = await db.query(`
        SELECT *
        FROM unanswered_questions
        WHERE status = 'open'
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting recent unanswered questions:', error);
      throw error;
    }
  }

  /**
   * Get statistics for dashboard
   */
  static async getStats(): Promise<{
    total: number;
    open: number;
    resolved: number;
    converted_to_kb: number;
    by_category: Array<{ category: string; count: number }>;
  }> {
    try {
      const [totalResult, categoryResult] = await Promise.all([
        db.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN status = 'open' THEN 1 END) as open,
            COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
            COUNT(CASE WHEN status = 'converted_to_kb' THEN 1 END) as converted_to_kb
          FROM unanswered_questions
        `),
        
        db.query(`
          SELECT detected_category as category, COUNT(*) as count
          FROM unanswered_questions
          WHERE status = 'open'
          GROUP BY detected_category
          ORDER BY count DESC
        `)
      ]);

      const stats = totalResult.rows[0];
      return {
        total: parseInt(stats.total) || 0,
        open: parseInt(stats.open) || 0,
        resolved: parseInt(stats.resolved) || 0,
        converted_to_kb: parseInt(stats.converted_to_kb) || 0,
        by_category: categoryResult.rows
      };
    } catch (error) {
      logger.error('Error getting unanswered questions stats:', error);
      throw error;
    }
  }

  /**
   * Search unanswered questions by text
   */
  static async search(query: string, limit: number = 20): Promise<UnansweredQuestion[]> {
    try {
      const result = await db.query(`
        SELECT *
        FROM unanswered_questions
        WHERE user_question ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [`%${query}%`, limit]);

      return result.rows;
    } catch (error) {
      logger.error('Error searching unanswered questions:', error);
      throw error;
    }
  }

  /**
   * Log admin actions for audit trail
   */
  private static async logAdminAction(
    adminUser: string,
    actionType: string,
    resourceAffected: string,
    resourceId: string,
    oldValues: any,
    newValues: any
  ): Promise<void> {
    try {
      await db.query(`
        INSERT INTO admin_audit_logs (
          admin_user, action_type, resource_affected, resource_id, old_values, new_values
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        adminUser,
        actionType,
        resourceAffected,
        resourceId,
        oldValues ? JSON.stringify(oldValues) : null,
        newValues ? JSON.stringify(newValues) : null
      ]);
    } catch (error) {
      logger.error('Error logging admin action:', error);
      // Don't throw here to avoid breaking the main operation
    }
  }
}

export default UnansweredQuestionModel;