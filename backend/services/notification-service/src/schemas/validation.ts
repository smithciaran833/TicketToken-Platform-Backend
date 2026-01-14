/**
 * Request Validation Schemas for Notification Service
 * 
 * AUDIT FIXES:
 * - INP-H1: No array maxItems at schema level → Added maxItems to all arrays
 * - INP-H2: No TypeBox/JSON Schema → JSON Schema definitions
 * - INP-H3: No response schemas → Response schema definitions
 * 
 * Features:
 * - JSON Schema validation
 * - additionalProperties: false (reject unknown fields)
 * - Array size limits
 * - Response schemas for documentation
 */

import { Type, Static } from '@sinclair/typebox';

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

export const UUIDSchema = Type.String({
  format: 'uuid',
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
});

export const EmailSchema = Type.String({
  format: 'email',
  maxLength: 255
});

export const PhoneSchema = Type.String({
  pattern: '^\\+?[1-9]\\d{1,14}$',
  maxLength: 20
});

export const TimestampSchema = Type.String({
  format: 'date-time'
});

// =============================================================================
// NOTIFICATION SCHEMAS - AUDIT FIX INP-H1, INP-H2
// =============================================================================

/**
 * Send Email Request Schema
 */
export const SendEmailRequestSchema = Type.Object({
  to: Type.Union([
    EmailSchema,
    Type.Array(EmailSchema, { maxItems: 100, minItems: 1 })  // AUDIT FIX INP-H1: maxItems
  ]),
  subject: Type.String({ minLength: 1, maxLength: 500 }),
  templateId: Type.Optional(Type.String({ maxLength: 100 })),
  templateData: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  htmlBody: Type.Optional(Type.String({ maxLength: 100000 })),
  textBody: Type.Optional(Type.String({ maxLength: 50000 })),
  from: Type.Optional(EmailSchema),
  replyTo: Type.Optional(EmailSchema),
  cc: Type.Optional(Type.Array(EmailSchema, { maxItems: 20 })),
  bcc: Type.Optional(Type.Array(EmailSchema, { maxItems: 20 })),
  attachments: Type.Optional(Type.Array(Type.Object({
    filename: Type.String({ maxLength: 255 }),
    content: Type.String({ maxLength: 10485760 }),  // 10MB base64
    contentType: Type.String({ maxLength: 100 })
  }), { maxItems: 10 })),  // AUDIT FIX INP-H1: maxItems
  metadata: Type.Optional(Type.Record(Type.String(), Type.String(), {
    additionalProperties: false
  }))
}, { additionalProperties: false });  // AUDIT FIX INP-2: additionalProperties: false

export type SendEmailRequest = Static<typeof SendEmailRequestSchema>;

/**
 * Send SMS Request Schema
 */
export const SendSmsRequestSchema = Type.Object({
  to: Type.Union([
    PhoneSchema,
    Type.Array(PhoneSchema, { maxItems: 100, minItems: 1 })  // AUDIT FIX INP-H1: maxItems
  ]),
  message: Type.String({ minLength: 1, maxLength: 1600 }),  // SMS length limit
  from: Type.Optional(PhoneSchema),
  mediaUrl: Type.Optional(Type.String({ format: 'uri', maxLength: 2000 })),
  metadata: Type.Optional(Type.Record(Type.String(), Type.String()))
}, { additionalProperties: false });

export type SendSmsRequest = Static<typeof SendSmsRequestSchema>;

/**
 * Send Push Notification Request Schema
 */
export const SendPushRequestSchema = Type.Object({
  userIds: Type.Array(UUIDSchema, { maxItems: 1000, minItems: 1 }),  // AUDIT FIX INP-H1
  title: Type.String({ minLength: 1, maxLength: 100 }),
  body: Type.String({ minLength: 1, maxLength: 1000 }),
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  imageUrl: Type.Optional(Type.String({ format: 'uri', maxLength: 2000 })),
  actionUrl: Type.Optional(Type.String({ format: 'uri', maxLength: 2000 })),
  priority: Type.Optional(Type.Union([
    Type.Literal('high'),
    Type.Literal('normal'),
    Type.Literal('low')
  ])),
  ttl: Type.Optional(Type.Integer({ minimum: 0, maximum: 2419200 })),  // Max 28 days
  badge: Type.Optional(Type.Integer({ minimum: 0, maximum: 999 }))
}, { additionalProperties: false });

export type SendPushRequest = Static<typeof SendPushRequestSchema>;

/**
 * Batch Notification Request Schema
 */
export const BatchNotificationRequestSchema = Type.Object({
  notifications: Type.Array(Type.Object({
    channel: Type.Union([
      Type.Literal('email'),
      Type.Literal('sms'),
      Type.Literal('push')
    ]),
    recipient: Type.String({ maxLength: 255 }),
    templateId: Type.String({ maxLength: 100 }),
    templateData: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    scheduledAt: Type.Optional(TimestampSchema)
  }), { maxItems: 1000, minItems: 1 }),  // AUDIT FIX INP-H1: maxItems
  dryRun: Type.Optional(Type.Boolean())
}, { additionalProperties: false });

