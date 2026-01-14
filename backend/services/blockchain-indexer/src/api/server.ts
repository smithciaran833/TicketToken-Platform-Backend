import fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';
import db from '../utils/database';
import { register } from '../utils/metrics';

interface Health {
    status: string;
    checks: Record<string, any>;
    timestamp: string;
}

// =============================================================================
// EXPLICIT COLUMN DEFINITIONS
// AUDIT FIX: INP-5/DB-7 - Avoid SELECT *, use explicit columns
// =============================================================================

const COLUMNS = {
    indexer_state: [
        'id',
        'last_processed_slot',
        'last_processed_signature',
        'indexer_version',
        'is_running',
        'started_at',
        'updated_at'
    ].join(', '),

    reconciliation_runs: [
        'id',
        'started_at',
        'completed_at',
        'status',
        'tickets_checked',
        'discrepancies_found',
        'discrepancies_resolved',
        'duration_ms',
        'error_message'
    ].join(', ')
};

export default class IndexerAPI {
    private app: FastifyInstance;
    private indexer: any;
    private reconciliation: any;
    private port: number;

    constructor(indexer: any, reconciliationEngine: any, port: number = 3456) {
        this.app = fastify({ logger: false });
        this.indexer = indexer;
        this.reconciliation = reconciliationEngine;
        this.port = port;

        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware(): void {
        this.app.addHook('onRequest', async (request, reply) => {
            logger.debug({ method: request.method, path: request.url }, 'API request');
        });
    }

    setupRoutes(): void {
        this.app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const health = await this.getHealth();
                const statusCode = health.status === 'healthy' ? 200 : 503;
                return reply.status(statusCode).send(health);
            } catch (error) {
                logger.error({ error }, 'Health check failed');
                return reply.status(503).send({ status: 'unhealthy', error: (error as Error).message });
            }
        });

        this.app.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                reply.header('Content-Type', register.contentType);
                const metrics = await register.metrics();
                return reply.send(metrics);
            } catch (error) {
                logger.error({ error }, 'Failed to get metrics');
                return reply.status(500).send({ error: 'Failed to get metrics' });
            }
        });

        this.app.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const stats = await this.getStats();
                return reply.send(stats);
            } catch (error) {
                logger.error({ error }, 'Failed to get stats');
                return reply.status(500).send({ error: 'Failed to get stats' });
            }
        });

        this.app.get('/recent-activity', async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const activity = await this.getRecentActivity();
                return reply.send(activity);
            } catch (error) {
                logger.error({ error }, 'Failed to get recent activity');
                return reply.status(500).send({ error: 'Failed to get recent activity' });
            }
        });

        this.app.get('/reconciliation/status', async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const status = await this.getReconciliationStatus();
                return reply.send(status);
            } catch (error) {
                logger.error({ error }, 'Failed to get reconciliation status');
                return reply.status(500).send({ error: 'Failed to get reconciliation status' });
            }
        });

        this.app.post('/reconciliation/run', async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                logger.info('Manual reconciliation triggered');
                const result = await this.reconciliation.runReconciliation();
                return reply.send({ success: true, result });
            } catch (error) {
                logger.error({ error }, 'Failed to run reconciliation');
                return reply.status(500).send({ error: 'Failed to run reconciliation' });
            }
        });

        this.app.post('/control/stop', async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                await this.indexer.stop();
                return reply.send({ success: true, message: 'Indexer stopped' });
            } catch (error) {
                logger.error({ error }, 'Failed to stop indexer');
                return reply.status(500).send({ error: 'Failed to stop indexer' });
            }
        });

        this.app.post('/control/start', async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                await this.indexer.start();
                return reply.send({ success: true, message: 'Indexer started' });
            } catch (error) {
                logger.error({ error }, 'Failed to start indexer');
                return reply.status(500).send({ error: 'Failed to start indexer' });
            }
        });
    }

    async getHealth(): Promise<Health> {
        const checks: Record<string, any> = {};
        let healthy = true;

        try {
            await db.query('SELECT 1');
            checks.database = { status: 'healthy' };
        } catch (error) {
            checks.database = { status: 'unhealthy', error: (error as Error).message };
            healthy = false;
        }

        // AUDIT FIX: INP-5 - explicit columns
        const indexerState = await db.query(
            `SELECT ${COLUMNS.indexer_state} FROM indexer_state WHERE id = 1`
        );

        if (indexerState.rows[0]) {
            const state = indexerState.rows[0];
            checks.indexer = {
                status: state.is_running ? 'running' : 'stopped',
                lastProcessedSlot: state.last_processed_slot,
                lag: this.indexer.syncStats.lag
            };

            if (this.indexer.syncStats.lag > 10000) {
                checks.indexer.status = 'lagging';
                healthy = false;
            }
        }

        return {
            status: healthy ? 'healthy' : 'unhealthy',
            checks,
            timestamp: new Date().toISOString()
        };
    }

    async getStats(): Promise<any> {
        // AUDIT FIX: INP-5 - explicit columns
        const state = await db.query(`SELECT ${COLUMNS.indexer_state} FROM indexer_state WHERE id = 1`);
        const txCount = await db.query('SELECT COUNT(*) FROM indexed_transactions');
        const recentTx = await db.query(`
            SELECT instruction_type, COUNT(*) as count
            FROM indexed_transactions
            WHERE processed_at > NOW() - INTERVAL '1 hour'
            GROUP BY instruction_type
        `);

        return {
            indexer: {
                isRunning: state.rows[0]?.is_running || false,
                lastProcessedSlot: state.rows[0]?.last_processed_slot || 0,
                currentSlot: this.indexer.currentSlot,
                lag: this.indexer.syncStats.lag,
                startedAt: state.rows[0]?.started_at
            },
            transactions: {
                total: parseInt(txCount.rows[0].count),
                processed: this.indexer.syncStats.processed,
                failed: this.indexer.syncStats.failed,
                recentByType: recentTx.rows
            },
            uptime: Date.now() - (this.indexer.syncStats.startTime || Date.now())
        };
    }

    async getRecentActivity(): Promise<any[]> {
        const result = await db.query(`
            SELECT
                instruction_type,
                COUNT(*) as count,
                MAX(block_time) as last_seen
            FROM indexed_transactions
            WHERE block_time > NOW() - INTERVAL '1 hour'
            GROUP BY instruction_type
            ORDER BY count DESC
        `);

        return result.rows;
    }

    async getReconciliationStatus(): Promise<any> {
        // AUDIT FIX: INP-5 - explicit columns
        const lastRun = await db.query(`
            SELECT ${COLUMNS.reconciliation_runs} FROM reconciliation_runs
            ORDER BY started_at DESC
            LIMIT 1
        `);

        const discrepancies = await db.query(`
            SELECT
                discrepancy_type,
                COUNT(*) as count
            FROM ownership_discrepancies
            WHERE resolved = false
            GROUP BY discrepancy_type
        `);

        return {
            lastRun: lastRun.rows[0] || null,
            unresolvedDiscrepancies: discrepancies.rows,
            isRunning: this.reconciliation.isRunning
        };
    }

    async start(): Promise<void> {
        await this.app.listen({ port: this.port, host: '0.0.0.0' });
        logger.info(`Indexer API listening on port ${this.port}`);
    }

    async stop(): Promise<void> {
        await this.app.close();
        logger.info('API server stopped');
    }
}
