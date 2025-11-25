import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import logger from './utils/logger';
import db from './utils/database';
import TransactionProcessor from './processors/transactionProcessor';

interface Config {
    solana: {
        rpcUrl: string;
        wsUrl?: string;
        commitment?: string;
        programId?: string;
    };
}

interface SyncStats {
    processed: number;
    failed: number;
    lag: number;
    startTime: number | null;
}

export default class BlockchainIndexer extends EventEmitter {
    private connection: Connection;
    private programId: PublicKey | null;
    private lastProcessedSlot: number;
    private lastSignature: string | null;
    private isRunning: boolean;
    private config: Config;
    public syncStats: SyncStats;
    private processor: TransactionProcessor;
    private subscription?: number;
    public currentSlot: number;

    constructor(config: Config) {
        super();
        this.connection = new Connection(config.solana.rpcUrl, {
            commitment: (config.solana.commitment as any) || 'confirmed',
            wsEndpoint: config.solana.wsUrl
        });

        this.programId = config.solana.programId ? new PublicKey(config.solana.programId) : null;
        this.lastProcessedSlot = 0;
        this.lastSignature = null;
        this.isRunning = false;
        this.config = config;
        this.currentSlot = 0;

        this.syncStats = {
            processed: 0,
            failed: 0,
            lag: 0,
            startTime: null
        };

        this.processor = new TransactionProcessor(this.connection);
    }

    async initialize(): Promise<boolean> {
        try {
            logger.info('Initializing blockchain indexer...');

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
                await db.query(`
                    INSERT INTO indexer_state (id, last_processed_slot, indexer_version)
                    VALUES (1, 0, '1.0.0')
                    ON CONFLICT (id) DO NOTHING
                `);
                logger.info('Initialized new indexer state');
            }

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
            return false;
        }
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('Indexer is already running');
            return;
        }

        this.isRunning = true;
        this.syncStats.startTime = Date.now();

        await db.query(`
            UPDATE indexer_state
            SET is_running = true,
                started_at = NOW()
            WHERE id = 1
        `);

        logger.info('Indexer started');

        if (this.syncStats.lag > 1000) {
            logger.warn(`Large lag detected (${this.syncStats.lag} slots). Consider running historical sync.`);
        }

        await this.startRealtimeIndexing();
    }

    async stop(): Promise<void> {
        logger.info('Stopping indexer...');
        this.isRunning = false;

        if (this.subscription) {
            await this.connection.removeAccountChangeListener(this.subscription);
        }

        await db.query(`
            UPDATE indexer_state
            SET is_running = false
            WHERE id = 1
        `);

        logger.info('Indexer stopped');
    }

    async startRealtimeIndexing(): Promise<void> {
        logger.info('Starting real-time indexing...');

        if (!this.programId) {
            logger.warn('No program ID configured, skipping program monitoring');
            return;
        }

        try {
            this.subscription = this.connection.onProgramAccountChange(
                this.programId,
                async (accountInfo, context) => {
                    logger.debug({ slot: context.slot }, 'Program account change detected');
                    await this.processSlot(context.slot);
                },
                'confirmed'
            );

            logger.info('Real-time indexing started');

            this.startPolling();

        } catch (error) {
            logger.error({ error }, 'Failed to start real-time indexing');
            throw error;
        }
    }

    startPolling(): void {
        setInterval(async () => {
            if (!this.isRunning) {
                return;
            }

            try {
                await this.pollRecentTransactions();
            } catch (error) {
                logger.error({ error }, 'Polling error');
            }
        }, 5000);
    }

    async pollRecentTransactions(): Promise<void> {
        try {
            if (!this.programId) return;

            const signatures = await this.connection.getSignaturesForAddress(
                this.programId,
                { limit: 10 },
                'confirmed'
            );

            for (const sigInfo of signatures) {
                await this.processor.processTransaction(sigInfo);
                this.syncStats.processed++;

                if (sigInfo.slot > this.lastProcessedSlot) {
                    this.lastProcessedSlot = sigInfo.slot;
                    this.lastSignature = sigInfo.signature;
                    await this.saveProgress();
                }
            }

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

    async processSlot(slot: number): Promise<void> {
        try {
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

            for (const tx of block.transactions) {
                if (tx.meta?.err) continue;

                const sigInfo = {
                    signature: tx.transaction.signatures[0],
                    slot: slot,
                    blockTime: block.blockTime,
                    err: null,
                    memo: null,
                    confirmationStatus: 'confirmed' as const
                };

                await this.processor.processTransaction(sigInfo);
                this.syncStats.processed++;
            }

            this.lastProcessedSlot = slot;
            await this.saveProgress();

        } catch (error) {
            logger.error({ error, slot }, 'Failed to process slot');
            this.syncStats.failed++;
        }
    }

    async saveProgress(): Promise<void> {
        await db.query(`
            UPDATE indexer_state
            SET last_processed_slot = $1,
                last_processed_signature = $2,
                updated_at = NOW()
            WHERE id = 1
        `, [this.lastProcessedSlot, this.lastSignature]);
    }
}
