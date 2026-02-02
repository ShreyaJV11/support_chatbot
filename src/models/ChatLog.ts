import { db } from '../database/connection';
import { ChatLog } from '../types';
import { logger } from '../utils/logger';

export class ChatLogModel {
  
  /**
   * Create a new chat log entry
   */
  static async create(data: {
    user_question: string;
    matched_kb_id?: string;
    confidence_score?: number;
    response_type: 'ANSWERED' | 'ESCALATED' | 'ERROR';
    salesforce_case_id?: string;
    user_session_id?: string;
    response_text?: string;
    processing_time_ms?: number;
  }): Promise<ChatLog> {
    try {
      const result = await db.query(`
        INSERT INTO chat_logs (
          user_question, matched_kb_id, confidence_score, response_type, 
          salesforce_case_id, user_session_id, response_text, processing_time_ms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        data.user_question,
        data.matched_kb_id || null,
        data.confidence_score || null,
        data.response_type,
        data.salesforce_case_id || null,
        data.user_session_id || null,
        data.response_text || null,
        data.processing_time_ms || null
      ]);

      const chatLog = result.rows[0];
      logger.info('Chat log created:', { 
        id: chatLog.id, 
        response_type: chatLog.response_type,
        confidence_score: chatLog.confidence_score 
      });
      
      return chatLog;
    } catch (error) {
      logger.error('Error creating chat log:', error);
      throw error;
    }
  }

  /**
   * Get all chat logs with pagination
   */
  static async findAll(limit: number = 50, offset: number = 0): Promise<{
    logs: ChatLog[];
    total: number;
  }> {
    try {
      const [logsResult, countResult] = await Promise.all([
        db.query(`
          SELECT cl.*, kb.primary_question as matched_question
          FROM chat_logs cl
          LEFT JOIN knowledge_base kb ON cl.matched_kb_id = kb.id
          ORDER BY cl.timestamp DESC
          LIMIT $1 OFFSET $2
        `, [limit, offset]),
        
        db.query('SELECT COUNT(*) as total FROM chat_logs')
      ]);

      return {
        logs: logsResult.rows,
        total: parseInt(countResult.rows[0].total)
      };
    } catch (error) {
      logger.error('Error fetching chat logs:', error);
      throw error;
    }
  }

  /**
   * Get chat logs by response type
   */
  static async findByResponseType(responseType: 'ANSWERED' | 'ESCALATED' | 'ERROR'): Promise<ChatLog[]> {
    try {
      const result = await db.query(`
        SELECT cl.*, kb.primary_question as matched_question
        FROM chat_logs cl
        LEFT JOIN knowledge_base kb ON cl.matched_kb_id = kb.id
        WHERE cl.response_type = $1
        ORDER BY cl.timestamp DESC
      `, [responseType]);

      return result.rows;
    } catch (error) {
      logger.error('Error fetching chat logs by response type:', error);
      throw error;
    }
  }

  /**
   * Get chat logs for a specific time period
   */
  static async findByDateRange(startDate: Date, endDate: Date): Promise<ChatLog[]> {
    try {
      const result = await db.query(`
        SELECT cl.*, kb.primary_question as matched_question
        FROM chat_logs cl
        LEFT JOIN knowledge_base kb ON cl.matched_kb_id = kb.id
        WHERE cl.timestamp BETWEEN $1 AND $2
        ORDER BY cl.timestamp DESC
      `, [startDate, endDate]);

      return result.rows;
    } catch (error) {
      logger.error('Error fetching chat logs by date range:', error);
      throw error;
    }
  }

  /**
   * Get dashboard statistics
   */
  static async getDashboardStats(): Promise<{
    total_questions: number;
    answered_count: number;
    escalated_count: number;
    error_count: number;
    answered_percentage: number;
    escalated_percentage: number;
    avg_confidence_score: number;
    avg_processing_time: number;
  }> {
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_questions,
          COUNT(CASE WHEN response_type = 'ANSWERED' THEN 1 END) as answered_count,
          COUNT(CASE WHEN response_type = 'ESCALATED' THEN 1 END) as escalated_count,
          COUNT(CASE WHEN response_type = 'ERROR' THEN 1 END) as error_count,
          ROUND(
            (COUNT(CASE WHEN response_type = 'ANSWERED' THEN 1 END)::decimal / COUNT(*)) * 100, 
            2
          ) as answered_percentage,
          ROUND(
            (COUNT(CASE WHEN response_type = 'ESCALATED' THEN 1 END)::decimal / COUNT(*)) * 100, 
            2
          ) as escalated_percentage,
          ROUND(AVG(confidence_score), 4) as avg_confidence_score,
          ROUND(AVG(processing_time_ms)) as avg_processing_time
        FROM chat_logs
        WHERE timestamp >= NOW() - INTERVAL '30 days'
      `);

      const stats = result.rows[0];
      return {
        total_questions: parseInt(stats.total_questions) || 0,
        answered_count: parseInt(stats.answered_count) || 0,
        escalated_count: parseInt(stats.escalated_count) || 0,
        error_count: parseInt(stats.error_count) || 0,
        answered_percentage: parseFloat(stats.answered_percentage) || 0,
        escalated_percentage: parseFloat(stats.escalated_percentage) || 0,
        avg_confidence_score: parseFloat(stats.avg_confidence_score) || 0,
        avg_processing_time: parseFloat(stats.avg_processing_time) || 0
      };
    } catch (error) {
      logger.error('Error getting dashboard stats:', error);
      throw error;
    }
  }

  /**
   * Get top categories from recent chat logs
   */
  static async getTopCategories(limit: number = 5): Promise<Array<{ category: string; count: number }>> {
    try {
      const result = await db.query(`
        SELECT kb.category, COUNT(*) as count
        FROM chat_logs cl
        JOIN knowledge_base kb ON cl.matched_kb_id = kb.id
        WHERE cl.response_type = 'ANSWERED' 
          AND cl.timestamp >= NOW() - INTERVAL '30 days'
        GROUP BY kb.category
        ORDER BY count DESC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting top categories:', error);
      throw error;
    }
  }

  /**
   * Get recent escalations for dashboard
   */
  static async getRecentEscalations(limit: number = 10): Promise<ChatLog[]> {
    try {
      const result = await db.query(`
        SELECT *
        FROM chat_logs
        WHERE response_type = 'ESCALATED'
        ORDER BY timestamp DESC
        LIMIT $1
      `, [limit]);

      return result.rows;
    } catch (error) {
      logger.error('Error getting recent escalations:', error);
      throw error;
    }
  }

  /**
   * Search chat logs by user question
   */
  static async searchByQuestion(query: string, limit: number = 20): Promise<ChatLog[]> {
    try {
      const result = await db.query(`
        SELECT cl.*, kb.primary_question as matched_question
        FROM chat_logs cl
        LEFT JOIN knowledge_base kb ON cl.matched_kb_id = kb.id
        WHERE to_tsvector('english', cl.user_question) @@ plainto_tsquery('english', $1)
        ORDER BY cl.timestamp DESC
        LIMIT $2
      `, [query, limit]);

      return result.rows;
    } catch (error) {
      logger.error('Error searching chat logs:', error);
      throw error;
    }
  }
}

export default ChatLogModel;