import { Connection, ConfirmedSignatureInfo } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import logger from '../utils/logger';
import db from '../utils/database';
import { BlockchainTransaction } from '../models/blockchain-transaction.model';
import { WalletActivity } from '../models/wallet-activity.model';
import {
    transactionsProcessedTotal,
    transactionProcessingDuration,
    mongodbWrites,
    postgresqlQueries,
    databaseWriteDuration,
    processingErrorsTotal
} from '../utils/metrics';
import {
    validateMintData,
    validateTransferData,
    validateBurnData,
    validateTransactionAccounts,
    validateOwnerAddress,
    isValidAddress,
    ValidatedMintData,
    ValidatedTransferData,
    ValidatedBurnData
} from '../schemas/validation';
import { ticketServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

/**
 * Helper to create request context for service calls
 * Blockchain indexer operates as a system service
 */
function createSystemContext(): RequestContext {
    return {
        tenantId: 'system',
        traceId: `txproc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
}

export default class TransactionProcessor {
    private connection: Connection;
    private metaplex: Metaplex;

    constructor(connection: Connection) {
        this.connection = connection;
        this.metaplex = Metaplex.make(connection);
    }

    async processTransaction(sigInfo: ConfirmedSignatureInfo): Promise<void> {
        const { signature, slot, blockTime } = sigInfo;
        const startTime = Date.now();
        let instructionType = 'UNKNOWN';

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
            instructionType = this.parseInstructionType(tx);
            logger.info({ signature, type: instructionType }, 'Processing transaction');

            // Normalize blockTime to null if undefined
            const normalizedBlockTime = blockTime ?? null;

            // DUAL WRITE: Save full transaction to MongoDB
            await this.saveToMongoDB(tx, signature, slot, normalizedBlockTime);

            // Process based on type
            switch (instructionType) {
                case 'MINT_NFT':
                    await this.processMint(tx, signature, slot, normalizedBlockTime);
                    break;
                case 'TRANSFER':
                    await this.processTransfer(tx, signature, slot, normalizedBlockTime);
                    break;
                case 'BURN':
                    await this.processBurn(tx, signature, slot, normalizedBlockTime);
                    break;
                default:
                    logger.debug({ signature, type: instructionType }, 'Unknown transaction type');
            }

            // Record processed transaction (PostgreSQL)
            await this.recordTransaction(signature, slot, normalizedBlockTime, instructionType);

            // Record success metrics
            const duration = (Date.now() - startTime) / 1000;
            transactionsProcessedTotal.inc({ instruction_type: instructionType, status: 'success' });
            transactionProcessingDuration.observe({ instruction_type: instructionType }, duration);

        } catch (error) {
            // Record error metrics
            const duration = (Date.now() - startTime) / 1000;
            transactionsProcessedTotal.inc({ instruction_type: instructionType, status: 'error' });
            transactionProcessingDuration.observe({ instruction_type: instructionType }, duration);
            processingErrorsTotal.inc({ error_type: 'transaction_processing' });

            logger.error({ error, signature }, 'Failed to process transaction');
            throw error;
        }
    }

    /**
     * Save transaction to MongoDB with proper error handling
     * AUDIT FIX: ERR-1, DB-1 - Don't swallow MongoDB write errors
     * AUDIT FIX: GD-1 - Track failed writes for retry
     * AUDIT FIX: INP-4 - Validate blockchain data before storing
     */
    async saveToMongoDB(tx: any, signature: string, slot: number, blockTime: number | null): Promise<void> {
        const maxRetries = 3;
        let lastError: any = null;
        const startTime = Date.now();

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // AUDIT FIX: INP-4 - Validate accounts before extraction
                const rawAccounts = tx.transaction?.message?.accountKeys || [];
                if (!validateTransactionAccounts(rawAccounts)) {
                    logger.warn({ signature }, 'Invalid transaction accounts structure, storing with empty accounts');
                }

                // Extract accounts with validation
                const accounts = rawAccounts.map((key: any) => {
                    const pubkey = key?.pubkey?.toString?.() || '';
                    return {
                        pubkey: isValidAddress(pubkey) ? pubkey : 'invalid',
                        isSigner: Boolean(key?.signer),
                        isWritable: Boolean(key?.writable),
                    };
                });

                // Extract instructions
                const rawInstructions = tx.transaction?.message?.instructions || [];
                const instructions = rawInstructions.map((ix: any) => {
                    const programId = ix?.programId?.toString?.() || '';
                    return {
                        programId: isValidAddress(programId) ? programId : 'invalid',
                        accounts: Array.isArray(ix?.accounts) ? ix.accounts : [],
                        data: typeof ix?.data === 'string' ? ix.data : '',
                        parsed: ix?.parsed || undefined,
                    };
                });

                // Save to MongoDB
                await BlockchainTransaction.create({
                    signature,
                    slot,
                    blockTime: blockTime || Date.now() / 1000,
                    accounts,
                    instructions,
                    logs: Array.isArray(tx.meta?.logMessages) ? tx.meta.logMessages : [],
                    fee: typeof tx.meta?.fee === 'number' ? tx.meta.fee : 0,
                    status: tx.meta?.err ? 'failed' : 'success',
                    errorMessage: tx.meta?.err ? JSON.stringify(tx.meta.err) : undefined,
                    indexedAt: new Date(),
                });

                // Record success metrics
                const duration = (Date.now() - startTime) / 1000;
                mongodbWrites.inc({ collection: 'blockchain_transactions', status: 'success' });
                databaseWriteDuration.observe({ database: 'mongodb', operation: 'insert' }, duration);

                logger.debug({ signature }, 'Saved transaction to MongoDB');
                return; // Success - exit

            } catch (error: any) {
                lastError = error;

                // Duplicate key - transaction already exists, this is OK
                if (error.code === 11000) {
                    logger.debug({ signature }, 'Transaction already in MongoDB (duplicate)');
                    mongodbWrites.inc({ collection: 'blockchain_transactions', status: 'duplicate' });
                    return; // Not an error, just already exists
                }

                // Log the error with context
                logger.warn({
                    error: error.message,
                    signature,
                    attempt,
                    maxRetries,
                    errorCode: error.code
                }, `MongoDB write attempt ${attempt}/${maxRetries} failed`);

                // If not last attempt, wait before retry with exponential backoff
                if (attempt < maxRetries) {
                    const delay = Math.min(100 * Math.pow(2, attempt), 2000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All retries failed - record error metrics
        const duration = (Date.now() - startTime) / 1000;
        mongodbWrites.inc({ collection: 'blockchain_transactions', status: 'error' });
        databaseWriteDuration.observe({ database: 'mongodb', operation: 'insert' }, duration);

        // AUDIT FIX: ERR-1, DB-1 - Don't swallow the error, propagate it
        logger.error({
            error: lastError?.message,
            errorCode: lastError?.code,
            signature,
            slot,
            attempts: maxRetries
        }, 'MongoDB write failed after all retries');

        // Track failed write for potential dead letter queue / manual recovery
        await this.trackFailedWrite(signature, slot, lastError);

        // Throw to let caller know the write failed
        throw new Error(`MongoDB write failed for signature ${signature}: ${lastError?.message}`);
    }

    /**
     * Track failed MongoDB writes for recovery
     * AUDIT FIX: ERR-10 - Dead letter queue for failed processing
     */
    private async trackFailedWrite(signature: string, slot: number, error: any): Promise<void> {
        const startTime = Date.now();
        try {
            // Store failed write in PostgreSQL for recovery
            await db.query(`
                INSERT INTO failed_mongodb_writes
                (signature, slot, error_message, error_code, created_at)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (signature) DO UPDATE SET
                    retry_count = failed_mongodb_writes.retry_count + 1,
                    last_error = $3,
                    updated_at = NOW()
            `, [signature, slot, error?.message || 'Unknown error', error?.code || 'UNKNOWN']);

            const duration = (Date.now() - startTime) / 1000;
            postgresqlQueries.inc({ operation: 'insert', status: 'success' });
            databaseWriteDuration.observe({ database: 'postgresql', operation: 'insert' }, duration);
        } catch (trackError) {
            const duration = (Date.now() - startTime) / 1000;
            postgresqlQueries.inc({ operation: 'insert', status: 'error' });
            databaseWriteDuration.observe({ database: 'postgresql', operation: 'insert' }, duration);

            // Log but don't throw - this is best-effort tracking
            logger.error({
                error: (trackError as Error).message,
                signature
            }, 'Failed to track MongoDB write failure');
        }
    }

    async checkExists(signature: string): Promise<boolean> {
        const startTime = Date.now();
        try {
            const result = await db.query(
                'SELECT 1 FROM indexed_transactions WHERE signature = $1',
                [signature]
            );
            const duration = (Date.now() - startTime) / 1000;
            postgresqlQueries.inc({ operation: 'select', status: 'success' });
            databaseWriteDuration.observe({ database: 'postgresql', operation: 'select' }, duration);
            return result.rows.length > 0;
        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            postgresqlQueries.inc({ operation: 'select', status: 'error' });
            databaseWriteDuration.observe({ database: 'postgresql', operation: 'select' }, duration);
            throw error;
        }
    }

    parseInstructionType(tx: any): string {
        const logs = tx.meta?.logMessages || [];

        for (const log of logs) {
            if (typeof log !== 'string') continue;
            if (log.includes('MintNft') || log.includes('mint')) return 'MINT_NFT';
            if (log.includes('Transfer') || log.includes('transfer')) return 'TRANSFER';
            if (log.includes('Burn') || log.includes('burn')) return 'BURN';
        }

        return 'UNKNOWN';
    }

    /**
     * REFACTORED: Process mint transaction using ticketServiceClient
     * AUDIT FIX: INP-4 - Validate extracted blockchain data
     */
    async processMint(tx: any, signature: string, slot: number, blockTime: number | null): Promise<void> {
        const ctx = createSystemContext();
        const startTime = Date.now();

        try {
            // AUDIT FIX: INP-4 - Use validated extraction
            const mintData = validateMintData(tx);
            if (!mintData) {
                logger.warn({ signature }, 'Could not extract or validate mint data');
                processingErrorsTotal.inc({ error_type: 'mint_validation_failed' });
                return;
            }

            // REFACTORED: Use ticketServiceClient instead of direct DB update
            await ticketServiceClient.updateBlockchainSyncByToken(mintData.tokenId, {
                isMinted: true,
                mintTransactionId: signature,
                walletAddress: mintData.owner,
                lastIndexedAt: new Date().toISOString(),
                syncStatus: 'SYNCED',
            }, ctx);

            const pgDuration = (Date.now() - startTime) / 1000;
            postgresqlQueries.inc({ operation: 'update', status: 'success' });
            databaseWriteDuration.observe({ database: 'postgresql', operation: 'update' }, pgDuration);

            // DUAL WRITE: Save wallet activity to MongoDB
            const mongoStart = Date.now();
            await WalletActivity.create({
                walletAddress: mintData.owner,
                activityType: 'mint',
                assetId: mintData.tokenId,
                transactionSignature: signature,
                timestamp: blockTime ? new Date(blockTime * 1000) : new Date(),
            });

            const mongoDuration = (Date.now() - mongoStart) / 1000;
            mongodbWrites.inc({ collection: 'wallet_activity', status: 'success' });
            databaseWriteDuration.observe({ database: 'mongodb', operation: 'insert' }, mongoDuration);

            logger.info({
                ticketId: mintData.ticketId,
                tokenId: mintData.tokenId
            }, 'NFT mint processed via ticket-service');
        } catch (error) {
            processingErrorsTotal.inc({ error_type: 'mint_processing' });
            logger.error({ error, signature }, 'Failed to process mint');
        }
    }

    /**
     * REFACTORED: Process transfer transaction using ticketServiceClient
     * AUDIT FIX: INP-4 - Validate extracted blockchain data
     */
    async processTransfer(tx: any, signature: string, slot: number, blockTime: number | null): Promise<void> {
        const ctx = createSystemContext();
        const startTime = Date.now();

        try {
            // AUDIT FIX: INP-4 - Use validated extraction
            const transferData = validateTransferData(tx);
            if (!transferData) {
                logger.warn({ signature }, 'Could not extract or validate transfer data');
                processingErrorsTotal.inc({ error_type: 'transfer_validation_failed' });
                return;
            }

            // REFACTORED: Use ticketServiceClient to record blockchain transfer
            // This updates ticket ownership and creates transfer record
            await ticketServiceClient.recordBlockchainTransfer({
                tokenId: transferData.tokenId,
                fromWallet: transferData.previousOwner || '',
                toWallet: transferData.newOwner,
                transactionSignature: signature,
                blockTime: blockTime ?? undefined,
                slot,
                metadata: { slot },
            }, ctx);

            const pgDuration = (Date.now() - startTime) / 1000;
            postgresqlQueries.inc({ operation: 'update', status: 'success' });
            postgresqlQueries.inc({ operation: 'insert', status: 'success' });
            databaseWriteDuration.observe({ database: 'postgresql', operation: 'update' }, pgDuration);

            // DUAL WRITE: Save wallet activity to MongoDB
            const mongoStart = Date.now();
            if (transferData.previousOwner) {
                await WalletActivity.create({
                    walletAddress: transferData.previousOwner,
                    activityType: 'transfer',
                    assetId: transferData.tokenId,
                    transactionSignature: signature,
                    fromAddress: transferData.previousOwner,
                    toAddress: transferData.newOwner,
                    timestamp: blockTime ? new Date(blockTime * 1000) : new Date(),
                });
                mongodbWrites.inc({ collection: 'wallet_activity', status: 'success' });
            }

            if (transferData.newOwner) {
                await WalletActivity.create({
                    walletAddress: transferData.newOwner,
                    activityType: 'transfer',
                    assetId: transferData.tokenId,
                    transactionSignature: signature,
                    fromAddress: transferData.previousOwner,
                    toAddress: transferData.newOwner,
                    timestamp: blockTime ? new Date(blockTime * 1000) : new Date(),
                });
                mongodbWrites.inc({ collection: 'wallet_activity', status: 'success' });
            }

            const mongoDuration = (Date.now() - mongoStart) / 1000;
            databaseWriteDuration.observe({ database: 'mongodb', operation: 'insert' }, mongoDuration);

            logger.info({
                tokenId: transferData.tokenId,
                from: transferData.previousOwner,
                to: transferData.newOwner
            }, 'NFT transfer processed via ticket-service');
        } catch (error) {
            processingErrorsTotal.inc({ error_type: 'transfer_processing' });
            logger.error({ error, signature }, 'Failed to process transfer');
        }
    }

    /**
     * REFACTORED: Process burn transaction using ticketServiceClient
     * AUDIT FIX: INP-4 - Validate extracted blockchain data
     */
    async processBurn(tx: any, signature: string, slot: number, blockTime: number | null): Promise<void> {
        const ctx = createSystemContext();
        const startTime = Date.now();

        try {
            // AUDIT FIX: INP-4 - Use validated extraction
            const burnData = validateBurnData(tx);
            if (!burnData) {
                logger.warn({ signature }, 'Could not extract or validate burn data');
                processingErrorsTotal.inc({ error_type: 'burn_validation_failed' });
                return;
            }

            // REFACTORED: Use ticketServiceClient instead of direct DB update
            await ticketServiceClient.updateBlockchainSyncByToken(burnData.tokenId, {
                status: 'BURNED',
                lastIndexedAt: new Date().toISOString(),
                syncStatus: 'SYNCED',
            }, ctx);

            const pgDuration = (Date.now() - startTime) / 1000;
            postgresqlQueries.inc({ operation: 'update', status: 'success' });
            databaseWriteDuration.observe({ database: 'postgresql', operation: 'update' }, pgDuration);

            // DUAL WRITE: Save wallet activity to MongoDB
            // AUDIT FIX: INP-4 - Validate owner address
            const owner = validateOwnerAddress(tx.meta?.preTokenBalances?.[0]?.owner);
            if (owner) {
                const mongoStart = Date.now();
                await WalletActivity.create({
                    walletAddress: owner,
                    activityType: 'burn',
                    assetId: burnData.tokenId,
                    transactionSignature: signature,
                    timestamp: blockTime ? new Date(blockTime * 1000) : new Date(),
                });

                const mongoDuration = (Date.now() - mongoStart) / 1000;
                mongodbWrites.inc({ collection: 'wallet_activity', status: 'success' });
                databaseWriteDuration.observe({ database: 'mongodb', operation: 'insert' }, mongoDuration);
            }

            logger.info({ tokenId: burnData.tokenId }, 'NFT burn processed via ticket-service');
        } catch (error) {
            processingErrorsTotal.inc({ error_type: 'burn_processing' });
            logger.error({ error, signature }, 'Failed to process burn');
        }
    }

    async recordTransaction(signature: string, slot: number, blockTime: number | null, instructionType: string): Promise<void> {
        const startTime = Date.now();
        try {
            await db.query(`
                INSERT INTO indexed_transactions
                (signature, slot, block_time, instruction_type, processed_at)
                VALUES ($1, $2, to_timestamp($3), $4, NOW())
                ON CONFLICT (signature) DO NOTHING
            `, [signature, slot, blockTime, instructionType]);

            const duration = (Date.now() - startTime) / 1000;
            postgresqlQueries.inc({ operation: 'insert', status: 'success' });
            databaseWriteDuration.observe({ database: 'postgresql', operation: 'insert' }, duration);
        } catch (error) {
            const duration = (Date.now() - startTime) / 1000;
            postgresqlQueries.inc({ operation: 'insert', status: 'error' });
            databaseWriteDuration.observe({ database: 'postgresql', operation: 'insert' }, duration);
            throw error;
        }
    }
}
