import { AdminModel } from '../models/Admin';
import { KnowledgeBaseModel } from '../models/KnowledgeBase';
import { logger } from '../utils/logger';

/**
 * Database seeding script
 * Creates initial data for development and testing
 */
async function seed() {
  try {
    logger.info('Starting database seeding...');

    // Create default admin user
    await createDefaultAdmin();
    
    // Create sample knowledge base entries
    await createSampleKnowledgeBase();

    logger.info('✅ Database seeding completed successfully');

  } catch (error) {
    logger.error('❌ Database seeding failed:', error);
    throw error;
  }
}

/**
 * Create default admin user for initial access
 */
async function createDefaultAdmin() {
  try {
    // Check if admin already exists
    const existingAdmin = await AdminModel.findByEmail('admin@example.com');
    if (existingAdmin) {
      logger.info('Default admin user already exists, skipping creation');
      return;
    }

    // Create default admin
    const admin = await AdminModel.create({
      email: 'admin@example.com',
      password: 'admin123', // Change this in production!
      role: 'super_admin'
    });

    logger.info('✅ Default admin user created', { 
      id: admin.id, 
      email: admin.email 
    });

    logger.warn('⚠️  SECURITY WARNING: Default admin password is "admin123" - CHANGE THIS IN PRODUCTION!');

  } catch (error) {
    logger.error('Failed to create default admin:', error);
    throw error;
  }
}

/**
 * Create sample knowledge base entries for testing
 */
async function createSampleKnowledgeBase() {
  try {
    const sampleEntries = [
      {
        primary_question: 'How do I access my DOI?',
        alternate_questions: [
          'Where can I find my DOI?',
          'DOI access help',
          'Cannot access DOI',
          'How to get DOI'
        ],
        answer_text: 'To access your DOI, please log into your account dashboard and navigate to the Publications section. Your DOI will be listed next to each published item. If you cannot locate your DOI, please check that your publication has been processed and assigned a DOI.',
        category: 'DOI' as const,
        confidence_weight: 0.95
      },
      {
        primary_question: 'What hosting options are available?',
        alternate_questions: [
          'Hosting plans',
          'Available hosting',
          'Hosting services',
          'What hosting do you offer?'
        ],
        answer_text: 'We offer three hosting tiers: Basic (shared hosting with 10GB storage), Professional (VPS with 50GB storage and dedicated resources), and Enterprise (dedicated servers with unlimited storage). Each tier includes different bandwidth limits, support levels, and additional features.',
        category: 'Hosting' as const,
        confidence_weight: 0.90
      },
      {
        primary_question: 'I cannot access my account',
        alternate_questions: [
          'Login issues',
          'Account access problems',
          'Cannot log in',
          'Forgot password',
          'Account locked'
        ],
        answer_text: 'If you cannot access your account, please try the following steps: 1) Reset your password using the "Forgot Password" link on the login page, 2) Clear your browser cache and cookies, 3) Try using a different browser or incognito mode. If issues persist, please contact our support team.',
        category: 'Access' as const,
        confidence_weight: 0.85
      },
      {
        primary_question: 'How do I register a new DOI?',
        alternate_questions: [
          'DOI registration process',
          'Register new DOI',
          'Create DOI',
          'DOI registration steps'
        ],
        answer_text: 'To register a new DOI: 1) Log into your account, 2) Navigate to "Register New DOI" in the Publications section, 3) Fill out the required metadata including title, authors, and publication details, 4) Upload your publication file, 5) Review and submit for processing. DOI assignment typically takes 24-48 hours.',
        category: 'DOI' as const,
        confidence_weight: 0.92
      },
      {
        primary_question: 'What are the hosting bandwidth limits?',
        alternate_questions: [
          'Bandwidth limits',
          'Data transfer limits',
          'Monthly bandwidth',
          'Traffic limits'
        ],
        answer_text: 'Our hosting bandwidth limits are: Basic plan - 100GB/month, Professional plan - 500GB/month, Enterprise plan - Unlimited bandwidth. If you exceed your limit, your site may be temporarily throttled. You can upgrade your plan at any time to increase your bandwidth allowance.',
        category: 'Hosting' as const,
        confidence_weight: 0.88
      },
      {
        primary_question: 'How do I change my account password?',
        alternate_questions: [
          'Change password',
          'Update password',
          'Password change',
          'Reset password'
        ],
        answer_text: 'To change your account password: 1) Log into your account, 2) Go to Account Settings, 3) Click on "Change Password", 4) Enter your current password and new password, 5) Confirm the new password and save changes. Your new password must be at least 8 characters long and include a mix of letters, numbers, and symbols.',
        category: 'Access' as const,
        confidence_weight: 0.90
      }
    ];

    let createdCount = 0;
    for (const entry of sampleEntries) {
      try {
        await KnowledgeBaseModel.create(entry, 'system-seed');
        createdCount++;
      } catch (error) {
        // Skip if entry already exists (duplicate primary_question)
        if (error instanceof Error && error.message.includes('duplicate')) {
          logger.info(`Sample KB entry already exists: ${entry.primary_question}`);
        } else {
          throw error;
        }
      }
    }

    logger.info(`✅ Created ${createdCount} sample knowledge base entries`);

  } catch (error) {
    logger.error('Failed to create sample knowledge base entries:', error);
    throw error;
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seed()
    .then(() => {
      logger.info('Seeding completed, closing database connection');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seed };