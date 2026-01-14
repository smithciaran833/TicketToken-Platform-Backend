/**
 * Unit Tests for TaxController
 * Tests HTTP handlers for tax reporting operations
 */

import { FastifyReply } from 'fastify';
import { TaxController, taxController } from '../../../src/controllers/tax.controller';
import { AuthRequest } from '../../../src/middleware/auth.middleware';
import { taxReportingService } from '../../../src/services/tax-reporting.service';
import { ValidationError } from '../../../src/utils/errors';

// Mock dependencies
jest.mock('../../../src/services/tax-reporting.service');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

describe('TaxController', () => {
  let controller: TaxController;
  let mockRequest: Partial<AuthRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TaxController();

    mockRequest = {
      user: { id: 'user-123', email: 'test@example.com' },
      params: {},
      query: {},
      body: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
    };
  });

  describe('getYearlyReport', () => {
    it('should return yearly report for user', async () => {
      const mockReport = {
        year: 2025,
        totalSales: 1500000,
        totalPurchases: 500000,
        transactionCount: 25,
        fees: 75000,
      };

      mockRequest.params = { year: '2025' };

      (taxReportingService.getYearlyReport as jest.Mock).mockResolvedValue(mockReport);

      await controller.getYearlyReport(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(taxReportingService.getYearlyReport).toHaveBeenCalledWith('user-123', 2025);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockReport,
      });
    });

    it('should return 404 when no transactions found', async () => {
      mockRequest.params = { year: '2020' };

      (taxReportingService.getYearlyReport as jest.Mock).mockResolvedValue(null);

      await controller.getYearlyReport(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'No transactions found for this year',
      });
    });

    it('should throw ValidationError if user ID is missing', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { year: '2025' };

      await expect(
        controller.getYearlyReport(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ValidationError);
    });

    it('should propagate service errors', async () => {
      const error = new Error('Database error');
      mockRequest.params = { year: '2025' };

      (taxReportingService.getYearlyReport as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.getYearlyReport(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });
  });

  describe('generate1099K', () => {
    it('should generate 1099-K form for user', async () => {
      const mock1099K = {
        formType: '1099-K',
        taxYear: 2025,
        grossAmount: 2500000,
        transactionCount: 50,
        payerName: 'TicketToken Platform',
        payerTIN: '**-***1234',
        payeeName: 'Test User',
        payeeTIN: '***-**-1234',
      };

      mockRequest.params = { year: '2025' };

      (taxReportingService.generate1099K as jest.Mock).mockResolvedValue(mock1099K);

      await controller.generate1099K(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(taxReportingService.generate1099K).toHaveBeenCalledWith('user-123', 2025);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mock1099K,
      });
    });

    it('should return 404 when unable to generate 1099-K', async () => {
      mockRequest.params = { year: '2025' };

      (taxReportingService.generate1099K as jest.Mock).mockResolvedValue(null);

      await controller.generate1099K(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unable to generate 1099-K',
      });
    });

    it('should throw ValidationError if user ID is missing', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { year: '2025' };

      await expect(
        controller.generate1099K(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ValidationError);
    });

    it('should propagate service errors', async () => {
      const error = new Error('Generation failed');
      mockRequest.params = { year: '2025' };

      (taxReportingService.generate1099K as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.generate1099K(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Generation failed');
    });
  });

  describe('getTransactions', () => {
    it('should return reportable transactions for current year by default', async () => {
      const mockTransactions = [
        { id: 'txn-1', amount: 10000, type: 'sale' },
        { id: 'txn-2', amount: 5000, type: 'purchase' },
      ];

      mockRequest.query = {};
      const currentYear = new Date().getFullYear();

      (taxReportingService.getReportableTransactions as jest.Mock).mockResolvedValue(mockTransactions);

      await controller.getTransactions(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(taxReportingService.getReportableTransactions).toHaveBeenCalledWith(
        'user-123',
        currentYear
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTransactions,
      });
    });

    it('should return reportable transactions for specified year', async () => {
      const mockTransactions = [
        { id: 'txn-1', amount: 20000, type: 'sale' },
      ];

      mockRequest.query = { year: '2024' };

      (taxReportingService.getReportableTransactions as jest.Mock).mockResolvedValue(mockTransactions);

      await controller.getTransactions(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(taxReportingService.getReportableTransactions).toHaveBeenCalledWith('user-123', 2024);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTransactions,
      });
    });

    it('should return empty array when no transactions exist', async () => {
      mockRequest.query = { year: '2020' };

      (taxReportingService.getReportableTransactions as jest.Mock).mockResolvedValue([]);

      await controller.getTransactions(mockRequest as AuthRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });

    it('should throw ValidationError if user ID is missing', async () => {
      mockRequest.user = undefined;
      mockRequest.query = {};

      await expect(
        controller.getTransactions(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ValidationError);
    });

    it('should propagate service errors', async () => {
      const error = new Error('Database error');
      mockRequest.query = {};

      (taxReportingService.getReportableTransactions as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.getTransactions(mockRequest as AuthRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });
  });

  describe('exported instance', () => {
    it('should export controller instance', () => {
      expect(taxController).toBeInstanceOf(TaxController);
    });
  });
});
