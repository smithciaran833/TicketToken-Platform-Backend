// Mock JWT verification
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn((token) => {
    if (token === 'mock-admin-jwt-token') {
      return { id: 'user-123', tenant_id: 'tenant-123', roles: ['admin'] };
    }
    if (token === 'mock-user-jwt-token') {
      return { id: 'user-456', tenant_id: 'tenant-123', roles: ['user'] };
    }
    throw new Error('Invalid token');
  }),
  sign: jest.fn(() => 'mock-token'),
}));
