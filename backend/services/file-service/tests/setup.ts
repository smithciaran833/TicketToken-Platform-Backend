// Global test setup
// This file runs once before all tests

// MUST BE FIRST - Mock pino before any imports (including Fastify which uses pino internally)
jest.mock('pino', () => {
  const mockLogger: any = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    level: 'info',
    levels: { labels: {}, values: {} },
    isLevelEnabled: jest.fn().mockReturnValue(true),
    bindings: jest.fn().mockReturnValue({}),
  };
  mockLogger.child = jest.fn().mockReturnValue(mockLogger);
  const pino: any = jest.fn(() => mockLogger);
  (pino as any).transport = jest.fn(() => ({}));
  (pino as any).destination = jest.fn(() => ({}));
  (pino as any).stdSerializers = {
    err: (err: any) => ({ message: err?.message, stack: err?.stack }),
    req: jest.fn(),
    res: jest.fn(),
  };
  (pino as any).stdTimeFunctions = {
    isoTime: jest.fn(() => ',"time":"2026-01-01T00:00:00.000Z"'),
    epochTime: jest.fn(() => ',"time":1704067200000'),
    unixTime: jest.fn(() => ',"time":1704067200'),
    nullTime: jest.fn(() => ''),
  };
  // CRITICAL: Fastify's logger.js requires pino.symbols
  (pino as any).symbols = {
    serializersSym: Symbol('pino.serializers'),
    redactFmtSym: Symbol('pino.redactFmt'),
    streamSym: Symbol('pino.stream'),
    stringifySym: Symbol('pino.stringify'),
    stringifiersSym: Symbol('pino.stringifiers'),
    needsMetadataGsym: Symbol('pino.needsMetadata'),
    chindingsSym: Symbol('pino.chindings'),
    formatOptsSym: Symbol('pino.formatOpts'),
    messageKeySym: Symbol('pino.messageKey'),
    nestedKeySym: Symbol('pino.nestedKey'),
    wildcardFirstSym: Symbol('pino.wildcardFirst'),
    levelCompSym: Symbol('pino.levelComp'),
    useLevelLabelsSym: Symbol('pino.useLevelLabels'),
    changeLevelNameSym: Symbol('pino.changeLevelName'),
    useOnlyCustomLevelsSym: Symbol('pino.useOnlyCustomLevels'),
    mixinSym: Symbol('pino.mixin'),
    lsCacheSym: Symbol('pino.lsCache'),
    levelValSym: Symbol('pino.levelVal'),
    setLevelSym: Symbol('pino.setLevel'),
    getLevelSym: Symbol('pino.getLevel'),
    isLevelEnabledSym: Symbol('pino.isLevelEnabled'),
    endSym: Symbol('pino.end'),
    writeSym: Symbol('pino.write'),
    formattersSym: Symbol('pino.formatters'),
    hooksSym: Symbol('pino.hooks'),
  };
  return pino;
});

// Mock logger before any imports that use it
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      fatal: jest.fn(),
    }),
  },
  createChildLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
  createRequestLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
  sanitizeForLogging: jest.fn((obj) => obj),
  logAndThrow: jest.fn((error) => { throw error; }),
  auditLog: jest.fn(),
  getLogMetrics: jest.fn(() => ({ debug: 0, info: 0, warn: 0, error: 0, fatal: 0 })),
  loggerWithMetrics: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(),
  },
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(),
  },
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.MAX_FILE_SIZE_MB = '100';
process.env.MAX_IMAGE_SIZE_MB = '10';
process.env.MAX_VIDEO_SIZE_MB = '500';
process.env.MAX_DOCUMENT_SIZE_MB = '50';
process.env.CHUNK_SIZE_MB = '5';
process.env.ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/gif,image/webp';
process.env.ALLOWED_DOCUMENT_TYPES = 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
process.env.ALLOWED_VIDEO_TYPES = 'video/mp4,video/quicktime,video/x-msvideo,video/webm';
process.env.LOCAL_STORAGE_PATH = './uploads';
process.env.TEMP_STORAGE_PATH = './temp';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  // Uncomment to suppress logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
