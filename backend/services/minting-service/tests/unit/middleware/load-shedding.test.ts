/**
 * Unit Tests for middleware/load-shedding.ts
 * 
 * Tests load shedding, bulkhead pattern, and priority-based request handling.
 * Priority: 🟠 High
 */

import { RequestPriority, getLoadSheddingStatus } from '../../../src/middleware/load-shedding';

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

// =============================================================================
// RequestPriority Tests
// =============================================================================

describe('RequestPriority enum', () => {
  it('should define CRITICAL priority', () => {
    expect(RequestPriority.CRITICAL).toBe('critical');
  });

  it('should define HIGH priority', () => {
    expect(RequestPriority.HIGH).toBe('high');
  });

  it('should define NORMAL priority', () => {
    expect(RequestPriority.NORMAL).toBe('normal');
  });

  it('should define LOW priority', () => {
    expect(RequestPriority.LOW).toBe('low');
  });
});

// =============================================================================
// getLoadSheddingStatus Tests
// =============================================================================

describe('getLoadSheddingStatus', () => {
  it('should return enabled status', () => {
    const status = getLoadSheddingStatus();
    expect(typeof status.enabled).toBe('boolean');
  });

  it('should return current request count', () => {
    const status = getLoadSheddingStatus();
    expect(typeof status.currentRequests).toBe('number');
    expect(status.currentRequests).toBeGreaterThanOrEqual(0);
  });

  it('should return max requests', () => {
    const status = getLoadSheddingStatus();
    expect(typeof status.maxRequests).toBe('number');
    expect(status.maxRequests).toBeGreaterThan(0);
  });

  it('should return load percent', () => {
    const status = getLoadSheddingStatus();
    expect(typeof status.loadPercent).toBe('number');
  });

  it('should return bulkheads status', () => {
    const status = getLoadSheddingStatus();
    expect(status.bulkheads).toBeDefined();
    expect(typeof status.bulkheads).toBe('object');
  });

  it('should have mint bulkhead', () => {
    const status = getLoadSheddingStatus();
    expect(status.bulkheads.mint).toBeDefined();
    expect(status.bulkheads.mint.current).toBeGreaterThanOrEqual(0);
    expect(status.bulkheads.mint.max).toBeGreaterThan(0);
  });

  it('should have webhook bulkhead', () => {
    const status = getLoadSheddingStatus();
    expect(status.bulkheads.webhook).toBeDefined();
  });

  it('should have admin bulkhead', () => {
    const status = getLoadSheddingStatus();
    expect(status.bulkheads.admin).toBeDefined();
  });

  it('should have default bulkhead', () => {
    const status = getLoadSheddingStatus();
    expect(status.bulkheads.default).toBeDefined();
  });
});
