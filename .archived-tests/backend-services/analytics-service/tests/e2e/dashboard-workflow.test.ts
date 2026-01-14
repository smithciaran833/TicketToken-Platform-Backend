import request from 'supertest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';

describe('E2E Dashboard Workflow', () => {
  let app: FastifyInstance;
  let authToken: string;
  const venueId = 'test-venue-uuid';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    authToken = 'Bearer test-token-12345';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Complete Analytics Dashboard Flow', () => {
    it('should complete full dashboard loading workflow', async () => {
      // Step 1: User logs in and accesses dashboard
      const healthRes = await request(app.server)
        .get('/health')
        .expect(200);
      
      expect(healthRes.body.status).toBe('ok');

      // Step 2: Load revenue summary
      const revenueRes = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken)
        .expect(200);

      expect(revenueRes.body).toHaveProperty('total');
      expect(revenueRes.body).toHaveProperty('channels');
      const totalRevenue = revenueRes.body.total;

      // Step 3: Load customer lifetime value
      const clvRes = await request(app.server)
        .get('/api/analytics/customers/lifetime-value')
        .set('Authorization', authToken)
        .expect(200);

      expect(clvRes.body).toHaveProperty('averageClv');
      expect(clvRes.body).toHaveProperty('totalCustomers');
      const totalCustomers = clvRes.body.totalCustomers;

      // Step 4: Load customer segments
      const segmentRes = await request(app.server)
        .get('/api/analytics/customers/segments')
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(segmentRes.body)).toBe(true);

      // Step 5: Load churn risk data
      const churnRes = await request(app.server)
        .get('/api/analytics/customers/churn-risk')
        .query({ daysThreshold: 90 })
        .set('Authorization', authToken)
        .expect(200);

      expect(churnRes.body).toHaveProperty('totalAtRisk');

      // Step 6: Get revenue projections
      const projectionRes = await request(app.server)
        .get('/api/analytics/revenue/projections')
        .query({ days: 30 })
        .set('Authorization', authToken)
        .expect(200);

      expect(projectionRes.body).toHaveProperty('projectedRevenue');

      // Verify all data loaded successfully
      expect(revenueRes.status).toBe(200);
      expect(clvRes.status).toBe(200);
      expect(segmentRes.status).toBe(200);
      expect(churnRes.status).toBe(200);
      expect(projectionRes.status).toBe(200);
    });

    it('should handle date range filtering across all endpoints', async () => {
      const startDate = '2024-06-01';
      const endDate = '2024-06-30';

      // Revenue summary with date filter
      const revenueRes = await request(app.server)
        .get('/api/analytics/revenue/summary')
        .query({ startDate, endDate })
        .set('Authorization', authToken)
        .expect(200);

      expect(revenueRes.body.total).toBeGreaterThanOrEqual(0);

      // Event performance with same date filter
      const eventsRes = await request(app.server)
        .get('/api/analytics/events/performance')
        .query({ startDate, endDate })
        .set('Authorization', authToken)
        .expect(200);

      expect(Array.isArray(eventsRes.body)).toBe(true);

      // Verify consistent data across endpoints
      expect(revenueRes.status).toBe(200);
      expect(eventsRes.status).toBe(200);
    });
  });

  describe('Export Workflow', () => {
    it('should complete CSV export workflow', async () => {
      // Step 1: Request CSV export
      const exportRes = await request(app.server)
        .post('/api/analytics/export')
        .send({
          type: 'revenue',
          format: 'csv',
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken)
        .expect(200);

      expect(exportRes.body).toHaveProperty('exportId');
      expect(exportRes.body).toHaveProperty('downloadUrl');
      
      const exportId = exportRes.body.exportId;

      // Step 2: Check export status
      const statusRes = await request(app.server)
        .get(`/api/analytics/export/${exportId}/status`)
        .set('Authorization', authToken)
        .expect(200);

      expect(statusRes.body).toHaveProperty('status');
      expect(['pending', 'processing', 'completed', 'failed']).toContain(statusRes.body.status);

      // Step 3: If completed, download file (simulated)
      if (statusRes.body.status === 'completed') {
        const downloadRes = await request(app.server)
          .get(`/api/analytics/export/${exportId}/download`)
          .set('Authorization', authToken)
          .expect(200);

        expect(downloadRes.headers['content-type']).toContain('text/csv');
      }
    });

    it('should complete PDF export workflow', async () => {
      const exportRes = await request(app.server)
        .post('/api/analytics/export')
        .send({
          type: 'customers',
          format: 'pdf',
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .set('Authorization', authToken)
        .expect(200);

      expect(exportRes.body).toHaveProperty('exportId');
    });
  });

  describe('Dynamic Pricing Workflow', () => {
    it('should complete price recommendation workflow', async () => {
      const eventId = 'test-event-uuid';

      // Step 1: Calculate demand score
      const demandRes = await request(app.server)
        .get(`/api/analytics/pricing/demand-score`)
        .query({ eventId })
        .set('Authorization', authToken)
        .expect(200);

      expect(demandRes.body).toHaveProperty('demandScore');
      expect(demandRes.body.demandScore).toBeGreaterThanOrEqual(0);
      expect(demandRes.body.demandScore).toBeLessThanOrEqual(100);

      // Step 2: Get price recommendation
      const recommendRes = await request(app.server)
        .get(`/api/analytics/pricing/recommend`)
        .query({ eventId })
        .set('Authorization', authToken)
        .expect(200);

      expect(recommendRes.body).toHaveProperty('recommendedPrice');
      expect(recommendRes.body).toHaveProperty('confidence');

      // Step 3: Create pending price change (if recommended)
      if (recommendRes.body.recommendedPrice !== recommendRes.body.currentPrice) {
        const createRes = await request(app.server)
          .post(`/api/analytics/pricing/changes`)
          .send({
            eventId,
            newPrice: recommendRes.body.recommendedPrice,
            reason: 'demand-based'
          })
          .set('Authorization', authToken)
          .expect(201);

        expect(createRes.body).toHaveProperty('changeId');
        
        const changeId = createRes.body.changeId;

        // Step 4: Approve price change
        const approveRes = await request(app.server)
          .post(`/api/analytics/pricing/changes/${changeId}/approve`)
          .set('Authorization', authToken)
          .expect(200);

        expect(approveRes.body.status).toBe('approved');
      }
    });
  });

  describe('Real-time Updates', () => {
    it('should reflect real-time metrics updates', async () => {
      // Get initial metrics
      const initialRes = await request(app.server)
        .get('/api/analytics/realtime/metrics')
        .set('Authorization', authToken)
        .expect(200);

      expect(initialRes.body).toHaveProperty('currentSales');
      expect(initialRes.body).toHaveProperty('activeVisitors');

      // Wait a moment for potential updates
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get updated metrics
      const updatedRes = await request(app.server)
        .get('/api/analytics/realtime/metrics')
        .set('Authorization', authToken)
        .expect(200);

      expect(updatedRes.body).toHaveProperty('currentSales');
      expect(updatedRes.body).toHaveProperty('activeVisitors');
      
      // Verify structure consistency
      expect(Object.keys(initialRes.body)).toEqual(Object.keys(updatedRes.body));
    });
  });

  describe('Error Recovery', () => {
    it('should gracefully handle partial dashboard failures', async () => {
      // Attempt to load dashboard with one failing component
      const results = await Promise.allSettled([
        request(app.server)
          .get('/api/analytics/revenue/summary')
          .query({ startDate: '2024-01-01', endDate: '2024-12-31' })
          .set('Authorization', authToken),
        
        request(app.server)
          .get('/api/analytics/customers/lifetime-value')
          .set('Authorization', authToken),
        
        // Intentionally bad request
        request(app.server)
          .get('/api/analytics/revenue/summary')
          .query({ startDate: 'invalid-date', endDate: '2024-12-31' })
          .set('Authorization', authToken),
      ]);

      // Check that at least some requests succeeded
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful.length).toBeGreaterThan(0);

      // Verify failed requests have proper error responses
      const failed = results.filter(r => r.status === 'rejected' || 
        (r.status === 'fulfilled' && r.value.status >= 400));
      
      expect(failed.length).toBeGreaterThan(0);
    });
  });
});
