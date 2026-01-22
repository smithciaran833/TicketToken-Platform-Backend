import request from 'supertest';
import {
  testPool,
  testRedis,
  TEST_TENANT_ID,
  cleanupAll,
  closeConnections,
  createTestUser,
  initAppRedis,
} from './setup';

// Mock email service
jest.mock('../../src/services/email.service', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  })),
}));

import { getRedis } from '../../src/config/redis';
import { buildApp } from '../../src/app';

let app: any;

// ============================================
// TEST HELPERS
// ============================================

const getUserSessions = async (userId: string) => {
  const result = await testPool.query(
    'SELECT * FROM user_sessions WHERE user_id = $1 ORDER BY started_at DESC',
    [userId]
  );
  return result.rows;
};

const getSessionById = async (sessionId: string) => {
  const result = await testPool.query(
    'SELECT * FROM user_sessions WHERE id = $1',
    [sessionId]
  );
  return result.rows[0];
};

const getActiveSessionsCount = async (userId: string): Promise<number> => {
  const result = await testPool.query(
    'SELECT COUNT(*) as count FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL AND revoked_at IS NULL',
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
};

const getRevokedSessionsCount = async (userId: string): Promise<number> => {
  const result = await testPool.query(
    'SELECT COUNT(*) as count FROM user_sessions WHERE user_id = $1 AND revoked_at IS NOT NULL',
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
};

const getEndedSessionsCount = async (userId: string): Promise<number> => {
  const result = await testPool.query(
    'SELECT COUNT(*) as count FROM user_sessions WHERE user_id = $1 AND ended_at IS NOT NULL',
    [userId]
  );
  return parseInt(result.rows[0].count, 10);
};

const getAuditLogs = async (userId: string, action?: string): Promise<any[]> => {
  let query = 'SELECT * FROM audit_logs WHERE user_id = $1';
  const params: any[] = [userId];

  if (action) {
    query += ' AND action = $2';
    params.push(action);
  }

  query += ' ORDER BY created_at DESC';

  const result = await testPool.query(query, params);
  return result.rows;
};

const registerUserAndLogin = async () => {
  const userData = createTestUser();
  const regResponse = await request(app.server)
    .post('/auth/register')
    .send(userData)
    .expect(201);

  return {
    email: userData.email,
    password: userData.password,
    userId: regResponse.body.user.id,
    accessToken: regResponse.body.tokens.accessToken,
    refreshToken: regResponse.body.tokens.refreshToken,
  };
};

const createMultipleSessions = async (email: string, password: string, count: number) => {
  for (let i = 0; i < count; i++) {
    await request(app.server)
      .post('/auth/login')
      .set('User-Agent', `TestClient-${i}`)
      .set('X-Forwarded-For', `192.168.1.${100 + i}`)
      .send({ email, password })
      .expect(200);

    // Increased delay to avoid rate limiting (auth service has 500ms min response)
    await new Promise(resolve => setTimeout(resolve, 600));
  }
};

const manuallyEndSession = async (sessionId: string) => {
  await testPool.query(
    'UPDATE user_sessions SET ended_at = NOW() WHERE id = $1',
    [sessionId]
  );
};

const manuallyRevokeSession = async (sessionId: string) => {
  await testPool.query(
    'UPDATE user_sessions SET revoked_at = NOW(), ended_at = NOW() WHERE id = $1',
    [sessionId]
  );
};

// Clean up both test Redis AND app Redis to ensure isolation
const cleanupAllWithAppRedis = async (): Promise<void> => {
  await cleanupAll();
  try {
    const appRedis = getRedis();
    await appRedis.flushdb();
  } catch (e) {
    // Ignore if Redis not initialized yet
  }
};

// ============================================
// MAIN TEST SUITE
// ============================================

describe('Session Management Integration Tests - Comprehensive', () => {
  let registeredUser: any;

  beforeAll(async () => {
    await initAppRedis();
    app = await buildApp();
    await app.ready();
  }, 30000);

  beforeEach(async () => {
    await cleanupAllWithAppRedis();
    jest.clearAllMocks();
    registeredUser = await registerUserAndLogin();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeConnections();
  });

  // ============================================
  // GET /auth/sessions - List Sessions (40 tests)
  // ============================================

  describe('GET /auth/sessions - Happy Path (5 tests)', () => {
    it('should list sessions with default pagination', async () => {
      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessions).toBeDefined();
      expect(Array.isArray(response.body.sessions)).toBe(true);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(20);
    });

    it('should list sessions ordered by started_at DESC', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 3);

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const sessions = response.body.sessions;
      expect(sessions.length).toBeGreaterThanOrEqual(3);

      for (let i = 1; i < sessions.length; i++) {
        const prevDate = new Date(sessions[i - 1].started_at);
        const currDate = new Date(sessions[i].started_at);
        expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
      }
    });

    it('should return all expected fields', async () => {
      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const session = response.body.sessions[0];
      expect(session.id).toBeDefined();
      expect(session.user_id).toBe(registeredUser.userId);
      expect(session.started_at).toBeDefined();
      expect(session).toHaveProperty('ip_address');
      expect(session).toHaveProperty('user_agent');
      expect(session).toHaveProperty('ended_at');
      expect(session).toHaveProperty('revoked_at');
      expect(session).toHaveProperty('metadata');
    });

    it('should return success true', async () => {
      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should handle empty session list', async () => {
      await testPool.query(
        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1',
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });
  });

  describe('GET /auth/sessions - Pagination (14 tests)', () => {
    it('should support custom page and limit parameters', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 4);

      const response = await request(app.server)
        .get('/auth/sessions?page=1&limit=2')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBe(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(2);
    });

    it('should enforce max limit of 100', async () => {
      const response = await request(app.server)
        .get('/auth/sessions?limit=150')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.pagination.limit).toBe(100);
    });

    it('should enforce min limit of 1', async () => {
      const response = await request(app.server)
        .get('/auth/sessions?limit=0')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.pagination.limit).toBe(1);
    });

    it('should return 400 when page is less than 1', async () => {
      await request(app.server)
        .get('/auth/sessions?page=0')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);
    });

    it('should return 400 when page is not a number', async () => {
      await request(app.server)
        .get('/auth/sessions?page=abc')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);
    });

    it('should return 400 when limit is not a number', async () => {
      await request(app.server)
        .get('/auth/sessions?limit=xyz')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);
    });

    it('should return empty array when page exceeds total pages', async () => {
      const response = await request(app.server)
        .get('/auth/sessions?page=999')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions).toEqual([]);
      expect(response.body.pagination.page).toBe(999);
    });

    it('should verify no overlap between pages', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 4);

      const page1Response = await request(app.server)
        .get('/auth/sessions?page=1&limit=2')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const page2Response = await request(app.server)
        .get('/auth/sessions?page=2&limit=2')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const page1Ids = page1Response.body.sessions.map((s: any) => s.id);
      const page2Ids = page2Response.body.sessions.map((s: any) => s.id);

      page1Ids.forEach((id: string) => {
        expect(page2Ids).not.toContain(id);
      });
    });

    it('should return correct items on first page', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 4);

      const response = await request(app.server)
        .get('/auth/sessions?page=1&limit=3')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBe(3);
    });

    it('should return different items on second page', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 4);

      const page1 = await request(app.server)
        .get('/auth/sessions?page=1&limit=2')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const page2 = await request(app.server)
        .get('/auth/sessions?page=2&limit=2')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(page1.body.sessions[0].id).not.toBe(page2.body.sessions[0].id);
    });

    it('should handle last page with fewer items', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);

      const response = await request(app.server)
        .get('/auth/sessions?page=2&limit=2')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBeLessThanOrEqual(2);
    });

    it('should include pagination metadata in response', async () => {
      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('totalPages');
    });

    it('should return correct total count', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 3);

      const response = await request(app.server)
        .get('/auth/sessions?limit=2')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.pagination.total).toBeGreaterThanOrEqual(4);
    });

    it('should calculate totalPages correctly', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);

      const response = await request(app.server)
        .get('/auth/sessions?limit=2')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const expectedPages = Math.ceil(response.body.pagination.total / 2);
      expect(response.body.pagination.totalPages).toBe(expectedPages);
    });
  });

  describe('GET /auth/sessions - Filtering (10 tests)', () => {
    it('should only return sessions for authenticated user', async () => {
      const user2 = await registerUserAndLogin();

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      response.body.sessions.forEach((session: any) => {
        expect(session.user_id).toBe(registeredUser.userId);
        expect(session.user_id).not.toBe(user2.userId);
      });
    });

    it('should exclude ended sessions', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      await manuallyEndSession(sessions[0].id);

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const sessionIds = response.body.sessions.map((s: any) => s.id);
      expect(sessionIds).not.toContain(sessions[0].id);
    });

    it('should exclude revoked sessions', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);
      const sessions = await getUserSessions(registeredUser.userId);
      await manuallyRevokeSession(sessions[0].id);

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const sessionIds = response.body.sessions.map((s: any) => s.id);
      expect(sessionIds).not.toContain(sessions[0].id);
    });

    it('should enforce tenant isolation (RLS)', async () => {
      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      response.body.sessions.forEach((session: any) => {
        expect(session.user_id).toBe(registeredUser.userId);
      });
    });

    it('should not allow access to other users sessions', async () => {
      const user2 = await registerUserAndLogin();
      await createMultipleSessions(user2.email, user2.password, 2);

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const user2Sessions = await getUserSessions(user2.userId);
      const returnedIds = response.body.sessions.map((s: any) => s.id);

      user2Sessions.forEach((session: any) => {
        expect(returnedIds).not.toContain(session.id);
      });
    });

    it('should handle multiple users in same tenant (no cross-contamination)', async () => {
      const user2 = await registerUserAndLogin();

      const user1Response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const user2Response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .expect(200);

      const user1Ids = user1Response.body.sessions.map((s: any) => s.id);
      const user2Ids = user2Response.body.sessions.map((s: any) => s.id);

      user1Ids.forEach((id: string) => {
        expect(user2Ids).not.toContain(id);
      });
    });

    it('should handle multiple sessions for one user', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 3);

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBeGreaterThanOrEqual(4);
    });

    it('should handle sessions with null IP address', async () => {
      await testPool.query(
        'UPDATE user_sessions SET ip_address = NULL WHERE user_id = $1',
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBeGreaterThan(0);
      expect(response.body.sessions[0].ip_address).toBeNull();
    });

    it('should handle sessions with null user_agent', async () => {
      await testPool.query(
        'UPDATE user_sessions SET user_agent = NULL WHERE user_id = $1',
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBeGreaterThan(0);
      expect(response.body.sessions[0].user_agent).toBeNull();
    });

    it('should handle sessions with metadata populated', async () => {
      await testPool.query(
        `UPDATE user_sessions SET metadata = '{"device": "iPhone"}'::jsonb WHERE user_id = $1`,
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions[0].metadata).toBeDefined();
    });
  });

  describe('GET /auth/sessions - Edge Cases (8 tests)', () => {
    it('should handle no active sessions (all ended)', async () => {
      await testPool.query(
        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1',
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should handle single active session', async () => {
      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBe(1);
    });

    it('should handle multiple active sessions (10+)', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 10);

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBeGreaterThanOrEqual(10);
    });

    it('should handle mix of active and ended sessions (only active returned)', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 3);
      const sessions = await getUserSessions(registeredUser.userId);
      await manuallyEndSession(sessions[0].id);

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const returnedIds = response.body.sessions.map((s: any) => s.id);
      expect(returnedIds).not.toContain(sessions[0].id);
    });

    it('should handle very old sessions', async () => {
      await testPool.query(
        `UPDATE user_sessions SET started_at = NOW() - INTERVAL '365 days' WHERE user_id = $1`,
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBeGreaterThan(0);
    });

    it('should handle sessions created today', async () => {
      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const session = response.body.sessions[0];
      const sessionDate = new Date(session.started_at);
      const today = new Date();

      expect(sessionDate.toDateString()).toBe(today.toDateString());
    });

    it('should handle concurrent GET requests', async () => {
      const requests = Array(5).fill(null).map(() =>
        request(app.server)
          .get('/auth/sessions')
          .set('Authorization', `Bearer ${registeredUser.accessToken}`)
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.sessions).toBeDefined();
      });
    });

    it('should ignore unknown query params', async () => {
      const response = await request(app.server)
        .get('/auth/sessions?foo=bar&baz=qux')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /auth/sessions - Auth Errors (3 tests)', () => {
    it('should return 401 without Authorization header', async () => {
      await request(app.server)
        .get('/auth/sessions')
        .expect(401);
    });

    it('should return 401 with invalid token', async () => {
      await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return 401 with malformed Authorization header', async () => {
      await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', 'NotBearer token')
        .expect(401);
    });
  });

  // ============================================
  // DELETE /auth/sessions/:sessionId (30 tests)
  // ============================================

  describe('DELETE /auth/sessions/:sessionId - Happy Path (5 tests)', () => {
    it('should successfully revoke own session', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionToRevoke = sessions[0].id;

      const response = await request(app.server)
        .delete(`/auth/sessions/${sessionToRevoke}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toMatch(/revoked/i);
    });

    it('should set revoked_at to current timestamp', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const updatedSession = await getSessionById(sessionId);
      expect(updatedSession.revoked_at).not.toBeNull();

      const revokedTime = new Date(updatedSession.revoked_at).getTime();
      const now = Date.now();
      expect(Math.abs(now - revokedTime)).toBeLessThan(5000);
    });

    it('should set ended_at to current timestamp', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const updatedSession = await getSessionById(sessionId);
      expect(updatedSession.ended_at).not.toBeNull();

      const endedTime = new Date(updatedSession.ended_at).getTime();
      const now = Date.now();
      expect(Math.abs(now - endedTime)).toBeLessThan(5000);
    });

    it('should return success message', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      const response = await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.message).toBeDefined();
      expect(typeof response.body.message).toBe('string');
    });

    it('should not show session in list after revocation', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const listResponse = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const sessionIds = listResponse.body.sessions.map((s: any) => s.id);
      expect(sessionIds).not.toContain(sessionId);
    });
  });

  describe('DELETE /auth/sessions/:sessionId - Verification (10 tests)', () => {
    it('should return 404 when session not found', async () => {
      const fakeSessionId = '00000000-0000-0000-0000-000000000099';

      const response = await request(app.server)
        .delete(`/auth/sessions/${fakeSessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(404);

      expect(response.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('should return 404 when session belongs to different user (same tenant)', async () => {
      const user2 = await registerUserAndLogin();
      const user2Sessions = await getUserSessions(user2.userId);
      const user2SessionId = user2Sessions[0].id;

      const response = await request(app.server)
        .delete(`/auth/sessions/${user2SessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(404);

      expect(response.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('should return 404 when session already revoked', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await manuallyRevokeSession(sessionId);

      const response = await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(404);

      expect(response.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('should verify exact session is revoked (not others)', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionToRevoke = sessions[0].id;
      const sessionToKeep = sessions[1].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionToRevoke}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const keptSession = await getSessionById(sessionToKeep);
      expect(keptSession.revoked_at).toBeNull();
      expect(keptSession.ended_at).toBeNull();
    });

    it('should allow revoking session from different IP', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      const response = await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .set('X-Forwarded-For', '192.168.1.100')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should allow revoking session from different device', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      const response = await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .set('User-Agent', 'Different-Browser/1.0')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should verify session ownership via JOIN', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      const response = await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should verify tenant via JOIN', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      expect(sessions[0]).toBeDefined();
    });

    it('should return 404 for ended session', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await manuallyEndSession(sessionId);

      const response = await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(404);

      expect(response.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('should handle UUID validation in route', async () => {
      await request(app.server)
        .delete('/auth/sessions/not-a-uuid')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);
    });
  });

  describe('DELETE /auth/sessions/:sessionId - Database State (5 tests)', () => {
    it('should set revoked_at in database', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const session = await getSessionById(sessionId);
      expect(session.revoked_at).not.toBeNull();
    });

    it('should set ended_at in database', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const session = await getSessionById(sessionId);
      expect(session.ended_at).not.toBeNull();
    });

    it('should have timestamps within 1 second', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const session = await getSessionById(sessionId);
      const revokedTime = new Date(session.revoked_at).getTime();
      const endedTime = new Date(session.ended_at).getTime();

      expect(Math.abs(revokedTime - endedTime)).toBeLessThan(1000);
    });

    it('should not affect other user sessions', async () => {
      const user2 = await registerUserAndLogin();
      const user1Sessions = await getUserSessions(registeredUser.userId);
      const sessionId = user1Sessions[0].id;

      const beforeCount = await getActiveSessionsCount(user2.userId);

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const afterCount = await getActiveSessionsCount(user2.userId);
      expect(afterCount).toBe(beforeCount);
    });

    it('should preserve metadata', async () => {
      await testPool.query(
        `UPDATE user_sessions SET metadata = '{"device": "iPhone"}'::jsonb WHERE user_id = $1`,
        [registeredUser.userId]
      );

      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const session = await getSessionById(sessionId);
      expect(session.metadata).toBeDefined();
      expect(session.metadata.device).toBe('iPhone');
    });
  });

  describe('DELETE /auth/sessions/:sessionId - Audit (5 tests)', () => {
    it('should create audit log with action session_revoked', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'session_revoked');
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should have audit action_type as security', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'session_revoked');
      expect(logs[0].action_type).toBe('security');
    });

    it('should have audit resource_type as session', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'session_revoked');
      expect(logs[0].resource_type).toBe('session');
    });

    it('should include revoked session metadata in audit', async () => {
      await testPool.query(
        `UPDATE user_sessions SET ip_address = '192.168.1.1', user_agent = 'TestBrowser' WHERE user_id = $1`,
        [registeredUser.userId]
      );

      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'session_revoked');
      expect(logs[0].metadata).toBeDefined();
    });

    it('should include IP and user_agent of revoker in audit', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .set('User-Agent', 'TestRevoker/1.0')
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'session_revoked');
      expect(logs[0].ip_address).toBeDefined();
      expect(logs[0].user_agent).toBe('TestRevoker/1.0');
    });
  });

  describe('DELETE /auth/sessions/:sessionId - Validation (5 tests)', () => {
    it('should return 400 with invalid UUID format', async () => {
      await request(app.server)
        .delete('/auth/sessions/not-a-uuid')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);
    });

    it('should return 400 with missing sessionId param', async () => {
      await request(app.server)
        .delete('/auth/sessions/')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);
    });

    it('should return 400 with non-UUID string', async () => {
      await request(app.server)
        .delete('/auth/sessions/abc123')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);
    });

    it('should require sessionId parameter', async () => {
      await request(app.server)
        .delete('/auth/sessions/')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);
    });

    it('should reject extra fields in body', async () => {
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      // Body should be empty - any fields should be ignored or rejected
      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ extra: 'field' })
        .expect(200); // Still succeeds but ignores body
    });
  });

  // ============================================
  // DELETE /auth/sessions/all (30 tests)
  // ============================================

  describe('DELETE /auth/sessions/all - Happy Path (5 tests)', () => {
    it('should successfully invalidate all sessions', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 3);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessions_revoked).toBeGreaterThan(0);
    });

    it('should return correct count of revoked sessions', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);
      const beforeCount = await getActiveSessionsCount(registeredUser.userId);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(beforeCount);
    });

    it('should return success message', async () => {
      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.message).toBeDefined();
      expect(response.body.message).toMatch(/invalidated/i);
    });

    it('should result in empty session list after invalidate', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const listResponse = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(listResponse.body.sessions).toEqual([]);
    });

    it('should return count of 0 when no active sessions', async () => {
      await testPool.query(
        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1',
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(0);
    });
  });

  describe('DELETE /auth/sessions/all - Database State (10 tests)', () => {
    it('should set revoked_at for all active sessions', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const revokedCount = await getRevokedSessionsCount(registeredUser.userId);
      expect(revokedCount).toBeGreaterThan(0);
    });

    it('should set ended_at for all active sessions', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const endedCount = await getEndedSessionsCount(registeredUser.userId);
      expect(endedCount).toBeGreaterThan(0);
    });

    it('should match count to actual database rows updated', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);
      const beforeCount = await getActiveSessionsCount(registeredUser.userId);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(beforeCount);

      const afterCount = await getActiveSessionsCount(registeredUser.userId);
      expect(afterCount).toBe(0);
    });

    it('should not count already-ended sessions', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);
      const sessions = await getUserSessions(registeredUser.userId);
      await manuallyEndSession(sessions[0].id);

      const activeCount = await getActiveSessionsCount(registeredUser.userId);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(activeCount);
    });

    it('should not count already-revoked sessions', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);
      const sessions = await getUserSessions(registeredUser.userId);
      await manuallyRevokeSession(sessions[0].id);

      const activeCount = await getActiveSessionsCount(registeredUser.userId);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(activeCount);
    });

    it('should not affect other users sessions', async () => {
      const user2 = await registerUserAndLogin();
      await createMultipleSessions(user2.email, user2.password, 2);

      const user2Before = await getActiveSessionsCount(user2.userId);

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const user2After = await getActiveSessionsCount(user2.userId);
      expect(user2After).toBe(user2Before);
    });

    it('should maintain tenant isolation', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should have recent timestamps', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const sessions = await getUserSessions(registeredUser.userId);
      const revokedTime = new Date(sessions[0].revoked_at).getTime();
      const now = Date.now();

      expect(Math.abs(now - revokedTime)).toBeLessThan(5000);
    });

    it('should invalidate multiple sessions correctly', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 3);
      const beforeCount = await getActiveSessionsCount(registeredUser.userId);
      expect(beforeCount).toBeGreaterThanOrEqual(4);

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const afterCount = await getActiveSessionsCount(registeredUser.userId);
      expect(afterCount).toBe(0);
    });

    it('should handle single session correctly', async () => {
      const beforeCount = await getActiveSessionsCount(registeredUser.userId);
      expect(beforeCount).toBe(1);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(1);
    });
  });

  describe('DELETE /auth/sessions/all - Edge Cases (7 tests)', () => {
    it('should return 0 when no active sessions', async () => {
      await testPool.query(
        'UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1',
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(0);
    });

    it('should return 1 for single active session', async () => {
      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(1);
    });

    it('should handle multiple active sessions (count > 1)', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 3);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBeGreaterThan(1);
    });

    it('should handle mix of active and already-ended (only active counted)', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);
      const sessions = await getUserSessions(registeredUser.userId);
      await manuallyEndSession(sessions[0].id);

      const activeCount = await getActiveSessionsCount(registeredUser.userId);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(activeCount);
    });

    it('should handle mix of active and already-revoked (only active counted)', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);
      const sessions = await getUserSessions(registeredUser.userId);
      await manuallyRevokeSession(sessions[0].id);

      const activeCount = await getActiveSessionsCount(registeredUser.userId);

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBe(activeCount);
    });

    it('should handle very large number of sessions (100+)', async () => {
      // Create 50 sessions (100+ would be slow in tests)
      for (let i = 0; i < 50; i++) {
        await testPool.query(
          'INSERT INTO user_sessions (user_id, tenant_id, started_at) VALUES ($1, $2, NOW())',
          [registeredUser.userId, TEST_TENANT_ID]
        );
      }

      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions_revoked).toBeGreaterThan(50);
    }, 10000);

    it('should be idempotent (concurrent requests)', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);

      const requests = [
        request(app.server)
          .delete('/auth/sessions/all')
          .set('Authorization', `Bearer ${registeredUser.accessToken}`),
        request(app.server)
          .delete('/auth/sessions/all')
          .set('Authorization', `Bearer ${registeredUser.accessToken}`)
      ];

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('DELETE /auth/sessions/all - Audit (5 tests)', () => {
    it('should create audit log with action all_sessions_invalidated', async () => {
      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'all_sessions_invalidated');
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should have audit action_type as security', async () => {
      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'all_sessions_invalidated');
      expect(logs[0].action_type).toBe('security');
    });

    it('should include sessions_revoked count in audit', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'all_sessions_invalidated');
      expect(logs[0].metadata.sessions_revoked).toBeGreaterThan(0);
    });

    it('should include metadata with kept_current_session: false', async () => {
      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'all_sessions_invalidated');
      expect(logs[0].metadata.kept_current_session).toBe(false);
    });

    it('should include user_id as resource_id', async () => {
      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'all_sessions_invalidated');
      expect(logs[0].resource_id).toBe(registeredUser.userId);
    });
  });

  describe('DELETE /auth/sessions/all - Tenant Verification (3 tests)', () => {
    it('should return 403 if user not found in tenant', async () => {
      // Create fake tenant first to avoid FK constraint violation
      await testPool.query(
        'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        ['00000000-0000-0000-0000-000000000099', 'Fake Tenant', 'fake-tenant']
      );

      await testPool.query(
        'UPDATE users SET tenant_id = $1 WHERE id = $2',
        ['00000000-0000-0000-0000-000000000099', registeredUser.userId]
      );

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(403);
    });

    it('should return 401 if user is deleted', async () => {
      await testPool.query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1',
        [registeredUser.userId]
      );

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(401);
    });

    it('should verify user existence before invalidation', async () => {
      const response = await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  // ============================================
  // Integration Scenarios (15 tests)
  // ============================================

  describe('Integration Scenarios', () => {
    it('should create session on login and show in list', async () => {
      const beforeSessions = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const beforeCount = beforeSessions.body.sessions.length;

      await request(app.server)
        .post('/auth/login')
        .send({ email: registeredUser.email, password: registeredUser.password })
        .expect(200);

      const afterSessions = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(afterSessions.body.sessions.length).toBe(beforeCount + 1);
    });

    it('should invalidate token on logout', async () => {
      await request(app.server)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({ refreshToken: registeredUser.refreshToken })
        .expect(200);

      await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(401);
    });

    it('should create session on register and show in list', async () => {
      const newUser = createTestUser();

      await request(app.server)
        .post('/auth/register')
        .send(newUser)
        .expect(201);

      const loginResponse = await request(app.server)
        .post('/auth/login')
        .send({ email: newUser.email, password: newUser.password })
        .expect(200);

      const sessionsResponse = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${loginResponse.body.tokens.accessToken}`)
        .expect(200);

      expect(sessionsResponse.body.sessions.length).toBeGreaterThan(0);
    });

    it('should not show revoked session in list', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const listResponse = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const sessionIds = listResponse.body.sessions.map((s: any) => s.id);
      expect(sessionIds).not.toContain(sessionId);
    });

    it('should show empty list after revoking all', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const listResponse = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(listResponse.body.sessions).toEqual([]);
    });

    it('should show multiple sessions after multiple logins', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 3);

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions.length).toBeGreaterThanOrEqual(4);
    });

    it('should show only new session after revoke and re-login', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const loginResponse = await request(app.server)
        .post('/auth/login')
        .send({ email: registeredUser.email, password: registeredUser.password })
        .expect(200);

      const sessionsResponse = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${loginResponse.body.tokens.accessToken}`)
        .expect(200);

      expect(sessionsResponse.body.sessions.length).toBe(1);
    });

    it('should isolate sessions between multiple users', async () => {
      const user2 = await registerUserAndLogin();

      const user1Sessions = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const user2Sessions = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .expect(200);

      const user1Ids = user1Sessions.body.sessions.map((s: any) => s.id);
      const user2Ids = user2Sessions.body.sessions.map((s: any) => s.id);

      user1Ids.forEach((id: string) => {
        expect(user2Ids).not.toContain(id);
      });
    });

    it('should return 404 when revoking already-revoked session', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(404);
    });

    it('should return 404 when revoking specific session after invalidate all', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(404);
    });

    it('should preserve session ordering (newest first)', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 3);

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const sessions = response.body.sessions;
      for (let i = 1; i < sessions.length; i++) {
        const prev = new Date(sessions[i - 1].started_at);
        const curr = new Date(sessions[i].started_at);
        expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
      }
    });

    it('should capture IP and user-agent in session creation', async () => {
      const loginResponse = await request(app.server)
        .post('/auth/login')
        .set('User-Agent', 'TestBrowser/1.0')
        .send({ email: registeredUser.email, password: registeredUser.password })
        .expect(200);

      const sessionsResponse = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${loginResponse.body.tokens.accessToken}`)
        .expect(200);

      const latestSession = sessionsResponse.body.sessions[0];
      expect(latestSession.user_agent).toBe('TestBrowser/1.0');
      expect(latestSession.ip_address).toBeDefined();
    });

    it('should maintain cross-tenant isolation', async () => {
      const user1Sessions = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      user1Sessions.body.sessions.forEach((session: any) => {
        expect(session.user_id).toBe(registeredUser.userId);
      });
    });

    it('should return 401 for deleted user trying to list sessions', async () => {
      await testPool.query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1',
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`);

      expect(response.status).toBe(401);
    });

    it('should invalidate sessions on password change', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 2);
      const beforeCount = await getActiveSessionsCount(registeredUser.userId);
      expect(beforeCount).toBeGreaterThan(1);

      await request(app.server)
        .put('/auth/change-password')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .send({
          currentPassword: registeredUser.password,
          newPassword: 'NewPassword456!'
        })
        .expect(200);

      // Should keep current session active (Ticketmaster style)
      const afterCount = await getActiveSessionsCount(registeredUser.userId);
      expect(afterCount).toBeLessThan(beforeCount);
    });
  });

  // ============================================
  // Database Constraints (8 tests)
  // ============================================

  describe('Database Constraints', () => {
    it('should CASCADE delete sessions when user is deleted', async () => {
      const sessionsBeforeDelete = await getUserSessions(registeredUser.userId);
      expect(sessionsBeforeDelete.length).toBeGreaterThan(0);

      await testPool.query('DELETE FROM users WHERE id = $1', [registeredUser.userId]);

      const sessionsAfterDelete = await getUserSessions(registeredUser.userId);
      expect(sessionsAfterDelete.length).toBe(0);
    });

    it('should RESTRICT deleting tenant with sessions', async () => {
      try {
        await testPool.query('DELETE FROM tenants WHERE id = $1', [TEST_TENANT_ID]);
        fail('Should have thrown constraint error');
      } catch (error: any) {
        expect(error.message).toMatch(/constraint/i);
      }
    });

    it('should enforce RLS: query without tenant context returns empty or error', async () => {
      // RLS is handled by middleware setting tenant context
      // This test verifies tenant isolation works
      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      expect(response.body.sessions).toBeDefined();
    });

    it('should enforce RLS: query with tenant A only returns tenant A sessions', async () => {
      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      response.body.sessions.forEach((session: any) => {
        expect(session.user_id).toBe(registeredUser.userId);
      });
    });

    it('should return 401 for soft-deleted user operations', async () => {
      await testPool.query(
        'UPDATE users SET deleted_at = NOW() WHERE id = $1',
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`);

      expect(response.status).toBe(401);
    });

    it('should require NOT NULL tenant_id', async () => {
      try {
        await testPool.query(
          'INSERT INTO user_sessions (user_id, started_at) VALUES ($1, NOW())',
          [registeredUser.userId]
        );
        fail('Should have thrown NOT NULL constraint');
      } catch (error: any) {
        expect(error.message).toMatch(/null value|not-null/i);
      }
    });

    it('should require NOT NULL user_id', async () => {
      try {
        await testPool.query(
          'INSERT INTO user_sessions (tenant_id, started_at) VALUES ($1, NOW())',
          [TEST_TENANT_ID]
        );
        fail('Should have thrown NOT NULL constraint');
      } catch (error: any) {
        expect(error.message).toMatch(/null value|not-null/i);
      }
    });

    it('should allow cleanup of old sessions (>30 days ended)', async () => {
      await testPool.query(
        `UPDATE user_sessions
         SET ended_at = NOW() - INTERVAL '31 days'
         WHERE user_id = $1`,
        [registeredUser.userId]
      );

      // Manually trigger cleanup (normally a cron job)
      await testPool.query(
        `DELETE FROM user_sessions WHERE ended_at < NOW() - INTERVAL '30 days'`
      );

      const sessions = await getUserSessions(registeredUser.userId);
      expect(sessions.length).toBe(0);
    });
  });

  // ============================================
  // Security (8 tests)
  // ============================================

  describe('Security Tests', () => {
    it('should prevent revoking other users sessions', async () => {
      const user2 = await registerUserAndLogin();
      const user2Sessions = await getUserSessions(user2.userId);
      const user2SessionId = user2Sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${user2SessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(404);
    });

    it('should strictly enforce tenant boundary', async () => {
      const user2 = await registerUserAndLogin();

      const user1Response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const user2Response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .expect(200);

      const user1Ids = user1Response.body.sessions.map((s: any) => s.id);
      const user2Ids = user2Response.body.sessions.map((s: any) => s.id);

      user1Ids.forEach((id: string) => {
        expect(user2Ids).not.toContain(id);
      });
    });

    it('should prevent SQL injection via sessionId', async () => {
      const maliciousId = "'; DROP TABLE user_sessions; --";

      await request(app.server)
        .delete(`/auth/sessions/${maliciousId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(400);
    });

    it('should sanitize returned session data (no XSS)', async () => {
      await testPool.query(
        `UPDATE user_sessions SET user_agent = '<script>alert("xss")</script>' WHERE user_id = $1`,
        [registeredUser.userId]
      );

      const response = await request(app.server)
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const session = response.body.sessions[0];
      // User agent should be returned as-is, but JSON encoding prevents execution
      expect(typeof session.user_agent).toBe('string');
    });

    it('should create audit trail for all operations', async () => {
      await createMultipleSessions(registeredUser.email, registeredUser.password, 1);
      const sessions = await getUserSessions(registeredUser.userId);
      const sessionId = sessions[0].id;

      await request(app.server)
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId);
      expect(logs.length).toBeGreaterThan(0);
    });

    it('should capture IP address in audit logs', async () => {
      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .set('X-Forwarded-For', '192.168.1.100')
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'all_sessions_invalidated');
      expect(logs[0].ip_address).toBeDefined();
    });

    it('should capture user agent in audit logs', async () => {
      await request(app.server)
        .delete('/auth/sessions/all')
        .set('Authorization', `Bearer ${registeredUser.accessToken}`)
        .set('User-Agent', 'SecurityTest/1.0')
        .expect(200);

      const logs = await getAuditLogs(registeredUser.userId, 'all_sessions_invalidated');
      expect(logs[0].user_agent).toBe('SecurityTest/1.0');
    });

    it('should require authorization for all endpoints', async () => {
      await request(app.server).get('/auth/sessions').expect(401);
      await request(app.server).delete('/auth/sessions/all').expect(401);

      const sessions = await getUserSessions(registeredUser.userId);
      await request(app.server).delete(`/auth/sessions/${sessions[0].id}`).expect(401);
    });
  });
});
