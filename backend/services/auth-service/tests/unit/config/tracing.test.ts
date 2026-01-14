const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

// Mock OpenTelemetry modules
jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    shutdown: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn(() => []),
}));

jest.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: jest.fn(() => ({})),
}));

jest.mock('@opentelemetry/semantic-conventions', () => ({
  SEMRESATTRS_SERVICE_NAME: 'service.name',
  SEMRESATTRS_SERVICE_VERSION: 'service.version',
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT: 'deployment.environment',
}));

jest.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: jest.fn(() => ({})),
  },
}));

import { initTracing, getTracer, shutdownTracing } from '../../../src/config/tracing';

describe('tracing config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('initTracing', () => {
    it('should skip initialization in production without OTEL endpoint', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      initTracing();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'OpenTelemetry tracing disabled - no OTEL_EXPORTER_OTLP_ENDPOINT configured'
      );
    });

    it('should initialize in development without OTEL endpoint', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      initTracing();

      expect(mockLogger.info).toHaveBeenCalledWith('OpenTelemetry tracing initialized');
    });

    it('should initialize with OTEL endpoint configured', () => {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';

      initTracing();

      expect(mockLogger.info).toHaveBeenCalledWith('OpenTelemetry tracing initialized');
    });
  });

  describe('getTracer', () => {
    it('should return a tracer', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
    });

    it('should accept custom name', () => {
      const tracer = getTracer('custom-tracer');
      expect(tracer).toBeDefined();
    });
  });

  describe('shutdownTracing', () => {
    it('should be a function', () => {
      expect(typeof shutdownTracing).toBe('function');
    });

    it('should handle shutdown when SDK not initialized', async () => {
      // Should not throw
      await shutdownTracing();
    });
  });
});
