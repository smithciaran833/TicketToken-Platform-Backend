# COMPLETE DATABASE ANALYSIS: blockchain-indexer
Generated: Thu Oct  2 15:07:48 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/sync/historicalSync.js
```typescript
const logger = require('../utils/logger');
const db = require('../utils/database');

class HistoricalSync {
    constructor(connection, processor) {
        this.connection = connection;
        this.processor = processor;
        this.batchSize = 1000;
        this.maxConcurrent = 5;
    }
    
    async syncRange(startSlot, endSlot) {
        logger.info({ startSlot, endSlot }, 'Starting historical sync');
        
        const totalSlots = endSlot - startSlot;
        let processed = 0;
        let currentSlot = startSlot;
        
        while (currentSlot < endSlot) {
            const batches = [];
            
            // Create concurrent batches
            for (let i = 0; i < this.maxConcurrent; i++) {
                const batchStart = currentSlot + (i * this.batchSize);
                const batchEnd = Math.min(batchStart + this.batchSize, endSlot);
                
                if (batchStart < endSlot) {
                    batches.push({
                        start: batchStart,
                        end: batchEnd
                    });
                }
            }
            
            // Process batches in parallel
            const results = await Promise.allSettled(
                batches.map(batch => this.processBatch(batch))
            );
            
            // Count successes and failures
            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            if (failed > 0) {
                logger.warn({ failed, succeeded }, 'Some batches failed');
            }
            
            // Update progress
            currentSlot = batches[batches.length - 1].end;
            processed += batches.reduce((sum, b) => sum + (b.end - b.start), 0);
            
            const progress = (processed / totalSlots * 100).toFixed(2);
            logger.info({
                progress: `${progress}%`,
                processed,
                total: totalSlots,
                currentSlot
            }, 'Historical sync progress');
            
            // Save progress to database
            await this.saveProgress(currentSlot);
            
            // Small delay to avoid overwhelming RPC
            await this.sleep(100);
        }
        
        logger.info('Historical sync completed');
    }
    
    async processBatch({ start, end }) {
        try {
            logger.debug({ start, end }, 'Processing batch');
            
            // Get signatures in this slot range
            const signatures = await this.getSignaturesInRange(start, end);
            
            for (const sigInfo of signatures) {
                try {
                    await this.processor.processTransaction(sigInfo);
                } catch (error) {
                    logger.error({ 
                        error: error.message, 
                        signature: sigInfo.signature 
                    }, 'Failed to process transaction');
                }
            }
            
            logger.debug({ 
                start, 
                end, 
                processed: signatures.length 
            }, 'Batch completed');
            
            return { start, end, processed: signatures.length };
            
        } catch (error) {
            logger.error({ error, start, end }, 'Batch processing failed');
            throw error;
        }
    }
    
    async getSignaturesInRange(startSlot, endSlot) {
        const allSignatures = [];
        
        try {
            // Get signatures for our program in this range
            // Note: This is limited by RPC capabilities
            const signatures = await this.connection.getSignaturesForAddress(
                this.processor.programId,
                {
                    limit: 1000,
                    before: null,
                    until: null
                },
                'confirmed'
            );
            
            // Filter by slot range
            const inRange = signatures.filter(sig => 
                sig.slot >= startSlot && sig.slot < endSlot
            );
            
            allSignatures.push(...inRange);
            
        } catch (error) {
            logger.error({ 
                error: error.message, 
                startSlot, 
                endSlot 
            }, 'Failed to get signatures');
        }
        
        return allSignatures;
    }
    
    async saveProgress(slot) {
        await db.query(`
            UPDATE indexer_state 
            SET last_processed_slot = $1,
                updated_at = NOW()
            WHERE id = 1
        `, [slot]);
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async estimateTimeRemaining(startSlot, endSlot, slotsPerSecond = 100) {
        const totalSlots = endSlot - startSlot;
        const estimatedSeconds = totalSlots / slotsPerSecond;
        
        const hours = Math.floor(estimatedSeconds / 3600);
        const minutes = Math.floor((estimatedSeconds % 3600) / 60);
        
        logger.info({
            totalSlots,
            slotsPerSecond,
            estimatedTime: `${hours}h ${minutes}m`
        }, 'Estimated sync time');
        
        return { hours, minutes };
    }
}

module.exports = HistoricalSync;
```

### FILE: src/routes/health.routes.js
```typescript
const express = require('express');
const router = express.Router();
const { pool } = require('../utils/database');

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'blockchain-indexer' });
});

router.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'blockchain-indexer' 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'blockchain-indexer'
    });
  }
});

module.exports = router;
```

