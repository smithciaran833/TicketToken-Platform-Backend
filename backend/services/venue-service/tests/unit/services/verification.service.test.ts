/**
 * Unit tests for src/services/verification.service.ts
 */

// Setup mocks BEFORE imports
const mockChain: any = {
  where: jest.fn().mockReturnThis(),
  whereIn: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  orWhere: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
  insert: jest.fn().mockResolvedValue([1]),
  update: jest.fn().mockResolvedValue(1),
};

const mockDb = jest.fn(() => mockChain);

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { VerificationService } from '../../../src/services/verification.service';

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockChain.first.mockResolvedValue(null);
    mockChain.insert.mockResolvedValue([1]);
    service = new VerificationService();
  });

  describe('verifyVenue()', () => {
    it('should throw error when venue not found', async () => {
      mockChain.first.mockResolvedValue(null);

      await expect(service.verifyVenue('venue-123'))
        .rejects.toThrow('Venue not found');
    });

    it('should return verification result structure', async () => {
      mockChain.first.mockResolvedValue({
        id: 'venue-123',
        name: 'Test Venue',
        address_line1: '123 Main St',
        venue_type: 'theater',
        max_capacity: 500,
      });

      const result = await service.verifyVenue('venue-123');

      expect(result).toHaveProperty('verified');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('issues');
    });

    it('should pass businessInfo when all fields present', async () => {
      mockChain.first.mockResolvedValue({
        id: 'venue-123',
        name: 'Test Venue',
        address_line1: '123 Main St',
        venue_type: 'theater',
        max_capacity: 500,
      });

      const result = await service.verifyVenue('venue-123');

      expect(result.checks.businessInfo).toBe(true);
    });

    it('should fail businessInfo when name missing', async () => {
      mockChain.first.mockResolvedValue({
        id: 'venue-123',
        address_line1: '123 Main St',
        venue_type: 'theater',
        max_capacity: 500,
      });

      const result = await service.verifyVenue('venue-123');

      expect(result.checks.businessInfo).toBe(false);
    });
  });

  describe('submitDocument()', () => {
    it('should insert document into database', async () => {
      await service.submitDocument('venue-123', 'business_license', {
        fileUrl: 'https://example.com/doc.pdf',
      });

      expect(mockDb).toHaveBeenCalledWith('venue_documents');
      expect(mockChain.insert).toHaveBeenCalled();
    });
  });
});
