/**
 * Unit Tests: Tenant Middleware
 * Tests tenant context extraction and RLS setup
 */

const mockQuery = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: mockQuery })),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { tenantMiddleware } from '../../../src/middleware/tenant.middleware';
import { logger } from '../../../src/utils/logger';

describe('tenantMiddleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      url: '/api/v1/orders',
      user: {
        id: 'user-123',
        tenantId: 'tenant-456',
        tenantName: 'Test Tenant',
      },
    };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  it('should set tenant context on request', async () => {
    await tenantMiddleware(mockRequest, mockReply);

    expect(mockRequest.tenant).toEqual({
      tenantId: 'tenant-456',
      tenantName: 'Test Tenant',
    });
  });

  it('should set PostgreSQL session variable for RLS', async () => {
    await tenantMiddleware(mockRequest, mockReply);

    expect(mockQuery).toHaveBeenCalledWith(
      'SET app.current_tenant_id = $1',
      ['tenant-456']
    );
  });

  it('should return 403 when user is missing', async () => {
    mockRequest.user = null;

    await tenantMiddleware(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(403);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Forbidden',
      message: 'Tenant context required',
    });
  });

  it('should return 403 when tenantId is missing', async () => {
    mockRequest.user = { id: 'user-123' };

    await tenantMiddleware(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(403);
    expect(logger.warn).toHaveBeenCalledWith(
      'Missing tenant context in request',
      expect.any(Object)
    );
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValue(new Error('DB error'));

    await tenantMiddleware(mockRequest, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(500);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Internal Server Error',
      message: 'Failed to set tenant context',
    });
  });

  it('should log tenant context setup', async () => {
    await tenantMiddleware(mockRequest, mockReply);

    expect(logger.debug).toHaveBeenCalledWith(
      'Tenant context set',
      expect.objectContaining({
        tenantId: 'tenant-456',
        userId: 'user-123',
      })
    );
  });
});
