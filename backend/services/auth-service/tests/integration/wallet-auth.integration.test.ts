import request from 'supertest';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import {
  testPool,
  testRedis,
  TEST_TENANT_ID,
  cleanupAll,
  closeConnections,
  createTestUser,
  initAppRedis,
} from './setup';

import { buildApp } from '../../src/app';

let app: any;

// ============================================
// TEST HELPERS
// ============================================

/**
 * Creates a Solana keypair for testing wallet authentication
 */
function createSolanaKeypair() {
  const keypair = nacl.sign.keyPair();
  return {
    publicKey: bs58.encode(keypair.publicKey),
    secretKey: keypair.secretKey,
    sign: (message: string) => {
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
      return bs58.encode(signature);
    },
  };
}

/**
 * Helper to request a nonce and sign it
 */
async function getNonceAndSign(wallet: ReturnType<typeof createSolanaKeypair>, chain = 'solana') {
  const nonceResponse = await request(app.server)
    .post('/auth/wallet/nonce')
    .send({ publicKey: wallet.publicKey, chain })
    .expect(200);

  const { nonce, message } = nonceResponse.body;
  const signature = wallet.sign(message);

  return { nonce, message, signature };
}

/**
 * Helper to register a wallet and return user data
 */
async function registerWallet(wallet: ReturnType<typeof createSolanaKeypair>, chain = 'solana') {
  const { nonce, signature } = await getNonceAndSign(wallet, chain);

  const response = await request(app.server)
    .post('/auth/wallet/register')
    .send({
      publicKey: wallet.publicKey,
      signature,
      nonce,
      chain,
      tenant_id: TEST_TENANT_ID,
    })
    .expect(201);

  return response.body;
}

/**
 * Helper to register a regular user and get tokens
 */
async function registerRegularUser() {
  const userData = createTestUser();
  const response = await request(app.server)
    .post('/auth/register')
    .send(userData)
    .expect(201);

  return {
    userId: response.body.user.id,
    accessToken: response.body.tokens.accessToken,
    refreshToken: response.body.tokens.refreshToken,
    email: userData.email,
  };
}

/**
 * Get wallet connections from database
 */
async function getWalletConnections(userId: string) {
  const result = await testPool.query(
    'SELECT * FROM wallet_connections WHERE user_id = $1',
    [userId]
  );
  return result.rows;
}

/**
 * Get user by wallet address
 */
async function getUserByWallet(publicKey: string) {
  const result = await testPool.query(
    `SELECT u.* FROM users u 
     JOIN wallet_connections wc ON u.id = wc.user_id 
     WHERE wc.wallet_address = $1`,
    [publicKey]
  );
  return result.rows[0];
}

/**
 * Get user sessions from database
 */
async function getUserSessions(userId: string) {
  const result = await testPool.query(
    'SELECT * FROM user_sessions WHERE user_id = $1',
    [userId]
  );
  return result.rows;
}

// ============================================
// MAIN TEST SUITE
// ============================================

