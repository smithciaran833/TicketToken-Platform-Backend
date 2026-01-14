import domainRoutes from '../../../src/routes/domain.routes';

describe('Domain Routes', () => {
  let mockFastify: any;

  beforeEach(() => {
    mockFastify = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn()
    };
  });

  it('should register POST /venues/:venueId/domains route', async () => {
    await domainRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.post).toHaveBeenCalled();
  });

  it('should register GET /venues/:venueId/domains route', async () => {
    await domainRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.get).toHaveBeenCalled();
  });

  it('should register DELETE /venues/:venueId/domains/:domainId route', async () => {
    await domainRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.delete).toHaveBeenCalled();
  });

  it('should register POST /venues/:venueId/domains/:domainId/verify route', async () => {
    await domainRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.post).toHaveBeenCalled();
  });
});
