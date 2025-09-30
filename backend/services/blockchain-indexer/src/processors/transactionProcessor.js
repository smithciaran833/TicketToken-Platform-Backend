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
