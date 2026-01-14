/**
 * Blockchain Indexer - Main indexer class
 * 
 * AUDIT FIX: ERR-7/GD-2/EXT-1 - Integrated RPC failover
 * AUDIT FIX: BG-2 - Added overlapping execution protection
 * AUDIT FIX: EXT-2 - Added request timeouts
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import logger from './utils/logger';
import db from './utils/database';
import TransactionProcessor from './processors/transactionProcessor';
import { RPCFailoverManager } from './utils/rpcFailover';
import { transactionsProcessedTotal, indexerLag, rpcCallDuration } from './utils/metrics';

interface Config {
    solana: {
        rpcUrl: string;
        rpcUrls?: string[]; // Multiple endpoints for failover
        wsUrl?: string;
        commitment?: string;
        programId?: string;
    };
    polling?: {
        intervalMs?: number;
        batchSize?: number;
    };
}

interface SyncStats {
    processed: number;
    failed: number;
    lag: number;
    startTime: number | null;
}

const DEFAULT_POLLING_INTERVAL = 5000;
const DEFAULT_BATCH_SIZE = 10;
const RPC_TIMEOUT_MS = 30000;

export default class BlockchainIndexer extends EventEmitter {
    private rpcManager: RPCFailoverManager;
    private connection: Connection; // Kept for WebSocket subscription
    private programId: PublicKey | null;
    private lastProcessedSlot: number;
    private lastSignature: string | null;
    private isRunning: boolean;
    private config: Config;
    public syncStats: SyncStats;
    private processor: TransactionProcessor;
    private subscription?: number;
    public currentSlot: number;
    
    // AUDIT FIX: BG-2 - Overlap protection
    private pollingInProgress: boolean = false;
    private pollingTimer?: NodeJS.Timeout;
    private readonly pollingIntervalMs: number;
    private readonly batchSize: number;

    constructor(config: Config) {
        super();
        
        // AUDIT FIX: ERR-7/GD-2 - Use RPC failover manager
        const rpcEndpoints = config.solana.rpcUrls && config.solana.rpcUrls.length > 0
            ? config.solana.rpcUrls
            : [config.solana.rpcUrl];
        
        this.rpcManager = new RPCFailoverManager({
            endpoints: rpcEndpoints,
            healthCheckIntervalMs: 30000,
            maxConsecutiveFailures: 3,
            connectionConfig: {
                commitment: (config.solana.commitment as any) || 'confirmed',
                confirmTransactionInitialTimeout: RPC_TIMEOUT_MS
            }
        });
        
        // Keep a direct connection for WebSocket subscriptions
        this.connection = new Connection(config.solana.rpcUrl, {
            commitment: (config.solana.commitment as any) || 'confirmed',
            wsEndpoint: config.solana.wsUrl,
            confirmTransactionInitialTimeout: RPC_TIMEOUT_MS
        });

        this.programId = config.solana.programId ? new PublicKey(config.solana.programId) : null;
        this.lastProcessedSlot = 0;
        this.lastSignature = null;
        this.isRunning = false;
        this.config = config;
        this.currentSlot = 0;
        
        // Polling configuration
        this.pollingIntervalMs = config.polling?.intervalMs || DEFAULT_POLLING_INTERVAL;
        this.batchSize = config.polling?.batchSize || DEFAULT_BATCH_SIZE;

        this.syncStats = {
            processed: 0,
            failed: 0,
            lag: 0,
            startTime: null
        };

        // Pass connection getter to processor for failover support
        this.processor = new TransactionProcessor(this.rpcManager.getConnection());
        
        logger.info({
            rpcEndpoints: rpcEndpoints.length,
            pollingIntervalMs: this.pollingIntervalMs,
            batchSize: this.batchSize
        }, 'BlockchainIndexer constructed with failover support');
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
                logger.info({ slot: this.lastProcessedSlot }, 'Resuming from saved state');
            } else {
                await db.query(`
                    INSERT INTO indexer_state (id, last_processed_slot, indexer_version)
                    VALUES (1, 0, '1.0.0')
                    ON CONFLICT (id) DO NOTHING
                `);
                logger.info('Initialized new indexer state');
            }

            // AUDIT FIX: Use RPC failover for getting current slot
            this.currentSlot = await this.rpcManager.executeWithFailover(
                async (conn) => conn.getSlot(),
                'initialize:getSlot'
            );
            
            this.syncStats.lag = this.currentSlot - this.lastProcessedSlot;
            indexerLag.set(this.syncStats.lag);

            logger.info({
                lastSlot: this.lastProcessedSlot,
                currentSlot: this.currentSlot,
                lag: this.syncStats.lag,
                rpcStatus: this.rpcManager.getStatus()
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
            logger.warn({ lag: this.syncStats.lag }, 'Large lag detected. Consider running historical sync.');
        }

        await this.startRealtimeIndexing();
    }

    async stop(): Promise<void> {
        logger.info('Stopping indexer...');
        this.isRunning = false;

        // Stop polling timer
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = undefined;
        }

        // Wait for any in-flight polling to complete
        while (this.pollingInProgress) {
            logger.info('Waiting for in-flight polling to complete...');
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.subscription) {
            await this.connection.removeAccountChangeListener(this.subscription);
        }

        // Stop RPC manager health checks
        this.rpcManager.stop();

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

    /**
     * AUDIT FIX: BG-2 - Start polling with overlap protection
     */
    startPolling(): void {
        logger.info({ intervalMs: this.pollingIntervalMs }, 'Starting polling with overlap protection');
        
        this.pollingTimer = setInterval(async () => {
            if (!this.isRunning) {
                return;
            }

            // AUDIT FIX: BG-2 - Skip if previous poll still in progress
            if (this.pollingInProgress) {
                logger.debug('Skipping poll - previous poll still in progress');
                return;
            }

            try {
                this.pollingInProgress = true;
                await this.pollRecentTransactions();
            } catch (error) {
                logger.error({ error }, 'Polling error');
                this.syncStats.failed++;
            } finally {
                this.pollingInProgress = false;
            }
        }, this.pollingIntervalMs);
    }

    /**
     * AUDIT FIX: ERR-7/GD-2 - Poll using RPC failover
     */
    async pollRecentTransactions(): Promise<void> {
        if (!this.programId) return;

        const startTime = Date.now();
        
        try {
            // AUDIT FIX: Use RPC failover for getting signatures
            const signatures = await this.rpcManager.executeWithFailover(
                async (conn) => conn.getSignaturesForAddress(
                    this.programId!,
                    { limit: this.batchSize },
                    'confirmed'
                ),
                'poll:getSignaturesForAddress'
            );

            rpcCallDuration.observe({ method: 'getSignaturesForAddress' }, (Date.now() - startTime) / 1000);

            for (const sigInfo of signatures) {
                try {
                    await this.processor.processTransaction(sigInfo);
                    this.syncStats.processed++;
                    transactionsProcessedTotal.inc({ instruction_type: 'unknown', status: 'success' });

                    if (sigInfo.slot > this.lastProcessedSlot) {
                        this.lastProcessedSlot = sigInfo.slot;
                        this.lastSignature = sigInfo.signature;
                        await this.saveProgress();
                    }
                } catch (txError) {
                    logger.error({ error: txError, signature: sigInfo.signature }, 'Failed to process transaction');
                    this.syncStats.failed++;
                    transactionsProcessedTotal.inc({ instruction_type: 'unknown', status: 'failed' });
                }
            }

            // Update current slot with failover
            this.currentSlot = await this.rpcManager.executeWithFailover(
                async (conn) => conn.getSlot(),
                'poll:getSlot'
            );
            
            this.syncStats.lag = this.currentSlot - this.lastProcessedSlot;
            indexerLag.set(this.syncStats.lag);

            if (this.syncStats.processed % 100 === 0 && this.syncStats.processed > 0) {
                logger.info({
                    processed: this.syncStats.processed,
                    failed: this.syncStats.failed,
                    lag: this.syncStats.lag
                }, 'Indexing progress');
            }

        } catch (error) {
            logger.error({ error }, 'Failed to poll recent transactions');
            this.syncStats.failed++;
            throw error;
        }
    }

    /**
     * AUDIT FIX: Use RPC failover for block processing
     */
    async processSlot(slot: number): Promise<void> {
        try {
            const block = await this.rpcManager.executeWithFailover(
                async (conn) => conn.getBlock(slot, {
                    maxSupportedTransactionVersion: 0
                }),
                'processSlot:getBlock'
            );

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

                try {
                    await this.processor.processTransaction(sigInfo);
                    this.syncStats.processed++;
                    transactionsProcessedTotal.inc({ instruction_type: 'unknown', status: 'success' });
                } catch (txError) {
                    logger.error({ error: txError, signature: sigInfo.signature }, 'Failed to process transaction');
                    this.syncStats.failed++;
                    transactionsProcessedTotal.inc({ instruction_type: 'unknown', status: 'failed' });
                }
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

    /**
     * Get RPC failover status for health checks
     */
    getRpcStatus(): ReturnType<RPCFailoverManager['getStatus']> {
        return this.rpcManager.getStatus();
    }
}
