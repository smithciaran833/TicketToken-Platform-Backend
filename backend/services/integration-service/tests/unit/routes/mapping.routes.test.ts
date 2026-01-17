// Mock controllers BEFORE imports
const mockGetAvailableFields = jest.fn();
const mockGetCurrentMappings = jest.fn();
const mockUpdateMappings = jest.fn();
const mockTestMappings = jest.fn();
const mockApplyTemplate = jest.fn();
const mockResetMappings = jest.fn();
const mockHealMappings = jest.fn();

jest.mock('../../../src/controllers/mapping.controller', () => ({
  mappingController: {
    getAvailableFields: mockGetAvailableFields,
    getCurrentMappings: mockGetCurrentMappings,
    updateMappings: mockUpdateMappings,
    testMappings: mockTestMappings,
    applyTemplate: mockApplyTemplate,
    resetMappings: mockResetMappings,
    healMappings: mockHealMappings,
  },
}));

// Mock middleware
const mockAuthenticate = jest.fn();
const mockAuthorize = jest.fn();

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: mockAuthenticate,
  authorize: mockAuthorize,
}));

import { FastifyInstance } from 'fastify';
import { mappingRoutes } from '../../../src/routes/mapping.routes';

describe('mappingRoutes', () => {
  let mockFastify: Partial<FastifyInstance>;
  let addHookSpy: jest.Mock;
  let getSpy: jest.Mock;
  let putSpy: jest.Mock;
  let postSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    addHookSpy = jest.fn();
    getSpy = jest.fn();
    putSpy = jest.fn();
    postSpy = jest.fn();

    mockFastify = {
      addHook: addHookSpy,
      get: getSpy,
      put: putSpy,
      post: postSpy,
    };

    mockAuthorize.mockReturnValue('authorize-middleware');
  });

  it('should register authentication hook for all routes', async () => {
    await mappingRoutes(mockFastify as FastifyInstance);

    expect(addHookSpy).toHaveBeenCalledWith('onRequest', mockAuthenticate);
  });

  it('should register authorization hook for all routes', async () => {
    await mappingRoutes(mockFastify as FastifyInstance);

    expect(mockAuthorize).toHaveBeenCalledWith('admin', 'venue_admin');
    expect(addHookSpy).toHaveBeenCalledWith('onRequest', 'authorize-middleware');
  });

  it('should register both hooks in correct order', async () => {
    await mappingRoutes(mockFastify as FastifyInstance);

    expect(addHookSpy).toHaveBeenCalledTimes(2);
    expect(addHookSpy).toHaveBeenNthCalledWith(1, 'onRequest', mockAuthenticate);
    expect(addHookSpy).toHaveBeenNthCalledWith(2, 'onRequest', 'authorize-middleware');
  });

  describe('GET routes', () => {
    it('should register GET /:provider/fields', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/:provider/fields', mockGetAvailableFields);
    });

    it('should register GET /:provider/mappings', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledWith('/:provider/mappings', mockGetCurrentMappings);
    });

    it('should register all GET routes', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('PUT routes', () => {
    it('should register PUT /:provider/mappings', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(putSpy).toHaveBeenCalledWith('/:provider/mappings', mockUpdateMappings);
    });

    it('should register all PUT routes', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(putSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST routes', () => {
    it('should register POST /:provider/mappings/test', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/:provider/mappings/test', mockTestMappings);
    });

    it('should register POST /:provider/mappings/apply-template', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/:provider/mappings/apply-template', mockApplyTemplate);
    });

    it('should register POST /:provider/mappings/reset', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/:provider/mappings/reset', mockResetMappings);
    });

    it('should register POST /:provider/mappings/heal', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledWith('/:provider/mappings/heal', mockHealMappings);
    });

    it('should register all POST routes', async () => {
      await mappingRoutes(mockFastify as FastifyInstance);

      expect(postSpy).toHaveBeenCalledTimes(4);
    });
  });

  it('should register all 7 routes total', async () => {
    await mappingRoutes(mockFastify as FastifyInstance);

    const totalRoutes = getSpy.mock.calls.length + putSpy.mock.calls.length + postSpy.mock.calls.length;
    expect(totalRoutes).toBe(7);
  });

  it('should bind correct controller methods to routes', async () => {
    await mappingRoutes(mockFastify as FastifyInstance);

    expect(getSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
    expect(putSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
    expect(postSpy).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
  });

  it('should require admin or venue_admin role for all routes', async () => {
    await mappingRoutes(mockFastify as FastifyInstance);

    expect(mockAuthorize).toHaveBeenCalledWith('admin', 'venue_admin');
  });
});
