import { db } from '../database/connection';
import { logger } from '../utils/logger';

// Interface matching the actual Database Table
export interface UnansweredQuestion {
  id: string;
  user_query: string;
  count: number;
  last_asked: Date;
}

export class UnansweredQuestionModel {
  
  /**
   * Log an unanswered question
   * Logic: If question exists, increment count. If not, insert new.
   */
  static async create(data: { user_query: string }): Promise<UnansweredQuestion | null> {
    try {
      // 1. Check if exists
      const checkQuery = `SELECT * FROM unanswered_questions WHERE user_query = $1`;
      const checkRes = await db.query(checkQuery, [data.user_query]);

      if (checkRes.rows.length > 0) {
        // 2. Update existing
        const updateQuery = `
          UPDATE unanswered_questions 
          SET count = count + 1, last_asked = CURRENT_TIMESTAMP 
          WHERE user_query = $1 
          RETURNING *
        `;
        const result = await db.query(updateQuery, [data.user_query]);
        return result.rows[0];
      } else {
        // 3. Insert new
        const insertQuery = `
          INSERT INTO unanswered_questions (user_query) 
          VALUES ($1) 
          RETURNING *
        `;
        const result = await db.query(insertQuery, [data.user_query]);
        
        logger.info('Recorded new unanswered question');
        return result.rows[0];
      }
    } catch (error) {
      logger.error('Error logging unanswered question:', error);
      return null;
    }
  }

  /**
   * Get all questions (for Admin Dashboard)
   */
  static async findAll(limit: number = 50, offset: number = 0): Promise<{ questions: UnansweredQuestion[], total: number }> {
    try {
      const result = await db.query(`
        SELECT * FROM unanswered_questions 
        ORDER BY last_asked DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const countRes = await db.query('SELECT COUNT(*) as total FROM unanswered_questions');

      return {
        questions: result.rows,
        total: parseInt(countRes.rows[0].total)
      };
    } catch (error) {
      logger.error('Error fetching unanswered questions:', error);
      return { questions: [], total: 0 };
    }
  }

  /**
   * Get Recent Questions
   */
  static async getRecent(limit: number = 10): Promise<UnansweredQuestion[]> {
    try {
      const result = await db.query(`
        SELECT * FROM unanswered_questions 
        ORDER BY last_asked DESC 
        LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting recent questions:', error);
      return [];
    }
  }

  /**
   * Get basic stats
   */
  static async getStats() {
    try {
      const result = await db.query('SELECT COUNT(*) as total FROM unanswered_questions');
      return {
        total: parseInt(result.rows[0].total) || 0
      };
    } catch (error) {
      logger.error('Error getting stats:', error);
      return { total: 0 };
    }
  }

  /**
   * Search questions
   */
  static async search(query: string) {
    try {
      const result = await db.query(`
        SELECT * FROM unanswered_questions 
        WHERE user_query ILIKE $1 
        ORDER BY last_asked DESC 
        LIMIT 20
      `, [`%${query}%`]);
      return result.rows;
    } catch (error) {
      logger.error('Error searching questions:', error);
      return [];
    }
  }
}

export default UnansweredQuestionModel;