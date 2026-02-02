import fs from 'fs';
import path from 'path';
import { db } from './connection';
import { logger } from '../utils/logger';

/**
 * Database migration script
 * Runs the schema.sql file to set up the database
 */
async function migrate() {
  try {
    logger.info('Starting database migration...');

    // Read the schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute the schema
    await db.query(schema);

    logger.info('✅ Database migration completed successfully');
    
    // Create admin table if it doesn't exist (not in main schema)
    await createAdminTable();
    
    logger.info('✅ Admin table created successfully');

  } catch (error) {
    logger.error('❌ Database migration failed:', error);
    throw error;
  }
}

/**
 * Create admin table for authentication
 */
async function createAdminTable() {
  const adminTableSQL = `
    CREATE TABLE IF NOT EXISTS admins (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'admin',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP WITH TIME ZONE
    );

    -- Create index on email for faster lookups
    CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
    CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(is_active);

    -- Create trigger for updated_at
    CREATE TRIGGER IF NOT EXISTS update_admins_updated_at 
      BEFORE UPDATE ON admins 
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `;

  await db.query(adminTableSQL);
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate()
    .then(() => {
      logger.info('Migration completed, closing database connection');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migrate };