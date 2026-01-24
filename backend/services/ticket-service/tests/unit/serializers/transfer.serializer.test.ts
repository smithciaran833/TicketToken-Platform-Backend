import {
  SAFE_TRANSFER_FIELDS,
  FORBIDDEN_TRANSFER_FIELDS,
  SAFE_TRANSFER_SELECT,
  serializeTransfer,
  serializeTransferForSender,
  serializeTransfers,
  serializeTransfersForSender,
  serializeTransferSummary,
  findForbiddenTransferFields,
  findMissingSafeTransferFields,
  maskEmail,
  SafeTransfer,
} from '../../../src/serializers/transfer.serializer';

describe('Transfer Serializer', () => {
  // Mock raw transfer from database with ALL fields including sensitive ones
  const mockRawTransfer = {
    // Safe fields
    id: '123e4567-e89b-12d3-a456-426614174000',
    ticket_id: 'ticket-456',
    status: 'completed',
    transfer_type: 'gift',
    transfer_method: 'direct',
    is_gift: true,
    expires_at: '2026-02-15T23:59:59Z',
    transferred_at: '2026-01-20T14:30:00Z',
    blockchain_transferred_at: '2026-01-20T14:35:00Z',
    created_at: '2026-01-20T14:00:00Z',
    updated_at: '2026-01-20T14:35:00Z',

    // FORBIDDEN fields that should be stripped
    acceptance_code: 'ACCEPT-SECRET-12345', // CRITICAL - Transfer authorization
    transfer_code: 'XFER-SECRET-67890', // CRITICAL - Transfer authorization
    to_email: 'recipient@example.com', // HIGH - PII
    from_user_id: 'user-sender-123', // HIGH - User tracking
    to_user_id: 'user-recipient-456', // HIGH - User tracking
    message: 'Happy Birthday!', // MEDIUM - Private message
    notes: 'Internal note: VIP transfer', // MEDIUM - Internal notes
    cancellation_reason: 'Changed mind', // MEDIUM
    price_cents: 0, // MEDIUM - Financial
    currency: 'USD', // MEDIUM
    tenant_id: 'tenant-secret-abc', // MEDIUM - Multi-tenancy
    accepted_at: '2026-01-20T14:25:00Z',
    cancelled_at: null,
  };

  describe('SAFE_TRANSFER_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(SAFE_TRANSFER_FIELDS).toBeDefined();
      expect(SAFE_TRANSFER_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include essential public fields', () => {
      expect(SAFE_TRANSFER_FIELDS).toContain('id');
      expect(SAFE_TRANSFER_FIELDS).toContain('ticket_id');
      expect(SAFE_TRANSFER_FIELDS).toContain('status');
      expect(SAFE_TRANSFER_FIELDS).toContain('transfer_method');
      expect(SAFE_TRANSFER_FIELDS).toContain('created_at');
    });

    it('should NOT include forbidden fields', () => {
      for (const forbidden of FORBIDDEN_TRANSFER_FIELDS) {
        expect(SAFE_TRANSFER_FIELDS).not.toContain(forbidden);
      }
    });
  });

  describe('FORBIDDEN_TRANSFER_FIELDS', () => {
    it('should be defined and non-empty', () => {
      expect(FORBIDDEN_TRANSFER_FIELDS).toBeDefined();
      expect(FORBIDDEN_TRANSFER_FIELDS.length).toBeGreaterThan(0);
    });

    it('should include critical authorization codes', () => {
      expect(FORBIDDEN_TRANSFER_FIELDS).toContain('acceptance_code');
      expect(FORBIDDEN_TRANSFER_FIELDS).toContain('transfer_code');
    });

    it('should include PII fields', () => {
      expect(FORBIDDEN_TRANSFER_FIELDS).toContain('to_email');
    });

    it('should include user tracking fields', () => {
      expect(FORBIDDEN_TRANSFER_FIELDS).toContain('from_user_id');
      expect(FORBIDDEN_TRANSFER_FIELDS).toContain('to_user_id');
    });

    it('should include private message fields', () => {
      expect(FORBIDDEN_TRANSFER_FIELDS).toContain('message');
      expect(FORBIDDEN_TRANSFER_FIELDS).toContain('notes');
    });
  });

  describe('SAFE_TRANSFER_SELECT', () => {
    it('should be a comma-separated string of safe fields', () => {
      expect(typeof SAFE_TRANSFER_SELECT).toBe('string');
      expect(SAFE_TRANSFER_SELECT).toContain('id');
      expect(SAFE_TRANSFER_SELECT).toContain('ticket_id');
      expect(SAFE_TRANSFER_SELECT).toContain(',');
    });

    it('should NOT contain forbidden fields', () => {
      expect(SAFE_TRANSFER_SELECT).not.toContain('acceptance_code');
      expect(SAFE_TRANSFER_SELECT).not.toContain('transfer_code');
      expect(SAFE_TRANSFER_SELECT).not.toContain('to_email');
    });
  });

  describe('serializeTransfer', () => {
    it('should return only safe fields', () => {
      const result = serializeTransfer(mockRawTransfer);

      // Check safe fields are present
      expect(result.id).toBe(mockRawTransfer.id);
      expect(result.ticketId).toBe(mockRawTransfer.ticket_id);
      expect(result.status).toBe(mockRawTransfer.status);
      expect(result.transferMethod).toBe(mockRawTransfer.transfer_method);
    });

    it('should strip forbidden fields', () => {
      const result = serializeTransfer(mockRawTransfer);

      // Check forbidden fields are NOT present - CRITICAL
      expect((result as any).acceptanceCode).toBeUndefined();
      expect((result as any).acceptance_code).toBeUndefined();
      expect((result as any).transferCode).toBeUndefined();
      expect((result as any).transfer_code).toBeUndefined();
      expect((result as any).toEmail).toBeUndefined();
      expect((result as any).to_email).toBeUndefined();
      expect((result as any).fromUserId).toBeUndefined();
      expect((result as any).from_user_id).toBeUndefined();
      expect((result as any).toUserId).toBeUndefined();
      expect((result as any).to_user_id).toBeUndefined();
      expect((result as any).message).toBeUndefined();
      expect((result as any).tenantId).toBeUndefined();
    });

    it('should convert snake_case to camelCase', () => {
      const result = serializeTransfer(mockRawTransfer);

      expect(result.ticketId).toBeDefined();
      expect(result.transferType).toBeDefined();
      expect(result.transferMethod).toBeDefined();
      expect(result.isGift).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeTransfer(null as any)).toThrow('Cannot serialize null or undefined transfer');
    });

    it('should throw error for undefined input', () => {
      expect(() => serializeTransfer(undefined as any)).toThrow('Cannot serialize null or undefined transfer');
    });
  });

  describe('serializeTransferForSender', () => {
    it('should include masked recipient email for sender', () => {
      const result = serializeTransferForSender(mockRawTransfer);

      expect(result.recipientEmailMasked).toBe('re*****@example.com');
      expect(result.id).toBe(mockRawTransfer.id);
    });

    it('should still exclude other forbidden fields', () => {
      const result = serializeTransferForSender(mockRawTransfer);

      expect((result as any).acceptanceCode).toBeUndefined();
      expect((result as any).transferCode).toBeUndefined();
      expect((result as any).fromUserId).toBeUndefined();
      expect((result as any).toUserId).toBeUndefined();
      expect((result as any).message).toBeUndefined();
    });

    it('should NOT expose full email', () => {
      const result = serializeTransferForSender(mockRawTransfer);

      expect(result.recipientEmailMasked).not.toBe('recipient@example.com');
      expect(result.recipientEmailMasked).toContain('@example.com');
      expect(result.recipientEmailMasked).toContain('*');
    });
  });

  describe('serializeTransfers', () => {
    it('should serialize array of transfers', () => {
      const transfers = [mockRawTransfer, { ...mockRawTransfer, id: 'transfer-2' }];
      const result = serializeTransfers(transfers);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(mockRawTransfer.id);
      expect(result[1].id).toBe('transfer-2');
    });

    it('should return empty array for null input', () => {
      const result = serializeTransfers(null as any);
      expect(result).toEqual([]);
    });

    it('should strip forbidden fields from all transfers', () => {
      const transfers = [mockRawTransfer, { ...mockRawTransfer, id: 'transfer-2' }];
      const result = serializeTransfers(transfers);

      for (const transfer of result) {
        expect((transfer as any).acceptance_code).toBeUndefined();
        expect((transfer as any).acceptanceCode).toBeUndefined();
        expect((transfer as any).to_email).toBeUndefined();
        expect((transfer as any).toEmail).toBeUndefined();
      }
    });
  });

  describe('serializeTransferSummary', () => {
    it('should return minimal fields for list views', () => {
      const result = serializeTransferSummary(mockRawTransfer);

      expect(result.id).toBeDefined();
      expect(result.ticketId).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.isGift).toBeDefined();

      // Should NOT include detailed fields
      expect((result as any).transferType).toBeUndefined();
      expect((result as any).expiresAt).toBeUndefined();
    });

    it('should throw error for null input', () => {
      expect(() => serializeTransferSummary(null as any)).toThrow('Cannot serialize null or undefined transfer');
    });
  });

  describe('maskEmail', () => {
    it('should mask email correctly', () => {
      expect(maskEmail('john.doe@example.com')).toBe('jo*****@example.com');
      expect(maskEmail('ab@test.com')).toBe('**@test.com');
      expect(maskEmail('a@test.com')).toBe('**@test.com');
    });

    it('should handle edge cases', () => {
      expect(maskEmail('')).toBe('');
      expect(maskEmail('invalid')).toBe('***');
    });
  });

  describe('findForbiddenTransferFields', () => {
    it('should find forbidden snake_case fields', () => {
      const found = findForbiddenTransferFields(mockRawTransfer);

      expect(found).toContain('acceptance_code');
      expect(found).toContain('transfer_code');
      expect(found).toContain('to_email');
      expect(found).toContain('from_user_id');
      expect(found).toContain('to_user_id');
    });

    it('should find forbidden camelCase fields', () => {
      const objWithCamelCase = {
        id: '123',
        acceptanceCode: 'secret',
        transferCode: 'secret',
        toEmail: 'test@test.com',
      };

      const found = findForbiddenTransferFields(objWithCamelCase);
      expect(found).toContain('acceptanceCode');
      expect(found).toContain('transferCode');
      expect(found).toContain('toEmail');
    });

    it('should return empty array for safe object', () => {
      const safeTransfer = serializeTransfer(mockRawTransfer);
      const found = findForbiddenTransferFields(safeTransfer);
      expect(found).toHaveLength(0);
    });
  });

  describe('findMissingSafeTransferFields', () => {
    it('should return empty for complete serialized transfer', () => {
      const safeTransfer = serializeTransfer(mockRawTransfer);
      const missing = findMissingSafeTransferFields(safeTransfer);
      expect(missing).toHaveLength(0);
    });

    it('should identify missing required fields', () => {
      const incomplete = { id: '123' };
      const missing = findMissingSafeTransferFields(incomplete);

      expect(missing).toContain('ticketId');
      expect(missing).toContain('status');
      expect(missing).toContain('transferMethod');
    });
  });

  describe('Security validation', () => {
    it('should ensure serialized output passes security check', () => {
      const result = serializeTransfer(mockRawTransfer);
      const forbidden = findForbiddenTransferFields(result);
      const missing = findMissingSafeTransferFields(result);

      expect(forbidden).toHaveLength(0);
      expect(missing).toHaveLength(0);
    });

    it('should NEVER leak acceptance codes', () => {
      const result = serializeTransfer(mockRawTransfer);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('ACCEPT-SECRET');
      expect(jsonString).not.toContain('"acceptanceCode"');
      expect(jsonString).not.toContain('"acceptance_code"');
    });

    it('should NEVER leak transfer codes', () => {
      const result = serializeTransfer(mockRawTransfer);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('XFER-SECRET');
      expect(jsonString).not.toContain('"transferCode"');
      expect(jsonString).not.toContain('"transfer_code"');
    });

    it('should NEVER leak recipient email in standard serialization', () => {
      const result = serializeTransfer(mockRawTransfer);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('recipient@example.com');
      expect(jsonString).not.toContain('"toEmail"');
      expect(jsonString).not.toContain('"to_email"');
    });

    it('should NEVER leak user IDs', () => {
      const result = serializeTransfer(mockRawTransfer);
      const jsonString = JSON.stringify(result);

      expect(jsonString).not.toContain('user-sender-123');
      expect(jsonString).not.toContain('user-recipient-456');
      expect(jsonString).not.toContain('"fromUserId"');
      expect(jsonString).not.toContain('"toUserId"');
    });
  });
});
