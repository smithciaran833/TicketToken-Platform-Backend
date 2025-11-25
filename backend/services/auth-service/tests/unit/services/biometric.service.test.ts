import { BiometricService } from '../../../src/services/biometric.service';
import { db } from '../../../src/config/database';
import { redis } from '../../../src/config/redis';
import { AuthenticationError } from '../../../src/errors';
import crypto from 'crypto';

// Mock dependencies
jest.mock('../../../src/config/database', () => ({
  db: jest.fn()
}));

jest.mock('../../../src/config/redis', () => ({
  redis: {
    setex: jest.fn()
  }
}));

// Mock crypto module
jest.mock('crypto', () => ({
  randomUUID: jest.fn(),
  randomBytes: jest.fn(),
  createHash: jest.fn()
}));

// Test data
const mockCredential = {
  id: 'cred-123',
  user_id: 'user-123',
  device_id: 'device-456',
  public_key: 'mock_public_key',
  credential_type: 'faceId',
  is_active: true,
  created_at: new Date('2024-01-01')
};

describe('BiometricService', () => {
  let biometricService: BiometricService;

  // Database mock setup
  const mockWhere = jest.fn().mockReturnThis();
  const mockFirst = jest.fn();
  const mockInsert = jest.fn();
  const mockSelect = jest.fn();

  // Crypto mock setup
  const mockRandomUUID = crypto.randomUUID as jest.MockedFunction<typeof crypto.randomUUID>;
  const mockRandomBytes = crypto.randomBytes as jest.MockedFunction<typeof crypto.randomBytes>;
  const mockCreateHash = crypto.createHash as jest.MockedFunction<typeof crypto.createHash>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup crypto mocks with proper UUID format and Buffer types
    mockRandomUUID.mockReturnValue('550e8400-e29b-41d4-a716-446655440000' as `${string}-${string}-${string}-${string}-${string}`);
    mockRandomBytes.mockReturnValue(Buffer.from('random_challenge_bytes') as any);
    
    const hashMock = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('hashed_signature')
    };
    mockCreateHash.mockReturnValue(hashMock as any);

    // Reset database mock functions
    mockWhere.mockReturnThis();
    mockFirst.mockReset();
    mockInsert.mockReset();
    mockSelect.mockReset();

    // Setup database mock chain
    mockWhere.mockReturnValue({
      first: mockFirst,
      select: mockSelect
    });

    mockSelect.mockReturnValue(Promise.resolve([]));

    // Setup main db mock
    const mockDb = db as jest.MockedFunction<typeof db>;
    mockDb.mockImplementation((tableName?: any) => {
      if (tableName === 'biometric_credentials') {
        return {
          where: mockWhere,
          first: mockFirst,
          insert: mockInsert,
          select: mockSelect
        } as any;
      }
      return {} as any;
    });

    // Create service instance
    biometricService = new BiometricService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerBiometric()', () => {
    const userId = 'user-123';
    const deviceId = 'device-456';
    const publicKey = 'mock_public_key';
    const mockUuid = '550e8400-e29b-41d4-a716-446655440000';

    it('should register faceId biometric successfully', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      const result = await biometricService.registerBiometric(
        userId,
        deviceId,
        publicKey,
        'faceId'
      );

      // Verify
      expect(mockRandomUUID).toHaveBeenCalled();
      expect(db).toHaveBeenCalledWith('biometric_credentials');
      expect(mockInsert).toHaveBeenCalledWith({
        id: mockUuid,
        user_id: userId,
        device_id: deviceId,
        public_key: publicKey,
        credential_type: 'faceId',
        created_at: expect.any(Date)
      });
      expect(result).toEqual({
        success: true,
        credentialId: mockUuid,
        type: 'faceId'
      });
    });

    it('should register touchId biometric successfully', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      const result = await biometricService.registerBiometric(
        userId,
        deviceId,
        publicKey,
        'touchId'
      );

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          credential_type: 'touchId'
        })
      );
      expect(result.type).toBe('touchId');
    });

    it('should register fingerprint biometric successfully', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);

      // Execute
      const result = await biometricService.registerBiometric(
        userId,
        deviceId,
        publicKey,
        'fingerprint'
      );

      // Verify
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          credential_type: 'fingerprint'
        })
      );
      expect(result.type).toBe('fingerprint');
    });

    it('should generate unique credential IDs', async () => {
      // Setup
      mockInsert.mockResolvedValue([1]);
      const uuid1 = '550e8400-e29b-41d4-a716-446655440001' as `${string}-${string}-${string}-${string}-${string}`;
      const uuid2 = '550e8400-e29b-41d4-a716-446655440002' as `${string}-${string}-${string}-${string}-${string}`;
      mockRandomUUID.mockReturnValueOnce(uuid1);
      mockRandomUUID.mockReturnValueOnce(uuid2);

      // Execute
      const result1 = await biometricService.registerBiometric(
        userId,
        deviceId,
        publicKey,
        'faceId'
      );
      const result2 = await biometricService.registerBiometric(
        userId,
        deviceId,
        publicKey,
        'touchId'
      );

      // Verify
      expect(result1.credentialId).toBe(uuid1);
      expect(result2.credentialId).toBe(uuid2);
      expect(mockRandomUUID).toHaveBeenCalledTimes(2);
    });

    it('should handle database insert failure', async () => {
      // Setup
      mockInsert.mockRejectedValue(new Error('Database error'));

      // Execute & Verify
      await expect(
        biometricService.registerBiometric(userId, deviceId, publicKey, 'faceId')
      ).rejects.toThrow('Database error');
    });
  });

  describe('verifyBiometric()', () => {
    const userId = 'user-123';
    const deviceId = 'device-456';
    const credentialId = 'cred-123';
    const challenge = 'test_challenge';
    const correctSignature = 'hashed_signature';
    const incorrectSignature = 'wrong_signature';

    it('should verify biometric with correct signature', async () => {
      // Setup
      mockFirst.mockResolvedValue(mockCredential);

      // Execute
      const result = await biometricService.verifyBiometric(
        userId,
        deviceId,
        credentialId,
        correctSignature,
        challenge
      );

      // Verify
      expect(mockWhere).toHaveBeenCalledWith({
        id: credentialId,
        user_id: userId,
        device_id: deviceId,
        is_active: true
      });
      expect(mockCreateHash).toHaveBeenCalledWith('sha256');
      const hashMock = mockCreateHash('sha256');
      expect(hashMock.update).toHaveBeenCalledWith(challenge + mockCredential.public_key);
      expect(hashMock.digest).toHaveBeenCalledWith('hex');
      expect(result).toBe(true);
    });

    it('should reject biometric with incorrect signature', async () => {
      // Setup
      mockFirst.mockResolvedValue(mockCredential);

      // Execute
      const result = await biometricService.verifyBiometric(
        userId,
        deviceId,
        credentialId,
        incorrectSignature,
        challenge
      );

      // Verify
      expect(result).toBe(false);
    });

    it('should throw AuthenticationError if credential not found', async () => {
      // Setup
      mockFirst.mockResolvedValue(null);

      // Execute & Verify
      await expect(
        biometricService.verifyBiometric(
          userId,
          deviceId,
          credentialId,
          correctSignature,
          challenge
        )
      ).rejects.toThrow(AuthenticationError);
      await expect(
        biometricService.verifyBiometric(
          userId,
          deviceId,
          credentialId,
          correctSignature,
          challenge
        )
      ).rejects.toThrow('Biometric credential not found');
    });

    it('should reject inactive credentials', async () => {
      // Setup
      const inactiveCredential = { ...mockCredential, is_active: false };
      mockFirst.mockResolvedValue(null); // Query with is_active: true returns null

      // Execute & Verify
      await expect(
        biometricService.verifyBiometric(
          userId,
          deviceId,
          credentialId,
          correctSignature,
          challenge
        )
      ).rejects.toThrow(AuthenticationError);
    });

    it('should verify with different credential types', async () => {
      // Test with touchId
      mockFirst.mockResolvedValueOnce({ ...mockCredential, credential_type: 'touchId' });
      let result = await biometricService.verifyBiometric(
        userId,
        deviceId,
        credentialId,
        correctSignature,
        challenge
      );
      expect(result).toBe(true);

      // Test with fingerprint
      mockFirst.mockResolvedValueOnce({ ...mockCredential, credential_type: 'fingerprint' });
      result = await biometricService.verifyBiometric(
        userId,
        deviceId,
        credentialId,
        correctSignature,
        challenge
      );
      expect(result).toBe(true);
    });

    it('should handle different userId, deviceId, and credentialId combinations', async () => {
      // Setup - credential exists but with different userId
      mockFirst.mockResolvedValue(null);

      // Execute & Verify
      await expect(
        biometricService.verifyBiometric(
          'different-user',
          deviceId,
          credentialId,
          correctSignature,
          challenge
        )
      ).rejects.toThrow(AuthenticationError);

      // Setup - credential exists but with different deviceId
      mockFirst.mockResolvedValue(null);

      // Execute & Verify
      await expect(
        biometricService.verifyBiometric(
          userId,
          'different-device',
          credentialId,
          correctSignature,
          challenge
        )
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('generateChallenge()', () => {
    const userId = 'user-123';

    it('should generate and store challenge in Redis', async () => {
      // Setup
      const mockBuffer = Buffer.from('random_challenge_bytes');
      mockRandomBytes.mockReturnValue(mockBuffer as any);

      // Execute
      const result = await biometricService.generateChallenge(userId);

      // Verify
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
      expect(result).toBe(mockBuffer.toString('hex'));
      expect(redis.setex).toHaveBeenCalledWith(
        `biometric_challenge:${userId}`,
        300,
        mockBuffer.toString('hex')
      );
    });

    it('should generate unique challenges', async () => {
      // Setup
      const buffer1 = Buffer.from('challenge1');
      const buffer2 = Buffer.from('challenge2');
      mockRandomBytes.mockReturnValueOnce(buffer1 as any);
      mockRandomBytes.mockReturnValueOnce(buffer2 as any);

      // Execute
      const challenge1 = await biometricService.generateChallenge(userId);
      const challenge2 = await biometricService.generateChallenge(userId);

      // Verify
      expect(challenge1).toBe(buffer1.toString('hex'));
      expect(challenge2).toBe(buffer2.toString('hex'));
      expect(challenge1).not.toBe(challenge2);
      expect(mockRandomBytes).toHaveBeenCalledTimes(2);
    });

    it('should store challenge with 5 minute expiry', async () => {
      // Setup
      const mockBuffer = Buffer.from('test_challenge');
      mockRandomBytes.mockReturnValue(mockBuffer as any);

      // Execute
      await biometricService.generateChallenge(userId);

      // Verify
      expect(redis.setex).toHaveBeenCalledWith(
        expect.any(String),
        300, // 5 minutes in seconds
        expect.any(String)
      );
    });

    it('should store challenge with correct key format', async () => {
      // Setup
      const mockBuffer = Buffer.from('test_challenge');
      mockRandomBytes.mockReturnValue(mockBuffer as any);

      // Execute
      await biometricService.generateChallenge('user-456');

      // Verify
      expect(redis.setex).toHaveBeenCalledWith(
        'biometric_challenge:user-456',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should handle Redis errors', async () => {
      // Setup
      (redis.setex as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      // Execute & Verify
      await expect(
        biometricService.generateChallenge(userId)
      ).rejects.toThrow('Redis connection failed');
    });
  });

  describe('listBiometricDevices()', () => {
    const userId = 'user-123';
    const mockDevices = [
      {
        id: 'cred-001',
        device_id: 'device-001',
        credential_type: 'faceId',
        created_at: new Date('2024-01-01')
      },
      {
        id: 'cred-002',
        device_id: 'device-002',
        credential_type: 'touchId',
        created_at: new Date('2024-01-02')
      },
      {
        id: 'cred-003',
        device_id: 'device-003',
        credential_type: 'fingerprint',
        created_at: new Date('2024-01-03')
      }
    ];

    it('should list all active biometric devices for user', async () => {
      // Setup
      mockSelect.mockResolvedValue(mockDevices);

      // Execute
      const result = await biometricService.listBiometricDevices(userId);

      // Verify
      expect(mockWhere).toHaveBeenCalledWith({
        user_id: userId,
        is_active: true
      });
      expect(mockSelect).toHaveBeenCalledWith(
        'id',
        'device_id',
        'credential_type',
        'created_at'
      );
      expect(result).toEqual(mockDevices);
    });

    it('should return empty array if no devices found', async () => {
      // Setup
      mockSelect.mockResolvedValue([]);

      // Execute
      const result = await biometricService.listBiometricDevices(userId);

      // Verify
      expect(result).toEqual([]);
    });

    it('should only return active devices', async () => {
      // Setup
      mockSelect.mockResolvedValue([mockDevices[0], mockDevices[1]]);

      // Execute
      const result = await biometricService.listBiometricDevices(userId);

      // Verify
      expect(mockWhere).toHaveBeenCalledWith({
        user_id: userId,
        is_active: true
      });
      expect(result).toHaveLength(2);
    });

    it('should handle different users', async () => {
      // Setup
      mockSelect.mockResolvedValueOnce(mockDevices);
      mockSelect.mockResolvedValueOnce([mockDevices[0]]);

      // Execute
      const result1 = await biometricService.listBiometricDevices('user-123');
      const result2 = await biometricService.listBiometricDevices('user-456');

      // Verify
      expect(mockWhere).toHaveBeenNthCalledWith(1, {
        user_id: 'user-123',
        is_active: true
      });
      expect(mockWhere).toHaveBeenNthCalledWith(2, {
        user_id: 'user-456',
        is_active: true
      });
      expect(result1).toHaveLength(3);
      expect(result2).toHaveLength(1);
    });

    it('should only select specific fields', async () => {
      // Setup
      mockSelect.mockResolvedValue(mockDevices);

      // Execute
      await biometricService.listBiometricDevices(userId);

      // Verify
      expect(mockSelect).toHaveBeenCalledWith(
        'id',
        'device_id',
        'credential_type',
        'created_at'
      );
      expect(mockSelect).not.toHaveBeenCalledWith('public_key'); // Should not expose public key
    });

    it('should handle database errors', async () => {
      // Setup
      mockSelect.mockRejectedValue(new Error('Database connection lost'));

      // Execute & Verify
      await expect(
        biometricService.listBiometricDevices(userId)
      ).rejects.toThrow('Database connection lost');
    });
  });
});
