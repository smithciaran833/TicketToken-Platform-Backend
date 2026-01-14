/**
 * Unit Tests for middleware/request-id.ts
 * 
 * Tests request ID generation and propagation.
 * Priority: 🟡 Medium
 */

import { getRequestId } from '../../../src/middleware/request-id';

// =============================================================================
// Mock Setup
// =============================================================================

jest.mock('../../../src/utils/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const createMockRequest = (overrides: any = {}) => ({
  id: undefined,
  headers: {},
  method: 'GET',
  url: '/test',
  ip: '127.0.0.1',
  ...overrides
});

// =============================================================================
// getRequestId Tests
// =============================================================================

describe('getRequestId', () => {
  it('should return request.id when present', () => {
    const request = createMockRequest({ id: 'test-request-id-123' });
    
    expect(getRequestId(request as any)).toBe('test-request-id-123');
  });

  it('should return "unknown" when no id present', () => {
    const request = createMockRequest({ id: undefined });
    
    expect(getRequestId(request as any)).toBe('unknown');
  });

  it('should return "unknown" for empty string id', () => {
    const request = createMockRequest({ id: '' });
    
    expect(getRequestId(request as any)).toBe('unknown');
  });

  it('should return UUID format id', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const request = createMockRequest({ id: uuid });
    
    expect(getRequestId(request as any)).toBe(uuid);
  });
});
