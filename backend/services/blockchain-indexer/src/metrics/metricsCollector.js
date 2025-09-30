const client = require('prom-client');
const logger = require('../utils/logger');

class MetricsCollector {
    constructor() {
        // Create a Registry
        this.register = new client.Registry();
        
        // Add default metrics
        client.collectDefaultMetrics({ register: this.register });
        
        // Sync lag metric (gauge)
        this.syncLag = new client.Gauge({
            name: 'indexer_sync_lag_slots',
            help: 'Number of slots behind current',
            registers: [this.register]
        });
        
        // Transactions processed (counter)
        this.transactionsProcessed = new client.Counter({
            name: 'indexer_transactions_processed_total',
            help: 'Total transactions processed',
            labelNames: ['type', 'status'],
            registers: [this.register]
        });
        
        // Processing duration (histogram)
        this.processingDuration = new client.Histogram({
            name: 'indexer_processing_duration_seconds',
            help: 'Transaction processing duration',
            labelNames: ['type'],
            buckets: [0.1, 0.5, 1, 2, 5, 10],
            registers: [this.register]
        });
        
        // Reconciliation metrics
        this.reconciliationRuns = new client.Counter({
            name: 'indexer_reconciliation_runs_total',
            help: 'Total reconciliation runs',
            labelNames: ['status'],
            registers: [this.register]
        });
        
        this.discrepanciesFound = new client.Counter({
            name: 'indexer_discrepancies_found_total',
            help: 'Total discrepancies found',
            labelNames: ['type'],
            registers: [this.register]
        });
        
        // RPC latency
        this.rpcLatency = new client.Histogram({
            name: 'indexer_rpc_latency_seconds',
            help: 'RPC call latency',
            labelNames: ['method'],
            buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
            registers: [this.register]
        });
        
        // Error counter
        this.errors = new client.Counter({
            name: 'indexer_errors_total',
            help: 'Total errors',
            labelNames: ['type', 'severity'],
            registers: [this.register]
        });
        
        logger.info('Metrics collector initialized');
    }
    
    updateSyncLag(lag) {
        this.syncLag.set(lag);
    }
    
    recordTransaction(type, status, duration) {
        this.transactionsProcessed.inc({ type, status });
        if (duration) {
            this.processingDuration.observe({ type }, duration);
        }
    }
    
    recordReconciliation(status) {
        this.reconciliationRuns.inc({ status });
    }
    
    recordDiscrepancy(type) {
        this.discrepanciesFound.inc({ type });
    }
    
    recordRPCLatency(method, duration) {
        this.rpcLatency.observe({ method }, duration);
    }
    
    recordError(type, severity = 'error') {
        this.errors.inc({ type, severity });
    }
    
    async getMetrics() {
        return this.register.metrics();
    }
    
    getContentType() {
        return this.register.contentType;
    }
}

module.exports = MetricsCollector;
