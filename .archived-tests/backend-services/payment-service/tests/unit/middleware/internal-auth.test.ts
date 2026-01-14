import { FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';

// =============================================================================
// MOCKS
// =============================================================================

const mockLogger = {
  child: jest.fn().mockReturnThis(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

// =============================================================================
// TEST SUITE
// =============================================================================

describe('internal-auth middleware', () => {
  let internalAuth: any;
  let mockRequest: any;
  let mockReply: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };
    
    jest.isolateModules(() => {
      const authModule = require('../../../src/middleware/internal-auth');
      internalAuth = authModule.internalAuth;
    });

    mockRequest = {
      headers: {},
      url: '/test',
      method: 'POST',
      body: {},
    } as any;

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as any;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Success Cases - 5 test cases
  // ===========================================================================

  describe('Success Cases', () => {
    it('should authenticate with valid signature', async () => {
      const serviceName = 'order-service';
      const timestamp = Date.now().toString();
      const payload = `${serviceName}:${timestamp}:${mockRequest.method}:${mockRequest.url}:${JSON.stringify(mockRequest.body)}`;
      const signature = crypto
        .createHmac('sha256', process.env.INTERNAL_SERVICE_SECRET || 'internal-service-secret-change-in-production')
        .update(payload)
        .digest('hex');

      mockRequest.headers['x-internal-service'] = serviceName;
      mockRequest.headers['x-internal-timestamp'] = timestamp;
      mockRequest.headers['x-internal-signature'] = signature;

      await internalAuth(mockRequest, mockReply);

      expect(mockRequest.internalService).toBe(serviceName);
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should accept temp-signature in development', async () => {
      process.env.NODE_ENV = 'development';
      
      jest.isolateModules(() => {
        internalAuth = require('../../../src/middleware/internal-auth').internalAuth;
      });

      mockRequest.headers['x-internal-service'] = 'test-service';
      mockRequest.headers['x-internal-timestamp'] = Date.now().toString();
      mockRequest.headers['x-internal-signature'] = 'temp-signature';

      await internalAuth(mockRequest, mockReply);

      expect(mockRequest.internalService).toBe('test-service');
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should attach service name to request', async () => {
      const serviceName = 'payment-processor';
      const timestamp = Date.now().toString();
      const payload = `${serviceName}:${timestamp}:${mockRequest.method}:${mockRequest.url}:${JSON.stringify(mockRequest.body)}`;
      const signature = crypto
        .createHmac('sha256', 'internal-service-secret-change-in-production')
        .update(payload)
        .digest('hex');

      mockRequest.headers['x-internal-service'] = serviceName;
      mockRequest.headers['x-internal-timestamp'] = timestamp;
      mockRequest.headers['x-internal-signature'] = signature;

      await internalAuth(mockRequest, mockReply);

      expect(mockRequest.internalService).toBe(serviceName);
    });

    it('should validate timestamp within 5 minutes', async () => {
      const serviceName = 'test-service';
      const timestamp = (Date.now() - 4 * 60 * 1000).toString(); // 4 minutes ago
      const payload = `${serviceName}:${timestamp}:${mockRequest.method}:${mockRequest.url}:${JSON.stringify(mockRequest.body)}`;
      const signature = crypto
        .createHmac('sha256', 'internal-service-secret-change-in-production')
        .update(payload)
        .digest('hex');

      mockRequest.headers['x-internal-service'] = serviceName;
      mockRequest.headers['x-internal-timestamp'] = timestamp;
      mockRequest.headers['x-internal-signature'] = signature;

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should log successful authentication', async () => {
      const serviceName = 'test-service';
      const timestamp = Date.now().toString();
      const payload = `${serviceName}:${timestamp}:${mockRequest.method}:${mockRequest.url}:${JSON.stringify(mockRequest.body)}`;
      const signature = crypto
        .createHmac('sha256', 'internal-service-secret-change-in-production')
        .update(payload)
        .digest('hex');

      mockRequest.headers['x-internal-service'] = serviceName;
      mockRequest.headers['x-internal-timestamp'] = timestamp;
      mockRequest.headers['x-internal-signature'] = signature;

      await internalAuth(mockRequest, mockReply);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Internal request authenticated',
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // Error Cases - Missing Headers - 4 test cases
  // ===========================================================================

  describe('Error Cases - Missing Headers', () => {
    it('should reject request without service name', async () => {
      mockRequest.headers['x-internal-timestamp'] = Date.now().toString();
      mockRequest.headers['x-internal-signature'] = 'signature';

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Missing authentication headers' });
    });

    it('should reject request without timestamp', async () => {
      mockRequest.headers['x-internal-service'] = 'test-service';
      mockRequest.headers['x-internal-signature'] = 'signature';

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should reject request without signature', async () => {
      mockRequest.headers['x-internal-service'] = 'test-service';
      mockRequest.headers['x-internal-timestamp'] = Date.now().toString();

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should log warning for missing headers', async () => {
      await internalAuth(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Internal request missing required headers',
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // Error Cases - Invalid Timestamp - 3 test cases
  // ===========================================================================

  describe('Error Cases - Invalid Timestamp', () => {
    it('should reject expired timestamp', async () => {
      const serviceName = 'test-service';
      const timestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago

      mockRequest.headers['x-internal-service'] = serviceName;
      mockRequest.headers['x-internal-timestamp'] = timestamp;
      mockRequest.headers['x-internal-signature'] = 'signature';

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Request expired' });
    });

    it('should reject invalid timestamp format', async () => {
      mockRequest.headers['x-internal-service'] = 'test-service';
      mockRequest.headers['x-internal-timestamp'] = 'invalid';
      mockRequest.headers['x-internal-signature'] = 'signature';

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should log warning for invalid timestamp', async () => {
      mockRequest.headers['x-internal-service'] = 'test-service';
      mockRequest.headers['x-internal-timestamp'] = (Date.now() - 10 * 60 * 1000).toString();
      mockRequest.headers['x-internal-signature'] = 'signature';

      await internalAuth(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Internal request with invalid timestamp',
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // Error Cases - Invalid Signature - 3 test cases
  // ===========================================================================

  describe('Error Cases - Invalid Signature', () => {
    it('should reject invalid signature', async () => {
      mockRequest.headers['x-internal-service'] = 'test-service';
      mockRequest.headers['x-internal-timestamp'] = Date.now().toString();
      mockRequest.headers['x-internal-signature'] = 'wrong-signature';

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid signature' });
    });

    it('should reject temp-signature in production', async () => {
      process.env.NODE_ENV = 'production';
      
      jest.isolateModules(() => {
        internalAuth = require('../../../src/middleware/internal-auth').internalAuth;
      });

      mockRequest.headers['x-internal-service'] = 'test-service';
      mockRequest.headers['x-internal-timestamp'] = Date.now().toString();
      mockRequest.headers['x-internal-signature'] = 'temp-signature';

      await internalAuth(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should log warning for invalid signature', async () => {
      mockRequest.headers['x-internal-service'] = 'test-service';
      mockRequest.headers['x-internal-timestamp'] = Date.now().toString();
      mockRequest.headers['x-internal-signature'] = 'invalid';

      await internalAuth(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid internal service signature',
        expect.any(Object)
      );
    });
  });
});
