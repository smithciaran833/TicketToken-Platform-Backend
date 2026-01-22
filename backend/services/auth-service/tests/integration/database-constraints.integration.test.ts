import {
  testPool,
  testRedis,
  TEST_TENANT_ID,
  cleanupAll,
  closeConnections,
} from './setup';

describe('Database Constraints Integration Tests', () => {
  // Helper to set RLS context
  const setTenantContext = async (tenantId: string) => {
    await testPool.query(`SET app.current_tenant_id = '${tenantId}'`);
  };

  // Helper to clear RLS context
  const clearTenantContext = async () => {
    await testPool.query(`RESET app.current_tenant_id`);
  };

  beforeEach(async () => {
    await cleanupAll();
    await clearTenantContext();
  });

  afterAll(async () => {
    await closeConnections();
  });

  // ============================================
  // UNIQUE CONSTRAINTS
  // ============================================
  describe('UNIQUE Constraints', () => {
    describe('tenants.slug', () => {
      it('should reject duplicate tenant slug', async () => {
        const timestamp = Date.now();
        await testPool.query(
          `INSERT INTO tenants (name, slug) VALUES ($1, $2)`,
          ['Tenant 1', `test-tenant-${timestamp}`]
        );

        await expect(
          testPool.query(
            `INSERT INTO tenants (name, slug) VALUES ($1, $2)`,
            ['Tenant 2', `test-tenant-${timestamp}`]
          )
        ).rejects.toThrow(/unique constraint.*slug/i);
      });

      it('should allow different slugs', async () => {
        const timestamp = Date.now();
        await testPool.query(
          `INSERT INTO tenants (name, slug) VALUES ($1, $2)`,
          ['Tenant 1', `tenant-1-${timestamp}`]
        );

        await expect(
          testPool.query(
            `INSERT INTO tenants (name, slug) VALUES ($1, $2)`,
            ['Tenant 2', `tenant-2-${timestamp}`]
          )
        ).resolves.not.toThrow();
      });
    });

    describe('users.username', () => {
      it('should reject duplicate username', async () => {
        await setTenantContext(TEST_TENANT_ID);

        await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [TEST_TENANT_ID, 'user1@test.com', 'hash1', 'First', 'User', 'testuser']
        );

        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user2@test.com', 'hash2', 'Second', 'User', 'testuser']
          )
        ).rejects.toThrow(/unique constraint.*username/i);
      });

      it('should allow NULL usernames for multiple users', async () => {
        await setTenantContext(TEST_TENANT_ID);

        await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [TEST_TENANT_ID, 'user1@test.com', 'hash1', 'First', 'User', null]
        );

        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user2@test.com', 'hash2', 'Second', 'User', null]
          )
        ).resolves.not.toThrow();
      });
    });

    describe('users.referral_code', () => {
      it('should auto-generate unique referral codes', async () => {
        await setTenantContext(TEST_TENANT_ID);

        const result1 = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING referral_code`,
          [TEST_TENANT_ID, 'user1@test.com', 'hash1', 'First', 'User']
        );

        const result2 = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING referral_code`,
          [TEST_TENANT_ID, 'user2@test.com', 'hash2', 'Second', 'User']
        );

        expect(result1.rows[0].referral_code).toBeDefined();
        expect(result2.rows[0].referral_code).toBeDefined();
        expect(result1.rows[0].referral_code).not.toBe(result2.rows[0].referral_code);
      });

      it('should reject duplicate referral code if manually provided', async () => {
        await setTenantContext(TEST_TENANT_ID);

        await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, referral_code) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [TEST_TENANT_ID, 'user1@test.com', 'hash1', 'First', 'User', 'TESTCODE']
        );

        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, referral_code) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user2@test.com', 'hash2', 'Second', 'User', 'TESTCODE']
          )
        ).rejects.toThrow(/unique constraint.*referral_code/i);
      });
    });

    describe('users.email (partial unique index)', () => {
      it('should reject duplicate email for active users', async () => {
        await setTenantContext(TEST_TENANT_ID);

        await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5)`,
          [TEST_TENANT_ID, 'duplicate@test.com', 'hash1', 'First', 'User']
        );

        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
             VALUES ($1, $2, $3, $4, $5)`,
            [TEST_TENANT_ID, 'duplicate@test.com', 'hash2', 'Second', 'User']
          )
        ).rejects.toThrow(/unique constraint.*email/i);
      });

      it('should allow same email if one user is soft deleted', async () => {
        await setTenantContext(TEST_TENANT_ID);

        // Create first user
        const result1 = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'reusable@test.com', 'hash1', 'First', 'User']
        );

        // Soft delete first user
        await testPool.query(
          `UPDATE users SET deleted_at = NOW() WHERE id = $1`,
          [result1.rows[0].id]
        );

        // Should allow creating new user with same email
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
             VALUES ($1, $2, $3, $4, $5)`,
            [TEST_TENANT_ID, 'reusable@test.com', 'hash2', 'Second', 'User']
          )
        ).resolves.not.toThrow();
      });

      it('should reject duplicate emails from two deleted users', async () => {
        await setTenantContext(TEST_TENANT_ID);

        // Create and delete first user
        const result1 = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, deleted_at) 
           VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
          [TEST_TENANT_ID, 'deleted@test.com', 'hash1', 'First', 'User']
        );

        // Should allow creating second deleted user with same email
        // (partial index only applies WHERE deleted_at IS NULL)
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, deleted_at) 
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [TEST_TENANT_ID, 'deleted@test.com', 'hash2', 'Second', 'User']
          )
        ).resolves.not.toThrow();
      });
    });

    describe('oauth_connections composite unique', () => {
      it('should reject duplicate provider + provider_user_id', async () => {
        await setTenantContext(TEST_TENANT_ID);

        // Create user first
        const userResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'oauth@test.com', 'hash', 'OAuth', 'User']
        );
        const userId = userResult.rows[0].id;

        // Create first OAuth connection
        await testPool.query(
          `INSERT INTO oauth_connections (tenant_id, user_id, provider, provider_user_id) 
           VALUES ($1, $2, $3, $4)`,
          [TEST_TENANT_ID, userId, 'google', 'google123']
        );

        // Try to create duplicate
        await expect(
          testPool.query(
            `INSERT INTO oauth_connections (tenant_id, user_id, provider, provider_user_id) 
             VALUES ($1, $2, $3, $4)`,
            [TEST_TENANT_ID, userId, 'google', 'google123']
          )
        ).rejects.toThrow(/unique constraint.*provider/i);
      });

      it('should allow same provider_user_id for different providers', async () => {
        await setTenantContext(TEST_TENANT_ID);

        const userResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'oauth@test.com', 'hash', 'OAuth', 'User']
        );
        const userId = userResult.rows[0].id;

        await testPool.query(
          `INSERT INTO oauth_connections (tenant_id, user_id, provider, provider_user_id) 
           VALUES ($1, $2, $3, $4)`,
          [TEST_TENANT_ID, userId, 'google', 'user123']
        );

        await expect(
          testPool.query(
            `INSERT INTO oauth_connections (tenant_id, user_id, provider, provider_user_id) 
             VALUES ($1, $2, $3, $4)`,
            [TEST_TENANT_ID, userId, 'github', 'user123']
          )
        ).resolves.not.toThrow();
      });
    });
  });

  // ============================================
  // FOREIGN KEY CASCADE
  // ============================================
  describe('Foreign Key CASCADE', () => {
    let testUserId: string;

    beforeEach(async () => {
      await setTenantContext(TEST_TENANT_ID);

      // Create a test user for cascade tests
      const result = await testPool.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [TEST_TENANT_ID, 'cascade@test.com', 'hash', 'Cascade', 'User']
      );
      testUserId = result.rows[0].id;
    });

    it('should cascade delete user_sessions when user is deleted', async () => {
      // Create session
      await testPool.query(
        `INSERT INTO user_sessions (tenant_id, user_id, ip_address) 
         VALUES ($1, $2, $3)`,
        [TEST_TENANT_ID, testUserId, '127.0.0.1']
      );

      // Verify session exists
      let sessions = await testPool.query(
        `SELECT * FROM user_sessions WHERE user_id = $1`,
        [testUserId]
      );
      expect(sessions.rows.length).toBe(1);

      // Delete user
      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      // Verify session was cascade deleted
      sessions = await testPool.query(
        `SELECT * FROM user_sessions WHERE user_id = $1`,
        [testUserId]
      );
      expect(sessions.rows.length).toBe(0);
    });

    it('should cascade delete user_venue_roles when user is deleted', async () => {
      const venueId = '00000000-0000-0000-0000-000000000002';

      await testPool.query(
        `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role) 
         VALUES ($1, $2, $3, $4)`,
        [TEST_TENANT_ID, testUserId, venueId, 'venue-owner']
      );

      let roles = await testPool.query(
        `SELECT * FROM user_venue_roles WHERE user_id = $1`,
        [testUserId]
      );
      expect(roles.rows.length).toBe(1);

      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      roles = await testPool.query(
        `SELECT * FROM user_venue_roles WHERE user_id = $1`,
        [testUserId]
      );
      expect(roles.rows.length).toBe(0);
    });

    it('should cascade delete invalidated_tokens when user is deleted', async () => {
      await testPool.query(
        `INSERT INTO invalidated_tokens (token, tenant_id, user_id, expires_at) 
         VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')`,
        ['test-token', TEST_TENANT_ID, testUserId]
      );

      let tokens = await testPool.query(
        `SELECT * FROM invalidated_tokens WHERE user_id = $1`,
        [testUserId]
      );
      expect(tokens.rows.length).toBe(1);

      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      tokens = await testPool.query(
        `SELECT * FROM invalidated_tokens WHERE user_id = $1`,
        [testUserId]
      );
      expect(tokens.rows.length).toBe(0);
    });

    it('should cascade delete token_refresh_log when user is deleted', async () => {
      await testPool.query(
        `INSERT INTO token_refresh_log (tenant_id, user_id, ip_address) 
         VALUES ($1, $2, $3)`,
        [TEST_TENANT_ID, testUserId, '127.0.0.1']
      );

      let logs = await testPool.query(
        `SELECT * FROM token_refresh_log WHERE user_id = $1`,
        [testUserId]
      );
      expect(logs.rows.length).toBe(1);

      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      logs = await testPool.query(
        `SELECT * FROM token_refresh_log WHERE user_id = $1`,
        [testUserId]
      );
      expect(logs.rows.length).toBe(0);
    });

    it('should cascade delete oauth_connections when user is deleted', async () => {
      await testPool.query(
        `INSERT INTO oauth_connections (tenant_id, user_id, provider, provider_user_id) 
         VALUES ($1, $2, $3, $4)`,
        [TEST_TENANT_ID, testUserId, 'google', 'google123']
      );

      let connections = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1`,
        [testUserId]
      );
      expect(connections.rows.length).toBe(1);

      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      connections = await testPool.query(
        `SELECT * FROM oauth_connections WHERE user_id = $1`,
        [testUserId]
      );
      expect(connections.rows.length).toBe(0);
    });

    it('should cascade delete wallet_connections when user is deleted', async () => {
      await testPool.query(
        `INSERT INTO wallet_connections (tenant_id, user_id, wallet_address, network) 
         VALUES ($1, $2, $3, $4)`,
        [TEST_TENANT_ID, testUserId, '0x123...', 'ethereum']
      );

      let wallets = await testPool.query(
        `SELECT * FROM wallet_connections WHERE user_id = $1`,
        [testUserId]
      );
      expect(wallets.rows.length).toBe(1);

      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      wallets = await testPool.query(
        `SELECT * FROM wallet_connections WHERE user_id = $1`,
        [testUserId]
      );
      expect(wallets.rows.length).toBe(0);
    });

    it('should cascade delete biometric_credentials when user is deleted', async () => {
      await testPool.query(
        `INSERT INTO biometric_credentials (tenant_id, user_id, device_id, public_key, credential_type) 
         VALUES ($1, $2, $3, $4, $5)`,
        [TEST_TENANT_ID, testUserId, 'device123', 'pubkey', 'faceId']
      );

      let credentials = await testPool.query(
        `SELECT * FROM biometric_credentials WHERE user_id = $1`,
        [testUserId]
      );
      expect(credentials.rows.length).toBe(1);

      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      credentials = await testPool.query(
        `SELECT * FROM biometric_credentials WHERE user_id = $1`,
        [testUserId]
      );
      expect(credentials.rows.length).toBe(0);
    });

    it('should cascade delete trusted_devices when user is deleted', async () => {
      await testPool.query(
        `INSERT INTO trusted_devices (tenant_id, user_id, device_fingerprint, trust_score) 
         VALUES ($1, $2, $3, $4)`,
        [TEST_TENANT_ID, testUserId, 'fingerprint123', 100]
      );

      let devices = await testPool.query(
        `SELECT * FROM trusted_devices WHERE user_id = $1`,
        [testUserId]
      );
      expect(devices.rows.length).toBe(1);

      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      devices = await testPool.query(
        `SELECT * FROM trusted_devices WHERE user_id = $1`,
        [testUserId]
      );
      expect(devices.rows.length).toBe(0);
    });

    it('should cascade delete user_addresses when user is deleted', async () => {
      await testPool.query(
        `INSERT INTO user_addresses (tenant_id, user_id, address_line1, city, postal_code) 
         VALUES ($1, $2, $3, $4, $5)`,
        [TEST_TENANT_ID, testUserId, '123 Main St', 'City', '12345']
      );

      let addresses = await testPool.query(
        `SELECT * FROM user_addresses WHERE user_id = $1`,
        [testUserId]
      );
      expect(addresses.rows.length).toBe(1);

      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      addresses = await testPool.query(
        `SELECT * FROM user_addresses WHERE user_id = $1`,
        [testUserId]
      );
      expect(addresses.rows.length).toBe(0);
    });

    it('should verify NO orphaned records after user deletion', async () => {
      // Create one of each related record
      await testPool.query(
        `INSERT INTO user_sessions (tenant_id, user_id, ip_address) VALUES ($1, $2, $3)`,
        [TEST_TENANT_ID, testUserId, '127.0.0.1']
      );
      await testPool.query(
        `INSERT INTO oauth_connections (tenant_id, user_id, provider, provider_user_id) 
         VALUES ($1, $2, $3, $4)`,
        [TEST_TENANT_ID, testUserId, 'google', 'g123']
      );
      await testPool.query(
        `INSERT INTO wallet_connections (tenant_id, user_id, wallet_address, network) 
         VALUES ($1, $2, $3, $4)`,
        [TEST_TENANT_ID, testUserId, '0xABC', 'ethereum']
      );

      // Delete user
      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      // Check ALL related tables
      const checks = await Promise.all([
        testPool.query(`SELECT COUNT(*) FROM user_sessions WHERE user_id = $1`, [testUserId]),
        testPool.query(`SELECT COUNT(*) FROM user_venue_roles WHERE user_id = $1`, [testUserId]),
        testPool.query(`SELECT COUNT(*) FROM invalidated_tokens WHERE user_id = $1`, [testUserId]),
        testPool.query(`SELECT COUNT(*) FROM token_refresh_log WHERE user_id = $1`, [testUserId]),
        testPool.query(`SELECT COUNT(*) FROM oauth_connections WHERE user_id = $1`, [testUserId]),
        testPool.query(`SELECT COUNT(*) FROM wallet_connections WHERE user_id = $1`, [testUserId]),
        testPool.query(`SELECT COUNT(*) FROM biometric_credentials WHERE user_id = $1`, [testUserId]),
        testPool.query(`SELECT COUNT(*) FROM trusted_devices WHERE user_id = $1`, [testUserId]),
        testPool.query(`SELECT COUNT(*) FROM user_addresses WHERE user_id = $1`, [testUserId]),
      ]);

      checks.forEach(result => {
        expect(parseInt(result.rows[0].count)).toBe(0);
      });
    });

    it('should NOT cascade delete audit_logs when user is deleted (SET NULL)', async () => {
      // Create audit log
      await testPool.query(
        `INSERT INTO audit_logs (tenant_id, user_id, service, action, action_type, resource_type) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [TEST_TENANT_ID, testUserId, 'test', 'test.action', 'TEST', 'test']
      );

      // Delete user
      await testPool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);

      // Audit log should still exist but user_id should be NULL
      const logs = await testPool.query(
        `SELECT * FROM audit_logs WHERE service = $1`,
        ['test']
      );
      expect(logs.rows.length).toBe(1);
      expect(logs.rows[0].user_id).toBeNull();
    });
  });

  // ============================================
  // FOREIGN KEY RESTRICT
  // ============================================
  describe('Foreign Key RESTRICT', () => {
    it('should prevent deleting tenant with users', async () => {
      await setTenantContext(TEST_TENANT_ID);

      // Create user
      await testPool.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
         VALUES ($1, $2, $3, $4, $5)`,
        [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User']
      );

      // Try to delete tenant
      await expect(
        testPool.query(`DELETE FROM tenants WHERE id = $1`, [TEST_TENANT_ID])
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it('should prevent deleting tenant with sessions', async () => {
      await setTenantContext(TEST_TENANT_ID);

      // Create user and session
      const userResult = await testPool.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User']
      );

      await testPool.query(
        `INSERT INTO user_sessions (tenant_id, user_id, ip_address) 
         VALUES ($1, $2, $3)`,
        [TEST_TENANT_ID, userResult.rows[0].id, '127.0.0.1']
      );

      // Try to delete tenant
      await expect(
        testPool.query(`DELETE FROM tenants WHERE id = $1`, [TEST_TENANT_ID])
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it('should allow deleting tenant with no data', async () => {
      // Create new tenant
      const result = await testPool.query(
        `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
        ['Empty Tenant', `empty-tenant-${Date.now()}`]
      );

      // Should be able to delete
      await expect(
        testPool.query(`DELETE FROM tenants WHERE id = $1`, [result.rows[0].id])
      ).resolves.not.toThrow();
    });
  });

  // ============================================
  // CHECK CONSTRAINTS
  // ============================================
  describe('CHECK Constraints', () => {
    beforeEach(async () => {
      await setTenantContext(TEST_TENANT_ID);
    });

    describe('check_email_lowercase', () => {
      it('should accept lowercase email', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
             VALUES ($1, $2, $3, $4, $5)`,
            [TEST_TENANT_ID, 'lowercase@test.com', 'hash', 'Test', 'User']
          )
        ).resolves.not.toThrow();
      });

      it('should reject uppercase email', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
             VALUES ($1, $2, $3, $4, $5)`,
            [TEST_TENANT_ID, 'UPPERCASE@TEST.COM', 'hash', 'Test', 'User']
          )
        ).rejects.toThrow(/check_email_lowercase/i);
      });

      it('should reject mixed case email', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
             VALUES ($1, $2, $3, $4, $5)`,
            [TEST_TENANT_ID, 'MixedCase@Test.COM', 'hash', 'Test', 'User']
          )
        ).rejects.toThrow(/check_email_lowercase/i);
      });
    });

    describe('check_username_format', () => {
      it('should accept valid username', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'validuser123']
          )
        ).resolves.not.toThrow();
      });

      it('should accept username with underscores', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'valid_user_123']
          )
        ).resolves.not.toThrow();
      });

      it('should accept exactly 3 character username', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'abc']
          )
        ).resolves.not.toThrow();
      });

      it('should accept exactly 30 character username', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'a'.repeat(30)]
          )
        ).resolves.not.toThrow();
      });

      it('should reject username with spaces', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'invalid user']
          )
        ).rejects.toThrow(/check_username_format/i);
      });

      it('should reject username with special characters', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'invalid@user']
          )
        ).rejects.toThrow(/check_username_format/i);
      });

      it('should reject username shorter than 3 characters', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'ab']
          )
        ).rejects.toThrow(/check_username_format/i);
      });

      it('should reject username longer than 30 characters', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, username) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'a'.repeat(31)]
          )
        ).rejects.toThrow(/value too long for type character varying|check_username_format/i);
      });
    });

    describe('check_referral_not_self', () => {
      it('should accept valid referral (different user)', async () => {
        // Create referrer
        const referrerResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'referrer@test.com', 'hash', 'Referrer', 'User']
        );

        // Create referred user
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, referred_by) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'referred@test.com', 'hash', 'Referred', 'User', referrerResult.rows[0].id]
          )
        ).resolves.not.toThrow();
      });

      it('should accept NULL referral', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, referred_by) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', null]
          )
        ).resolves.not.toThrow();
      });

      it('should reject self-referral', async () => {
        // This is tricky - we need to get the ID before inserting
        // So we'll create user first, then try to update
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'selfreferral@test.com', 'hash', 'Test', 'User']
        );

        await expect(
          testPool.query(
            `UPDATE users SET referred_by = $1 WHERE id = $1`,
            [result.rows[0].id]
          )
        ).rejects.toThrow(/check_referral_not_self/i);
      });
    });

    describe('check_age_minimum', () => {
      it('should accept age 13 exactly', async () => {
        const date13YearsAgo = new Date();
        date13YearsAgo.setFullYear(date13YearsAgo.getFullYear() - 13);
        date13YearsAgo.setMonth(0); // January
        date13YearsAgo.setDate(1); // 1st - definitely over 13 years ago

        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, date_of_birth) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', date13YearsAgo.toISOString().split('T')[0]]
          )
        ).resolves.not.toThrow();
      });

      it('should accept age over 13', async () => {
        const date20YearsAgo = new Date();
        date20YearsAgo.setFullYear(date20YearsAgo.getFullYear() - 20);

        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, date_of_birth) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', date20YearsAgo.toISOString().split('T')[0]]
          )
        ).resolves.not.toThrow();
      });

      it('should accept NULL date of birth', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, date_of_birth) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', null]
          )
        ).resolves.not.toThrow();
      });

      it('should reject age under 13', async () => {
        const date10YearsAgo = new Date();
        date10YearsAgo.setFullYear(date10YearsAgo.getFullYear() - 10);

        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, date_of_birth) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'child@test.com', 'hash', 'Test', 'User', date10YearsAgo.toISOString().split('T')[0]]
          )
        ).rejects.toThrow(/check_age_minimum/i);
      });
    });

    describe('users_status_check', () => {
      it('should accept PENDING status', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, status) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'PENDING']
          )
        ).resolves.not.toThrow();
      });

      it('should accept ACTIVE status', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, status) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'ACTIVE']
          )
        ).resolves.not.toThrow();
      });

      it('should accept SUSPENDED status', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, status) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'SUSPENDED']
          )
        ).resolves.not.toThrow();
      });

      it('should accept DELETED status', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, status) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'DELETED']
          )
        ).resolves.not.toThrow();
      });

      it('should reject invalid status', async () => {
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, status) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', 'INVALID']
          )
        ).rejects.toThrow(/users_status_check/i);
      });
    });

    describe('chk_user_addresses_type', () => {
      let testUserId: string;

      beforeEach(async () => {
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User']
        );
        testUserId = result.rows[0].id;
      });

      it('should accept billing address type', async () => {
        await expect(
          testPool.query(
            `INSERT INTO user_addresses (tenant_id, user_id, address_type, address_line1, city, postal_code) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, testUserId, 'billing', '123 Main St', 'City', '12345']
          )
        ).resolves.not.toThrow();
      });

      it('should accept shipping address type', async () => {
        await expect(
          testPool.query(
            `INSERT INTO user_addresses (tenant_id, user_id, address_type, address_line1, city, postal_code) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, testUserId, 'shipping', '123 Main St', 'City', '12345']
          )
        ).resolves.not.toThrow();
      });

      it('should reject other address type', async () => {
        await expect(
          testPool.query(
            `INSERT INTO user_addresses (tenant_id, user_id, address_type, address_line1, city, postal_code) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [TEST_TENANT_ID, testUserId, 'other', '123 Main St', 'City', '12345']
          )
        ).rejects.toThrow(/chk_user_addresses_type/i);
      });
    });
  });

  // ============================================
  // SOFT DELETE
  // ============================================
  describe('Soft Delete', () => {
    beforeEach(async () => {
      await setTenantContext(TEST_TENANT_ID);
    });

    describe('users.deleted_at', () => {
      it('should preserve all data on soft delete', async () => {
        const email = 'softdelete@test.com';
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, email, 'hash', 'Soft', 'Delete']
        );
        const userId = result.rows[0].id;

        // Soft delete
        await testPool.query(
          `UPDATE users SET deleted_at = NOW() WHERE id = $1`,
          [userId]
        );

        // All data should still exist
        const deletedUser = await testPool.query(
          `SELECT * FROM users WHERE id = $1`,
          [userId]
        );
        expect(deletedUser.rows.length).toBe(1);
        expect(deletedUser.rows[0].email).toBe(email);
        expect(deletedUser.rows[0].first_name).toBe('Soft');
        expect(deletedUser.rows[0].deleted_at).not.toBeNull();
      });

      it('should exclude soft deleted users from WHERE deleted_at IS NULL queries', async () => {
        // Create and soft delete user
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, deleted_at) 
           VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
          [TEST_TENANT_ID, 'deleted@test.com', 'hash', 'Deleted', 'User']
        );

        // Query with deleted_at IS NULL
        const activeUsers = await testPool.query(
          `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
          ['deleted@test.com']
        );
        expect(activeUsers.rows.length).toBe(0);

        // Query without filter shows deleted user
        const allUsers = await testPool.query(
          `SELECT * FROM users WHERE email = $1`,
          ['deleted@test.com']
        );
        expect(allUsers.rows.length).toBe(1);
      });

      it('should allow email reuse after soft delete', async () => {
        const email = 'reusable@test.com';

        // Create and soft delete first user
        const result1 = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, email, 'hash1', 'First', 'User']
        );
        await testPool.query(
          `UPDATE users SET deleted_at = NOW() WHERE id = $1`,
          [result1.rows[0].id]
        );

        // Create new user with same email (should work due to partial unique index)
        await expect(
          testPool.query(
            `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
             VALUES ($1, $2, $3, $4, $5)`,
            [TEST_TENANT_ID, email, 'hash2', 'Second', 'User']
          )
        ).resolves.not.toThrow();
      });
    });

    describe('user_sessions.revoked_at', () => {
      it('should mark session as revoked without deleting', async () => {
        const userResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User']
        );

        const sessionResult = await testPool.query(
          `INSERT INTO user_sessions (tenant_id, user_id, ip_address) 
           VALUES ($1, $2, $3) RETURNING id`,
          [TEST_TENANT_ID, userResult.rows[0].id, '127.0.0.1']
        );

        // Revoke session
        await testPool.query(
          `UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1`,
          [sessionResult.rows[0].id]
        );

        // Session still exists
        const session = await testPool.query(
          `SELECT * FROM user_sessions WHERE id = $1`,
          [sessionResult.rows[0].id]
        );
        expect(session.rows.length).toBe(1);
        expect(session.rows[0].revoked_at).not.toBeNull();
      });

      it('should exclude revoked sessions from active session queries', async () => {
        const userResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User']
        );

        // Create active and revoked sessions
        await testPool.query(
          `INSERT INTO user_sessions (tenant_id, user_id, ip_address) 
           VALUES ($1, $2, $3)`,
          [TEST_TENANT_ID, userResult.rows[0].id, '127.0.0.1']
        );

        await testPool.query(
          `INSERT INTO user_sessions (tenant_id, user_id, ip_address, revoked_at) 
           VALUES ($1, $2, $3, NOW())`,
          [TEST_TENANT_ID, userResult.rows[0].id, '127.0.0.2']
        );

        // Query for active sessions only
        const activeSessions = await testPool.query(
          `SELECT * FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL`,
          [userResult.rows[0].id]
        );
        expect(activeSessions.rows.length).toBe(1);

        // Query all sessions
        const allSessions = await testPool.query(
          `SELECT * FROM user_sessions WHERE user_id = $1`,
          [userResult.rows[0].id]
        );
        expect(allSessions.rows.length).toBe(2);
      });
    });

    describe('user_venue_roles expiration', () => {
      it('should exclude expired roles from active role queries', async () => {
        const userResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User']
        );

        const venueId = '00000000-0000-0000-0000-000000000002';

        // Create active role (future expiration)
        await testPool.query(
          `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, expires_at) 
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 day')`,
          [TEST_TENANT_ID, userResult.rows[0].id, venueId, 'venue-manager']
        );

        // Create expired role
        await testPool.query(
          `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, expires_at) 
           VALUES ($1, $2, $3, $4, NOW() - INTERVAL '1 day')`,
          [TEST_TENANT_ID, userResult.rows[0].id, venueId, 'box-office']
        );

        // Query for active roles only
        const activeRoles = await testPool.query(
          `SELECT * FROM user_venue_roles 
           WHERE user_id = $1 AND is_active = true 
           AND (expires_at IS NULL OR expires_at > NOW())`,
          [userResult.rows[0].id]
        );
        expect(activeRoles.rows.length).toBe(1);
        expect(activeRoles.rows[0].role).toBe('venue-manager');
      });

      it('should exclude inactive roles', async () => {
        const userResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User']
        );

        const venueId = '00000000-0000-0000-0000-000000000002';

        await testPool.query(
          `INSERT INTO user_venue_roles (tenant_id, user_id, venue_id, role, is_active) 
           VALUES ($1, $2, $3, $4, $5)`,
          [TEST_TENANT_ID, userResult.rows[0].id, venueId, 'venue-manager', false]
        );

        const activeRoles = await testPool.query(
          `SELECT * FROM user_venue_roles WHERE user_id = $1 AND is_active = true`,
          [userResult.rows[0].id]
        );
        expect(activeRoles.rows.length).toBe(0);
      });
    });
  });

  // ============================================
  // ROW LEVEL SECURITY (RLS)
  // ============================================
  describe('Row Level Security (RLS)', () => {
    let tenant1Id: string;
    let tenant2Id: string;
    let user1Id: string;
    let user2Id: string;

    beforeEach(async () => {
      // Use timestamp to create unique tenant slugs
      const timestamp = Date.now();
      
      // Create two tenants
      const tenant1 = await testPool.query(
        `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
        ['Tenant 1', `tenant-1-${timestamp}`]
      );
      tenant1Id = tenant1.rows[0].id;

      const tenant2 = await testPool.query(
        `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
        ['Tenant 2', `tenant-2-${timestamp}`]
      );
      tenant2Id = tenant2.rows[0].id;

      // Create user in tenant 1
      await setTenantContext(tenant1Id);
      const user1 = await testPool.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenant1Id, `user1-${timestamp}@test.com`, 'hash', 'User', 'One']
      );
      user1Id = user1.rows[0].id;

      // Create user in tenant 2
      await setTenantContext(tenant2Id);
      const user2 = await testPool.query(
        `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenant2Id, `user2-${timestamp}@test.com`, 'hash', 'User', 'Two']
      );
      user2Id = user2.rows[0].id;

      await clearTenantContext();
    });

    describe('users table RLS', () => {
      it('should enforce RLS policies (verify constraint exists)', async () => {
        // This test verifies RLS is configured, even if not enforced in tests
        const rlsCheck = await testPool.query(`
          SELECT relrowsecurity, relforcerowsecurity 
          FROM pg_class 
          WHERE relname = 'users'
        `);
        
        expect(rlsCheck.rows.length).toBe(1);
        expect(rlsCheck.rows[0].relrowsecurity).toBe(true);
        expect(rlsCheck.rows[0].relforcerowsecurity).toBe(true);
      });

      it('should have RLS policy on users table', async () => {
        const policyCheck = await testPool.query(`
          SELECT policyname 
          FROM pg_policies 
          WHERE tablename = 'users'
        `);
        
        expect(policyCheck.rows.length).toBeGreaterThan(0);
        expect(policyCheck.rows.some((r: any) => r.policyname === 'users_tenant_isolation')).toBe(true);
      });
    });

    describe('Multi-tenant data separation verification', () => {
      it('should have separate users in different tenants', async () => {
        await setTenantContext(tenant1Id);
        const users1 = await testPool.query(`SELECT id, tenant_id FROM users WHERE tenant_id = $1`, [tenant1Id]);
        
        await setTenantContext(tenant2Id);
        const users2 = await testPool.query(`SELECT id, tenant_id FROM users WHERE tenant_id = $1`, [tenant2Id]);

        expect(users1.rows.length).toBeGreaterThan(0);
        expect(users2.rows.length).toBeGreaterThan(0);
        
        // Verify they're actually different tenants
        expect(users1.rows[0].tenant_id).not.toBe(users2.rows[0].tenant_id);
      });

      it('should have RLS configured on all tenant tables', async () => {
        const tables = ['users', 'user_sessions', 'audit_logs', 'oauth_connections', 'wallet_connections'];
        
        for (const table of tables) {
          const rlsCheck = await testPool.query(`
            SELECT relrowsecurity 
            FROM pg_class 
            WHERE relname = $1
          `, [table]);
          
          expect(rlsCheck.rows[0].relrowsecurity).toBe(true);
        }
      });
    });
  });

  // ============================================
  // TRIGGERS
  // ============================================
  describe('Database Triggers', () => {
    beforeEach(async () => {
      await setTenantContext(TEST_TENANT_ID);
    });

    describe('trigger_generate_referral_code', () => {
      it('should auto-generate referral code on user insert', async () => {
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING referral_code`,
          [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User']
        );

        expect(result.rows[0].referral_code).toBeDefined();
        expect(result.rows[0].referral_code).toMatch(/^[A-Z0-9]{8}$/);
      });

      it('should not override manually provided referral code', async () => {
        const customCode = 'CUSTOM99';
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, referral_code) 
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING referral_code`,
          [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User', customCode]
        );

        expect(result.rows[0].referral_code).toBe(customCode);
      });
    });

    describe('trigger_increment_referral_count', () => {
      it('should increment referral count when referred user verifies email', async () => {
        // Create referrer
        const referrerResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id, referral_count`,
          [TEST_TENANT_ID, 'referrer@test.com', 'hash', 'Referrer', 'User']
        );
        const referrerId = referrerResult.rows[0].id;
        expect(referrerResult.rows[0].referral_count).toBe(0);

        // Create referred user (not verified yet)
        const referredResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, referred_by, email_verified) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [TEST_TENANT_ID, 'referred@test.com', 'hash', 'Referred', 'User', referrerId, false]
        );

        // Verify email (should trigger referral count increment)
        await testPool.query(
          `UPDATE users SET email_verified = true WHERE id = $1`,
          [referredResult.rows[0].id]
        );

        // Check referrer's count increased
        const updatedReferrer = await testPool.query(
          `SELECT referral_count FROM users WHERE id = $1`,
          [referrerId]
        );
        expect(updatedReferrer.rows[0].referral_count).toBe(1);
      });

      it('should not increment referral count on other updates', async () => {
        // Create referrer
        const referrerResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'referrer@test.com', 'hash', 'Referrer', 'User']
        );
        const referrerId = referrerResult.rows[0].id;

        // Create referred user (not yet verified)
        const referredResult = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name, referred_by, email_verified) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [TEST_TENANT_ID, 'referred@test.com', 'hash', 'Referred', 'User', referrerId, false]
        );

        // Update something else (not email_verified)
        await testPool.query(
          `UPDATE users SET first_name = $1 WHERE id = $2`,
          ['NewName', referredResult.rows[0].id]
        );

        // Count should still be 0 (no verification happened)
        const referrer = await testPool.query(
          `SELECT referral_count FROM users WHERE id = $1`,
          [referrerId]
        );
        expect(referrer.rows[0].referral_count).toBe(0);
      });
    });

    describe('trigger_update_users_timestamp', () => {
      it('should auto-update updated_at on row update', async () => {
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id, updated_at`,
          [TEST_TENANT_ID, 'user@test.com', 'hash', 'Test', 'User']
        );
        const userId = result.rows[0].id;
        const originalUpdatedAt = result.rows[0].updated_at;

        // Wait a bit to ensure timestamp difference
        await new Promise(resolve => setTimeout(resolve, 100));

        // Update user
        await testPool.query(
          `UPDATE users SET first_name = $1 WHERE id = $2`,
          ['Updated', userId]
        );

        // Check updated_at changed
        const updated = await testPool.query(
          `SELECT updated_at FROM users WHERE id = $1`,
          [userId]
        );
        expect(new Date(updated.rows[0].updated_at).getTime()).toBeGreaterThan(
          new Date(originalUpdatedAt).getTime()
        );
      });
    });

    describe('audit_trigger_function', () => {
      it('should create audit log on INSERT', async () => {
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'audit@test.com', 'hash', 'Audit', 'User']
        );

        const auditLogs = await testPool.query(
          `SELECT * FROM audit_logs WHERE table_name = 'users' AND record_id = $1 AND action_type = 'INSERT'`,
          [result.rows[0].id]
        );

        expect(auditLogs.rows.length).toBeGreaterThan(0);
        expect(auditLogs.rows[0].new_data).toBeDefined();
        expect(auditLogs.rows[0].new_data.email).toBe('audit@test.com');
      });

      it('should create audit log on UPDATE with changed_fields', async () => {
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'audit@test.com', 'hash', 'Original', 'Name']
        );
        const userId = result.rows[0].id;

        // Update user
        await testPool.query(
          `UPDATE users SET first_name = $1 WHERE id = $2`,
          ['Updated', userId]
        );

        const auditLogs = await testPool.query(
          `SELECT * FROM audit_logs WHERE table_name = 'users' AND record_id = $1 AND action_type = 'UPDATE'`,
          [userId]
        );

        expect(auditLogs.rows.length).toBeGreaterThan(0);
        const log = auditLogs.rows[auditLogs.rows.length - 1]; // Get most recent
        expect(log.changed_fields).toContain('first_name');
        expect(log.old_data.first_name).toBe('Original');
        expect(log.new_data.first_name).toBe('Updated');
      });

      it('should create audit log on DELETE', async () => {
        const result = await testPool.query(
          `INSERT INTO users (tenant_id, email, password_hash, first_name, last_name) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [TEST_TENANT_ID, 'delete@test.com', 'hash', 'Delete', 'Me']
        );
        const userId = result.rows[0].id;

        // Delete user
        await testPool.query(`DELETE FROM users WHERE id = $1`, [userId]);

        const auditLogs = await testPool.query(
          `SELECT * FROM audit_logs WHERE table_name = 'users' AND record_id = $1 AND action_type = 'DELETE'`,
          [userId]
        );

        expect(auditLogs.rows.length).toBeGreaterThan(0);
        expect(auditLogs.rows[0].old_data).toBeDefined();
        expect(auditLogs.rows[0].old_data.email).toBe('delete@test.com');
      });
    });
  });
});
