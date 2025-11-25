import { KMSService } from '../../../src/config/kms';

describe('KMSService', () => {
  let kmsService: KMSService;

  beforeEach(() => {
    // Reset environment for each test
    process.env.KMS_ENABLED = 'false'; // Use development mode for tests
    kmsService = new KMSService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('encrypt', () => {
    it('should encrypt plaintext in development mode', async () => {
      const plaintext = 'test-secret-token';
      const encryptionContext = {
        venueId: 'venue-123',
        integrationType: 'mailchimp',
        purpose: 'access_token',
      };

      const result = await kmsService.encrypt(plaintext, encryptionContext);

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('keyId', 'disabled');
      expect(result).toHaveProperty('encryptionContext');
      
      // In dev mode, ciphertext is base64 encoded
      const decoded = Buffer.from(result.ciphertext, 'base64').toString('utf-8');
      expect(decoded).toBe(plaintext);
    });

    it('should handle encryption without context', async () => {
      const plaintext = 'test-data';
      
      const result = await kmsService.encrypt(plaintext);

      expect(result).toHaveProperty('ciphertext');
      expect(result.keyId).toBe('disabled');
    });
  });

  describe('decrypt', () => {
    it('should decrypt ciphertext in development mode', async () => {
      const plaintext = 'test-secret-token';
      
      // First encrypt
      const encrypted = await kmsService.encrypt(plaintext);
      
      // Then decrypt
      const result = await kmsService.decrypt(encrypted.ciphertext);

      expect(result).toHaveProperty('plaintext', plaintext);
      expect(result).toHaveProperty('keyId', 'disabled');
    });

    it('should decrypt with encryption context', async () => {
      const plaintext = 'test-data';
      const encryptionContext = {
        venueId: 'venue-123',
        integrationType: 'mailchimp',
      };
      
      const encrypted = await kmsService.encrypt(plaintext, encryptionContext);
      const result = await kmsService.decrypt(encrypted.ciphertext, encryptionContext);

      expect(result.plaintext).toBe(plaintext);
    });
  });

  describe('encryptAccessToken', () => {
    it('should encrypt access token with proper context', async () => {
      const token = 'access-token-12345';
      const venueId = 'venue-123';
      const integrationType = 'mailchimp';

      const result = await kmsService.encryptAccessToken(token, venueId, integrationType);

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('keyId');
      
      const contextObj = JSON.parse(result.encryptionContext);
      expect(contextObj).toHaveProperty('venueId', venueId);
      expect(contextObj).toHaveProperty('integrationType', integrationType);
      expect(contextObj).toHaveProperty('purpose', 'access_token');
    });
  });

  describe('decryptAccessToken', () => {
    it('should decrypt access token', async () => {
      const token = 'access-token-12345';
      const venueId = 'venue-123';
      const integrationType = 'mailchimp';

      const encrypted = await kmsService.encryptAccessToken(token, venueId, integrationType);
      const decrypted = await kmsService.decryptAccessToken(
        encrypted.ciphertext,
        venueId,
        integrationType
      );

      expect(decrypted).toBe(token);
    });
  });

  describe('encryptRefreshToken', () => {
    it('should encrypt refresh token with proper context', async () => {
      const token = 'refresh-token-12345';
      const venueId = 'venue-123';
      const integrationType = 'mailchimp';

      const result = await kmsService.encryptRefreshToken(token, venueId, integrationType);

      const contextObj = JSON.parse(result.encryptionContext);
      expect(contextObj).toHaveProperty('purpose', 'refresh_token');
    });
  });

  describe('decryptRefreshToken', () => {
    it('should decrypt refresh token', async () => {
      const token = 'refresh-token-12345';
      const venueId = 'venue-123';
      const integrationType = 'mailchimp';

      const encrypted = await kmsService.encryptRefreshToken(token, venueId, integrationType);
      const decrypted = await kmsService.decryptRefreshToken(
        encrypted.ciphertext,
        venueId,
        integrationType
      );

      expect(decrypted).toBe(token);
    });
  });

  describe('encryptApiKey', () => {
    it('should encrypt API key with proper context', async () => {
      const apiKey = 'api-key-12345';
      const venueId = 'venue-123';
      const integrationType = 'mailchimp';
      const keyName = 'primary';

      const result = await kmsService.encryptApiKey(apiKey, venueId, integrationType, keyName);

      const contextObj = JSON.parse(result.encryptionContext);
      expect(contextObj).toHaveProperty('purpose', 'api_key');
      expect(contextObj).toHaveProperty('keyName', keyName);
    });
  });

  describe('decryptApiKey', () => {
    it('should decrypt API key', async () => {
      const apiKey = 'api-key-12345';
      const venueId = 'venue-123';
      const integrationType = 'mailchimp';
      const keyName = 'primary';

      const encrypted = await kmsService.encryptApiKey(apiKey, venueId, integrationType, keyName);
      const decrypted = await kmsService.decryptApiKey(
        encrypted.ciphertext,
        venueId,
        integrationType,
        keyName
      );

      expect(decrypted).toBe(apiKey);
    });
  });

  describe('encryptWebhookSecret', () => {
    it('should encrypt webhook secret with proper context', async () => {
      const secret = 'webhook-secret-12345';
      const venueId = 'venue-123';
      const integrationType = 'mailchimp';

      const result = await kmsService.encryptWebhookSecret(secret, venueId, integrationType);

      const contextObj = JSON.parse(result.encryptionContext);
      expect(contextObj).toHaveProperty('purpose', 'webhook_secret');
    });
  });

  describe('decryptWebhookSecret', () => {
    it('should decrypt webhook secret', async () => {
      const secret = 'webhook-secret-12345';
      const venueId = 'venue-123';
      const integrationType = 'mailchimp';

      const encrypted = await kmsService.encryptWebhookSecret(secret, venueId, integrationType);
      const decrypted = await kmsService.decryptWebhookSecret(
        encrypted.ciphertext,
        venueId,
        integrationType
      );

      expect(decrypted).toBe(secret);
    });
  });

  describe('isEnabled', () => {
    it('should return false in development mode', () => {
      expect(kmsService.isEnabled()).toBe(false);
    });

    it('should return true when KMS is enabled', () => {
      process.env.KMS_ENABLED = 'true';
      process.env.KMS_KEY_ID = 'arn:aws:kms:us-east-1:123456789:key/test';
      
      const enabledService = new KMSService();
      expect(enabledService.isEnabled()).toBe(true);
    });
  });

  describe('getDefaultKeyId', () => {
    it('should return disabled in development mode', () => {
      expect(kmsService.getDefaultKeyId()).toBe('disabled');
    });

    it('should return actual key ID when KMS is enabled', () => {
      process.env.KMS_ENABLED = 'true';
      const keyId = 'arn:aws:kms:us-east-1:123456789:key/test';
      process.env.KMS_KEY_ID = keyId;
      
      const enabledService = new KMSService();
      expect(enabledService.getDefaultKeyId()).toBe(keyId);
    });
  });
});
