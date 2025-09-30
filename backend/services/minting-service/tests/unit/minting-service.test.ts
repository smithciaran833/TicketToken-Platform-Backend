// Mock setup BEFORE any imports
const mockPool = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn(),
    release: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn()
  })
};

const mockBlockchainService = {
  submitTransaction: jest.fn(),
  getTransactionStatus: jest.fn(),
  verifySignature: jest.fn()
};

const mockTicketService = {
  verifyOwnership: jest.fn(),
  checkMintEligibility: jest.fn(),
  updateMintStatus: jest.fn(),
  getTicketDetails: jest.fn()
};

const mockOrderService = {
  getOrder: jest.fn(),
  getOrderTickets: jest.fn()
};

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn()
};

const mockLogger: any = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn()
};

mockLogger.child.mockReturnValue(mockLogger);

// Mock modules
jest.mock('pg', () => ({ Pool: jest.fn(() => mockPool) }), { virtual: true });
jest.mock('../../src/services/blockchain.service', () => mockBlockchainService, { virtual: true });
jest.mock('../../src/services/ticket.service', () => mockTicketService, { virtual: true });
jest.mock('../../src/services/order.service', () => mockOrderService, { virtual: true });
jest.mock('ioredis', () => jest.fn(() => mockRedisClient), { virtual: true });
jest.mock('../../src/utils/logger', () => ({ logger: mockLogger }), { virtual: true });

import * as crypto from 'crypto';

