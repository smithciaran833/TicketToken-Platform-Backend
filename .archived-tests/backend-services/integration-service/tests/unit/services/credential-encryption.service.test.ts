import { credentialEncryptionService } from '../../../src/services/credential-encryption.service';
import { kmsService } from '../../../src/config/kms';
import { db } from '../../../src/config/database';

// Mock dependencies
jest.mock('../../../src/config/kms');
jest.mock('../../../src/config/database');

describe('CredentialEncryptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('storeOAuthTokens', () => {
    it('should store OAuth tokens with encryption', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';
      const provider = 'quickbooks';
      const tokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        expiresAt: new Date(Date.now() + 3600 * 1000),
        tokenType: 'Bearer',
      };

      // Mock KMS encryption
      (kmsService.encryptAccessToken as jest.Mock).mockResolvedValue({
        ciphertext: 'encrypted-access',
        keyId: 'key-id',
        encryptionContext: { venueId, integrationType },
      });
      (kmsService.encryptRefreshToken as jest.Mock).mockResolvedValue({
        ciphertext: 'encrypted-refresh',
        keyId: 'key-id',
        encryptionContext: { venueId, integrationType },
      });

      // Mock database
      const mockInsert = jest.fn().mockReturnThis();
      const mockOnConflict = jest.fn().mockReturnThis();
      const mockMerge = jest.fn().mockResolvedValue({});
      
      (db as unknown as jest.Mock).mockReturnValue({
        insert: mockInsert,
      });
      mockInsert.mockReturnValue({
        onConflict: mockOnConflict,
      });
      mockOnConflict.mockReturnValue({
        merge: mockMerge,
      });

      await credentialEncryptionService.storeOAuthTokens(
        venueId,
        integrationType,
        provider,
        tokens
      );

      expect(kmsService.encryptAccessToken).toHaveBeenCalledWith(
        'access-token-123',
        venueId,
        integrationType
      );
      expect(kmsService.encryptRefreshToken).toHaveBeenCalledWith(
        'refresh-token-456',
        venueId,
        integrationType
      );
      expect(mockInsert).toHaveBeenCalled();
      expect(mockOnConflict).toHaveBeenCalledWith(['venue_id', 'integration_type']);
    });

    it('should handle encryption errors', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';
      const provider = 'quickbooks';
      const tokens = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        tokenType: 'Bearer',
      };

      (kmsService.encryptAccessToken as jest.Mock).mockRejectedValue(
        new Error('KMS encryption failed')
      );

      await expect(
        credentialEncryptionService.storeOAuthTokens(venueId, integrationType, provider, tokens)
      ).rejects.toThrow('Failed to store OAuth tokens');
    });
  });

  describe('retrieveOAuthTokens', () => {
    it('should retrieve and decrypt OAuth tokens', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';
      const expiresAt = new Date(Date.now() + 3600 * 1000);

      // Mock database query
      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue({
        access_token_encrypted: 'encrypted-access',
        refresh_token_encrypted: 'encrypted-refresh',
        access_token_expires_at: expiresAt,
        token_type: 'Bearer',
        scopes: ['read', 'write'],
      });

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere.mockReturnValue({
        first: mockFirst,
      });

      // Mock KMS decryption
      (kmsService.decryptAccessToken as jest.Mock).mockResolvedValue('decrypted-access');
      (kmsService.decryptRefreshToken as jest.Mock).mockResolvedValue('decrypted-refresh');

      const result = await credentialEncryptionService.retrieveOAuthTokens(
        venueId,
        integrationType
      );

      expect(result).toEqual({
        accessToken: 'decrypted-access',
        refreshToken: 'decrypted-refresh',
        expiresAt,
        tokenType: 'Bearer',
        scopes: ['read', 'write'],
        idToken: undefined,
        refreshExpiresAt: undefined,
      });

      expect(kmsService.decryptAccessToken).toHaveBeenCalledWith(
        'encrypted-access',
        venueId,
        integrationType
      );
    });

    it('should return null if no tokens found', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';

      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue(null);

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere.mockReturnValue({
        first: mockFirst,
      });

      const result = await credentialEncryptionService.retrieveOAuthTokens(
        venueId,
        integrationType
      );

      expect(result).toBeNull();
    });

    it('should handle decryption errors', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';

      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue({
        access_token_encrypted: 'encrypted-access',
        refresh_token_encrypted: 'encrypted-refresh',
        access_token_expires_at: new Date(),
        token_type: 'Bearer',
      });

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere.mockReturnValue({
        first: mockFirst,
      });

      (kmsService.decryptAccessToken as jest.Mock).mockRejectedValue(
        new Error('Decryption failed')
      );

      await expect(
        credentialEncryptionService.retrieveOAuthTokens(venueId, integrationType)
      ).rejects.toThrow('Failed to retrieve OAuth tokens');
    });
  });

  describe('storeApiKeys', () => {
    it('should store API keys with encryption', async () => {
      const venueId = 'venue-123';
      const integrationType = 'crm';
      const provider = 'mailchimp';
      const keys = {
        apiKey: 'api-key-123',
        keyName: 'primary',
        keyType: 'api_key',
        environment: 'production',
      };

      (kmsService.encryptApiKey as jest.Mock).mockResolvedValue({
        ciphertext: 'encrypted-api-key',
        keyId: 'key-id',
        encryptionContext: { venueId, integrationType },
      });

      const mockInsert = jest.fn().mockReturnThis();
      const mockOnConflict = jest.fn().mockReturnThis();
      const mockMerge = jest.fn().mockResolvedValue({});

      (db as unknown as jest.Mock).mockReturnValue({
        insert: mockInsert,
      });
      mockInsert.mockReturnValue({
        onConflict: mockOnConflict,
      });
      mockOnConflict.mockReturnValue({
        merge: mockMerge,
      });

      await credentialEncryptionService.storeApiKeys(
        venueId,
        integrationType,
        provider,
        keys
      );

      expect(kmsService.encryptApiKey).toHaveBeenCalledWith(
        'api-key-123',
        venueId,
        integrationType,
        'primary'
      );
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('retrieveApiKeys', () => {
    it('should retrieve and decrypt API keys', async () => {
      const venueId = 'venue-123';
      const integrationType = 'crm';
      const keyName = 'primary';

      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue({
        id: 1,
        api_key_encrypted: 'encrypted-key',
        key_name: keyName,
        key_type: 'api_key',
        environment: 'production',
      });

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere.mockReturnValue({
        first: mockFirst,
      });

      (kmsService.decryptApiKey as jest.Mock).mockResolvedValue('decrypted-api-key');

      // Mock update query
      const mockUpdate = jest.fn().mockResolvedValue({});
      mockWhere.mockReturnValueOnce({
        first: mockFirst,
      }).mockReturnValueOnce({
        update: mockUpdate,
      });

      const result = await credentialEncryptionService.retrieveApiKeys(
        venueId,
        integrationType,
        keyName
      );

      expect(result).toEqual({
        apiKey: 'decrypted-api-key',
        keyName,
        keyType: 'api_key',
        environment: 'production',
        apiSecret: undefined,
        webhookSecret: undefined,
      });
    });

    it('should return null if no API keys found', async () => {
      const venueId = 'venue-123';
      const integrationType = 'crm';
      const keyName = 'primary';

      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue(null);

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere.mockReturnValue({
        first: mockFirst,
      });

      const result = await credentialEncryptionService.retrieveApiKeys(
        venueId,
        integrationType,
        keyName
      );

      expect(result).toBeNull();
    });
  });

  describe('rotateOAuthTokens', () => {
    it('should rotate OAuth tokens', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';
      const newTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
      };

      // Mock storeOAuthTokens
      (kmsService.encryptAccessToken as jest.Mock).mockResolvedValue({
        ciphertext: 'encrypted-new-access',
        keyId: 'key-id',
        encryptionContext: {},
      });
      (kmsService.encryptRefreshToken as jest.Mock).mockResolvedValue({
        ciphertext: 'encrypted-new-refresh',
        keyId: 'key-id',
        encryptionContext: {},
      });

      const mockInsert = jest.fn().mockReturnThis();
      const mockOnConflict = jest.fn().mockReturnThis();
      const mockMerge = jest.fn().mockResolvedValue({});
      const mockWhere = jest.fn().mockReturnThis();
      const mockUpdate = jest.fn().mockResolvedValue({});

      (db as unknown as jest.Mock).mockReturnValue({
        insert: mockInsert,
        where: mockWhere,
      });
      mockInsert.mockReturnValue({
        onConflict: mockOnConflict,
      });
      mockOnConflict.mockReturnValue({
        merge: mockMerge,
      });
      mockWhere.mockReturnValue({
        update: mockUpdate,
      });

      await credentialEncryptionService.rotateOAuthTokens(
        venueId,
        integrationType,
        newTokens
      );

      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('deleteOAuthTokens', () => {
    it('should delete OAuth tokens', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';

      const mockWhere = jest.fn().mockReturnThis();
      const mockDelete = jest.fn().mockResolvedValue({ rowCount: 1 });

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere.mockReturnValue({
        delete: mockDelete,
      });

      await credentialEncryptionService.deleteOAuthTokens(venueId, integrationType);

      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('deleteApiKeys', () => {
    it('should delete API keys', async () => {
      const venueId = 'venue-123';
      const integrationType = 'crm';
      const keyName = 'primary';

      const mockWhere = jest.fn().mockReturnThis();
      const mockDelete = jest.fn().mockResolvedValue({ rowCount: 1 });

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere.mockReturnValue({
        delete: mockDelete,
      });

      await credentialEncryptionService.deleteApiKeys(venueId, integrationType, keyName);

      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('validateAndRotateIfNeeded', () => {
    it('should return true if token expiring soon', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';
      const expiresAt = new Date(Date.now() + 200 * 1000); // 3.3 minutes

      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue({
        id: 1,
        access_token_expires_at: expiresAt,
      });

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere.mockReturnValue({
        first: mockFirst,
      });

      const result = await credentialEncryptionService.validateAndRotateIfNeeded(
        venueId,
        integrationType
      );

      expect(result).toBe(true);
    });

    it('should return false if token is fresh', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';
      const expiresAt = new Date(Date.now() + 600 * 1000); // 10 minutes

      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue({
        id: 1,
        access_token_expires_at: expiresAt,
      });
      const mockUpdate = jest.fn().mockResolvedValue({});

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere
        .mockReturnValueOnce({
          first: mockFirst,
        })
        .mockReturnValueOnce({
          update: mockUpdate,
        });

      const result = await credentialEncryptionService.validateAndRotateIfNeeded(
        venueId,
        integrationType
      );

      expect(result).toBe(false);
      expect(mockUpdate).toHaveBeenCalled();
    });

    it('should return false if no token found', async () => {
      const venueId = 'venue-123';
      const integrationType = 'ticketing';

      const mockWhere = jest.fn().mockReturnThis();
      const mockFirst = jest.fn().mockResolvedValue(null);

      (db as unknown as jest.Mock).mockReturnValue({
        where: mockWhere,
      });
      mockWhere.mockReturnValue({
        first: mockFirst,
      });

      const result = await credentialEncryptionService.validateAndRotateIfNeeded(
        venueId,
        integrationType
      );

      expect(result).toBe(false);
    });
  });
});
