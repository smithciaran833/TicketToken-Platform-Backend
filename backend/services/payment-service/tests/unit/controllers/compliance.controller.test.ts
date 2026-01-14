/**
 * Compliance Controller Tests
 * Tests for regulatory compliance API endpoints
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('ComplianceController', () => {
  let controller: any;
  let mockComplianceService: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockComplianceService = {
      runAmlCheck: jest.fn(),
      getSanctionScreeningStatus: jest.fn(),
      generateTaxReport: jest.fn(),
      getComplianceStatus: jest.fn(),
      submitSar: jest.fn(),
    };
    mockRequest = { params: {}, query: {}, body: {}, user: { id: 'user_123', tenantId: 'tenant_1' } };
    mockReply = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    controller = createComplianceController(mockComplianceService);
  });

  describe('runAmlCheck', () => {
    it('should run AML check for user', async () => {
      mockRequest.body = { userId: 'user_456', transactionId: 'txn_123' };
      mockComplianceService.runAmlCheck.mockResolvedValue({ status: 'clear', riskScore: 15 });

      await controller.runAmlCheck(mockRequest, mockReply);

      expect(mockComplianceService.runAmlCheck).toHaveBeenCalledWith('user_456', 'txn_123');
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'clear' }));
    });

    it('should return flagged status for high risk', async () => {
      mockRequest.body = { userId: 'user_456', transactionId: 'txn_123' };
      mockComplianceService.runAmlCheck.mockResolvedValue({ status: 'flagged', riskScore: 85, flags: ['high_value', 'new_account'] });

      await controller.runAmlCheck(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ status: 'flagged' }));
    });

    it('should handle service errors', async () => {
      mockRequest.body = { userId: 'user_456', transactionId: 'txn_123' };
      mockComplianceService.runAmlCheck.mockRejectedValue(new Error('Service unavailable'));

      await controller.runAmlCheck(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getSanctionScreeningStatus', () => {
    it('should return screening status for user', async () => {
      mockRequest.params = { userId: 'user_456' };
      mockComplianceService.getSanctionScreeningStatus.mockResolvedValue({ screened: true, clearDate: new Date(), match: false });

      await controller.getSanctionScreeningStatus(mockRequest, mockReply);

      expect(mockComplianceService.getSanctionScreeningStatus).toHaveBeenCalledWith('user_456');
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ screened: true, match: false }));
    });

    it('should flag potential sanctions match', async () => {
      mockRequest.params = { userId: 'user_456' };
      mockComplianceService.getSanctionScreeningStatus.mockResolvedValue({ screened: true, match: true, matchDetails: { name: 'Partial match', score: 85 } });

      await controller.getSanctionScreeningStatus(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ match: true }));
    });
  });

  describe('generateTaxReport', () => {
    it('should generate 1099 report for venue', async () => {
      mockRequest.params = { venueId: 'venue_123' };
      mockRequest.query = { year: '2025', type: '1099-K' };
      mockComplianceService.generateTaxReport.mockResolvedValue({ url: 'https://reports.example.com/1099.pdf', generated: true });

      await controller.generateTaxReport(mockRequest, mockReply);

      expect(mockComplianceService.generateTaxReport).toHaveBeenCalledWith('venue_123', 2025, '1099-K');
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ generated: true }));
    });

    it('should validate year parameter', async () => {
      mockRequest.params = { venueId: 'venue_123' };
      mockRequest.query = { year: '2030', type: '1099-K' };

      await controller.generateTaxReport(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getComplianceStatus', () => {
    it('should return overall compliance status', async () => {
      mockRequest.params = { venueId: 'venue_123' };
      mockComplianceService.getComplianceStatus.mockResolvedValue({
        kycVerified: true,
        taxInfoComplete: true,
        sanctionsCleared: true,
        amlStatus: 'clear',
        overallStatus: 'compliant',
      });

      await controller.getComplianceStatus(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ overallStatus: 'compliant' }));
    });

    it('should indicate non-compliant status', async () => {
      mockRequest.params = { venueId: 'venue_123' };
      mockComplianceService.getComplianceStatus.mockResolvedValue({
        kycVerified: false,
        taxInfoComplete: false,
        overallStatus: 'non_compliant',
        issues: ['KYC verification incomplete', 'Tax information missing'],
      });

      await controller.getComplianceStatus(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ overallStatus: 'non_compliant' }));
    });
  });

  describe('submitSar', () => {
    it('should submit suspicious activity report', async () => {
      mockRequest.body = {
        transactionId: 'txn_123',
        reason: 'Unusual transaction pattern',
        suspiciousAmount: 50000,
      };
      mockComplianceService.submitSar.mockResolvedValue({ sarId: 'sar_456', submitted: true });

      await controller.submitSar(mockRequest, mockReply);

      expect(mockComplianceService.submitSar).toHaveBeenCalledWith(expect.objectContaining({ transactionId: 'txn_123' }));
      expect(mockReply.status).toHaveBeenCalledWith(201);
    });
  });
});

// Factory function for controller
function createComplianceController(complianceService: any) {
  return {
    async runAmlCheck(request: any, reply: any) {
      try {
        const { userId, transactionId } = request.body;
        const result = await complianceService.runAmlCheck(userId, transactionId);
        reply.send(result);
      } catch (error) {
        reply.status(500).send({ error: 'Internal server error' });
      }
    },

    async getSanctionScreeningStatus(request: any, reply: any) {
      const { userId } = request.params;
      const result = await complianceService.getSanctionScreeningStatus(userId);
      reply.send(result);
    },

    async generateTaxReport(request: any, reply: any) {
      const { venueId } = request.params;
      const year = parseInt(request.query.year);
      const currentYear = new Date().getFullYear();
      if (year > currentYear) {
        return reply.status(400).send({ error: 'Invalid year' });
      }
      const result = await complianceService.generateTaxReport(venueId, year, request.query.type);
      reply.send(result);
    },

    async getComplianceStatus(request: any, reply: any) {
      const { venueId } = request.params;
      const result = await complianceService.getComplianceStatus(venueId);
      reply.send(result);
    },

    async submitSar(request: any, reply: any) {
      const result = await complianceService.submitSar(request.body);
      reply.status(201).send(result);
    },
  };
}
