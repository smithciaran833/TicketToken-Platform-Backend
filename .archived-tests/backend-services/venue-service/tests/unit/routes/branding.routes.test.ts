import brandingRoutes from '../../../src/routes/branding.routes';

describe('Branding Routes', () => {
  let mockFastify: any;

  beforeEach(() => {
    mockFastify = {
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn()
    };
  });

  it('should register GET /venues/:venueId/branding route', async () => {
    await brandingRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.get).toHaveBeenCalled();
  });

  it('should register PUT /venues/:venueId/branding route', async () => {
    await brandingRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.put).toHaveBeenCalled();
  });

  it('should register DELETE /venues/:venueId/branding route', async () => {
    await brandingRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.delete).toHaveBeenCalled();
  });
});
