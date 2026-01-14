/**
 * File Service - Fastify JSON Schema Definitions
 * 
 * AUDIT FIXES:
 * - INP-1: NO Fastify schema on ANY route → Complete schema definitions
 * - INP-2: Validators NOT integrated → Type-safe body validation
 * - INP-5: UUID params not validated → format: 'uuid' on all route params
 * - INP-H1: No response schemas → Complete response schemas
 */

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

export const uuidParamSchema = {
  type: 'object',
  required: ['fileId'],
  properties: {
    fileId: { type: 'string', format: 'uuid' }
  }
} as const;

export const idParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' }
  }
} as const;

export const errorResponseSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string' }
  }
} as const;

export const successResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' }
  }
} as const;

// =============================================================================
// UPLOAD SCHEMAS
// =============================================================================

export const generateUploadUrlBodySchema = {
  type: 'object',
  required: ['filename', 'mimeType'],
  properties: {
    filename: { type: 'string', minLength: 1, maxLength: 255 },
    mimeType: { type: 'string', minLength: 1, maxLength: 127 },
    size: { type: 'integer', minimum: 1, maximum: 104857600 }, // 100MB max
    entityType: { type: 'string', enum: ['ticket', 'event', 'user', 'venue', 'other'] },
    entityId: { type: 'string', format: 'uuid' },
    metadata: { type: 'object', additionalProperties: true }
  },
  additionalProperties: false
} as const;

export const confirmUploadBodySchema = {
  type: 'object',
  required: ['uploadId', 'key'],
  properties: {
    uploadId: { type: 'string', format: 'uuid' },
    key: { type: 'string', minLength: 1, maxLength: 1024 },
    etag: { type: 'string' }
  },
  additionalProperties: false
} as const;

export const uploadResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    fileId: { type: 'string', format: 'uuid' },
    uploadUrl: { type: 'string', format: 'uri' },
    key: { type: 'string' },
    expiresAt: { type: 'string', format: 'date-time' }
  }
} as const;

// =============================================================================
// IMAGE SCHEMAS
// =============================================================================

export const resizeBodySchema = {
  type: 'object',
  required: ['width', 'height'],
  properties: {
    width: { type: 'integer', minimum: 1, maximum: 10000 },
    height: { type: 'integer', minimum: 1, maximum: 10000 },
    fit: { type: 'string', enum: ['cover', 'contain', 'fill', 'inside', 'outside'] }
  },
  additionalProperties: false
} as const;

export const cropBodySchema = {
  type: 'object',
  required: ['x', 'y', 'width', 'height'],
  properties: {
    x: { type: 'integer', minimum: 0, maximum: 10000 },
    y: { type: 'integer', minimum: 0, maximum: 10000 },
    width: { type: 'integer', minimum: 1, maximum: 10000 },
    height: { type: 'integer', minimum: 1, maximum: 10000 }
  },
  additionalProperties: false
} as const;

export const rotateBodySchema = {
  type: 'object',
  required: ['angle'],
  properties: {
    angle: { type: 'integer', minimum: -360, maximum: 360 }
  },
  additionalProperties: false
} as const;

export const watermarkBodySchema = {
  type: 'object',
  properties: {
    text: { type: 'string', minLength: 1, maxLength: 100 },
    position: { type: 'string', enum: ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] },
    opacity: { type: 'number', minimum: 0, maximum: 1 },
    fontSize: { type: 'integer', minimum: 10, maximum: 200 }
  },
  additionalProperties: false
} as const;

export const imageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    url: { type: 'string' },
    width: { type: 'integer' },
    height: { type: 'integer' },
    angle: { type: 'integer' }
  }
} as const;

// =============================================================================
// DOCUMENT SCHEMAS
// =============================================================================

export const documentPageParamsSchema = {
  type: 'object',
  required: ['fileId', 'pageNumber'],
  properties: {
    fileId: { type: 'string', format: 'uuid' },
    pageNumber: { type: 'integer', minimum: 1 }
  }
} as const;