### FILE: src/indexer.js
```typescript
const { Connection, PublicKey } = require('@solana/web3.js');
const EventEmitter = require('events');
const logger = require('./utils/logger');
const db = require('./utils/database');
const TransactionProcessor = require('./processors/transactionProcessor');

class BlockchainIndexer extends EventEmitter {
    constructor(config) {
        super();
        this.connection = new Connection(config.solana.rpcUrl, {
            commitment: config.solana.commitment || 'confirmed',
            wsEndpoint: config.solana.wsUrl
        });

        this.programId = config.solana.programId ? new PublicKey(config.solana.programId) : null;
        this.lastProcessedSlot = 0;
        this.lastSignature = null;
        this.isRunning = false;
        this.config = config;

        this.syncStats = {
            processed: 0,
            failed: 0,
            lag: 0,
            startTime: null
        };

        // Initialize processor
        this.processor = new TransactionProcessor(this.connection);
    }

    async initialize() {
        try {
            logger.info('Initializing blockchain indexer...');

            // Load last processed slot from database
            const result = await db.query(`
                SELECT last_processed_slot, last_processed_signature
                FROM indexer_state
                WHERE id = 1
            `);

            if (result.rows[0]) {
                this.lastProcessedSlot = result.rows[0].last_processed_slot || 0;
                this.lastSignature = result.rows[0].last_processed_signature;
                logger.info(`Resuming from slot ${this.lastProcessedSlot}`);
            } else {
                // Initialize indexer state
                await db.query(`
                    INSERT INTO indexer_state (id, last_processed_slot, indexer_version)
                    VALUES (1, 0, '1.0.0')
                    ON CONFLICT (id) DO NOTHING
                `);
                logger.info('Initialized new indexer state');
            }

            // Get current slot
            this.currentSlot = await this.connection.getSlot();
            this.syncStats.lag = this.currentSlot - this.lastProcessedSlot;

            logger.info({
                lastSlot: this.lastProcessedSlot,
                currentSlot: this.currentSlot,
                lag: this.syncStats.lag
            }, 'Indexer initialized');

            return true;
        } catch (error) {
            logger.error({ error }, 'Failed to initialize indexer');
            throw error;
        }
    }

    async start() {
        if (this.isRunning) {
            logger.warn('Indexer is already running');
            return;
        }

        this.isRunning = true;
        this.syncStats.startTime = Date.now();

        // Update database to show indexer is running
        await db.query(`
            UPDATE indexer_state
            SET is_running = true,
                started_at = NOW()
            WHERE id = 1
        `);

        logger.info('Indexer started');

        // For now, just start real-time indexing
        // Historical sync will be implemented later
        if (this.syncStats.lag > 1000) {
            logger.warn(`Large lag detected (${this.syncStats.lag} slots). Consider running historical sync.`);
        }

        // Start real-time indexing
        await this.startRealtimeIndexing();
    }

    async stop() {
        logger.info('Stopping indexer...');
        this.isRunning = false;

        if (this.subscription) {
            await this.connection.removeAccountChangeListener(this.subscription);
        }

        // Update database
        await db.query(`
            UPDATE indexer_state
            SET is_running = false
            WHERE id = 1
        `);

        logger.info('Indexer stopped');
    }

    async startRealtimeIndexing() {
        logger.info('Starting real-time indexing...');

        if (!this.programId) {
            logger.warn('No program ID configured, skipping program monitoring');
            return;
        }

        try {
            // Subscribe to program account changes
            this.subscription = this.connection.onProgramAccountChange(
                this.programId,
                async (accountInfo, context) => {
                    logger.debug({ slot: context.slot }, 'Program account change detected');

                    // Process the latest transactions for this slot
                    await this.processSlot(context.slot);
                },
                'confirmed'
            );

            logger.info('Real-time indexing started');

            // Also poll for recent signatures periodically
            this.startPolling();

        } catch (error) {
            logger.error({ error }, 'Failed to start real-time indexing');
            throw error;
        }
    }

    async startPolling() {
        // Poll for recent transactions every 5 seconds
        const pollInterval = setInterval(async () => {
            if (!this.isRunning) {
                clearInterval(pollInterval);
                return;
            }

            try {
                await this.pollRecentTransactions();
            } catch (error) {
                logger.error({ error }, 'Polling error');
            }
        }, 5000);
    }

    async pollRecentTransactions() {
        try {
            // Get recent signatures for the program
            const signatures = await this.connection.getSignaturesForAddress(
                this.programId,
                { limit: 10 },
                'confirmed'
            );

            for (const sigInfo of signatures) {
                // Process each transaction
                await this.processor.processTransaction(sigInfo);
                this.syncStats.processed++;

                // Update progress
                if (sigInfo.slot > this.lastProcessedSlot) {
                    this.lastProcessedSlot = sigInfo.slot;
                    this.lastSignature = sigInfo.signature;
                    await this.saveProgress();
                }
            }

            // Update lag
            this.currentSlot = await this.connection.getSlot();
            this.syncStats.lag = this.currentSlot - this.lastProcessedSlot;

            if (this.syncStats.processed % 100 === 0) {
                logger.info({
                    processed: this.syncStats.processed,
                    lag: this.syncStats.lag
                }, 'Indexing progress');
            }

        } catch (error) {
            logger.error({ error }, 'Failed to poll recent transactions');
            this.syncStats.failed++;
        }
    }

    async processSlot(slot) {
        try {
            // Get all signatures for this slot
            const block = await this.connection.getBlock(slot, {
                maxSupportedTransactionVersion: 0
            });

            if (!block) {
                logger.debug({ slot }, 'No block found');
                return;
            }

            logger.debug({
                slot,
                transactions: block.transactions.length
            }, 'Processing slot');

            // Process each transaction in the block
            for (const tx of block.transactions) {
                if (tx.meta?.err) continue; // Skip failed transactions

                const sigInfo = {
                    signature: tx.transaction.signatures[0],
                    slot: slot,
                    blockTime: block.blockTime
                };

                await this.processor.processTransaction(sigInfo);
                this.syncStats.processed++;
            }

            // Update progress
            this.lastProcessedSlot = slot;
            await this.saveProgress();

        } catch (error) {
            logger.error({ error, slot }, 'Failed to process slot');
            this.syncStats.failed++;
        }
    }

    async saveProgress() {
        await db.query(`
            UPDATE indexer_state
            SET last_processed_slot = $1,
                last_processed_signature = $2,
                updated_at = NOW()
            WHERE id = 1
        `, [this.lastProcessedSlot, this.lastSignature]);
    }

    async batchHistoricalSync() {
        const HistoricalSync = require('./sync/historicalSync');
        const historicalSync = new HistoricalSync(this.connection, this.processor);
        
        // Estimate time
        await historicalSync.estimateTimeRemaining(
            this.lastProcessedSlot,
            this.currentSlot
        );

        // Start sync
        await historicalSync.syncRange(
            this.lastProcessedSlot,
            this.currentSlot
        );
        
        return historicalSync.sync();
    }

    async sequentialCatchup() {
        // For smaller gaps, just process sequentially
        logger.info('Starting sequential catchup...');

        let slot = this.lastProcessedSlot;
        while (slot < this.currentSlot && this.isRunning) {
            try {
                await this.processSlot(slot);
                slot++;

                if (slot % 100 === 0) {
                    logger.info({ slot, target: this.currentSlot }, 'Sequential progress');
                }
            } catch (error) {
                logger.error({ error, slot }, 'Failed to process slot');
                slot++; // Skip and continue
            }
        }
    }
}

module.exports = BlockchainIndexer;
```

### FILE: src/utils/database.js
```typescript
const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'svc_blockchain_service',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    logger.error('Unexpected database error:', err);
    // Don't exit, just log the error
});

pool.on('connect', () => {
    logger.debug('New database connection established');
});

module.exports = {
    query: (text, params) => {
        const start = Date.now();
        return pool.query(text, params).then(res => {
            const duration = Date.now() - start;
            if (duration > 1000) {
                logger.warn({ query: text, duration }, 'Slow query detected');
            }
            return res;
        });
    },
    pool,
    getClient: () => pool.connect()
};
```

