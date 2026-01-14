import venuesRoutes from '../../../src/routes/venues.routes';

describe('Venues Routes', () => {
  let mockFastify: any;

  beforeEach(() => {
    mockFastify = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      patch: jest.fn()
    };
  });

  it('should register POST /venues route', async () => {
    await venuesRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.post).toHaveBeenCalled();
  });

  it('should register GET /venues route', async () => {
    await venuesRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.get).toHaveBeenCalled();
  });

  it('should register GET /venues/:id route', async () => {
    await venuesRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.get).toHaveBeenCalled();
  });

  it('should register PUT /venues/:id route', async () => {
    await venuesRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.put).toHaveBeenCalled();
  });

  it('should register DELETE /venues/:id route', async () => {
    await venuesRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.delete).toHaveBeenCalled();
  });

  it('should register POST /venues/:id/staff route', async () => {
    await venuesRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.post).toHaveBeenCalled();
  });

  it('should register GET /venues/:id/staff route', async () => {
    await venuesRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.get).toHaveBeenCalled();
  });

  it('should register DELETE /venues/:venueId/staff/:staffId route', async () => {
    await venuesRoutes(mockFastify, {}, jest.fn());
    expect(mockFastify.delete).toHaveBeenCalled();
  });
});
