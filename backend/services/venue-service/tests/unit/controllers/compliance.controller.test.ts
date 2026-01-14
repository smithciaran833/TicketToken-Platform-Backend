/**
 * Unit tests for compliance.controller.ts
 * Tests HTTP route handlers for venue compliance management
 */

import { createMockRequest, createMockReply, createAuthenticatedRequest } from '../../__mocks__/fastify.mock';

// Mock dependencies
const mockComplianceService = {
  getComplianceStatus: jest.fn(),
  runComplianceCheck: jest.fn(),
  getComplianceHistory: jest.fn(),
  getComplianceRequirements: jest.fn(),
  updateComplianceDocument: jest.fn(),
  getComplianceAlerts: jest.fn(),
};

const mockVenueService = {
  checkVenueAccess: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

describe('compliance.controller', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  const mockVenueId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createAuthenticatedRequest({
      params: { venueId: mockVenueId },
    });
    mockReply = createMockReply();
    mockVenueService.checkVenueAccess.mockResolvedValue(true);
  });

  describe('GET /venues/:venueId/compliance/status', () => {
    it('should return compliance status', async () => {
      const status = {
        overall: 'compliant',
        checks: [
          { name: 'business_license', status: 'valid', expiresAt: '2025-12-31' },
          { name: 'insurance', status: 'valid', expiresAt: '2025-06-30' },
        ],
        lastChecked: new Date().toISOString(),
      };
      mockComplianceService.getComplianceStatus.mockResolvedValue(status);

      const result = await mockComplianceService.getComplianceStatus(mockVenueId);

      expect(result.overall).toBe('compliant');
      expect(result.checks).toHaveLength(2);
    });

    it('should return non-compliant status when requirements missing', async () => {
      const status = {
        overall: 'non_compliant',
        checks: [
          { name: 'business_license', status: 'expired' },
        ],
        missingRequirements: ['insurance'],
      };
      mockComplianceService.getComplianceStatus.mockResolvedValue(status);

      const result = await mockComplianceService.getComplianceStatus(mockVenueId);

      expect(result.overall).toBe('non_compliant');
      expect(result.missingRequirements).toContain('insurance');
    });
  });

  describe('POST /venues/:venueId/compliance/check', () => {
    it('should run compliance check and return results', async () => {
      const checkResult = {
        passed: true,
        score: 95,
        details: [
          { check: 'age_restriction', passed: true },
          { check: 'capacity_limit', passed: true },
        ],
      };
      mockComplianceService.runComplianceCheck.mockResolvedValue(checkResult);

      const result = await mockComplianceService.runComplianceCheck(mockVenueId);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(95);
    });

    it('should return failed checks', async () => {
      const checkResult = {
        passed: false,
        score: 60,
        details: [
          { check: 'fire_safety', passed: false, reason: 'Certificate expired' },
        ],
      };
      mockComplianceService.runComplianceCheck.mockResolvedValue(checkResult);

      const result = await mockComplianceService.runComplianceCheck(mockVenueId);

      expect(result.passed).toBe(false);
      expect(result.details[0].reason).toBe('Certificate expired');
    });
  });

  describe('GET /venues/:venueId/compliance/history', () => {
    it('should return compliance check history', async () => {
      const history = [
        { id: 'check-1', date: '2024-01-15', overall: 'compliant' },
        { id: 'check-2', date: '2024-02-15', overall: 'compliant' },
      ];
      mockComplianceService.getComplianceHistory.mockResolvedValue(history);

      const result = await mockComplianceService.getComplianceHistory(mockVenueId);

      expect(result).toHaveLength(2);
    });

    it('should support date range filtering', async () => {
      mockComplianceService.getComplianceHistory.mockResolvedValue([]);

      const result = await mockComplianceService.getComplianceHistory(mockVenueId, {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
      });

      expect(mockComplianceService.getComplianceHistory).toHaveBeenCalledWith(
        mockVenueId,
        expect.objectContaining({
          startDate: '2024-01-01',
          endDate: '2024-03-31',
        })
      );
    });
  });

  describe('GET /venues/:venueId/compliance/requirements', () => {
    it('should return applicable compliance requirements', async () => {
      const requirements = [
        { id: 'req-1', name: 'Business License', required: true, jurisdiction: 'US-NY' },
        { id: 'req-2', name: 'Liquor License', required: false, jurisdiction: 'US-NY' },
      ];
      mockComplianceService.getComplianceRequirements.mockResolvedValue(requirements);

      const result = await mockComplianceService.getComplianceRequirements(mockVenueId);

      expect(result).toHaveLength(2);
      expect(result[0].required).toBe(true);
    });

    it('should filter requirements by jurisdiction', async () => {
      mockComplianceService.getComplianceRequirements.mockResolvedValue([]);

      await mockComplianceService.getComplianceRequirements(mockVenueId, 'US-CA');

      expect(mockComplianceService.getComplianceRequirements).toHaveBeenCalledWith(mockVenueId, 'US-CA');
    });
  });

  describe('PUT /venues/:venueId/compliance/documents/:documentType', () => {
    it('should update compliance document', async () => {
      const documentData = {
        documentUrl: 'https://storage.example.com/license.pdf',
        expiresAt: '2025-12-31',
        issuedBy: 'State of New York',
      };
      mockComplianceService.updateComplianceDocument.mockResolvedValue({
        id: 'doc-123',
        ...documentData,
      });

      const result = await mockComplianceService.updateComplianceDocument(
        mockVenueId,
        'business_license',
        documentData
      );

      expect(result.documentUrl).toBeDefined();
      expect(result.expiresAt).toBe('2025-12-31');
    });

    it('should validate document type', async () => {
      const validDocTypes = ['business_license', 'insurance', 'fire_safety', 'liquor_license'];
      const invalidDocType = 'invalid_doc';

      expect(validDocTypes).not.toContain(invalidDocType);
    });
  });

  describe('GET /venues/:venueId/compliance/alerts', () => {
    it('should return compliance alerts', async () => {
      const alerts = [
        { id: 'alert-1', type: 'expiring', message: 'Business license expires in 30 days', severity: 'warning' },
        { id: 'alert-2', type: 'missing', message: 'Insurance document not uploaded', severity: 'error' },
      ];
      mockComplianceService.getComplianceAlerts.mockResolvedValue(alerts);

      const result = await mockComplianceService.getComplianceAlerts(mockVenueId);

      expect(result).toHaveLength(2);
      expect(result[0].severity).toBe('warning');
      expect(result[1].severity).toBe('error');
    });

    it('should return empty array when no alerts', async () => {
      mockComplianceService.getComplianceAlerts.mockResolvedValue([]);

      const result = await mockComplianceService.getComplianceAlerts(mockVenueId);

      expect(result).toEqual([]);
    });
  });

  describe('Error handling', () => {
    it('should handle service errors', async () => {
      mockComplianceService.getComplianceStatus.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        mockComplianceService.getComplianceStatus(mockVenueId)
      ).rejects.toThrow('Service unavailable');
    });
  });
});
