/**
 * Unit Tests for schemas/validation.ts
 * 
 * Tests Zod validation schemas for minting service including ticket metadata,
 * batch minting, NFT metadata (Metaplex), webhooks, and internal requests.
 * Priority: 🟠 High (40+ tests)
 */

import { z } from 'zod';
import {
  ticketMetadataSchema,
  ticketMintDataSchema,
  batchMintSchema,
  mintQuerySchema,
  reconcileSchema,
  dlqRequeueSchema,
  nftMetadataSchema,
  nftAttributeSchema,
  nftFileSchema,
  nftPropertiesSchema,
  webhookMintPayloadSchema,
  internalMintRequestSchema,
  validate,
  safeValidate,
  formatValidationErrors,
} from '../../../src/schemas/validation';

// =============================================================================
// Test Data Helpers
// =============================================================================

const validUUID = '123e4567-e89b-12d3-a456-426614174000';
const validSolanaAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

// =============================================================================
// Helper Functions Tests
// =============================================================================

describe('Validation Helper Functions', () => {
  describe('validate', () => {
    const simpleSchema = z.object({
      name: z.string(),
      age: z.number()
    });

    it('should return parsed data on success', () => {
      const data = { name: 'Test', age: 25 };
      const result = validate(simpleSchema, data);
      
      expect(result).toEqual(data);
    });

    it('should throw on failure', () => {
      const invalidData = { name: 'Test', age: 'not a number' };
      
      expect(() => validate(simpleSchema, invalidData)).toThrow();
    });

    it('should throw ZodError with details', () => {
      const invalidData = { name: 123, age: 'not a number' };
      
      try {
        validate(simpleSchema, invalidData);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
      }
    });
  });

  describe('safeValidate', () => {
    const simpleSchema = z.object({
      name: z.string(),
      count: z.number()
    });

    it('should return { success: true, data } on success', () => {
      const data = { name: 'Test', count: 42 };
      const result = safeValidate(simpleSchema, data);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(data);
      }
    });

    it('should return { success: false, error } on failure', () => {
      const invalidData = { name: 'Test', count: 'not a number' };
      const result = safeValidate(simpleSchema, invalidData);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(z.ZodError);
      }
    });
  });

  describe('formatValidationErrors', () => {
    it('should format Zod errors', () => {
      const schema = z.object({
        name: z.string().min(1, 'Name is required'),
        email: z.string().email('Invalid email')
      });

      const result = schema.safeParse({ name: '', email: 'invalid' });
      
      if (!result.success) {
        const formatted = formatValidationErrors(result.error);
        expect(formatted).toBeInstanceOf(Array);
        expect(formatted.length).toBeGreaterThan(0);
        expect(formatted[0]).toHaveProperty('field');
        expect(formatted[0]).toHaveProperty('message');
      }
    });

    it('should join paths with dots', () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            name: z.string().min(1)
          })
        })
      });

      const result = schema.safeParse({ user: { profile: { name: '' } } });
      
      if (!result.success) {
        const formatted = formatValidationErrors(result.error);
        const nestedError = formatted.find(e => e.field.includes('.'));
        expect(nestedError?.field).toBe('user.profile.name');
      }
    });
  });
});

// =============================================================================
// ticketMetadataSchema Tests
// =============================================================================

