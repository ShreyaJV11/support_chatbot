import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils/logger';

/**
 * Generic validation middleware factory
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      logger.warn('Validation failed', { 
        path: req.path,
        errors: errorDetails,
        body: req.body 
      });

      return res.status(400).json({
        error: 'Validation failed',
        details: errorDetails
      });
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

/**
 * Chat request validation schema
 */
export const chatRequestSchema = Joi.object({
  user_question: Joi.string()
    .trim()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.empty': 'Question cannot be empty',
      'string.max': 'Question cannot exceed 1000 characters',
      'any.required': 'Question is required'
    }),
  user_session_id: Joi.string()
    .trim()
    .max(100)
    .optional(),
  user_info: Joi.object({
    name: Joi.string().trim().max(100).optional(),
    email: Joi.string().email().max(100).optional(),
    organization: Joi.string().trim().max(100).optional()
  }).optional()
});

/**
 * Admin login validation schema
 */
export const adminLoginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
  password: Joi.string()
    .min(6)
    .required()
    .messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'Password is required'
    })
});

/**
 * Knowledge base entry validation schema
 */
export const knowledgeBaseCreateSchema = Joi.object({
  primary_question: Joi.string()
    .trim()
    .min(5)
    .max(500)
    .required()
    .messages({
      'string.min': 'Primary question must be at least 5 characters long',
      'string.max': 'Primary question cannot exceed 500 characters',
      'any.required': 'Primary question is required'
    }),
  alternate_questions: Joi.array()
    .items(Joi.string().trim().min(1).max(500))
    .max(10)
    .default([])
    .messages({
      'array.max': 'Cannot have more than 10 alternate questions'
    }),
  answer_text: Joi.string()
    .trim()
    .min(10)
    .max(2000)
    .required()
    .messages({
      'string.min': 'Answer must be at least 10 characters long',
      'string.max': 'Answer cannot exceed 2000 characters',
      'any.required': 'Answer is required'
    }),
  category: Joi.string()
    .valid('DOI', 'Access', 'Hosting')
    .required()
    .messages({
      'any.only': 'Category must be one of: DOI, Access, Hosting',
      'any.required': 'Category is required'
    }),
  confidence_weight: Joi.number()
    .min(0.0)
    .max(1.0)
    .default(1.0)
    .messages({
      'number.min': 'Confidence weight must be between 0.0 and 1.0',
      'number.max': 'Confidence weight must be between 0.0 and 1.0'
    })
});

/**
 * Knowledge base update validation schema
 */
export const knowledgeBaseUpdateSchema = Joi.object({
  primary_question: Joi.string()
    .trim()
    .min(5)
    .max(500)
    .optional(),
  alternate_questions: Joi.array()
    .items(Joi.string().trim().min(1).max(500))
    .max(10)
    .optional(),
  answer_text: Joi.string()
    .trim()
    .min(10)
    .max(2000)
    .optional(),
  category: Joi.string()
    .valid('DOI', 'Access', 'Hosting')
    .optional(),
  confidence_weight: Joi.number()
    .min(0.0)
    .max(1.0)
    .optional(),
  status: Joi.string()
    .valid('active', 'inactive')
    .optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

/**
 * Pagination validation schema
 */
export const paginationSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
});

/**
 * Query parameter validation middleware
 */
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.query, { 
      abortEarly: false,
      stripUnknown: true 
    });

    if (error) {
      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        error: 'Query validation failed',
        details: errorDetails
      });
    }

    req.query = value;
    next();
  };
};

/**
 * UUID parameter validation
 */
export const validateUUID = (paramName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuid = req.params[paramName];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(uuid)) {
      return res.status(400).json({
        error: `Invalid ${paramName} format. Must be a valid UUID.`
      });
    }
    
    next();
  };
};