### FILE: src/processors/marketplaceTracker.js
```typescript
const { PublicKey } = require('@solana/web3.js');
const logger = require('../utils/logger');
const db = require('../utils/database');

class MarketplaceTracker {
    constructor(connection) {
        this.connection = connection;
        
        // Known marketplace program IDs
        this.marketplaces = {
            MAGIC_EDEN: {
                name: 'Magic Eden',
                programId: 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K',
                version: 'v2'
            },
            TENSOR: {
                name: 'Tensor',
                programId: 'TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp',
                version: 'v1'
            },
            SOLANART: {
                name: 'Solanart',
                programId: 'CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz',
                version: 'v1'
            }
        };
        
        this.subscriptions = new Map();
    }
    
    async startTracking() {
        logger.info('Starting marketplace tracking...');
        
        for (const [key, marketplace] of Object.entries(this.marketplaces)) {
            try {
                await this.subscribeToMarketplace(key, marketplace);
            } catch (error) {
                logger.error({ 
                    error: error.message, 
                    marketplace: marketplace.name 
                }, 'Failed to subscribe to marketplace');
            }
        }
        
        // Also start polling for recent activity
        this.startPolling();
    }
    
    async stopTracking() {
        logger.info('Stopping marketplace tracking...');
        
        // Remove all subscriptions
        for (const [key, subscriptionId] of this.subscriptions) {
            try {
                await this.connection.removeAccountChangeListener(subscriptionId);
                logger.info({ marketplace: key }, 'Unsubscribed from marketplace');
            } catch (error) {
                logger.error({ error, marketplace: key }, 'Failed to unsubscribe');
            }
        }
        
        this.subscriptions.clear();
        
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
    }
    
    async subscribeToMarketplace(key, marketplace) {
        const programId = new PublicKey(marketplace.programId);
        
        const subscriptionId = this.connection.onProgramAccountChange(
            programId,
            async (accountInfo, context) => {
                logger.debug({ 
                    marketplace: marketplace.name,
                    slot: context.slot 
                }, 'Marketplace activity detected');
                
                // Process the activity
                await this.processMarketplaceActivity(
                    marketplace,
                    accountInfo,
                    context
                );
            },
            'confirmed'
        );
        
        this.subscriptions.set(key, subscriptionId);
        logger.info({ marketplace: marketplace.name }, 'Subscribed to marketplace');
    }
    
    async processMarketplaceActivity(marketplace, accountInfo, context) {
        try {
            // Get the transaction details
            const signatures = await this.connection.getSignaturesForAddress(
                new PublicKey(marketplace.programId),
                { limit: 1 },
                'confirmed'
            );
            
            if (signatures.length === 0) return;
            
            const tx = await this.connection.getParsedTransaction(
                signatures[0].signature,
                { commitment: 'confirmed' }
            );
            
            if (!tx) return;
            
            // Parse the activity type
            const activity = this.parseMarketplaceTransaction(marketplace, tx);
            
            if (activity && await this.isOurNFT(activity.tokenId)) {
                // Record the activity
                await this.recordActivity(marketplace, activity, signatures[0]);
                
                // Update ticket status if needed
                await this.updateTicketStatus(activity);
            }
            
        } catch (error) {
            logger.error({ 
                error: error.message,
                marketplace: marketplace.name 
            }, 'Failed to process marketplace activity');
        }
    }
    
    parseMarketplaceTransaction(marketplace, tx) {
        const logs = tx.meta?.logMessages || [];
        const instructions = tx.transaction.message.instructions;
        
        let activity = {
            type: null,
            tokenId: null,
            price: null,
            seller: null,
            buyer: null
        };
        
        // Parse based on marketplace
        switch (marketplace.name) {
            case 'Magic Eden':
                activity = this.parseMagicEdenTransaction(tx, logs);
                break;
            case 'Tensor':
                activity = this.parseTensorTransaction(tx, logs);
                break;
            case 'Solanart':
                activity = this.parseSolanartTransaction(tx, logs);
                break;
        }
        
        return activity;
    }
    
    parseMagicEdenTransaction(tx, logs) {
        // Magic Eden specific parsing
        const activity = {
            type: null,
            tokenId: null,
            price: null,
            seller: null,
            buyer: null
        };
        
        // Check logs for activity type
        for (const log of logs) {
            if (log.includes('Instruction: ExecuteSale')) {
                activity.type = 'SALE';
            } else if (log.includes('Instruction: List')) {
                activity.type = 'LIST';
            } else if (log.includes('Instruction: CancelListing')) {
                activity.type = 'DELIST';
            } else if (log.includes('Instruction: PlaceBid')) {
                activity.type = 'BID';
            }
        }
        
        // Extract token and price from transaction
        if (tx.meta?.postTokenBalances?.length > 0) {
            activity.tokenId = tx.meta.postTokenBalances[0].mint;
            activity.buyer = tx.meta.postTokenBalances[0].owner;
        }
        
        if (tx.meta?.preTokenBalances?.length > 0) {
            activity.seller = tx.meta.preTokenBalances[0].owner;
        }
        
        // Extract price from inner instructions (in lamports)
        const innerInstructions = tx.meta?.innerInstructions || [];
        for (const inner of innerInstructions) {
            for (const inst of inner.instructions) {
                if (inst.parsed?.type === 'transfer' && inst.parsed?.info?.lamports) {
                    activity.price = inst.parsed.info.lamports / 1e9; // Convert to SOL
                    break;
                }
            }
        }
        
        return activity;
    }
    
    parseTensorTransaction(tx, logs) {
        // Tensor specific parsing
        const activity = {
            type: null,
            tokenId: null,
            price: null,
            seller: null,
            buyer: null
        };
        
        // Tensor uses different instruction names
        for (const log of logs) {
            if (log.includes('tcomp::buy')) {
                activity.type = 'SALE';
            } else if (log.includes('tcomp::list')) {
                activity.type = 'LIST';
            } else if (log.includes('tcomp::delist')) {
                activity.type = 'DELIST';
            } else if (log.includes('tcomp::bid')) {
                activity.type = 'BID';
            }
        }
        
        // Extract token data
        if (tx.meta?.postTokenBalances?.length > 0) {
            activity.tokenId = tx.meta.postTokenBalances[0].mint;
            activity.buyer = tx.meta.postTokenBalances[0].owner;
        }
        
        if (tx.meta?.preTokenBalances?.length > 0) {
            activity.seller = tx.meta.preTokenBalances[0].owner;
        }
        
        // Tensor price extraction
        const innerInstructions = tx.meta?.innerInstructions || [];
        for (const inner of innerInstructions) {
            for (const inst of inner.instructions) {
                if (inst.parsed?.type === 'transfer' && inst.parsed?.info?.lamports) {
                    // Tensor takes a fee, so actual price is slightly less
                    const lamports = inst.parsed.info.lamports;
                    activity.price = lamports / 1e9; // Convert to SOL
                    break;
                }
            }
        }
        
        return activity;
    }
    
    parseSolanartTransaction(tx, logs) {
        // Solanart specific parsing (similar structure)
        return this.parseMagicEdenTransaction(tx, logs);
    }
    
    async isOurNFT(tokenId) {
        if (!tokenId) return false;
        
        // Check if this token is one of our tickets
        const result = await db.query(
            'SELECT 1 FROM tickets WHERE token_id = $1',
            [tokenId]
        );
        
        return result.rows.length > 0;
    }
    
    async recordActivity(marketplace, activity, sigInfo) {
        try {
            // Get ticket_id from token_id
            const ticketResult = await db.query(
                'SELECT id FROM tickets WHERE token_id = $1',
                [activity.tokenId]
            );
            
            const ticketId = ticketResult.rows[0]?.id;
            
            // Record the marketplace activity
            await db.query(`
                INSERT INTO marketplace_activity 
                (token_id, ticket_id, marketplace, activity_type, price, 
                 seller, buyer, transaction_signature, block_time)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9))
                ON CONFLICT (transaction_signature) DO NOTHING
            `, [
                activity.tokenId,
                ticketId,
                marketplace.name,
                activity.type,
                activity.price,
                activity.seller,
                activity.buyer,
                sigInfo.signature,
                sigInfo.blockTime
            ]);
            
            logger.info({
                marketplace: marketplace.name,
                type: activity.type,
                tokenId: activity.tokenId,
                price: activity.price
            }, 'Marketplace activity recorded');
            
        } catch (error) {
            logger.error({ error, activity }, 'Failed to record marketplace activity');
        }
    }
    
    async updateTicketStatus(activity) {
        if (activity.type === 'SALE' && activity.buyer) {
            // Update ticket ownership after sale
            await db.query(`
                UPDATE tickets 
                SET 
                    wallet_address = $1,
                    marketplace_listed = false,
                    last_sale_price = $2,
                    last_sale_at = NOW(),
                    transfer_count = COALESCE(transfer_count, 0) + 1
                WHERE token_id = $3
            `, [activity.buyer, activity.price, activity.tokenId]);
            
        } else if (activity.type === 'LIST') {
            // Mark as listed
            await db.query(`
                UPDATE tickets 
                SET marketplace_listed = true
                WHERE token_id = $1
            `, [activity.tokenId]);
            
        } else if (activity.type === 'DELIST') {
            // Mark as unlisted
            await db.query(`
                UPDATE tickets 
                SET marketplace_listed = false
                WHERE token_id = $1
            `, [activity.tokenId]);
        }
    }
    
    startPolling() {
        // Poll for recent marketplace activity every 30 seconds
        this.pollingInterval = setInterval(async () => {
            for (const [key, marketplace] of Object.entries(this.marketplaces)) {
                await this.pollMarketplace(marketplace);
            }
        }, 30000);
    }
    
    async pollMarketplace(marketplace) {
        try {
            const signatures = await this.connection.getSignaturesForAddress(
                new PublicKey(marketplace.programId),
                { limit: 20 },
                'confirmed'
            );
            
            for (const sigInfo of signatures) {
                const tx = await this.connection.getParsedTransaction(
                    sigInfo.signature,
                    { commitment: 'confirmed' }
                );
                
                if (tx) {
                    const activity = this.parseMarketplaceTransaction(marketplace, tx);
                    
                    if (activity && await this.isOurNFT(activity.tokenId)) {
                        await this.recordActivity(marketplace, activity, sigInfo);
                        await this.updateTicketStatus(activity);
                    }
                }
            }
        } catch (error) {
            logger.error({ 
                error: error.message,
                marketplace: marketplace.name 
            }, 'Polling failed');
        }
    }
}

module.exports = MarketplaceTracker;
```

