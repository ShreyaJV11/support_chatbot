import { db } from './connection';
import { logger } from '../utils/logger';

const migrate = async () => {
  try {
    logger.info('🔄 Starting database migration...');

    // 1. Extensions Enable 
    await db.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await db.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    // 2. Helper Function: Updated At
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
    
    await db.query(`
      DROP TRIGGER IF EXISTS update_admins_updated_at ON admins;
      CREATE TRIGGER update_admins_updated_at
      BEFORE UPDATE ON admins
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
    logger.info('✅ Admins table created/verified');

    // 4. USER INFO TABLE
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_info (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        organization VARCHAR(150),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await db.query(`
      DROP TRIGGER IF EXISTS update_user_info_updated_at ON user_info;
      CREATE TRIGGER update_user_info_updated_at
      BEFORE UPDATE ON user_info
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `);
    logger.info('✅ User Info table created/verified');

    // 5. Knowledge Base Table
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

    // 6. Chat Logs Table & Automatic Column Updates
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

    // ⭐ MAGIC CODE
    await db.query(`
      DO $$ 
      BEGIN 
        -- 1. Check for user_id
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='chat_logs' AND column_name='user_id') THEN
          ALTER TABLE chat_logs ADD COLUMN user_id UUID REFERENCES user_info(id);
        END IF;

        -- 2. Check for salesforce_case_id
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name='chat_logs' AND column_name='salesforce_case_id') THEN
          ALTER TABLE chat_logs ADD COLUMN salesforce_case_id VARCHAR(50);
        END IF;
      END $$;
    `);
    logger.info('✅ Chat Logs table and all columns (user_id, salesforce_case_id) verified');

    // 7. Admin Audit Logs Table
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

    // 8. Unanswered Questions Table
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

migrate();