describe('ticketMetadataSchema', () => {
  it('should accept valid metadata', () => {
    const validMetadata = {
      eventName: 'Concert 2024',
      eventDate: '2024-12-31',
      venue: 'Madison Square Garden',
      tier: 'VIP',
      seatNumber: 'A1',
      section: 'Floor',
      row: '1',
      image: 'https://example.com/ticket.png'
    };

    const result = ticketMetadataSchema.safeParse(validMetadata);
    expect(result.success).toBe(true);
  });

  it('should accept optional eventName', () => {
    const result = ticketMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept optional eventDate', () => {
    const result = ticketMetadataSchema.safeParse({ eventName: 'Test' });
    expect(result.success).toBe(true);
  });

  it('should accept optional venue', () => {
    const result = ticketMetadataSchema.safeParse({ eventName: 'Test' });
    expect(result.success).toBe(true);
  });

  it('should accept optional tier', () => {
    const result = ticketMetadataSchema.safeParse({ eventName: 'Test' });
    expect(result.success).toBe(true);
  });

  it('should accept optional seatNumber', () => {
    const result = ticketMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept optional section', () => {
    const result = ticketMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept optional row', () => {
    const result = ticketMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should validate image as URL', () => {
    const withValidUrl = ticketMetadataSchema.safeParse({
      image: 'https://example.com/image.png'
    });
    expect(withValidUrl.success).toBe(true);

    const withInvalidUrl = ticketMetadataSchema.safeParse({
      image: 'not-a-url'
    });
    expect(withInvalidUrl.success).toBe(false);
  });

  it('should enforce STRING_LIMITS.NAME for eventName (max 100)', () => {
    const tooLong = ticketMetadataSchema.safeParse({
      eventName: 'a'.repeat(101)
    });
    expect(tooLong.success).toBe(false);

    const atLimit = ticketMetadataSchema.safeParse({
      eventName: 'a'.repeat(100)
    });
    expect(atLimit.success).toBe(true);
  });

  it('should use strict mode (no extra fields)', () => {
    const withExtraFields = ticketMetadataSchema.safeParse({
      eventName: 'Test',
      extraField: 'not allowed'
    });
    expect(withExtraFields.success).toBe(false);
  });
});

// =============================================================================
// ticketMintDataSchema Tests
// =============================================================================

describe('ticketMintDataSchema', () => {
  it('should require ticketId as UUID', () => {
    const valid = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID
    });
    expect(valid.success).toBe(true);

    const invalid = ticketMintDataSchema.safeParse({
      ticketId: 'not-a-uuid',
      tenantId: validUUID
    });
    expect(invalid.success).toBe(false);
  });

  it('should require tenantId as UUID', () => {
    const valid = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID
    });
    expect(valid.success).toBe(true);

    const invalid = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: 'not-a-uuid'
    });
    expect(invalid.success).toBe(false);
  });

  it('should accept optional orderId as UUID', () => {
    const withOrderId = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID,
      orderId: validUUID
    });
    expect(withOrderId.success).toBe(true);

    const withoutOrderId = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID
    });
    expect(withoutOrderId.success).toBe(true);
  });

  it('should accept optional eventId as UUID', () => {
    const withEventId = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID,
      eventId: validUUID
    });
    expect(withEventId.success).toBe(true);
  });

  it('should accept optional userId as UUID', () => {
    const withUserId = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID,
      userId: validUUID
    });
    expect(withUserId.success).toBe(true);
  });

  it('should validate ownerAddress length (32-64)', () => {
    // Valid Solana-like address (44 chars)
    const valid = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID,
      ownerAddress: validSolanaAddress
    });
    expect(valid.success).toBe(true);

    // Too short (31 chars)
    const tooShort = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID,
      ownerAddress: 'a'.repeat(31)
    });
    expect(tooShort.success).toBe(false);

    // Too long (65 chars)
    const tooLong = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID,
      ownerAddress: 'a'.repeat(65)
    });
    expect(tooLong.success).toBe(false);
  });

  it('should accept optional metadata', () => {
    const withMetadata = ticketMintDataSchema.safeParse({
      ticketId: validUUID,
      tenantId: validUUID,
      metadata: {
        eventName: 'Test Event',
        tier: 'VIP'
      }
    });
    expect(withMetadata.success).toBe(true);
  });
});

// =============================================================================
// batchMintSchema Tests
// =============================================================================