### FILE: src/processors/transactionProcessor.js
```typescript
const { Metaplex } = require('@metaplex-foundation/js');
const logger = require('../utils/logger');
const db = require('../utils/database');

class TransactionProcessor {
    constructor(connection) {
        this.connection = connection;
        this.metaplex = Metaplex.make(connection);
    }
    
    async processTransaction(sigInfo) {
        const { signature, slot, blockTime } = sigInfo;
        
        try {
            // Check if already processed
            const exists = await this.checkExists(signature);
            if (exists) {
                logger.debug({ signature }, 'Transaction already processed');
                return;
            }
            
            // Get full transaction
            const tx = await this.connection.getParsedTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });
            
            if (!tx) {
                logger.warn({ signature }, 'Transaction not found');
                return;
            }
            
            // Parse instruction type
            const instructionType = this.parseInstructionType(tx);
            logger.info({ signature, type: instructionType }, 'Processing transaction');
            
            // Process based on type
            switch (instructionType) {
                case 'MINT_NFT':
                    await this.processMint(tx, signature, slot, blockTime);
                    break;
                case 'TRANSFER':
                    await this.processTransfer(tx, signature, slot, blockTime);
                    break;
                case 'BURN':
                    await this.processBurn(tx, signature, slot, blockTime);
                    break;
                default:
                    logger.debug({ signature, type: instructionType }, 'Unknown transaction type');
            }
            
            // Record processed transaction
            await this.recordTransaction(signature, slot, blockTime, instructionType);
            
        } catch (error) {
            logger.error({ error, signature }, 'Failed to process transaction');
            throw error;
        }
    }
    
    async checkExists(signature) {
        const result = await db.query(
            'SELECT 1 FROM indexed_transactions WHERE signature = $1',
            [signature]
        );
        return result.rows.length > 0;
    }
    
    parseInstructionType(tx) {
        // Parse logs to determine instruction type
        const logs = tx.meta?.logMessages || [];
        
        for (const log of logs) {
            if (log.includes('MintNft') || log.includes('mint')) return 'MINT_NFT';
            if (log.includes('Transfer') || log.includes('transfer')) return 'TRANSFER';
            if (log.includes('Burn') || log.includes('burn')) return 'BURN';
        }
        
        return 'UNKNOWN';
    }
    
    async processMint(tx, signature, slot, blockTime) {
        try {
            // Extract mint data from transaction
            const mintData = this.extractMintData(tx);
            if (!mintData) {
                logger.warn({ signature }, 'Could not extract mint data');
                return;
            }
            
            // Update database
            await db.query(`
                UPDATE tickets 
                SET 
                    is_minted = true,
                    mint_transaction_id = $1,
                    wallet_address = $2,
                    last_indexed_at = NOW(),
                    sync_status = 'SYNCED'
                WHERE token_id = $3
            `, [signature, mintData.owner, mintData.tokenId]);
            
            logger.info({ 
                ticketId: mintData.ticketId, 
                tokenId: mintData.tokenId 
            }, 'NFT mint processed');
        } catch (error) {
            logger.error({ error, signature }, 'Failed to process mint');
        }
    }
    
    async processTransfer(tx, signature, slot, blockTime) {
        try {
            const transferData = this.extractTransferData(tx);
            if (!transferData) return;
            
            // Update ticket ownership
            await db.query(`
                UPDATE tickets 
                SET 
                    wallet_address = $1,
                    transfer_count = COALESCE(transfer_count, 0) + 1,
                    last_indexed_at = NOW(),
                    sync_status = 'SYNCED'
                WHERE token_id = $2
            `, [transferData.newOwner, transferData.tokenId]);
            
            // Record transfer in ticket_transfers table
            await db.query(`
                INSERT INTO ticket_transfers 
                (ticket_id, from_wallet, to_wallet, transaction_signature, 
                 block_time, metadata)
                SELECT 
                    id, $2, $3, $4, to_timestamp($5), $6
                FROM tickets 
                WHERE token_id = $1
            `, [
                transferData.tokenId, 
                transferData.previousOwner, 
                transferData.newOwner, 
                signature, 
                blockTime,
                JSON.stringify({ slot })
            ]);
            
            logger.info({ 
                tokenId: transferData.tokenId,
                from: transferData.previousOwner,
                to: transferData.newOwner
            }, 'NFT transfer processed');
        } catch (error) {
            logger.error({ error, signature }, 'Failed to process transfer');
        }
    }
    
    async processBurn(tx, signature, slot, blockTime) {
        try {
            const burnData = this.extractBurnData(tx);
            if (!burnData) return;
            
            await db.query(`
                UPDATE tickets 
                SET 
                    status = 'BURNED',
                    last_indexed_at = NOW(),
                    sync_status = 'SYNCED'
                WHERE token_id = $1
            `, [burnData.tokenId]);
            
            logger.info({ tokenId: burnData.tokenId }, 'NFT burn processed');
        } catch (error) {
            logger.error({ error, signature }, 'Failed to process burn');
        }
    }
    
    extractMintData(tx) {
        // Parse transaction to extract mint data
        // This is simplified - actual implementation would parse the transaction more thoroughly
        return {
            tokenId: tx.meta?.postTokenBalances?.[0]?.mint,
            owner: tx.meta?.postTokenBalances?.[0]?.owner,
            ticketId: null // Would need to extract from metadata
        };
    }
    
    extractTransferData(tx) {
        // Parse transaction to extract transfer data
        return {
            tokenId: tx.meta?.postTokenBalances?.[0]?.mint,
            previousOwner: tx.meta?.preTokenBalances?.[0]?.owner,
            newOwner: tx.meta?.postTokenBalances?.[0]?.owner
        };
    }
    
    extractBurnData(tx) {
        // Parse transaction to extract burn data
        return {
            tokenId: tx.meta?.preTokenBalances?.[0]?.mint
        };
    }
    
    async recordTransaction(signature, slot, blockTime, instructionType) {
        await db.query(`
            INSERT INTO indexed_transactions 
            (signature, slot, block_time, instruction_type, processed_at)
            VALUES ($1, $2, to_timestamp($3), $4, NOW())
            ON CONFLICT (signature) DO NOTHING
        `, [signature, slot, blockTime, instructionType]);
    }
}

module.exports = TransactionProcessor;
```

