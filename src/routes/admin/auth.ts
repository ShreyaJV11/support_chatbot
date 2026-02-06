import { Router, Request, Response } from 'express';
import { AdminModel } from '../../models/Admin';
import { generateToken, authenticateToken, AuthenticatedRequest } from '../../middleware/auth';
import { validate, adminLoginSchema } from '../../middleware/validation';
import { rateLimitLogin } from '../../middleware/rateLimiter';
import { asyncHandler, UnauthorizedError } from '../../middleware/errorHandler';
import { logger } from '../../utils/logger';
import { db } from '../../database/connection';

const router = Router();

/**
 * POST /admin/auth/login
 * Admin login endpoint - returns JWT token
 */
router.post('/login',
  rateLimitLogin,
  validate(adminLoginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    
    logger.info('Admin login attempt', { 
      email, 
      ip: req.ip,
      user_agent: req.get('User-Agent')
    });

    // Find admin by email
    const admin = await AdminModel.findByEmail(email);
    if (!admin) {
      logger.warn('Admin login failed: User not found', { email, ip: req.ip });
      throw new UnauthorizedError('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await AdminModel.verifyPassword(password, admin.password_hash);
    if (!isValidPassword) {
      logger.warn('Admin login failed: Invalid password', { 
        admin_id: admin.id, 
        email, 
        ip: req.ip 
      });
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last login
    await AdminModel.updateLastLogin(admin.id);

    // Generate JWT token
    const token = generateToken({
      id: admin.id,
      email: admin.email,
      role: admin.role
    });

    logger.info('Admin login successful', { 
      admin_id: admin.id, 
      email: admin.email,
      role: admin.role,
      ip: req.ip
    });

    // Log admin action
    await logAdminAction(admin.id, 'LOGIN', 'auth', null, null, {
      ip: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({
      token,
      user: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        last_login: admin.last_login
      }
    });
  })
);

/**
 * POST /admin/auth/logout
 * Admin logout endpoint (mainly for logging purposes)
 */
router.post('/logout',
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    logger.info('Admin logout', { 
      admin_id: user.id, 
      email: user.email,
      ip: req.ip
    });

    // Log admin action
    await logAdminAction(user.id, 'LOGOUT', 'auth', null, null, {
      ip: req.ip
    });

    res.json({
      message: 'Logged out successfully'
    });
  })
);

/**
 * GET /admin/auth/me
 * Get current admin user info
 */
router.get('/me',
  authenticateToken,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    
    // Get fresh admin data
    const admin = await AdminModel.findById(user.id);
    if (!admin) {
      throw new UnauthorizedError('Admin not found');
    }

    res.json({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      last_login: admin.last_login,
      created_at: admin.created_at
    });
  })
);

/**
 * POST /admin/auth/change-password
 * Change admin password
 */
router.post('/change-password',
  authenticateToken,
  validate(adminLoginSchema), // Reuse schema for password validation
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const user = req.user!;
    const { password: currentPassword, new_password } = req.body;

    // Verify current password
    const admin = await AdminModel.findById(user.id);
    if (!admin) {
      throw new UnauthorizedError('Admin not found');
    }

    const isValidPassword = await AdminModel.verifyPassword(currentPassword, admin.password_hash);
    if (!isValidPassword) {
      logger.warn('Password change failed: Invalid current password', { 
        admin_id: user.id,
        ip: req.ip 
      });
      throw new UnauthorizedError('Invalid current password');
    }

    // Update password
    await AdminModel.changePassword(user.id, new_password);

    logger.info('Admin password changed', { 
      admin_id: user.id,
      ip: req.ip
    });

    // Log admin action
    await logAdminAction(user.id, 'CHANGE_PASSWORD', 'admin', user.id, null, null);

    res.json({
      message: 'Password changed successfully'
    });
  })
);

/**
 * Helper function to log admin actions
 */
async function logAdminAction(
  adminUser: string,
  actionType: string,
  resourceAffected: string,
  resourceId: string | null,
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
    // Don't throw here to avoid breaking the main operation
  }
}

export default router;