import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { SessionController } from '../../src/controllers/session.controller';
import bcrypt from 'bcrypt';

// Override the database import to use test instance
jest.mock('../../src/config/database', () => ({
  pool: require('./setup').testPool,
}));

describe('SessionController Integration Tests', () => {
  let sessionController: SessionController;

  beforeAll(async () => {
    sessionController = new SessionController();
  });

  beforeEach(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

  // Helper to create a user in the database
  async function createDbUser(overrides: Partial<any> = {}) {
    const userData = createTestUser(overrides);
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const result = await testPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true)
       RETURNING id, email, tenant_id`,
      [
        userData.email,
        hashedPassword,
        userData.firstName,
        userData.lastName,
        userData.tenant_id,
      ]
    );
    return { ...result.rows[0], password: userData.password };
  }

  // Helper to create a session
  async function createSession(userId: string, overrides: Partial<any> = {}) {
    const tenantId = overrides.tenant_id || TEST_TENANT_ID;
    const result = await testPool.query(
      `INSERT INTO user_sessions (tenant_id, user_id, ip_address, user_agent, started_at, metadata)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       RETURNING *`,
      [
        tenantId,
        userId,
        overrides.ip_address || '192.168.1.1',
        overrides.user_agent || 'Test Browser',
        JSON.stringify(overrides.metadata || {}),
      ]
    );
    return result.rows[0];
  }

  // Helper to create mock request
  function createMockRequest(user: any, overrides: Partial<any> = {}) {
    return {
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        ...overrides.user,
      },
      params: overrides.params || {},
      ip: overrides.ip || '10.0.0.1',
      headers: {
        'user-agent': 'Jest Test Agent',
        ...overrides.headers,
      },
      ...overrides,
    };
  }

  // Helper to create mock reply
  function createMockReply() {
    const reply: any = {
      statusCode: 200,
      body: null,
      status: jest.fn().mockImplementation((code) => {
        reply.statusCode = code;
        return reply;
      }),
      send: jest.fn().mockImplementation((body) => {
        reply.body = body;
        return reply;
      }),
    };
    return reply;
  }

  describe('listSessions', () => {
    it('should return active sessions for user', async () => {
      const user = await createDbUser();
      await createSession(user.id, { ip_address: '192.168.1.1', user_agent: 'Chrome' });
      await createSession(user.id, { ip_address: '192.168.1.2', user_agent: 'Firefox' });

      const request = createMockRequest(user);
      const reply = createMockReply();

      await sessionController.listSessions(request as any, reply as any);

      expect(reply.body.success).toBe(true);
      expect(reply.body.sessions.length).toBe(2);
    });

    it('should not return ended sessions', async () => {
      const user = await createDbUser();
      await createSession(user.id);

      // Create an ended session
      await testPool.query(
        `INSERT INTO user_sessions (tenant_id, user_id, ip_address, user_agent, started_at, ended_at)
         VALUES ($1, $2, '192.168.1.99', 'Old Browser', NOW() - INTERVAL '1 day', NOW())`,
        [TEST_TENANT_ID, user.id]
      );

      const request = createMockRequest(user);
      const reply = createMockReply();

      await sessionController.listSessions(request as any, reply as any);

      expect(reply.body.sessions.length).toBe(1);
    });

    it('should not return sessions from other users', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();

      await createSession(user1.id);
      await createSession(user2.id);

      const request = createMockRequest(user1);
      const reply = createMockReply();

      await sessionController.listSessions(request as any, reply as any);

      expect(reply.body.sessions.length).toBe(1);
      expect(reply.body.sessions[0].user_id).toBe(user1.id);
    });

    it('should filter by tenant', async () => {
      const user = await createDbUser();
      await createSession(user.id);

      // Request with different tenant
      const request = createMockRequest(user, {
        user: { tenant_id: '00000000-0000-0000-0000-000000000099' },
      });
      const reply = createMockReply();

      await sessionController.listSessions(request as any, reply as any);

      expect(reply.body.sessions.length).toBe(0);
    });

    it('should return sessions ordered by started_at DESC', async () => {
      const user = await createDbUser();

      // Create sessions with different start times
      await testPool.query(
        `INSERT INTO user_sessions (tenant_id, user_id, ip_address, user_agent, started_at)
         VALUES ($1, $2, '192.168.1.1', 'Old', NOW() - INTERVAL '2 hours')`,
        [TEST_TENANT_ID, user.id]
      );
      await testPool.query(
        `INSERT INTO user_sessions (tenant_id, user_id, ip_address, user_agent, started_at)
         VALUES ($1, $2, '192.168.1.2', 'New', NOW())`,
        [TEST_TENANT_ID, user.id]
      );

      const request = createMockRequest(user);
      const reply = createMockReply();

      await sessionController.listSessions(request as any, reply as any);

      expect(reply.body.sessions[0].user_agent).toBe('New');
      expect(reply.body.sessions[1].user_agent).toBe('Old');
    });
  });

  describe('revokeSession', () => {
    it('should revoke an active session', async () => {
      const user = await createDbUser();
      const session = await createSession(user.id);

      const request = createMockRequest(user, {
        params: { sessionId: session.id },
      });
      const reply = createMockReply();

      await sessionController.revokeSession(request as any, reply as any);

      expect(reply.body.success).toBe(true);
      expect(reply.body.message).toBe('Session revoked successfully');

      // Verify session was revoked
      const result = await testPool.query(
        'SELECT revoked_at, ended_at FROM user_sessions WHERE id = $1',
        [session.id]
      );
      expect(result.rows[0].revoked_at).not.toBeNull();
      expect(result.rows[0].ended_at).not.toBeNull();
    });

    it('should return 404 for non-existent session', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        params: { sessionId: '00000000-0000-0000-0000-000000000099' },
      });
      const reply = createMockReply();

      await sessionController.revokeSession(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
      expect(reply.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('should not allow revoking another user session', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();
      const session = await createSession(user2.id);

      const request = createMockRequest(user1, {
        params: { sessionId: session.id },
      });
      const reply = createMockReply();

      await sessionController.revokeSession(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
      expect(reply.body.code).toBe('SESSION_NOT_FOUND');
    });

    it('should not allow revoking session from different tenant', async () => {
      const user = await createDbUser();
      const session = await createSession(user.id);

      const request = createMockRequest(user, {
        params: { sessionId: session.id },
        user: { tenant_id: '00000000-0000-0000-0000-000000000099' },
      });
      const reply = createMockReply();

      await sessionController.revokeSession(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
    });

    it('should not revoke already revoked session', async () => {
      const user = await createDbUser();
      const session = await createSession(user.id);

      // Revoke the session first
      await testPool.query(
        'UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1',
        [session.id]
      );

      const request = createMockRequest(user, {
        params: { sessionId: session.id },
      });
      const reply = createMockReply();

      await sessionController.revokeSession(request as any, reply as any);

      expect(reply.statusCode).toBe(404);
    });

    it('should create audit log on revoke', async () => {
      const user = await createDbUser();
      const session = await createSession(user.id);

      const request = createMockRequest(user, {
        params: { sessionId: session.id },
      });
      const reply = createMockReply();

      await sessionController.revokeSession(request as any, reply as any);

      const auditResult = await testPool.query(
        `SELECT * FROM audit_logs WHERE user_id = $1 AND action = 'session_revoked'`,
        [user.id]
      );

      expect(auditResult.rows.length).toBe(1);
      expect(auditResult.rows[0].resource_id).toBe(session.id);
    });
  });

  describe('invalidateAllSessions', () => {
    it('should invalidate all user sessions', async () => {
      const user = await createDbUser();
      await createSession(user.id);
      await createSession(user.id);
      await createSession(user.id);

      const request = createMockRequest(user);
      const reply = createMockReply();

      await sessionController.invalidateAllSessions(request as any, reply as any);

      expect(reply.body.success).toBe(true);
      expect(reply.body.sessions_revoked).toBe(3);

      // Verify all sessions are ended
      const result = await testPool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [user.id]
      );
      expect(result.rows.length).toBe(0);
    });

    it('should return 403 if user not in tenant', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user, {
        user: { tenant_id: '00000000-0000-0000-0000-000000000099' },
      });
      const reply = createMockReply();

      await sessionController.invalidateAllSessions(request as any, reply as any);

      expect(reply.statusCode).toBe(403);
      expect(reply.body.code).toBe('FORBIDDEN');
    });

    it('should not invalidate other user sessions', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();
      await createSession(user1.id);
      await createSession(user2.id);

      const request = createMockRequest(user1);
      const reply = createMockReply();

      await sessionController.invalidateAllSessions(request as any, reply as any);

      // User2's session should still be active
      const result = await testPool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [user2.id]
      );
      expect(result.rows.length).toBe(1);
    });

    it('should create audit log', async () => {
      const user = await createDbUser();
      await createSession(user.id);

      const request = createMockRequest(user);
      const reply = createMockReply();

      await sessionController.invalidateAllSessions(request as any, reply as any);

      const auditResult = await testPool.query(
        `SELECT * FROM audit_logs WHERE user_id = $1 AND action = 'all_sessions_invalidated'`,
        [user.id]
      );

      expect(auditResult.rows.length).toBe(1);
    });

    it('should handle no active sessions', async () => {
      const user = await createDbUser();

      const request = createMockRequest(user);
      const reply = createMockReply();

      await sessionController.invalidateAllSessions(request as any, reply as any);

      expect(reply.body.success).toBe(true);
      expect(reply.body.sessions_revoked).toBe(0);
    });
  });
});