export const convertFormatBodySchema = {
  type: 'object',
  required: ['format'],
  properties: {
    format: { type: 'string', enum: ['pdf', 'png', 'jpg', 'docx', 'txt'] },
    quality: { type: 'integer', minimum: 1, maximum: 100 },
    dpi: { type: 'integer', minimum: 72, maximum: 600 }
  },
  additionalProperties: false
} as const;

// =============================================================================
// VIDEO SCHEMAS
// =============================================================================

export const transcodeBodySchema = {
  type: 'object',
  required: ['format'],
  properties: {
    format: { type: 'string', enum: ['mp4', 'webm', 'mov', 'avi'] },
    quality: { type: 'string', enum: ['low', 'medium', 'high', 'original'] },
    resolution: { type: 'string', enum: ['360p', '480p', '720p', '1080p', 'original'] },
    codec: { type: 'string', enum: ['h264', 'h265', 'vp9', 'av1'] }
  },
  additionalProperties: false
} as const;

// =============================================================================
// QR CODE SCHEMAS
// =============================================================================

export const generateQRBodySchema = {
  type: 'object',
  required: ['data'],
  properties: {
    data: { type: 'string', minLength: 1, maxLength: 4296 },
    size: { type: 'integer', minimum: 100, maximum: 2000 },
    format: { type: 'string', enum: ['png', 'svg', 'jpeg'] },
    errorCorrectionLevel: { type: 'string', enum: ['L', 'M', 'Q', 'H'] },
    margin: { type: 'integer', minimum: 0, maximum: 10 },
    darkColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
    lightColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' }
  },
  additionalProperties: false
} as const;

export const generateStoreQRBodySchema = {
  type: 'object',
  required: ['data'],
  properties: {
    data: { type: 'string', minLength: 1, maxLength: 4296 },
    size: { type: 'integer', minimum: 100, maximum: 2000 },
    entityType: { type: 'string' },
    entityId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
} as const;

// =============================================================================
// ADMIN SCHEMAS
// =============================================================================

/**
 * AUDIT FIX INP-3: bulkDelete no array limit
 * Max 100 items per bulk operation
 */
export const bulkDeleteBodySchema = {
  type: 'object',
  required: ['fileIds'],
  properties: {
    fileIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      minItems: 1,
      maxItems: 100 // AUDIT FIX: Limit bulk operations
    }
  },
  additionalProperties: false
} as const;

export const adminStatsResponseSchema = {
  type: 'object',
  properties: {
    overview: {
      type: 'object',
      properties: {
        total_files: { type: 'string' },
        total_bytes: { type: 'string' },
        unique_users: { type: 'string' },
        ready_files: { type: 'string' },
        failed_files: { type: 'string' },
        images: { type: 'string' },
        videos: { type: 'string' },
        pdfs: { type: 'string' }
      }
    },
    byEntity: { type: 'array' },
    recentFiles: { type: 'array' }
  }
} as const;

export const bulkDeleteResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    deleted: { type: 'integer' }
  }
} as const;

// =============================================================================
// DOWNLOAD SCHEMAS
// =============================================================================

export const downloadQuerySchema = {
  type: 'object',
  properties: {
    disposition: { type: 'string', enum: ['inline', 'attachment'] },
    filename: { type: 'string', maxLength: 255 }
  }
} as const;

// =============================================================================
// HEALTH SCHEMAS
// =============================================================================

export const healthResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['healthy', 'unhealthy', 'degraded'] },
    timestamp: { type: 'string', format: 'date-time' },
    uptime: { type: 'integer' },
    version: { type: 'string' },
    service: { type: 'string' },
    checks: { type: 'object' }
  }
} as const;

export const liveResponseSchema = {
  type: 'object',
  properties: {
    status: { type: 'string' }
  }
} as const;

export const readyResponseSchema = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    checks: { type: 'object' }
  }
} as const;

// =============================================================================
// FULL ROUTE SCHEMAS
// =============================================================================

