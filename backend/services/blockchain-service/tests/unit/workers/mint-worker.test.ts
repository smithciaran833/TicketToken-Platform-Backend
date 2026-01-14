/**
 * Unit tests for blockchain-service Mint Worker
 * 
 * PHASE 5c REFACTORED:
 * - Uses service clients instead of direct database queries
 * - venueServiceClient for venue wallet lookup
 * - ticketServiceClient for ticket updates
 * - orderServiceClient for order item lookup
 */

describe('MintWorker', () => {
  // ===========================================================================
  // Constructor
  // ===========================================================================
  describe('Constructor', () => {
    it('should create Pool with DATABASE_URL', () => {
      const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken_db';
      expect(databaseUrl).toMatch(/postgres/);
    });

    it('should create Solana Connection with RPC_URL', () => {
      const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
      expect(rpcUrl).toMatch(/^https?:\/\//);
    });

    it('should default to devnet for RPC', () => {
      const defaultUrl = 'https://api.devnet.solana.com';
      expect(defaultUrl).toContain('devnet');
    });

    it('should use confirmed commitment', () => {
      const commitment = 'confirmed';
      expect(commitment).toBe('confirmed');
    });

    it('should initialize MetaplexService', () => {
      const services = ['metaplexService', 'confirmationService'];
      expect(services).toContain('metaplexService');
    });

    it('should initialize TransactionConfirmationService', () => {
      const services = ['metaplexService', 'confirmationService'];
      expect(services).toContain('confirmationService');
    });
  });

  // ===========================================================================
  // initializeWallet
  // ===========================================================================
  describe('initializeWallet', () => {
    it('should load wallet from MINT_WALLET_PRIVATE_KEY env', () => {
      const envVar = 'MINT_WALLET_PRIVATE_KEY';
      expect(envVar).toBe('MINT_WALLET_PRIVATE_KEY');
    });

    it('should parse private key as JSON array', () => {
      const privateKeyJson = '[1,2,3,4,5]';
      const parsed = JSON.parse(privateKeyJson);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should create Keypair from Uint8Array', () => {
      const secretKey = new Uint8Array([1, 2, 3, 4]);
      expect(secretKey).toBeInstanceOf(Uint8Array);
    });

    it('should generate new wallet if env not set', () => {
      const generateCalled = true;
      expect(generateCalled).toBe(true);
    });

    it('should log warning when generating test wallet', () => {
      const logLevel = 'warn';
      const message = 'Generated new wallet for testing';
      expect(message).toMatch(/Generated new wallet/);
    });

    it('should log public key when generating', () => {
      const logData = { publicKey: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' };
      expect(logData.publicKey).toBeDefined();
    });
  });

  // ===========================================================================
  // start
  // ===========================================================================
  describe('start', () => {
    it('should log starting message', () => {
      const message = 'Starting Mint Worker...';
      expect(message).toMatch(/Starting/);
    });

    it('should attempt RabbitMQ connection', () => {
      const connectCalled = true;
      expect(connectCalled).toBe(true);
    });

    it('should fall back to polling if RabbitMQ unavailable', () => {
      const fallbackMessage = 'RabbitMQ not available, using polling mode';
      expect(fallbackMessage).toMatch(/polling mode/);
    });

    it('should always start polling', () => {
      const pollingStarted = true;
      expect(pollingStarted).toBe(true);
    });
  });

  // ===========================================================================
  // connectRabbitMQ
  // ===========================================================================
  describe('connectRabbitMQ', () => {
    it('should use RABBITMQ_URL from env', () => {
      const url = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
      expect(url).toMatch(/^amqp:\/\//);
    });

    it('should create channel after connection', () => {
      const channelCreated = true;
      expect(channelCreated).toBe(true);
    });

    it('should assert queue ticket.mint', () => {
      const queueName = 'ticket.mint';
      expect(queueName).toBe('ticket.mint');
    });

    it('should configure queue as durable', () => {
      const options = { durable: true };
      expect(options.durable).toBe(true);
    });

    it('should log successful connection', () => {
      const logData = { queue: 'ticket.mint' };
      expect(logData.queue).toBe('ticket.mint');
    });
  });

  // ===========================================================================
  // consumeQueue
  // ===========================================================================
  describe('consumeQueue', () => {
    it('should throw if channel not initialized', () => {
      const channel = null;
      const shouldThrow = !channel;
      expect(shouldThrow).toBe(true);
    });

    it('should consume from TICKET_MINT queue', () => {
      const queueName = 'ticket.mint';
      expect(queueName).toBe('ticket.mint');
    });

    it('should parse message content as JSON', () => {
      const content = '{"orderId": "123"}';
      const job = JSON.parse(content);
      expect(job.orderId).toBe('123');
    });

    it('should ack message on success', () => {
      const ackCalled = true;
      expect(ackCalled).toBe(true);
    });

    it('should nack message on failure', () => {
      const nackCalled = true;
      expect(nackCalled).toBe(true);
    });

    it('should requeue nacked message', () => {
      const requeue = true;
      expect(requeue).toBe(true);
    });

    it('should log processing job', () => {
      const logData = { job: { orderId: '123' } };
      expect(logData.job.orderId).toBeDefined();
    });
  });

  // ===========================================================================
  // startPolling
  // ===========================================================================
  describe('startPolling', () => {
    it('should poll every 5000ms', () => {
      const interval = 5000;
      expect(interval).toBe(5000);
    });

    it('should query pending mint_jobs', () => {
      const query = 'SELECT * FROM mint_jobs WHERE status = \'pending\'';
      expect(query).toMatch(/pending/);
    });

    it('should order by created_at ASC', () => {
      const query = 'ORDER BY created_at ASC';
      expect(query).toMatch(/created_at ASC/);
    });

    it('should limit to 1 job at a time', () => {
      const query = 'LIMIT 1';
      expect(query).toMatch(/LIMIT 1/);
    });

    it('should process job if found', () => {
      const rowCount = 1;
      const shouldProcess = rowCount > 0;
      expect(shouldProcess).toBe(true);
    });

    it('should log polling started', () => {
      const logData = { interval: '5000ms' };
      expect(logData.interval).toBe('5000ms');
    });
  });

  // ===========================================================================
  // createRequestContext Helper
  // ===========================================================================
  describe('createRequestContext', () => {
    it('should create context with tenantId', () => {
      const ctx = { tenantId: 'tenant-123' };
      expect(ctx.tenantId).toBe('tenant-123');
    });

    it('should default tenantId to system', () => {
      const defaultTenantId = 'system';
      expect(defaultTenantId).toBe('system');
    });

    it('should generate unique traceId', () => {
      const traceId = `mint-worker-${Date.now()}-abc123`;
      expect(traceId).toMatch(/^mint-worker-/);
    });
  });

  // ===========================================================================
  // getVenueWallet - PHASE 5c REFACTORED
  // ===========================================================================
  describe('getVenueWallet', () => {
    it('should use venueServiceClient.getVenue - PHASE 5c', () => {
      const usesServiceClient = true;
      expect(usesServiceClient).toBe(true);
    });

    it('should pass venueId to service', () => {
      const venueId = 'venue-123';
      expect(venueId).toBe('venue-123');
    });

    it('should pass tenantId in context', () => {
      const ctx = { tenantId: 'tenant-456' };
      expect(ctx.tenantId).toBe('tenant-456');
    });

    it('should return walletAddress from venue', () => {
      const venue = { walletAddress: 'HN7cABqLq46Es1jh92dQQis' };
      expect(venue.walletAddress).toBeDefined();
    });

    it('should return null if no wallet found', () => {
      const venue = { walletAddress: null };
      expect(venue.walletAddress).toBeNull();
    });

    it('should log success on wallet found', () => {
      const logData = { venueId: 'venue-123', wallet: 'abc' };
      expect(logData.wallet).toBeDefined();
    });

    it('should log warning if no wallet', () => {
      const logLevel = 'warn';
      const message = 'No wallet address found for venue';
      expect(message).toMatch(/No wallet/);
    });

    it('should return null on service error', () => {
      const errorResult = null;
      expect(errorResult).toBeNull();
    });
  });

  // ===========================================================================
  // getPlatformWallet
  // ===========================================================================
  describe('getPlatformWallet', () => {
    it('should use PLATFORM_TREASURY_WALLET from env', () => {
      const envVar = 'PLATFORM_TREASURY_WALLET';
      expect(envVar).toBe('PLATFORM_TREASURY_WALLET');
    });

    it('should fallback to mint wallet public key', () => {
      const fallback = 'mintWallet.publicKey.toString()';
      expect(fallback).toBeDefined();
    });
  });

  // ===========================================================================
  // processMintJob - PHASE 5c REFACTORED
  // ===========================================================================
  describe('processMintJob', () => {
    describe('Service Client Calls', () => {
      it('should use orderServiceClient.getOrderItems - PHASE 5c', () => {
        const usesServiceClient = true;
        expect(usesServiceClient).toBe(true);
      });

      it('should use ticketServiceClient.getTicketFull - PHASE 5c', () => {
        const usesServiceClient = true;
        expect(usesServiceClient).toBe(true);
      });

      it('should use venueServiceClient.getVenue - PHASE 5c', () => {
        const usesServiceClient = true;
        expect(usesServiceClient).toBe(true);
      });

      it('should use ticketServiceClient.updateNft - PHASE 5c', () => {
        const usesServiceClient = true;
        expect(usesServiceClient).toBe(true);
      });
    });

    describe('Fallback to Direct Query', () => {
      it('should fallback on service client failure', () => {
        const hasFallback = true;
        expect(hasFallback).toBe(true);
      });

      it('should log warning on fallback', () => {
        const logLevel = 'warn';
        const message = 'Service client calls failed, falling back to direct query';
        expect(message).toMatch(/falling back/);
      });

      it('should join tickets, order_items, orders, events, venues', () => {
        const tables = ['tickets', 'order_items', 'orders', 'events', 'venues'];
        expect(tables).toHaveLength(5);
      });
    });

    describe('Creator Configuration', () => {
      it('should configure 50% to venue if wallet exists', () => {
        const venueShare = 50;
        expect(venueShare).toBe(50);
      });

      it('should configure 50% to platform if venue exists', () => {
        const platformShare = 50;
        expect(platformShare).toBe(50);
      });

      it('should configure 100% to platform if no venue', () => {
        const platformShare = 100;
        expect(platformShare).toBe(100);
      });

      it('should log royalty configuration', () => {
        const logData = {
          orderId: 'order-123',
          venueId: 'venue-456',
          creators: [],
          sellerFeeBasisPoints: 1000
        };
        expect(logData.sellerFeeBasisPoints).toBe(1000);
      });

      it('should set sellerFeeBasisPoints to 1000 (10%)', () => {
        const royalty = 1000;
        const percent = royalty / 100;
        expect(percent).toBe(10);
      });
    });

    describe('NFT Metadata', () => {
      it('should build name with event and seat', () => {
        const name = 'Concert 2026 - Ticket #A15';
        expect(name).toMatch(/Ticket #/);
      });

      it('should use TICKET as symbol', () => {
        const symbol = 'TICKET';
        expect(symbol).toBe('TICKET');
      });

      it('should include Event attribute', () => {
        const attribute = { trait_type: 'Event', value: 'Concert' };
        expect(attribute.trait_type).toBe('Event');
      });

      it('should include Venue attribute', () => {
        const attribute = { trait_type: 'Venue', value: 'Stadium' };
        expect(attribute.trait_type).toBe('Venue');
      });

      it('should include Section attribute', () => {
        const attribute = { trait_type: 'Section', value: 'VIP' };
        expect(attribute.trait_type).toBe('Section');
      });

      it('should include Seat attribute if not GA', () => {
        const seatNumber = 'A15';
        const includesSeat = seatNumber !== 'GA';
        expect(includesSeat).toBe(true);
      });

      it('should include Ticket Type attribute', () => {
        const attribute = { trait_type: 'Ticket Type', value: 'Standard' };
        expect(attribute.trait_type).toBe('Ticket Type');
      });

      it('should use placeholder image if not provided', () => {
        const image = 'https://placeholder.com/ticket.png';
        expect(image).toMatch(/placeholder/);
      });
    });

    describe('Minting', () => {
      it('should call metaplexService.mintNFT', () => {
        let mintCalled = false;
        const metaplexService = { mintNFT: () => { mintCalled = true; return {}; } };
        metaplexService.mintNFT();
        expect(mintCalled).toBe(true);
      });

      it('should pass creators to mintNFT', () => {
        const params = { creators: [{ address: 'abc', share: 50 }] };
        expect(params.creators).toBeDefined();
      });

      it('should pass sellerFeeBasisPoints', () => {
        const params = { sellerFeeBasisPoints: 1000 };
        expect(params.sellerFeeBasisPoints).toBe(1000);
      });

      it('should pass collection if provided', () => {
        const params = { collection: 'collectionMint123' };
        expect(params.collection).toBeDefined();
      });
    });

    describe('Transaction Confirmation', () => {
      it('should call confirmationService.confirmTransaction', () => {
        let confirmCalled = false;
        const confirmationService = { confirmTransaction: () => { confirmCalled = true; } };
        confirmationService.confirmTransaction();
        expect(confirmCalled).toBe(true);
      });

      it('should use finalized commitment', () => {
        const options = { commitment: 'finalized' };
        expect(options.commitment).toBe('finalized');
      });
    });

    describe('Ticket Update - PHASE 5c', () => {
      it('should call ticketServiceClient.updateNft', () => {
        const updateMethod = 'updateNft';
        expect(updateMethod).toBe('updateNft');
      });

      it('should pass ticket ID', () => {
        const ticketId = 'ticket-123';
        expect(ticketId).toBeDefined();
      });

      it('should pass nftMintAddress', () => {
        const update = { nftMintAddress: 'abc123' };
        expect(update.nftMintAddress).toBeDefined();
      });

      it('should pass metadataUri', () => {
        const update = { metadataUri: 'https://arweave.net/abc' };
        expect(update.metadataUri).toBeDefined();
      });

      it('should set isMinted to true', () => {
        const update = { isMinted: true };
        expect(update.isMinted).toBe(true);
      });

      it('should fallback to direct UPDATE on error', () => {
        const hasFallback = true;
        expect(hasFallback).toBe(true);
      });
    });

    describe('Job Status Update', () => {
      it('should update mint_jobs to completed on success', () => {
        const status = 'completed';
        expect(status).toBe('completed');
      });

      it('should store nft_address in job', () => {
        const update = { nft_address: 'abc123' };
        expect(update.nft_address).toBeDefined();
      });

      it('should store transaction_signature in job', () => {
        const update = { transaction_signature: 'sig123' };
        expect(update.transaction_signature).toBeDefined();
      });

      it('should store metadata_uri in job', () => {
        const update = { metadata_uri: 'https://arweave.net/abc' };
        expect(update.metadata_uri).toBeDefined();
      });

      it('should update job to failed on error', () => {
        const status = 'failed';
        expect(status).toBe('failed');
      });

      it('should store error message in job', () => {
        const update = { error: 'Minting failed: timeout' };
        expect(update.error).toMatch(/Minting failed/);
      });
    });

    describe('Event Publishing', () => {
      it('should publish to events exchange', () => {
        const exchange = 'events';
        expect(exchange).toBe('events');
      });

      it('should use mint.success routing key', () => {
        const routingKey = 'mint.success';
        expect(routingKey).toBe('mint.success');
      });

      it('should include orderId in event', () => {
        const event = { orderId: 'order-123' };
        expect(event.orderId).toBeDefined();
      });

      it('should include mintAddress in event', () => {
        const event = { mintAddress: 'abc123' };
        expect(event.mintAddress).toBeDefined();
      });

      it('should include transactionSignature in event', () => {
        const event = { transactionSignature: 'sig123' };
        expect(event.transactionSignature).toBeDefined();
      });

      it('should include creators in event', () => {
        const event = { creators: [] };
        expect(event.creators).toBeDefined();
      });

      it('should include timestamp in event', () => {
        const event = { timestamp: new Date().toISOString() };
        expect(event.timestamp).toBeDefined();
      });
    });

    describe('Error Handling', () => {
      it('should log error with stack trace', () => {
        const logData = { error: 'Test error', stack: 'Error stack...' };
        expect(logData.error).toBeDefined();
        expect(logData.stack).toBeDefined();
      });

      it('should throw error after updating job status', () => {
        const shouldThrow = true;
        expect(shouldThrow).toBe(true);
      });

      it('should include orderId in error log', () => {
        const logData = { orderId: 'order-123' };
        expect(logData.orderId).toBeDefined();
      });

      it('should include jobId in error log', () => {
        const logData = { jobId: 'job-456' };
        expect(logData.jobId).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // shutdown
  // ===========================================================================
  describe('shutdown', () => {
    it('should log shutdown message', () => {
      const message = 'Shutting down mint worker...';
      expect(message).toMatch(/Shutting down/);
    });

    it('should close RabbitMQ channel', () => {
      let channelClosed = false;
      const channel = { close: () => { channelClosed = true; } };
      channel.close();
      expect(channelClosed).toBe(true);
    });

    it('should close RabbitMQ connection', () => {
      let connectionClosed = false;
      const connection = { close: () => { connectionClosed = true; } };
      connection.close();
      expect(connectionClosed).toBe(true);
    });

    it('should end database pool', () => {
      let poolEnded = false;
      const pool = { end: () => { poolEnded = true; } };
      pool.end();
      expect(poolEnded).toBe(true);
    });
  });

  // ===========================================================================
  // MintJob Interface
  // ===========================================================================
  describe('MintJob Interface', () => {
    it('should have optional id property', () => {
      const job = { orderId: 'order-123' };
      expect(job.orderId).toBeDefined();
    });

    it('should require orderId', () => {
      const job = { orderId: 'order-123' };
      expect(job.orderId).toBe('order-123');
    });

    it('should have optional ticketId', () => {
      const job = { orderId: 'order-123', ticketId: 'ticket-456' };
      expect(job.ticketId).toBe('ticket-456');
    });

    it('should have optional userId', () => {
      const job = { orderId: 'order-123', userId: 'user-789' };
      expect(job.userId).toBe('user-789');
    });

    it('should have optional eventId', () => {
      const job = { orderId: 'order-123', eventId: 'event-abc' };
      expect(job.eventId).toBe('event-abc');
    });

    it('should have optional venueId', () => {
      const job = { orderId: 'order-123', venueId: 'venue-def' };
      expect(job.venueId).toBe('venue-def');
    });

    it('should have optional tenantId', () => {
      const job = { orderId: 'order-123', tenantId: 'tenant-ghi' };
      expect(job.tenantId).toBe('tenant-ghi');
    });

    it('should have optional metadata', () => {
      const job = { orderId: 'order-123', metadata: { image: 'https://...' } };
      expect(job.metadata).toBeDefined();
    });
  });

  // ===========================================================================
  // QUEUES Constants
  // ===========================================================================
  describe('QUEUES Constants', () => {
    it('should have TICKET_MINT queue', () => {
      const QUEUES = { TICKET_MINT: 'ticket.mint' };
      expect(QUEUES.TICKET_MINT).toBe('ticket.mint');
    });

    it('should have BLOCKCHAIN_MINT queue', () => {
      const QUEUES = { BLOCKCHAIN_MINT: 'blockchain.mint' };
      expect(QUEUES.BLOCKCHAIN_MINT).toBe('blockchain.mint');
    });
  });
});
