/**
 * Validation Schemas for Scanning Service
 *
 * Fixes INP-1: Adds schema validation to all routes
 * Fixes INP-2: Adds body validation to all POST/PUT routes
 * Fixes INP-3: Validates UUID params with format: 'uuid'
 *
 * Uses Fastify JSON Schema validation with strict mode
 */

// ============================================
// Common Schema Components
// ============================================

const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

const commonHeaders = {
  type: 'object' as const,
  properties: {
    authorization: { type: 'string', pattern: '^Bearer .+$' },
    'x-correlation-id': { type: 'string', minLength: 8, maxLength: 128 },
    'x-tenant-id': { type: 'string', format: 'uuid' },
  },
  required: ['authorization'],
};

const paginationQuerystring = {
  type: 'object' as const,
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    sort: { type: 'string', enum: ['created_at', 'updated_at', '-created_at', '-updated_at'] },
  },
};

const errorResponse = {
  type: 'object' as const,
  properties: {
    type: { type: 'string', format: 'uri' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string' },
    timestamp: { type: 'string', format: 'date-time' },
    correlationId: { type: 'string' },
  },
  required: ['type', 'title', 'status', 'timestamp'],
};

const successResponse = {
  type: 'object' as const,
  properties: {
    success: { type: 'boolean', const: true },
    data: { type: 'object' },
    meta: { type: 'object' },
  },
};

// ============================================
// QR Routes Schemas
// ============================================

export const generateQRSchema = {
  description: 'Generate a QR code for a ticket',
  tags: ['QR'],
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    properties: {
      ticketId: {
        type: 'string',
        format: 'uuid',
        description: 'The ticket ID to generate QR code for'
      },
    },
    required: ['ticketId'],
  },
  headers: commonHeaders,
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        qr_code: { type: 'string', description: 'Base64 encoded QR code image' },
        qr_data: { type: 'string', description: 'Raw QR data string' },
        expires_at: { type: 'string', format: 'date-time' },
        rotation_interval_ms: { type: 'integer' },
      },
      required: ['success', 'qr_data'],
    },
    400: errorResponse,
    401: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
};

export const validateQRSchema = {
  description: 'Validate a QR code',
  tags: ['QR'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  body: {
    type: 'object',
    properties: {
      qr_data: {
        type: 'string',
        minLength: 10,
        maxLength: 1000,
        description: 'QR code data string to validate'
      },
      device_id: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the scanning device'
      },
      location: {
        type: 'object',
        properties: {
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
          accuracy: { type: 'number', minimum: 0 },
        },
      },
    },
    required: ['qr_data'],
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        valid: { type: 'boolean' },
        ticket_id: { type: 'string', format: 'uuid' },
        event_id: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['VALID', 'INVALID', 'EXPIRED', 'ALREADY_USED'] },
        message: { type: 'string' },
      },
      required: ['success', 'valid'],
    },
    400: errorResponse,
    401: errorResponse,
    409: errorResponse,
    500: errorResponse,
  },
};

// ============================================
// Device Routes Schemas
// ============================================

export const registerDeviceSchema = {
  description: 'Register a new scanning device',
  tags: ['Devices'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  body: {
    type: 'object',
    properties: {
      device_name: {
        type: 'string',
        minLength: 1,
        maxLength: 100,
        pattern: '^[a-zA-Z0-9\\s\\-_]+$',
        description: 'Human-readable device name'
      },
      device_type: {
        type: 'string',
        enum: ['MOBILE', 'TABLET', 'HANDHELD_SCANNER', 'TURNSTILE', 'KIOSK'],
        description: 'Type of scanning device'
      },
      venue_id: {
        type: 'string',
        format: 'uuid',
        description: 'Venue where device is located'
      },
      location_id: {
        type: 'string',
        format: 'uuid',
        description: 'Specific location/gate within venue'
      },
      hardware_id: {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        description: 'Unique hardware identifier'
      },
      capabilities: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['QR_SCAN', 'NFC', 'BARCODE', 'FACIAL_RECOGNITION', 'OFFLINE_MODE'],
        },
        description: 'Device capabilities'
      },
    },
    required: ['device_name', 'device_type', 'venue_id'],
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        device_id: { type: 'string', format: 'uuid' },
        device_token: { type: 'string', description: 'Token for device authentication' },
        expires_at: { type: 'string', format: 'date-time' },
      },
      required: ['success', 'device_id', 'device_token'],
    },
    400: errorResponse,
    401: errorResponse,
    409: errorResponse,
    500: errorResponse,
  },
};

