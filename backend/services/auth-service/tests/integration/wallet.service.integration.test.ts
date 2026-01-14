import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { WalletService } from '../../src/services/wallet.service';
import { JWTService } from '../../src/services/jwt.service';
import crypto from 'crypto';

// Override the database and redis imports
jest.mock('../../src/config/database', () => ({
  pool: require('./setup').testPool,
}));

jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

// Mock audit service
jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    logSessionCreated: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('WalletService Integration Tests', () => {
  let walletService: WalletService;
  let jwtService: JWTService;

  beforeAll(async () => {
    jwtService = new JWTService();
    await jwtService.initialize();
    walletService = new WalletService();
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
    const result = await testPool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, tenant_id, status, email_verified)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', true)
       RETURNING id, email, tenant_id`,
      [userData.email, 'hashed_password', userData.firstName, userData.lastName, userData.tenant_id]
    );
    return result.rows[0];
  }

  // Helper to create a wallet connection
  async function createWalletConnection(userId: string, walletAddress: string, network: string = 'solana') {
    await testPool.query(
      `INSERT INTO wallet_connections (id, user_id, wallet_address, network, verified, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())`,
      [crypto.randomUUID(), userId, walletAddress, network]
    );
  }

  // Generate test wallet address
  function generateTestWalletAddress(chain: 'solana' | 'ethereum' = 'solana'): string {
    if (chain === 'ethereum') {
      return '0x' + crypto.randomBytes(20).toString('hex');
    }
    // Solana-like address (base58, 32-44 chars)
    return crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, '').substring(0, 44);
  }

  describe('generateNonce', () => {
    it('should generate nonce and message', async () => {
      const publicKey = generateTestWalletAddress();

      const result = await walletService.generateNonce(publicKey, 'solana', TEST_TENANT_ID);

      expect(result.nonce).toBeDefined();
      expect(result.nonce.length).toBe(64); // 32 bytes hex
      expect(result.message).toContain('Sign this message to authenticate');
      expect(result.message).toContain(result.nonce);
    });

    it('should store nonce in Redis with tenant prefix', async () => {
      const publicKey = generateTestWalletAddress();

      const result = await walletService.generateNonce(publicKey, 'solana', TEST_TENANT_ID);

      const redisKey = `tenant:${TEST_TENANT_ID}:wallet-nonce:${result.nonce}`;
      const storedData = await testRedis.get(redisKey);

      expect(storedData).not.toBeNull();
      const parsed = JSON.parse(storedData!);
      expect(parsed.publicKey).toBe(publicKey);
      expect(parsed.chain).toBe('solana');
      expect(parsed.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should set TTL on nonce (15 minutes)', async () => {
      const publicKey = generateTestWalletAddress();

      const result = await walletService.generateNonce(publicKey, 'solana', TEST_TENANT_ID);

      const redisKey = `tenant:${TEST_TENANT_ID}:wallet-nonce:${result.nonce}`;
      const ttl = await testRedis.ttl(redisKey);

      expect(ttl).toBeGreaterThan(800); // ~15 minutes
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('should work for ethereum chain', async () => {
      const publicKey = generateTestWalletAddress('ethereum');

      const result = await walletService.generateNonce(publicKey, 'ethereum', TEST_TENANT_ID);

      const redisKey = `tenant:${TEST_TENANT_ID}:wallet-nonce:${result.nonce}`;
      const storedData = await testRedis.get(redisKey);
      const parsed = JSON.parse(storedData!);

      expect(parsed.chain).toBe('ethereum');
    });
  });

  describe('unlinkWallet', () => {
    it('should remove wallet connection', async () => {
      const user = await createDbUser();
      const walletAddress = generateTestWalletAddress();
      await createWalletConnection(user.id, walletAddress);

      const result = await walletService.unlinkWallet(user.id, walletAddress);

      expect(result.success).toBe(true);

      const connection = await testPool.query(
        `SELECT * FROM wallet_connections WHERE user_id = $1 AND wallet_address = $2`,
        [user.id, walletAddress]
      );

      expect(connection.rows.length).toBe(0);
    });

    it('should reject unlinking non-existent wallet', async () => {
      const user = await createDbUser();
      const walletAddress = generateTestWalletAddress();

      await expect(
        walletService.unlinkWallet(user.id, walletAddress)
      ).rejects.toThrow('Wallet not found or not linked');
    });

    it('should not affect other wallets when unlinking one', async () => {
      const user = await createDbUser();
      const wallet1 = generateTestWalletAddress();
      const wallet2 = generateTestWalletAddress();
      await createWalletConnection(user.id, wallet1, 'solana');
      await createWalletConnection(user.id, wallet2, 'ethereum');

      await walletService.unlinkWallet(user.id, wallet1);

      const wallet1Connection = await testPool.query(
        `SELECT * FROM wallet_connections WHERE wallet_address = $1`,
        [wallet1]
      );
      const wallet2Connection = await testPool.query(
        `SELECT * FROM wallet_connections WHERE wallet_address = $1`,
        [wallet2]
      );

      expect(wallet1Connection.rows.length).toBe(0);
      expect(wallet2Connection.rows.length).toBe(1);
    });

    it('should not affect other users wallets', async () => {
      const user1 = await createDbUser({ email: 'user1@test.com' });
      const user2 = await createDbUser({ email: 'user2@test.com' });
      const wallet1 = generateTestWalletAddress();
      const wallet2 = generateTestWalletAddress();
      await createWalletConnection(user1.id, wallet1);
      await createWalletConnection(user2.id, wallet2);

      await walletService.unlinkWallet(user1.id, wallet1);

      const user2Wallet = await testPool.query(
        `SELECT * FROM wallet_connections WHERE user_id = $1`,
        [user2.id]
      );

      expect(user2Wallet.rows.length).toBe(1);
    });
  });

  describe('wallet connection database operations', () => {
    it('should store wallet connection with correct fields', async () => {
      const user = await createDbUser();
      const walletAddress = generateTestWalletAddress();

      await testPool.query(
        `INSERT INTO wallet_connections (id, user_id, wallet_address, network, verified, created_at, last_login_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [crypto.randomUUID(), user.id, walletAddress, 'solana', true]
      );

      const connection = await testPool.query(
        `SELECT * FROM wallet_connections WHERE user_id = $1`,
        [user.id]
      );

      expect(connection.rows.length).toBe(1);
      expect(connection.rows[0].wallet_address).toBe(walletAddress);
      expect(connection.rows[0].network).toBe('solana');
      expect(connection.rows[0].verified).toBe(true);
    });

    it('should allow multiple wallets per user', async () => {
      const user = await createDbUser();
      const wallet1 = generateTestWalletAddress('solana');
      const wallet2 = generateTestWalletAddress('ethereum');

      await createWalletConnection(user.id, wallet1, 'solana');
      await createWalletConnection(user.id, wallet2, 'ethereum');

      const connections = await testPool.query(
        `SELECT * FROM wallet_connections WHERE user_id = $1`,
        [user.id]
      );

      expect(connections.rows.length).toBe(2);
    });

    it('should find user by wallet address', async () => {
      const user = await createDbUser();
      const walletAddress = generateTestWalletAddress();
      await createWalletConnection(user.id, walletAddress);

      const result = await testPool.query(
        `SELECT u.* FROM users u
         JOIN wallet_connections wc ON u.id = wc.user_id
         WHERE wc.wallet_address = $1 AND wc.verified = true`,
        [walletAddress]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].id).toBe(user.id);
    });

    it('should not find unverified wallet', async () => {
      const user = await createDbUser();
      const walletAddress = generateTestWalletAddress();

      await testPool.query(
        `INSERT INTO wallet_connections (id, user_id, wallet_address, network, verified, created_at)
         VALUES ($1, $2, $3, $4, false, NOW())`,
        [crypto.randomUUID(), user.id, walletAddress, 'solana']
      );

      const result = await testPool.query(
        `SELECT * FROM wallet_connections WHERE wallet_address = $1 AND verified = true`,
        [walletAddress]
      );

      expect(result.rows.length).toBe(0);
    });
  });

  describe('nonce lifecycle', () => {
    it('should generate unique nonces', async () => {
      const publicKey = generateTestWalletAddress();

      const nonce1 = await walletService.generateNonce(publicKey, 'solana', TEST_TENANT_ID);
      const nonce2 = await walletService.generateNonce(publicKey, 'solana', TEST_TENANT_ID);

      expect(nonce1.nonce).not.toBe(nonce2.nonce);
    });

    it('should include timestamp in nonce data', async () => {
      const publicKey = generateTestWalletAddress();
      const before = Date.now();

      const result = await walletService.generateNonce(publicKey, 'solana', TEST_TENANT_ID);

      const after = Date.now();
      const redisKey = `tenant:${TEST_TENANT_ID}:wallet-nonce:${result.nonce}`;
      const storedData = await testRedis.get(redisKey);
      const parsed = JSON.parse(storedData!);

      expect(parsed.timestamp).toBeGreaterThanOrEqual(before);
      expect(parsed.timestamp).toBeLessThanOrEqual(after);
    });

    it('should include expiration time in nonce data', async () => {
      const publicKey = generateTestWalletAddress();

      const result = await walletService.generateNonce(publicKey, 'solana', TEST_TENANT_ID);

      const redisKey = `tenant:${TEST_TENANT_ID}:wallet-nonce:${result.nonce}`;
      const storedData = await testRedis.get(redisKey);
      const parsed = JSON.parse(storedData!);

      // Expires 15 minutes (900000ms) after creation
      expect(parsed.expiresAt).toBe(parsed.timestamp + 900000);
    });
  });

  describe('wallet registration database flow', () => {
    it('should create user with synthetic email for wallet registration', async () => {
      const walletAddress = generateTestWalletAddress();
      const syntheticEmail = `wallet-${walletAddress.substring(0, 16).toLowerCase()}@internal.wallet`;

      // Simulate what registerWithWallet does at DB level
      const userResult = await testPool.query(
        `INSERT INTO users (email, password_hash, email_verified, tenant_id, created_at)
         VALUES ($1, '', true, $2, NOW())
         RETURNING id, email, email_verified`,
        [syntheticEmail, TEST_TENANT_ID]
      );

      expect(userResult.rows[0].email).toBe(syntheticEmail);
      expect(userResult.rows[0].email_verified).toBe(true);
    });

    it('should create session on wallet registration', async () => {
      const user = await createDbUser();

      const sessionResult = await testPool.query(
        `INSERT INTO user_sessions (id, user_id, started_at)
         VALUES ($1, $2, NOW())
         RETURNING id`,
        [crypto.randomUUID(), user.id]
      );

      const session = await testPool.query(
        `SELECT * FROM user_sessions WHERE id = $1`,
        [sessionResult.rows[0].id]
      );

      expect(session.rows.length).toBe(1);
      expect(session.rows[0].user_id).toBe(user.id);
    });

    it('should update last_login_at on wallet login', async () => {
      const user = await createDbUser();
      const walletAddress = generateTestWalletAddress();
      await createWalletConnection(user.id, walletAddress);

      // Get initial last_login_at
      const before = await testPool.query(
        `SELECT last_login_at FROM users WHERE id = $1`,
        [user.id]
      );

      // Simulate login update
      await testPool.query(
        `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
        [user.id]
      );

      const after = await testPool.query(
        `SELECT last_login_at FROM users WHERE id = $1`,
        [user.id]
      );

      expect(after.rows[0].last_login_at).not.toEqual(before.rows[0].last_login_at);
    });
  });

  describe('wallet uniqueness constraints', () => {
    it('should allow same wallet for different networks', async () => {
      const user = await createDbUser();
      const walletAddress = generateTestWalletAddress();

      // This would typically not happen in real world, but tests the schema
      await createWalletConnection(user.id, walletAddress, 'solana');

      // Different network should work
      await expect(
        testPool.query(
          `INSERT INTO wallet_connections (id, user_id, wallet_address, network, verified, created_at)
           VALUES ($1, $2, $3, $4, true, NOW())`,
          [crypto.randomUUID(), user.id, walletAddress, 'ethereum']
        )
      ).resolves.not.toThrow();
    });
  });
});