describe('batchMintSchema', () => {
  it('should require venueId as UUID', () => {
    const valid = batchMintSchema.safeParse({
      venueId: validUUID,
      tickets: [{ id: validUUID, eventId: validUUID }]
    });
    expect(valid.success).toBe(true);

    const invalid = batchMintSchema.safeParse({
      venueId: 'not-a-uuid',
      tickets: [{ id: validUUID, eventId: validUUID }]
    });
    expect(invalid.success).toBe(false);
  });

  it('should require tickets array', () => {
    const withoutTickets = batchMintSchema.safeParse({
      venueId: validUUID
    });
    expect(withoutTickets.success).toBe(false);
  });

  it('should validate nested ticket objects', () => {
    const valid = batchMintSchema.safeParse({
      venueId: validUUID,
      tickets: [{
        id: validUUID,
        eventId: validUUID,
        userId: validUUID,
        ticketData: {
          tier: 'VIP',
          section: 'A',
          row: '1',
          seat: '15',
          price: 100
        }
      }]
    });
    expect(valid.success).toBe(true);
  });

  it('should enforce min 1 ticket', () => {
    const empty = batchMintSchema.safeParse({
      venueId: validUUID,
      tickets: []
    });
    expect(empty.success).toBe(false);
  });

  it('should enforce max 100 tickets', () => {
    const tickets = Array(101).fill(null).map(() => ({
      id: validUUID,
      eventId: validUUID
    }));

    const tooMany = batchMintSchema.safeParse({
      venueId: validUUID,
      tickets
    });
    expect(tooMany.success).toBe(false);

    const atLimit = batchMintSchema.safeParse({
      venueId: validUUID,
      tickets: tickets.slice(0, 100)
    });
    expect(atLimit.success).toBe(true);
  });

  it('should validate ticketData passthrough', () => {
    const withPassthrough = batchMintSchema.safeParse({
      venueId: validUUID,
      tickets: [{
        id: validUUID,
        eventId: validUUID,
        ticketData: {
          tier: 'VIP',
          customField: 'allowed with passthrough'
        }
      }]
    });
    expect(withPassthrough.success).toBe(true);
  });
});

// =============================================================================
// mintQuerySchema Tests
// =============================================================================

