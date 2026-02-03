import { db } from './connection';
import { logger } from '../utils/logger';

const dropTables = async () => {
  try {
    logger.info('🗑️ Dropping ALL tables from the database...');
    
    // Niche saari possible tables hain jo humare project mein ho sakti hain
    const tables = [
      'unanswered_questions', // 👈 Yeh chhipi hui thi
      'chat_logs',
      'admin_audit_logs',
      'knowledge_base',
      'admins',
      'salesforce_tickets'    // Just in case agar future mein banayi ho
    ];

    for (const table of tables) {
      await db.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
      logger.info(`   - Dropped ${table}`);
    }

    logger.info('✅ All tables dropped successfully! Maidan saaf hai.');
    process.exit(0);
  } catch (error) {
    logger.error('Error dropping tables:', error);
    process.exit(1);
  }
};

dropTables();