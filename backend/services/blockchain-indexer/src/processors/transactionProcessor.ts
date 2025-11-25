import { Connection, ConfirmedSignatureInfo } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import logger from '../utils/logger';
import db from '../utils/database';
import { BlockchainTransaction } from '../models/blockchain-transaction.model';
import { WalletActivity } from '../models/wallet-activity.model';

interface MintData {
    tokenId: string | undefined;
    owner: string | undefined;
    ticketId: string | null;
}

interface TransferData {
    tokenId: string | undefined;
    previousOwner: string | undefined;
    newOwner: string | undefined;
}

interface BurnData {
    tokenId: string | undefined;
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

        } catch (error) {
            logger.error({ error, signature }, 'Failed to process transaction');
            throw error;
        }
    }

    async saveToMongoDB(tx: any, signature: string, slot: number, blockTime: number | null): Promise<void> {
        try {
            // Extract accounts
            const accounts = tx.transaction.message.accountKeys.map((key: any) => ({
                pubkey: key.pubkey.toString(),
                isSigner: key.signer || false,
                isWritable: key.writable || false,
            }));

            // Extract instructions
            const instructions = tx.transaction.message.instructions.map((ix: any) => ({
                programId: ix.programId.toString(),
                accounts: ix.accounts || [],
                data: ix.data || '',
                parsed: ix.parsed || undefined,
            }));

            // Save to MongoDB
            await BlockchainTransaction.create({
                signature,
                slot,
                blockTime: blockTime || Date.now() / 1000,
                accounts,
                instructions,
                logs: tx.meta?.logMessages || [],
                fee: tx.meta?.fee || 0,
                status: tx.meta?.err ? 'failed' : 'success',
                errorMessage: tx.meta?.err ? JSON.stringify(tx.meta.err) : undefined,
                indexedAt: new Date(),
            });

            logger.debug({ signature }, 'Saved transaction to MongoDB');
        } catch (error: any) {
            // Don't fail the whole process if MongoDB write fails
            if (error.code === 11000) {
                logger.debug({ signature }, 'Transaction already in MongoDB');
            } else {
                logger.error({ error, signature }, 'Failed to save to MongoDB');
            }
        }
    }

    async checkExists(signature: string): Promise<boolean> {
        const result = await db.query(
            'SELECT 1 FROM indexed_transactions WHERE signature = $1',
            [signature]
        );
        return result.rows.length > 0;
    }

    parseInstructionType(tx: any): string {
        const logs = tx.meta?.logMessages || [];

        for (const log of logs) {
            if (log.includes('MintNft') || log.includes('mint')) return 'MINT_NFT';
            if (log.includes('Transfer') || log.includes('transfer')) return 'TRANSFER';
            if (log.includes('Burn') || log.includes('burn')) return 'BURN';
        }

        return 'UNKNOWN';
    }

    async processMint(tx: any, signature: string, slot: number, blockTime: number | null): Promise<void> {
        try {
            const mintData = this.extractMintData(tx);
            if (!mintData) {
                logger.warn({ signature }, 'Could not extract mint data');
                return;
            }

            // Update PostgreSQL (keep relational links)
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

            // DUAL WRITE: Save wallet activity to MongoDB
            await WalletActivity.create({
                walletAddress: mintData.owner,
                activityType: 'mint',
                assetId: mintData.tokenId,
                transactionSignature: signature,
                timestamp: blockTime ? new Date(blockTime * 1000) : new Date(),
            });

            logger.info({
                ticketId: mintData.ticketId,
                tokenId: mintData.tokenId
            }, 'NFT mint processed');
        } catch (error) {
            logger.error({ error, signature }, 'Failed to process mint');
        }
    }

    async processTransfer(tx: any, signature: string, slot: number, blockTime: number | null): Promise<void> {
        try {
            const transferData = this.extractTransferData(tx);
            if (!transferData) return;

            // Update PostgreSQL (keep relational links)
            await db.query(`
                UPDATE tickets
                SET
                    wallet_address = $1,
                    transfer_count = COALESCE(transfer_count, 0) + 1,
                    last_indexed_at = NOW(),
                    sync_status = 'SYNCED'
                WHERE token_id = $2
            `, [transferData.newOwner, transferData.tokenId]);

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

            // DUAL WRITE: Save wallet activity to MongoDB
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
            }

            logger.info({
                tokenId: transferData.tokenId,
                from: transferData.previousOwner,
                to: transferData.newOwner
            }, 'NFT transfer processed');
        } catch (error) {
            logger.error({ error, signature }, 'Failed to process transfer');
        }
    }

    async processBurn(tx: any, signature: string, slot: number, blockTime: number | null): Promise<void> {
        try {
            const burnData = this.extractBurnData(tx);
            if (!burnData) return;

            // Update PostgreSQL (keep relational links)
            await db.query(`
                UPDATE tickets
                SET
                    status = 'BURNED',
                    last_indexed_at = NOW(),
                    sync_status = 'SYNCED'
                WHERE token_id = $1
            `, [burnData.tokenId]);

            // DUAL WRITE: Save wallet activity to MongoDB
            const owner = tx.meta?.preTokenBalances?.[0]?.owner;
            if (owner) {
                await WalletActivity.create({
                    walletAddress: owner,
                    activityType: 'burn',
                    assetId: burnData.tokenId,
                    transactionSignature: signature,
                    timestamp: blockTime ? new Date(blockTime * 1000) : new Date(),
                });
            }

            logger.info({ tokenId: burnData.tokenId }, 'NFT burn processed');
        } catch (error) {
            logger.error({ error, signature }, 'Failed to process burn');
        }
    }

    extractMintData(tx: any): MintData | null {
        return {
            tokenId: tx.meta?.postTokenBalances?.[0]?.mint,
            owner: tx.meta?.postTokenBalances?.[0]?.owner,
            ticketId: null
        };
    }

    extractTransferData(tx: any): TransferData | null {
        return {
            tokenId: tx.meta?.postTokenBalances?.[0]?.mint,
            previousOwner: tx.meta?.preTokenBalances?.[0]?.owner,
            newOwner: tx.meta?.postTokenBalances?.[0]?.owner
        };
    }

    extractBurnData(tx: any): BurnData | null {
        return {
            tokenId: tx.meta?.preTokenBalances?.[0]?.mint
        };
    }

    async recordTransaction(signature: string, slot: number, blockTime: number | null, instructionType: string): Promise<void> {
        await db.query(`
            INSERT INTO indexed_transactions
            (signature, slot, block_time, instruction_type, processed_at)
            VALUES ($1, $2, to_timestamp($3), $4, NOW())
            ON CONFLICT (signature) DO NOTHING
        `, [signature, slot, blockTime, instructionType]);
    }
}
