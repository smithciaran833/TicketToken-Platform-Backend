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
