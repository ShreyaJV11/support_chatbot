import { db } from '../database/connection';
import { KnowledgeBaseEntry, KnowledgeBaseCreateRequest, KnowledgeBaseUpdateRequest } from '../types';
import { logger } from '../utils/logger';
import { getEmbedding } from '../utils/gemini';
import { pinecone } from '../utils/pinecone';

export class KnowledgeBaseModel {
  
  /**
   * Get all active knowledge base entries
   */
  static async findAll(): Promise<KnowledgeBaseEntry[]> {
    try {
      const result = await db.query(
        'SELECT * FROM knowledge_base WHERE status = $1 ORDER BY created_at DESC',
        ['active']
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching knowledge base entries:', error);
      throw error;
    }
  }

  /**
   * Get knowledge base entries by category
   */
  static async findByCategory(category: string): Promise<KnowledgeBaseEntry[]> {
    try {
      const result = await db.query(
        'SELECT * FROM knowledge_base WHERE category = $1 AND status = $2 ORDER BY confidence_weight DESC',
        [category, 'active']
      );
      return result.rows;
    } catch (error) {
      logger.error('Error fetching knowledge base entries by category:', error);
      throw error;
    }
  }

  /**
   * Get a single knowledge base entry by ID
   */
  static async findById(id: string): Promise<KnowledgeBaseEntry | null> {
    try {
      const result = await db.query(
        'SELECT * FROM knowledge_base WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error fetching knowledge base entry by ID:', error);
      throw error;
    }
  }

  /**
   * Search knowledge base entries using full-text search (Postgres Fallback)
   */
  static async search(query: string): Promise<KnowledgeBaseEntry[]> {
    try {
      const result = await db.query(`
        SELECT *, 
               ts_rank(to_tsvector('english', primary_question), plainto_tsquery('english', $1)) as rank
        FROM knowledge_base 
        WHERE status = 'active' 
          AND (
            to_tsvector('english', primary_question) @@ plainto_tsquery('english', $1)
            OR alternate_questions::text ILIKE $2
          )
        ORDER BY rank DESC, confidence_weight DESC
        LIMIT 10
      `, [query, `%${query}%`]);
      
      return result.rows;
    } catch (error) {
      logger.error('Error searching knowledge base:', error);
      throw error;
    }
  }

  /**
   * Create a new knowledge base entry AND Sync with Pinecone
   */
  static async create(data: KnowledgeBaseCreateRequest, adminUser: string): Promise<KnowledgeBaseEntry> {
    try {
      // 1. PostgreSQL mein Insert karo
      const result = await db.query(`
        INSERT INTO knowledge_base (
          primary_question, alternate_questions, answer_text, category, confidence_weight
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        data.primary_question,
        JSON.stringify(data.alternate_questions),
        data.answer_text,
        data.category,
        data.confidence_weight
      ]);

      const newEntry = result.rows[0];

      // -------------------------------------------------------------
      // ⭐ PINE SYNC LOGIC
      // -------------------------------------------------------------
      try {
        logger.info(`🤖 Generating embedding for ID: ${newEntry.id}`);

        // A. Gemini se Vector banao
        const vector = await getEmbedding(data.primary_question);

        // B. Pinecone mein save karo
        const indexName = process.env.PINECONE_INDEX_NAME || 'chatbot-index';
        const index = pinecone.index(indexName);
        
        // 👇 FIX IS HERE: Added "as any" to fix TypeScript error
        await index.upsert([{
            id: `q_${newEntry.id}`,           
            values: vector,                   
            metadata: { 
                db_id: newEntry.id,           
                text: data.primary_question, 
                category: data.category 
            }
        }] as any); 

        logger.info(`✅ Successfully synced entry ${newEntry.id} with Pinecone Index: ${indexName}`);

      } catch (vectorError) {
        logger.error('⚠️ Failed to sync with Pinecone. Please check your API Keys.', vectorError);
      }
      // -------------------------------------------------------------

      // Log admin action
      await this.logAdminAction(adminUser, 'CREATE', 'knowledge_base', newEntry.id, null, newEntry);

      return newEntry;
    } catch (error) {
      logger.error('Error creating knowledge base entry:', error);
      throw error;
    }
  }

  /**
   * Update a knowledge base entry
   */
  static async update(id: string, data: KnowledgeBaseUpdateRequest, adminUser: string): Promise<KnowledgeBaseEntry | null> {
    try {
      const currentEntry = await this.findById(id);
      if (!currentEntry) {
        return null;
      }

      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (data.primary_question !== undefined) {
        updateFields.push(`primary_question = $${paramIndex++}`);
        updateValues.push(data.primary_question);
      }
      if (data.alternate_questions !== undefined) {
        updateFields.push(`alternate_questions = $${paramIndex++}`);
        updateValues.push(JSON.stringify(data.alternate_questions));
      }
      if (data.answer_text !== undefined) {
        updateFields.push(`answer_text = $${paramIndex++}`);
        updateValues.push(data.answer_text);
      }
      if (data.category !== undefined) {
        updateFields.push(`category = $${paramIndex++}`);
        updateValues.push(data.category);
      }
      if (data.confidence_weight !== undefined) {
        updateFields.push(`confidence_weight = $${paramIndex++}`);
        updateValues.push(data.confidence_weight);
      }
      if (data.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(data.status);
      }

      if (updateFields.length === 0) {
        return currentEntry;
      }

      updateValues.push(id);
      const result = await db.query(`
        UPDATE knowledge_base 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
      `, updateValues);

      const updatedEntry = result.rows[0];

      await this.logAdminAction(adminUser, 'UPDATE', 'knowledge_base', id, currentEntry, updatedEntry);

      logger.info('Knowledge base entry updated:', { id, admin: adminUser });
      return updatedEntry;
    } catch (error) {
      logger.error('Error updating knowledge base entry:', error);
      throw error;
    }
  }

  /**
   * Delete (soft delete)
   */
  static async delete(id: string, adminUser: string): Promise<boolean> {
    try {
      const currentEntry = await this.findById(id);
      if (!currentEntry) {
        return false;
      }

      await db.query(
        'UPDATE knowledge_base SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['inactive', id]
      );

      await this.logAdminAction(adminUser, 'DELETE', 'knowledge_base', id, currentEntry, { ...currentEntry, status: 'inactive' });

      logger.info('Knowledge base entry deleted (soft):', { id, admin: adminUser });
      return true;
    } catch (error) {
      logger.error('Error deleting knowledge base entry:', error);
      throw error;
    }
  }

  /**
   * Get Dashboard Stats
   */
  static async getStats(): Promise<{ total: number; by_category: Array<{ category: string; count: number }> }> {
    try {
      const totalResult = await db.query(
        'SELECT COUNT(*) as total FROM knowledge_base WHERE status = $1',
        ['active']
      );

      const categoryResult = await db.query(`
        SELECT category, COUNT(*) as count 
        FROM knowledge_base 
        WHERE status = 'active' 
        GROUP BY category 
        ORDER BY count DESC
      `);

      return {
        total: parseInt(totalResult.rows[0].total),
        by_category: categoryResult.rows
      };
    } catch (error) {
      logger.error('Error getting knowledge base stats:', error);
      throw error;
    }
  }

  /**
   * Private: Log Admin Action
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
    }
  }
}

export default KnowledgeBaseModel;