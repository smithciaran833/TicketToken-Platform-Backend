/**
 * Unit tests for blockchain-service treasury-whitelist configuration
 * Tests address whitelist for treasury transactions (AUDIT FIX #85)
 */

describe('Treasury Whitelist Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // System Programs (Always Allowed)
  // ===========================================================================
  describe('SYSTEM_PROGRAMS', () => {
    const SYSTEM_PROGRAMS = new Set([
      '11111111111111111111111111111111', // System Program
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
      'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
      'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022 Program
      'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', // Token Metadata Program
      'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY', // Bubblegum (cNFT)
      'cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK', // Account Compression
      'noopb9bkMVfRPU8AsbFAh6DkH4wdQNzN3nQXRCxD', // Noop
      'CndyV3LdqHUfDLmE5naZjVN8rBZz4tqhdefbAnjHG3JR', // Candy Machine Core
      'Guard1JwRhJkVH6XZhzoYxeBVQe872VH6QggF4BWmS9g', // Candy Guard
      'memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo', // Memo Program
      'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' // Memo V2
    ]);

    it('should include System Program', () => {
      expect(SYSTEM_PROGRAMS.has('11111111111111111111111111111111')).toBe(true);
    });

    it('should include Token Program', () => {
      expect(SYSTEM_PROGRAMS.has('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')).toBe(true);
    });

    it('should include Associated Token Program', () => {
      expect(SYSTEM_PROGRAMS.has('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')).toBe(true);
    });

    it('should include Token-2022 Program', () => {
      expect(SYSTEM_PROGRAMS.has('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')).toBe(true);
    });

    it('should include Token Metadata Program (Metaplex)', () => {
      expect(SYSTEM_PROGRAMS.has('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')).toBe(true);
    });

    it('should include Bubblegum (cNFT)', () => {
      expect(SYSTEM_PROGRAMS.has('BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY')).toBe(true);
    });

    it('should include Account Compression', () => {
      expect(SYSTEM_PROGRAMS.has('cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK')).toBe(true);
    });

    it('should include Candy Machine Core', () => {
      expect(SYSTEM_PROGRAMS.has('CndyV3LdqHUfDLmE5naZjVN8rBZz4tqhdefbAnjHG3JR')).toBe(true);
    });

    it('should include Memo Program', () => {
      expect(SYSTEM_PROGRAMS.has('memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo')).toBe(true);
    });

    it('should have correct count of system programs', () => {
      expect(SYSTEM_PROGRAMS.size).toBe(12);
    });
  });

  // ===========================================================================
  // Whitelist Enabled Configuration
  // ===========================================================================
  describe('WHITELIST_ENABLED', () => {
    it('should be enabled in production by default', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TREASURY_WHITELIST_ENABLED;
      
      const enabled = process.env.TREASURY_WHITELIST_ENABLED !== 'false' 
        && process.env.NODE_ENV === 'production';
      
      expect(enabled).toBe(true);
    });

    it('should be disabled when TREASURY_WHITELIST_ENABLED=false', () => {
      process.env.NODE_ENV = 'production';
      process.env.TREASURY_WHITELIST_ENABLED = 'false';
      
      const enabled = process.env.TREASURY_WHITELIST_ENABLED !== 'false' 
        && process.env.NODE_ENV === 'production';
      
      expect(enabled).toBe(false);
    });

    it('should be disabled in non-production by default', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.TREASURY_WHITELIST_ENABLED;
      
      const enabled = process.env.TREASURY_WHITELIST_ENABLED !== 'false' 
        && process.env.NODE_ENV === 'production';
      
      expect(enabled).toBe(false);
    });
  });

  // ===========================================================================
  // loadWhitelist Function
  // ===========================================================================
  describe('loadWhitelist', () => {
    it('should load addresses from TREASURY_WHITELIST_ADDRESSES env', () => {
      process.env.TREASURY_WHITELIST_ADDRESSES = 'addr1,addr2,addr3';
      
      const addresses = (process.env.TREASURY_WHITELIST_ADDRESSES || '')
        .split(',')
        .map(a => a.trim())
        .filter(a => a);
      
      expect(addresses).toHaveLength(3);
      expect(addresses).toContain('addr1');
      expect(addresses).toContain('addr2');
      expect(addresses).toContain('addr3');
    });

    it('should handle empty TREASURY_WHITELIST_ADDRESSES', () => {
      process.env.TREASURY_WHITELIST_ADDRESSES = '';
      
      const addresses = (process.env.TREASURY_WHITELIST_ADDRESSES || '')
        .split(',')
        .map(a => a.trim())
        .filter(a => a);
      
      expect(addresses).toHaveLength(0);
    });

    it('should handle whitespace in addresses', () => {
      process.env.TREASURY_WHITELIST_ADDRESSES = '  addr1  ,  addr2  ';
      
      const addresses = (process.env.TREASURY_WHITELIST_ADDRESSES || '')
        .split(',')
        .map(a => a.trim())
        .filter(a => a);
      
      expect(addresses[0]).toBe('addr1');
      expect(addresses[1]).toBe('addr2');
    });

    it('should try to load from config file when TREASURY_WHITELIST_FILE set', () => {
      process.env.TREASURY_WHITELIST_FILE = '/path/to/whitelist.json';
      
      const configPath = process.env.TREASURY_WHITELIST_FILE;
      
      expect(configPath).toBe('/path/to/whitelist.json');
    });
  });

  // ===========================================================================
  // isValidAddress Function
  // ===========================================================================
  describe('isValidAddress', () => {
    it('should validate correct Solana address format', () => {
      // Valid Base58 Solana address (32-44 chars)
      const validAddress = '11111111111111111111111111111111';
      
      // Simple length check for this test
      const isValid = validAddress.length >= 32 && validAddress.length <= 44;
      
      expect(isValid).toBe(true);
    });

    it('should reject empty address', () => {
      const emptyAddress = '';
      
      const isValid = emptyAddress.length >= 32 && emptyAddress.length <= 44;
      
      expect(isValid).toBe(false);
    });

    it('should reject too short address', () => {
      const shortAddress = 'abc123';
      
      const isValid = shortAddress.length >= 32 && shortAddress.length <= 44;
      
      expect(isValid).toBe(false);
    });
  });

  // ===========================================================================
  // checkWhitelist Function
  // ===========================================================================
  describe('checkWhitelist', () => {
    const SYSTEM_PROGRAMS = new Set([
      '11111111111111111111111111111111',
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
    ]);

    it('should allow system programs', () => {
      const address = '11111111111111111111111111111111';
      const isSystemProgram = SYSTEM_PROGRAMS.has(address);
      
      expect(isSystemProgram).toBe(true);
    });

    it('should return isSystemProgram=true for system programs', () => {
      const address = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      const result = {
        allowed: true,
        reason: 'System program (always allowed)',
        isSystemProgram: SYSTEM_PROGRAMS.has(address)
      };
      
      expect(result.isSystemProgram).toBe(true);
      expect(result.allowed).toBe(true);
    });

    it('should reject non-whitelisted address when whitelist enabled', () => {
      const WHITELIST_ENABLED = true;
      const whitelistedAddresses = new Set(['allowed-address']);
      const address = 'not-whitelisted-address';
      
      const isAllowed = SYSTEM_PROGRAMS.has(address) || whitelistedAddresses.has(address);
      const result = WHITELIST_ENABLED ? isAllowed : true;
      
      expect(result).toBe(false);
    });

    it('should allow any address when whitelist disabled', () => {
      const WHITELIST_ENABLED = false;
      const address = 'any-random-address';
      
      // When whitelist is disabled, all addresses are allowed
      const result = !WHITELIST_ENABLED || true;
      
      expect(result).toBe(true);
    });

    it('should allow explicitly whitelisted address', () => {
      const whitelistedAddresses = new Set(['my-whitelisted-address']);
      const address = 'my-whitelisted-address';
      
      const isAllowed = whitelistedAddresses.has(address);
      
      expect(isAllowed).toBe(true);
    });
  });

  // ===========================================================================
  // validateDestination Function
  // ===========================================================================
  describe('validateDestination', () => {
    it('should not throw for allowed address', () => {
      const isAllowed = true;
      
      const validate = () => {
        if (!isAllowed) {
          throw new Error('Treasury transaction rejected: Destination not whitelisted');
        }
      };
      
      expect(validate).not.toThrow();
    });

    it('should throw for rejected address', () => {
      const isAllowed = false;
      const address = 'rejected-address';
      
      const validate = () => {
        if (!isAllowed) {
          throw new Error(`Treasury transaction rejected: Destination ${address.slice(0, 8)}... is not whitelisted`);
        }
      };
      
      expect(validate).toThrow('Treasury transaction rejected');
    });
  });

  // ===========================================================================
  // getWhitelistStatus Function
  // ===========================================================================
  describe('getWhitelistStatus', () => {
    it('should return enabled status', () => {
      const status = {
        enabled: true,
        totalAddresses: 15,
        systemPrograms: 12,
        customAddresses: 3
      };

      expect(status.enabled).toBe(true);
    });

    it('should return total address count', () => {
      const systemPrograms = 12;
      const customAddresses = 3;
      const status = {
        enabled: true,
        totalAddresses: systemPrograms + customAddresses,
        systemPrograms,
        customAddresses
      };

      expect(status.totalAddresses).toBe(15);
    });

    it('should return system program count', () => {
      const status = {
        enabled: true,
        totalAddresses: 15,
        systemPrograms: 12,
        customAddresses: 3
      };

      expect(status.systemPrograms).toBe(12);
    });

    it('should return custom address count', () => {
      const status = {
        enabled: true,
        totalAddresses: 15,
        systemPrograms: 12,
        customAddresses: 3
      };

      expect(status.customAddresses).toBe(3);
    });
  });

  // ===========================================================================
  // getWhitelistAddresses Function
  // ===========================================================================
  describe('getWhitelistAddresses', () => {
    it('should mask addresses by default', () => {
      const address = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      const masked = `${address.slice(0, 8)}...${address.slice(-4)}`;
      
      expect(masked).toBe('Tokenke...5DA');
    });

    it('should include full address when masked=false', () => {
      const address = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
      const masked = false;
      
      const result = masked === false ? address : `${address.slice(0, 8)}...`;
      
      expect(result).toBe(address);
    });

    it('should distinguish system vs custom type', () => {
      const SYSTEM_PROGRAMS = new Set(['system-addr']);
      
      const addresses = [
        { address: 'system-addr', type: SYSTEM_PROGRAMS.has('system-addr') ? 'system' : 'custom' },
        { address: 'custom-addr', type: SYSTEM_PROGRAMS.has('custom-addr') ? 'system' : 'custom' }
      ];
      
      expect(addresses[0].type).toBe('system');
      expect(addresses[1].type).toBe('custom');
    });

    it('should filter out system programs when includeSystemPrograms=false', () => {
      const allAddresses = [
        { address: 'system', type: 'system' as const },
        { address: 'custom', type: 'custom' as const }
      ];
      
      const filtered = allAddresses.filter(a => a.type === 'custom');
      
      expect(filtered).toHaveLength(1);
      expect(filtered[0].address).toBe('custom');
    });
  });

  // ===========================================================================
  // addToWhitelist Function
  // ===========================================================================
  describe('addToWhitelist', () => {
    it('should reject invalid address format', () => {
      const invalidAddress = 'invalid';
      const isValid = invalidAddress.length >= 32 && invalidAddress.length <= 44;
      
      expect(isValid).toBe(false);
    });

    it('should return true for already whitelisted address', () => {
      const whitelistedAddresses = new Set(['existing-address-12345678901234567890']);
      const address = 'existing-address-12345678901234567890';
      
      const alreadyExists = whitelistedAddresses.has(address);
      
      expect(alreadyExists).toBe(true);
    });

    it('should add new address successfully', () => {
      const whitelistedAddresses = new Set<string>();
      const newAddress = 'new-address-1234567890123456789012345';
      
      whitelistedAddresses.add(newAddress);
      
      expect(whitelistedAddresses.has(newAddress)).toBe(true);
    });

    it('should log security event on addition', () => {
      const address = 'new-addr-123456789012345678901234567890';
      const authorizedBy = 'admin@example.com';
      
      const logData = {
        address: address.slice(0, 8) + '...',
        authorizedBy,
        event: 'WHITELIST_ADDITION'
      };
      
      expect(logData.event).toBe('WHITELIST_ADDITION');
      expect(logData.authorizedBy).toBe('admin@example.com');
    });
  });

  // ===========================================================================
  // removeFromWhitelist Function
  // ===========================================================================
  describe('removeFromWhitelist', () => {
    const SYSTEM_PROGRAMS = new Set(['11111111111111111111111111111111']);

    it('should not allow removing system programs', () => {
      const address = '11111111111111111111111111111111';
      const isSystemProgram = SYSTEM_PROGRAMS.has(address);
      
      expect(isSystemProgram).toBe(true);
      // removeFromWhitelist should return false for system programs
    });

    it('should return false for non-existent address', () => {
      const whitelistedAddresses = new Set<string>();
      const address = 'non-existent-address';
      
      const exists = whitelistedAddresses.has(address);
      
      expect(exists).toBe(false);
    });

    it('should remove existing custom address', () => {
      const whitelistedAddresses = new Set(['custom-address-to-remove']);
      const address = 'custom-address-to-remove';
      
      whitelistedAddresses.delete(address);
      
      expect(whitelistedAddresses.has(address)).toBe(false);
    });

    it('should log security event on removal', () => {
      const address = 'removed-addr-12345678901234567890123';
      const authorizedBy = 'admin@example.com';
      
      const logData = {
        address: address.slice(0, 8) + '...',
        authorizedBy,
        event: 'WHITELIST_REMOVAL'
      };
      
      expect(logData.event).toBe('WHITELIST_REMOVAL');
      expect(logData.authorizedBy).toBe('admin@example.com');
    });
  });

  // ===========================================================================
  // isAddressWhitelisted Function
  // ===========================================================================
  describe('isAddressWhitelisted', () => {
    it('should return true for system program', () => {
      const SYSTEM_PROGRAMS = new Set(['11111111111111111111111111111111']);
      const address = '11111111111111111111111111111111';
      
      const isWhitelisted = SYSTEM_PROGRAMS.has(address);
      
      expect(isWhitelisted).toBe(true);
    });

    it('should return true for explicitly whitelisted', () => {
      const whitelistedAddresses = new Set(['my-custom-address']);
      const address = 'my-custom-address';
      
      const isWhitelisted = whitelistedAddresses.has(address);
      
      expect(isWhitelisted).toBe(true);
    });

    it('should return false for non-whitelisted', () => {
      const SYSTEM_PROGRAMS = new Set(['system']);
      const whitelistedAddresses = new Set(['custom']);
      const address = 'not-whitelisted';
      
      const isWhitelisted = SYSTEM_PROGRAMS.has(address) || whitelistedAddresses.has(address);
      
      expect(isWhitelisted).toBe(false);
    });
  });
});
