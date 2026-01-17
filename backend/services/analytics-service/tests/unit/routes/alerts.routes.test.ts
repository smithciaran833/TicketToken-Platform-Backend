/**
 * Alerts Routes Unit Tests
 */

import Fastify, { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../../../src/services/alert.service', () => ({
  alertService: {
    getAlertsByVenue: jest.fn(),
    getAlertById: jest.fn(),
    createAlert: jest.fn(),
    updateAlert: jest.fn(),
    deleteAlert: jest.fn(),
    toggleAlert: jest.fn(),
    getAlertInstances: jest.fn(),
    acknowledgeAlert: jest.fn(),
    testAlert: jest.fn(),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    jwt: {
      secret: 'test-jwt-secret-for-unit-tests-minimum-32-chars',
    },
  },
}));

import alertsRoutes from '../../../src/routes/alerts.routes';
import { authenticate } from '../../../src/middleware/auth.middleware';
import { alertService } from '../../../src/services/alert.service';

describe('Alerts Routes', () => {
  let app: FastifyInstance;
  let authToken: string;

  const mockAlert = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    venueId: '123e4567-e89b-12d3-a456-426614174001',
    name: 'High Error Rate',
    description: 'Alert when error rate exceeds threshold',
    type: 'metric',
    severity: 'critical',
    status: 'active',
    conditions: [{ operator: 'gt', threshold: 0.05 }],
    actions: [{ type: 'email', recipients: ['admin@example.com'] }],
    enabled: true,
    triggerCount: 0,
    createdBy: 'user-123',
    createdAt: new Date().toISOString(), // Use ISO string
    updatedAt: new Date().toISOString(), // Use ISO string
  };

  beforeAll(async () => {
    app = Fastify();
    
    // Register auth middleware
    app.decorateRequest('user', null);
    app.decorateRequest('tenantId', null);
    app.addHook('onRequest', authenticate);

    // Register routes
    await app.register(alertsRoutes, { prefix: '/alerts' });
    await app.ready();

    // Create auth token
    authToken = jwt.sign(
      {
        userId: 'user-123',
        tenantId: 'tenant-456',
        role: 'admin',
        permissions: ['analytics.read', 'analytics.write', 'analytics.delete'],
      },
      'test-jwt-secret-for-unit-tests-minimum-32-chars',
      {
        algorithm: 'HS256',
        issuer: 'tickettoken-test',
        audience: 'analytics-service-test',
        expiresIn: '1h',
      }
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /alerts/venue/:venueId', () => {
    it('should return alerts for a venue', async () => {
      const mockAlerts = [mockAlert];
      (alertService.getAlertsByVenue as jest.Mock).mockResolvedValue(mockAlerts);

      const response = await app.inject({
        method: 'GET',
        url: '/alerts/venue/123e4567-e89b-12d3-a456-426614174001',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.alerts).toMatchObject(mockAlerts); // Use toMatchObject
      expect(alertService.getAlertsByVenue).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174001'
      );
    });

    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/alerts/venue/123e4567-e89b-12d3-a456-426614174001',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should require analytics.read permission', async () => {
      const noPermToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: [] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'GET',
        url: '/alerts/venue/123e4567-e89b-12d3-a456-426614174001',
        headers: {
          authorization: `Bearer ${noPermToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate venueId is UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/alerts/venue/invalid-uuid',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /alerts/:alertId', () => {
    it('should return a specific alert', async () => {
      (alertService.getAlertById as jest.Mock).mockResolvedValue(mockAlert);

      const response = await app.inject({
        method: 'GET',
        url: `/alerts/${mockAlert.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.alert).toMatchObject(mockAlert); // Use toMatchObject
    });

    it('should return 404 when alert not found', async () => {
      (alertService.getAlertById as jest.Mock).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/alerts/123e4567-e89b-12d3-a456-426614174099',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /alerts', () => {
    const createAlertBody = {
      venueId: '123e4567-e89b-12d3-a456-426614174001',
      name: 'New Alert',
      type: 'metric',
      severity: 'warning',
      conditions: [{ operator: 'gt', threshold: 100 }],
      actions: [{ type: 'email' }],
    };

    it('should create a new alert', async () => {
      (alertService.createAlert as jest.Mock).mockResolvedValue(mockAlert);

      const response = await app.inject({
        method: 'POST',
        url: '/alerts',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: createAlertBody,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.alert).toMatchObject(mockAlert); // Use toMatchObject
      expect(alertService.createAlert).toHaveBeenCalled();
    });

    it('should require analytics.write permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'POST',
        url: '/alerts',
        headers: {
          authorization: `Bearer ${readOnlyToken}`,
        },
        payload: createAlertBody,
      });

      expect(response.statusCode).toBe(403);
    });

    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alerts',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: { name: 'Incomplete' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should validate severity enum', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/alerts',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          ...createAlertBody,
          severity: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PUT /alerts/:alertId', () => {
    it('should update an alert', async () => {
      const updatedAlert = { ...mockAlert, name: 'Updated Alert' };
      (alertService.updateAlert as jest.Mock).mockResolvedValue(updatedAlert);

      const response = await app.inject({
        method: 'PUT',
        url: `/alerts/${mockAlert.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'Updated Alert',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.alert.name).toBe('Updated Alert');
    });

    it('should require analytics.write permission', async () => {
      const readOnlyToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.read'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'PUT',
        url: `/alerts/${mockAlert.id}`,
        headers: {
          authorization: `Bearer ${readOnlyToken}`,
        },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('DELETE /alerts/:alertId', () => {
    it('should delete an alert', async () => {
      (alertService.deleteAlert as jest.Mock).mockResolvedValue(true);

      const response = await app.inject({
        method: 'DELETE',
        url: `/alerts/${mockAlert.id}`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.message).toBe('Alert deleted');
    });

    it('should require analytics.delete permission', async () => {
      const writeToken = jwt.sign(
        { userId: 'user-123', role: 'user', permissions: ['analytics.write'] },
        'test-jwt-secret-for-unit-tests-minimum-32-chars',
        { algorithm: 'HS256', issuer: 'tickettoken-test', audience: 'analytics-service-test' }
      );

      const response = await app.inject({
        method: 'DELETE',
        url: `/alerts/${mockAlert.id}`,
        headers: {
          authorization: `Bearer ${writeToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('should return 404 when alert not found', async () => {
      (alertService.deleteAlert as jest.Mock).mockResolvedValue(false);

      const response = await app.inject({
        method: 'DELETE',
        url: '/alerts/123e4567-e89b-12d3-a456-426614174099',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /alerts/:alertId/toggle', () => {
    it('should toggle alert enabled status', async () => {
      const toggledAlert = { ...mockAlert, enabled: false };
      (alertService.toggleAlert as jest.Mock).mockResolvedValue(toggledAlert);

      const response = await app.inject({
        method: 'POST',
        url: `/alerts/${mockAlert.id}/toggle`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          enabled: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.alert.enabled).toBe(false);
    });

    it('should validate enabled is boolean', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/alerts/${mockAlert.id}/toggle`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          enabled: 'yes',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /alerts/:alertId/instances', () => {
    it('should return alert instances', async () => {
      const mockInstances = [
        {
          id: 'instance-1',
          alertId: mockAlert.id,
          status: 'active',
          triggeredAt: new Date().toISOString(), // Use ISO string
        },
      ];
      (alertService.getAlertInstances as jest.Mock).mockResolvedValue(mockInstances);

      const response = await app.inject({
        method: 'GET',
        url: `/alerts/${mockAlert.id}/instances`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.instances).toMatchObject(mockInstances); // Use toMatchObject
    });

    it('should respect limit query parameter', async () => {
      (alertService.getAlertInstances as jest.Mock).mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: `/alerts/${mockAlert.id}/instances?limit=10`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(alertService.getAlertInstances).toHaveBeenCalledWith(mockAlert.id, 10);
    });
  });

  describe('POST /alerts/instances/:instanceId/acknowledge', () => {
    it('should acknowledge an alert instance', async () => {
      const mockInstance = {
        id: 'instance-1',
        status: 'acknowledged',
        acknowledgedBy: 'user-123',
        acknowledgedAt: new Date().toISOString(),
      };
      (alertService.acknowledgeAlert as jest.Mock).mockResolvedValue(mockInstance);

      const response = await app.inject({
        method: 'POST',
        url: '/alerts/instances/123e4567-e89b-12d3-a456-426614174000/acknowledge', // Use valid UUID
        headers: {
          authorization: `Bearer ${authToken}`,
        },
        payload: {
          notes: 'Working on it',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.instance.status).toBe('acknowledged');
    });
  });

  describe('POST /alerts/:alertId/test', () => {
    it('should send a test alert', async () => {
      (alertService.testAlert as jest.Mock).mockResolvedValue(undefined);

      const response = await app.inject({
        method: 'POST',
        url: `/alerts/${mockAlert.id}/test`,
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.message).toBe('Test alert sent');
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      (alertService.getAlertsByVenue as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/alerts/venue/123e4567-e89b-12d3-a456-426614174001',
        headers: {
          authorization: `Bearer ${authToken}`,
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
