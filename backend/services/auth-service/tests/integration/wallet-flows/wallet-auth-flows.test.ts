import { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/app';
import { pool } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';
import * as nacl from 'tweetnacl';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// =============================================================================
// INTEGRATION TEST: WALLET AUTHENTICATION FLOWS
// =============================================================================
// Tests complete wallet authentication workflows for Solana and Ethereum

describe('Integration: Wallet Authentication Flows', () => {
  let app: FastifyInstance;
  let testTenantId: string;

  // Test wallet data
  const solanaKeypair = Keypair.generate();
  const solanaPublicKey = solanaKeypair.publicKey.toBase58();
  
  const mockEthereumAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

  // =============================================================================
  // SETUP & TEARDOWN
  // =============================================================================

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    // Create test tenant
    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, slug, settings) VALUES ($1, $2, $3) RETURNING id`,
      ['Wallet Test Tenant', 'wallet-test-tenant', JSON.stringify({})]
    );
    testTenantId = tenantResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['wallet-test%']);
    await pool.query('DELETE FROM wallet_accounts WHERE public_key LIKE $1', [solanaPublicKey]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
    await app.close();
    await pool.end();
    await redis.quit();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM users WHERE email LIKE $1', ['wallet-test%']);
    await pool.query('DELETE FROM wallet_accounts WHERE public_key = $1', [solanaPublicKey]);
    await pool.query('DELETE FROM wallet_nonces WHERE public_key = $1', [solanaPublicKey]);
    await redis.flushdb();
  });

  // =============================================================================
  // GROUP 1: SOLANA WALLET REGISTRATION (5 tests)
  // =============================================================================

  describe('Solana Wallet Registration', () => {
    it('should complete Solana wallet registration: request nonce → sign → register', async () => {
      // Step 1: Request nonce
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      expect(nonceResponse.statusCode).toBe(200);
      const nonceData = JSON.parse(nonceResponse.body);
      
      expect(nonceData.nonce).toBeDefined();
      expect(nonceData.message).toBeDefined();
      
      const nonce = nonceData.nonce;
      const message = nonceData.message;

      // Step 2: Sign message with wallet
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      // Step 3: Verify signature and register
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/register',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana',
          tenant_id: testTenantId
        }
      });

      expect(registerResponse.statusCode).toBe(201);
      const registerData = JSON.parse(registerResponse.body);

      // Should create user and return tokens
      expect(registerData.user).toBeDefined();
      expect(registerData.tokens).toBeDefined();
      expect(registerData.tokens.accessToken).toBeDefined();

      // Verify user created in database
      const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [registerData.user.id]
      );

      expect(userResult.rows).toHaveLength(1);

      // Verify wallet account linked
      const walletResult = await pool.query(
        'SELECT * FROM wallet_accounts WHERE user_id = $1 AND public_key = $2',
        [registerData.user.id, solanaPublicKey]
      );

      expect(walletResult.rows).toHaveLength(1);
      expect(walletResult.rows[0].chain).toBe('solana');
    });

    it('should generate unique nonce for each wallet request', async () => {
      // Request nonce twice
      const response1 = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const data1 = JSON.parse(response1.body);
      const data2 = JSON.parse(response2.body);

      // Nonces should be different
      expect(data1.nonce).not.toBe(data2.nonce);
      expect(data1.message).not.toBe(data2.message);
    });

    it('should reject registration with invalid signature', async () => {
      // Get nonce
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce } = JSON.parse(nonceResponse.body);

      // Attempt registration with invalid signature
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/register',
        payload: {
          publicKey: solanaPublicKey,
          signature: 'invalid-signature-base58',
          nonce: nonce,
          chain: 'solana',
          tenant_id: testTenantId
        }
      });

      expect(registerResponse.statusCode).toBe(400);
      const data = JSON.parse(registerResponse.body);
      expect(data.success).toBe(false);
    });

    it('should reject registration with expired nonce', async () => {
      // Get nonce
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);

      // Manually expire nonce in database
      await pool.query(
        'UPDATE wallet_nonces SET expires_at = NOW() - INTERVAL \'1 hour\' WHERE nonce = $1',
        [nonce]
      );

      // Sign message
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      // Attempt registration with expired nonce
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/register',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana',
          tenant_id: testTenantId
        }
      });

      expect(registerResponse.statusCode).toBe(400);
      const data = JSON.parse(registerResponse.body);
      expect(data.error).toContain('expired');
    });

    it('should store wallet public key in database', async () => {
      // Complete registration
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/register',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana',
          tenant_id: testTenantId
        }
      });

      const { user } = JSON.parse(registerResponse.body);

      // Verify wallet stored correctly
      const walletResult = await pool.query(
        'SELECT * FROM wallet_accounts WHERE user_id = $1',
        [user.id]
      );

      expect(walletResult.rows).toHaveLength(1);
      const wallet = walletResult.rows[0];
      
      expect(wallet.public_key).toBe(solanaPublicKey);
      expect(wallet.chain).toBe('solana');
      expect(wallet.verified).toBe(true);
    });
  });

  // =============================================================================
  // GROUP 2: SOLANA WALLET LOGIN (5 tests)
  // =============================================================================

  describe('Solana Wallet Login', () => {
    let userId: string;

    beforeEach(async () => {
      // Register wallet first
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/register',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana',
          tenant_id: testTenantId
        }
      });

      userId = JSON.parse(registerResponse.body).user.id;
    });

    it('should login with wallet signature verification', async () => {
      // Get new nonce for login
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);

      // Sign message
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      // Login
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/login',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana'
        }
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginData = JSON.parse(loginResponse.body);

      expect(loginData.user.id).toBe(userId);
      expect(loginData.tokens).toBeDefined();
      expect(loginData.tokens.accessToken).toBeDefined();
    });

    it('should reject login with invalid signature', async () => {
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce } = JSON.parse(nonceResponse.body);

      // Login with wrong signature
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/login',
        payload: {
          publicKey: solanaPublicKey,
          signature: 'wrong-signature',
          nonce: nonce,
          chain: 'solana'
        }
      });

      expect(loginResponse.statusCode).toBe(401);
    });

    it('should create session after wallet login', async () => {
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      await app.inject({
        method: 'POST',
        url: '/auth/wallet/login',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana'
        }
      });

      // Verify session created
      const sessionResult = await pool.query(
        'SELECT * FROM user_sessions WHERE user_id = $1 AND ended_at IS NULL',
        [userId]
      );

      expect(sessionResult.rows.length).toBeGreaterThan(0);
    });

    it('should issue JWT tokens after wallet login', async () => {
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/login',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana'
        }
      });

      const data = JSON.parse(loginResponse.body);

      // Decode JWT
      const token = data.tokens.accessToken;
      const parts = token.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      expect(payload.sub).toBe(userId);
      expect(payload.wallet).toBe(solanaPublicKey);
      expect(payload.tenant_id).toBe(testTenantId);
    });

    it('should prevent nonce reuse', async () => {
      // Get nonce
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      // First login - should work
      const firstLogin = await app.inject({
        method: 'POST',
        url: '/auth/wallet/login',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana'
        }
      });

      expect(firstLogin.statusCode).toBe(200);

      // Attempt to reuse same nonce - should fail
      const secondLogin = await app.inject({
        method: 'POST',
        url: '/auth/wallet/login',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana'
        }
      });

      expect(secondLogin.statusCode).toBe(400);
      const data = JSON.parse(secondLogin.body);
      expect(data.error).toContain('nonce');
    });
  });

  // =============================================================================
  // GROUP 3: WALLET LINKING (3 tests)
  // =============================================================================

  describe('Wallet Linking', () => {
    let userId: string;
    let accessToken: string;

    beforeEach(async () => {
      // Create user via standard registration
      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: 'wallet-test-link@example.com',
          password: 'TestPassword123!@#',
          firstName: 'Wallet',
          lastName: 'Test',
          tenant_id: testTenantId
        }
      });

      const data = JSON.parse(registerResponse.body);
      userId = data.user.id;
      accessToken = data.tokens.accessToken;
    });

    it('should link Solana wallet to existing account', async () => {
      // Get nonce
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      // Link wallet
      const linkResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/link',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana'
        }
      });

      expect(linkResponse.statusCode).toBe(200);

      // Verify wallet linked in database
      const walletResult = await pool.query(
        'SELECT * FROM wallet_accounts WHERE user_id = $1 AND public_key = $2',
        [userId, solanaPublicKey]
      );

      expect(walletResult.rows).toHaveLength(1);
      expect(walletResult.rows[0].chain).toBe('solana');
    });

    it('should support multiple wallets per account', async () => {
      // Link first wallet
      const keypair1 = Keypair.generate();
      const publicKey1 = keypair1.publicKey.toBase58();

      const nonce1Response = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: { publicKey: publicKey1, chain: 'solana' }
      });

      const { nonce: nonce1, message: message1 } = JSON.parse(nonce1Response.body);
      const messageBytes1 = new TextEncoder().encode(message1);
      const signature1 = nacl.sign.detached(messageBytes1, keypair1.secretKey);
      const signatureBase58_1 = bs58.encode(signature1);

      await app.inject({
        method: 'POST',
        url: '/auth/wallet/link',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          publicKey: publicKey1,
          signature: signatureBase58_1,
          nonce: nonce1,
          chain: 'solana'
        }
      });

      // Link second wallet
      const keypair2 = Keypair.generate();
      const publicKey2 = keypair2.publicKey.toBase58();

      const nonce2Response = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: { publicKey: publicKey2, chain: 'solana' }
      });

      const { nonce: nonce2, message: message2 } = JSON.parse(nonce2Response.body);
      const messageBytes2 = new TextEncoder().encode(message2);
      const signature2 = nacl.sign.detached(messageBytes2, keypair2.secretKey);
      const signatureBase58_2 = bs58.encode(signature2);

      await app.inject({
        method: 'POST',
        url: '/auth/wallet/link',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          publicKey: publicKey2,
          signature: signatureBase58_2,
          nonce: nonce2,
          chain: 'solana'
        }
      });

      // Verify both wallets linked
      const walletResult = await pool.query(
        'SELECT COUNT(*) FROM wallet_accounts WHERE user_id = $1',
        [userId]
      );

      expect(parseInt(walletResult.rows[0].count)).toBe(2);
    });

    it('should unlink wallet from account', async () => {
      // Link wallet first
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      await app.inject({
        method: 'POST',
        url: '/auth/wallet/link',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana'
        }
      });

      // Unlink wallet
      const unlinkResponse = await app.inject({
        method: 'DELETE',
        url: `/auth/wallet/unlink/${solanaPublicKey}`,
        headers: { authorization: `Bearer ${accessToken}` }
      });

      expect(unlinkResponse.statusCode).toBe(200);

      // Verify wallet removed
      const walletResult = await pool.query(
        'SELECT * FROM wallet_accounts WHERE user_id = $1 AND public_key = $2',
        [userId, solanaPublicKey]
      );

      expect(walletResult.rows).toHaveLength(0);
    });
  });

  // =============================================================================
  // GROUP 4: WALLET SECURITY (2 tests)
  // =============================================================================

  describe('Wallet Security', () => {
    it('should enforce tenant isolation for wallet accounts', async () => {
      // Register wallet in tenant
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce, message } = JSON.parse(nonceResponse.body);
      const messageBytes = new TextEncoder().encode(message);
      const signature = nacl.sign.detached(messageBytes, solanaKeypair.secretKey);
      const signatureBase58 = bs58.encode(signature);

      const registerResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/register',
        payload: {
          publicKey: solanaPublicKey,
          signature: signatureBase58,
          nonce: nonce,
          chain: 'solana',
          tenant_id: testTenantId
        }
      });

      const data = JSON.parse(registerResponse.body);

      // Verify tenant assigned correctly
      expect(data.user.tenant_id).toBe(testTenantId);

      // Verify in database
      const userResult = await pool.query(
        'SELECT tenant_id FROM users WHERE id = $1',
        [data.user.id]
      );

      expect(userResult.rows[0].tenant_id).toBe(testTenantId);
    });

    it('should expire nonces after 15 minutes', async () => {
      // Request nonce
      const nonceResponse = await app.inject({
        method: 'POST',
        url: '/auth/wallet/nonce',
        payload: {
          publicKey: solanaPublicKey,
          chain: 'solana'
        }
      });

      const { nonce } = JSON.parse(nonceResponse.body);

      // Check nonce expiry time in database
      const nonceResult = await pool.query(
        'SELECT expires_at FROM wallet_nonces WHERE nonce = $1',
        [nonce]
      );

      const expiresAt = new Date(nonceResult.rows[0].expires_at);
      const now = new Date();
      const diffMinutes = (expiresAt.getTime() - now.getTime()) / (1000 * 60);

      // Should expire in approximately 15 minutes
      expect(diffMinutes).toBeGreaterThan(14);
      expect(diffMinutes).toBeLessThan(16);
    });
  });
});
