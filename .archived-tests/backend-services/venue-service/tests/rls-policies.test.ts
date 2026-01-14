import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

/**
 * SECURITY FIX (KT8): RLS Policy Tests
 * 
 * These tests verify that Row Level Security policies are properly enforced:
 * - Tenant isolation is maintained
 * - Cross-tenant access is prevented
 * - WITH CHECK clause prevents wrong tenant inserts
 */

describe('RLS Policy Tests', () => {
  let db: Knex;
  
  const tenant1Id = uuidv4();
  const tenant2Id = uuidv4();
  const systemUserId = uuidv4();
  
  // Test venue IDs
  let venue1Id: string;
  let venue2Id: string;

  beforeAll(async () => {
    // Get database connection from test setup
    db = (global as any).testDb;
    
    // Create test tenants if they don't exist
    await db('tenants').insert({ id: tenant1Id, name: 'Test Tenant 1' }).onConflict('id').ignore();
    await db('tenants').insert({ id: tenant2Id, name: 'Test Tenant 2' }).onConflict('id').ignore();
  });

  afterAll(async () => {
    // Cleanup test data
    if (venue1Id) await db('venues').where('id', venue1Id).delete();
    if (venue2Id) await db('venues').where('id', venue2Id).delete();
    await db('tenants').whereIn('id', [tenant1Id, tenant2Id]).delete();
  });

  describe('Tenant Isolation', () => {
    beforeAll(async () => {
      // Create venues for each tenant using system context
      await db.raw("SET LOCAL app.is_system_user = 'true'");
      
      const [v1] = await db('venues')
        .insert({
          name: 'Tenant 1 Venue',
          tenant_id: tenant1Id,
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          country: 'US',
        })
        .returning('id');
      venue1Id = v1.id;

      const [v2] = await db('venues')
        .insert({
          name: 'Tenant 2 Venue',
          tenant_id: tenant2Id,
          address: '456 Test Ave',
          city: 'Test City',
          state: 'TS',
          country: 'US',
        })
        .returning('id');
      venue2Id = v2.id;

      await db.raw("RESET app.is_system_user");
    });

    it('should only return venues for current tenant', async () => {
      // Set tenant context to tenant1
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant1Id]);

      const venues = await db('venues').select('*');
      
      // Should only see tenant1's venues
      expect(venues.length).toBeGreaterThanOrEqual(1);
      expect(venues.every(v => v.tenant_id === tenant1Id)).toBe(true);
      expect(venues.some(v => v.tenant_id === tenant2Id)).toBe(false);
    });

    it('should not return venues from other tenants', async () => {
      // Set tenant context to tenant2
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant2Id]);

      const venues = await db('venues').select('*');
      
      // Should only see tenant2's venues
      expect(venues.every(v => v.tenant_id === tenant2Id)).toBe(true);
      expect(venues.find(v => v.id === venue1Id)).toBeUndefined();
    });

    it('should prevent selecting specific venue from other tenant', async () => {
      // Set tenant context to tenant2
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant2Id]);

      // Try to select tenant1's venue by ID
      const venue = await db('venues').where('id', venue1Id).first();
      
      // Should not find the venue due to RLS
      expect(venue).toBeUndefined();
    });
  });

  describe('INSERT WITH CHECK', () => {
    it('should allow insert with correct tenant_id', async () => {
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant1Id]);

      const newVenueId = uuidv4();
      
      // Should succeed because tenant_id matches current tenant
      await expect(
        db('venues').insert({
          id: newVenueId,
          name: 'New Tenant 1 Venue',
          tenant_id: tenant1Id,
          address: '789 Test Blvd',
          city: 'Test City',
          state: 'TS',
          country: 'US',
        })
      ).resolves.not.toThrow();

      // Cleanup
      await db('venues').where('id', newVenueId).delete();
    });

    it('should prevent insert with wrong tenant_id', async () => {
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant1Id]);

      const newVenueId = uuidv4();
      
      // Should fail because tenant_id doesn't match current tenant
      await expect(
        db('venues').insert({
          id: newVenueId,
          name: 'Wrong Tenant Venue',
          tenant_id: tenant2Id, // Wrong tenant!
          address: '789 Test Blvd',
          city: 'Test City',
          state: 'TS',
          country: 'US',
        })
      ).rejects.toThrow(); // RLS WITH CHECK violation
    });
  });

  describe('UPDATE Protection', () => {
    it('should allow update of own tenant venue', async () => {
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant1Id]);

      // Should succeed
      await expect(
        db('venues')
          .where('id', venue1Id)
          .update({ name: 'Updated Tenant 1 Venue' })
      ).resolves.not.toThrow();
    });

    it('should prevent update of other tenant venue', async () => {
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant1Id]);

      // Should not update any rows (RLS filters out the row)
      const updatedCount = await db('venues')
        .where('id', venue2Id)
        .update({ name: 'Hacked Name' });
      
      expect(updatedCount).toBe(0);
    });

    it('should prevent changing tenant_id via update', async () => {
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant1Id]);

      // Should fail due to WITH CHECK on UPDATE
      await expect(
        db('venues')
          .where('id', venue1Id)
          .update({ tenant_id: tenant2Id }) // Try to change tenant
      ).rejects.toThrow(); // RLS WITH CHECK violation
    });
  });

  describe('DELETE Protection', () => {
    it('should allow delete of own tenant venue', async () => {
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant1Id]);

      const tempVenueId = uuidv4();
      
      // Create a temp venue
      await db.raw("SET LOCAL app.is_system_user = 'true'");
      await db('venues').insert({
        id: tempVenueId,
        name: 'Temp Venue',
        tenant_id: tenant1Id,
        address: '999 Temp St',
        city: 'Test City',
        state: 'TS',
        country: 'US',
      });
      await db.raw("RESET app.is_system_user");

      // Should succeed
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant1Id]);
      const deletedCount = await db('venues').where('id', tempVenueId).delete();
      
      expect(deletedCount).toBe(1);
    });

    it('should prevent delete of other tenant venue', async () => {
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenant1Id]);

      // Should not delete any rows (RLS filters out the row)
      const deletedCount = await db('venues').where('id', venue2Id).delete();
      
      expect(deletedCount).toBe(0);
    });
  });

  describe('System User Bypass', () => {
    it('should allow system user to access all tenants', async () => {
      await db.raw("SET LOCAL app.is_system_user = 'true'");
      await db.raw("SET LOCAL app.current_tenant_id = ''");

      const venues = await db('venues').select('*');
      
      // Should see venues from both tenants
      const tenant1Venues = venues.filter(v => v.tenant_id === tenant1Id);
      const tenant2Venues = venues.filter(v => v.tenant_id === tenant2Id);
      
      expect(tenant1Venues.length).toBeGreaterThanOrEqual(1);
      expect(tenant2Venues.length).toBeGreaterThanOrEqual(1);
      
      await db.raw("RESET app.is_system_user");
    });
  });
});

/**
 * Test helper to run queries in a specific tenant context
 */
async function withTenantContext<T>(
  db: Knex,
  tenantId: string,
  callback: () => Promise<T>
): Promise<T> {
  await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
  try {
    return await callback();
  } finally {
    await db.raw('RESET app.current_tenant_id');
  }
}

export { withTenantContext };