export type BatchNotificationRequest = Static<typeof BatchNotificationRequestSchema>;

// =============================================================================
// PREFERENCE SCHEMAS
// =============================================================================

export const NotificationPreferencesSchema = Type.Object({
  email: Type.Optional(Type.Object({
    enabled: Type.Boolean(),
    frequency: Type.Union([
      Type.Literal('immediate'),
      Type.Literal('daily'),
      Type.Literal('weekly'),
      Type.Literal('monthly')
    ]),
    categories: Type.Array(Type.String({ maxLength: 50 }), { maxItems: 20 })
  }, { additionalProperties: false })),
  sms: Type.Optional(Type.Object({
    enabled: Type.Boolean(),
    frequency: Type.Union([
      Type.Literal('immediate'),
      Type.Literal('daily'),
      Type.Literal('weekly'),
      Type.Literal('monthly')
    ]),
    categories: Type.Array(Type.String({ maxLength: 50 }), { maxItems: 20 })
  }, { additionalProperties: false })),
  push: Type.Optional(Type.Object({
    enabled: Type.Boolean(),
    categories: Type.Array(Type.String({ maxLength: 50 }), { maxItems: 20 })
  }, { additionalProperties: false })),
  timezone: Type.Optional(Type.String({ maxLength: 50 })),
  language: Type.Optional(Type.String({ minLength: 2, maxLength: 10 })),
  quietHours: Type.Optional(Type.Object({
    enabled: Type.Boolean(),
    start: Type.Integer({ minimum: 0, maximum: 23 }),
    end: Type.Integer({ minimum: 0, maximum: 23 })
  }, { additionalProperties: false }))
}, { additionalProperties: false });

export type NotificationPreferences = Static<typeof NotificationPreferencesSchema>;

// =============================================================================
// CAMPAIGN SCHEMAS
// =============================================================================

export const CreateCampaignRequestSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  channel: Type.Union([
    Type.Literal('email'),
    Type.Literal('sms'),
    Type.Literal('push')
  ]),
  templateId: Type.String({ maxLength: 100 }),
  audience: Type.Object({
    type: Type.Union([
      Type.Literal('all'),
      Type.Literal('segment'),
      Type.Literal('list')
    ]),
    segmentId: Type.Optional(UUIDSchema),
    userIds: Type.Optional(Type.Array(UUIDSchema, { maxItems: 100000 }))
  }, { additionalProperties: false }),
  scheduledAt: Type.Optional(TimestampSchema),
  metadata: Type.Optional(Type.Record(Type.String(), Type.String()))
}, { additionalProperties: false });

export type CreateCampaignRequest = Static<typeof CreateCampaignRequestSchema>;

// =============================================================================
// RESPONSE SCHEMAS - AUDIT FIX INP-H3
// =============================================================================

export const NotificationResponseSchema = Type.Object({
  id: UUIDSchema,
  status: Type.Union([
    Type.Literal('queued'),
    Type.Literal('sending'),
    Type.Literal('sent'),
    Type.Literal('delivered'),
    Type.Literal('failed'),
    Type.Literal('bounced')
  ]),
  channel: Type.String(),
  recipient: Type.String(),
  createdAt: TimestampSchema,
  sentAt: Type.Optional(TimestampSchema),
  deliveredAt: Type.Optional(TimestampSchema),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
});

export type NotificationResponse = Static<typeof NotificationResponseSchema>;

export const BatchNotificationResponseSchema = Type.Object({
  batchId: UUIDSchema,
  totalCount: Type.Integer({ minimum: 0 }),
  queuedCount: Type.Integer({ minimum: 0 }),
  failedCount: Type.Integer({ minimum: 0 }),
  errors: Type.Optional(Type.Array(Type.Object({
    index: Type.Integer(),
    error: Type.String()
  }), { maxItems: 100 }))
});

export type BatchNotificationResponse = Static<typeof BatchNotificationResponseSchema>;

export const ErrorResponseSchema = Type.Object({
  type: Type.String({ format: 'uri' }),
  title: Type.String(),
  status: Type.Integer(),
  detail: Type.String(),
  instance: Type.Optional(Type.String()),
  code: Type.Optional(Type.String())
});

export type ErrorResponse = Static<typeof ErrorResponseSchema>;

// =============================================================================
// FASTIFY SCHEMA HELPERS
// =============================================================================

/**
 * Convert TypeBox schema to Fastify schema format
 */
export function toFastifySchema(schema: any, description?: string) {
  return {
    body: schema,
    response: {
      200: NotificationResponseSchema,
      400: ErrorResponseSchema,
      401: ErrorResponseSchema,
      429: ErrorResponseSchema,
      500: ErrorResponseSchema
    }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  SendEmailRequestSchema,
  SendSmsRequestSchema,
  SendPushRequestSchema,
  BatchNotificationRequestSchema,
  NotificationPreferencesSchema,
  CreateCampaignRequestSchema,
  NotificationResponseSchema,
  BatchNotificationResponseSchema,
  ErrorResponseSchema,
  toFastifySchema
};
