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
