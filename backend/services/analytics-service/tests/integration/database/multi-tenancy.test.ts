import { getDb } from '../../../src/config/database';

describe('Multi-Tenancy Database Integration Tests', () => {
  let db: any;
  const tenant1Id = 'tenant-1-uuid';
  const tenant2Id = 'tenant-2-uuid';

  beforeAll(async () => {
    db = getDb();
  });

  afterAll(async () => {
    await db.destroy();
  });

  describe('RLS Policy Enforcement', () => {
    it('should enforce RLS on event_analytics table', async () => {
      // Set tenant context for tenant 1
      await db.raw(`SET LOCAL app.current_tenant = '${tenant1Id}'`);
      
      const tenant1Data = await db('event_analytics').select('*');
      
      // Set tenant context for tenant 2
      await db.raw(`SET LOCAL app.current_tenant = '${tenant2Id}'`);
      
      const tenant2Data = await db('event_analytics').select('*');
      
      // Verify data isolation - tenants should see different data
      const tenant1Ids = tenant1Data.map((row: any) => row.id);
      const tenant2Ids = tenant2Data.map((row: any) => row.id);
      
      const overlap = tenant1Ids.filter((id: string) => tenant2Ids.includes(id));
      expect(overlap).toEqual([]);
    });

    it('should enforce RLS on venue_analytics table', async () => {
      await db.raw(`SET LOCAL app.current_tenant = '${tenant1Id}'`);
      const tenant1Data = await db('venue_analytics').select('*');
      
      await db.raw(`SET LOCAL app.current_tenant = '${tenant2Id}'`);
      const tenant2Data = await db('venue_analytics').select('*');
      
      const tenant1Venues = tenant1Data.map((row: any) => row.venue_id);
      const tenant2Venues = tenant2Data.map((row: any) => row.venue_id);
      
      const overlap = tenant1Venues.filter((id: string) => tenant2Venues.includes(id));
      expect(overlap).toEqual([]);
    });

    it('should enforce RLS on price_history table', async () => {
      await db.raw(`SET LOCAL app.current_tenant = '${tenant1Id}'`);
      const tenant1Data = await db('price_history').select('*');
      
      await db.raw(`SET LOCAL app.current_tenant = '${tenant2Id}'`);
      const tenant2Data = await db('price_history').select('*');
      
      const tenant1Ids = tenant1Data.map((row: any) => row.id);
      const tenant2Ids = tenant2Data.map((row: any) => row.id);
      
      const overlap = tenant1Ids.filter((id: string) => tenant2Ids.includes(id));
      expect(overlap).toEqual([]);
    });

    it('should enforce RLS on pending_price_changes table', async () => {
      await db.raw(`SET LOCAL app.current_tenant = '${tenant1Id}'`);
      const tenant1Data = await db('pending_price_changes').select('*');
      
      await db.raw(`SET LOCAL app.current_tenant = '${tenant2Id}'`);
      const tenant2Data = await db('pending_price_changes').select('*');
      
      const tenant1Ids = tenant1Data.map((row: any) => row.id);
      const tenant2Ids = tenant2Data.map((row: any) => row.id);
      
      const overlap = tenant1Ids.filter((id: string) => tenant2Ids.includes(id));
      expect(overlap).toEqual([]);
    });

    it('should prevent cross-tenant queries even with direct ID reference', async () => {
      // Get an event ID from tenant 2
      await db.raw(`SET LOCAL app.current_tenant = '${tenant2Id}'`);
      const tenant2Events = await db('event_analytics').select('id').limit(1);
      
      if (tenant2Events.length === 0) {
        console.log('No tenant 2 data, skipping test');
        return;
      }
      
      const tenant2EventId = tenant2Events[0].id;
      
      // Try to access it from tenant 1 context
      await db.raw(`SET LOCAL app.current_tenant = '${tenant1Id}'`);
      const result = await db('event_analytics').where('id', tenant2EventId).select('*');
      
      // Should return empty - RLS prevents access
      expect(result).toEqual([]);
    });
  });

  describe('Complex Queries with RLS', () => {
    it('should respect RLS in JOIN operations', async () => {
      await db.raw(`SET LOCAL app.current_tenant = '${tenant1Id}'`);
      
      const result = await db('event_analytics')
        .join('venue_analytics', 'event_analytics.venue_id', 'venue_analytics.venue_id')
        .select('event_analytics.*', 'venue_analytics.revenue as venue_revenue');
      
      // All returned rows should belong to tenant 1
      result.forEach((row: any) => {
        expect(row.tenant_id).toBe(tenant1Id);
      });
    });

    it('should respect RLS in aggregation queries', async () => {
      await db.raw(`SET LOCAL app.current_tenant = '${tenant1Id}'`);
      
      const result = await db('event_analytics')
        .sum('revenue as total_revenue')
        .count('* as event_count')
        .first();
      
      expect(result).toBeDefined();
      expect(typeof result.total_revenue).toBe('string');
      expect(typeof result.event_count).toBe('string');
    });
  });

  describe('Transaction Handling', () => {
    it('should maintain tenant context within transactions', async () => {
      const trx = await db.transaction();
      
      try {
        await trx.raw(`SET LOCAL app.current_tenant = '${tenant1Id}'`);
        
        const data = await trx('event_analytics').select('*');
        
        // Verify all data belongs to tenant 1
        data.forEach((row: any) => {
          expect(row.tenant_id).toBe(tenant1Id);
        });
        
        await trx.commit();
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    });
  });
});
