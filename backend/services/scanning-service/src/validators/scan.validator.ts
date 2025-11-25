import * as Joi from 'joi';

// Phase 2.5: Joi validation schemas for scan endpoints

export const scanRequestSchema = Joi.object({
  qr_data: Joi.string()
    .pattern(/^[a-f0-9]+:[0-9]+:[a-f0-9]+:[a-f0-9]+$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid QR code format',
      'any.required': 'QR code data is required'
    }),
  device_id: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Device ID must be a valid UUID',
      'any.required': 'Device ID is required'
    }),
  location: Joi.string().max(200).optional(),
  staff_user_id: Joi.string().uuid().optional(),
  metadata: Joi.object().optional()
});

export const bulkScanRequestSchema = Joi.object({
  scans: Joi.array()
    .items(scanRequestSchema)
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.min': 'At least one scan is required',
      'array.max': 'Maximum 100 scans per request'
    })
});