describe('mintQuerySchema', () => {
  it('should validate status enum values', () => {
    const validStatuses = ['pending', 'minting', 'completed', 'failed'];
    
    for (const status of validStatuses) {
      const result = mintQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }

    const invalid = mintQuerySchema.safeParse({ status: 'invalid' });
    expect(invalid.success).toBe(false);
  });

  it('should coerce limit to number', () => {
    const result = mintQuerySchema.safeParse({ limit: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.limit).toBe('number');
      expect(result.data.limit).toBe(25);
    }
  });

  it('should default limit to 50', () => {
    const result = mintQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('should enforce max limit of 100', () => {
    const tooHigh = mintQuerySchema.safeParse({ limit: 101 });
    expect(tooHigh.success).toBe(false);

    const atMax = mintQuerySchema.safeParse({ limit: 100 });
    expect(atMax.success).toBe(true);
  });

  it('should default offset to 0', () => {
    const result = mintQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(0);
    }
  });

  it('should coerce offset to number', () => {
    const result = mintQuerySchema.safeParse({ offset: '10' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(10);
    }
  });
});

// =============================================================================
// reconcileSchema & dlqRequeueSchema Tests
// =============================================================================

describe('reconcileSchema', () => {
  it('should require ticketIds array', () => {
    const valid = reconcileSchema.safeParse({
      ticketIds: [validUUID]
    });
    expect(valid.success).toBe(true);

    const missing = reconcileSchema.safeParse({});
    expect(missing.success).toBe(false);
  });

  it('should validate ticketIds as UUIDs', () => {
    const valid = reconcileSchema.safeParse({
      ticketIds: [validUUID, validUUID]
    });
    expect(valid.success).toBe(true);

    const invalid = reconcileSchema.safeParse({
      ticketIds: ['not-a-uuid', validUUID]
    });
    expect(invalid.success).toBe(false);
  });

  it('should enforce max 1000 tickets', () => {
    const ticketIds = Array(1001).fill(validUUID);
    
    const tooMany = reconcileSchema.safeParse({ ticketIds });
    expect(tooMany.success).toBe(false);

    const atLimit = reconcileSchema.safeParse({
      ticketIds: ticketIds.slice(0, 1000)
    });
    expect(atLimit.success).toBe(true);
  });

  it('should enforce min 1 ticket', () => {
    const empty = reconcileSchema.safeParse({ ticketIds: [] });
    expect(empty.success).toBe(false);
  });
});

describe('dlqRequeueSchema', () => {
  it('should require jobIds array', () => {
    const valid = dlqRequeueSchema.safeParse({
      jobIds: ['job-1', 'job-2']
    });
    expect(valid.success).toBe(true);

    const missing = dlqRequeueSchema.safeParse({});
    expect(missing.success).toBe(false);
  });

  it('should enforce max 100 jobIds', () => {
    const jobIds = Array(101).fill('job-id');
    
    const tooMany = dlqRequeueSchema.safeParse({ jobIds });
    expect(tooMany.success).toBe(false);

    const atLimit = dlqRequeueSchema.safeParse({
      jobIds: jobIds.slice(0, 100)
    });
    expect(atLimit.success).toBe(true);
  });

  it('should enforce min 1 jobId', () => {
    const empty = dlqRequeueSchema.safeParse({ jobIds: [] });
    expect(empty.success).toBe(false);
  });
});

// =============================================================================
// nftMetadataSchema (Metaplex) Tests
// =============================================================================

describe('nftMetadataSchema (Metaplex)', () => {
  it('should require name', () => {
    const valid = nftMetadataSchema.safeParse({
      name: 'Test NFT',
      symbol: 'TEST',
      image: 'https://example.com/image.png'
    });
    expect(valid.success).toBe(true);

    const missing = nftMetadataSchema.safeParse({
      symbol: 'TEST',
      image: 'https://example.com/image.png'
    });
    expect(missing.success).toBe(false);
  });

  it('should require symbol', () => {
    const missing = nftMetadataSchema.safeParse({
      name: 'Test NFT',
      image: 'https://example.com/image.png'
    });
    expect(missing.success).toBe(false);
  });

  it('should require image as URL', () => {
    const validUrl = nftMetadataSchema.safeParse({
      name: 'Test',
      symbol: 'T',
      image: 'https://example.com/image.png'
    });
    expect(validUrl.success).toBe(true);

    const invalidUrl = nftMetadataSchema.safeParse({
      name: 'Test',
      symbol: 'T',
      image: 'not-a-url'
    });
    expect(invalidUrl.success).toBe(false);
  });

  it('should accept optional description', () => {
    const withDesc = nftMetadataSchema.safeParse({
      name: 'Test',
      symbol: 'T',
      image: 'https://example.com/image.png',
      description: 'A test NFT description'
    });
    expect(withDesc.success).toBe(true);
  });

  it('should validate seller_fee_basis_points (0-10000)', () => {
    const validFee = nftMetadataSchema.safeParse({
      name: 'Test',
      symbol: 'T',
      image: 'https://example.com/image.png',
      seller_fee_basis_points: 500 // 5%
    });
    expect(validFee.success).toBe(true);

    const tooHigh = nftMetadataSchema.safeParse({
      name: 'Test',
      symbol: 'T',
      image: 'https://example.com/image.png',
      seller_fee_basis_points: 10001
    });
    expect(tooHigh.success).toBe(false);

    const negative = nftMetadataSchema.safeParse({
      name: 'Test',
      symbol: 'T',
      image: 'https://example.com/image.png',
      seller_fee_basis_points: -1
    });
    expect(negative.success).toBe(false);
  });

  it('should validate attributes array', () => {
    const withAttributes = nftMetadataSchema.safeParse({
      name: 'Test',
      symbol: 'T',
      image: 'https://example.com/image.png',
      attributes: [
        { trait_type: 'Color', value: 'Blue' },
        { trait_type: 'Size', value: 10 }
      ]
    });
    expect(withAttributes.success).toBe(true);
  });

  it('should validate properties.files array', () => {
    const withFiles = nftMetadataSchema.safeParse({
      name: 'Test',
      symbol: 'T',
      image: 'https://example.com/image.png',
      properties: {
        files: [
          { uri: 'https://example.com/file.png', type: 'image/png' }
        ]
      }
    });
    expect(withFiles.success).toBe(true);
  });

  it('should enforce symbol max length (10)', () => {
    const tooLong = nftMetadataSchema.safeParse({
      name: 'Test',
      symbol: 'TOOLONGSYMBOL',
      image: 'https://example.com/image.png'
    });
    expect(tooLong.success).toBe(false);
  });
});

// =============================================================================
// webhookMintPayloadSchema Tests
// =============================================================================

describe('webhookMintPayloadSchema', () => {
  it('should validate event enum', () => {
    const validEvents = ['ticket.purchased', 'ticket.minted', 'ticket.failed'];
    
    for (const event of validEvents) {
      const result = webhookMintPayloadSchema.safeParse({
        event,
        ticketId: validUUID,
        tenantId: validUUID
      });
      expect(result.success).toBe(true);
    }

    const invalid = webhookMintPayloadSchema.safeParse({
      event: 'invalid.event',
      ticketId: validUUID,
      tenantId: validUUID
    });
    expect(invalid.success).toBe(false);
  });

  it('should require ticketId', () => {
    const missing = webhookMintPayloadSchema.safeParse({
      event: 'ticket.purchased',
      tenantId: validUUID
    });
    expect(missing.success).toBe(false);
  });

  it('should require tenantId', () => {
    const missing = webhookMintPayloadSchema.safeParse({
      event: 'ticket.purchased',
      ticketId: validUUID
    });
    expect(missing.success).toBe(false);
  });

  it('should accept optional timestamp in datetime format', () => {
    const withTimestamp = webhookMintPayloadSchema.safeParse({
      event: 'ticket.purchased',
      ticketId: validUUID,
      tenantId: validUUID,
      timestamp: '2024-12-31T23:59:59Z'
    });
    expect(withTimestamp.success).toBe(true);

    const invalidTimestamp = webhookMintPayloadSchema.safeParse({
      event: 'ticket.purchased',
      ticketId: validUUID,
      tenantId: validUUID,
      timestamp: 'not-a-datetime'
    });
    expect(invalidTimestamp.success).toBe(false);
  });

  it('should accept optional orderId', () => {
    const withOrderId = webhookMintPayloadSchema.safeParse({
      event: 'ticket.purchased',
      ticketId: validUUID,
      tenantId: validUUID,
      orderId: validUUID
    });
    expect(withOrderId.success).toBe(true);
  });

  it('should accept optional eventId', () => {
    const withEventId = webhookMintPayloadSchema.safeParse({
      event: 'ticket.purchased',
      ticketId: validUUID,
      tenantId: validUUID,
      eventId: validUUID
    });
    expect(withEventId.success).toBe(true);
  });

  it('should accept optional userId', () => {
    const withUserId = webhookMintPayloadSchema.safeParse({
      event: 'ticket.purchased',
      ticketId: validUUID,
      tenantId: validUUID,
      userId: validUUID
    });
    expect(withUserId.success).toBe(true);
  });
});

// =============================================================================
// internalMintRequestSchema Tests
// =============================================================================

describe('internalMintRequestSchema', () => {
  it('should require ticket_id', () => {
    const missing = internalMintRequestSchema.safeParse({
      tenant_id: validUUID
    });
    expect(missing.success).toBe(false);

    const valid = internalMintRequestSchema.safeParse({
      ticket_id: validUUID,
      tenant_id: validUUID
    });
    expect(valid.success).toBe(true);
  });

  it('should require tenant_id', () => {
    const missing = internalMintRequestSchema.safeParse({
      ticket_id: validUUID
    });
    expect(missing.success).toBe(false);
  });

  it('should default priority to normal', () => {
    const result = internalMintRequestSchema.safeParse({
      ticket_id: validUUID,
      tenant_id: validUUID
    });
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('normal');
    }
  });

  it('should validate priority enum (low, normal, high)', () => {
    const priorities = ['low', 'normal', 'high'];
    
    for (const priority of priorities) {
      const result = internalMintRequestSchema.safeParse({
        ticket_id: validUUID,
        tenant_id: validUUID,
        priority
      });
      expect(result.success).toBe(true);
    }

    const invalid = internalMintRequestSchema.safeParse({
      ticket_id: validUUID,
      tenant_id: validUUID,
      priority: 'urgent'
    });
    expect(invalid.success).toBe(false);
  });

  it('should accept optional order_id', () => {
    const withOrderId = internalMintRequestSchema.safeParse({
      ticket_id: validUUID,
      tenant_id: validUUID,
      order_id: validUUID
    });
    expect(withOrderId.success).toBe(true);
  });

  it('should accept optional event_id', () => {
    const withEventId = internalMintRequestSchema.safeParse({
      ticket_id: validUUID,
      tenant_id: validUUID,
      event_id: validUUID
    });
    expect(withEventId.success).toBe(true);
  });

  it('should accept optional user_id', () => {
    const withUserId = internalMintRequestSchema.safeParse({
      ticket_id: validUUID,
      tenant_id: validUUID,
      user_id: validUUID
    });
    expect(withUserId.success).toBe(true);
  });

  it('should validate owner_address length (32-64)', () => {
    const valid = internalMintRequestSchema.safeParse({
      ticket_id: validUUID,
      tenant_id: validUUID,
      owner_address: validSolanaAddress
    });
    expect(valid.success).toBe(true);

    const tooShort = internalMintRequestSchema.safeParse({
      ticket_id: validUUID,
      tenant_id: validUUID,
      owner_address: 'a'.repeat(31)
    });
    expect(tooShort.success).toBe(false);
  });

  it('should accept optional metadata', () => {
    const withMetadata = internalMintRequestSchema.safeParse({
      ticket_id: validUUID,
      tenant_id: validUUID,
      metadata: {
        eventName: 'Test Event',
        tier: 'VIP'
      }
    });
    expect(withMetadata.success).toBe(true);
  });
});

// =============================================================================
// NFT Sub-Schema Tests
// =============================================================================

describe('NFT Sub-Schemas', () => {
  describe('nftAttributeSchema', () => {
    it('should accept string values', () => {
      const result = nftAttributeSchema.safeParse({
        trait_type: 'Color',
        value: 'Blue'
      });
      expect(result.success).toBe(true);
    });

    it('should accept number values', () => {
      const result = nftAttributeSchema.safeParse({
        trait_type: 'Level',
        value: 42
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional display_type', () => {
      const result = nftAttributeSchema.safeParse({
        trait_type: 'Date',
        value: '2024-01-01',
        display_type: 'date'
      });
      expect(result.success).toBe(true);
    });
  });

  describe('nftFileSchema', () => {
    it('should require uri as URL', () => {
      const valid = nftFileSchema.safeParse({
        uri: 'https://example.com/file.png',
        type: 'image/png'
      });
      expect(valid.success).toBe(true);

      const invalid = nftFileSchema.safeParse({
        uri: 'not-a-url',
        type: 'image/png'
      });
      expect(invalid.success).toBe(false);
    });

    it('should require type', () => {
      const missing = nftFileSchema.safeParse({
        uri: 'https://example.com/file.png'
      });
      expect(missing.success).toBe(false);
    });

    it('should accept optional cdn flag', () => {
      const withCdn = nftFileSchema.safeParse({
        uri: 'https://example.com/file.png',
        type: 'image/png',
        cdn: true
      });
      expect(withCdn.success).toBe(true);
    });
  });

  describe('nftPropertiesSchema', () => {
    it('should accept optional files array', () => {
      const result = nftPropertiesSchema.safeParse({
        files: [
          { uri: 'https://example.com/file.png', type: 'image/png' }
        ]
      });
      expect(result.success).toBe(true);
    });

    it('should limit files to max 10', () => {
      const files = Array(11).fill(null).map(() => ({
        uri: 'https://example.com/file.png',
        type: 'image/png'
      }));

      const tooMany = nftPropertiesSchema.safeParse({ files });
      expect(tooMany.success).toBe(false);
    });

    it('should accept optional creators array', () => {
      const result = nftPropertiesSchema.safeParse({
        creators: [
          { address: validSolanaAddress, share: 100 }
        ]
      });
      expect(result.success).toBe(true);
    });

    it('should validate creator share (0-100)', () => {
      const invalid = nftPropertiesSchema.safeParse({
        creators: [
          { address: validSolanaAddress, share: 150 }
        ]
      });
      expect(invalid.success).toBe(false);
    });

    it('should limit creators to max 5', () => {
      const creators = Array(6).fill(null).map(() => ({
        address: validSolanaAddress,
        share: 16
      }));

      const tooMany = nftPropertiesSchema.safeParse({ creators });
      expect(tooMany.success).toBe(false);
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty object for ticketMetadataSchema', () => {
    const result = ticketMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject null values where objects expected', () => {
    const result = ticketMintDataSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it('should handle unicode in string fields', () => {
    const result = ticketMetadataSchema.safeParse({
      eventName: '🎵 Concert 音乐会 Концерт'
    });
    expect(result.success).toBe(true);
  });

  it('should handle URL with query parameters', () => {
    const result = ticketMetadataSchema.safeParse({
      image: 'https://example.com/image.png?size=large&format=webp'
    });
    expect(result.success).toBe(true);
  });
});
