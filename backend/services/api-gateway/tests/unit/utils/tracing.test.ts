// Mock all OpenTelemetry modules BEFORE importing the source file
const mockStart = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(undefined);
const mockSpan = {
  setStatus: jest.fn(),
  recordException: jest.fn(),
  end: jest.fn(),
  setAttribute: jest.fn(),
};
const mockStartSpan = jest.fn(() => mockSpan);

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({
    start: mockStart,
    shutdown: mockShutdown,
  })),
}));

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn(() => ({
      startSpan: mockStartSpan,
    })),
    setSpan: jest.fn((ctx, span) => ctx),
  },
  context: {
    active: jest.fn(() => ({})),
    with: jest.fn((ctx, fn) => fn()),
  },
  SpanStatusCode: {
    OK: 0,
    ERROR: 1,
    UNSET: 2,
  },
}));

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn(() => []),
}));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@opentelemetry/sdk-trace-base', () => ({
  BatchSpanProcessor: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@opentelemetry/instrumentation-fastify', () => ({
  FastifyInstrumentation: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@opentelemetry/instrumentation-http', () => ({
  HttpInstrumentation: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@opentelemetry/instrumentation-redis-4', () => ({
  RedisInstrumentation: jest.fn().mockImplementation(() => ({})),
}));

// NOW import the source file after mocks are set up
import {
  sdk,
  initializeTracing,
  shutdownTracing,
  createSpan,
  traceAsync,
  SpanStatusCode,
} from '../../../src/utils/tracing';

describe('tracing.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeTracing', () => {
    it('calls sdk.start()', () => {
      initializeTracing();
      expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('does not throw on error', () => {
      mockStart.mockImplementationOnce(() => {
        throw new Error('Start failed');
      });

      expect(() => initializeTracing()).not.toThrow();
    });
  });

  describe('shutdownTracing', () => {
    it('calls sdk.shutdown() and resolves', async () => {
      await shutdownTracing();
      expect(mockShutdown).toHaveBeenCalledTimes(1);
    });

    it('resolves even if shutdown fails', async () => {
      mockShutdown.mockRejectedValueOnce(new Error('Shutdown failed'));
      await expect(shutdownTracing()).resolves.toBeUndefined();
    });
  });

  describe('createSpan', () => {
    it('creates span with name only', () => {
      const span = createSpan('test-span');

      expect(mockStartSpan).toHaveBeenCalledWith('test-span', { attributes: undefined });
      expect(span).toBe(mockSpan);
    });

    it('creates span with name and attributes', () => {
      const attributes = { userId: '123', action: 'test' };
      const span = createSpan('test-operation', attributes);

      expect(mockStartSpan).toHaveBeenCalledWith('test-operation', { attributes });
      expect(span).toBe(mockSpan);
    });
  });

  describe('traceAsync', () => {
    it('executes function and returns result', async () => {
      const result = await traceAsync('test-operation', async () => {
        return 'success';
      });

      expect(result).toBe('success');
      expect(mockStartSpan).toHaveBeenCalledWith('test-operation', { attributes: undefined });
    });

    it('passes span to function', async () => {
      let capturedSpan;
      await traceAsync('test-operation', async (span) => {
        capturedSpan = span;
        return 'done';
      });

      expect(capturedSpan).toBe(mockSpan);
    });

    it('sets OK status on success', async () => {
      await traceAsync('test-operation', async () => {
        return 'success';
      });

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    });

    it('ends span on success', async () => {
      await traceAsync('test-operation', async () => {
        return 'success';
      });

      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('records exception on error', async () => {
      const error = new Error('Test error');

      await expect(
        traceAsync('test-operation', async () => {
          throw error;
        })
      ).rejects.toThrow('Test error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    });

    it('sets ERROR status on error', async () => {
      const error = new Error('Test error');

      await expect(
        traceAsync('test-operation', async () => {
          throw error;
        })
      ).rejects.toThrow('Test error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Test error',
      });
    });

    it('ends span even on error', async () => {
      await expect(
        traceAsync('test-operation', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('rethrows error after recording', async () => {
      const error = new Error('Test error');

      await expect(
        traceAsync('test-operation', async () => {
          throw error;
        })
      ).rejects.toThrow(error);
    });

    it('passes attributes to span', async () => {
      const attributes = { userId: '123', operation: 'fetch' };

      await traceAsync(
        'test-operation',
        async () => {
          return 42;
        },
        attributes
      );

      expect(mockStartSpan).toHaveBeenCalledWith('test-operation', { attributes });
    });

    it('executes function with correct return type', async () => {
      const numberResult = await traceAsync('test-operation', async () => {
        return 42;
      });
      expect(numberResult).toBe(42);

      const objectResult = await traceAsync('test-operation', async () => {
        return { data: 'test' };
      });
      expect(objectResult).toEqual({ data: 'test' });

      const arrayResult = await traceAsync('test-operation', async () => {
        return [1, 2, 3];
      });
      expect(arrayResult).toEqual([1, 2, 3]);
    });
  });

  describe('SpanStatusCode export', () => {
    it('exports OK status code', () => {
      expect(SpanStatusCode.OK).toBe(0);
    });

    it('exports ERROR status code', () => {
      expect(SpanStatusCode.ERROR).toBe(1);
    });

    it('exports UNSET status code', () => {
      expect(SpanStatusCode.UNSET).toBe(2);
    });
  });
});
