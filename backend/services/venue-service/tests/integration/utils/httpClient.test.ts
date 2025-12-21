/**
 * HTTP Client Integration Tests
 */

import { HttpClient } from '../../../src/utils/httpClient';

describe('HTTP Client Integration Tests', () => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  describe('HttpClient', () => {
    it('should create HTTP client instance', () => {
      const client = new HttpClient('http://localhost:3000', mockLogger);
      expect(client).toBeDefined();
    });

    it('should have get method', () => {
      const client = new HttpClient('http://localhost:3000', mockLogger);
      expect(typeof client.get).toBe('function');
    });

    it('should have post method', () => {
      const client = new HttpClient('http://localhost:3000', mockLogger);
      expect(typeof client.post).toBe('function');
    });

    it('should have put method', () => {
      const client = new HttpClient('http://localhost:3000', mockLogger);
      expect(typeof client.put).toBe('function');
    });

    it('should have delete method', () => {
      const client = new HttpClient('http://localhost:3000', mockLogger);
      expect(typeof client.delete).toBe('function');
    });
  });
});
