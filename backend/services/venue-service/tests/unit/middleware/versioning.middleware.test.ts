import { versionMiddleware } from '../../../src/middleware/versioning.middleware';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

describe('Versioning Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let done: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      url: '/api/v1/venues',
      headers: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };

    done = jest.fn();
  });

  // =============================================================================
  // Version Detection - 4 test cases
  // =============================================================================

  describe('Version Detection', () => {
    it('should extract version from URL path', () => {
      mockRequest.url = '/api/v1/venues';

      versionMiddleware(mockRequest, mockReply, done);

      expect(mockRequest.apiVersion).toBe('v1');
      expect(mockReply.header).toHaveBeenCalledWith('API-Version', 'v1');
      expect(done).toHaveBeenCalled();
    });

    it('should extract version from api-version header', () => {
      mockRequest.url = '/venues';
      mockRequest.headers['api-version'] = 'v1';

      versionMiddleware(mockRequest, mockReply, done);

      expect(mockRequest.apiVersion).toBe('v1');
      expect(done).toHaveBeenCalled();
    });

    it('should extract version from accept-version header', () => {
      mockRequest.url = '/venues';
      mockRequest.headers['accept-version'] = 'v1';

      versionMiddleware(mockRequest, mockReply, done);

      expect(mockRequest.apiVersion).toBe('v1');
      expect(done).toHaveBeenCalled();
    });

    it('should use current version as default', () => {
      mockRequest.url = '/venues';

      versionMiddleware(mockRequest, mockReply, done);

      expect(mockRequest.apiVersion).toBe('v1');
      expect(done).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Version Validation - 2 test cases
  // =============================================================================

  describe('Version Validation', () => {
    it('should accept supported version', () => {
      mockRequest.url = '/api/v1/venues';

      versionMiddleware(mockRequest, mockReply, done);

      expect(mockReply.status).not.toHaveBeenCalledWith(400);
      expect(done).toHaveBeenCalled();
    });

    it('should reject unsupported version', () => {
      mockRequest.url = '/api/v99/venues';

      versionMiddleware(mockRequest, mockReply, done);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'API version v99 is not supported',
        code: 'UNSUPPORTED_VERSION',
        details: {
          current: 'v1',
          supported: ['v1'],
        },
      });
      expect(done).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Response Headers - 1 test case
  // =============================================================================

  describe('Response Headers', () => {
    it('should set version headers on response', () => {
      mockRequest.url = '/api/v1/venues';

      versionMiddleware(mockRequest, mockReply, done);

      expect(mockReply.header).toHaveBeenCalledWith('API-Version', 'v1');
      expect(mockReply.header).toHaveBeenCalledWith('X-API-Version', 'v1');
    });
  });
});