export const listDevicesSchema = {
  description: 'List all registered devices',
  tags: ['Devices'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  querystring: {
    type: 'object',
    properties: {
      ...paginationQuerystring.properties,
      venue_id: { type: 'string', format: 'uuid' },
      device_type: { type: 'string', enum: ['MOBILE', 'TABLET', 'HANDHELD_SCANNER', 'TURNSTILE', 'KIOSK'] },
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'REVOKED'] },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        devices: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              device_name: { type: 'string' },
              device_type: { type: 'string' },
              venue_id: { type: 'string', format: 'uuid' },
              status: { type: 'string' },
              last_seen: { type: 'string', format: 'date-time' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            total_pages: { type: 'integer' },
          },
        },
      },
      required: ['success', 'devices'],
    },
    401: errorResponse,
    500: errorResponse,
  },
};

export const getDeviceSchema = {
  description: 'Get device details by ID',
  tags: ['Devices'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  params: {
    type: 'object',
    properties: {
      deviceId: { type: 'string', format: 'uuid' },
    },
    required: ['deviceId'],
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        device: { type: 'object' },
      },
    },
    401: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
};

export const updateDeviceSchema = {
  description: 'Update device settings',
  tags: ['Devices'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  params: {
    type: 'object',
    properties: {
      deviceId: { type: 'string', format: 'uuid' },
    },
    required: ['deviceId'],
  },
  body: {
    type: 'object',
    properties: {
      device_name: { type: 'string', minLength: 1, maxLength: 100 },
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
      location_id: { type: 'string', format: 'uuid' },
    },
    additionalProperties: false,
    minProperties: 1,
  },
  response: {
    200: { type: 'object', properties: { success: { type: 'boolean' }, device: { type: 'object' } } },
    400: errorResponse,
    401: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
};

// ============================================
// Offline Routes Schemas
// ============================================

export const getOfflineManifestSchema = {
  description: 'Get offline manifest for device',
  tags: ['Offline'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  querystring: {
    type: 'object',
    properties: {
      device_id: { type: 'string', format: 'uuid' },
      venue_id: { type: 'string', format: 'uuid' },
      event_id: { type: 'string', format: 'uuid' },
      since: { type: 'string', format: 'date-time', description: 'Get changes since timestamp' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        manifest_version: { type: 'string' },
        generated_at: { type: 'string', format: 'date-time' },
        valid_until: { type: 'string', format: 'date-time' },
        tickets: { type: 'array', items: { type: 'object' } },
        policies: { type: 'array', items: { type: 'object' } },
        checksum: { type: 'string' },
      },
      required: ['success', 'manifest_version', 'generated_at'],
    },
    401: errorResponse,
    500: errorResponse,
  },
};

export const reconcileOfflineScansSchema = {
  description: 'Reconcile offline scans with server',
  tags: ['Offline'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  body: {
    type: 'object',
    properties: {
      device_id: { type: 'string', format: 'uuid' },
      scans: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            scan_id: { type: 'string', format: 'uuid' },
            ticket_id: { type: 'string', format: 'uuid' },
            qr_data: { type: 'string', minLength: 10, maxLength: 1000 },
            scanned_at: { type: 'string', format: 'date-time' },
            result: { type: 'string', enum: ['ACCEPTED', 'REJECTED', 'PENDING'] },
            offline: { type: 'boolean', const: true },
            location: {
              type: 'object',
              properties: {
                latitude: { type: 'number' },
                longitude: { type: 'number' },
              },
            },
          },
          required: ['scan_id', 'ticket_id', 'scanned_at', 'result', 'offline'],
        },
        minItems: 1,
        maxItems: 1000,
      },
      manifest_version: { type: 'string', description: 'Version of manifest used offline' },
    },
    required: ['device_id', 'scans'],
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        reconciled: { type: 'integer' },
        conflicts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              scan_id: { type: 'string', format: 'uuid' },
              ticket_id: { type: 'string', format: 'uuid' },
              conflict_type: { type: 'string' },
              resolution: { type: 'string' },
            },
          },
        },
        server_time: { type: 'string', format: 'date-time' },
      },
      required: ['success', 'reconciled'],
    },
    400: errorResponse,
    401: errorResponse,
    409: errorResponse,
    500: errorResponse,
  },
};

// ============================================
// Policy Routes Schemas
// ============================================

export const createPolicySchema = {
  description: 'Create a new entry policy',
  tags: ['Policies'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      description: { type: 'string', maxLength: 500 },
      venue_id: { type: 'string', format: 'uuid' },
      event_id: { type: 'string', format: 'uuid' },
      rules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['TIME_WINDOW', 'MAX_ENTRIES', 'GATE_RESTRICTION', 'AGE_RESTRICTION', 'REENTRY_ALLOWED']
            },
            config: { type: 'object' },
          },
          required: ['type', 'config'],
        },
        minItems: 1,
      },
      priority: { type: 'integer', minimum: 0, maximum: 100, default: 50 },
      active: { type: 'boolean', default: true },
    },
    required: ['name', 'venue_id', 'rules'],
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        policy_id: { type: 'string', format: 'uuid' },
      },
    },
    400: errorResponse,
    401: errorResponse,
    409: errorResponse,
    500: errorResponse,
  },
};

