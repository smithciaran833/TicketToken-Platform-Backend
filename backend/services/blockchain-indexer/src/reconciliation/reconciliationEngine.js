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
