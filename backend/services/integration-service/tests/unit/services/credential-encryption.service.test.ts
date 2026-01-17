// Mock KMS service BEFORE imports
const mockEncryptAccessToken = jest.fn();
const mockEncryptRefreshToken = jest.fn();
const mockEncryptApiKey = jest.fn();
const mockEncryptApiSecret = jest.fn();
const mockEncryptWebhookSecret = jest.fn();
const mockEncrypt = jest.fn();
const mockDecryptAccessToken = jest.fn();
const mockDecryptRefreshToken = jest.fn();
const mockDecryptApiKey = jest.fn();
const mockDecryptApiSecret = jest.fn();
const mockDecryptWebhookSecret = jest.fn();
const mockDecrypt = jest.fn();

jest.mock('../../../src/config/kms', () => ({
  kmsService: {
    encryptAccessToken: mockEncryptAccessToken,
    encryptRefreshToken: mockEncryptRefreshToken,
    encryptApiKey: mockEncryptApiKey,
    encryptApiSecret: mockEncryptApiSecret,
    encryptWebhookSecret: mockEncryptWebhookSecret,
    encrypt: mockEncrypt,
    decryptAccessToken: mockDecryptAccessToken,
    decryptRefreshToken: mockDecryptRefreshToken,
    decryptApiKey: mockDecryptApiKey,
    decryptApiSecret: mockDecryptApiSecret,
    decryptWebhookSecret: mockDecryptWebhookSecret,
    decrypt: mockDecrypt,
  },
}));

// Mock database
const mockFirst = jest.fn();
const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockDelete = jest.fn();
const mockWhere = jest.fn();
const mockRaw = jest.fn();

const mockQueryBuilder = {
  where: mockWhere,
  first: mockFirst,
  update: mockUpdate,
  insert: mockInsert,
  delete: mockDelete,
};

mockWhere.mockReturnValue(mockQueryBuilder);

const mockDb: any = jest.fn(() => mockQueryBuilder);
mockDb.raw = mockRaw;

jest.mock('../../../src/config/database', () => ({
  db: mockDb,
}));

// Mock console
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(),
  warn: jest.spyOn(console, 'warn').mockImplementation(),
  error: jest.spyOn(console, 'error').mockImplementation(),
};

import {
  CredentialEncryptionService,
  OAuthTokens,
  ApiKeys,
} from '../../../src/services/credential-encryption.service';

