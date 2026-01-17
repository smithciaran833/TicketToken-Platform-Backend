/**
 * InfluxDB Configuration Tests
 */

// Create mock instances
const mockWriteApi = {
  writePoint: jest.fn(),
  flush: jest.fn(),
  close: jest.fn(),
};

const mockQueryApi = {
  queryRows: jest.fn(),
  collectRows: jest.fn(),
};

const mockInfluxInstance = {
  getWriteApi: jest.fn().mockReturnValue(mockWriteApi),
  getQueryApi: jest.fn().mockReturnValue(mockQueryApi),
};

// Track constructor calls
const MockInfluxDB = jest.fn().mockImplementation(() => mockInfluxInstance);

// Mock BEFORE any imports
jest.mock('@influxdata/influxdb-client', () => ({
  InfluxDB: MockInfluxDB,
}));

describe('InfluxDB Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    MockInfluxDB.mockClear();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should create InfluxDB instance with default config', () => {
    jest.resetModules();
    jest.doMock('@influxdata/influxdb-client', () => ({
      InfluxDB: MockInfluxDB,
    }));
    
    require('../../../src/config/influxdb');
    
    expect(MockInfluxDB).toHaveBeenCalled();
  });

  it('should use environment variables for configuration', () => {
    process.env.INFLUXDB_URL = 'http://custom-influx:8086';
    process.env.INFLUXDB_TOKEN = 'custom-token';
    
    jest.resetModules();
    jest.doMock('@influxdata/influxdb-client', () => ({
      InfluxDB: MockInfluxDB,
    }));
    
    require('../../../src/config/influxdb');

    expect(MockInfluxDB).toHaveBeenCalledWith({
      url: 'http://custom-influx:8086',
      token: 'custom-token',
    });
  });

  it('should export getWriteApi function', () => {
    jest.resetModules();
    jest.doMock('@influxdata/influxdb-client', () => ({
      InfluxDB: MockInfluxDB,
    }));
    
    const { getWriteApi } = require('../../../src/config/influxdb');
    
    expect(typeof getWriteApi).toBe('function');
    const writeApi = getWriteApi();
    expect(writeApi).toBeDefined();
  });

  it('should export getQueryApi function', () => {
    jest.resetModules();
    jest.doMock('@influxdata/influxdb-client', () => ({
      InfluxDB: MockInfluxDB,
    }));
    
    const { getQueryApi } = require('../../../src/config/influxdb');
    
    expect(typeof getQueryApi).toBe('function');
    const queryApi = getQueryApi();
    expect(queryApi).toBeDefined();
  });

  it('should use default values when env vars not set', () => {
    delete process.env.INFLUXDB_URL;
    delete process.env.INFLUXDB_TOKEN;
    
    jest.resetModules();
    jest.doMock('@influxdata/influxdb-client', () => ({
      InfluxDB: MockInfluxDB,
    }));
    
    require('../../../src/config/influxdb');

    expect(MockInfluxDB).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.any(String),
        token: expect.any(String),
      })
    );
  });
});
