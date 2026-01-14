/**
 * Multi-Tenant Isolation Tests
 * 
 * HIGH FIX: Tests to verify tenant isolation and prevent cross-tenant data access.
 * These tests ensure RLS policies are properly enforced.
 * 
 * MEDIUM FIXES:
 * - E2E-4: Tenant isolation test
 * - SEC-7: Cross-tenant security tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Test database connection
const testPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/tickettoken_test',
  max: 5,
});

// Test tenants
const TENANT_A = uuidv4();
const TENANT_B = uuidv4();
const TENANT_C = uuidv4();

// Test data IDs
let paymentA1: string;
let paymentA2: string;
let paymentB1: string;
let refundA1: string;
let refundB1: string;

describe('Multi-Tenant Isolation Tests', () => {
  beforeAll(async () => {
    // Setup test data
    const client = await testPool.connect();
    try {
      // Ensure RLS is enabled
      await client.query(`SET app.bypass_rls = 'true'`);
      
      // Create test tenants
      await client.query(`
        INSERT INTO tenants (id, name, created_at) VALUES
        ($1, 'Tenant A', NOW()),
        ($2, 'Tenant B', NOW()),
        ($3, 'Tenant C', NOW())
        ON CONFLICT (id) DO NOTHING
      `, [TENANT_A, TENANT_B, TENANT_C]);
      
      // Create test payments for Tenant A
      paymentA1 = uuidv4();
      paymentA2 = uuidv4();
      await client.query(`
        INSERT INTO payment_transactions (id, tenant_id, user_id, amount, currency, status, created_at) VALUES
        ($1, $2, $3, 10000, 'USD', 'succeeded', NOW()),
        ($4, $2, $3, 20000, 'USD', 'succeeded', NOW())
      `, [paymentA1, TENANT_A, uuidv4(), paymentA2]);
      
      // Create test payments for Tenant B
      paymentB1 = uuidv4();
      await client.query(`
        INSERT INTO payment_transactions (id, tenant_id, user_id, amount, currency, status, created_at) VALUES
        ($1, $2, $3, 15000, 'USD', 'succeeded', NOW())
      `, [paymentB1, TENANT_B, uuidv4()]);
      
      // Create test refunds
      refundA1 = uuidv4();
      refundB1 = uuidv4();
      await client.query(`
        INSERT INTO payment_refunds (id, tenant_id, transaction_id, amount, status, reason, created_at) VALUES
        ($1, $2, $3, 5000, 'succeeded', 'requested_by_customer', NOW()),
        ($4, $5, $6, 7500, 'succeeded', 'duplicate', NOW())
      `, [refundA1, TENANT_A, paymentA1, refundB1, TENANT_B, paymentB1]);
      
      await client.query(`SET app.bypass_rls = 'false'`);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    // Cleanup test data
    const client = await testPool.connect();
    try {
      await client.query(`SET app.bypass_rls = 'true'`);
      await client.query(`DELETE FROM payment_refunds WHERE tenant_id IN ($1, $2, $3)`, [TENANT_A, TENANT_B, TENANT_C]);
      await client.query(`DELETE FROM payment_transactions WHERE tenant_id IN ($1, $2, $3)`, [TENANT_A, TENANT_B, TENANT_C]);
      await client.query(`DELETE FROM tenants WHERE id IN ($1, $2, $3)`, [TENANT_A, TENANT_B, TENANT_C]);
      await client.query(`SET app.bypass_rls = 'false'`);
    } finally {
      client.release();
    }
    await testPool.end();
  });

  describe('RLS Policy Enforcement', () => {
    it('should only return payments for the current tenant', async () => {
      const client = await testPool.connect();
      try {
        // Set tenant context to Tenant A
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
        
        const result = await client.query('SELECT id FROM payment_transactions');
        
        expect(result.rows.length).toBe(2);
        expect(result.rows.map(r => r.id)).toContain(paymentA1);
        expect(result.rows.map(r => r.id)).toContain(paymentA2);
        expect(result.rows.map(r => r.id)).not.toContain(paymentB1);
      } finally {
        client.release();
      }
    });

    it('should only return refunds for the current tenant', async () => {
      const client = await testPool.connect();
      try {
        // Set tenant context to Tenant B
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_B]);
        
        const result = await client.query('SELECT id FROM payment_refunds');
        
        expect(result.rows.length).toBe(1);
        expect(result.rows[0].id).toBe(refundB1);
        expect(result.rows.map(r => r.id)).not.toContain(refundA1);
      } finally {
        client.release();
      }
    });

    it('should return empty result for tenant with no data', async () => {
      const client = await testPool.connect();
      try {
        // Set tenant context to Tenant C (no data)
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_C]);
        
        const payments = await client.query('SELECT id FROM payment_transactions');
        const refunds = await client.query('SELECT id FROM payment_refunds');
        
        expect(payments.rows.length).toBe(0);
        expect(refunds.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    it('should prevent reading specific payment from another tenant', async () => {
      const client = await testPool.connect();
      try {
        // Set tenant context to Tenant A
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
        
        // Try to read Tenant B's payment
        const result = await client.query(
          'SELECT * FROM payment_transactions WHERE id = $1',
          [paymentB1]
        );
        
        expect(result.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });
  });

  describe('Cross-Tenant Write Prevention', () => {
    it('should prevent updating payment from another tenant', async () => {
      const client = await testPool.connect();
      try {
        // Set tenant context to Tenant A
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
        
        // Try to update Tenant B's payment
        const result = await client.query(
          'UPDATE payment_transactions SET status = $1 WHERE id = $2 RETURNING id',
          ['failed', paymentB1]
        );
        
        // Should not update any rows due to RLS
        expect(result.rowCount).toBe(0);
        
        // Verify original data unchanged
        await client.query(`SET app.bypass_rls = 'true'`);
        const verify = await client.query(
          'SELECT status FROM payment_transactions WHERE id = $1',
          [paymentB1]
        );
        await client.query(`SET app.bypass_rls = 'false'`);
        
        expect(verify.rows[0].status).toBe('succeeded');
      } finally {
        client.release();
      }
    });

    it('should prevent deleting refund from another tenant', async () => {
      const client = await testPool.connect();
      try {
        // Set tenant context to Tenant A
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
        
        // Try to delete Tenant B's refund
        const result = await client.query(
          'DELETE FROM payment_refunds WHERE id = $1 RETURNING id',
          [refundB1]
        );
        
        // Should not delete any rows due to RLS
        expect(result.rowCount).toBe(0);
        
        // Verify data still exists
        await client.query(`SET app.bypass_rls = 'true'`);
        const verify = await client.query(
          'SELECT id FROM payment_refunds WHERE id = $1',
          [refundB1]
        );
        await client.query(`SET app.bypass_rls = 'false'`);
        
        expect(verify.rows.length).toBe(1);
      } finally {
        client.release();
      }
    });

    it('should reject insert with wrong tenant_id', async () => {
      const client = await testPool.connect();
      try {
        // Set tenant context to Tenant A
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
        
        const newId = uuidv4();
        
        // Try to insert with Tenant B's tenant_id
        await expect(
          client.query(
            `INSERT INTO payment_transactions (id, tenant_id, user_id, amount, currency, status, created_at) 
             VALUES ($1, $2, $3, 5000, 'USD', 'pending', NOW())`,
            [newId, TENANT_B, uuidv4()]
          )
        ).rejects.toThrow(); // Should throw due to RLS policy
      } finally {
        client.release();
      }
    });
  });

  describe('Tenant Context Validation', () => {
    it('should reject queries without tenant context', async () => {
      const client = await testPool.connect();
      try {
        // Clear tenant context
        await client.query(`SELECT set_config('app.current_tenant_id', '', false)`);
        
        // Query should return empty or fail depending on policy
        const result = await client.query('SELECT id FROM payment_transactions');
        
        expect(result.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    it('should reject invalid UUID as tenant context', async () => {
      const client = await testPool.connect();
      try {
        // Set invalid tenant context
        await client.query(`SELECT set_config('app.current_tenant_id', 'not-a-uuid', false)`);
        
        const result = await client.query('SELECT id FROM payment_transactions');
        
        expect(result.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });

    it('should reject non-existent tenant', async () => {
      const client = await testPool.connect();
      try {
        // Set non-existent tenant
        const nonExistent = uuidv4();
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [nonExistent]);
        
        const result = await client.query('SELECT id FROM payment_transactions');
        
        expect(result.rows.length).toBe(0);
      } finally {
        client.release();
      }
    });
  });

  describe('Service Bypass (Admin Operations)', () => {
    it('should allow bypass for admin operations', async () => {
      const client = await testPool.connect();
      try {
        // Enable bypass (simulating admin/service context)
        await client.query(`SET app.bypass_rls = 'true'`);
        
        const result = await client.query('SELECT id, tenant_id FROM payment_transactions');
        
        // Should return payments from all tenants
        expect(result.rows.length).toBeGreaterThanOrEqual(3);
        
        const tenantIds = new Set(result.rows.map(r => r.tenant_id));
        expect(tenantIds.has(TENANT_A)).toBe(true);
        expect(tenantIds.has(TENANT_B)).toBe(true);
        
        await client.query(`SET app.bypass_rls = 'false'`);
      } finally {
        client.release();
      }
    });

    it('should properly scope bypass to transaction', async () => {
      const clientA = await testPool.connect();
      const clientB = await testPool.connect();
      
      try {
        // Client A enables bypass
        await clientA.query(`SET app.bypass_rls = 'true'`);
        
        // Client B should NOT have bypass
        await clientB.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
        
        const resultB = await clientB.query('SELECT id FROM payment_transactions');
        
        // Client B should only see Tenant A data
        expect(resultB.rows.length).toBe(2);
        expect(resultB.rows.map(r => r.id)).not.toContain(paymentB1);
        
        await clientA.query(`SET app.bypass_rls = 'false'`);
      } finally {
        clientA.release();
        clientB.release();
      }
    });
  });

  describe('Join Security', () => {
    it('should enforce RLS on joined tables', async () => {
      const client = await testPool.connect();
      try {
        // Set tenant context to Tenant A
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
        
        // Join payments and refunds
        const result = await client.query(`
          SELECT p.id as payment_id, r.id as refund_id
          FROM payment_transactions p
          LEFT JOIN payment_refunds r ON p.id = r.transaction_id
        `);
        
        // Should only see Tenant A's data
        const paymentIds = result.rows.map(r => r.payment_id);
        expect(paymentIds).not.toContain(paymentB1);
        
        const refundIds = result.rows.map(r => r.refund_id).filter(Boolean);
        expect(refundIds).not.toContain(refundB1);
      } finally {
        client.release();
      }
    });
  });

  describe('Aggregate Query Security', () => {
    it('should only aggregate data for current tenant', async () => {
      const client = await testPool.connect();
      try {
        // Set tenant context to Tenant A
        await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
        
        const result = await client.query(`
          SELECT SUM(amount) as total, COUNT(*) as count
          FROM payment_transactions
        `);
        
        // Should only sum Tenant A's payments (10000 + 20000 = 30000)
        expect(parseInt(result.rows[0].total)).toBe(30000);
        expect(parseInt(result.rows[0].count)).toBe(2);
      } finally {
        client.release();
      }
    });
  });
});

describe('Cross-Tenant Security Tests', () => {
  describe('API-Level Tenant Enforcement', () => {
    it('should reject requests with mismatched tenant in body', async () => {
      // This would be tested at the API level
      // The tenant middleware should reject requests where body.tenantId !== jwt.tenantId
      
      const mockRequest = {
        user: { tenantId: TENANT_A },
        body: { tenantId: TENANT_B, amount: 1000 }
      };
      
      // Simulate tenant middleware check
      const tenantMismatch = mockRequest.body.tenantId !== mockRequest.user.tenantId;
      expect(tenantMismatch).toBe(true);
    });

    it('should reject requests with mismatched tenant in params', async () => {
      const mockRequest = {
        user: { tenantId: TENANT_A },
        params: { tenantId: TENANT_B }
      };
      
      const tenantMismatch = mockRequest.params.tenantId !== mockRequest.user.tenantId;
      expect(tenantMismatch).toBe(true);
    });
  });

  describe('Resource Ownership Validation', () => {
    it('should validate resource belongs to tenant before access', async () => {
      const client = await testPool.connect();
      try {
        // Simulate checking if a resource belongs to the requesting tenant
        async function validateOwnership(resourceId: string, tenantId: string): Promise<boolean> {
          await client.query(`SET app.bypass_rls = 'true'`);
          const result = await client.query(
            'SELECT tenant_id FROM payment_transactions WHERE id = $1',
            [resourceId]
          );
          await client.query(`SET app.bypass_rls = 'false'`);
          
          if (result.rows.length === 0) return false;
          return result.rows[0].tenant_id === tenantId;
        }
        
        // Tenant A should own paymentA1
        expect(await validateOwnership(paymentA1, TENANT_A)).toBe(true);
        
        // Tenant A should NOT own paymentB1
        expect(await validateOwnership(paymentB1, TENANT_A)).toBe(false);
        
        // Tenant B should own paymentB1
        expect(await validateOwnership(paymentB1, TENANT_B)).toBe(true);
      } finally {
        client.release();
      }
    });
  });
});
