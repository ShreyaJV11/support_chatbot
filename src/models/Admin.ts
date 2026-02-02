import { db } from '../database/connection';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';

export interface Admin {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
}

export class AdminModel {
  
  /**
   * Find admin by email
   */
  static async findByEmail(email: string): Promise<Admin | null> {
    try {
      const result = await db.query(
        'SELECT * FROM admins WHERE email = $1 AND is_active = true',
        [email.toLowerCase()]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding admin by email:', error);
      throw error;
    }
  }

  /**
   * Find admin by ID
   */
  static async findById(id: string): Promise<Admin | null> {
    try {
      const result = await db.query(
        'SELECT * FROM admins WHERE id = $1 AND is_active = true',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error finding admin by ID:', error);
      throw error;
    }
  }

  /**
   * Verify admin password
   */
  static async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      logger.error('Error verifying password:', error);
      return false;
    }
  }

  /**
   * Update last login timestamp
   */
  static async updateLastLogin(id: string): Promise<void> {
    try {
      await db.query(
        'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );
      logger.info('Admin last login updated', { admin_id: id });
    } catch (error) {
      logger.error('Error updating last login:', error);
      // Don't throw here as it's not critical
    }
  }

  /**
   * Create a new admin (for setup/seeding)
   */
  static async create(data: {
    email: string;
    password: string;
    role: string;
  }): Promise<Admin> {
    try {
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(data.password, saltRounds);

      const result = await db.query(`
        INSERT INTO admins (email, password_hash, role)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [
        data.email.toLowerCase(),
        passwordHash,
        data.role
      ]);

      const admin = result.rows[0];
      logger.info('Admin created', { admin_id: admin.id, email: admin.email });
      return admin;
    } catch (error) {
      logger.error('Error creating admin:', error);
      throw error;
    }
  }

  /**
   * Get all admins (for super admin)
   */
  static async findAll(): Promise<Admin[]> {
    try {
      const result = await db.query(`
        SELECT id, email, role, is_active, created_at, updated_at, last_login
        FROM admins
        ORDER BY created_at DESC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching all admins:', error);
      throw error;
    }
  }

  /**
   * Update admin status
   */
  static async updateStatus(id: string, isActive: boolean): Promise<boolean> {
    try {
      const result = await db.query(
        'UPDATE admins SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [isActive, id]
      );
      
      logger.info('Admin status updated', { admin_id: id, is_active: isActive });
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error updating admin status:', error);
      throw error;
    }
  }

  /**
   * Change admin password
   */
  static async changePassword(id: string, newPassword: string): Promise<boolean> {
    try {
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      const result = await db.query(
        'UPDATE admins SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [passwordHash, id]
      );

      logger.info('Admin password changed', { admin_id: id });
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error changing admin password:', error);
      throw error;
    }
  }
}

export default AdminModel;