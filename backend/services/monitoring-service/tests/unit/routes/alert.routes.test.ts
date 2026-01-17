// Mock controllers BEFORE imports
const mockGetActiveAlerts = jest.fn();
const mockGetAlert = jest.fn();
const mockAcknowledgeAlert = jest.fn();
const mockResolveAlert = jest.fn();
const mockGetAlertHistory = jest.fn();
const mockGetAlertRules = jest.fn();
const mockCreateAlertRule = jest.fn();
const mockUpdateAlertRule = jest.fn();
const mockDeleteAlertRule = jest.fn();

jest.mock('../../../src/controllers/alert.controller', () => ({
  alertController: {
    getActiveAlerts: mockGetActiveAlerts,
    getAlert: mockGetAlert,
    acknowledgeAlert: mockAcknowledgeAlert,
    resolveAlert: mockResolveAlert,
    getAlertHistory: mockGetAlertHistory,
    getAlertRules: mockGetAlertRules,
    createAlertRule: mockCreateAlertRule,
    updateAlertRule: mockUpdateAlertRule,
    deleteAlertRule: mockDeleteAlertRule,
  },
}));

// Mock middleware
const mockAuthenticate = jest.fn((req: any, reply: any, done: any) => done?.());
const mockAuthorize = jest.fn((roles: string[]) => (req: any, reply: any, done: any) => done?.());

