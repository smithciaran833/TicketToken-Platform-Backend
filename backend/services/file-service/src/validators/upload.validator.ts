import Joi from 'joi';

// File size constants (in bytes)
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024;
const MAX_IMAGE_SIZE = parseInt(process.env.MAX_IMAGE_SIZE_MB || '10') * 1024 * 1024;
const MAX_VIDEO_SIZE = parseInt(process.env.MAX_VIDEO_SIZE_MB || '500') * 1024 * 1024;
const MAX_DOCUMENT_SIZE = parseInt(process.env.MAX_DOCUMENT_SIZE_MB || '50') * 1024 * 1024;

// Allowed MIME types
const ALLOWED_IMAGE_TYPES = (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/gif,image/webp').split(',');
const ALLOWED_DOCUMENT_TYPES = (process.env.ALLOWED_DOCUMENT_TYPES || 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document').split(',');
const ALLOWED_VIDEO_TYPES = (process.env.ALLOWED_VIDEO_TYPES || 'video/mp4,video/quicktime,video/x-msvideo,video/webm').split(',');

const ALL_ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES, ...ALLOWED_VIDEO_TYPES];

/**
 * Schema for generating presigned upload URL
 */
export const generateUploadUrlSchema = Joi.object({
  fileName: Joi.string()
    .min(1)
    .max(255)
    .pattern(/^[a-zA-Z0-9._-]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Filename can only contain alphanumeric characters, dots, underscores, and hyphens',
      'string.empty': 'Filename is required',
      'string.max': 'Filename must not exceed 255 characters'
    }),
  
  contentType: Joi.string()
    .valid(...ALL_ALLOWED_TYPES)
    .required()
    .messages({
      'any.only': `Content type must be one of: ${ALL_ALLOWED_TYPES.join(', ')}`
    }),
  
  fileSize: Joi.number()
    .positive()
    .max(MAX_FILE_SIZE)
    .required()
    .messages({
      'number.max': `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      'number.positive': 'File size must be a positive number'
    }),
  
  entityType: Joi.string()
    .valid('venue', 'event', 'user', 'ticket', 'marketplace', 'other')
    .optional()
    .messages({
      'any.only': 'Entity type must be one of: venue, event, user, ticket, marketplace, other'
    }),
  
  entityId: Joi.string()
    .uuid()
    .optional()
    .messages({
      'string.guid': 'Entity ID must be a valid UUID'
    }),
  
  metadata: Joi.object()
    .optional()
    .max(50) // Maximum 50 keys
    .messages({
      'object.max': 'Metadata can contain a maximum of 50 keys'
    })
}).options({ stripUnknown: true });

/**
 * Schema for confirming upload completion
 */
export const confirmUploadSchema = Joi.object({
  fileKey: Joi.string()
    .required()
    .messages({
      'string.empty': 'File key is required'
    }),
  
  etag: Joi.string()
    .optional(),
  
  metadata: Joi.object()
    .optional()
}).options({ stripUnknown: true });

/**
 * Schema for file deletion
 */
export const deleteFileSchema = Joi.object({
  fileId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'File ID must be a valid UUID',
      'string.empty': 'File ID is required'
    })
});

/**
 * Custom validator to check file size based on content type
 */
export function validateFileSizeForType(fileSize: number, contentType: string): { valid: boolean; error?: string } {
  let maxSize = MAX_FILE_SIZE;
  
  if (contentType.startsWith('image/')) {
    maxSize = MAX_IMAGE_SIZE;
  } else if (contentType.startsWith('video/')) {
    maxSize = MAX_VIDEO_SIZE;
  } else if (contentType.includes('pdf') || contentType.includes('document') || contentType.includes('word')) {
    maxSize = MAX_DOCUMENT_SIZE;
  }
  
  if (fileSize > maxSize) {
    return {
      valid: false,
      error: `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of ${(maxSize / 1024 / 1024).toFixed(0)}MB for ${contentType}`
    };
  }
  
  return { valid: true };
}

/**
 * Validate request body against a schema
 */
export function validateRequest<T>(schema: Joi.ObjectSchema, data: unknown): { value: T; error?: string } {
  const { error, value } = schema.validate(data);
  
  if (error) {
    return {
      value: value as T,
      error: error.details[0]?.message || "Validation failed"
    };
  }
  
  return { value: value as T };
}
