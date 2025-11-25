import { Connection } from '@solana/web3.js';
import logger from '../utils/logger';
import db from '../utils/database';

interface Ticket {
    id: string;
    token_id: string;
    wallet_address: string;
    status: string;
    is_minted: boolean;
}

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

    async getTicketsToReconcile(): Promise<Ticket[]> {
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

    async checkTicket(ticket: Ticket): Promise<Discrepancy | null> {
        try {
            if (!ticket.token_id) {
                return null;
            }

            const onChainData = await this.getOnChainState(ticket.token_id);

            if (!onChainData) {
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

            if (onChainData.owner !== ticket.wallet_address) {
                return {
                    type: 'OWNERSHIP_MISMATCH',
                    field: 'wallet_address',
                    dbValue: ticket.wallet_address,
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

    async resolveDiscrepancy(runId: number, ticket: Ticket, discrepancy: Discrepancy): Promise<boolean> {
        try {
            logger.info({
                ticketId: ticket.id,
                type: discrepancy.type,
                field: discrepancy.field
            }, 'Resolving discrepancy');

            await db.query(`
                INSERT INTO ownership_discrepancies
                (ticket_id, discrepancy_type, database_value, blockchain_value)
                VALUES ($1, $2, $3, $4)
            `, [ticket.id, discrepancy.type,
                String(discrepancy.dbValue),
                String(discrepancy.chainValue)]);

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

    async markTicketReconciled(ticketId: string): Promise<void> {
        await db.query(`
            UPDATE tickets
            SET reconciled_at = NOW()
            WHERE id = $1
        `, [ticketId]);
    }
}
