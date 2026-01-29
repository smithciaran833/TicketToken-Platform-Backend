/**
 * COMPONENT TEST: ComplianceController
 *
 * Tests tax form operations
 */

import { v4 as uuidv4 } from 'uuid';
import { FastifyRequest, FastifyReply } from 'fastify';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock Form1099DAService
const mockGenerateForm1099DA = jest.fn();
const mockGetFormStatus = jest.fn();

jest.mock('../../../src/services/compliance', () => ({
  Form1099DAService: jest.fn().mockImplementation(() => ({
    generateForm1099DA: mockGenerateForm1099DA,
    getFormStatus: mockGetFormStatus,
  })),
}));

// Mock cache
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: { get: jest.fn(), set: jest.fn() },
}));

import { ComplianceController } from '../../../src/controllers/compliance.controller';

// Helper to create mock request/reply
function createMockRequest(overrides: any = {}): FastifyRequest {
  return { body: {}, headers: {}, params: {}, query: {}, ...overrides } as unknown as FastifyRequest;
}

function createMockReply(): { reply: FastifyReply; getResponse: () => any; getStatus: () => number } {
  let response: any = null;
  let status = 200;
  const reply = {
    send: jest.fn().mockImplementation((data) => { response = data; return reply; }),
    status: jest.fn().mockImplementation((code) => { status = code; return reply; }),
    header: jest.fn().mockReturnThis(),
  } as unknown as FastifyReply;
  return { reply, getResponse: () => response, getStatus: () => status };
}

describe('ComplianceController Component Tests', () => {
  let controller: ComplianceController;
  let userId: string;

  beforeEach(() => {
    userId = uuidv4();
    mockGenerateForm1099DA.mockReset();
    mockGetFormStatus.mockReset();
    controller = new ComplianceController();
  });

  // ===========================================================================
  // GET TAX FORM
  // ===========================================================================
  describe('getTaxForm()', () => {
    it('should return form when required', async () => {
      mockGenerateForm1099DA.mockResolvedValueOnce({
        required: true,
        formData: { totalProceeds: 15000, transactions: [] },
      });

      const request = createMockRequest({
        params: { year: '2024' },
        user: { id: userId },
      });
      const { reply, getResponse } = createMockReply();

      await controller.getTaxForm(request, reply);

      expect(mockGenerateForm1099DA).toHaveBeenCalledWith(userId, 2024);
      const response = getResponse();
      expect(response.required).toBe(true);
      expect(response.form).toBeDefined();
      expect(response.downloadUrl).toContain('1099-da');
    });

    it('should indicate when form not required', async () => {
      mockGenerateForm1099DA.mockResolvedValueOnce({ required: false });

      const request = createMockRequest({
        params: { year: '2024' },
        user: { id: userId },
      });
      const { reply, getResponse } = createMockReply();

      await controller.getTaxForm(request, reply);

      const response = getResponse();
      expect(response.required).toBe(false);
      expect(response.message).toContain('not required');
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({ params: { year: '2024' } });
      const { reply, getStatus } = createMockReply();

      await controller.getTaxForm(request, reply);

      expect(getStatus()).toBe(401);
    });
  });

  // ===========================================================================
  // DOWNLOAD TAX FORM
  // ===========================================================================
  describe('downloadTaxForm()', () => {
    it('should set PDF headers for download', async () => {
      mockGenerateForm1099DA.mockResolvedValueOnce({
        required: true,
        formData: {},
      });

      const request = createMockRequest({
        params: { year: '2024' },
        user: { id: userId },
      });
      const { reply } = createMockReply();

      await controller.downloadTaxForm(request, reply);

      expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('1099-DA_2024')
      );
    });

    it('should return 404 when form not available', async () => {
      mockGenerateForm1099DA.mockResolvedValueOnce({ required: false });

      const request = createMockRequest({
        params: { year: '2024' },
        user: { id: userId },
      });
      const { reply, getStatus, getResponse } = createMockReply();

      await controller.downloadTaxForm(request, reply);

      expect(getStatus()).toBe(404);
      expect(getResponse().error).toContain('No tax form');
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({ params: { year: '2024' } });
      const { reply, getStatus } = createMockReply();

      await controller.downloadTaxForm(request, reply);

      expect(getStatus()).toBe(401);
    });
  });

  // ===========================================================================
  // GET TAX SUMMARY
  // ===========================================================================
  describe('getTaxSummary()', () => {
    it('should return summary for last 3 years', async () => {
      mockGetFormStatus.mockResolvedValue({ required: false, available: false });

      const request = createMockRequest({ user: { id: userId } });
      const { reply, getResponse } = createMockReply();

      await controller.getTaxSummary(request, reply);

      const response = getResponse();
      expect(response.years).toHaveLength(3);
      expect(mockGetFormStatus).toHaveBeenCalledTimes(3);
    });

    it('should reject unauthenticated requests', async () => {
      const request = createMockRequest({});
      const { reply, getStatus } = createMockReply();

      await controller.getTaxSummary(request, reply);

      expect(getStatus()).toBe(401);
    });
  });
});