export const listPoliciesSchema = {
  description: 'List entry policies',
  tags: ['Policies'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  querystring: {
    type: 'object',
    properties: {
      ...paginationQuerystring.properties,
      venue_id: { type: 'string', format: 'uuid' },
      event_id: { type: 'string', format: 'uuid' },
      active: { type: 'boolean' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        policies: { type: 'array', items: { type: 'object' } },
        pagination: { type: 'object' },
      },
    },
    401: errorResponse,
    500: errorResponse,
  },
};

export const getPolicySchema = {
  description: 'Get policy by ID',
  tags: ['Policies'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  params: {
    type: 'object',
    properties: {
      policyId: { type: 'string', format: 'uuid' },
    },
    required: ['policyId'],
  },
  response: {
    200: { type: 'object', properties: { success: { type: 'boolean' }, policy: { type: 'object' } } },
    401: errorResponse,
    404: errorResponse,
    500: errorResponse,
  },
};

export const applyPolicySchema = {
  description: 'Apply/evaluate a policy for a scan',
  tags: ['Policies'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  body: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', format: 'uuid' },
      policy_id: { type: 'string', format: 'uuid' },
      context: {
        type: 'object',
        properties: {
          device_id: { type: 'string', format: 'uuid' },
          gate_id: { type: 'string', format: 'uuid' },
          timestamp: { type: 'string', format: 'date-time' },
          attendee_age: { type: 'integer', minimum: 0, maximum: 150 },
        },
      },
    },
    required: ['ticket_id'],
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        allowed: { type: 'boolean' },
        policies_evaluated: { type: 'array', items: { type: 'string', format: 'uuid' } },
        violations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              policy_id: { type: 'string', format: 'uuid' },
              rule_type: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      required: ['success', 'allowed'],
    },
    400: errorResponse,
    401: errorResponse,
    403: errorResponse,
    500: errorResponse,
  },
};

// ============================================
// Scan Routes Schemas (existing route with validation)
// ============================================

export const processScanSchema = {
  description: 'Process a ticket scan',
  tags: ['Scan'],
  security: [{ bearerAuth: [] }],
  headers: commonHeaders,
  body: {
    type: 'object',
    properties: {
      qr_data: { type: 'string', minLength: 10, maxLength: 1000 },
      device_id: { type: 'string', format: 'uuid' },
      venue_id: { type: 'string', format: 'uuid' },
      gate_id: { type: 'string', format: 'uuid' },
      scan_type: { type: 'string', enum: ['ENTRY', 'EXIT', 'REENTRY'] },
      location: {
        type: 'object',
        properties: {
          latitude: { type: 'number', minimum: -90, maximum: 90 },
          longitude: { type: 'number', minimum: -180, maximum: 180 },
        },
      },
    },
    required: ['qr_data', 'device_id'],
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        scan_result: { type: 'string', enum: ['ACCEPTED', 'REJECTED', 'PENDING'] },
        ticket: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            event_name: { type: 'string' },
            ticket_type: { type: 'string' },
            holder_name: { type: 'string' },
          },
        },
        message: { type: 'string' },
        rejection_reason: { type: 'string' },
      },
      required: ['success', 'scan_result'],
    },
    400: errorResponse,
    401: errorResponse,
    409: errorResponse,
    500: errorResponse,
  },
};

// ============================================
// Type Exports for Route Handlers
// ============================================

export interface GenerateQRParams {
  ticketId: string;
}

export interface ValidateQRBody {
  qr_data: string;
  device_id?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export interface RegisterDeviceBody {
  device_name: string;
  device_type: 'MOBILE' | 'TABLET' | 'HANDHELD_SCANNER' | 'TURNSTILE' | 'KIOSK';
  venue_id: string;
  location_id?: string;
  hardware_id?: string;
  capabilities?: string[];
}

export interface ReconcileScansBody {
  device_id: string;
  scans: Array<{
    scan_id: string;
    ticket_id: string;
    qr_data?: string;
    scanned_at: string;
    result: 'ACCEPTED' | 'REJECTED' | 'PENDING';
    offline: true;
    location?: { latitude: number; longitude: number };
  }>;
  manifest_version?: string;
}

export interface CreatePolicyBody {
  name: string;
  description?: string;
  venue_id: string;
  event_id?: string;
  rules: Array<{ type: string; config: Record<string, unknown> }>;
  priority?: number;
  active?: boolean;
}

export interface ApplyPolicyBody {
  ticket_id: string;
  policy_id?: string;
  context?: {
    device_id?: string;
    gate_id?: string;
    timestamp?: string;
    attendee_age?: number;
  };
}

export interface ProcessScanBody {
  qr_data: string;
  device_id: string;
  venue_id?: string;
  gate_id?: string;
  scan_type?: 'ENTRY' | 'EXIT' | 'REENTRY';
  location?: { latitude: number; longitude: number };
}
