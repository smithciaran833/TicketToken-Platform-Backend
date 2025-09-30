// Debug test for login issues
jest.mock('../../src/config/database', () => ({
  pool: { query: jest.fn() }
}));
jest.mock('bcrypt');

import { AuthService } from '../../src/services/auth.service';
import { pool } from '../../src/config/database';
import bcrypt from 'bcrypt';

describe('Login Debug', () => {
  it('should check mock is working', async () => {
    const mockQuery = pool.query as jest.Mock;
    
    // Set up the mock TWICE to see if it persists
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '2' }] });
    
    const result1 = await pool.query('test1');
    const result2 = await pool.query('test2');
    
    expect(result1.rows[0].id).toBe('1');
    expect(result2.rows[0].id).toBe('2');
  });
  
  it('should work with AuthService', async () => {
    const mockQuery = pool.query as jest.Mock;
    const mockCompare = bcrypt.compare as jest.Mock;
    const mockJWTService: any = {
      generateTokenPair: jest.fn().mockResolvedValue({ 
        accessToken: 'token', 
        refreshToken: 'refresh' 
      }),
      verifyAccessToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
      refreshTokens: jest.fn()
    };
    
    const authService = new AuthService(mockJWTService);
    
    // Setup mock for the exact query the service will make
    mockQuery.mockResolvedValueOnce({ 
      rows: [{
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'hash',
        first_name: 'Test',
        last_name: 'User',
        email_verified: true,
        mfa_enabled: false
      }]
    });
    mockCompare.mockResolvedValueOnce(true);
    
    const result = await authService.login({
      email: 'test@example.com',
      password: 'password',
      ipAddress: '127.0.0.1',
      userAgent: 'test'
    });
    
    expect(result.user.email).toBe('test@example.com');
  });
});
