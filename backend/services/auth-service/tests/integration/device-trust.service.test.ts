import { DeviceTrustService } from '../../src/services/device-trust.service';
import { pool } from '../../src/config/database';

/**
 * INTEGRATION TESTS FOR DEVICE TRUST SERVICE
 * 
 * These tests verify device trust functionality:
 * - Device fingerprint generation
 * - Trust score calculation based on age and activity
 * - Recording device activity in database
 * - Additional verification requirements
 */

// Safety check
beforeAll(() => {
  const dbName = process.env.DB_NAME || 'tickettoken_db';
  const isTestDb = dbName.includes('test') || process.env.NODE_ENV === 'test';
  
  if (!isTestDb) {
    throw new Error(
      `⚠️  REFUSING TO RUN INTEGRATION TESTS AGAINST NON-TEST DATABASE!\n` +
      `Current DB_NAME: ${dbName}\n` +
      `Please set DB_NAME to include 'test' or set NODE_ENV=test`
    );
  }
  
  console.log(`✓ Running device trust service integration tests against test environment`);
});

describe('DeviceTrustService Integration Tests', () => {
  let service: DeviceTrustService;
  let testUserId: string;
  const testUserIds: string[] = [];

  beforeAll(async () => {
    service = new DeviceTrustService();
    
    // Create test user
    const result = await pool.query(
      `INSERT INTO auth.users (email, password_hash, is_verified) 
       VALUES ($1, $2, $3) RETURNING id`,
      [`device-trust-test-${Date.now()}@example.com`, 'hash', true]
    );
    testUserId = result.rows[0].id;
    testUserIds.push(testUserId);
  });

  afterEach(async () => {
    // Clean up trusted_devices after each test
    await pool.query('DELETE FROM auth.trusted_devices WHERE user_id = ANY($1)', [testUserIds]);
  });

  afterAll(async () => {
    // Clean up test users
    await pool.query('DELETE FROM auth.users WHERE id = ANY($1)', [testUserIds]);
    await pool.end();
  });

  describe('generateFingerprint()', () => {
    it('should generate SHA256 hash from request components', () => {
      const request = {
        headers: {
          'user-agent': 'Mozilla/5.0',
          'accept-language': 'en-US',
          'accept-encoding': 'gzip, deflate'
        },
        ip: '192.168.1.1'
      };

      const fingerprint = service.generateFingerprint(request);

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(64); // SHA256 = 64 hex chars
      expect(/^[0-9a-f]{64}$/.test(fingerprint)).toBe(true);
    });

    it('should generate same fingerprint for same request', () => {
      const request = {
        headers: {
          'user-agent': 'Chrome/100',
          'accept-language': 'en',
          'accept-encoding': 'gzip'
        },
        ip: '10.0.0.1'
      };

      const fp1 = service.generateFingerprint(request);
      const fp2 = service.generateFingerprint(request);

      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different requests', () => {
      const request1 = {
        headers: {
          'user-agent': 'Chrome/100',
          'accept-language': 'en',
          'accept-encoding': 'gzip'
        },
        ip: '10.0.0.1'
      };

      const request2 = {
        headers: {
          'user-agent': 'Firefox/90',
          'accept-language': 'en',
          'accept-encoding': 'gzip'
        },
        ip: '10.0.0.1'
      };

      const fp1 = service.generateFingerprint(request1);
      const fp2 = service.generateFingerprint(request2);

      expect(fp1).not.toBe(fp2);
    });

    it('should handle missing headers gracefully', () => {
      const request = {
        headers: {},
        ip: '127.0.0.1'
      };

      const fingerprint = service.generateFingerprint(request);

      expect(fingerprint).toBeDefined();
      expect(fingerprint).toHaveLength(64);
    });

    it('should include IP address in fingerprint', () => {
      const request1 = {
        headers: {
          'user-agent': 'Chrome/100',
          'accept-language': 'en',
          'accept-encoding': 'gzip'
        },
        ip: '192.168.1.1'
      };

      const request2 = {
        headers: {
          'user-agent': 'Chrome/100',
          'accept-language': 'en',
          'accept-encoding': 'gzip'
        },
        ip: '192.168.1.2' // Different IP
      };

      const fp1 = service.generateFingerprint(request1);
      const fp2 = service.generateFingerprint(request2);

      expect(fp1).not.toBe(fp2);
    });
  });

  describe('calculateTrustScore()', () => {
    const fingerprint = 'test-fingerprint-123';

    it('should return 0 for unknown device', async () => {
      const score = await service.calculateTrustScore(testUserId, 'unknown-device');

      expect(score).toBe(0);
    });

    it('should return base score of 50 for new device', async () => {
      // Insert new device
      await pool.query(
        `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, last_seen)
         VALUES ($1, $2, 50, NOW())`,
        [testUserId, fingerprint]
      );

      const score = await service.calculateTrustScore(testUserId, fingerprint);

      expect(score).toBeGreaterThanOrEqual(50);
    });

    it('should add age bonus (up to 20 points)', async () => {
      // Insert device created 100 days ago
      await pool.query(
        `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, created_at, last_seen)
         VALUES ($1, $2, 50, NOW() - INTERVAL '100 days', NOW())`,
        [testUserId, fingerprint]
      );

      const score = await service.calculateTrustScore(testUserId, fingerprint);

      // Should have age bonus
      expect(score).toBeGreaterThan(50);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should add 30 points for activity < 1 day', async () => {
      // Insert device seen recently
      await pool.query(
        `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, last_seen)
         VALUES ($1, $2, 50, NOW())`,
        [testUserId, fingerprint]
      );

      const score = await service.calculateTrustScore(testUserId, fingerprint);

      // Should have recent activity bonus
      expect(score).toBeGreaterThanOrEqual(80); // 50 base + 30 recent
    });

    it('should add 20 points for activity 1-7 days', async () => {
      // Insert device seen 3 days ago
      await pool.query(
        `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, last_seen)
         VALUES ($1, $2, 50, NOW() - INTERVAL '3 days')`,
        [testUserId, fingerprint]
      );

      const score = await service.calculateTrustScore(testUserId, fingerprint);

      // Should have moderate activity bonus
      expect(score).toBeGreaterThanOrEqual(70); // 50 base + 20 moderate
    });

    it('should add 10 points for activity 7-30 days', async () => {
      // Insert device seen 15 days ago
      await pool.query(
        `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, last_seen)
         VALUES ($1, $2, 50, NOW() - INTERVAL '15 days')`,
        [testUserId, fingerprint]
      );

      const score = await service.calculateTrustScore(testUserId, fingerprint);

      // Should have low activity bonus
      expect(score).toBeGreaterThanOrEqual(60); // 50 base + 10 low
    });

    it('should cap score at 100', async () => {
      // Insert old, recently used device
      await pool.query(
        `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, created_at, last_seen)
         VALUES ($1, $2, 90, NOW() - INTERVAL '200 days', NOW())`,
        [testUserId, fingerprint]
      );

      const score = await service.calculateTrustScore(testUserId, fingerprint);

      expect(score).toBe(100);
    });
  });

  describe('recordDeviceActivity()', () => {
    const fingerprint = 'activity-test-fingerprint';

    describe('New device', () => {
      it('should insert new device with trust_score=50 on success', async () => {
        await service.recordDeviceActivity(testUserId, fingerprint, true);

        const result = await pool.query(
          'SELECT * FROM auth.trusted_devices WHERE user_id = $1 AND device_fingerprint = $2',
          [testUserId, fingerprint]
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].trust_score).toBe(50);
        expect(result.rows[0].last_seen).toBeDefined();
      });

      it('should insert new device with trust_score=0 on failure', async () => {
        await service.recordDeviceActivity(testUserId, fingerprint, false);

        const result = await pool.query(
          'SELECT * FROM auth.trusted_devices WHERE user_id = $1 AND device_fingerprint = $2',
          [testUserId, fingerprint]
        );

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].trust_score).toBe(0);
      });
    });

    describe('Existing device', () => {
      beforeEach(async () => {
        // Insert existing device
        await pool.query(
          `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, last_seen)
           VALUES ($1, $2, 50, NOW() - INTERVAL '1 day')`,
          [testUserId, fingerprint]
        );
      });

      it('should increase score by 5 on success (max 100)', async () => {
        await service.recordDeviceActivity(testUserId, fingerprint, true);

        const result = await pool.query(
          'SELECT trust_score FROM auth.trusted_devices WHERE user_id = $1 AND device_fingerprint = $2',
          [testUserId, fingerprint]
        );

        expect(result.rows[0].trust_score).toBe(55);
      });

      it('should decrease score by 10 on failure (min 0)', async () => {
        await service.recordDeviceActivity(testUserId, fingerprint, false);

        const result = await pool.query(
          'SELECT trust_score FROM auth.trusted_devices WHERE user_id = $1 AND device_fingerprint = $2',
          [testUserId, fingerprint]
        );

        expect(result.rows[0].trust_score).toBe(40);
      });

      it('should update last_seen timestamp', async () => {
        const beforeTime = new Date();
        
        await service.recordDeviceActivity(testUserId, fingerprint, true);

        const result = await pool.query(
          'SELECT last_seen FROM auth.trusted_devices WHERE user_id = $1 AND device_fingerprint = $2',
          [testUserId, fingerprint]
        );

        const lastSeen = new Date(result.rows[0].last_seen);
        expect(lastSeen.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 1000);
      });

      it('should cap score at 100', async () => {
        // Set score to 98
        await pool.query(
          'UPDATE auth.trusted_devices SET trust_score = 98 WHERE user_id = $1 AND device_fingerprint = $2',
          [testUserId, fingerprint]
        );

        await service.recordDeviceActivity(testUserId, fingerprint, true);

        const result = await pool.query(
          'SELECT trust_score FROM auth.trusted_devices WHERE user_id = $1 AND device_fingerprint = $2',
          [testUserId, fingerprint]
        );

        expect(result.rows[0].trust_score).toBe(100);
      });

      it('should floor score at 0', async () => {
        // Set score to 5
        await pool.query(
          'UPDATE auth.trusted_devices SET trust_score = 5 WHERE user_id = $1 AND device_fingerprint = $2',
          [testUserId, fingerprint]
        );

        await service.recordDeviceActivity(testUserId, fingerprint, false);

        const result = await pool.query(
          'SELECT trust_score FROM auth.trusted_devices WHERE user_id = $1 AND device_fingerprint = $2',
          [testUserId, fingerprint]
        );

        expect(result.rows[0].trust_score).toBe(0);
      });
    });
  });

  describe('requiresAdditionalVerification()', () => {
    const fingerprint = 'verification-test';

    it('should return true for unknown device (score 0)', async () => {
      const requires = await service.requiresAdditionalVerification(testUserId, 'unknown');

      expect(requires).toBe(true);
    });

    it('should return true when score < 30', async () => {
      await pool.query(
        `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, last_seen)
         VALUES ($1, $2, 25, NOW())`,
        [testUserId, fingerprint]
      );

      const requires = await service.requiresAdditionalVerification(testUserId, fingerprint);

      expect(requires).toBe(true);
    });

    it('should return false when score >= 30', async () => {
      await pool.query(
        `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, last_seen)
         VALUES ($1, $2, 80, NOW())`,
        [testUserId, fingerprint]
      );

      const requires = await service.requiresAdditionalVerification(testUserId, fingerprint);

      expect(requires).toBe(false);
    });

    it('should return false at threshold (score = 30)', async () => {
      await pool.query(
        `INSERT INTO auth.trusted_devices (user_id, device_fingerprint, trust_score, last_seen)
         VALUES ($1, $2, 30, NOW())`,
        [testUserId, fingerprint]
      );

      const requires = await service.requiresAdditionalVerification(testUserId, fingerprint);

      expect(requires).toBe(false);
    });
  });

  describe('Multiple users', () => {
    it('should track devices independently per user', async () => {
      const fingerprint = 'shared-device';
      
      // Create second user
      const result = await pool.query(
        `INSERT INTO auth.users (email, password_hash, is_verified) 
         VALUES ($1, $2, $3) RETURNING id`,
        [`device-trust-user2-${Date.now()}@example.com`, 'hash', true]
      );
      const user2Id = result.rows[0].id;
      testUserIds.push(user2Id);

      // Record activity for both users on same device
      await service.recordDeviceActivity(testUserId, fingerprint, true);
      await service.recordDeviceActivity(user2Id, fingerprint, false);

      // Check scores are independent
      const score1 = await service.calculateTrustScore(testUserId, fingerprint);
      const score2 = await service.calculateTrustScore(user2Id, fingerprint);

      expect(score1).toBeGreaterThan(score2);
    });
  });
});
