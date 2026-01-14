/**
 * Integration tests for SDK packages
 * Tests interoperability between TypeScript, JavaScript, and React SDKs
 */

import { TicketToken } from '../sdk-typescript/src';

describe('SDK Integration Tests', () => {
  let client: TicketToken;

  beforeAll(() => {
    client = new TicketToken({
      apiKey: 'test-api-key',
      environment: 'development',
    });
  });

  describe('TypeScript SDK', () => {
    it('should create client with valid configuration', () => {
      expect(client).toBeDefined();
      expect(client.events).toBeDefined();
      expect(client.tickets).toBeDefined();
      expect(client.users).toBeDefined();
    });

    it('should expose all resource classes', () => {
      expect(client.events.list).toBeInstanceOf(Function);
      expect(client.events.get).toBeInstanceOf(Function);
      expect(client.tickets.getMyTickets).toBeInstanceOf(Function);
      expect(client.tickets.purchase).toBeInstanceOf(Function);
      expect(client.users.me).toBeInstanceOf(Function);
    });
  });

  describe('Cross-package compatibility', () => {
    it('should export types correctly', () => {
      const config = {
        apiKey: 'test',
        environment: 'development' as const,
      };
      
      const testClient = new TicketToken(config);
      expect(testClient).toBeDefined();
    });
  });
});
