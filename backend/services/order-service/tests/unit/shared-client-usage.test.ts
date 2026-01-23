/**
 * Unit Tests: Shared Client Usage - order-service
 *
 * Verifies correct wiring and usage of @tickettoken/shared library.
 * order-service uses custom clients that extend BaseServiceClient.
 * Clients: EventClient, TicketClient, PaymentClient (all extend BaseServiceClient)
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Mock the shared library
jest.mock('@tickettoken/shared', () => ({
  BaseServiceClient: class BaseServiceClient {
    protected baseURL: string;
    protected serviceName: string;
    protected timeout: number;

    constructor(config: { baseURL: string; serviceName: string; timeout: number }) {
      this.baseURL = config.baseURL;
      this.serviceName = config.serviceName;
      this.timeout = config.timeout;
    }

    protected async get<T>(path: string, ctx: any): Promise<{ data: T }> {
      return { data: {} as T };
    }

    protected async post<T>(path: string, ctx: any, data: any): Promise<{ data: T }> {
      return { data: {} as T };
    }
  },
  RequestContext: {},
  ServiceClientError: class ServiceClientError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  createRequestContext: jest.fn((tenantId: string, userId?: string) => ({
    tenantId,
    userId,
    traceId: `test-trace-${Date.now()}`,
  })),
}));

describe('order-service Shared Client Usage', () => {
  const srcDir = path.join(__dirname, '../../src');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('BaseServiceClient Extension Validation', () => {
    it('should have EventClient extending BaseServiceClient', () => {
      const clientPath = path.join(srcDir, 'services/event.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');

      expect(content).toMatch(/import\s*\{[^}]*BaseServiceClient[^}]*\}\s*from\s*['"]@tickettoken\/shared['"]/);
      expect(content).toMatch(/class\s+EventClient\s+extends\s+BaseServiceClient/);
    });

    it('should have TicketClient extending BaseServiceClient', () => {
      const clientPath = path.join(srcDir, 'services/ticket.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');

      expect(content).toMatch(/import\s*\{[^}]*BaseServiceClient[^}]*\}\s*from\s*['"]@tickettoken\/shared['"]/);
      expect(content).toMatch(/class\s+TicketClient\s+extends\s+BaseServiceClient/);
    });

    it('should have PaymentClient extending BaseServiceClient', () => {
      const clientPath = path.join(srcDir, 'services/payment.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');

      expect(content).toMatch(/import\s*\{[^}]*BaseServiceClient[^}]*\}\s*from\s*['"]@tickettoken\/shared['"]/);
      expect(content).toMatch(/class\s+PaymentClient\s+extends\s+BaseServiceClient/);
    });
  });

  describe('Custom HTTP Client Removal', () => {
    it('should NOT have http-client.util.ts', () => {
      const httpClientPath = path.join(srcDir, 'utils/http-client.util.ts');
      const exists = fs.existsSync(httpClientPath);
      expect(exists).toBe(false);
    });

    it('should NOT have standalone axios imports for S2S calls in client files', () => {
      const clientFiles = [
        'services/event.client.ts',
        'services/ticket.client.ts',
        'services/payment.client.ts',
      ];

      for (const file of clientFiles) {
        const filePath = path.join(srcDir, file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          // Should NOT have direct axios imports (BaseServiceClient handles HTTP)
          const hasDirectAxios = content.match(/import\s+axios\s+from\s+['"]axios['"]/);
          expect(hasDirectAxios).toBeNull();
        }
      }
    });
  });

  describe('ServiceClientError Import', () => {
    it('should import ServiceClientError in EventClient', () => {
      const clientPath = path.join(srcDir, 'services/event.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/ServiceClientError/);
    });

    it('should import ServiceClientError in TicketClient', () => {
      const clientPath = path.join(srcDir, 'services/ticket.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/ServiceClientError/);
    });

    it('should import ServiceClientError in PaymentClient', () => {
      const clientPath = path.join(srcDir, 'services/payment.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/ServiceClientError/);
    });
  });

  describe('RequestContext Import', () => {
    it('should import RequestContext in EventClient', () => {
      const clientPath = path.join(srcDir, 'services/event.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/RequestContext/);
    });

    it('should import RequestContext in TicketClient', () => {
      const clientPath = path.join(srcDir, 'services/ticket.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/RequestContext/);
    });

    it('should import RequestContext in PaymentClient', () => {
      const clientPath = path.join(srcDir, 'services/payment.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/RequestContext/);
    });
  });

  describe('Service Configuration', () => {
    it('should configure EventClient with correct service URL', () => {
      const clientPath = path.join(srcDir, 'services/event.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/EVENT_SERVICE_URL/);
      expect(content).toMatch(/event-service/);
    });

    it('should configure TicketClient with correct service URL', () => {
      const clientPath = path.join(srcDir, 'services/ticket.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/TICKET_SERVICE_URL/);
      expect(content).toMatch(/ticket-service/);
    });

    it('should configure PaymentClient with correct service URL', () => {
      const clientPath = path.join(srcDir, 'services/payment.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/PAYMENT_SERVICE_URL/);
      expect(content).toMatch(/payment-service/);
    });
  });

  describe('Refund Eligibility Service Integration', () => {
    it('should use RequestContext in refund-eligibility.service.ts', () => {
      const servicePath = path.join(srcDir, 'services/refund-eligibility.service.ts');
      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        expect(content).toMatch(/@tickettoken\/shared/);
        expect(content).toMatch(/RequestContext/);
      }
    });
  });

  describe('Royalty Service Integration', () => {
    it('should extend BaseServiceClient in royalty.service.ts', () => {
      const servicePath = path.join(srcDir, 'services/royalty.service.ts');
      if (fs.existsSync(servicePath)) {
        const content = fs.readFileSync(servicePath, 'utf8');
        expect(content).toMatch(/@tickettoken\/shared/);
        expect(content).toMatch(/BaseServiceClient/);
      }
    });
  });

  describe('Error Handling Patterns', () => {
    it('should use ServiceClientError for error handling in EventClient', () => {
      const clientPath = path.join(srcDir, 'services/event.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/error\s+instanceof\s+ServiceClientError/);
    });

    it('should use ServiceClientError for error handling in PaymentClient', () => {
      const clientPath = path.join(srcDir, 'services/payment.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      expect(content).toMatch(/error\s+instanceof\s+ServiceClientError/);
    });
  });

  describe('Fail-Closed Security Pattern', () => {
    it('should have fail-closed defaults for payment status', () => {
      const clientPath = path.join(srcDir, 'services/payment.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      // Should have fail-closed default for refundable
      expect(content).toMatch(/refundable:\s*false/);
    });

    it('should have fail-closed behavior in ticket transfer check', () => {
      const clientPath = path.join(srcDir, 'services/ticket.client.ts');
      const content = fs.readFileSync(clientPath, 'utf8');
      // Should throw on error (fail closed)
      expect(content).toMatch(/throw\s+error/);
    });
  });
});