### FILE: src/reconciliation/reconciliationEngine.js
```typescript
const logger = require('../utils/logger');
const db = require('../utils/database');

class ReconciliationEngine {
    constructor(connection) {
        this.connection = connection;
        this.isRunning = false;
        this.reconciliationInterval = null;
    }
    
    async start(intervalMs = 300000) { // Default 5 minutes
        if (this.isRunning) {
            logger.warn('Reconciliation engine already running');
            return;
        }
        
        this.isRunning = true;
        logger.info(`Starting reconciliation engine (interval: ${intervalMs}ms)`);
        
        // Run immediately
        await this.runReconciliation();
        
        // Then run on interval
        this.reconciliationInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.runReconciliation();
            }
        }, intervalMs);
    }
    
    async stop() {
        this.isRunning = false;
        if (this.reconciliationInterval) {
            clearInterval(this.reconciliationInterval);
            this.reconciliationInterval = null;
        }
        logger.info('Reconciliation engine stopped');
    }
    
    async runReconciliation() {
        const startTime = Date.now();
        const runId = await this.createRun();
        
        logger.info({ runId }, 'Starting reconciliation run');
        
        try {
            const results = {
                ticketsChecked: 0,
                discrepanciesFound: 0,
                discrepanciesResolved: 0
            };
            
            // Get tickets that need reconciliation
            const tickets = await this.getTicketsToReconcile();
            results.ticketsChecked = tickets.length;
            
            logger.info(`Checking ${tickets.length} tickets for reconciliation`);
            
            for (const ticket of tickets) {
                const discrepancy = await this.checkTicket(ticket);
                
                if (discrepancy) {
                    results.discrepanciesFound++;
                    
                    const resolved = await this.resolveDiscrepancy(
                        runId, 
                        ticket, 
                        discrepancy
                    );
                    
                    if (resolved) {
                        results.discrepanciesResolved++;
                    }
                }
                
                // Update ticket reconciliation timestamp
                await this.markTicketReconciled(ticket.id);
            }
            
            // Complete the run
            const duration = Date.now() - startTime;
            await this.completeRun(runId, results, duration);
            
            logger.info({
                runId,
                ...results,
                duration
            }, 'Reconciliation run completed');
            
            return results;
            
        } catch (error) {
            logger.error({ error, runId }, 'Reconciliation run failed');
            await this.failRun(runId, error.message);
            throw error;
        }
    }
    
    async createRun() {
        const result = await db.query(`
            INSERT INTO reconciliation_runs (started_at, status)
            VALUES (NOW(), 'RUNNING')
            RETURNING id
        `);
        return result.rows[0].id;
    }
    
    async completeRun(runId, results, duration) {
        await db.query(`
            UPDATE reconciliation_runs
            SET 
                completed_at = NOW(),
                tickets_checked = $2,
                discrepancies_found = $3,
                discrepancies_resolved = $4,
                duration_ms = $5,
                status = 'COMPLETED'
            WHERE id = $1
        `, [runId, results.ticketsChecked, results.discrepanciesFound, 
            results.discrepanciesResolved, duration]);
    }
    
    async failRun(runId, errorMessage) {
        await db.query(`
            UPDATE reconciliation_runs
            SET 
                completed_at = NOW(),
                status = 'FAILED',
                error_message = $2
            WHERE id = $1
        `, [runId, errorMessage]);
    }
    
    async getTicketsToReconcile() {
        // Get tickets that:
        // 1. Are minted (have token_id)
        // 2. Haven't been reconciled recently
        // 3. Or have sync_status != 'SYNCED'
        const result = await db.query(`
            SELECT 
                id, 
                token_id, 
                wallet_address, 
                status,
                is_minted
            FROM tickets
            WHERE 
                token_id IS NOT NULL
                AND (
                    reconciled_at IS NULL 
                    OR reconciled_at < NOW() - INTERVAL '1 hour'
                    OR sync_status != 'SYNCED'
                )
            ORDER BY reconciled_at ASC NULLS FIRST
            LIMIT 100
        `);
        
        return result.rows;
    }
    
    async checkTicket(ticket) {
        try {
            if (!ticket.token_id) {
                return null;
            }
            
            // Get on-chain state
            const onChainData = await this.getOnChainState(ticket.token_id);
            
            if (!onChainData) {
                // Token doesn't exist on chain
                if (ticket.is_minted) {
                    return {
                        type: 'TOKEN_NOT_FOUND',
                        field: 'is_minted',
                        dbValue: true,
                        chainValue: false
                    };
                }
                return null;
            }
            
            // Check for ownership mismatch
            if (onChainData.owner !== ticket.wallet_address) {
                return {
                    type: 'OWNERSHIP_MISMATCH',
                    field: 'wallet_address',
                    dbValue: ticket.wallet_address,
                    chainValue: onChainData.owner
                };
            }
            
            // Check if burned
            if (onChainData.burned && ticket.status !== 'BURNED') {
                return {
                    type: 'BURN_NOT_RECORDED',
                    field: 'status',
                    dbValue: ticket.status,
                    chainValue: 'BURNED'
                };
            }
            
            return null;
            
        } catch (error) {
            logger.error({ error, ticketId: ticket.id }, 'Failed to check ticket');
            return null;
        }
    }
    
    async getOnChainState(tokenId) {
        try {
            // This would query the actual blockchain
            // For now, returning mock data
            // In production, this would use Metaplex or direct RPC calls
            
            logger.debug({ tokenId }, 'Getting on-chain state');
            
            // TODO: Implement actual on-chain query
            // const tokenAccount = await this.connection.getTokenAccount(tokenId);
            
            return null; // Placeholder
            
        } catch (error) {
            logger.error({ error, tokenId }, 'Failed to get on-chain state');
            return null;
        }
    }
    
    async resolveDiscrepancy(runId, ticket, discrepancy) {
        try {
            logger.info({
                ticketId: ticket.id,
                type: discrepancy.type,
                field: discrepancy.field
            }, 'Resolving discrepancy');
            
            // Record the discrepancy
            await db.query(`
                INSERT INTO ownership_discrepancies 
                (ticket_id, discrepancy_type, database_value, blockchain_value)
                VALUES ($1, $2, $3, $4)
            `, [ticket.id, discrepancy.type, 
                String(discrepancy.dbValue), 
                String(discrepancy.chainValue)]);
            
            // Apply the fix (blockchain is source of truth)
            switch (discrepancy.field) {
                case 'wallet_address':
                    await db.query(`
                        UPDATE tickets 
                        SET wallet_address = $1, sync_status = 'SYNCED'
                        WHERE id = $2
                    `, [discrepancy.chainValue, ticket.id]);
                    break;
                    
                case 'status':
                    await db.query(`
                        UPDATE tickets 
                        SET status = $1, sync_status = 'SYNCED'
                        WHERE id = $2
                    `, [discrepancy.chainValue, ticket.id]);
                    break;
                    
                case 'is_minted':
                    await db.query(`
                        UPDATE tickets 
                        SET is_minted = $1, sync_status = 'SYNCED'
                        WHERE id = $2
                    `, [discrepancy.chainValue, ticket.id]);
                    break;
            }
            
            // Log the resolution
            await db.query(`
                INSERT INTO reconciliation_log
                (reconciliation_run_id, ticket_id, field_name, old_value, new_value, source)
                VALUES ($1, $2, $3, $4, $5, 'blockchain')
            `, [runId, ticket.id, discrepancy.field, 
                String(discrepancy.dbValue), 
                String(discrepancy.chainValue)]);
            
            logger.info({ ticketId: ticket.id }, 'Discrepancy resolved');
            return true;
            
        } catch (error) {
            logger.error({ error, ticketId: ticket.id }, 'Failed to resolve discrepancy');
            return false;
        }
    }
    
    async markTicketReconciled(ticketId) {
        await db.query(`
            UPDATE tickets 
            SET reconciled_at = NOW()
            WHERE id = $1
        `, [ticketId]);
    }
}

module.exports = ReconciliationEngine;
```

