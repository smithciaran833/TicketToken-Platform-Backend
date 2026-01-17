// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/validators/scan.validator.ts
 */

describe('src/validators/scan.validator.ts - Comprehensive Unit Tests', () => {
  let validators: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Import module under test
    validators = require('../../../src/validators/scan.validator');
  });

  // =============================================================================
  // scanRequestSchema
  // =============================================================================

  describe('scanRequestSchema', () => {
    it('should validate valid scan request', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        location: 'Gate A',
        staff_user_id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result).toEqual(validData);
    });

    it('should require qr_data', async () => {
      const invalidData = {
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      await expect(validators.scanRequestSchema.validateAsync(invalidData)).rejects.toThrow();
    });

    it('should require device_id', async () => {
      const invalidData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
      };

      await expect(validators.scanRequestSchema.validateAsync(invalidData)).rejects.toThrow();
    });

    it('should validate qr_data pattern', async () => {
      const invalidData = {
        qr_data: 'invalid-qr-format',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      await expect(validators.scanRequestSchema.validateAsync(invalidData)).rejects.toThrow('Invalid QR code format');
    });

    it('should validate device_id as UUID', async () => {
      const invalidData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: 'not-a-uuid',
      };

      await expect(validators.scanRequestSchema.validateAsync(invalidData)).rejects.toThrow();
    });

    it('should accept optional location', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        location: 'Gate B',
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.location).toBe('Gate B');
    });

    it('should enforce location max length', async () => {
      const invalidData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        location: 'A'.repeat(201),
      };

      await expect(validators.scanRequestSchema.validateAsync(invalidData)).rejects.toThrow();
    });

    it('should accept optional staff_user_id', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        staff_user_id: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.staff_user_id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should validate staff_user_id as UUID', async () => {
      const invalidData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        staff_user_id: 'not-a-uuid',
      };

      await expect(validators.scanRequestSchema.validateAsync(invalidData)).rejects.toThrow();
    });

    it('should accept optional metadata', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        metadata: { key: 'value', number: 123 },
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.metadata).toEqual({ key: 'value', number: 123 });
    });

    it('should validate without optional fields', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result).toEqual(validData);
    });

    it('should provide custom error message for missing qr_data', async () => {
      const invalidData = {
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      try {
        await validators.scanRequestSchema.validateAsync(invalidData);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('QR code data is required');
      }
    });

    it('should provide custom error message for missing device_id', async () => {
      const invalidData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
      };

      try {
        await validators.scanRequestSchema.validateAsync(invalidData);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Device ID is required');
      }
    });

    it('should provide custom error message for invalid device_id UUID', async () => {
      const invalidData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: 'invalid-uuid',
      };

      try {
        await validators.scanRequestSchema.validateAsync(invalidData);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Device ID must be a valid UUID');
      }
    });

    it('should accept hex values in qr_data', async () => {
      const validData = {
        qr_data: 'abcdef12:9876543210:fedcba98:12345678',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.qr_data).toBe('abcdef12:9876543210:fedcba98:12345678');
    });

    it('should reject qr_data with invalid characters', async () => {
      const invalidData = {
        qr_data: 'GHIJKL:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      await expect(validators.scanRequestSchema.validateAsync(invalidData)).rejects.toThrow();
    });

    it('should reject qr_data with wrong format', async () => {
      const invalidData = {
        qr_data: 'only-two-parts:here',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      await expect(validators.scanRequestSchema.validateAsync(invalidData)).rejects.toThrow();
    });
  });

  // =============================================================================
  // bulkScanRequestSchema
  // =============================================================================

  describe('bulkScanRequestSchema', () => {
    it('should validate valid bulk scan request', async () => {
      const validData = {
        scans: [
          {
            qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
            device_id: '550e8400-e29b-41d4-a716-446655440000',
          },
          {
            qr_data: 'b2c3d4e5:2345678901:f6a7b8c9:0d1e2f3a',
            device_id: '550e8400-e29b-41d4-a716-446655440000',
          },
        ],
      };

      const result = await validators.bulkScanRequestSchema.validateAsync(validData);
      expect(result.scans).toHaveLength(2);
    });

    it('should require scans array', async () => {
      const invalidData = {};

      await expect(validators.bulkScanRequestSchema.validateAsync(invalidData)).rejects.toThrow();
    });

    it('should require at least one scan', async () => {
      const invalidData = {
        scans: [],
      };

      try {
        await validators.bulkScanRequestSchema.validateAsync(invalidData);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('At least one scan is required');
      }
    });

    it('should enforce maximum of 100 scans', async () => {
      const scans = Array(101).fill({
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      });

      const invalidData = { scans };

      try {
        await validators.bulkScanRequestSchema.validateAsync(invalidData);
        fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('Maximum 100 scans per request');
      }
    });

    it('should validate each scan in the array', async () => {
      const invalidData = {
        scans: [
          {
            qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
            device_id: '550e8400-e29b-41d4-a716-446655440000',
          },
          {
            qr_data: 'invalid-format',
            device_id: '550e8400-e29b-41d4-a716-446655440000',
          },
        ],
      };

      await expect(validators.bulkScanRequestSchema.validateAsync(invalidData)).rejects.toThrow();
    });

    it('should accept exactly 100 scans', async () => {
      const scans = Array(100).fill({
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      });

      const validData = { scans };

      const result = await validators.bulkScanRequestSchema.validateAsync(validData);
      expect(result.scans).toHaveLength(100);
    });

    it('should accept scans with optional fields', async () => {
      const validData = {
        scans: [
          {
            qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
            device_id: '550e8400-e29b-41d4-a716-446655440000',
            location: 'Gate A',
            staff_user_id: '123e4567-e89b-12d3-a456-426614174000',
          },
        ],
      };

      const result = await validators.bulkScanRequestSchema.validateAsync(validData);
      expect(result.scans[0].location).toBe('Gate A');
      expect(result.scans[0].staff_user_id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should validate mixed scans with and without optional fields', async () => {
      const validData = {
        scans: [
          {
            qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
            device_id: '550e8400-e29b-41d4-a716-446655440000',
            location: 'Gate A',
          },
          {
            qr_data: 'b2c3d4e5:2345678901:f6a7b8c9:0d1e2f3a',
            device_id: '550e8400-e29b-41d4-a716-446655440000',
          },
        ],
      };

      const result = await validators.bulkScanRequestSchema.validateAsync(validData);
      expect(result.scans).toHaveLength(2);
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle qr_data with all zeros', async () => {
      const validData = {
        qr_data: '00000000:0000000000:00000000:00000000',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.qr_data).toBe('00000000:0000000000:00000000:00000000');
    });

    it('should handle qr_data with all fs', async () => {
      const validData = {
        qr_data: 'ffffffff:9999999999:ffffffff:ffffffff',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.qr_data).toBe('ffffffff:9999999999:ffffffff:ffffffff');
    });

    it('should handle location with exactly 200 characters', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        location: 'A'.repeat(200),
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.location).toHaveLength(200);
    });

    it('should handle empty metadata object', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        metadata: {},
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.metadata).toEqual({});
    });

    it('should handle complex nested metadata', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-e29b-41d4-a716-446655440000',
        metadata: {
          nested: {
            deeply: {
              value: 'test',
            },
          },
          array: [1, 2, 3],
        },
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.metadata).toEqual(validData.metadata);
    });

    it('should handle UUID with uppercase letters', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550E8400-E29B-41D4-A716-446655440000',
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.device_id).toBe('550E8400-E29B-41D4-A716-446655440000');
    });

    it('should handle UUID with mixed case', async () => {
      const validData = {
        qr_data: 'a1b2c3d4:1234567890:e5f6a7b8:9c0d1e2f',
        device_id: '550e8400-E29b-41D4-a716-446655440000',
      };

      const result = await validators.scanRequestSchema.validateAsync(validData);
      expect(result.device_id).toBe('550e8400-E29b-41D4-a716-446655440000');
    });
  });
});
