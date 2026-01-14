import { testPool, testRedis, cleanupAll, closeConnections, createTestUser, TEST_TENANT_ID } from './setup';
import { WalletController } from '../../src/controllers/wallet.controller';
import { WalletService } from '../../src/services/wallet.service';
import { JWTService } from '../../src/services/jwt.service';
import bcrypt from 'bcrypt';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

jest.mock('../../src/config/database', () => ({
  pool: require('./setup').testPool,
  db: require('knex')({
    client: 'pg',
    connection: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432'),
      database: process.env.TEST_DB_NAME || 'tickettoken_test',
      user: process.env.TEST_DB_USER || 'postgres',
      password: process.env.TEST_DB_PASSWORD || 'postgres',
    },
  }),
}));

jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

jest.mock('../../src/services/audit.service', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
    logSessionCreated: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('WalletController Integration Tests', () => {
  let walletController: WalletController;
  let walletService: WalletService;
  let jwtService: JWTService;

  beforeAll(async () => {
    // Initialize JWTService first, then inject into WalletService
    jwtService = new JWTService();
    await jwtService.initialize();
    walletService = new WalletService(jwtService);
    walletController = new WalletController(walletService);
  });

  beforeEach(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

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

  function createMockRequest(overrides: Partial<any> = {}) {
    return {
      body: overrides.body || {},
      params: overrides.params || {},
      user: overrides.user || null,
      ip: overrides.ip || '10.0.0.1',
      headers: {
        'user-agent': 'Jest Test Agent',
        ...overrides.headers,
      },
      ...overrides,
    };
  }

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

  describe('requestNonce', () => {
    it('should generate nonce for valid public key', async () => {
      const wallet = createSolanaKeypair();

      const request = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          chain: 'solana',
        },
      });
      const reply = createMockReply();

      await walletController.requestNonce(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.nonce).toBeDefined();
      expect(reply.body.message).toBeDefined();
    });

    it('should generate different nonces for different requests', async () => {
      const wallet = createSolanaKeypair();

      const request1 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const reply1 = createMockReply();
      await walletController.requestNonce(request1, reply1);

      const request2 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const reply2 = createMockReply();
      await walletController.requestNonce(request2, reply2);

      expect(reply1.body.nonce).not.toBe(reply2.body.nonce);
    });
  });

  describe('register', () => {
    it('should register new user with valid wallet signature', async () => {
      const wallet = createSolanaKeypair();

      const nonceRequest = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply = createMockReply();
      await walletController.requestNonce(nonceRequest, nonceReply);

      const { nonce, message } = nonceReply.body;
      const signature = wallet.sign(message);

      const request = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          signature,
          nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        },
      });
      const reply = createMockReply();

      await walletController.register(request, reply);

      expect(reply.statusCode).toBe(201);
      expect(reply.body.user).toBeDefined();
      expect(reply.body.tokens).toBeDefined();
      expect(reply.body.tokens.accessToken).toBeDefined();
      expect(reply.body.tokens.refreshToken).toBeDefined();
    });

    it('should return 401 for invalid signature', async () => {
      const wallet = createSolanaKeypair();

      const nonceRequest = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply = createMockReply();
      await walletController.requestNonce(nonceRequest, nonceReply);

      const { nonce } = nonceReply.body;

      const request = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          signature: 'invalid-signature',
          nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        },
      });
      const reply = createMockReply();

      await walletController.register(request, reply);

      expect(reply.statusCode).toBe(401);
    });

    it('should return 409 for duplicate wallet registration', async () => {
      const wallet = createSolanaKeypair();

      // First registration
      const nonceRequest1 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply1 = createMockReply();
      await walletController.requestNonce(nonceRequest1, nonceReply1);

      const signature1 = wallet.sign(nonceReply1.body.message);

      const request1 = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          signature: signature1,
          nonce: nonceReply1.body.nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        },
      });
      const reply1 = createMockReply();
      await walletController.register(request1, reply1);

      expect(reply1.statusCode).toBe(201);

      // Second registration with same wallet
      const nonceRequest2 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply2 = createMockReply();
      await walletController.requestNonce(nonceRequest2, nonceReply2);

      const signature2 = wallet.sign(nonceReply2.body.message);

      const request2 = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          signature: signature2,
          nonce: nonceReply2.body.nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        },
      });
      const reply2 = createMockReply();
      await walletController.register(request2, reply2);

      expect(reply2.statusCode).toBe(409);
      expect(reply2.body.error).toContain('already registered');
    });
  });

  describe('login', () => {
    it('should login with registered wallet', async () => {
      const wallet = createSolanaKeypair();

      // Register first
      const nonceRequest1 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply1 = createMockReply();
      await walletController.requestNonce(nonceRequest1, nonceReply1);

      const registerRequest = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          signature: wallet.sign(nonceReply1.body.message),
          nonce: nonceReply1.body.nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        },
      });
      const registerReply = createMockReply();
      await walletController.register(registerRequest, registerReply);

      // Now login
      const nonceRequest2 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply2 = createMockReply();
      await walletController.requestNonce(nonceRequest2, nonceReply2);

      const loginRequest = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          signature: wallet.sign(nonceReply2.body.message),
          nonce: nonceReply2.body.nonce,
          chain: 'solana',
        },
      });
      const loginReply = createMockReply();

      await walletController.login(loginRequest, loginReply);

      expect(loginReply.statusCode).toBe(200);
      expect(loginReply.body.user).toBeDefined();
      expect(loginReply.body.tokens).toBeDefined();
      expect(loginReply.body.tokens.accessToken).toBeDefined();
      expect(loginReply.body.tokens.refreshToken).toBeDefined();
    });

    it('should return 401 for unregistered wallet', async () => {
      const wallet = createSolanaKeypair();

      const nonceRequest = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply = createMockReply();
      await walletController.requestNonce(nonceRequest, nonceReply);

      const loginRequest = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          signature: wallet.sign(nonceReply.body.message),
          nonce: nonceReply.body.nonce,
          chain: 'solana',
        },
      });
      const loginReply = createMockReply();

      await walletController.login(loginRequest, loginReply);

      expect(loginReply.statusCode).toBe(401);
    });

    it('should return 401 for invalid signature', async () => {
      const wallet = createSolanaKeypair();

      // Register first
      const nonceRequest1 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply1 = createMockReply();
      await walletController.requestNonce(nonceRequest1, nonceReply1);

      const registerRequest = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          signature: wallet.sign(nonceReply1.body.message),
          nonce: nonceReply1.body.nonce,
          chain: 'solana',
          tenant_id: TEST_TENANT_ID,
        },
      });
      const registerReply = createMockReply();
      await walletController.register(registerRequest, registerReply);

      // Login with bad signature
      const nonceRequest2 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply2 = createMockReply();
      await walletController.requestNonce(nonceRequest2, nonceReply2);

      const loginRequest = createMockRequest({
        body: {
          publicKey: wallet.publicKey,
          signature: 'bad-signature',
          nonce: nonceReply2.body.nonce,
          chain: 'solana',
        },
      });
      const loginReply = createMockReply();

      await walletController.login(loginRequest, loginReply);

      expect(loginReply.statusCode).toBe(401);
    });
  });

  describe('linkWallet', () => {
    it('should link wallet to existing user', async () => {
      const user = await createDbUser();
      const wallet = createSolanaKeypair();

      const nonceRequest = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply = createMockReply();
      await walletController.requestNonce(nonceRequest, nonceReply);

      const request = createMockRequest({
        user: { id: user.id },
        body: {
          publicKey: wallet.publicKey,
          signature: wallet.sign(nonceReply.body.message),
          nonce: nonceReply.body.nonce,
          chain: 'solana',
        },
      });
      const reply = createMockReply();

      await walletController.linkWallet(request, reply);

      expect(reply.statusCode).toBe(200);
      expect(reply.body.success).toBe(true);

      const result = await testPool.query(
        'SELECT * FROM wallet_connections WHERE user_id = $1',
        [user.id]
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].wallet_address).toBe(wallet.publicKey);
    });

    it('should return 401 for invalid signature when linking', async () => {
      const user = await createDbUser();
      const wallet = createSolanaKeypair();

      const nonceRequest = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply = createMockReply();
      await walletController.requestNonce(nonceRequest, nonceReply);

      const request = createMockRequest({
        user: { id: user.id },
        body: {
          publicKey: wallet.publicKey,
          signature: 'invalid-signature',
          nonce: nonceReply.body.nonce,
          chain: 'solana',
        },
      });
      const reply = createMockReply();

      await walletController.linkWallet(request, reply);

      expect(reply.statusCode).toBe(401);
    });

    it('should return 401 when linking wallet already owned by another user', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();
      const wallet = createSolanaKeypair();

      // Link to user1 first
      const nonceRequest1 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply1 = createMockReply();
      await walletController.requestNonce(nonceRequest1, nonceReply1);

      const linkRequest1 = createMockRequest({
        user: { id: user1.id },
        body: {
          publicKey: wallet.publicKey,
          signature: wallet.sign(nonceReply1.body.message),
          nonce: nonceReply1.body.nonce,
          chain: 'solana',
        },
      });
      const linkReply1 = createMockReply();
      await walletController.linkWallet(linkRequest1, linkReply1);

      expect(linkReply1.statusCode).toBe(200);

      // Try to link same wallet to user2
      const nonceRequest2 = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply2 = createMockReply();
      await walletController.requestNonce(nonceRequest2, nonceReply2);

      const linkRequest2 = createMockRequest({
        user: { id: user2.id },
        body: {
          publicKey: wallet.publicKey,
          signature: wallet.sign(nonceReply2.body.message),
          nonce: nonceReply2.body.nonce,
          chain: 'solana',
        },
      });
      const linkReply2 = createMockReply();
      await walletController.linkWallet(linkRequest2, linkReply2);

      expect(linkReply2.statusCode).toBe(401);
      expect(linkReply2.body.error).toContain('already connected');
    });
  });

  describe('unlinkWallet', () => {
    it('should unlink wallet from user', async () => {
      const user = await createDbUser();
      const wallet = createSolanaKeypair();

      // First link wallet
      const nonceRequest = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply = createMockReply();
      await walletController.requestNonce(nonceRequest, nonceReply);

      const linkRequest = createMockRequest({
        user: { id: user.id },
        body: {
          publicKey: wallet.publicKey,
          signature: wallet.sign(nonceReply.body.message),
          nonce: nonceReply.body.nonce,
          chain: 'solana',
        },
      });
      const linkReply = createMockReply();
      await walletController.linkWallet(linkRequest, linkReply);

      // Now unlink
      const unlinkRequest = createMockRequest({
        user: { id: user.id },
        params: { publicKey: wallet.publicKey },
      });
      const unlinkReply = createMockReply();

      await walletController.unlinkWallet(unlinkRequest, unlinkReply);

      expect(unlinkReply.statusCode).toBe(200);
      expect(unlinkReply.body.success).toBe(true);

      const result = await testPool.query(
        'SELECT * FROM wallet_connections WHERE user_id = $1',
        [user.id]
      );
      expect(result.rows.length).toBe(0);
    });

    it('should return 401 for wallet not owned by user', async () => {
      const user1 = await createDbUser();
      const user2 = await createDbUser();
      const wallet = createSolanaKeypair();

      // Link wallet to user1
      const nonceRequest = createMockRequest({
        body: { publicKey: wallet.publicKey, chain: 'solana' },
      });
      const nonceReply = createMockReply();
      await walletController.requestNonce(nonceRequest, nonceReply);

      const linkRequest = createMockRequest({
        user: { id: user1.id },
        body: {
          publicKey: wallet.publicKey,
          signature: wallet.sign(nonceReply.body.message),
          nonce: nonceReply.body.nonce,
          chain: 'solana',
        },
      });
      const linkReply = createMockReply();
      await walletController.linkWallet(linkRequest, linkReply);

      // Try to unlink as user2
      const unlinkRequest = createMockRequest({
        user: { id: user2.id },
        params: { publicKey: wallet.publicKey },
      });
      const unlinkReply = createMockReply();

      await walletController.unlinkWallet(unlinkRequest, unlinkReply);

      expect(unlinkReply.statusCode).toBe(401);
    });

    it('should return 401 for non-existent wallet', async () => {
      const user = await createDbUser();
      const wallet = createSolanaKeypair();

      const unlinkRequest = createMockRequest({
        user: { id: user.id },
        params: { publicKey: wallet.publicKey },
      });
      const unlinkReply = createMockReply();

      await walletController.unlinkWallet(unlinkRequest, unlinkReply);

      expect(unlinkReply.statusCode).toBe(401);
    });
  });
});