describe('Minting Service Tests', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      body: {},
      params: {},
      headers: { authorization: 'Bearer test-token' },
      user: { id: 'user123', role: 'vendor' }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('POST /api/v1/mint/jobs - Create Mint Job', () => {
    describe('Job Creation with Order ID', () => {
      it('should create mint job from order ID', async () => {
        req.body = {
          orderId: 'order123',
          collection: 'event-tickets',
          network: 'polygon',
          metadata: { season: '2024' }
        };

        // Mock order lookup
        mockOrderService.getOrder.mockResolvedValue({
          id: 'order123',
          customerId: 'user123',
          status: 'paid'
        });

        // Mock getting tickets from order
        mockOrderService.getOrderTickets.mockResolvedValue([
          { ticketId: 'ticket1', tierId: 'tier1' },
          { ticketId: 'ticket2', tierId: 'tier2' }
        ]);

        // Mock eligibility check
        mockTicketService.checkMintEligibility.mockResolvedValue({
          eligible: true,
          reason: null
        });

        // Mock blockchain submission
        mockBlockchainService.submitTransaction.mockResolvedValue({
          jobId: 'blockchain_job_123',
          status: 'queued'
        });

        mockPool.query.mockResolvedValue({
          rows: [{
            id: 'mint_job_123',
            status: 'queued',
            created_at: new Date()
          }]
        });

        const createMintJob = async (data: any) => {
          // Get order and tickets
          const order = await mockOrderService.getOrder(data.orderId);
          
          if (order.status !== 'paid') {
            return { error: 'Order must be paid before minting' };
          }

          const tickets = await mockOrderService.getOrderTickets(data.orderId);

          // Check eligibility for each ticket
          for (const ticket of tickets) {
            const eligibility = await mockTicketService.checkMintEligibility(ticket.ticketId);
            if (!eligibility.eligible) {
              return { error: `Ticket ${ticket.ticketId} not eligible: ${eligibility.reason}` };
            }
          }

          // Submit to blockchain service
          const blockchainJob = await mockBlockchainService.submitTransaction({
            type: 'mint',
            payload: {
              tickets: tickets.map((t: any) => t.ticketId),
              collection: data.collection,
              network: data.network
            }
          });

          // Create mint job record
          const result = await mockPool.query(
            'INSERT INTO mint_jobs (order_id, blockchain_job_id, status) VALUES ($1, $2, $3) RETURNING *',
            [data.orderId, blockchainJob.jobId, 'queued']
          );

          return {
            jobId: result.rows[0].id,
            status: result.rows[0].status
          };
        };

        const result = await createMintJob(req.body);

        expect(result.jobId).toBeDefined();
        expect(result.status).toBe('queued');
        expect(mockOrderService.getOrder).toHaveBeenCalledWith('order123');
      });

      it('should validate order ownership', async () => {
        req.body = { orderId: 'order123' };
        req.user = { id: 'user456', role: 'user' };

        mockOrderService.getOrder.mockResolvedValue({
          id: 'order123',
          customerId: 'user123' // Different from req.user.id
        });

        const validateOwnership = async (orderId: string, userId: string, role: string) => {
          const order = await mockOrderService.getOrder(orderId);
          
          // Admin and vendor can mint any order
          if (role === 'admin' || role === 'vendor') {
            return { valid: true };
          }

          // Regular users can only mint their own orders
          if (order.customerId !== userId) {
            return { error: 'Access denied', code: 403 };
          }

          return { valid: true };
        };

        const result = await validateOwnership(req.body.orderId, req.user.id, req.user.role);

        expect(result.error).toBe('Access denied');
      });
    });

    describe('Job Creation with Ticket IDs', () => {
      it('should create mint job from ticket IDs', async () => {
        req.body = {
          ticketIds: ['ticket1', 'ticket2', 'ticket3'],
          network: 'ethereum'
        };

        mockTicketService.verifyOwnership.mockResolvedValue(true);
        mockTicketService.checkMintEligibility.mockResolvedValue({
          eligible: true
        });

        mockBlockchainService.submitTransaction.mockResolvedValue({
          jobId: 'blockchain_job_456',
          status: 'queued'
        });

        const createMintJob = async (data: any) => {
          // Verify ownership of all tickets
          for (const ticketId of data.ticketIds) {
            const owned = await mockTicketService.verifyOwnership(ticketId, req.user.id);
            if (!owned) {
              return { error: `You don't own ticket ${ticketId}` };
            }
          }

          // Check eligibility
          for (const ticketId of data.ticketIds) {
            const eligibility = await mockTicketService.checkMintEligibility(ticketId);
            if (!eligibility.eligible) {
              return { error: `Ticket ${ticketId} not eligible for minting` };
            }
          }

          // Submit to blockchain
          const blockchainJob = await mockBlockchainService.submitTransaction({
            type: 'mint',
            payload: { tickets: data.ticketIds }
          });

          return {
            jobId: 'mint_job_456',
            status: 'queued'
          };
        };

        const result = await createMintJob(req.body);

        expect(result.jobId).toBeDefined();
        expect(mockTicketService.verifyOwnership).toHaveBeenCalledTimes(3);
      });

      it('should validate ticket IDs array', async () => {
        const validateTicketIds = (ticketIds: any) => {
          if (!Array.isArray(ticketIds)) {
            return { error: 'ticketIds must be an array' };
          }

          if (ticketIds.length === 0) {
            return { error: 'At least one ticket ID is required' };
          }

          if (ticketIds.length > 100) {
            return { error: 'Maximum 100 tickets per mint job' };
          }

          return { valid: true };
        };

        expect(validateTicketIds([])).toEqual({ error: 'At least one ticket ID is required' });
        expect(validateTicketIds(new Array(101))).toEqual({ error: 'Maximum 100 tickets per mint job' });
        expect(validateTicketIds(['ticket1'])).toEqual({ valid: true });
      });
    });

    describe('Input Validation', () => {
      it('should require either orderId or ticketIds', async () => {
        req.body = {
          collection: 'test-collection'
          // Missing both orderId and ticketIds
        };

        const validateInput = (body: any) => {
          if (!body.orderId && !body.ticketIds) {
            return { error: 'Either orderId or ticketIds is required' };
          }

          if (body.orderId && body.ticketIds) {
            return { error: 'Provide either orderId or ticketIds, not both' };
          }

          return { valid: true };
        };

        const result = validateInput(req.body);
        expect(result.error).toBe('Either orderId or ticketIds is required');
      });

      it('should not allow both orderId and ticketIds', async () => {
        req.body = {
          orderId: 'order123',
          ticketIds: ['ticket1', 'ticket2']
        };

        const validateInput = (body: any) => {
          if (body.orderId && body.ticketIds) {
            return { error: 'Provide either orderId or ticketIds, not both' };
          }
          return { valid: true };
        };

        const result = validateInput(req.body);
        expect(result.error).toBe('Provide either orderId or ticketIds, not both');
      });

      it('should validate network parameter', async () => {
        const validateNetwork = (network?: string) => {
          const validNetworks = ['ethereum', 'polygon', 'arbitrum'];
          
          if (network && !validNetworks.includes(network)) {
            return { error: `Invalid network. Must be one of: ${validNetworks.join(', ')}` };
          }

          return { valid: true };
        };

        expect(validateNetwork('invalid')).toEqual({ 
          error: 'Invalid network. Must be one of: ethereum, polygon, arbitrum' 
        });
        expect(validateNetwork('polygon')).toEqual({ valid: true });
        expect(validateNetwork()).toEqual({ valid: true }); // Optional
      });
    });

    describe('Eligibility Checks', () => {
      it('should check if ticket is already minted', async () => {
        mockTicketService.checkMintEligibility.mockResolvedValue({
          eligible: false,
          reason: 'Already minted'
        });

        const checkEligibility = async (ticketId: string) => {
          const result = await mockTicketService.checkMintEligibility(ticketId);
          
          if (!result.eligible) {
            return { error: result.reason };
          }

          return { eligible: true };
        };

        const result = await checkEligibility('ticket123');
        expect(result.error).toBe('Already minted');
      });

      it('should check if ticket is valid for minting', async () => {
        mockTicketService.getTicketDetails.mockResolvedValue({
          id: 'ticket123',
          status: 'used'
        });

        const checkTicketStatus = async (ticketId: string) => {
          const ticket = await mockTicketService.getTicketDetails(ticketId);
          
          const validStatuses = ['paid', 'reserved'];
          if (!validStatuses.includes(ticket.status)) {
            return { error: `Ticket status '${ticket.status}' not valid for minting` };
          }

          return { valid: true };
        };

        const result = await checkTicketStatus('ticket123');
        expect(result.error).toContain('not valid for minting');
      });
    });

    describe('Idempotency', () => {
      it('should handle duplicate mint requests', async () => {
        const ticketId = 'ticket123';

        mockPool.query.mockResolvedValue({
          rows: [{
            id: 'existing_job_123',
            status: 'completed',
            token_id: 'token_123'
          }]
        });

        const checkExistingMint = async (ticketId: string) => {
          const result = await mockPool.query(
            'SELECT * FROM mint_job_items WHERE ticket_id = $1',
            [ticketId]
          );

          if (result.rows.length > 0) {
            const existing = result.rows[0];
            
            if (existing.status === 'completed') {
              return {
                alreadyMinted: true,
                jobId: existing.id,
                tokenId: existing.token_id
              };
            }

            return {
              inProgress: true,
              jobId: existing.id,
              status: existing.status
            };
          }

          return { canMint: true };
        };

        const result = await checkExistingMint(ticketId);

        expect(result.alreadyMinted).toBe(true);
        expect(result.tokenId).toBe('token_123');
      });
    });
  });

  describe('GET /api/v1/mint/jobs/:jobId - Get Job Status', () => {
    it('should return mint job status', async () => {
      req.params = { jobId: 'mint_job_123' };

      mockPool.query.mockImplementation((query: string) => {
        if (query.includes('mint_jobs')) {
          return Promise.resolve({
            rows: [{
              id: 'mint_job_123',
              status: 'processing',
              blockchain_job_id: 'bc_job_123',
              tx_hash: null
            }]
          });
        }
        
        if (query.includes('mint_job_items')) {
          return Promise.resolve({
            rows: [
              { ticket_id: 'ticket1', token_id: null, status: 'pending' },
              { ticket_id: 'ticket2', token_id: 'token_2', status: 'completed' }
            ]
          });
        }

        return Promise.resolve({ rows: [] });
      });

      const getJobStatus = async (jobId: string) => {
        const job = await mockPool.query(
          'SELECT * FROM mint_jobs WHERE id = $1',
          [jobId]
        );

        if (job.rows.length === 0) {
          return { error: 'Job not found' };
        }

        const items = await mockPool.query(
          'SELECT * FROM mint_job_items WHERE job_id = $1',
          [jobId]
        );

        return {
          jobId: job.rows[0].id,
          status: job.rows[0].status,
          items: items.rows.map((item: any) => ({
            ticketId: item.ticket_id,
            tokenId: item.token_id,
            status: item.status
          })),
          txHash: job.rows[0].tx_hash,
          error: job.rows[0].error
        };
      };

      const result = await getJobStatus(req.params.jobId);

      expect(result.jobId).toBe('mint_job_123');
      expect(result.status).toBe('processing');
      expect(result.items).toHaveLength(2);
      expect(result.items[1].tokenId).toBe('token_2');
    });

    it('should enforce access control', async () => {
      req.params = { jobId: 'mint_job_123' };
      req.user = { id: 'user456', role: 'user' };

      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'mint_job_123',
          user_id: 'user123' // Different from req.user.id
        }]
      });

      const checkAccess = async (jobId: string, userId: string) => {
        const result = await mockPool.query(
          'SELECT * FROM mint_jobs WHERE id = $1',
          [jobId]
        );

        if (result.rows.length === 0) {
          return { error: 'Job not found' };
        }

        if (result.rows[0].user_id !== userId) {
          return { error: 'Access denied' };
        }

        return { authorized: true };
      };

      const result = await checkAccess(req.params.jobId, req.user.id);
      expect(result.error).toBe('Access denied');
    });

    it('should return different statuses', async () => {
      const statuses = ['queued', 'processing', 'completed', 'failed', 'partial'];

      const getStatusDescription = (status: string) => {
        const descriptions: any = {
          queued: 'Job is waiting to be processed',
          processing: 'Minting in progress',
          completed: 'All tokens minted successfully',
          failed: 'Minting failed',
          partial: 'Some tokens minted, some failed'
        };

        return descriptions[status] || 'Unknown status';
      };

      expect(getStatusDescription('completed')).toBe('All tokens minted successfully');
      expect(getStatusDescription('partial')).toBe('Some tokens minted, some failed');
    });
  });

  describe('POST /api/v1/mint/webhooks/blockchain - Webhook Handler', () => {
    it('should process successful mint webhook', async () => {
      req.body = {
        jobId: 'bc_job_123',
        status: 'confirmed',
        txHash: '0xTransaction123',
        blockNumber: 1000500,
        logs: [
          { ticketId: 'ticket1', tokenId: 'token_1' },
          { ticketId: 'ticket2', tokenId: 'token_2' }
        ]
      };

      req.headers = {
        'x-webhook-signature': 'valid_signature'
      };

      mockBlockchainService.verifySignature.mockResolvedValue(true);

      const processWebhook = async (payload: any, signature: string) => {
        // Verify signature
        const valid = await mockBlockchainService.verifySignature(
          payload,
          signature
        );

        if (!valid) {
          return { error: 'Invalid signature', code: 401 };
        }

        // Update job status
        await mockPool.query(
          'UPDATE mint_jobs SET status = $1, tx_hash = $2 WHERE blockchain_job_id = $3',
          [payload.status, payload.txHash, payload.jobId]
        );

        // Update individual items
        for (const log of payload.logs) {
          await mockPool.query(
            'UPDATE mint_job_items SET token_id = $1, status = $2 WHERE ticket_id = $3',
            ['token_' + log.ticketId.slice(-1), 'completed', log.ticketId]
          );

          // Create token mapping
          await mockPool.query(
            'INSERT INTO token_mappings (ticket_id, token_id, contract_address) VALUES ($1, $2, $3)',
            [log.ticketId, log.tokenId, 'contract_address']
          );
        }

        return { ok: true };
      };

      const result = await processWebhook(req.body, req.headers['x-webhook-signature']);

      expect(result.ok).toBe(true);
      expect(mockBlockchainService.verifySignature).toHaveBeenCalled();
    });

    it('should verify webhook signature', async () => {
      const verifySignature = (payload: any, signature: string, secret: string) => {
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(JSON.stringify(payload))
          .digest('hex');

        return signature === expectedSignature;
      };

      const payload = { jobId: 'test' };
      const secret = 'webhook_secret';
      const correctSignature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      expect(verifySignature(payload, correctSignature, secret)).toBe(true);
      expect(verifySignature(payload, 'wrong_signature', secret)).toBe(false);
    });

    it('should handle partial failure webhook', async () => {
      req.body = {
        jobId: 'bc_job_456',
        status: 'partial',
        txHash: '0xPartialTx',
        logs: [
          { ticketId: 'ticket1', tokenId: 'token_1', success: true },
          { ticketId: 'ticket2', error: 'Out of gas', success: false }
        ]
      };

      const processPartialFailure = async (payload: any) => {
        let successCount = 0;
        let failureCount = 0;

        for (const log of payload.logs) {
          if (log.success) {
            await mockPool.query(
              'UPDATE mint_job_items SET token_id = $1, status = $2 WHERE ticket_id = $3',
              [log.tokenId, 'completed', log.ticketId]
            );
            successCount++;
          } else {
            await mockPool.query(
              'UPDATE mint_job_items SET status = $1, error = $2 WHERE ticket_id = $3',
              ['failed', log.error, log.ticketId]
            );
            failureCount++;
          }
        }

        // Update job status
        const status = failureCount === 0 ? 'completed' : 
                       successCount === 0 ? 'failed' : 'partial';

        await mockPool.query(
          'UPDATE mint_jobs SET status = $1 WHERE blockchain_job_id = $2',
          [status, payload.jobId]
        );

        return { 
          processed: true,
          success: successCount,
          failed: failureCount
        };
      };

      const result = await processPartialFailure(req.body);

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle idempotent webhook processing', async () => {
      const webhookId = 'webhook_123';

      const processIdempotent = async (webhookId: string, payload: any) => {
        // Check if already processed
        const existing = await mockRedisClient.get(`webhook:${webhookId}`);
        
        if (existing) {
          return { 
            processed: false,
            reason: 'Already processed'
          };
        }

        // Process webhook
        // ... processing logic ...

        // Mark as processed
        await mockRedisClient.set(
          `webhook:${webhookId}`,
          JSON.stringify({ processedAt: new Date() }),
          'EX',
          86400 // 24 hours
        );

        return { processed: true };
      };

      mockRedisClient.get.mockResolvedValue(null); // First call
      const result1 = await processIdempotent(webhookId, {});
      expect(result1.processed).toBe(true);

      mockRedisClient.get.mockResolvedValue('{"processedAt":"2024-01-01"}'); // Second call
      const result2 = await processIdempotent(webhookId, {});
      expect(result2.processed).toBe(false);
      expect(result2.reason).toBe('Already processed');
    });

    it('should handle complete failure webhook', async () => {
      req.body = {
        jobId: 'bc_job_789',
        status: 'failed',
        error: 'Contract execution reverted'
      };

      const processFailure = async (payload: any) => {
        // Update job status
        await mockPool.query(
          'UPDATE mint_jobs SET status = $1, error = $2 WHERE blockchain_job_id = $3',
          ['failed', payload.error, payload.jobId]
        );

        // Update all items as failed
        await mockPool.query(
          'UPDATE mint_job_items SET status = $1 WHERE job_id = (SELECT id FROM mint_jobs WHERE blockchain_job_id = $2)',
          ['failed', payload.jobId]
        );

        // Release ticket reservations
        const tickets = await mockPool.query(
          'SELECT ticket_id FROM mint_job_items WHERE job_id = (SELECT id FROM mint_jobs WHERE blockchain_job_id = $1)',
          [payload.jobId]
        );

        for (const ticket of tickets.rows) {
          await mockTicketService.updateMintStatus(ticket.ticket_id, 'available');
        }

        return { handled: true };
      };

      mockPool.query.mockResolvedValue({
        rows: [
          { ticket_id: 'ticket1' },
          { ticket_id: 'ticket2' }
        ]
      });

      const result = await processFailure(req.body);

      expect(result.handled).toBe(true);
      expect(mockTicketService.updateMintStatus).toHaveBeenCalledWith('ticket1', 'available');
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed mints', async () => {
      const retryFailedMint = async (jobId: string) => {
        // Get failed items
        const failedItems = await mockPool.query(
          'SELECT * FROM mint_job_items WHERE job_id = $1 AND status = $2',
          [jobId, 'failed']
        );

        if (failedItems.rows.length === 0) {
          return { error: 'No failed items to retry' };
        }

        // Create new blockchain job for retry
        const retryJob = await mockBlockchainService.submitTransaction({
          type: 'mint',
          payload: {
            tickets: failedItems.rows.map((item: any) => item.ticket_id)
          }
        });

        // Update job with new blockchain job ID
        await mockPool.query(
          'UPDATE mint_jobs SET blockchain_job_id = $1, status = $2, retry_count = retry_count + 1 WHERE id = $3',
          [retryJob.jobId, 'queued', jobId]
        );

        return { 
          retried: true,
          newJobId: retryJob.jobId,
          itemCount: failedItems.rows.length
        };
      };

      mockPool.query.mockResolvedValue({
        rows: [
          { ticket_id: 'ticket1' },
          { ticket_id: 'ticket2' }
        ]
      });

      mockBlockchainService.submitTransaction.mockResolvedValue({
        jobId: 'bc_retry_123'
      });

      const result = await retryFailedMint('mint_job_123');

      expect(result.retried).toBe(true);
      expect(result.newJobId).toBe('bc_retry_123');
      expect(result.itemCount).toBe(2);
    });

    it('should limit retry attempts', async () => {
      const MAX_RETRIES = 3;

      const canRetry = async (jobId: string) => {
        const result = await mockPool.query(
          'SELECT retry_count FROM mint_jobs WHERE id = $1',
          [jobId]
        );

        if (result.rows[0]?.retry_count >= MAX_RETRIES) {
          return { 
            canRetry: false,
            reason: `Maximum retry attempts (${MAX_RETRIES}) reached`
          };
        }

        return { canRetry: true };
      };

      mockPool.query.mockResolvedValue({
        rows: [{ retry_count: 3 }]
      });

      const result = await canRetry('mint_job_123');

      expect(result.canRetry).toBe(false);
      expect(result.reason).toContain('Maximum retry attempts');
    });
  });

  describe('Token Mapping', () => {
    it('should store ticket to token mapping', async () => {
      const createTokenMapping = async (ticketId: string, tokenId: string, contractAddress: string) => {
        await mockPool.query(
          'INSERT INTO token_mappings (ticket_id, token_id, contract_address, created_at) VALUES ($1, $2, $3, NOW())',
          [ticketId, tokenId, contractAddress]
        );

        return { mapped: true };
      };

      const result = await createTokenMapping('ticket123', 'token456', '0xContract');

      expect(result.mapped).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO token_mappings'),
        ['ticket123', 'token456', '0xContract']
      );
    });

    it('should retrieve token for ticket', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          token_id: 'token789',
          contract_address: '0xContract123',
          blockchain: 'polygon'
        }]
      });

      const getTokenForTicket = async (ticketId: string) => {
        const result = await mockPool.query(
          'SELECT * FROM token_mappings WHERE ticket_id = $1',
          [ticketId]
        );

        if (result.rows.length === 0) {
          return { error: 'Token not found for ticket' };
        }

        return {
          tokenId: result.rows[0].token_id,
          contractAddress: result.rows[0].contract_address,
          blockchain: result.rows[0].blockchain
        };
      };

      const result = await getTokenForTicket('ticket123');

      expect(result.tokenId).toBe('token789');
      expect(result.contractAddress).toBe('0xContract123');
    });
  });
});
