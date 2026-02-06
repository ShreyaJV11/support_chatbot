import { db } from '../database/connection';
import { logger } from '../utils/logger';

export class ChatLogModel {
  
  /**
   * 1. Create a new chat log entry
   */
  static async create(data: {
    user_message: string;
    bot_response: string;
    confidence_score: number;
    intent_detected: string;
    sentiment: string;
  }) {
    const query = `
      INSERT INTO chat_logs (
        user_message, 
        bot_response, 
        confidence_score, 
        intent_detected, 
        sentiment
      ) 
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    
    const values = [
      data.user_message,
      data.bot_response,
      data.confidence_score || 0,
      data.intent_detected || 'Unknown',
      data.sentiment || 'Neutral'
    ];

    try {
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error logging chat:', error);
      return null;
    }
  }

  /**
   * 2. Get Dashboard Stats
   */
  static async getDashboardStats() {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_questions,
          COUNT(CASE WHEN intent_detected != 'Escalation' THEN 1 END) as answered_count,
          COUNT(CASE WHEN intent_detected = 'Escalation' THEN 1 END) as escalated_count,
          AVG(confidence_score) as avg_confidence_score
        FROM chat_logs
      `);

      const stats = result.rows[0];
      const total = parseInt(stats.total_questions) || 0;
      const answered = parseInt(stats.answered_count) || 0;
      const escalated = parseInt(stats.escalated_count) || 0;

      return {
        total_questions: total,
        answered_count: answered,
        escalated_count: escalated,
        answered_percentage: total > 0 ? ((answered / total) * 100).toFixed(2) : 0,
        escalated_percentage: total > 0 ? ((escalated / total) * 100).toFixed(2) : 0,
        avg_confidence_score: parseFloat(stats.avg_confidence_score || '0').toFixed(2)
      };
    } catch (error) {
      logger.error('Error getting dashboard stats:', error);
      return {
        total_questions: 0,
        answered_percentage: 0,
        escalated_percentage: 0,
        avg_confidence_score: 0
      };
    }
  }

  /**
   * 3. Get Top Categories
   */
  static async getTopCategories(limit: number = 5) {
    try {
      const result = await db.query(`
        SELECT intent_detected as category, COUNT(*) as count
        FROM chat_logs
        WHERE intent_detected != 'Escalation'
        GROUP BY intent_detected
        ORDER BY count DESC
        LIMIT $1
      `, [limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting top categories:', error);
      return [];
    }
  }
  /**
   * 4. Get Recent Escalations
   */
  static async getRecentEscalations(limit: number = 10) {
    try {
      const result = await db.query(`
        SELECT *
        FROM chat_logs
        WHERE intent_detected = 'Escalation'
        ORDER BY timestamp DESC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting recent escalations:', error);
      return [];
    }
  }

  /**
   * 5. Find All (Pagination)
   */
  static async findAll(limit: number = 50, offset: number = 0) {
    try {
      const result = await db.query(`
        SELECT * FROM chat_logs 
        ORDER BY timestamp DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      
      const countRes = await db.query('SELECT COUNT(*) as total FROM chat_logs');

      return {
        logs: result.rows,
        total: parseInt(countRes.rows[0].total)
      };
    } catch (error) {
      logger.error('Error fetching logs:', error);
      return { logs: [], total: 0 };
    }
  }

  /**
   * 6. Search Logs (Keyword Search)
   */
  static async search(query: string) {
    try {
      const result = await db.query(`
        SELECT * FROM chat_logs 
        WHERE user_message ILIKE $1 OR bot_response ILIKE $1
        ORDER BY timestamp DESC 
        LIMIT 50
      `, [`%${query}%`]);
      
      return result.rows;
    } catch (error) {
      logger.error('Error searching logs:', error);
      return [];
    }
  }
}

export default ChatLogModel;