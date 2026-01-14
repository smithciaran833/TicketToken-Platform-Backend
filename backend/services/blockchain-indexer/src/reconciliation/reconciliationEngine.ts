import { Connection } from '@solana/web3.js';
import logger from '../utils/logger';
import db from '../utils/database';
import { ticketServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';
import { TicketForReconciliation } from '@tickettoken/shared/clients/types';

interface Discrepancy {
    type: string;
    field: string;
    dbValue: any;
    chainValue: any;
}

interface ReconciliationResults {
    ticketsChecked: number;
    discrepanciesFound: number;
    discrepanciesResolved: number;
}

/**
 * Helper to create request context for service calls
 * Blockchain indexer operates as a system service
 */
function createSystemContext(): RequestContext {
    return {
        tenantId: 'system',
        traceId: `recon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
}

export default class ReconciliationEngine {
    private connection: Connection;
    private isRunning: boolean;
    private reconciliationInterval: NodeJS.Timeout | null;

    constructor(connection: Connection) {
        this.connection = connection;
        this.isRunning = false;
        this.reconciliationInterval = null;
    }

    async start(intervalMs: number = 300000): Promise<void> {
        if (this.isRunning) {
            logger.warn('Reconciliation engine already running');
            return;
        }

        this.isRunning = true;
        logger.info(`Starting reconciliation engine (interval: ${intervalMs}ms)`);

        await this.runReconciliation();

        this.reconciliationInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.runReconciliation();
            }
        }, intervalMs);
    }

    async stop(): Promise<void> {
        this.isRunning = false;
        if (this.reconciliationInterval) {
            clearInterval(this.reconciliationInterval);
            this.reconciliationInterval = null;
        }
        logger.info('Reconciliation engine stopped');
    }

    async runReconciliation(): Promise<ReconciliationResults> {
        const startTime = Date.now();
        const runId = await this.createRun();

        logger.info({ runId }, 'Starting reconciliation run');

        try {
            const results: ReconciliationResults = {
                ticketsChecked: 0,
                discrepanciesFound: 0,
                discrepanciesResolved: 0
            };

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

                await this.markTicketReconciled(ticket.id);
            }

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
            await this.failRun(runId, (error as Error).message);
            throw error;
        }
    }

    async createRun(): Promise<number> {
        const result = await db.query(`
            INSERT INTO reconciliation_runs (started_at, status)
            VALUES (NOW(), 'RUNNING')
            RETURNING id
        `);
        return result.rows[0].id;
    }

    async completeRun(runId: number, results: ReconciliationResults, duration: number): Promise<void> {
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

    async failRun(runId: number, errorMessage: string): Promise<void> {
        await db.query(`
            UPDATE reconciliation_runs
            SET
                completed_at = NOW(),
                status = 'FAILED',
                error_message = $2
            WHERE id = $1
        `, [runId, errorMessage]);
    }

    /**
     * REFACTORED: Now uses ticketServiceClient instead of direct DB query
     * Gets tickets needing reconciliation via ticket-service internal API
     */
    async getTicketsToReconcile(): Promise<TicketForReconciliation[]> {
        const ctx = createSystemContext();
        
        try {
            const response = await ticketServiceClient.getTicketsForReconciliation(ctx, {
                limit: 100,
                staleHours: 1,
            });

            logger.debug({ count: response.count }, 'Fetched tickets for reconciliation via service client');
            return response.tickets;
        } catch (error) {
            logger.error({ error }, 'Failed to fetch tickets for reconciliation from ticket-service');
            throw error;
        }
    }

    async checkTicket(ticket: TicketForReconciliation): Promise<Discrepancy | null> {
        try {
            if (!ticket.tokenId) {
                return null;
            }

            const onChainData = await this.getOnChainState(ticket.tokenId);

            if (!onChainData) {
                if (ticket.isMinted) {
                    return {
                        type: 'TOKEN_NOT_FOUND',
                        field: 'is_minted',
                        dbValue: true,
                        chainValue: false
                    };
                }
                return null;
            }

            if (onChainData.owner !== ticket.walletAddress) {
                return {
                    type: 'OWNERSHIP_MISMATCH',
                    field: 'wallet_address',
                    dbValue: ticket.walletAddress,
                    chainValue: onChainData.owner
                };
            }

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

    async getOnChainState(tokenId: string): Promise<any> {
        try {
            logger.debug({ tokenId }, 'Getting on-chain state');
            return null; // Placeholder
        } catch (error) {
            logger.error({ error, tokenId }, 'Failed to get on-chain state');
            return null;
        }
    }

    /**
     * REFACTORED: Now uses ticketServiceClient instead of direct DB updates
     * Resolves discrepancies via ticket-service internal API
     */
    async resolveDiscrepancy(runId: number, ticket: TicketForReconciliation, discrepancy: Discrepancy): Promise<boolean> {
        const ctx = createSystemContext();

        try {
            logger.info({
                ticketId: ticket.id,
                type: discrepancy.type,
                field: discrepancy.field
            }, 'Resolving discrepancy');

            // Record the discrepancy (owned by blockchain-indexer)
            await db.query(`
                INSERT INTO ownership_discrepancies
                (ticket_id, discrepancy_type, database_value, blockchain_value)
                VALUES ($1, $2, $3, $4)
            `, [ticket.id, discrepancy.type,
                String(discrepancy.dbValue),
                String(discrepancy.chainValue)]);

            // Use ticketServiceClient to update the ticket based on discrepancy type
            const updateData: any = {
                syncStatus: 'SYNCED' as const,
            };

            switch (discrepancy.field) {
                case 'wallet_address':
                    updateData.walletAddress = discrepancy.chainValue;
                    break;
                case 'status':
                    updateData.status = discrepancy.chainValue;
                    break;
                case 'is_minted':
                    updateData.isMinted = discrepancy.chainValue;
                    break;
            }

            await ticketServiceClient.updateBlockchainSync(ticket.id, updateData, ctx);

            // Log reconciliation (owned by blockchain-indexer)
            await db.query(`
                INSERT INTO reconciliation_log
                (reconciliation_run_id, ticket_id, field_name, old_value, new_value, source)
                VALUES ($1, $2, $3, $4, $5, 'blockchain')
            `, [runId, ticket.id, discrepancy.field,
                String(discrepancy.dbValue),
                String(discrepancy.chainValue)]);

            logger.info({ ticketId: ticket.id }, 'Discrepancy resolved via ticket-service');
            return true;

        } catch (error) {
            logger.error({ error, ticketId: ticket.id }, 'Failed to resolve discrepancy');
            return false;
        }
    }

    /**
     * REFACTORED: Now uses ticketServiceClient instead of direct DB update
     * Marks ticket as reconciled via ticket-service internal API
     */
    async markTicketReconciled(ticketId: string): Promise<void> {
        const ctx = createSystemContext();

        try {
            await ticketServiceClient.updateBlockchainSync(ticketId, {
                reconciledAt: new Date().toISOString(),
            }, ctx);
        } catch (error) {
            logger.error({ error, ticketId }, 'Failed to mark ticket reconciled via ticket-service');
            // Don't throw - this is not critical to the reconciliation process
        }
    }
}