### FILE: src/reconciliation/reconciliationEnhanced.js
```typescript
const logger = require('../utils/logger');
const db = require('../utils/database');
const OnChainQuery = require('../utils/onChainQuery');

class EnhancedReconciliationEngine {
    constructor(connection) {
        this.connection = connection;
        this.onChainQuery = new OnChainQuery(connection);
        this.isRunning = false;
        this.reconciliationInterval = null;
    }
    
    async checkTicket(ticket) {
        try {
            if (!ticket.token_id) {
                return null;
            }
            
            logger.debug({ ticketId: ticket.id, tokenId: ticket.token_id }, 'Checking ticket');
            
            // Get actual on-chain state
            const onChainState = await this.onChainQuery.getTokenState(ticket.token_id);
            
            const discrepancies = [];
            
            // Check if token exists
            if (!onChainState.exists) {
                if (ticket.is_minted) {
                    discrepancies.push({
                        type: 'TOKEN_NOT_FOUND',
                        field: 'is_minted',
                        dbValue: true,
                        chainValue: false
                    });
                }
                
                if (ticket.status !== 'BURNED' && ticket.status !== 'CANCELLED') {
                    discrepancies.push({
                        type: 'TOKEN_BURNED',
                        field: 'status',
                        dbValue: ticket.status,
                        chainValue: 'BURNED'
                    });
                }
            }
            
            // Check if burned
            if (onChainState.burned && ticket.status !== 'BURNED') {
                discrepancies.push({
                    type: 'BURN_NOT_RECORDED',
                    field: 'status',
                    dbValue: ticket.status,
                    chainValue: 'BURNED'
                });
            }
            
            // Check ownership
            if (onChainState.owner && onChainState.owner !== ticket.wallet_address) {
                discrepancies.push({
                    type: 'OWNERSHIP_MISMATCH',
                    field: 'wallet_address',
                    dbValue: ticket.wallet_address,
                    chainValue: onChainState.owner
                });
            }
            
            // If no discrepancies, mark as synced
            if (discrepancies.length === 0) {
                await db.query(`
                    UPDATE tickets 
                    SET sync_status = 'SYNCED',
                        reconciled_at = NOW()
                    WHERE id = $1
                `, [ticket.id]);
                
                return null;
            }
            
            return discrepancies;
            
        } catch (error) {
            logger.error({ error: error.message, ticketId: ticket.id }, 'Failed to check ticket');
            
            // Mark as needing manual review
            await db.query(`
                UPDATE tickets 
                SET sync_status = 'ERROR'
                WHERE id = $1
            `, [ticket.id]);
            
            return null;
        }
    }
    
    async detectBurns() {
        logger.info('Starting burn detection scan...');
        
        // Get all minted tickets that aren't marked as burned
        const result = await db.query(`
            SELECT id, token_id, wallet_address, status
            FROM tickets
            WHERE is_minted = true 
            AND status != 'BURNED'
            AND token_id IS NOT NULL
            ORDER BY last_indexed_at ASC NULLS FIRST
            LIMIT 50
        `);
        
        let burnCount = 0;
        let errorCount = 0;
        
        for (const ticket of result.rows) {
            try {
                const state = await this.onChainQuery.getTokenState(ticket.token_id);
                
                if (state.burned) {
                    // Token was burned - update database
                    await db.query(`
                        UPDATE tickets 
                        SET 
                            status = 'BURNED',
                            sync_status = 'SYNCED',
                            reconciled_at = NOW()
                        WHERE id = $1
                    `, [ticket.id]);
                    
                    // Record the burn detection
                    await db.query(`
                        INSERT INTO ownership_discrepancies 
                        (ticket_id, discrepancy_type, database_value, blockchain_value, resolved)
                        VALUES ($1, 'BURN_DETECTED', $2, 'BURNED', true)
                    `, [ticket.id, ticket.status]);
                    
                    burnCount++;
                    logger.info({ 
                        ticketId: ticket.id, 
                        tokenId: ticket.token_id 
                    }, 'Burned ticket detected and updated');
                }
                
            } catch (error) {
                logger.error({ 
                    error: error.message, 
                    ticketId: ticket.id 
                }, 'Failed to check burn status');
                errorCount++;
            }
        }
        
        logger.info({ 
            checked: result.rows.length,
            burns: burnCount,
            errors: errorCount
        }, 'Burn detection scan complete');
        
        return { detected: burnCount, errors: errorCount };
    }
    
    async verifyMarketplaceActivity() {
        // Verify recent marketplace activity matches on-chain state
        const recentActivity = await db.query(`
            SELECT 
                ma.id,
                ma.token_id,
                ma.buyer,
                ma.activity_type,
                t.wallet_address as db_owner
            FROM marketplace_activity ma
            JOIN tickets t ON ma.token_id = t.token_id
            WHERE ma.activity_type = 'SALE'
            AND ma.created_at > NOW() - INTERVAL '1 hour'
            ORDER BY ma.created_at DESC
            LIMIT 20
        `);
        
        let mismatches = 0;
        
        for (const activity of recentActivity.rows) {
            const verification = await this.onChainQuery.verifyOwnership(
                activity.token_id,
                activity.buyer
            );
            
            if (!verification.valid) {
                logger.warn({
                    activityId: activity.id,
                    tokenId: activity.token_id,
                    expectedOwner: activity.buyer,
                    actualOwner: verification.actualOwner,
                    reason: verification.reason
                }, 'Marketplace activity verification failed');
                
                mismatches++;
                
                // Update to correct owner
                if (verification.actualOwner) {
                    await db.query(`
                        UPDATE tickets 
                        SET wallet_address = $1
                        WHERE token_id = $2
                    `, [verification.actualOwner, activity.token_id]);
                }
            }
        }
        
        return { checked: recentActivity.rows.length, mismatches };
    }
}

module.exports = EnhancedReconciliationEngine;
```

