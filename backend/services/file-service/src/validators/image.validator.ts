import Joi from 'joi';

/**
 * Schema for image resize operation
 */
export const resizeImageSchema = Joi.object({
  width: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .optional()
    .messages({
      'number.min': 'Width must be at least 1 pixel',
      'number.max': 'Width must not exceed 10000 pixels'
    }),
  
  height: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .optional()
    .messages({
      'number.min': 'Height must be at least 1 pixel',
      'number.max': 'Height must not exceed 10000 pixels'
    }),
  
  fit: Joi.string()
    .valid('cover', 'contain', 'fill', 'inside', 'outside')
    .default('cover')
    .messages({
      'any.only': 'Fit must be one of: cover, contain, fill, inside, outside'
    }),
  
  quality: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(80)
    .messages({
      'number.min': 'Quality must be at least 1',
      'number.max': 'Quality must not exceed 100'
    })
}).or('width', 'height').messages({
  'object.missing': 'At least width or height must be specified'
}).options({ stripUnknown: true });

/**
 * Schema for image crop operation
 */
export const cropImageSchema = Joi.object({
  x: Joi.number()
    .integer()
    .min(0)
    .required()
    .messages({
      'number.base': 'X coordinate must be a number',
      'number.min': 'X coordinate must be non-negative'
    }),
  
  y: Joi.number()
    .integer()
    .min(0)
    .required()
    .messages({
      'number.base': 'Y coordinate must be a number',
      'number.min': 'Y coordinate must be non-negative'
    }),
  
  width: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .required()
    .messages({
      'number.min': 'Width must be at least 1 pixel',
      'number.max': 'Width must not exceed 10000 pixels'
    }),
  
  height: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .required()
    .messages({
      'number.min': 'Height must be at least 1 pixel',
      'number.max': 'Height must not exceed 10000 pixels'
    })
}).options({ stripUnknown: true });

/**
 * Schema for image rotate operation
 */
export const rotateImageSchema = Joi.object({
  angle: Joi.number()
    .valid(90, 180, 270, -90, -180, -270)
    .required()
    .messages({
      'any.only': 'Angle must be one of: 90, 180, 270, -90, -180, -270',
      'any.required': 'Angle is required'
    })
}).options({ stripUnknown: true });

/**
 * Schema for watermark operation
 */
export const watermarkImageSchema = Joi.object({
  text: Joi.string()
    .max(100)
    .default('© TicketToken')
    .messages({
      'string.max': 'Watermark text must not exceed 100 characters'
    }),
  
  opacity: Joi.number()
    .min(0)
    .max(1)
    .default(0.5)
    .messages({
      'number.min': 'Opacity must be at least 0',
      'number.max': 'Opacity must not exceed 1'
    }),
  
  position: Joi.string()
    .valid('top-left', 'top-right', 'bottom-left', 'bottom-right', 'center')
    .default('bottom-right')
    .messages({
      'any.only': 'Position must be one of: top-left, top-right, bottom-left, bottom-right, center'
    })
}).options({ stripUnknown: true });

/**
 * Schema for QR code generation
 */
export const generateQRSchema = Joi.object({
  data: Joi.string()
    .max(4000)
    .required()
    .messages({
      'string.empty': 'QR code data is required',
      'string.max': 'QR code data must not exceed 4000 characters'
    }),
  
  size: Joi.number()
    .integer()
    .min(100)
    .max(2000)
    .default(300)
    .messages({
      'number.min': 'Size must be at least 100 pixels',
      'number.max': 'Size must not exceed 2000 pixels'
    }),
  
  errorCorrectionLevel: Joi.string()
    .valid('L', 'M', 'Q', 'H')
    .default('M')
    .messages({
      'any.only': 'Error correction level must be one of: L, M, Q, H'
    }),
  
  format: Joi.string()
    .valid('png', 'svg')
    .default('png')
    .messages({
      'any.only': 'Format must be png or svg'
    })
}).options({ stripUnknown: true });

/**
 * Common file ID parameter validation
 */
export const fileIdSchema = Joi.string()
  .uuid()
  .required()
  .messages({
    'string.guid': 'File ID must be a valid UUID',
    'string.empty': 'File ID is required'
  });
