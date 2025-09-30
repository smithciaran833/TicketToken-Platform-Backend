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
