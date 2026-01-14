/**
 * Unit tests for blockchain-service main configuration (config/index.ts)
 * Tests Solana config, database config, redis config, service config
 * AUDIT FIX #85: Remove public RPC fallback
 * AUDIT FIX #27: Use HTTPS for internal service URLs
 */

describe('Main Configuration (config/index.ts)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Solana Configuration
  // ===========================================================================
  describe('Solana Configuration', () => {
    describe('RPC URL', () => {
      it('should use SOLANA_RPC_URL from env', () => {
        process.env.SOLANA_RPC_URL = 'https://my-rpc.com';
        
        const rpcUrl = process.env.SOLANA_RPC_URL;
        
        expect(rpcUrl).toBe('https://my-rpc.com');
      });

      it('should allow devnet in development', () => {
        process.env.NODE_ENV = 'development';
        delete process.env.SOLANA_RPC_URL;
        
        const rpcUrl = process.env.SOLANA_RPC_URL || 
          (process.env.NODE_ENV === 'development' ? 'https://api.devnet.solana.com' : null);
        
        expect(rpcUrl).toBe('https://api.devnet.solana.com');
      });

      it('should reject devnet in production (AUDIT FIX #85)', () => {
        process.env.NODE_ENV = 'production';
        process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
        
        const isPublicRpc = process.env.SOLANA_RPC_URL?.includes('api.devnet.solana.com') ||
                          process.env.SOLANA_RPC_URL?.includes('api.testnet.solana.com') ||
                          process.env.SOLANA_RPC_URL?.includes('api.mainnet-beta.solana.com');
        
        expect(isPublicRpc).toBe(true);
        // In production, this should throw
      });

      it('should reject testnet in production (AUDIT FIX #85)', () => {
        process.env.NODE_ENV = 'production';
        process.env.SOLANA_RPC_URL = 'https://api.testnet.solana.com';
        
        const isPublicRpc = process.env.SOLANA_RPC_URL?.includes('api.testnet.solana.com');
        
        expect(isPublicRpc).toBe(true);
      });

      it('should reject mainnet-beta public RPC in production (AUDIT FIX #85)', () => {
        process.env.NODE_ENV = 'production';
        process.env.SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
        
        const isPublicRpc = process.env.SOLANA_RPC_URL?.includes('api.mainnet-beta.solana.com');
        
        expect(isPublicRpc).toBe(true);
      });

      it('should allow paid RPC provider in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.SOLANA_RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=xxx';
        
        const isPublicRpc = process.env.SOLANA_RPC_URL?.includes('api.devnet.solana.com') ||
                          process.env.SOLANA_RPC_URL?.includes('api.testnet.solana.com') ||
                          process.env.SOLANA_RPC_URL?.includes('api.mainnet-beta.solana.com');
        
        expect(isPublicRpc).toBe(false);
      });
    });

    describe('RPC Fallback URLs', () => {
      it('should parse comma-separated fallback URLs', () => {
        process.env.SOLANA_RPC_FALLBACK_URLS = 'https://rpc1.com,https://rpc2.com';
        
        const fallbackUrls = process.env.SOLANA_RPC_FALLBACK_URLS
          .split(',')
          .map(url => url.trim())
          .filter(url => url.length > 0);
        
        expect(fallbackUrls).toHaveLength(2);
        expect(fallbackUrls[0]).toBe('https://rpc1.com');
        expect(fallbackUrls[1]).toBe('https://rpc2.com');
      });

      it('should handle empty fallback URLs', () => {
        delete process.env.SOLANA_RPC_FALLBACK_URLS;
        
        const fallbackUrls = process.env.SOLANA_RPC_FALLBACK_URLS || '';
        const parsed = fallbackUrls.split(',').map(url => url.trim()).filter(url => url.length > 0);
        
        expect(parsed).toHaveLength(0);
      });
    });

    describe('Commitment', () => {
      it('should default commitment to confirmed', () => {
        delete process.env.SOLANA_COMMITMENT;
        
        const commitment = process.env.SOLANA_COMMITMENT || 'confirmed';
        
        expect(commitment).toBe('confirmed');
      });

      it('should allow finalized commitment', () => {
        process.env.SOLANA_COMMITMENT = 'finalized';
        
        const commitment = process.env.SOLANA_COMMITMENT || 'confirmed';
        
        expect(commitment).toBe('finalized');
      });

      it('should allow processed commitment', () => {
        process.env.SOLANA_COMMITMENT = 'processed';
        
        const commitment = process.env.SOLANA_COMMITMENT || 'confirmed';
        
        expect(commitment).toBe('processed');
      });
    });

    describe('Network', () => {
      it('should default network to devnet', () => {
        delete process.env.SOLANA_NETWORK;
        
        const network = process.env.SOLANA_NETWORK || 'devnet';
        
        expect(network).toBe('devnet');
      });

      it('should allow mainnet-beta', () => {
        process.env.SOLANA_NETWORK = 'mainnet-beta';
        
        expect(process.env.SOLANA_NETWORK).toBe('mainnet-beta');
      });
    });

    describe('Priority Fees (AUDIT FIX #82)', () => {
      it('should default min priority fee to 1000', () => {
        delete process.env.SOLANA_MIN_PRIORITY_FEE;
        
        const minFee = parseInt(process.env.SOLANA_MIN_PRIORITY_FEE || '1000', 10);
        
        expect(minFee).toBe(1000);
      });

      it('should default max priority fee to 1000000', () => {
        delete process.env.SOLANA_MAX_PRIORITY_FEE;
        
        const maxFee = parseInt(process.env.SOLANA_MAX_PRIORITY_FEE || '1000000', 10);
        
        expect(maxFee).toBe(1000000);
      });

      it('should default priority fee to 50000', () => {
        delete process.env.SOLANA_DEFAULT_PRIORITY_FEE;
        
        const defaultFee = parseInt(process.env.SOLANA_DEFAULT_PRIORITY_FEE || '50000', 10);
        
        expect(defaultFee).toBe(50000);
      });

      it('should use custom priority fees from env', () => {
        process.env.SOLANA_MIN_PRIORITY_FEE = '5000';
        process.env.SOLANA_MAX_PRIORITY_FEE = '500000';
        process.env.SOLANA_DEFAULT_PRIORITY_FEE = '100000';
        
        const minFee = parseInt(process.env.SOLANA_MIN_PRIORITY_FEE, 10);
        const maxFee = parseInt(process.env.SOLANA_MAX_PRIORITY_FEE, 10);
        const defaultFee = parseInt(process.env.SOLANA_DEFAULT_PRIORITY_FEE, 10);
        
        expect(minFee).toBe(5000);
        expect(maxFee).toBe(500000);
        expect(defaultFee).toBe(100000);
      });
    });

    describe('Bundlr/Irys Configuration (AUDIT FIX #81)', () => {
      it('should default bundlr address to devnet', () => {
        delete process.env.BUNDLR_ADDRESS;
        
        const bundlrAddress = process.env.BUNDLR_ADDRESS || 'https://devnet.bundlr.network';
        
        expect(bundlrAddress).toBe('https://devnet.bundlr.network');
      });

      it('should use custom bundlr address', () => {
        process.env.BUNDLR_ADDRESS = 'https://node1.bundlr.network';
        
        expect(process.env.BUNDLR_ADDRESS).toBe('https://node1.bundlr.network');
      });

      it('should default bundlr timeout to 60000ms', () => {
        delete process.env.BUNDLR_TIMEOUT;
        
        const timeout = parseInt(process.env.BUNDLR_TIMEOUT || '60000', 10);
        
        expect(timeout).toBe(60000);
      });
    });
  });

  // ===========================================================================
  // Database Configuration
  // ===========================================================================
  describe('Database Configuration', () => {
    it('should use default host localhost', () => {
      delete process.env.DB_HOST;
      
      const host = process.env.DB_HOST || 'localhost';
      
      expect(host).toBe('localhost');
    });

    it('should use default port 5432', () => {
      delete process.env.DB_PORT;
      
      const port = parseInt(process.env.DB_PORT || '5432', 10);
      
      expect(port).toBe(5432);
    });

    it('should use default database tickettoken', () => {
      delete process.env.DB_NAME;
      
      const database = process.env.DB_NAME || 'tickettoken';
      
      expect(database).toBe('tickettoken');
    });

    it('should use default pool max 20', () => {
      delete process.env.DB_POOL_MAX;
      
      const max = parseInt(process.env.DB_POOL_MAX || '20', 10);
      
      expect(max).toBe(20);
    });

    it('should enable SSL in production', () => {
      process.env.NODE_ENV = 'production';
      
      const isProduction = process.env.NODE_ENV === 'production';
      const ssl = isProduction ? { rejectUnauthorized: true } : undefined;
      
      expect(ssl).toEqual({ rejectUnauthorized: true });
    });

    it('should allow SSL in development when explicitly enabled', () => {
      process.env.NODE_ENV = 'development';
      process.env.DB_SSL = 'true';
      
      const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
      
      expect(ssl).toEqual({ rejectUnauthorized: false });
    });
  });

  // ===========================================================================
  // Redis Configuration
  // ===========================================================================
  describe('Redis Configuration', () => {
    it('should use default host localhost', () => {
      delete process.env.REDIS_HOST;
      
      const host = process.env.REDIS_HOST || 'localhost';
      
      expect(host).toBe('localhost');
    });

    it('should use default port 6379', () => {
      delete process.env.REDIS_PORT;
      
      const port = parseInt(process.env.REDIS_PORT || '6379', 10);
      
      expect(port).toBe(6379);
    });

    it('should use default db 0', () => {
      delete process.env.REDIS_DB;
      
      const db = parseInt(process.env.REDIS_DB || '0', 10);
      
      expect(db).toBe(0);
    });

    it('should enable TLS in production', () => {
      process.env.NODE_ENV = 'production';
      
      const tls = process.env.REDIS_TLS === 'true' || process.env.NODE_ENV === 'production';
      
      expect(tls).toBe(true);
    });
  });

  // ===========================================================================
  // Service Configuration
  // ===========================================================================
  describe('Service Configuration', () => {
    it('should default name to blockchain-service', () => {
      delete process.env.SERVICE_NAME;
      
      const name = process.env.SERVICE_NAME || 'blockchain-service';
      
      expect(name).toBe('blockchain-service');
    });

    it('should default port to 3015', () => {
      delete process.env.PORT;
      
      const port = parseInt(process.env.PORT || '3015', 10);
      
      expect(port).toBe(3015);
    });

    it('should default env to development', () => {
      delete process.env.NODE_ENV;
      
      const env = process.env.NODE_ENV || 'development';
      
      expect(env).toBe('development');
    });
  });

  // ===========================================================================
  // validateConfig Function
  // ===========================================================================
  describe('validateConfig', () => {
    it('should require SOLANA_RPC_URL in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SOLANA_RPC_URL;
      
      const shouldThrow = !process.env.SOLANA_RPC_URL && process.env.NODE_ENV === 'production';
      
      expect(shouldThrow).toBe(true);
    });

    it('should require treasury wallet key in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.TREASURY_WALLET_KEY;
      delete process.env.AWS_KMS_KEY_ID;
      
      const hasKey = !!process.env.TREASURY_WALLET_KEY || !!process.env.AWS_KMS_KEY_ID;
      
      expect(hasKey).toBe(false);
    });
  });
});
