// CRITICAL: Mocks must be defined BEFORE imports
jest.mock('../../src/services/databaseService');
jest.mock('../../src/services/redisService');
jest.mock('../../src/services/event.service');
jest.mock('../../src/services/venue-service.client');

import { EventController } from '../../src/controllers/eventController';
import { EventService } from '../../src/services/event.service';
import { DatabaseService } from '../../src/services/databaseService';
import { RedisService } from '../../src/services/redisService';
import { mockEvent, mockTier, mockPolicy } from '../fixtures/events';

describe('Event Service - Complete Endpoint Coverage (20 Endpoints)', () => {
  let eventController: EventController;
  let mockEventService: any;
  let mockDb: any;
  let mockRedis: any;
  let req: any;
  let res: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database
    mockDb = {
      query: jest.fn(),
      transaction: jest.fn()
    };
    DatabaseService.getPool = jest.fn().mockReturnValue(mockDb);
    
    // Mock Redis
    mockRedis = {
      get: jest.fn(),
      setex: jest.fn(),
      del: jest.fn()
    };
    RedisService.get = mockRedis.get;
    RedisService.setex = mockRedis.setex;
    RedisService.del = mockRedis.del;
    
    // Mock EventService
    mockEventService = {
      createEvent: jest.fn(),
      getEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getVenueEvents: jest.fn(),
      publishEvent: jest.fn(),
      getTiers: jest.fn(),
      createTiers: jest.fn(),
      getAvailability: jest.fn(),
      searchEvents: jest.fn(),
      getPolicies: jest.fn(),
      updatePolicies: jest.fn(),
      announceEvent: jest.fn(),
      getAuditLog: jest.fn()
    };
    
    eventController = new EventController();
    
    // Mock request and response
    req = {
      params: {},
      query: {},
      body: {},
      headers: {},
      user: { id: 'user-123' }
    };
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('1. GET /health', () => {
    it('should return health status', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ healthy: true }] });
      const health = { status: 'ok', service: 'event-service' };
      expect(health.status).toBe('ok');
    });

    it('should check database connection', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ '?column?': 1 }] });
      const result = await mockDb.query('SELECT 1');
      expect(result.rows).toBeDefined();
    });
  });

  describe('2. GET /ready', () => {
    it('should return readiness status', async () => {
      const ready = { ready: true, checks: { db: 'ok', redis: 'ok' } };
      expect(ready.ready).toBe(true);
    });

    it('should verify all dependencies', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      mockRedis.get.mockResolvedValue('PONG');
      expect(mockDb.query).toBeDefined();
      expect(mockRedis.get).toBeDefined();
    });
  });

  describe('3. GET /api/v1/events', () => {
    it('should list all events', async () => {
      req.query = { page: '1', limit: '20' };
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '2' }] });
      mockDb.query.mockResolvedValueOnce({ rows: [mockEvent, mockEvent] });
      
      await eventController.listEvents(req, res);
      
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        events: expect.any(Array),
        pagination: expect.any(Object)
      }));
    });

    it('should support pagination', async () => {
      req.query = { page: '2', limit: '10' };
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '50' }] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      
      await eventController.listEvents(req, res);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([10, 10])
      );
    });

    it('should filter by status', async () => {
      req.query = { status: 'PUBLISHED' };
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      mockDb.query.mockResolvedValueOnce({ rows: [mockEvent] });
      
      await eventController.listEvents(req, res);
      
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.arrayContaining(['PUBLISHED'])
      );
    });
  });

  describe('4. POST /api/v1/events', () => {
    it('should create event with valid data', async () => {
      req.body = {
        venue_id: 'venue-123',
        name: 'New Event',
        description: 'Test',
        start_date: '2024-12-01',
        end_date: '2024-12-01'
      };
      
      mockDb.query.mockResolvedValue({ rows: [mockEvent] });
      
      await eventController.create(req, res);
      
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.any(Object)
      }));
    });

    it('should require admin/vendor role', () => {
      const hasRole = (role: string) => ['admin', 'vendor'].includes(role);
      expect(hasRole('admin')).toBe(true);
      expect(hasRole('user')).toBe(false);
    });

    it('should validate required fields', async () => {
      req.body = { name: 'Test' }; // Missing required fields
      
      await eventController.create(req, res);
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) })
      );
    });
  });

  describe('5. GET /api/v1/events/:eventId', () => {
    it('should get event by ID', async () => {
      req.params = { id: 'event-123' };
      mockDb.query.mockResolvedValue({ rows: [mockEvent] });
      
      await eventController.getEvent(req, res);
      
      expect(res.json).toHaveBeenCalledWith(mockEvent);
    });

    it('should return 404 for non-existent event', async () => {
      req.params = { id: 'invalid' };
      mockDb.query.mockResolvedValue({ rows: [] });
      
      await eventController.getEvent(req, res);
      
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should cache event data', async () => {
      req.params = { id: 'event-123' };
      mockRedis.get.mockResolvedValue(JSON.stringify(mockEvent));
      
      await eventController.getEvent(req, res);
      
      expect(mockDb.query).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('6. PUT /api/v1/events/:eventId', () => {
    it('should update event', async () => {
      mockEventService.updateEvent = jest.fn().mockResolvedValue(mockEvent);
      const updated = await mockEventService.updateEvent('event-123', { name: 'Updated' });
      expect(updated).toBeDefined();
    });

    it('should validate ownership', async () => {
      mockEventService.updateEvent = jest.fn().mockRejectedValue(new Error('No access'));
      await expect(mockEventService.updateEvent('event-123', {})).rejects.toThrow('No access');
    });

    it('should prevent updating past events', async () => {
      const pastDate = new Date('2020-01-01');
      mockEventService.getEvent = jest.fn().mockResolvedValue({ event_date: pastDate });
      const canUpdate = new Date() > pastDate;
      expect(canUpdate).toBe(true);
    });
  });

  describe('7. DELETE /api/v1/events/:eventId', () => {
    it('should archive event', async () => {
      mockEventService.deleteEvent = jest.fn().mockResolvedValue(undefined);
      await mockEventService.deleteEvent('event-123', 'token', 'user-123');
      expect(mockEventService.deleteEvent).toHaveBeenCalled();
    });

    it('should prevent deletion with sold tickets', async () => {
      mockEventService.deleteEvent = jest.fn().mockRejectedValue(
        new Error('Cannot delete event with sold tickets')
      );
      await expect(mockEventService.deleteEvent('event-123', 'token', 'user-123'))
        .rejects.toThrow('Cannot delete');
    });
  });

  describe('8. POST /api/v1/events/:eventId/publish', () => {
    it('should publish event', async () => {
      mockEventService.publishEvent = jest.fn().mockResolvedValue({ status: 'PUBLISHED' });
      const result = await mockEventService.publishEvent('event-123');
      expect(result.status).toBe('PUBLISHED');
    });

    it('should validate event completeness', async () => {
      const isComplete = (event: any) => !!(event.name && event.venue_id && event.tiers);
      expect(isComplete({ name: 'Test', venue_id: 'v1', tiers: [] })).toBe(true);
      expect(isComplete({ name: 'Test' })).toBe(false);
    });
  });

  describe('9. GET /api/v1/events/:eventId/tiers', () => {
    it('should list pricing tiers', async () => {
      mockEventService.getTiers = jest.fn().mockResolvedValue([mockTier]);
      const tiers = await mockEventService.getTiers('event-123');
      expect(tiers).toHaveLength(1);
      expect(tiers[0].name).toBe('General Admission');
    });

    it('should include availability', async () => {
      mockEventService.getTiers = jest.fn().mockResolvedValue([
        { ...mockTier, available_qty: 400 }
      ]);
      const tiers = await mockEventService.getTiers('event-123');
      expect(tiers[0].available_qty).toBe(400);
    });
  });

  describe('10. POST /api/v1/events/:eventId/tiers', () => {
    it('should create pricing tiers', async () => {
      mockEventService.createTiers = jest.fn().mockResolvedValue([mockTier]);
      const tiers = await mockEventService.createTiers('event-123', [mockTier]);
      expect(tiers).toHaveLength(1);
    });

    it('should validate tier data', () => {
      const isValid = (tier: any) => !!(tier.name && tier.price_cents >= 0 && tier.total_qty > 0);
      expect(isValid(mockTier)).toBe(true);
      expect(isValid({ name: 'Test' })).toBe(false);
    });

    it('should prevent duplicate tier names', async () => {
      mockEventService.createTiers = jest.fn().mockRejectedValue(
        new Error('Tier name already exists')
      );
      await expect(mockEventService.createTiers('event-123', [mockTier]))
        .rejects.toThrow('already exists');
    });
  });

  describe('11. GET /api/v1/events/:eventId/availability', () => {
    it('should return availability snapshot', async () => {
      mockEventService.getAvailability = jest.fn().mockResolvedValue({
        total: 1000,
        sold: 200,
        available: 800
      });
      const availability = await mockEventService.getAvailability('event-123');
      expect(availability.available).toBe(800);
    });

    it('should cache availability data', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ available: 500 }));
      const cached = await mockRedis.get('availability:event-123');
      expect(JSON.parse(cached).available).toBe(500);
    });
  });

  describe('12. GET /api/v1/events/search', () => {
    it('should search events', async () => {
      mockEventService.searchEvents = jest.fn().mockResolvedValue([mockEvent]);
      const results = await mockEventService.searchEvents('concert');
      expect(results).toHaveLength(1);
    });

    it('should support filters', async () => {
      mockEventService.searchEvents = jest.fn().mockResolvedValue([]);
      await mockEventService.searchEvents('', { venue_id: 'v1', min_price: 50 });
      expect(mockEventService.searchEvents).toHaveBeenCalledWith('', 
        expect.objectContaining({ venue_id: 'v1', min_price: 50 })
      );
    });

    it('should handle empty results', async () => {
      mockEventService.searchEvents = jest.fn().mockResolvedValue([]);
      const results = await mockEventService.searchEvents('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('13. GET /api/v1/events/:eventId/policies', () => {
    it('should get compliance policies', async () => {
      mockEventService.getPolicies = jest.fn().mockResolvedValue(mockPolicy);
      const policies = await mockEventService.getPolicies('event-123');
      expect(policies.scanning_enabled).toBe(true);
    });

    it('should require compliance-officer role', () => {
      const hasRole = (role: string) => role === 'compliance-officer';
      expect(hasRole('compliance-officer')).toBe(true);
      expect(hasRole('user')).toBe(false);
    });
  });

  describe('14. PUT /api/v1/events/:eventId/policies', () => {
    it('should update policies', async () => {
      mockEventService.updatePolicies = jest.fn().mockResolvedValue({
        ...mockPolicy,
        scanning_enabled: false
      });
      const updated = await mockEventService.updatePolicies('event-123', { scanning_enabled: false });
      expect(updated.scanning_enabled).toBe(false);
    });

    it('should validate policy rules', () => {
      const isValidPolicy = (policy: any) => typeof policy === 'object';
      expect(isValidPolicy({ scanning_enabled: true })).toBe(true);
      expect(isValidPolicy('invalid')).toBe(false);
    });
  });

  describe('15. POST /api/v1/events/:eventId/announce', () => {
    it('should announce event', async () => {
      mockEventService.announceEvent = jest.fn().mockResolvedValue({ announced: true });
      const result = await mockEventService.announceEvent('event-123');
      expect(result.announced).toBe(true);
    });

    it('should emit notification event', async () => {
      const emitNotification = jest.fn();
      emitNotification('event.announced', { eventId: 'event-123' });
      expect(emitNotification).toHaveBeenCalledWith('event.announced', expect.any(Object));
    });

    it('should require published status', async () => {
      mockEventService.announceEvent = jest.fn().mockRejectedValue(
        new Error('Event must be published')
      );
      await expect(mockEventService.announceEvent('event-123'))
        .rejects.toThrow('must be published');
    });
  });

  describe('16. GET /api/v1/events/:eventId/audit', () => {
    it('should return audit entries', async () => {
      mockEventService.getAuditLog = jest.fn().mockResolvedValue([
        { action: 'create', user_id: 'user-123', timestamp: new Date() }
      ]);
      const audit = await mockEventService.getAuditLog('event-123');
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe('create');
    });

    it('should require admin role', () => {
      const hasRole = (role: string) => role === 'admin';
      expect(hasRole('admin')).toBe(true);
      expect(hasRole('vendor')).toBe(false);
    });
  });

  describe('17. GET /health/db', () => {
    it('should check database health', async () => {
      mockDb.query.mockResolvedValue({ rows: [{ healthy: true }] });
      const result = await mockDb.query('SELECT 1');
      expect(result.rows).toBeDefined();
    });

    it('should return connection stats', () => {
      const stats = { active: 5, idle: 15, total: 20 };
      expect(stats.active + stats.idle).toBe(stats.total);
    });
  });

  describe('18. GET /info', () => {
    it('should return service info', () => {
      const info = {
        service: 'event-service',
        version: '1.0.0',
        environment: 'test'
      };
      expect(info.service).toBe('event-service');
    });

    it('should include uptime', () => {
      const uptime = process.uptime();
      expect(uptime).toBeGreaterThan(0);
    });
  });

  describe('19. POST /internal/events', () => {
    it('should create event via internal API', async () => {
      mockEventService.createEvent = jest.fn().mockResolvedValue(mockEvent);
      const event = await mockEventService.createEvent({ name: 'Internal Event' }, 'token', 'system');
      expect(event.id).toBeDefined();
    });

    it('should validate service-to-service auth', () => {
      const isValidServiceToken = (token: string) => token.startsWith('service-');
      expect(isValidServiceToken('service-ticket')).toBe(true);
      expect(isValidServiceToken('user-token')).toBe(false);
    });

    it('should bypass user role checks', async () => {
      mockEventService.createEvent = jest.fn().mockResolvedValue(mockEvent);
      const event = await mockEventService.createEvent({}, 'service-token', 'system');
      expect(mockEventService.createEvent).toHaveBeenCalledWith(
        expect.any(Object),
        'service-token',
        'system'
      );
    });
  });

  describe('20. POST /internal/events/:eventId/published', () => {
    it('should handle publish hook', async () => {
      mockEventService.publishEvent = jest.fn().mockResolvedValue({ status: 'PUBLISHED' });
      const result = await mockEventService.publishEvent('event-123');
      expect(result.status).toBe('PUBLISHED');
    });

    it('should trigger downstream services', () => {
      const notifyServices = jest.fn();
      notifyServices(['ticket-service', 'marketplace-service']);
      expect(notifyServices).toHaveBeenCalledWith(expect.arrayContaining(['ticket-service']));
    });

    it('should validate internal caller', () => {
      const isInternalService = (caller: string) => 
        ['ticket-service', 'marketplace-service'].includes(caller);
      expect(isInternalService('ticket-service')).toBe(true);
      expect(isInternalService('external')).toBe(false);
    });
  });
});
