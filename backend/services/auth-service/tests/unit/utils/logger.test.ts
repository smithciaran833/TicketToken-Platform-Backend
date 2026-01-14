// Logger tests are minimal since it's mostly Winston configuration
// We test the correlation ID functionality which is custom

jest.mock('@tickettoken/shared', () => ({
  PIISanitizer: {
    sanitize: jest.fn((obj) => obj),
    sanitizeRequest: jest.fn((req) => ({ method: req.method, url: req.url })),
  },
}));

import {
  withCorrelation,
  getCorrelationId,
  createChildLogger,
} from '../../../src/utils/logger';

describe('logger utils', () => {
  describe('withCorrelation', () => {
    it('sets correlation ID in context', () => {
      let capturedId: string | undefined;

      withCorrelation('test-corr-123', () => {
        capturedId = getCorrelationId();
      });

      expect(capturedId).toBe('test-corr-123');
    });

    it('returns callback result', () => {
      const result = withCorrelation('corr-id', () => {
        return 'callback-result';
      });

      expect(result).toBe('callback-result');
    });

    it('isolates correlation ID per context', () => {
      const ids: (string | undefined)[] = [];

      withCorrelation('context-1', () => {
        ids.push(getCorrelationId());
        
        withCorrelation('context-2', () => {
          ids.push(getCorrelationId());
        });
        
        ids.push(getCorrelationId());
      });

      expect(ids).toEqual(['context-1', 'context-2', 'context-1']);
    });
  });

  describe('getCorrelationId', () => {
    it('returns undefined outside context', () => {
      const result = getCorrelationId();

      expect(result).toBeUndefined();
    });

    it('returns correlation ID inside context', () => {
      withCorrelation('inside-context', () => {
        expect(getCorrelationId()).toBe('inside-context');
      });
    });
  });

  describe('createChildLogger', () => {
    it('creates child logger with correlation ID', () => {
      const child = createChildLogger('child-corr-id');

      expect(child).toBeDefined();
      // Child logger should have the correlation ID in its default meta
    });
  });
});
