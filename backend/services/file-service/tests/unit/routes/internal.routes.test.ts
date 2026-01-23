// @ts-nocheck
/**
 * Internal Routes Unit Tests - file-service
 *
 * Tests for the internal routes endpoints:
 * - GET /internal/users/:userId/files
 * - GET /internal/files/:fileId
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock environment
process.env.INTERNAL_HMAC_SECRET = 'test-secret-key-must-be-32-chars-long';
process.env.USE_NEW_HMAC = 'false'; // Disable HMAC for route logic tests
process.env.NODE_ENV = 'test';

// Mock the database (knex)
const mockDb = jest.fn();
mockDb.mockReturnValue({
  where: jest.fn().mockReturnThis(),
  whereNull: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  count: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
});

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock logger - must mock the logger module completely to avoid pino initialization
const mockChildLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  logger: {
    child: jest.fn(() => mockChildLogger),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
  },
  default: {
    child: jest.fn(() => mockChildLogger),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
  },
  createChildLogger: jest.fn(() => mockChildLogger),
  createRequestLogger: jest.fn(() => mockChildLogger),
  sanitizeForLogging: jest.fn((obj) => obj),
  logAndThrow: jest.fn(),
  auditLog: jest.fn(),
  getLogMetrics: jest.fn(() => ({ debug: 0, info: 0, warn: 0, error: 0, fatal: 0 })),
  loggerWithMetrics: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(() => mockChildLogger),
  },
}));

import { internalRoutes } from '../../../src/routes/internal.routes';

describe('Internal Routes - file-service', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(internalRoutes, { prefix: '/internal' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.mockClear();
    mockDb.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
    });
  });

  // =========================================================================
  // GET /internal/users/:userId/files
  // =========================================================================

  describe('GET /internal/users/:userId/files', () => {
    const mockFiles = [
      {
        id: 'file-001',
        user_id: 'user-gdpr',
        tenant_id: 'tenant-abc',
        file_name: 'profile-photo.jpg',
        original_name: 'my_photo.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 102400,
        storage_key: 'users/user-gdpr/profile-photo.jpg',
        storage_provider: 's3',
        status: 'active',
        metadata: { width: 800, height: 600 },
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
      {
        id: 'file-002',
        user_id: 'user-gdpr',
        tenant_id: 'tenant-abc',
        file_name: 'id-document.pdf',
        original_name: 'passport_scan.pdf',
        mime_type: 'application/pdf',
        size_bytes: 512000,
        storage_key: 'users/user-gdpr/id-document.pdf',
        storage_provider: 's3',
        status: 'active',
        metadata: { pages: 2 },
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    test('should return all files for a user (GDPR export)', async () => {
      // Create a multi-purpose mock chain that handles both files and count queries
      let queryCount = 0;
      const createMockChain = (files: any[], total: string, isCountQuery = false): any => {
        const chain: any = {};
        chain.where = jest.fn().mockReturnValue(chain);
        chain.whereNull = jest.fn().mockReturnValue(chain);
        chain.select = jest.fn().mockReturnValue(chain);
        chain.orderBy = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockReturnValue(chain);
        chain.offset = jest.fn().mockReturnValue(chain);
        chain.count = jest.fn().mockReturnValue(chain);
        // For count query: first() returns thenable object with whereNull
        // This handles: db().where().count().first().whereNull()
        const firstResult: any = {
          whereNull: jest.fn().mockReturnValue({
            then: (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled({ total })),
          }),
          then: (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled({ total })),
        };
        chain.first = jest.fn().mockReturnValue(firstResult);
        // Make thenable for await support (for files query)
        chain.then = (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled(files));
        return chain;
      };

      mockDb.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) {
          // First query: get files
          return createMockChain(mockFiles, '2');
        } else {
          // Second query: get count
          return createMockChain([], '2', true);
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-gdpr/files',
        headers: {
          'x-internal-service': 'compliance-service',
          'x-trace-id': 'trace-gdpr',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userId).toBe('user-gdpr');
      expect(body.files).toHaveLength(2);
      expect(body.files[0].fileName).toBe('profile-photo.jpg');
      expect(body.files[1].fileName).toBe('id-document.pdf');
      expect(body.pagination.total).toBe(2);
    });

    test('should return empty files for user with no uploads', async () => {
      let queryCount = 0;
      const createMockChain = (files: any[], total: string): any => {
        const chain: any = {};
        chain.where = jest.fn().mockReturnValue(chain);
        chain.whereNull = jest.fn().mockReturnValue(chain);
        chain.select = jest.fn().mockReturnValue(chain);
        chain.orderBy = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockReturnValue(chain);
        chain.offset = jest.fn().mockReturnValue(chain);
        chain.count = jest.fn().mockReturnValue(chain);
        // first() returns thenable with whereNull support
        const firstResult: any = {
          whereNull: jest.fn().mockReturnValue({
            then: (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled({ total })),
          }),
          then: (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled({ total })),
        };
        chain.first = jest.fn().mockReturnValue(firstResult);
        chain.then = (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled(files));
        return chain;
      };

      mockDb.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) {
          return createMockChain([], '0');
        } else {
          return createMockChain([], '0');
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/new-user/files',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.userId).toBe('new-user');
      expect(body.files).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });

    test('should support pagination parameters', async () => {
      let queryCount = 0;
      const createMockChain = (files: any[], total: string): any => {
        const chain: any = {};
        chain.where = jest.fn().mockReturnValue(chain);
        chain.whereNull = jest.fn().mockReturnValue(chain);
        chain.select = jest.fn().mockReturnValue(chain);
        chain.orderBy = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockReturnValue(chain);
        chain.offset = jest.fn().mockReturnValue(chain);
        chain.count = jest.fn().mockReturnValue(chain);
        // first() returns thenable with whereNull support
        const firstResult: any = {
          whereNull: jest.fn().mockReturnValue({
            then: (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled({ total })),
          }),
          then: (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled({ total })),
        };
        chain.first = jest.fn().mockReturnValue(firstResult);
        chain.then = (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled(files));
        return chain;
      };

      mockDb.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) {
          return createMockChain([mockFiles[0]], '2');
        } else {
          return createMockChain([], '2');
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-paginate/files?limit=1&offset=0',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.files).toHaveLength(1);
      // Query params come as strings in Fastify, so accept either string or number
      expect(Number(body.pagination.limit)).toBe(1);
      expect(Number(body.pagination.offset)).toBe(0);
      expect(body.pagination.hasMore).toBe(true);
    });

    test('should support includeDeleted flag for full GDPR export', async () => {
      const deletedFile = {
        ...mockFiles[0],
        id: 'file-deleted',
        status: 'deleted',
        deleted_at: new Date(),
      };

      let queryCount = 0;
      const createMockChain = (files: any[], total: string): any => {
        const chain: any = {};
        chain.where = jest.fn().mockReturnValue(chain);
        chain.whereNull = jest.fn().mockReturnValue(chain);
        chain.select = jest.fn().mockReturnValue(chain);
        chain.orderBy = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockReturnValue(chain);
        chain.offset = jest.fn().mockReturnValue(chain);
        chain.count = jest.fn().mockReturnValue(chain);
        chain.first = jest.fn().mockResolvedValue({ total });
        chain.then = (onFulfilled: (value: any) => any) => Promise.resolve(onFulfilled(files));
        return chain;
      };

      mockDb.mockImplementation(() => {
        queryCount++;
        if (queryCount === 1) {
          return createMockChain([...mockFiles, deletedFile], '3');
        } else {
          return createMockChain([], '3');
        }
      });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-full-export/files?includeDeleted=true',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Should include deleted files when flag is true
      expect(body.files.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // GET /internal/files/:fileId
  // =========================================================================

  describe('GET /internal/files/:fileId', () => {
    const mockFile = {
      id: 'file-123',
      user_id: 'user-owner',
      tenant_id: 'tenant-abc',
      file_name: 'ticket-qr.png',
      original_name: 'qr_code.png',
      mime_type: 'image/png',
      size_bytes: 25600,
      storage_key: 'tickets/event-456/ticket-qr.png',
      storage_provider: 's3',
      status: 'active',
      metadata: { ticketId: 'ticket-789' },
      created_at: new Date(),
      updated_at: new Date(),
    };

    test('should return file metadata for valid file ID', async () => {
      const mockChain: any = {
        where: jest.fn().mockImplementation(() => mockChain),
        whereNull: jest.fn().mockImplementation(() => mockChain),
        select: jest.fn().mockImplementation(() => mockChain),
        first: jest.fn().mockResolvedValue(mockFile),
      };

      mockDb.mockReturnValue(mockChain);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/files/file-123',
        headers: {
          'x-internal-service': 'ticket-service',
          'x-trace-id': 'trace-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.file).toBeDefined();
      expect(body.file.id).toBe('file-123');
      expect(body.file.fileName).toBe('ticket-qr.png');
      expect(body.file.mimeType).toBe('image/png');
      expect(body.file.storageKey).toBe('tickets/event-456/ticket-qr.png');
    });

    test('should return 404 for non-existent file', async () => {
      const mockChain: any = {
        where: jest.fn().mockImplementation(() => mockChain),
        whereNull: jest.fn().mockImplementation(() => mockChain),
        select: jest.fn().mockImplementation(() => mockChain),
        first: jest.fn().mockResolvedValue(null),
      };

      mockDb.mockReturnValue(mockChain);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/files/non-existent',
        headers: {
          'x-internal-service': 'notification-service',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('File not found');
    });

    test('should return 404 for deleted file', async () => {
      const mockChain: any = {
        where: jest.fn().mockImplementation(() => mockChain),
        whereNull: jest.fn().mockImplementation(() => mockChain),
        select: jest.fn().mockImplementation(() => mockChain),
        first: jest.fn().mockResolvedValue(null), // whereNull filters deleted
      };

      mockDb.mockReturnValue(mockChain);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/files/deleted-file',
        headers: {
          'x-internal-service': 'ticket-service',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('File not found');
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    test('should handle database errors gracefully on user files lookup', async () => {
      const createErrorChain = (): any => {
        const chain: any = {};
        chain.where = jest.fn().mockReturnValue(chain);
        chain.whereNull = jest.fn().mockReturnValue(chain);
        chain.select = jest.fn().mockReturnValue(chain);
        chain.orderBy = jest.fn().mockReturnValue(chain);
        chain.limit = jest.fn().mockReturnValue(chain);
        chain.offset = jest.fn().mockReturnValue(chain);
        chain.count = jest.fn().mockReturnValue(chain);
        chain.first = jest.fn().mockResolvedValue({ total: '0' });
        // Make chain thenable but reject - use proper Promise semantics
        chain.then = (onFulfilled: any, onRejected: any) => {
          const error = new Error('Database connection failed');
          if (onRejected) {
            return Promise.resolve().then(() => onRejected(error));
          }
          return Promise.reject(error);
        };
        chain.catch = (onRejected: any) => {
          return Promise.resolve().then(() => onRejected(new Error('Database connection failed')));
        };
        return chain;
      };

      mockDb.mockImplementation(() => createErrorChain());

      const response = await app.inject({
        method: 'GET',
        url: '/internal/users/user-error/files',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });

    test('should handle database errors gracefully on file lookup', async () => {
      const mockChain: any = {
        where: jest.fn().mockImplementation(() => mockChain),
        whereNull: jest.fn().mockImplementation(() => mockChain),
        select: jest.fn().mockImplementation(() => mockChain),
        first: jest.fn().mockRejectedValue(new Error('Query timeout')),
      };

      mockDb.mockReturnValue(mockChain);

      const response = await app.inject({
        method: 'GET',
        url: '/internal/files/file-error',
        headers: {
          'x-internal-service': 'ticket-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });
  });
});
