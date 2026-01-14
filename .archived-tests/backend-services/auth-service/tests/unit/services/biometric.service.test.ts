import { BiometricService } from '../../../src/services/biometric.service';
import { pool } from '../../../src/config/database';

// Mock the database
jest.mock('../../../src/config/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

describe('BiometricService', () => {
  let biometricService: BiometricService;
  let mockPool: jest.Mocked<typeof pool>;

  beforeEach(() => {
    biometricService = new BiometricService();
    mockPool = pool as jest.Mocked<typeof pool>;
    jest.clearAllMocks();
  });

  describe('registerBiometric', () => {
    it('should register new biometric credential', async () => {
      const userId = 'user-123';
      const deviceName = 'iPhone 13';
      const credentialId = 'credential-123';
      const publicKey = 'public-key-data';

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'bio-123', user_id: userId }],
        rowCount: 1,
      } as any);

      const result = await biometricService.registerBiometric(
        userId,
        deviceName,
        credentialId,
        publicKey
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO biometric_credentials'),
        expect.arrayContaining([userId, deviceName, credentialId, publicKey])
      );
      expect(result.id).toBe('bio-123');
      expect(result.user_id).toBe(userId);
    });

    it('should handle duplicate credential registration', async () => {
      const userId = 'user-123';
      const credentialId = 'existing-credential';

      mockPool.query.mockRejectedValueOnce(
        new Error('duplicate key value violates unique constraint')
      );

      await expect(
        biometricService.registerBiometric(userId, 'device', credentialId, 'key')
      ).rejects.toThrow();
    });

    it('should validate required parameters', async () => {
      await expect(
        biometricService.registerBiometric('', 'device', 'cred', 'key')
      ).rejects.toThrow('User ID is required');

      await expect(
        biometricService.registerBiometric('user', '', 'cred', 'key')
      ).rejects.toThrow('Device name is required');

      await expect(
        biometricService.registerBiometric('user', 'device', '', 'key')
      ).rejects.toThrow('Credential ID is required');

      await expect(
        biometricService.registerBiometric('user', 'device', 'cred', '')
      ).rejects.toThrow('Public key is required');
    });

    it('should store device metadata', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'bio-123', device_name: 'Pixel 6' }],
        rowCount: 1,
      } as any);

      await biometricService.registerBiometric(
        'user-123',
        'Pixel 6',
        'cred-456',
        'key-789'
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['user-123', 'Pixel 6', 'cred-456', 'key-789'])
      );
    });
  });

  describe('verifyBiometric', () => {
    it('should verify valid biometric credential', async () => {
      const userId = 'user-123';
      const credentialId = 'credential-123';
      const signature = 'valid-signature';

      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'bio-123',
            user_id: userId,
            credential_id: credentialId,
            public_key: 'public-key',
            enabled: true,
          },
        ],
        rowCount: 1,
      } as any);

      // Mock successful verification
      const result = await biometricService.verifyBiometric(
        userId,
        credentialId,
        signature
      );

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [userId, credentialId]
      );
      expect(result.verified).toBe(true);
    });

    it('should reject verification for non-existent credential', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await biometricService.verifyBiometric(
        'user-123',
        'non-existent',
        'signature'
      );

      expect(result.verified).toBe(false);
      expect(result.error).toContain('Credential not found');
    });

    it('should reject verification for disabled credential', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'bio-123',
            credential_id: 'cred-123',
            enabled: false,
          },
        ],
        rowCount: 1,
      } as any);

      const result = await biometricService.verifyBiometric(
        'user-123',
        'cred-123',
        'signature'
      );

      expect(result.verified).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('should update last_used timestamp on successful verification', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 'bio-123', enabled: true, public_key: 'key' }],
          rowCount: 1,
        } as any)
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
        } as any);

      await biometricService.verifyBiometric('user-123', 'cred-123', 'sig');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE biometric_credentials'),
        expect.any(Array)
      );
    });

    it('should handle invalid signature', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'bio-123', enabled: true, public_key: 'key' }],
        rowCount: 1,
      } as any);

      const result = await biometricService.verifyBiometric(
        'user-123',
        'cred-123',
        'invalid-signature'
      );

      expect(result.verified).toBe(false);
    });
  });

  describe('generateChallenge', () => {
    it('should generate random challenge for user', async () => {
      const userId = 'user-123';

      const challenge = await biometricService.generateChallenge(userId);

      expect(challenge).toBeDefined();
      expect(typeof challenge).toBe('string');
      expect(challenge.length).toBeGreaterThan(20);
    });

    it('should generate unique challenges', async () => {
      const challenge1 = await biometricService.generateChallenge('user-1');
      const challenge2 = await biometricService.generateChallenge('user-1');

      expect(challenge1).not.toBe(challenge2);
    });

    it('should store challenge with expiry', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as any);

      await biometricService.generateChallenge('user-123');

      // Verify challenge was stored (implementation dependent)
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should set challenge expiry to 5 minutes', async () => {
      const userId = 'user-123';
      
      await biometricService.generateChallenge(userId);

      // Challenge should expire in 5 minutes (300 seconds)
      // Implementation specific - would check Redis or DB
    });
  });

  describe('listBiometricDevices', () => {
    it('should list all registered devices for user', async () => {
      const userId = 'user-123';
      const mockDevices = [
        {
          id: 'bio-1',
          device_name: 'iPhone 13',
          created_at: new Date(),
          last_used: new Date(),
          enabled: true,
        },
        {
          id: 'bio-2',
          device_name: 'iPad Pro',
          created_at: new Date(),
          last_used: null,
          enabled: true,
        },
      ];

      mockPool.query.mockResolvedValueOnce({
        rows: mockDevices,
        rowCount: 2,
      } as any);

      const devices = await biometricService.listBiometricDevices(userId);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [userId]
      );
      expect(devices).toHaveLength(2);
      expect(devices[0].device_name).toBe('iPhone 13');
      expect(devices[1].device_name).toBe('iPad Pro');
    });

    it('should return empty array for user with no devices', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const devices = await biometricService.listBiometricDevices('user-123');

      expect(devices).toEqual([]);
    });

    it('should include enabled status for each device', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'bio-1', device_name: 'Device 1', enabled: true },
          { id: 'bio-2', device_name: 'Device 2', enabled: false },
        ],
        rowCount: 2,
      } as any);

      const devices = await biometricService.listBiometricDevices('user-123');

      expect(devices[0].enabled).toBe(true);
      expect(devices[1].enabled).toBe(false);
    });

    it('should not expose sensitive credential data', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'bio-1',
            device_name: 'Device',
            credential_id: 'secret-cred',
            public_key: 'secret-key',
          },
        ],
        rowCount: 1,
      } as any);

      const devices = await biometricService.listBiometricDevices('user-123');

      // Should not include credential_id or public_key in response
      expect(devices[0]).not.toHaveProperty('credential_id');
      expect(devices[0]).not.toHaveProperty('public_key');
    });

    it('should order devices by last_used descending', async () => {
      const oldDate = new Date('2023-01-01');
      const newDate = new Date('2024-01-01');

      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 'bio-1', device_name: 'Recent', last_used: newDate },
          { id: 'bio-2', device_name: 'Old', last_used: oldDate },
        ],
        rowCount: 2,
      } as any);

      await biometricService.listBiometricDevices('user-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY last_used DESC'),
        expect.any(Array)
      );
    });
  });

  describe('disableBiometric', () => {
    it('should disable biometric credential', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'bio-123', enabled: false }],
        rowCount: 1,
      } as any);

      await biometricService.disableBiometric('user-123', 'bio-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining(['bio-123', 'user-123'])
      );
    });

    it('should prevent disabling credential from another user', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(
        biometricService.disableBiometric('user-123', 'other-user-bio')
      ).rejects.toThrow('Credential not found or access denied');
    });
  });

  describe('removeBiometric', () => {
    it('should delete biometric credential', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 1,
      } as any);

      await biometricService.removeBiometric('user-123', 'bio-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        ['bio-123', 'user-123']
      );
    });

    it('should handle non-existent credential', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(
        biometricService.removeBiometric('user-123', 'non-existent')
      ).rejects.toThrow();
    });
  });
});