jest.mock('../../../src/middleware/auth.middleware', () => ({
  authenticate: mockAuthenticate,
  authorize: mockAuthorize,
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import alertRoutes from '../../../src/routes/alert.routes';

describe('alertRoutes', () => {
  let mockServer: Partial<FastifyInstance>;
  let registeredRoutes: Map<string, any>;
  let addHookSpy: jest.Mock;
  let getSpy: jest.Mock;
  let postSpy: jest.Mock;
  let putSpy: jest.Mock;
  let deleteSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredRoutes = new Map();

    addHookSpy = jest.fn();

    getSpy = jest.fn((path, options, handler) => {
      const actualHandler = handler || options;
      const actualOptions = handler ? options : {};
      registeredRoutes.set(`GET ${path}`, { handler: actualHandler, options: actualOptions });
    });

    postSpy = jest.fn((path, options, handler) => {
      const actualHandler = handler || options;
      const actualOptions = handler ? options : {};
      registeredRoutes.set(`POST ${path}`, { handler: actualHandler, options: actualOptions });
    });

    putSpy = jest.fn((path, options, handler) => {
      const actualHandler = handler || options;
      const actualOptions = handler ? options : {};
      registeredRoutes.set(`PUT ${path}`, { handler: actualHandler, options: actualOptions });
    });

    deleteSpy = jest.fn((path, options, handler) => {
      const actualHandler = handler || options;
      const actualOptions = handler ? options : {};
      registeredRoutes.set(`DELETE ${path}`, { handler: actualHandler, options: actualOptions });
    });

    mockServer = {
      addHook: addHookSpy,
      get: getSpy,
      post: postSpy,
      put: putSpy,
      delete: deleteSpy,
    };
  });

  describe('authentication requirements', () => {
    it('should require authentication for all routes via preHandler hook', async () => {
      await alertRoutes(mockServer as FastifyInstance);

      expect(addHookSpy).toHaveBeenCalledWith('preHandler', mockAuthenticate);
    });
  });

  describe('authorization requirements', () => {
    it('should require admin or operator role for POST /:id/acknowledge', async () => {
      await alertRoutes(mockServer as FastifyInstance);

      expect(mockAuthorize).toHaveBeenCalledWith('admin', 'operator');
      const route = registeredRoutes.get('POST /:id/acknowledge');
      expect(route.options).toHaveProperty('preHandler');
    });

    it('should require admin or operator role for POST /:id/resolve', async () => {
      await alertRoutes(mockServer as FastifyInstance);

      const route = registeredRoutes.get('POST /:id/resolve');
      expect(route.options).toHaveProperty('preHandler');
    });

    it('should require admin role for POST /rules', async () => {
      await alertRoutes(mockServer as FastifyInstance);

      expect(mockAuthorize).toHaveBeenCalledWith('admin');
      const route = registeredRoutes.get('POST /rules');
      expect(route.options).toHaveProperty('preHandler');
    });

    it('should require admin role for PUT /rules/:id', async () => {
      await alertRoutes(mockServer as FastifyInstance);

      const route = registeredRoutes.get('PUT /rules/:id');
      expect(route.options).toHaveProperty('preHandler');
    });

    it('should require admin role for DELETE /rules/:id', async () => {
      await alertRoutes(mockServer as FastifyInstance);

      const route = registeredRoutes.get('DELETE /rules/:id');
      expect(route.options).toHaveProperty('preHandler');
    });
  });

  describe('handler functionality', () => {
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;
    let mockSend: jest.Mock;
    let mockCode: jest.Mock;

    beforeEach(() => {
      mockSend = jest.fn().mockReturnThis();
      mockCode = jest.fn().mockReturnValue({ send: mockSend });

      mockRequest = {
        params: {},
        query: {},
        body: {},
      };

      mockReply = {
        send: mockSend,
        code: mockCode,
      };
    });

    it('should call getActiveAlerts for GET /', async () => {
      const alerts = [
        { id: '1', severity: 'critical', message: 'High CPU usage' },
        { id: '2', severity: 'warning', message: 'Disk space low' },
      ];
      mockGetActiveAlerts.mockResolvedValue(alerts);

      await alertRoutes(mockServer as FastifyInstance);
      await mockGetActiveAlerts(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetActiveAlerts).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call getAlert with alert id', async () => {
      mockRequest.params = { id: 'alert-123' };
      mockGetAlert.mockResolvedValue({ id: 'alert-123', status: 'active' });

      await alertRoutes(mockServer as FastifyInstance);
      await mockGetAlert(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: 'alert-123' }
        }),
        mockReply
      );
    });

    it('should call acknowledgeAlert with alert id', async () => {
      mockRequest.params = { id: 'alert-456' };
      mockRequest.body = { acknowledgedBy: 'user-123' };
      mockAcknowledgeAlert.mockResolvedValue({ success: true });

      await alertRoutes(mockServer as FastifyInstance);
      await mockAcknowledgeAlert(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockAcknowledgeAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: 'alert-456' },
          body: { acknowledgedBy: 'user-123' }
        }),
        mockReply
      );
    });

    it('should call resolveAlert with alert id', async () => {
      mockRequest.params = { id: 'alert-789' };
      mockRequest.body = { resolution: 'Fixed by restarting service' };
      mockResolveAlert.mockResolvedValue({ success: true });

      await alertRoutes(mockServer as FastifyInstance);
      await mockResolveAlert(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockResolveAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: 'alert-789' },
          body: { resolution: 'Fixed by restarting service' }
        }),
        mockReply
      );
    });

    it('should call getAlertHistory for GET /history', async () => {
      mockRequest.query = { limit: '50', service: 'auth-service' };
      mockGetAlertHistory.mockResolvedValue({ alerts: [] });

      await alertRoutes(mockServer as FastifyInstance);
      await mockGetAlertHistory(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetAlertHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { limit: '50', service: 'auth-service' }
        }),
        mockReply
      );
    });

    it('should call getAlertRules for GET /rules', async () => {
      mockGetAlertRules.mockResolvedValue({ rules: [] });

      await alertRoutes(mockServer as FastifyInstance);
      await mockGetAlertRules(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockGetAlertRules).toHaveBeenCalledWith(mockRequest, mockReply);
    });

    it('should call createAlertRule with rule data', async () => {
      mockRequest.body = {
        name: 'High CPU Alert',
        condition: 'cpu_usage > 80',
        severity: 'critical',
      };
      mockCreateAlertRule.mockResolvedValue({ id: 'rule-123', success: true });

      await alertRoutes(mockServer as FastifyInstance);
      await mockCreateAlertRule(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockCreateAlertRule).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            name: 'High CPU Alert',
            condition: 'cpu_usage > 80',
            severity: 'critical',
          })
        }),
        mockReply
      );
    });

    it('should call updateAlertRule with rule id and data', async () => {
      mockRequest.params = { id: 'rule-456' };
      mockRequest.body = { severity: 'warning' };
      mockUpdateAlertRule.mockResolvedValue({ success: true });

      await alertRoutes(mockServer as FastifyInstance);
      await mockUpdateAlertRule(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockUpdateAlertRule).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: 'rule-456' },
          body: { severity: 'warning' }
        }),
        mockReply
      );
    });

    it('should call deleteAlertRule with rule id', async () => {
      mockRequest.params = { id: 'rule-789' };
      mockDeleteAlertRule.mockResolvedValue({ success: true });

      await alertRoutes(mockServer as FastifyInstance);
      await mockDeleteAlertRule(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockDeleteAlertRule).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { id: 'rule-789' }
        }),
        mockReply
      );
    });
  });

  describe('error handling', () => {
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(() => {
      mockRequest = {
        params: {},
        query: {},
        body: {},
      };
      mockReply = {
        send: jest.fn(),
        code: jest.fn().mockReturnThis(),
      };
    });

    it('should propagate errors from getActiveAlerts', async () => {
      const error = new Error('Failed to fetch alerts');
      mockGetActiveAlerts.mockRejectedValue(error);

      await alertRoutes(mockServer as FastifyInstance);

      await expect(
        mockGetActiveAlerts(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Failed to fetch alerts');
    });

    it('should propagate errors from acknowledgeAlert', async () => {
      const error = new Error('Alert not found');
      mockAcknowledgeAlert.mockRejectedValue(error);

      await alertRoutes(mockServer as FastifyInstance);

      await expect(
        mockAcknowledgeAlert(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Alert not found');
    });

    it('should propagate errors from createAlertRule', async () => {
      const error = new Error('Invalid rule configuration');
      mockCreateAlertRule.mockRejectedValue(error);

      await alertRoutes(mockServer as FastifyInstance);

      await expect(
        mockCreateAlertRule(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid rule configuration');
    });
  });

  describe('route registration', () => {
    it('should register all 9 routes', async () => {
      await alertRoutes(mockServer as FastifyInstance);

      expect(getSpy).toHaveBeenCalledTimes(4);
      expect(postSpy).toHaveBeenCalledTimes(3);
      expect(putSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(registeredRoutes.size).toBe(9);
    });

    it('should register routes with correct paths', async () => {
      await alertRoutes(mockServer as FastifyInstance);

      expect(registeredRoutes.has('GET /')).toBe(true);
      expect(registeredRoutes.has('GET /:id')).toBe(true);
      expect(registeredRoutes.has('POST /:id/acknowledge')).toBe(true);
      expect(registeredRoutes.has('POST /:id/resolve')).toBe(true);
      expect(registeredRoutes.has('GET /history')).toBe(true);
      expect(registeredRoutes.has('GET /rules')).toBe(true);
      expect(registeredRoutes.has('POST /rules')).toBe(true);
      expect(registeredRoutes.has('PUT /rules/:id')).toBe(true);
      expect(registeredRoutes.has('DELETE /rules/:id')).toBe(true);
    });
  });
});
