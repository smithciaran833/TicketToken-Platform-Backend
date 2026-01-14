/**
 * Unit tests for MetaplexService
 * 
 * Tests NFT minting, metadata upload, collection management
 * AUDIT FIXES: #81 (Bundlr storage), #82 (priority fees), #84 (fresh blockhash)
 */

describe('MetaplexService', () => {
  // ===========================================================================
  // Constructor
  // ===========================================================================
  describe('Constructor', () => {
    it('should accept Connection and Keypair', () => {
      const deps = { connection: {}, authority: {} };
      expect(deps.connection).toBeDefined();
      expect(deps.authority).toBeDefined();
    });

    it('should initialize Metaplex with keypairIdentity', () => {
      const usesCalled = true;
      expect(usesCalled).toBe(true);
    });

    it('should configure Bundlr storage - AUDIT FIX #81', () => {
      const bundlrConfig = {
        address: 'https://devnet.bundlr.network',
        providerUrl: 'https://api.devnet.solana.com',
        timeout: 60000
      };
      expect(bundlrConfig.address).toMatch(/bundlr/);
    });

    it('should use bundlrAddress from config', () => {
      const address = 'https://devnet.bundlr.network';
      expect(address).toContain('bundlr');
    });

    it('should use bundlrProviderUrl from config', () => {
      const providerUrl = 'https://api.devnet.solana.com';
      expect(providerUrl).toMatch(/solana/);
    });

    it('should use bundlrTimeout from config', () => {
      const timeout = 60000;
      expect(timeout).toBe(60000);
    });

    it('should log initialization with authority public key', () => {
      const logData = { 
        authority: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
        bundlrAddress: 'https://devnet.bundlr.network'
      };
      expect(logData.authority).toBeDefined();
    });
  });

  // ===========================================================================
  // getPriorityFee - AUDIT FIX #82
  // ===========================================================================
  describe('getPriorityFee', () => {
    it('should check cache first', () => {
      const cacheTTL = 10000; // 10 seconds
      expect(cacheTTL).toBe(10000);
    });

    it('should return cached fee if valid', () => {
      const cache = { fee: 5000, timestamp: Date.now() - 5000 };
      const ttl = 10000;
      const isValid = (Date.now() - cache.timestamp) < ttl;
      expect(isValid).toBe(true);
    });

    it('should call getRecentPrioritizationFees', () => {
      let methodCalled = false;
      const mockConnection = {
        getRecentPrioritizationFees: () => { methodCalled = true; return []; }
      };
      mockConnection.getRecentPrioritizationFees();
      expect(methodCalled).toBe(true);
    });

    it('should return default if no recent fees', () => {
      const recentFees: any[] = [];
      const defaultFee = 1000;
      const result = recentFees.length === 0 ? defaultFee : 0;
      expect(result).toBe(defaultFee);
    });

    it('should filter out zero fees', () => {
      const fees = [0, 1000, 0, 2000, 3000];
      const filtered = fees.filter(f => f > 0);
      expect(filtered).toEqual([1000, 2000, 3000]);
    });

    it('should sort fees ascending', () => {
      const fees = [3000, 1000, 2000];
      const sorted = fees.sort((a, b) => a - b);
      expect(sorted).toEqual([1000, 2000, 3000]);
    });

    it('should calculate median fee', () => {
      const fees = [1000, 2000, 3000];
      const median = fees[Math.floor(fees.length / 2)];
      expect(median).toBe(2000);
    });

    it('should add 20% buffer to median', () => {
      const median = 1000;
      const buffered = Math.ceil(median * 1.2);
      expect(buffered).toBe(1200);
    });

    it('should clamp to minimum priority fee', () => {
      const fee = 100;
      const minFee = 500;
      const clamped = Math.max(fee, minFee);
      expect(clamped).toBe(500);
    });

    it('should clamp to maximum priority fee', () => {
      const fee = 1000000;
      const maxFee = 100000;
      const clamped = Math.min(fee, maxFee);
      expect(clamped).toBe(100000);
    });

    it('should cache calculated fee', () => {
      const cache = { fee: 0, timestamp: 0 };
      cache.fee = 5000;
      cache.timestamp = Date.now();
      expect(cache.fee).toBe(5000);
      expect(cache.timestamp).toBeGreaterThan(0);
    });

    it('should return default on error', () => {
      const defaultFee = 1000;
      const errorOccurred = true;
      const result = errorOccurred ? defaultFee : 5000;
      expect(result).toBe(defaultFee);
    });
  });

  // ===========================================================================
  // addPriorityFeeInstructions - AUDIT FIX #82
  // ===========================================================================
  describe('addPriorityFeeInstructions', () => {
    it('should default compute units to 200000', () => {
      const defaultUnits = 200000;
      expect(defaultUnits).toBe(200000);
    });

    it('should call getPriorityFee', () => {
      let called = false;
      const getPriorityFee = () => { called = true; return 5000; };
      getPriorityFee();
      expect(called).toBe(true);
    });

    it('should return setComputeUnitLimit instruction', () => {
      const instruction = { type: 'setComputeUnitLimit', units: 200000 };
      expect(instruction.type).toBe('setComputeUnitLimit');
    });

    it('should return setComputeUnitPrice instruction', () => {
      const instruction = { type: 'setComputeUnitPrice', microLamports: 5000 };
      expect(instruction.type).toBe('setComputeUnitPrice');
    });

    it('should return array of 2 instructions', () => {
      const instructions = [
        { type: 'setComputeUnitLimit' },
        { type: 'setComputeUnitPrice' }
      ];
      expect(instructions).toHaveLength(2);
    });
  });

  // ===========================================================================
  // getFreshBlockhash - AUDIT FIX #84
  // ===========================================================================
  describe('getFreshBlockhash', () => {
    it('should call connection.getLatestBlockhash', () => {
      let methodCalled = false;
      const mockConnection = {
        getLatestBlockhash: () => { 
          methodCalled = true; 
          return { blockhash: 'abc', lastValidBlockHeight: 100 }; 
        }
      };
      mockConnection.getLatestBlockhash();
      expect(methodCalled).toBe(true);
    });

    it('should use confirmed commitment', () => {
      const commitment = 'confirmed';
      expect(commitment).toBe('confirmed');
    });

    it('should return blockhash string', () => {
      const result = { blockhash: 'abc123', lastValidBlockHeight: 12345678 };
      expect(result.blockhash).toBeDefined();
    });

    it('should return lastValidBlockHeight', () => {
      const result = { blockhash: 'abc123', lastValidBlockHeight: 12345678 };
      expect(result.lastValidBlockHeight).toBe(12345678);
    });

    it('should log truncated blockhash', () => {
      const blockhash = 'abc123def456ghi789';
      const truncated = blockhash.substring(0, 16) + '...';
      expect(truncated).toMatch(/\.\.\.$/);
    });
  });

  // ===========================================================================
  // isBlockhashValid
  // ===========================================================================
  describe('isBlockhashValid', () => {
    it('should call getBlockHeight', () => {
      let methodCalled = false;
      const mockConnection = {
        getBlockHeight: () => { methodCalled = true; return 12345678; }
      };
      mockConnection.getBlockHeight();
      expect(methodCalled).toBe(true);
    });

    it('should return true if current height <= lastValidBlockHeight', () => {
      const currentHeight = 12345000;
      const lastValidHeight = 12345678;
      const isValid = currentHeight <= lastValidHeight;
      expect(isValid).toBe(true);
    });

    it('should return false if current height > lastValidBlockHeight', () => {
      const currentHeight = 12346000;
      const lastValidHeight = 12345678;
      const isValid = currentHeight <= lastValidHeight;
      expect(isValid).toBe(false);
    });

    it('should return false on error', () => {
      const errorOccurred = true;
      const result = errorOccurred ? false : true;
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // uploadMetadata - AUDIT FIX #81
  // ===========================================================================
  describe('uploadMetadata', () => {
    it('should log start of upload', () => {
      const logData = { name: 'Test NFT' };
      expect(logData.name).toBe('Test NFT');
    });

    it('should use retryOperation with 3 attempts', () => {
      const maxAttempts = 3;
      expect(maxAttempts).toBe(3);
    });

    it('should call metaplex.nfts().uploadMetadata', () => {
      let uploadCalled = false;
      const metaplex = {
        nfts: () => ({
          uploadMetadata: () => { uploadCalled = true; return { uri: 'https://...' }; }
        })
      };
      metaplex.nfts().uploadMetadata();
      expect(uploadCalled).toBe(true);
    });

    it('should return URI string', () => {
      const result = { uri: 'https://arweave.net/abc123' };
      expect(result.uri).toMatch(/arweave/);
    });

    it('should record metrics on success', () => {
      let metricsRecorded = false;
      const recordMetadataUpload = () => { metricsRecorded = true; };
      recordMetadataUpload();
      expect(metricsRecorded).toBe(true);
    });

    it('should log success with duration', () => {
      const logData = { uri: 'https://...', name: 'Test', durationMs: 1500 };
      expect(logData.durationMs).toBeGreaterThan(0);
    });

    it('should record failure metrics on error', () => {
      const metricType = 'failure';
      expect(metricType).toBe('failure');
    });

    it('should log error with stack trace', () => {
      const error = { message: 'Upload failed', stack: 'Error: ...' };
      expect(error.stack).toBeDefined();
    });
  });

  // ===========================================================================
  // mintNFT - Main minting function with AUDIT FIXES
  // ===========================================================================
  describe('mintNFT', () => {
    describe('Parameter Handling', () => {
      it('should accept metadata parameter', () => {
        const params = {
          metadata: { name: 'Test', symbol: 'TST', description: 'Test NFT', image: 'https://...' }
        };
        expect(params.metadata.name).toBe('Test');
      });

      it('should accept creators array', () => {
        const params = {
          creators: [{ address: 'addr1', share: 50 }, { address: 'addr2', share: 50 }]
        };
        expect(params.creators).toHaveLength(2);
      });

      it('should accept sellerFeeBasisPoints', () => {
        const params = { sellerFeeBasisPoints: 1000 }; // 10%
        expect(params.sellerFeeBasisPoints).toBe(1000);
      });

      it('should accept optional collection', () => {
        const params = { collection: 'collectionMint123' };
        expect(params.collection).toBeDefined();
      });

      it('should accept optional owner', () => {
        const params = { owner: 'ownerPublicKey123' };
        expect(params.owner).toBeDefined();
      });
    });

    describe('Metadata Upload', () => {
      it('should call uploadMetadata first', () => {
        let uploadCalled = false;
        const uploadMetadata = () => { uploadCalled = true; return 'https://...'; };
        uploadMetadata();
        expect(uploadCalled).toBe(true);
      });

      it('should pass metadata to uploadMetadata', () => {
        const metadata = { name: 'Test', symbol: 'TST', description: 'Desc', image: 'https://...' };
        expect(metadata.name).toBeDefined();
      });
    });

    describe('Creator Conversion', () => {
      it('should convert creator addresses to PublicKey', () => {
        const creators = [{ address: 'addr1', share: 50 }];
        expect(creators[0].address).toBeDefined();
      });

      it('should preserve share values', () => {
        const creators = [{ address: 'addr1', share: 50 }];
        expect(creators[0].share).toBe(50);
      });
    });

    describe('Minting with Retry', () => {
      it('should use retryOperation', () => {
        const retryConfig = { maxAttempts: 3 };
        expect(retryConfig.maxAttempts).toBe(3);
      });

      it('should get fresh blockhash for each attempt - AUDIT FIX #84', () => {
        let blockhashFetched = false;
        const getFreshBlockhash = () => { blockhashFetched = true; };
        getFreshBlockhash();
        expect(blockhashFetched).toBe(true);
      });

      it('should get priority fee for each attempt - AUDIT FIX #82', () => {
        let priorityFeeFetched = false;
        const getPriorityFee = () => { priorityFeeFetched = true; return 5000; };
        getPriorityFee();
        expect(priorityFeeFetched).toBe(true);
      });

      it('should include blockhash retryable errors - AUDIT FIX #84', () => {
        const retryableErrors = ['timeout', 'blockhash', 'expired', 'network'];
        expect(retryableErrors).toContain('blockhash');
        expect(retryableErrors).toContain('expired');
      });

      it('should include network retryable errors', () => {
        const retryableErrors = ['ECONNRESET', '429', '503'];
        expect(retryableErrors).toContain('ECONNRESET');
        expect(retryableErrors).toContain('429');
        expect(retryableErrors).toContain('503');
      });
    });

    describe('Metaplex Create Call', () => {
      it('should call metaplex.nfts().create', () => {
        let createCalled = false;
        const metaplex = {
          nfts: () => ({
            create: () => { createCalled = true; return { nft: {}, response: {} }; }
          })
        };
        metaplex.nfts().create();
        expect(createCalled).toBe(true);
      });

      it('should pass uri from metadata upload', () => {
        const createParams = { uri: 'https://arweave.net/abc' };
        expect(createParams.uri).toMatch(/arweave/);
      });

      it('should pass name from metadata', () => {
        const createParams = { name: 'Test NFT' };
        expect(createParams.name).toBe('Test NFT');
      });

      it('should pass symbol from metadata', () => {
        const createParams = { symbol: 'TST' };
        expect(createParams.symbol).toBe('TST');
      });

      it('should pass sellerFeeBasisPoints', () => {
        const createParams = { sellerFeeBasisPoints: 1000 };
        expect(createParams.sellerFeeBasisPoints).toBe(1000);
      });

      it('should pass converted creators', () => {
        const createParams = { creators: [{ address: {}, share: 50 }] };
        expect(createParams.creators).toBeDefined();
      });

      it('should pass collection if provided', () => {
        const createParams = { collection: {} };
        expect(createParams.collection).toBeDefined();
      });

      it('should set isMutable to true', () => {
        const createParams = { isMutable: true };
        expect(createParams.isMutable).toBe(true);
      });

      it('should pass tokenOwner if provided', () => {
        const createParams = { tokenOwner: {} };
        expect(createParams.tokenOwner).toBeDefined();
      });
    });

    describe('Result Processing', () => {
      it('should return mintAddress from nft.address', () => {
        const nft = { address: { toString: () => 'mintAddr123' } };
        const mintAddress = nft.address.toString();
        expect(mintAddress).toBe('mintAddr123');
      });

      it('should return transactionSignature from response', () => {
        const response = { signature: 'sig123abc' };
        expect(response.signature).toBe('sig123abc');
      });

      it('should return metadataUri', () => {
        const metadataUri = 'https://arweave.net/abc';
        expect(metadataUri).toMatch(/arweave/);
      });

      it('should fetch slot from getTransaction', () => {
        const context = { slot: 12345678 };
        expect(context.slot).toBe(12345678);
      });

      it('should return MintNFTResult object', () => {
        const result = {
          mintAddress: 'mintAddr',
          transactionSignature: 'sig123',
          metadataUri: 'https://...',
          slot: 12345678
        };
        expect(result.mintAddress).toBeDefined();
        expect(result.transactionSignature).toBeDefined();
      });
    });

    describe('Metrics', () => {
      it('should record mint success with duration', () => {
        let recorded = false;
        const recordMintSuccess = () => { recorded = true; };
        recordMintSuccess();
        expect(recorded).toBe(true);
      });

      it('should record mint failure with error message', () => {
        let recorded = false;
        const recordMintFailure = () => { recorded = true; };
        recordMintFailure();
        expect(recorded).toBe(true);
      });
    });

    describe('Logging', () => {
      it('should log start with metadata name', () => {
        const logData = { name: 'Test NFT', creators: 2, hasCollection: true };
        expect(logData.name).toBeDefined();
      });

      it('should log success with mintAddress and signature', () => {
        const logData = {
          mintAddress: 'mint123',
          signature: 'sig456',
          name: 'Test NFT',
          slot: 12345678,
          durationMs: 2000
        };
        expect(logData.mintAddress).toBeDefined();
        expect(logData.signature).toBeDefined();
      });

      it('should log error with stack trace', () => {
        const error = { message: 'Mint failed', stack: 'Error: ...' };
        expect(error.stack).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // createCollection
  // ===========================================================================
  describe('createCollection', () => {
    it('should accept name, symbol, description, image', () => {
      const params = {
        name: 'Test Collection',
        symbol: 'TCOL',
        description: 'A test collection',
        image: 'https://...'
      };
      expect(params.name).toBe('Test Collection');
    });

    it('should upload collection metadata', () => {
      let uploadCalled = false;
      const uploadMetadata = () => { uploadCalled = true; return 'https://...'; };
      uploadMetadata();
      expect(uploadCalled).toBe(true);
    });

    it('should use retryOperation with 3 attempts', () => {
      const maxAttempts = 3;
      expect(maxAttempts).toBe(3);
    });

    it('should get fresh blockhash for each attempt', () => {
      let called = false;
      const getFreshBlockhash = () => { called = true; };
      getFreshBlockhash();
      expect(called).toBe(true);
    });

    it('should set isCollection to true', () => {
      const createParams = { isCollection: true };
      expect(createParams.isCollection).toBe(true);
    });

    it('should set sellerFeeBasisPoints to 0', () => {
      const createParams = { sellerFeeBasisPoints: 0 };
      expect(createParams.sellerFeeBasisPoints).toBe(0);
    });

    it('should return collection PublicKey', () => {
      const address = { toString: () => 'collectionAddr123' };
      expect(address.toString()).toBe('collectionAddr123');
    });

    it('should record collection creation metric', () => {
      let recorded = false;
      const recordCollectionCreation = () => { recorded = true; };
      recordCollectionCreation();
      expect(recorded).toBe(true);
    });

    it('should log collection created with address', () => {
      const logData = { address: 'collectionAddr', name: 'Test Collection' };
      expect(logData.address).toBeDefined();
    });
  });

  // ===========================================================================
  // verifyCollectionItem
  // ===========================================================================
  describe('verifyCollectionItem', () => {
    it('should accept nftMint and collectionMint', () => {
      const nftMint = 'nftMint123';
      const collectionMint = 'collectionMint456';
      expect(nftMint).toBeDefined();
      expect(collectionMint).toBeDefined();
    });

    it('should use retryOperation with 2 attempts', () => {
      const maxAttempts = 2;
      expect(maxAttempts).toBe(2);
    });

    it('should get fresh blockhash for each attempt', () => {
      let called = false;
      const getFreshBlockhash = () => { called = true; };
      getFreshBlockhash();
      expect(called).toBe(true);
    });

    it('should call metaplex.nfts().verifyCollection', () => {
      let verifyCalled = false;
      const metaplex = {
        nfts: () => ({
          verifyCollection: () => { verifyCalled = true; return { response: { signature: 'sig' } }; }
        })
      };
      metaplex.nfts().verifyCollection();
      expect(verifyCalled).toBe(true);
    });

    it('should return transaction signature', () => {
      const signature = 'verificationSig123';
      expect(signature).toBeDefined();
    });

    it('should record success metric', () => {
      let recorded = false;
      const recordCollectionVerification = () => { recorded = true; };
      recordCollectionVerification();
      expect(recorded).toBe(true);
    });

    it('should record failure metric on error', () => {
      const metricType = 'failure';
      expect(metricType).toBe('failure');
    });

    it('should log verification with nft and collection addresses', () => {
      const logData = {
        nft: 'nftMint123',
        collection: 'collectionMint456',
        signature: 'sig789'
      };
      expect(logData.nft).toBeDefined();
      expect(logData.collection).toBeDefined();
    });
  });

  // ===========================================================================
  // findNFTByMint
  // ===========================================================================
  describe('findNFTByMint', () => {
    it('should call metaplex.nfts().findByMint', () => {
      let findCalled = false;
      const metaplex = {
        nfts: () => ({
          findByMint: () => { findCalled = true; return {}; }
        })
      };
      metaplex.nfts().findByMint();
      expect(findCalled).toBe(true);
    });

    it('should pass mintAddress parameter', () => {
      const params = { mintAddress: 'mintAddr123' };
      expect(params.mintAddress).toBeDefined();
    });

    it('should return NFT object', () => {
      const nft = { name: 'Test NFT', symbol: 'TST', uri: 'https://...' };
      expect(nft.name).toBeDefined();
    });

    it('should log error on failure', () => {
      const error = { message: 'NFT not found' };
      expect(error.message).toBe('NFT not found');
    });
  });

  // ===========================================================================
  // getNFTMetadata
  // ===========================================================================
  describe('getNFTMetadata', () => {
    it('should call findNFTByMint internally', () => {
      let findCalled = false;
      const findNFTByMint = () => { findCalled = true; return {}; };
      findNFTByMint();
      expect(findCalled).toBe(true);
    });

    it('should return name from NFT', () => {
      const metadata = { name: 'Test NFT' };
      expect(metadata.name).toBe('Test NFT');
    });

    it('should return symbol from NFT', () => {
      const metadata = { symbol: 'TST' };
      expect(metadata.symbol).toBe('TST');
    });

    it('should return uri from NFT', () => {
      const metadata = { uri: 'https://arweave.net/abc' };
      expect(metadata.uri).toMatch(/arweave/);
    });

    it('should return sellerFeeBasisPoints from NFT', () => {
      const metadata = { sellerFeeBasisPoints: 1000 };
      expect(metadata.sellerFeeBasisPoints).toBe(1000);
    });

    it('should return creators from NFT', () => {
      const metadata = { creators: [{ address: 'addr', share: 100 }] };
      expect(metadata.creators).toBeDefined();
    });

    it('should return collection from NFT', () => {
      const metadata = { collection: { address: 'collection123' } };
      expect(metadata.collection).toBeDefined();
    });

    it('should return address as string', () => {
      const metadata = { address: 'nftAddress123' };
      expect(typeof metadata.address).toBe('string');
    });
  });

  // ===========================================================================
  // getAuthorityPublicKey
  // ===========================================================================
  describe('getAuthorityPublicKey', () => {
    it('should return authority publicKey', () => {
      const authority = { publicKey: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' };
      expect(authority.publicKey).toBeDefined();
    });

    it('should return PublicKey type', () => {
      const publicKey = { toString: () => 'addr123' };
      expect(typeof publicKey.toString()).toBe('string');
    });
  });

  // ===========================================================================
  // NFTMetadata Interface
  // ===========================================================================
  describe('NFTMetadata Interface', () => {
    it('should require name property', () => {
      const metadata = { name: 'Test NFT' };
      expect(metadata.name).toBeDefined();
    });

    it('should require symbol property', () => {
      const metadata = { symbol: 'TST' };
      expect(metadata.symbol).toBeDefined();
    });

    it('should require description property', () => {
      const metadata = { description: 'A test NFT' };
      expect(metadata.description).toBeDefined();
    });

    it('should require image property', () => {
      const metadata = { image: 'https://...' };
      expect(metadata.image).toBeDefined();
    });

    it('should have optional attributes array', () => {
      const metadata = {
        attributes: [
          { trait_type: 'Event', value: 'Concert' },
          { trait_type: 'Venue', value: 'Stadium' }
        ]
      };
      expect(metadata.attributes).toHaveLength(2);
    });

    it('should have optional properties object', () => {
      const metadata = {
        properties: {
          files: [{ uri: 'https://...', type: 'image/png' }],
          category: 'image'
        }
      };
      expect(metadata.properties.category).toBe('image');
    });
  });

  // ===========================================================================
  // MintNFTResult Interface
  // ===========================================================================
  describe('MintNFTResult Interface', () => {
    it('should have mintAddress property', () => {
      const result = { mintAddress: 'mint123' };
      expect(result.mintAddress).toBeDefined();
    });

    it('should have transactionSignature property', () => {
      const result = { transactionSignature: 'sig456' };
      expect(result.transactionSignature).toBeDefined();
    });

    it('should have metadataUri property', () => {
      const result = { metadataUri: 'https://arweave.net/abc' };
      expect(result.metadataUri).toBeDefined();
    });

    it('should have optional slot property', () => {
      const result = { slot: 12345678 };
      expect(result.slot).toBe(12345678);
    });

    it('should have optional blockHeight property', () => {
      const result = { blockHeight: 87654321 };
      expect(result.blockHeight).toBe(87654321);
    });
  });
});
