const express = require('express');
const logger = require('../utils/logger');
const db = require('../utils/database');
const MetricsCollector = require('../metrics/metricsCollector');

class IndexerAPI {
    constructor(indexer, reconciliationEngine, port = 3456) {
        this.app = express();
        this.indexer = indexer;
        this.reconciliation = reconciliationEngine;
        this.port = port;
        this.metrics = new MetricsCollector();
        
        this.setupMiddleware();
        this.setupRoutes();
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        
        // Request logging
        this.app.use((req, res, next) => {
            logger.debug({ method: req.method, path: req.path }, 'API request');
            next();
        });
    }
    
    setupRoutes() {
        // Health check
        this.app.get('/health', async (req, res) => {
            try {
                const health = await this.getHealth();
                const statusCode = health.status === 'healthy' ? 200 : 503;
                res.status(statusCode).json(health);
            } catch (error) {
                logger.error({ error }, 'Health check failed');
                res.status(503).json({ status: 'unhealthy', error: error.message });
            }
        });
        
        // Metrics endpoint (Prometheus format)
        this.app.get('/metrics', async (req, res) => {
            try {
                res.set('Content-Type', this.metrics.getContentType());
                const metrics = await this.metrics.getMetrics();
                res.send(metrics);
            } catch (error) {
                logger.error({ error }, 'Failed to get metrics');
                res.status(500).json({ error: 'Failed to get metrics' });
            }
        });
        
        // Indexer stats
        this.app.get('/stats', async (req, res) => {
            try {
                const stats = await this.getStats();
                res.json(stats);
            } catch (error) {
                logger.error({ error }, 'Failed to get stats');
                res.status(500).json({ error: 'Failed to get stats' });
            }
        });
        
        // Recent activity
        this.app.get('/recent-activity', async (req, res) => {
            try {
                const activity = await this.getRecentActivity();
                res.json(activity);
            } catch (error) {
                logger.error({ error }, 'Failed to get recent activity');
                res.status(500).json({ error: 'Failed to get recent activity' });
            }
        });
        
        // Reconciliation status
        this.app.get('/reconciliation/status', async (req, res) => {
            try {
                const status = await this.getReconciliationStatus();
                res.json(status);
            } catch (error) {
                logger.error({ error }, 'Failed to get reconciliation status');
                res.status(500).json({ error: 'Failed to get reconciliation status' });
            }
        });
        
        // Trigger manual reconciliation
        this.app.post('/reconciliation/run', async (req, res) => {
            try {
                logger.info('Manual reconciliation triggered');
                const result = await this.reconciliation.runReconciliation();
                res.json({ success: true, result });
            } catch (error) {
                logger.error({ error }, 'Failed to run reconciliation');
                res.status(500).json({ error: 'Failed to run reconciliation' });
            }
        });
        
        // Indexer control
        this.app.post('/control/stop', async (req, res) => {
            try {
                await this.indexer.stop();
                res.json({ success: true, message: 'Indexer stopped' });
            } catch (error) {
                logger.error({ error }, 'Failed to stop indexer');
                res.status(500).json({ error: 'Failed to stop indexer' });
            }
        });
        
        this.app.post('/control/start', async (req, res) => {
            try {
                await this.indexer.start();
                res.json({ success: true, message: 'Indexer started' });
            } catch (error) {
                logger.error({ error }, 'Failed to start indexer');
                res.status(500).json({ error: 'Failed to start indexer' });
            }
        });
    }
    
    async getHealth() {
        const checks = {};
        let healthy = true;
        
        // Check database connection
        try {
            await db.query('SELECT 1');
            checks.database = { status: 'healthy' };
        } catch (error) {
            checks.database = { status: 'unhealthy', error: error.message };
            healthy = false;
        }
        
        // Check indexer status
        const indexerState = await db.query(
            'SELECT * FROM indexer_state WHERE id = 1'
        );
        
        if (indexerState.rows[0]) {
            const state = indexerState.rows[0];
            checks.indexer = {
                status: state.is_running ? 'running' : 'stopped',
                lastProcessedSlot: state.last_processed_slot,
                lag: this.indexer.syncStats.lag
            };
            
            // Unhealthy if lag is too high
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
    
    async getStats() {
        const state = await db.query('SELECT * FROM indexer_state WHERE id = 1');
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
    
    async getRecentActivity() {
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
    
    async getReconciliationStatus() {
        const lastRun = await db.query(`
            SELECT * FROM reconciliation_runs
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
    
    start() {
        this.server = this.app.listen(this.port, () => {
            logger.info(`Indexer API listening on port ${this.port}`);
        });
    }
    
    stop() {
        if (this.server) {
            this.server.close();
            logger.info('API server stopped');
        }
    }
}

module.exports = IndexerAPI;