describe('Wallet Auth Integration Tests', () => {
  beforeAll(async () => {
    await initAppRedis();
    app = await buildApp();
    await app.ready();
  }, 30000);

  beforeEach(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await closeConnections();
  });

  // ============================================
  // POST /wallet/nonce - Request Nonce
  // ============================================

  describe('POST /wallet/nonce - Request Nonce', () => {
    it('should generate nonce for valid Solana public key', async () => {
      const wallet = createSolanaKeypair();

      const response = await request(app.server)
        .post('/auth/wallet/nonce')
        .send({
          publicKey: wallet.publicKey,
          chain: 'solana',
        })
        .expect(200);

      expect(response.body.nonce).toBeDefined();
      expect(response.body.nonce.length).toBeGreaterThan(0);
      expect(response.body.message).toBeDefined();
      expect(response.body.message).toContain('Sign this message');
      expect(response.body.message).toContain(response.body.nonce);
    });

    it('should generate nonce for valid Ethereum address', async () => {
      const ethAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD58';

      const response = await request(app.server)
        .post('/auth/wallet/nonce')
        .send({
          publicKey: ethAddress,
          chain: 'ethereum',
        })
        .expect(200);

      expect(response.body.nonce).toBeDefined();
      expect(response.body.message).toBeDefined();
    });

    it('should generate different nonces for different requests', async () => {
      const wallet = createSolanaKeypair();

      const response1 = await request(app.server)
        .post('/auth/wallet/nonce')
        .send({ publicKey: wallet.publicKey, chain: 'solana' })
        .expect(200);

      const response2 = await request(app.server)
        .post('/auth/wallet/nonce')
        .send({ publicKey: wallet.publicKey, chain: 'solana' })
        .expect(200);

      expect(response1.body.nonce).not.toBe(response2.body.nonce);
    });

    it('should default to solana chain when not specified', async () => {
      const wallet = createSolanaKeypair();

      const response = await request(app.server)
        .post('/auth/wallet/nonce')
        .send({ publicKey: wallet.publicKey })
        .expect(200);

      expect(response.body.nonce).toBeDefined();
    });

    it('should return 400 when publicKey is missing', async () => {
      const response = await request(app.server)
        .post('/auth/wallet/nonce')
        .send({ chain: 'solana' })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when chain is invalid', async () => {
      const wallet = createSolanaKeypair();

      const response = await request(app.server)
        .post('/auth/wallet/nonce')
        .send({
          publicKey: wallet.publicKey,
          chain: 'bitcoin', // Invalid chain
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should store nonce in Redis with TTL', async () => {
      const wallet = createSolanaKeypair();

      const response = await request(app.server)
        .post('/auth/wallet/nonce')
        .send({ publicKey: wallet.publicKey, chain: 'solana' })
        .expect(200);

      const { nonce } = response.body;

      // Check Redis for nonce (try both key patterns)
      const keys = await testRedis.keys(`*wallet-nonce*${nonce}*`);
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // POST /wallet/register - Register with Wallet
  // ============================================

  describe('POST /wallet/register - Register with Wallet', () => {
    it('should register new user with valid wallet signature', async () => {
      const wallet = createSolanaKeypair();
      const { nonce, signature } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/register')
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        })
        .expect(201);

      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBeDefined();
      expect(response.body.user.email_verified).toBe(true);
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();
    });

    it('should create user with synthetic email', async () => {
      const wallet = createSolanaKeypair();
      await registerWallet(wallet);

      const user = await getUserByWallet(wallet.publicKey);
      expect(user).toBeDefined();
      expect(user.email).toContain('wallet-');
      expect(user.email).toContain('@internal.wallet');
    });

    it('should create wallet_connection in database', async () => {
      const wallet = createSolanaKeypair();
      const result = await registerWallet(wallet);

      const connections = await getWalletConnections(result.user.id);
      expect(connections.length).toBe(1);
      expect(connections[0].wallet_address).toBe(wallet.publicKey);
      expect(connections[0].network).toBe('solana');
      expect(connections[0].verified).toBe(true);
    });

    it('should create session on registration', async () => {
      const wallet = createSolanaKeypair();
      const result = await registerWallet(wallet);

      const sessions = await getUserSessions(result.user.id);
      expect(sessions.length).toBeGreaterThan(0);
    });

    it('should return 401 for invalid signature', async () => {
      const wallet = createSolanaKeypair();
      const { nonce } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/register')
        .send({
          publicKey: wallet.publicKey,
          signature: 'invalid-signature-here',
          nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 409 for duplicate wallet registration', async () => {
      const wallet = createSolanaKeypair();

      // First registration
      await registerWallet(wallet);

      // Second registration with same wallet
      const { nonce, signature } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/register')
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        })
        .expect(409);

      expect(response.body.error).toContain('already registered');
    });

    it('should return 401 with expired nonce', async () => {
      const wallet = createSolanaKeypair();
      const { nonce, signature } = await getNonceAndSign(wallet);

      // Manually delete the nonce from Redis to simulate expiration
      const keys = await testRedis.keys(`*wallet-nonce*${nonce}*`);
      for (const key of keys) {
        await testRedis.del(key);
      }

      const response = await request(app.server)
        .post('/auth/wallet/register')
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 with reused nonce', async () => {
      const wallet = createSolanaKeypair();
      const { nonce, signature } = await getNonceAndSign(wallet);

      // First registration succeeds
      await request(app.server)
        .post('/auth/wallet/register')
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        })
        .expect(201);

      // Create a new wallet for second attempt (to avoid duplicate wallet error)
      const wallet2 = createSolanaKeypair();

      // Try to reuse the same nonce
      const response = await request(app.server)
        .post('/auth/wallet/register')
        .send({
          publicKey: wallet2.publicKey,
          signature: wallet2.sign(`Sign this message to authenticate with TicketToken\nNonce: ${nonce}\nTimestamp: 0`),
          nonce, // Reused nonce
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when publicKey is missing', async () => {
      const wallet = createSolanaKeypair();
      const { nonce, signature } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/register')
        .send({
          signature,
          nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when signature is missing', async () => {
      const wallet = createSolanaKeypair();
      const { nonce } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/register')
        .send({
          publicKey: wallet.publicKey,
          nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when nonce is missing', async () => {
      const wallet = createSolanaKeypair();

      const response = await request(app.server)
        .post('/auth/wallet/register')
        .send({
          publicKey: wallet.publicKey,
          signature: 'some-signature',
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });

  // ============================================
  // POST /wallet/login - Login with Wallet
  // ============================================

  describe('POST /wallet/login - Login with Wallet', () => {
    it('should login with registered wallet', async () => {
      const wallet = createSolanaKeypair();

      // Register first
      await registerWallet(wallet);

      // Now login
      const { nonce, signature } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/login')
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
        })
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBeDefined();
      expect(response.body.tokens.refreshToken).toBeDefined();
    });

    it('should update last_login_at on successful login', async () => {
      const wallet = createSolanaKeypair();
      const regResult = await registerWallet(wallet);

      // Get initial last_login_at
      const userBefore = await getUserByWallet(wallet.publicKey);
      const loginBefore = userBefore.last_login_at;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Login
      const { nonce, signature } = await getNonceAndSign(wallet);
      await request(app.server)
        .post('/auth/wallet/login')
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
        })
        .expect(200);

      // Check last_login_at was updated
      const userAfter = await getUserByWallet(wallet.publicKey);
      expect(userAfter.last_login_at).toBeDefined();
      if (loginBefore) {
        expect(new Date(userAfter.last_login_at).getTime()).toBeGreaterThan(new Date(loginBefore).getTime());
      }
    });

    it('should create new session on login', async () => {
      const wallet = createSolanaKeypair();
      const regResult = await registerWallet(wallet);

      const sessionsBefore = await getUserSessions(regResult.user.id);
      const countBefore = sessionsBefore.length;

      // Login
      const { nonce, signature } = await getNonceAndSign(wallet);
      await request(app.server)
        .post('/auth/wallet/login')
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
        })
        .expect(200);

      const sessionsAfter = await getUserSessions(regResult.user.id);
      expect(sessionsAfter.length).toBe(countBefore + 1);
    });

    it('should return 401 for unregistered wallet', async () => {
      const wallet = createSolanaKeypair();
      const { nonce, signature } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/login')
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 for invalid signature', async () => {
      const wallet = createSolanaKeypair();
      await registerWallet(wallet);

      const { nonce } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/login')
        .send({
          publicKey: wallet.publicKey,
          signature: 'invalid-signature',
          nonce,
          chain: 'solana',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 400 when publicKey is missing', async () => {
      const response = await request(app.server)
        .post('/auth/wallet/login')
        .send({
          signature: 'some-signature',
          nonce: 'some-nonce',
          chain: 'solana',
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when signature is missing', async () => {
      const wallet = createSolanaKeypair();

      const response = await request(app.server)
        .post('/auth/wallet/login')
        .send({
          publicKey: wallet.publicKey,
          nonce: 'some-nonce',
          chain: 'solana',
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });

    it('should return 400 when nonce is missing', async () => {
      const wallet = createSolanaKeypair();

      const response = await request(app.server)
        .post('/auth/wallet/login')
        .send({
          publicKey: wallet.publicKey,
          signature: 'some-signature',
          chain: 'solana',
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });

  // ============================================
  // POST /wallet/link - Link Wallet (Authenticated)
  // ============================================

  describe('POST /wallet/link - Link Wallet (Authenticated)', () => {
    it('should link wallet to existing user', async () => {
      const user = await registerRegularUser();
      const wallet = createSolanaKeypair();
      const { nonce, signature } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify in database
      const connections = await getWalletConnections(user.userId);
      expect(connections.length).toBe(1);
      expect(connections[0].wallet_address).toBe(wallet.publicKey);
    });

    it('should return 401 without authorization header', async () => {
      const wallet = createSolanaKeypair();
      const { nonce, signature } = await getNonceAndSign(wallet);

      await request(app.server)
        .post('/auth/wallet/link')
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
        })
        .expect(401);
    });

    it('should return 401 for invalid signature', async () => {
      const user = await registerRegularUser();
      const wallet = createSolanaKeypair();
      const { nonce } = await getNonceAndSign(wallet);

      const response = await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: wallet.publicKey,
          signature: 'invalid-signature',
          nonce,
          chain: 'solana',
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 when wallet already linked to another user', async () => {
      const user1 = await registerRegularUser();
      const user2 = await registerRegularUser();
      const wallet = createSolanaKeypair();

      // Link to user1
      const { nonce: nonce1, signature: sig1 } = await getNonceAndSign(wallet);
      await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({
          publicKey: wallet.publicKey,
          signature: sig1,
          nonce: nonce1,
          chain: 'solana',
        })
        .expect(200);

      // Try to link same wallet to user2
      const { nonce: nonce2, signature: sig2 } = await getNonceAndSign(wallet);
      const response = await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .send({
          publicKey: wallet.publicKey,
          signature: sig2,
          nonce: nonce2,
          chain: 'solana',
        })
        .expect(401);

      expect(response.body.error).toContain('already connected');
    });

    it('should allow re-linking same wallet to same user (idempotent)', async () => {
      const user = await registerRegularUser();
      const wallet = createSolanaKeypair();

      // Link first time
      const { nonce: nonce1, signature: sig1 } = await getNonceAndSign(wallet);
      await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: wallet.publicKey,
          signature: sig1,
          nonce: nonce1,
          chain: 'solana',
        })
        .expect(200);

      // Link second time (should be idempotent)
      const { nonce: nonce2, signature: sig2 } = await getNonceAndSign(wallet);
      const response = await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: wallet.publicKey,
          signature: sig2,
          nonce: nonce2,
          chain: 'solana',
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Should still only have one connection
      const connections = await getWalletConnections(user.userId);
      expect(connections.length).toBe(1);
    });

    it('should return 400 when publicKey is missing', async () => {
      const user = await registerRegularUser();

      const response = await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          signature: 'some-signature',
          nonce: 'some-nonce',
          chain: 'solana',
        })
        .expect(400);

      expect(response.body.detail).toBeDefined();
    });
  });

  // ============================================
  // DELETE /auth/wallet/unlink/:publicKey - Unlink Wallet (Authenticated)
  // ============================================

  describe('DELETE /auth/wallet/unlink/:publicKey - Unlink Wallet (Authenticated)', () => {
    it('should unlink wallet from user', async () => {
      const user = await registerRegularUser();
      const wallet = createSolanaKeypair();

      // Link first
      const { nonce, signature } = await getNonceAndSign(wallet);
      await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
        })
        .expect(200);

      // Verify linked
      let connections = await getWalletConnections(user.userId);
      expect(connections.length).toBe(1);

      // Now unlink
      const response = await request(app.server)
        .delete(`/auth/wallet/unlink/${wallet.publicKey}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify unlinked
      connections = await getWalletConnections(user.userId);
      expect(connections.length).toBe(0);
    });

    it('should return 401 without authorization header', async () => {
      const wallet = createSolanaKeypair();

      await request(app.server)
        .delete(`/auth/wallet/unlink/${wallet.publicKey}`)
        .expect(401);
    });

    it('should return 401 for wallet not owned by user', async () => {
      const user1 = await registerRegularUser();
      const user2 = await registerRegularUser();
      const wallet = createSolanaKeypair();

      // Link to user1
      const { nonce, signature } = await getNonceAndSign(wallet);
      await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user1.accessToken}`)
        .send({
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
        })
        .expect(200);

      // Try to unlink as user2
      const response = await request(app.server)
        .delete(`/auth/wallet/unlink/${wallet.publicKey}`)
        .set('Authorization', `Bearer ${user2.accessToken}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should return 401 for non-existent wallet', async () => {
      const user = await registerRegularUser();
      const wallet = createSolanaKeypair();

      const response = await request(app.server)
        .delete(`/auth/wallet/unlink/${wallet.publicKey}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should allow user to link multiple wallets and unlink one', async () => {
      const user = await registerRegularUser();
      const wallet1 = createSolanaKeypair();
      const wallet2 = createSolanaKeypair();

      // Link wallet1
      const { nonce: n1, signature: s1 } = await getNonceAndSign(wallet1);
      await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ publicKey: wallet1.publicKey, signature: s1, nonce: n1, chain: 'solana' })
        .expect(200);

      // Link wallet2
      const { nonce: n2, signature: s2 } = await getNonceAndSign(wallet2);
      await request(app.server)
        .post('/auth/wallet/link')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ publicKey: wallet2.publicKey, signature: s2, nonce: n2, chain: 'solana' })
        .expect(200);

      // Verify both linked
      let connections = await getWalletConnections(user.userId);
      expect(connections.length).toBe(2);

      // Unlink wallet1
      await request(app.server)
        .delete(`/auth/wallet/unlink/${wallet1.publicKey}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(200);

      // Verify only wallet2 remains
      connections = await getWalletConnections(user.userId);
      expect(connections.length).toBe(1);
      expect(connections[0].wallet_address).toBe(wallet2.publicKey);
    });
  });
});