### FILE: src/api/server.js
```typescript
const express = require('express');
const logger = require('../utils/logger');
const db = require('../utils/database');
const MetricsCollector = require('../metrics/metricsCollector');

class IndexerAPI {
    constructor(indexer, reconciliationEngine, port = 3456) {
        this.app = express();
        this.indexer = indexer;
        this.reconciliation = reconciliationEngine;
        this.port = port;
        this.metrics = new MetricsCollector();
        
        this.setupMiddleware();
        this.setupRoutes();
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        
        // Request logging
        this.app.use((req, res, next) => {
            logger.debug({ method: req.method, path: req.path }, 'API request');
            next();
        });
    }
    
    setupRoutes() {
        // Health check
        this.app.get('/health', async (req, res) => {
            try {
                const health = await this.getHealth();
                const statusCode = health.status === 'healthy' ? 200 : 503;
                res.status(statusCode).json(health);
            } catch (error) {
                logger.error({ error }, 'Health check failed');
                res.status(503).json({ status: 'unhealthy', error: error.message });
            }
        });
        
        // Metrics endpoint (Prometheus format)
        this.app.get('/metrics', async (req, res) => {
            try {
                res.set('Content-Type', this.metrics.getContentType());
                const metrics = await this.metrics.getMetrics();
                res.send(metrics);
            } catch (error) {
                logger.error({ error }, 'Failed to get metrics');
                res.status(500).json({ error: 'Failed to get metrics' });
            }
        });
        
        // Indexer stats
        this.app.get('/stats', async (req, res) => {
            try {
                const stats = await this.getStats();
                res.json(stats);
            } catch (error) {
                logger.error({ error }, 'Failed to get stats');
                res.status(500).json({ error: 'Failed to get stats' });
            }
        });
        
        // Recent activity
        this.app.get('/recent-activity', async (req, res) => {
            try {
                const activity = await this.getRecentActivity();
                res.json(activity);
            } catch (error) {
                logger.error({ error }, 'Failed to get recent activity');
                res.status(500).json({ error: 'Failed to get recent activity' });
            }
        });
        
        // Reconciliation status
        this.app.get('/reconciliation/status', async (req, res) => {
            try {
                const status = await this.getReconciliationStatus();
                res.json(status);
            } catch (error) {
                logger.error({ error }, 'Failed to get reconciliation status');
                res.status(500).json({ error: 'Failed to get reconciliation status' });
            }
        });
        
        // Trigger manual reconciliation
        this.app.post('/reconciliation/run', async (req, res) => {
            try {
                logger.info('Manual reconciliation triggered');
                const result = await this.reconciliation.runReconciliation();
                res.json({ success: true, result });
            } catch (error) {
                logger.error({ error }, 'Failed to run reconciliation');
                res.status(500).json({ error: 'Failed to run reconciliation' });
            }
        });
        
        // Indexer control
        this.app.post('/control/stop', async (req, res) => {
            try {
                await this.indexer.stop();
                res.json({ success: true, message: 'Indexer stopped' });
            } catch (error) {
                logger.error({ error }, 'Failed to stop indexer');
                res.status(500).json({ error: 'Failed to stop indexer' });
            }
        });
        
        this.app.post('/control/start', async (req, res) => {
            try {
                await this.indexer.start();
                res.json({ success: true, message: 'Indexer started' });
            } catch (error) {
                logger.error({ error }, 'Failed to start indexer');
                res.status(500).json({ error: 'Failed to start indexer' });
            }
        });
    }
    
    async getHealth() {
        const checks = {};
        let healthy = true;
        
        // Check database connection
        try {
            await db.query('SELECT 1');
            checks.database = { status: 'healthy' };
        } catch (error) {
            checks.database = { status: 'unhealthy', error: error.message };
            healthy = false;
        }
        
        // Check indexer status
        const indexerState = await db.query(
            'SELECT * FROM indexer_state WHERE id = 1'
        );
        
        if (indexerState.rows[0]) {
            const state = indexerState.rows[0];
            checks.indexer = {
                status: state.is_running ? 'running' : 'stopped',
                lastProcessedSlot: state.last_processed_slot,
                lag: this.indexer.syncStats.lag
            };
            
            // Unhealthy if lag is too high
            if (this.indexer.syncStats.lag > 10000) {
                checks.indexer.status = 'lagging';
                healthy = false;
            }
        }
        
        return {
            status: healthy ? 'healthy' : 'unhealthy',
            checks,
            timestamp: new Date().toISOString()
        };
    }
    
    async getStats() {
        const state = await db.query('SELECT * FROM indexer_state WHERE id = 1');
        const txCount = await db.query('SELECT COUNT(*) FROM indexed_transactions');
        const recentTx = await db.query(`
            SELECT instruction_type, COUNT(*) as count
            FROM indexed_transactions
            WHERE processed_at > NOW() - INTERVAL '1 hour'
            GROUP BY instruction_type
        `);
        
        return {
            indexer: {
                isRunning: state.rows[0]?.is_running || false,
                lastProcessedSlot: state.rows[0]?.last_processed_slot || 0,
                currentSlot: this.indexer.currentSlot,
                lag: this.indexer.syncStats.lag,
                startedAt: state.rows[0]?.started_at
            },
            transactions: {
                total: parseInt(txCount.rows[0].count),
                processed: this.indexer.syncStats.processed,
                failed: this.indexer.syncStats.failed,
                recentByType: recentTx.rows
            },
            uptime: Date.now() - (this.indexer.syncStats.startTime || Date.now())
        };
    }
    
    async getRecentActivity() {
        const result = await db.query(`
            SELECT 
                instruction_type,
                COUNT(*) as count,
                MAX(block_time) as last_seen
            FROM indexed_transactions
            WHERE block_time > NOW() - INTERVAL '1 hour'
            GROUP BY instruction_type
            ORDER BY count DESC
        `);
        
        return result.rows;
    }
    
    async getReconciliationStatus() {
        const lastRun = await db.query(`
            SELECT * FROM reconciliation_runs
            ORDER BY started_at DESC
            LIMIT 1
        `);
        
        const discrepancies = await db.query(`
            SELECT 
                discrepancy_type,
                COUNT(*) as count
            FROM ownership_discrepancies
            WHERE resolved = false
            GROUP BY discrepancy_type
        `);
        
        return {
            lastRun: lastRun.rows[0] || null,
            unresolvedDiscrepancies: discrepancies.rows,
            isRunning: this.reconciliation.isRunning
        };
    }
    
    start() {
        this.server = this.app.listen(this.port, () => {
            logger.info(`Indexer API listening on port ${this.port}`);
        });
    }
    
    stop() {
        if (this.server) {
            this.server.close();
            logger.info('API server stopped');
        }
    }
}

module.exports = IndexerAPI;
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/blockchain-indexer//src/sync/historicalSync.js:48:            // Update progress
backend/services/blockchain-indexer//src/sync/historicalSync.js:138:            UPDATE indexer_state 
backend/services/blockchain-indexer//src/sync/historicalSync.js:140:                updated_at = NOW()
backend/services/blockchain-indexer//src/routes/health.routes.js:11:    await pool.query('SELECT 1');
backend/services/blockchain-indexer//src/indexer.js:38:                SELECT last_processed_slot, last_processed_signature
backend/services/blockchain-indexer//src/indexer.js:50:                    INSERT INTO indexer_state (id, last_processed_slot, indexer_version)
backend/services/blockchain-indexer//src/indexer.js:83:        // Update database to show indexer is running
backend/services/blockchain-indexer//src/indexer.js:85:            UPDATE indexer_state
backend/services/blockchain-indexer//src/indexer.js:111:        // Update database
backend/services/blockchain-indexer//src/indexer.js:113:            UPDATE indexer_state
backend/services/blockchain-indexer//src/indexer.js:183:                // Update progress
backend/services/blockchain-indexer//src/indexer.js:191:            // Update lag
backend/services/blockchain-indexer//src/indexer.js:239:            // Update progress
backend/services/blockchain-indexer//src/indexer.js:251:            UPDATE indexer_state
backend/services/blockchain-indexer//src/indexer.js:254:                updated_at = NOW()
backend/services/blockchain-indexer//src/metrics/metricsCollector.js:71:    updateSyncLag(lag) {
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:119:                // Update ticket status if needed
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:120:                await this.updateTicketStatus(activity);
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:265:            'SELECT 1 FROM tickets WHERE token_id = $1',
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:276:                'SELECT id FROM tickets WHERE token_id = $1',
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:284:                INSERT INTO marketplace_activity 
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:313:    async updateTicketStatus(activity) {
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:315:            // Update ticket ownership after sale
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:317:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:330:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:338:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:373:                        await this.updateTicketStatus(activity);
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:63:            'SELECT 1 FROM indexed_transactions WHERE signature = $1',
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:91:            // Update database
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:93:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:117:            // Update ticket ownership
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:119:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:130:                INSERT INTO ticket_transfers 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:133:                SELECT 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:162:                UPDATE tickets 
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:204:            INSERT INTO indexed_transactions 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:76:                // Update ticket reconciliation timestamp
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:101:            INSERT INTO reconciliation_runs (started_at, status)
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:110:            UPDATE reconciliation_runs
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:125:            UPDATE reconciliation_runs
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:140:            SELECT 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:240:                INSERT INTO ownership_discrepancies 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:251:                        UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:259:                        UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:267:                        UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:276:                INSERT INTO reconciliation_log
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:294:            UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:70:                    UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:86:                UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:100:            SELECT id, token_id, wallet_address, status
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:117:                    // Token was burned - update database
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:119:                        UPDATE tickets 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:129:                        INSERT INTO ownership_discrepancies 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:138:                    }, 'Burned ticket detected and updated');
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:162:            SELECT 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:195:                // Update to correct owner
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:198:                        UPDATE tickets 
backend/services/blockchain-indexer//src/api/server.js:126:            await db.query('SELECT 1');
backend/services/blockchain-indexer//src/api/server.js:135:            'SELECT * FROM indexer_state WHERE id = 1'
backend/services/blockchain-indexer//src/api/server.js:161:        const state = await db.query('SELECT * FROM indexer_state WHERE id = 1');
backend/services/blockchain-indexer//src/api/server.js:162:        const txCount = await db.query('SELECT COUNT(*) FROM indexed_transactions');
backend/services/blockchain-indexer//src/api/server.js:164:            SELECT instruction_type, COUNT(*) as count
backend/services/blockchain-indexer//src/api/server.js:190:            SELECT 
backend/services/blockchain-indexer//src/api/server.js:205:            SELECT * FROM reconciliation_runs
backend/services/blockchain-indexer//src/api/server.js:211:            SELECT 

### All JOIN operations:
backend/services/blockchain-indexer//src/index.js:11:const ServiceBootstrap = require(path.join(__dirname, '../../../shared/src/service-bootstrap'));
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:169:            JOIN tickets t ON ma.token_id = t.token_id

### All WHERE clauses:
backend/services/blockchain-indexer//src/sync/historicalSync.js:141:            WHERE id = 1
backend/services/blockchain-indexer//src/indexer.js:40:                WHERE id = 1
backend/services/blockchain-indexer//src/indexer.js:88:            WHERE id = 1
backend/services/blockchain-indexer//src/indexer.js:115:            WHERE id = 1
backend/services/blockchain-indexer//src/indexer.js:255:            WHERE id = 1
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:265:            'SELECT 1 FROM tickets WHERE token_id = $1',
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:276:                'SELECT id FROM tickets WHERE token_id = $1',
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:324:                WHERE token_id = $3
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:332:                WHERE token_id = $1
backend/services/blockchain-indexer//src/processors/marketplaceTracker.js:340:                WHERE token_id = $1
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:63:            'SELECT 1 FROM indexed_transactions WHERE signature = $1',
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:100:                WHERE token_id = $3
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:125:                WHERE token_id = $2
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:136:                WHERE token_id = $1
backend/services/blockchain-indexer//src/processors/transactionProcessor.js:167:                WHERE token_id = $1
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:118:            WHERE id = $1
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:130:            WHERE id = $1
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:147:            WHERE 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:253:                        WHERE id = $2
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:261:                        WHERE id = $2
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:269:                        WHERE id = $2
backend/services/blockchain-indexer//src/reconciliation/reconciliationEngine.js:296:            WHERE id = $1
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:73:                    WHERE id = $1
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:88:                WHERE id = $1
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:102:            WHERE is_minted = true 
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:124:                        WHERE id = $1
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:170:            WHERE ma.activity_type = 'SALE'
backend/services/blockchain-indexer//src/reconciliation/reconciliationEnhanced.js:200:                        WHERE token_id = $2
backend/services/blockchain-indexer//src/api/server.js:135:            'SELECT * FROM indexer_state WHERE id = 1'
backend/services/blockchain-indexer//src/api/server.js:161:        const state = await db.query('SELECT * FROM indexer_state WHERE id = 1');
backend/services/blockchain-indexer//src/api/server.js:166:            WHERE processed_at > NOW() - INTERVAL '1 hour'
backend/services/blockchain-indexer//src/api/server.js:195:            WHERE block_time > NOW() - INTERVAL '1 hour'
backend/services/blockchain-indexer//src/api/server.js:215:            WHERE resolved = false

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### .env.example
```
# Service Configuration
NODE_ENV=development
PORT=3000
SERVICE_NAME=service-name

# Database
DATABASE_URL=postgresql://tickettoken:CHANGE_ME@localhost:5432/tickettoken_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=tickettoken
DB_PASSWORD=CHANGE_ME

# Redis
REDIS_URL=redis://:CHANGE_ME@localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME

# RabbitMQ
RABBITMQ_URL=amqp://tickettoken:CHANGE_ME@localhost:5672

# JWT
JWT_SECRET=CHANGE_ME

# Monitoring
PROMETHEUS_PORT=9090
METRICS_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

