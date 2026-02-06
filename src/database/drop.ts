import { db } from './connection';
import { logger } from '../utils/logger';

const dropTables = async () => {
  try {
    logger.info('🗑️ Dropping ALL tables from the database...');
    const tables = [
      'unanswered_questions',
      'chat_logs',
      'admin_audit_logs',
      'knowledge_base',
      'user_info',
      'admins',
      'salesforce_tickets'   
    ];
    for (const table of tables) {
      await db.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      logger.info(`   - Dropped ${table}`);
    }

    logger.info('✅ All tables dropped successfully!');
    process.exit(0);
  } catch (error) {
    logger.error('Error dropping tables:', error);
    process.exit(1);
  }
};

dropTables();