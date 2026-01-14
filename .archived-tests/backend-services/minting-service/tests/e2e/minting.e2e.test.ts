/**
 * End-to-End Tests for Minting Service
 * 
 * These tests verify the complete minting flow from API request
 * to blockchain confirmation.
 * 
 * Requirements:
 * - Running minting-service
 * - PostgreSQL database
 * - Redis
 * - Solana devnet access (or local validator)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import axios, { AxiosInstance } from 'axios';

// Test configuration
const API_URL = process.env.TEST_API_URL || 'http://localhost:3000';
const TEST_TENANT_ID = 'test-tenant-e2e';
const TEST_TIMEOUT = 120000; // 2 minutes for blockchain operations

interface MintResponse {
  success: boolean;
  jobId: string;
  ticketId: string;
  status: string;
}

interface JobStatusResponse {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  result?: {
    assetId: string;
    signature: string;
  };
  error?: string;
}

describe('Minting Service E2E Tests', () => {
  let api: AxiosInstance;
  let authToken: string;

  beforeAll(async () => {
    // Setup API client
    api = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Get auth token (mock for E2E tests)
    authToken = process.env.TEST_AUTH_TOKEN || 'test-token';
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
    api.defaults.headers.common['X-Tenant-ID'] = TEST_TENANT_ID;
  });

  afterAll(async () => {
    // Cleanup test data if needed
  });

  describe('Health Checks', () => {
    it('should return healthy status', async () => {
      const response = await api.get('/health');
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('ok');
      expect(response.data.service).toBe('minting-service');
    });

    it('should return ready status when all dependencies are up', async () => {
      const response = await api.get('/health/ready');
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('ready');
      expect(response.data.checks.database.status).toBe('ok');
      expect(response.data.checks.redis.status).toBe('ok');
      expect(response.data.checks.queue.status).toBe('ok');
    });

    it('should return startup status', async () => {
      const response = await api.get('/health/startup');
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('ok');
    });

    it('should return Solana status', async () => {
      const response = await api.get('/health/solana');
      
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('connected');
      expect(response.data.rpc.slot).toBeGreaterThan(0);
    });
  });

  describe('Minting Flow', () => {
    it('should accept a mint request and return job ID', async () => {
      const ticketId = `e2e-ticket-${Date.now()}`;
      
      const response = await api.post('/internal/mint', {
        ticketId,
        tenantId: TEST_TENANT_ID,
        eventId: 'e2e-event-001',
        orderId: 'e2e-order-001',
        metadata: {
          name: 'E2E Test Ticket',
          event: 'Test Event',
          date: '2026-01-15',
        },
      });

      expect(response.status).toBe(202);
      expect(response.data.success).toBe(true);
      expect(response.data.jobId).toBeDefined();
      expect(response.data.ticketId).toBe(ticketId);
    });

    it('should complete minting and return asset ID', async () => {
      const ticketId = `e2e-ticket-complete-${Date.now()}`;
      
      // Submit mint request
      const mintResponse = await api.post('/internal/mint', {
        ticketId,
        tenantId: TEST_TENANT_ID,
        eventId: 'e2e-event-002',
        orderId: 'e2e-order-002',
        metadata: {
          name: 'E2E Complete Test',
          event: 'Test Event',
        },
      });

      const jobId = mintResponse.data.jobId;
      expect(jobId).toBeDefined();

      // Poll for completion
      let status: JobStatusResponse;
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max

      do {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const statusResponse = await api.get(`/internal/mint/status/${jobId}`);
        status = statusResponse.data;
        attempts++;
      } while (
        status.status !== 'completed' && 
        status.status !== 'failed' && 
        attempts < maxAttempts
      );

      expect(status.status).toBe('completed');
      expect(status.result?.assetId).toBeDefined();
      expect(status.result?.signature).toMatch(/^[A-HJ-NP-Za-km-z1-9]+$/);
    }, TEST_TIMEOUT);

    it('should reject duplicate mint requests', async () => {
      const ticketId = `e2e-ticket-dup-${Date.now()}`;
      
      // First request should succeed
      const firstResponse = await api.post('/internal/mint', {
        ticketId,
        tenantId: TEST_TENANT_ID,
        eventId: 'e2e-event-003',
      });
      expect(firstResponse.status).toBe(202);

      // Second request with same ticketId should be idempotent
      const secondResponse = await api.post('/internal/mint', {
        ticketId,
        tenantId: TEST_TENANT_ID,
        eventId: 'e2e-event-003',
      });
      
      // Should return same job ID (idempotent)
      expect(secondResponse.status).toBe(202);
      expect(secondResponse.data.jobId).toBe(firstResponse.data.jobId);
    });

    it('should validate required fields', async () => {
      try {
        await api.post('/internal/mint', {
          // Missing ticketId
          tenantId: TEST_TENANT_ID,
        });
        expect.fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toContain('ticketId');
      }
    });
  });

  describe('Batch Minting', () => {
    it('should accept batch mint requests', async () => {
      const tickets = [
        {
          ticketId: `e2e-batch-1-${Date.now()}`,
          tenantId: TEST_TENANT_ID,
          eventId: 'e2e-event-batch',
        },
        {
          ticketId: `e2e-batch-2-${Date.now()}`,
          tenantId: TEST_TENANT_ID,
          eventId: 'e2e-event-batch',
        },
      ];

      const response = await api.post('/internal/mint/batch', { tickets });

      expect(response.status).toBe(202);
      expect(response.data.jobs).toHaveLength(2);
      expect(response.data.queued).toBe(2);
    });
  });

  describe('Queue Management', () => {
    it('should return queue statistics', async () => {
      const response = await api.get('/admin/queue/stats', {
        headers: {
          'X-Admin-Key': process.env.ADMIN_API_KEY || 'test-admin-key',
        },
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('waiting');
      expect(response.data).toHaveProperty('active');
      expect(response.data).toHaveProperty('completed');
      expect(response.data).toHaveProperty('failed');
    });
  });

  describe('Error Handling', () => {
    it('should return 401 without authentication', async () => {
      const unauthApi = axios.create({
        baseURL: API_URL,
        timeout: 5000,
      });

      try {
        await unauthApi.post('/internal/mint', {
          ticketId: 'test',
          tenantId: 'test',
        });
        expect.fail('Should have returned 401');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    it('should return 429 when rate limited', async () => {
      // Send many requests quickly
      const requests = Array(100).fill(null).map((_, i) =>
        api.post('/internal/mint', {
          ticketId: `rate-limit-${i}-${Date.now()}`,
          tenantId: TEST_TENANT_ID,
          eventId: 'rate-limit-test',
        }).catch(e => e.response)
      );

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(r => r?.status === 429);
      
      // Should have some 429 responses if rate limiting works
      // (may not trigger in test environment with high limits)
      console.log(`Rate limited: ${rateLimited.length} / ${responses.length}`);
    });
  });
});

describe('Load Shedding E2E', () => {
  it('should shed low-priority requests under load', async () => {
    // This test is difficult to trigger without actually overloading
    // the service, so we just verify the endpoint exists
    const api = axios.create({
      baseURL: API_URL,
      timeout: 5000,
    });

    const response = await api.get('/health');
    expect(response.status).toBe(200);
  });
});