describe('CredentialEncryptionService', () => {
  let service: CredentialEncryptionService;

  const venueId = 'venue-123';
  const integrationType = 'stripe';
  const provider = 'stripe';

  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnValue(mockQueryBuilder);
    service = new CredentialEncryptionService();

    // Default mock returns
    mockEncryptAccessToken.mockResolvedValue({
      ciphertext: 'encrypted-access-token',
      keyId: 'key-123',
      encryptionContext: { venueId, integrationType },
    });
    mockEncryptRefreshToken.mockResolvedValue({
      ciphertext: 'encrypted-refresh-token',
      keyId: 'key-123',
    });
    mockEncrypt.mockResolvedValue({
      ciphertext: 'encrypted-data',
    });
    mockDecryptAccessToken.mockResolvedValue('decrypted-access-token');
    mockDecryptRefreshToken.mockResolvedValue('decrypted-refresh-token');
    mockDecrypt.mockResolvedValue({ plaintext: 'decrypted-data' });
  });

  afterAll(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('storeOAuthTokens', () => {
    const tokens: OAuthTokens = {
      accessToken: 'access-token-xyz',
      refreshToken: 'refresh-token-xyz',
      idToken: 'id-token-xyz',
      expiresAt: new Date('2026-01-01'),
      refreshExpiresAt: new Date('2026-06-01'),
      scopes: ['read', 'write'],
      tokenType: 'Bearer',
    };

    it('should encrypt and insert new OAuth tokens', async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeOAuthTokens(venueId, integrationType, provider, tokens);

      expect(mockEncryptAccessToken).toHaveBeenCalledWith(
        tokens.accessToken,
        venueId,
        integrationType
      );
      expect(mockEncryptRefreshToken).toHaveBeenCalledWith(
        tokens.refreshToken,
        venueId,
        integrationType
      );
      expect(mockEncrypt).toHaveBeenCalledWith(tokens.idToken, {
        venueId,
        integrationType,
        purpose: 'id_token',
      });
      expect(mockDb).toHaveBeenCalledWith('oauth_tokens');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          integration_type: integrationType,
          provider,
          access_token_encrypted: 'encrypted-access-token',
          refresh_token_encrypted: 'encrypted-refresh-token',
          id_token_encrypted: 'encrypted-data',
          token_version: 1,
          validation_status: 'valid',
        })
      );
    });

    it('should update existing OAuth tokens', async () => {
      mockFirst.mockResolvedValue({ id: 'existing-id' });
      mockUpdate.mockResolvedValue(1);

      await service.storeOAuthTokens(venueId, integrationType, provider, tokens);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token_encrypted: 'encrypted-access-token',
          refresh_token_encrypted: 'encrypted-refresh-token',
          updated_at: expect.any(Date),
        })
      );
    });

    it('should handle tokens without refresh token', async () => {
      const tokensWithoutRefresh: OAuthTokens = {
        accessToken: 'access-only',
      };

      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeOAuthTokens(
        venueId,
        integrationType,
        provider,
        tokensWithoutRefresh
      );

      expect(mockEncryptRefreshToken).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          refresh_token_encrypted: undefined,
        })
      );
    });

    it('should handle tokens without id token', async () => {
      const tokensWithoutId: OAuthTokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };

      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeOAuthTokens(
        venueId,
        integrationType,
        provider,
        tokensWithoutId
      );

      expect(mockEncrypt).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id_token_encrypted: null,
        })
      );
    });

    it('should use default values for missing optional fields', async () => {
      const minimalTokens: OAuthTokens = {
        accessToken: 'access-token',
      };

      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeOAuthTokens(
        venueId,
        integrationType,
        provider,
        minimalTokens
      );

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          scopes: [],
          token_type: 'Bearer',
        })
      );
    });

    it('should throw error on encryption failure', async () => {
      mockEncryptAccessToken.mockRejectedValue(new Error('KMS error'));

      await expect(
        service.storeOAuthTokens(venueId, integrationType, provider, tokens)
      ).rejects.toThrow('Failed to store OAuth tokens: KMS error');

      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should log success message', async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeOAuthTokens(venueId, integrationType, provider, tokens);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('OAuth tokens stored securely')
      );
    });
  });

  describe('retrieveOAuthTokens', () => {
    const mockRecord = {
      id: 'token-id',
      access_token_encrypted: 'encrypted-access',
      refresh_token_encrypted: 'encrypted-refresh',
      id_token_encrypted: 'encrypted-id',
      access_token_expires_at: new Date('2026-01-01'),
      refresh_token_expires_at: new Date('2026-06-01'),
      scopes: ['read', 'write'],
      token_type: 'Bearer',
    };

    it('should retrieve and decrypt OAuth tokens', async () => {
      mockFirst.mockResolvedValue(mockRecord);

      const result = await service.retrieveOAuthTokens(venueId, integrationType);

      expect(mockDb).toHaveBeenCalledWith('oauth_tokens');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: venueId,
        integration_type: integrationType,
      });
      expect(mockDecryptAccessToken).toHaveBeenCalledWith(
        mockRecord.access_token_encrypted,
        venueId,
        integrationType
      );
      expect(mockDecryptRefreshToken).toHaveBeenCalledWith(
        mockRecord.refresh_token_encrypted,
        venueId,
        integrationType
      );
      expect(result).toEqual({
        accessToken: 'decrypted-access-token',
        refreshToken: 'decrypted-refresh-token',
        idToken: 'decrypted-data',
        expiresAt: mockRecord.access_token_expires_at,
        refreshExpiresAt: mockRecord.refresh_token_expires_at,
        scopes: ['read', 'write'],
        tokenType: 'Bearer',
      });
    });

    it('should return null when no tokens found', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await service.retrieveOAuthTokens(venueId, integrationType);

      expect(result).toBeNull();
    });

    it('should warn when tokens are expired', async () => {
      const expiredRecord = {
        ...mockRecord,
        access_token_expires_at: new Date('2020-01-01'),
      };
      mockFirst.mockResolvedValue(expiredRecord);

      await service.retrieveOAuthTokens(venueId, integrationType);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('Access token expired')
      );
    });

    it('should handle missing optional encrypted fields', async () => {
      const recordWithoutOptional = {
        ...mockRecord,
        refresh_token_encrypted: null,
        id_token_encrypted: null,
        scopes: null,
        token_type: null,
      };
      mockFirst.mockResolvedValue(recordWithoutOptional);

      const result = await service.retrieveOAuthTokens(venueId, integrationType);

      expect(result?.refreshToken).toBeUndefined();
      expect(result?.idToken).toBeUndefined();
      expect(result?.scopes).toEqual([]);
      expect(result?.tokenType).toBe('Bearer');
    });

    it('should throw error on decryption failure', async () => {
      mockFirst.mockResolvedValue(mockRecord);
      mockDecryptAccessToken.mockRejectedValue(new Error('Decryption failed'));

      await expect(
        service.retrieveOAuthTokens(venueId, integrationType)
      ).rejects.toThrow('Failed to retrieve OAuth tokens: Decryption failed');
    });
  });

  describe('storeApiKeys', () => {
    const keys: ApiKeys = {
      apiKey: 'sk_test_xxx',
      apiSecret: 'secret_xxx',
      webhookSecret: 'whsec_xxx',
      keyName: 'default',
      keyType: 'secret_key',
      environment: 'production',
    };

    beforeEach(() => {
      mockEncryptApiKey.mockResolvedValue({
        ciphertext: 'encrypted-api-key',
        keyId: 'key-123',
        encryptionContext: { venueId },
      });
      mockEncryptApiSecret.mockResolvedValue({
        ciphertext: 'encrypted-api-secret',
      });
      mockEncryptWebhookSecret.mockResolvedValue({
        ciphertext: 'encrypted-webhook-secret',
      });
    });

    it('should encrypt and insert new API keys', async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeApiKeys(venueId, integrationType, provider, keys);

      expect(mockEncryptApiKey).toHaveBeenCalledWith(
        keys.apiKey,
        venueId,
        integrationType,
        keys.keyName
      );
      expect(mockEncryptApiSecret).toHaveBeenCalledWith(
        keys.apiSecret,
        venueId,
        integrationType,
        keys.keyName
      );
      expect(mockEncryptWebhookSecret).toHaveBeenCalledWith(
        keys.webhookSecret,
        venueId,
        integrationType
      );
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          integration_type: integrationType,
          key_name: keys.keyName,
          api_key_encrypted: 'encrypted-api-key',
          api_secret_encrypted: 'encrypted-api-secret',
          webhook_secret_encrypted: 'encrypted-webhook-secret',
          status: 'active',
          key_version: 1,
        })
      );
    });

    it('should update existing API keys', async () => {
      mockFirst.mockResolvedValue({ id: 'existing-id' });
      mockUpdate.mockResolvedValue(1);

      await service.storeApiKeys(venueId, integrationType, provider, keys);

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          api_key_encrypted: 'encrypted-api-key',
          updated_at: expect.any(Date),
        })
      );
    });

    it('should handle keys without optional secrets', async () => {
      const keysWithoutSecrets: ApiKeys = {
        apiKey: 'key-only',
        keyName: 'default',
        keyType: 'api_key',
      };

      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);

      await service.storeApiKeys(
        venueId,
        integrationType,
        provider,
        keysWithoutSecrets
      );

      expect(mockEncryptApiSecret).not.toHaveBeenCalled();
      expect(mockEncryptWebhookSecret).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          api_secret_encrypted: null,
          webhook_secret_encrypted: null,
          environment: 'production', // default
        })
      );
    });

    it('should throw error on encryption failure', async () => {
      mockEncryptApiKey.mockRejectedValue(new Error('Encryption failed'));

      await expect(
        service.storeApiKeys(venueId, integrationType, provider, keys)
      ).rejects.toThrow('Failed to store API keys: Encryption failed');
    });
  });

  describe('retrieveApiKeys', () => {
    const keyName = 'default';
    const mockRecord = {
      id: 'key-id',
      api_key_encrypted: 'encrypted-key',
      api_secret_encrypted: 'encrypted-secret',
      webhook_secret_encrypted: 'encrypted-webhook',
      key_name: 'default',
      key_type: 'secret_key',
      environment: 'production',
      expires_at: null,
    };

    beforeEach(() => {
      mockDecryptApiKey.mockResolvedValue('decrypted-api-key');
      mockDecryptApiSecret.mockResolvedValue('decrypted-api-secret');
      mockDecryptWebhookSecret.mockResolvedValue('decrypted-webhook-secret');
      mockUpdate.mockResolvedValue(1);
    });

    it('should retrieve and decrypt API keys', async () => {
      mockFirst.mockResolvedValue(mockRecord);

      const result = await service.retrieveApiKeys(
        venueId,
        integrationType,
        keyName
      );

      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: venueId,
        integration_type: integrationType,
        key_name: keyName,
      });
      expect(result).toEqual({
        apiKey: 'decrypted-api-key',
        apiSecret: 'decrypted-api-secret',
        webhookSecret: 'decrypted-webhook-secret',
        keyName: 'default',
        keyType: 'secret_key',
        environment: 'production',
      });
    });

    it('should return null when no keys found', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await service.retrieveApiKeys(
        venueId,
        integrationType,
        keyName
      );

      expect(result).toBeNull();
    });

    it('should warn when keys are expired', async () => {
      const expiredRecord = {
        ...mockRecord,
        expires_at: new Date('2020-01-01'),
      };
      mockFirst.mockResolvedValue(expiredRecord);

      await service.retrieveApiKeys(venueId, integrationType, keyName);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('API key expired')
      );
    });

    it('should update usage statistics', async () => {
      mockFirst.mockResolvedValue(mockRecord);

      await service.retrieveApiKeys(venueId, integrationType, keyName);

      expect(mockUpdate).toHaveBeenCalledWith({
        last_used_at: expect.any(Date),
        usage_count_24h: mockDb.raw('usage_count_24h + 1'),
        usage_count_30d: mockDb.raw('usage_count_30d + 1'),
      });
    });

    it('should handle missing optional secrets', async () => {
      const recordWithoutSecrets = {
        ...mockRecord,
        api_secret_encrypted: null,
        webhook_secret_encrypted: null,
      };
      mockFirst.mockResolvedValue(recordWithoutSecrets);

      const result = await service.retrieveApiKeys(
        venueId,
        integrationType,
        keyName
      );

      expect(result?.apiSecret).toBeUndefined();
      expect(result?.webhookSecret).toBeUndefined();
    });

    it('should throw error on decryption failure', async () => {
      mockFirst.mockResolvedValue(mockRecord);
      mockDecryptApiKey.mockRejectedValue(new Error('Decryption failed'));

      await expect(
        service.retrieveApiKeys(venueId, integrationType, keyName)
      ).rejects.toThrow('Failed to retrieve API keys: Decryption failed');
    });
  });

  describe('rotateOAuthTokens', () => {
    const newTokens: OAuthTokens = {
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    };

    it('should store new tokens and update rotation timestamp', async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);
      mockUpdate.mockResolvedValue(1);

      await service.rotateOAuthTokens(venueId, integrationType, newTokens);

      // Should call storeOAuthTokens
      expect(mockEncryptAccessToken).toHaveBeenCalled();

      // Should update rotation timestamp
      expect(mockUpdate).toHaveBeenCalledWith({
        last_rotated_at: expect.any(Date),
        token_version: mockDb.raw('token_version + 1'),
      });
    });

    it('should throw error on rotation failure', async () => {
      mockEncryptAccessToken.mockRejectedValue(new Error('Rotation failed'));

      await expect(
        service.rotateOAuthTokens(venueId, integrationType, newTokens)
      ).rejects.toThrow('Failed to rotate OAuth tokens');
    });
  });

  describe('rotateApiKeys', () => {
    const keyName = 'default';
    const newKeys: ApiKeys = {
      apiKey: 'new-api-key',
      keyName: 'default',
      keyType: 'secret_key',
    };

    beforeEach(() => {
      mockEncryptApiKey.mockResolvedValue({
        ciphertext: 'encrypted',
        keyId: 'key-123',
        encryptionContext: {},
      });
    });

    it('should store new keys and update rotation timestamp', async () => {
      mockFirst.mockResolvedValue(null);
      mockInsert.mockResolvedValue([1]);
      mockUpdate.mockResolvedValue(1);

      await service.rotateApiKeys(venueId, integrationType, keyName, newKeys);

      expect(mockEncryptApiKey).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith({
        last_rotated_at: expect.any(Date),
        key_version: mockDb.raw('key_version + 1'),
      });
    });

    it('should throw error on rotation failure', async () => {
      mockEncryptApiKey.mockRejectedValue(new Error('Rotation failed'));

      await expect(
        service.rotateApiKeys(venueId, integrationType, keyName, newKeys)
      ).rejects.toThrow('Failed to rotate API keys');
    });
  });

  describe('deleteOAuthTokens', () => {
    it('should delete OAuth tokens', async () => {
      mockDelete.mockResolvedValue(1);

      await service.deleteOAuthTokens(venueId, integrationType);

      expect(mockDb).toHaveBeenCalledWith('oauth_tokens');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: venueId,
        integration_type: integrationType,
      });
      expect(mockDelete).toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('OAuth tokens deleted')
      );
    });

    it('should throw error on deletion failure', async () => {
      mockDelete.mockRejectedValue(new Error('Delete failed'));

      await expect(
        service.deleteOAuthTokens(venueId, integrationType)
      ).rejects.toThrow('Failed to delete OAuth tokens: Delete failed');
    });
  });

  describe('deleteApiKeys', () => {
    const keyName = 'default';

    it('should delete API keys', async () => {
      mockDelete.mockResolvedValue(1);

      await service.deleteApiKeys(venueId, integrationType, keyName);

      expect(mockDb).toHaveBeenCalledWith('venue_api_keys');
      expect(mockWhere).toHaveBeenCalledWith({
        venue_id: venueId,
        integration_type: integrationType,
        key_name: keyName,
      });
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should throw error on deletion failure', async () => {
      mockDelete.mockRejectedValue(new Error('Delete failed'));

      await expect(
        service.deleteApiKeys(venueId, integrationType, keyName)
      ).rejects.toThrow('Failed to delete API keys: Delete failed');
    });
  });

  describe('validateAndRotateIfNeeded', () => {
    it('should return false when no tokens found', async () => {
      mockFirst.mockResolvedValue(null);

      const result = await service.validateAndRotateIfNeeded(
        venueId,
        integrationType
      );

      expect(result).toBe(false);
    });

    it('should return true when token expires within 5 minutes', async () => {
      const soonExpiring = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
      mockFirst.mockResolvedValue({
        id: 'token-id',
        access_token_expires_at: soonExpiring,
      });

      const result = await service.validateAndRotateIfNeeded(
        venueId,
        integrationType
      );

      expect(result).toBe(true);
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('rotation needed')
      );
    });

    it('should return false and update validation when token is valid', async () => {
      const farExpiring = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      mockFirst.mockResolvedValue({
        id: 'token-id',
        access_token_expires_at: farExpiring,
      });
      mockUpdate.mockResolvedValue(1);

      const result = await service.validateAndRotateIfNeeded(
        venueId,
        integrationType
      );

      expect(result).toBe(false);
      expect(mockUpdate).toHaveBeenCalledWith({
        last_validated_at: expect.any(Date),
        validation_status: 'valid',
      });
    });

    it('should return true on error (assume rotation needed)', async () => {
      mockFirst.mockRejectedValue(new Error('Database error'));

      const result = await service.validateAndRotateIfNeeded(
        venueId,
        integrationType
      );

      expect(result).toBe(true);
    });
  });
});

describe('credentialEncryptionService singleton', () => {
  it('should export singleton instance', async () => {
    const { credentialEncryptionService } = await import(
      '../../../src/services/credential-encryption.service'
    );
    expect(credentialEncryptionService).toBeInstanceOf(CredentialEncryptionService);
  });
});
