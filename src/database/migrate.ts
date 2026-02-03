import { db } from './connection';
import { logger } from '../utils/logger';

const migrate = async () => {
  try {
    logger.info('🔄 Starting database migration...');

    // 1. Extensions Enable Karo (UUID aur Crypto ke liye)
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // 2. Helper Function: Updated At (Automatic Time Update ke liye)
    await db.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    // 3. Admins Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE
      );
    `);
    
    // Fix: Trigger ko sahi tarike se lagana (Drop then Create)
    await db.query(`
      DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
      CREATE TRIGGER update_admins_updated_at
      BEFORE UPDATE ON admins
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
    
    logger.info('✅ Admins table created/verified');

    // 4. Knowledge Base Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        primary_question TEXT NOT NULL,
        alternate_questions JSONB DEFAULT '[]',
        answer_text TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        confidence_weight DECIMAL(3,2) DEFAULT 1.0,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info('✅ Knowledge Base table created/verified');

    // 5. Chat Logs Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS chat_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_message TEXT NOT NULL,
        bot_response TEXT NOT NULL,
        confidence_score DECIMAL(3,2),
        intent_detected VARCHAR(50),
        sentiment VARCHAR(20),
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info('✅ Chat Logs table created/verified');

    // 6. Admin Audit Logs Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_user VARCHAR(255),
        action_type VARCHAR(50),
        resource_affected VARCHAR(50),
        resource_id VARCHAR(255),
        old_values JSONB,
        new_values JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info('✅ Audit Logs table created/verified');

    // 7. Unanswered Questions Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS unanswered_questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_query TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        last_asked TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.info('✅ Unanswered Questions table created/verified');

    logger.info('🎉 All migrations completed successfully!');
    process.exit(0);

  } catch (error) {
    logger.error('❌ Database migration failed:', error);
    process.exit(1);
  }
};

// Run immediately
migrate();