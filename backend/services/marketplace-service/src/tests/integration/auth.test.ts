import request from 'supertest';
import app from '../../app';
import { createTestUser, createAuthToken } from '../factories/user.factory';

describe('Authentication Middleware', () => {
  describe('Protected Routes', () => {
    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/api/v1/marketplace/admin/stats')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Authentication required');
    });

    it('should accept requests with valid token', async () => {
      const user = createTestUser({ role: 'admin' });
      const token = createAuthToken(user);
      
      const response = await request(app)
        .get('/api/v1/marketplace/admin/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('success');
    });

    it('should reject malformed tokens', async () => {
      const response = await request(app)
        .get('/api/v1/marketplace/admin/stats')
        .set('Authorization', 'Bearer invalid-token-here')
        .expect(401);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Role-based Access', () => {
    it('should allow admin access to admin routes', async () => {
      const admin = createTestUser({ role: 'admin' });
      const token = createAuthToken(admin);
      
      const response = await request(app)
        .get('/api/v1/marketplace/admin/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('success');
    });

    it('should deny regular user access to admin routes', async () => {
      const user = createTestUser({ role: 'user' });
      const token = createAuthToken(user);
      
      const response = await request(app)
        .get('/api/v1/marketplace/admin/stats')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      
      expect(response.body.error).toContain('Admin access required');
    });
  });
});
