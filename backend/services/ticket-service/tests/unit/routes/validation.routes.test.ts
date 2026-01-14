import { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../../src/controllers/qrController', () => ({
  qrController: {
    validateQR: jest.fn(),
  },
}));

jest.mock('../../../src/utils/validation', () => ({
  validate: jest.fn(() => (req: any, reply: any, done: any) => done()),
  ticketSchemas: {
    validateQR: {},
  },
}));

import validationRoutes from '../../../src/routes/validationRoutes';

describe('Validation Routes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let registeredRoutes: string[];

  beforeEach(() => {
    registeredRoutes = [];

    mockFastify = {
      post: jest.fn((path) => {
        registeredRoutes.push(`POST ${path}`);
      }),
    };
  });

  it('should register QR validation route', async () => {
    await validationRoutes(mockFastify as FastifyInstance);

    expect(registeredRoutes).toContain('POST /qr');
  });

  it('should apply validation middleware', async () => {
    await validationRoutes(mockFastify as FastifyInstance);

    expect(mockFastify.post).toHaveBeenCalledWith(
      '/qr',
      expect.objectContaining({
        preHandler: expect.arrayContaining([expect.any(Function)]),
      }),
      expect.any(Function)
    );
  });

  it('should call qrController.validateQR', async () => {
    const { qrController } = require('../../../src/controllers/qrController');

    await validationRoutes(mockFastify as FastifyInstance);

    const call = (mockFastify.post as jest.Mock).mock.calls[0];
    const handler = call[2];

    const mockRequest = {};
    const mockReply = {};
    handler(mockRequest, mockReply);

    expect(qrController.validateQR).toHaveBeenCalledWith(mockRequest, mockReply);
  });
});
