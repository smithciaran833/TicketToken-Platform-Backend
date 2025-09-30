import jwt from 'jsonwebtoken';

const secret = process.env.JWT_ACCESS_SECRET || 'test-secret';

export function createTestToken(payload: any = {}) {
  return jwt.sign(
    {
      id: payload.id || 'user-123',
      email: payload.email || 'test@example.com',
      tenant_id: payload.tenant_id || 'tenant-123',
      ...payload
    },
    secret,
    { expiresIn: '1h' }
  );
}

export const validUserToken = createTestToken({ id: 'user-123' });
export const validAdminToken = createTestToken({ id: 'admin-123', roles: ['admin'] });