export const schemas = {
  // Upload routes
  generateUploadUrl: {
    body: generateUploadUrlBodySchema,
    response: {
      200: uploadResponseSchema,
      400: errorResponseSchema,
      401: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  confirmUpload: {
    body: confirmUploadBodySchema,
    response: {
      200: { type: 'object', properties: { success: { type: 'boolean' }, file: { type: 'object' } } },
      400: errorResponseSchema,
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  deleteFile: {
    params: uuidParamSchema,
    response: {
      200: successResponseSchema,
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },

  // Image routes
  resize: {
    params: uuidParamSchema,
    body: resizeBodySchema,
    response: {
      200: imageResponseSchema,
      400: errorResponseSchema,
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  crop: {
    params: uuidParamSchema,
    body: cropBodySchema,
    response: {
      200: imageResponseSchema,
      400: errorResponseSchema,
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  rotate: {
    params: uuidParamSchema,
    body: rotateBodySchema,
    response: {
      200: imageResponseSchema,
      400: errorResponseSchema,
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  watermark: {
    params: uuidParamSchema,
    body: watermarkBodySchema,
    response: {
      200: imageResponseSchema,
      400: errorResponseSchema,
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  imageMetadata: {
    params: uuidParamSchema,
    response: {
      200: { type: 'object', properties: { file: { type: 'object' }, stored: { type: 'object' } } },
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },

  // Document routes
  documentPreview: {
    params: uuidParamSchema,
    response: {
      200: { type: 'object' },
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  documentPage: {
    params: documentPageParamsSchema,
    response: {
      200: { type: 'object' },
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  convertFormat: {
    params: uuidParamSchema,
    body: convertFormatBodySchema,
    response: {
      200: { type: 'object', properties: { success: { type: 'boolean' }, url: { type: 'string' } } },
      400: errorResponseSchema,
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  extractText: {
    params: uuidParamSchema,
    response: {
      200: { type: 'object', properties: { text: { type: 'string' } } },
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },

  // Video routes
  videoPreview: {
    params: uuidParamSchema,
    response: {
      200: { type: 'object' },
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  transcode: {
    params: uuidParamSchema,
    body: transcodeBodySchema,
    response: {
      200: { type: 'object', properties: { success: { type: 'boolean' }, jobId: { type: 'string' } } },
      400: errorResponseSchema,
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  videoMetadata: {
    params: uuidParamSchema,
    response: {
      200: { type: 'object' },
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },

  // QR routes
  generateQR: {
    body: generateQRBodySchema,
    response: {
      200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'string' } } },
      400: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  generateStoreQR: {
    body: generateStoreQRBodySchema,
    response: {
      200: { type: 'object', properties: { success: { type: 'boolean' }, fileId: { type: 'string' }, url: { type: 'string' } } },
      400: errorResponseSchema,
      500: errorResponseSchema
    }
  },

  // Download routes
  download: {
    params: uuidParamSchema,
    querystring: downloadQuerySchema,
    response: {
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },
  stream: {
    params: uuidParamSchema,
    querystring: downloadQuerySchema,
    response: {
      404: errorResponseSchema,
      500: errorResponseSchema
    }
  },

  // Admin routes
  adminStats: {
    response: {
      200: adminStatsResponseSchema,
      500: errorResponseSchema
    }
  },
  cleanup: {
    response: {
      200: { type: 'object', properties: { success: { type: 'boolean' }, orphanedFiles: { type: 'integer' }, tempFilesCleaned: { type: 'integer' } } },
      500: errorResponseSchema
    }
  },
  bulkDelete: {
    body: bulkDeleteBodySchema,
    response: {
      200: bulkDeleteResponseSchema,
      400: errorResponseSchema,
      500: errorResponseSchema
    }
  },

  // Health routes
  live: {
    response: {
      200: liveResponseSchema
    }
  },
  ready: {
    response: {
      200: readyResponseSchema,
      503: readyResponseSchema
    }
  },
  health: {
    response: {
      200: healthResponseSchema,
      503: healthResponseSchema
    }
  }
} as const;

export default schemas;
