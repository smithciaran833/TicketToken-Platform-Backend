import healthRoutes from '../../../src/routes/health.routes';

describe('Health Routes', () => {
  let mockFastify: any;
  let mockHealthCheckService: any;
  let mockContainer: any;

  beforeEach(() => {
    mockHealthCheckService = {
      getLiveness: jest.fn().mockResolvedValue({ status: 'ok' }),
      getReadiness: jest.fn().mockResolvedValue({ status: 'ok' }),
      getFullHealth: jest.fn().mockResolvedValue({ status: 'ok' })
    };

    mockContainer = {
      resolve: jest.fn((service) => {
        if (service === 'healthCheckService') return mockHealthCheckService;
        return null;
      }),
      cradle: {
        db: {
          raw: jest.fn().mockResolvedValue([{}])
        },
        redis: {
          ping: jest.fn().mockResolvedValue('PONG')
        }
      }
    };

    mockFastify = {
      get: jest.fn(),
      container: mockContainer
    };
  });

  it('should register GET /health/live route', async () => {
    await healthRoutes(mockFastify);
    
    expect(mockFastify.get).toHaveBeenCalledWith(
      '/health/live',
      expect.any(Function)
    );
  });

  it('should register GET /health/ready route', async () => {
    await healthRoutes(mockFastify);
    
    expect(mockFastify.get).toHaveBeenCalledWith(
      '/health/ready',
      expect.any(Function)
    );
  });

  it('should register GET /health/full route', async () => {
    await healthRoutes(mockFastify);
    
    expect(mockFastify.get).toHaveBeenCalledWith(
      '/health/full',
      expect.any(Function)
    );
  });

  it('should register GET /health route', async () => {
    await healthRoutes(mockFastify);
    
    expect(mockFastify.get).toHaveBeenCalledWith(
      '/health',
      expect.any(Function)
    );
  });
});
