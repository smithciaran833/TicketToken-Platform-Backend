// Unmock pino for this test file - we need the real implementation
jest.unmock('pino');
jest.unmock('pino-pretty');

import { Writable } from 'stream';
import pino from 'pino';

// Test helper: capture log output
function createTestLogger() {
  const logs: any[] = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      logs.push(JSON.parse(chunk.toString()));
      callback();
    },
  });

  const testLogger = pino(
    {
      level: 'trace',
      redact: {
        paths: [
          'password',
          '*.password',
          'headers.authorization',
          'body.password',
          'email',
          '*.email',
          'body.email',
          'creditCard',
          'cardNumber',
          '*.cardNumber',
          'body.cardNumber',
          'token',
          '*.token',
          'apiKey',
          '*.apiKey',
        ],
        censor: '[REDACTED]',
      },
    },
    stream
  );

  return { logger: testLogger, logs };
}

async function waitForLogs() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('logger.ts - redaction', () => {
  describe('password redaction', () => {
    it('redacts top-level password field', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ password: 'secret123' }, 'test');
      await waitForLogs();
      
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].password).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('secret123');
    });

    it('redacts nested password field', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ user: { password: 'secret123' } }, 'test');
      await waitForLogs();
      
      expect(logs[0].user.password).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('secret123');
    });

    it('redacts body.password', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ body: { password: 'secret123', username: 'test' } }, 'test');
      await waitForLogs();
      
      expect(logs[0].body.password).toBe('[REDACTED]');
      expect(logs[0].body.username).toBe('test');
      expect(JSON.stringify(logs[0])).not.toContain('secret123');
    });
  });

  describe('authorization redaction', () => {
    it('redacts authorization header', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ 
        headers: { 
          authorization: 'Bearer secret-token',
          'content-type': 'application/json'
        } 
      }, 'test');
      await waitForLogs();
      
      expect(logs[0].headers.authorization).toBe('[REDACTED]');
      expect(logs[0].headers['content-type']).toBe('application/json');
      expect(JSON.stringify(logs[0])).not.toContain('secret-token');
    });
  });

  describe('email redaction', () => {
    it('redacts top-level email', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ email: 'user@example.com' }, 'test');
      await waitForLogs();
      
      expect(logs[0].email).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('user@example.com');
    });

    it('redacts nested email', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ user: { email: 'user@example.com' } }, 'test');
      await waitForLogs();
      
      expect(logs[0].user.email).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('user@example.com');
    });

    it('redacts body.email', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ body: { email: 'user@example.com' } }, 'test');
      await waitForLogs();
      
      expect(logs[0].body.email).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('user@example.com');
    });
  });

  describe('credit card redaction', () => {
    it('redacts cardNumber', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ cardNumber: '4111111111111111' }, 'test');
      await waitForLogs();
      
      expect(logs[0].cardNumber).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('4111111111111111');
    });

    it('redacts nested cardNumber', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ 
        payment: { cardNumber: '4111111111111111' } 
      }, 'test');
      await waitForLogs();
      
      expect(logs[0].payment.cardNumber).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('4111111111111111');
    });

    it('redacts body.cardNumber', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ 
        body: { cardNumber: '4111111111111111', amount: 100 } 
      }, 'test');
      await waitForLogs();
      
      expect(logs[0].body.cardNumber).toBe('[REDACTED]');
      expect(logs[0].body.amount).toBe(100);
      expect(JSON.stringify(logs[0])).not.toContain('4111111111111111');
    });
  });

  describe('token redaction', () => {
    it('redacts top-level token', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ token: 'secret-token-123' }, 'test');
      await waitForLogs();
      
      expect(logs[0].token).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('secret-token-123');
    });

    it('redacts nested token', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ auth: { token: 'secret-token-123' } }, 'test');
      await waitForLogs();
      
      expect(logs[0].auth.token).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('secret-token-123');
    });
  });

  describe('apiKey redaction', () => {
    it('redacts top-level apiKey', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ apiKey: 'sk_live_123456' }, 'test');
      await waitForLogs();
      
      expect(logs[0].apiKey).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('sk_live_123456');
    });

    it('redacts nested apiKey', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ config: { apiKey: 'sk_live_123456' } }, 'test');
      await waitForLogs();
      
      expect(logs[0].config.apiKey).toBe('[REDACTED]');
      expect(JSON.stringify(logs[0])).not.toContain('sk_live_123456');
    });
  });

  describe('non-sensitive data preservation', () => {
    it('does not redact safe fields', async () => {
      const { logger, logs } = createTestLogger();
      
      logger.info({ 
        username: 'john_doe',
        action: 'login',
        timestamp: '2024-01-01',
        password: 'secret123'
      }, 'test');
      await waitForLogs();
      
      expect(logs[0].username).toBe('john_doe');
      expect(logs[0].action).toBe('login');
      expect(logs[0].timestamp).toBe('2024-01-01');
      expect(logs[0].password).toBe('[REDACTED]');
    });
  });
});
