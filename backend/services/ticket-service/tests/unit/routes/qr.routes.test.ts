import { FastifyInstance } from 'fastify';

// Mock dependencies
jest.mock('../../../src/controllers/qrController', () => ({
  qrController: {
    generateQR: jest.fn(),
    validateQR: jest.fn(),
    refreshQR: jest.fn(),
  },
}));

import qrRoutes from '../../../src/routes/qrRoutes';

describe('QR Routes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let registeredRoutes: string[];

  beforeEach(() => {
    registeredRoutes = [];

    mockFastify = {
      get: jest.fn((path) => {
        registeredRoutes.push(`GET ${path}`);
      }),
      post: jest.fn((path) => {
        registeredRoutes.push(`POST ${path}`);
      }),
    };
  });

  it('should register all QR routes', async () => {
    await qrRoutes(mockFastify as FastifyInstance);

    expect(registeredRoutes).toContain('GET /:ticketId/generate');
    expect(registeredRoutes).toContain('POST /validate');
    expect(registeredRoutes).toContain('POST /refresh');
  });

  it('should call qrController.generateQR for generate route', async () => {
    const { qrController } = require('../../../src/controllers/qrController');
    await qrRoutes(mockFastify as FastifyInstance);

    // Get the handler that was registered
    const call = (mockFastify.get as jest.Mock).mock.calls.find(
      (c) => c[0] === '/:ticketId/generate'
    );
    const handler = call[1];

    const mockRequest = {};
    const mockReply = {};
    handler(mockRequest, mockReply);

    expect(qrController.generateQR).toHaveBeenCalledWith(mockRequest, mockReply);
  });

  it('should call qrController.validateQR for validate route', async () => {
    const { qrController } = require('../../../src/controllers/qrController');
    await qrRoutes(mockFastify as FastifyInstance);

    const call = (mockFastify.post as jest.Mock).mock.calls.find(
      (c) => c[0] === '/validate'
    );
    const handler = call[1];

    const mockRequest = {};
    const mockReply = {};
    handler(mockRequest, mockReply);

    expect(qrController.validateQR).toHaveBeenCalledWith(mockRequest, mockReply);
  });

  it('should call qrController.refreshQR for refresh route', async () => {
    const { qrController } = require('../../../src/controllers/qrController');
    await qrRoutes(mockFastify as FastifyInstance);

    const call = (mockFastify.post as jest.Mock).mock.calls.find(
      (c) => c[0] === '/refresh'
    );
    const handler = call[1];

    const mockRequest = {};
    const mockReply = {};
    handler(mockRequest, mockReply);

    expect(qrController.refreshQR).toHaveBeenCalledWith(mockRequest, mockReply);
  });
});
