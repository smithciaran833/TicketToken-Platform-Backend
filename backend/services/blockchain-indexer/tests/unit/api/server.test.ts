import IndexerAPI from '../../../src/api/server';
import logger from '../../../src/utils/logger';
import db from '../../../src/utils/database';
import { register } from '../../../src/utils/metrics';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/database');
jest.mock('../../../src/utils/metrics', () => ({
    register: {
        contentType: 'text/plain',
        metrics: jest.fn(),
    },
}));

describe('IndexerAPI', () => {
    let api: IndexerAPI;
    let mockIndexer: any;
    let mockReconciliation: any;
    let mockDbQuery: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock database
        mockDbQuery = jest.fn();
        (db.query as jest.Mock) = mockDbQuery;

        // Mock indexer
        mockIndexer = {
            start: jest.fn().mockResolvedValue(undefined),
            stop: jest.fn().mockResolvedValue(undefined),
            currentSlot: 12345,
            syncStats: {
                lag: 100,
                processed: 1000,
                failed: 5,
                startTime: Date.now() - 3600000, // 1 hour ago
            },
        };

        // Mock reconciliation
        mockReconciliation = {
            runReconciliation: jest.fn().mockResolvedValue({
                ticketsChecked: 10,
                discrepanciesFound: 2,
                discrepanciesResolved: 2,
            }),
            isRunning: false,
        };

        api = new IndexerAPI(mockIndexer, mockReconciliation, 3456);
    });

    afterEach(async () => {
        await api.stop();
    });

    describe('constructor', () => {
        it('should initialize with correct dependencies', () => {
            expect(api).toBeDefined();
            expect(api['indexer']).toBe(mockIndexer);
            expect(api['reconciliation']).toBe(mockReconciliation);
            expect(api['port']).toBe(3456);
        });

        it('should use default port if not provided', () => {
            const defaultApi = new IndexerAPI(mockIndexer, mockReconciliation);
            expect(defaultApi['port']).toBe(3456);
        });
    });

    describe('GET /health', () => {
        it('should return healthy status when all checks pass', async () => {
            mockDbQuery
                .mockResolvedValueOnce({ rows: [{}] }) // DB health check
                .mockResolvedValueOnce({
                    rows: [{
                        id: 1,
                        last_processed_slot: 12300,
                        last_processed_signature: 'sig123',
                        indexer_version: '1.0.0',
                        is_running: true,
                        started_at: new Date(),
                        updated_at: new Date(),
                    }],
                });

            const response = await api['app'].inject({
                method: 'GET',
                url: '/health',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.status).toBe('healthy');
            expect(body.checks.database.status).toBe('healthy');
            expect(body.checks.indexer.status).toBe('running');
        });

        it('should return unhealthy status when database fails', async () => {
            mockDbQuery.mockRejectedValueOnce(new Error('Connection failed'));

            const response = await api['app'].inject({
                method: 'GET',
                url: '/health',
            });

            expect(response.statusCode).toBe(503);
            const body = JSON.parse(response.body);
            expect(body.status).toBe('unhealthy');
            expect(body.checks.database.status).toBe('unhealthy');
        });

        it('should return unhealthy status when lag is too high', async () => {
            mockIndexer.syncStats.lag = 15000; // High lag

            mockDbQuery
                .mockResolvedValueOnce({ rows: [{}] })
                .mockResolvedValueOnce({
                    rows: [{
                        id: 1,
                        last_processed_slot: 12300,
                        is_running: true,
                    }],
                });

            const response = await api['app'].inject({
                method: 'GET',
                url: '/health',
            });

            expect(response.statusCode).toBe(503);
            const body = JSON.parse(response.body);
            expect(body.status).toBe('unhealthy');
            expect(body.checks.indexer.status).toBe('lagging');
        });

        it('should handle errors gracefully', async () => {
            mockDbQuery.mockRejectedValue(new Error('Database error'));

            const response = await api['app'].inject({
                method: 'GET',
                url: '/health',
            });

            expect(response.statusCode).toBe(503);
            const body = JSON.parse(response.body);
            expect(body.status).toBe('unhealthy');
        });
    });

    describe('GET /metrics', () => {
        it('should return prometheus metrics', async () => {
            const mockMetrics = '# HELP nodejs_version_info Node.js version info\n';
            (register.metrics as jest.Mock).mockResolvedValue(mockMetrics);

            const response = await api['app'].inject({
                method: 'GET',
                url: '/metrics',
            });

            expect(response.statusCode).toBe(200);
            expect(response.headers['content-type']).toContain('text/plain');
            expect(response.body).toBe(mockMetrics);
        });

        it('should handle metrics errors', async () => {
            (register.metrics as jest.Mock).mockRejectedValue(new Error('Metrics error'));

            const response = await api['app'].inject({
                method: 'GET',
                url: '/metrics',
            });

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Failed to get metrics');
        });
    });

    describe('GET /stats', () => {
        it('should return indexer statistics', async () => {
            mockDbQuery
                .mockResolvedValueOnce({
                    rows: [{
                        is_running: true,
                        last_processed_slot: 12300,
                        started_at: new Date(),
                    }],
                })
                .mockResolvedValueOnce({ rows: [{ count: '5000' }] })
                .mockResolvedValueOnce({
                    rows: [
                        { instruction_type: 'mint', count: '10' },
                        { instruction_type: 'transfer', count: '5' },
                    ],
                });

            const response = await api['app'].inject({
                method: 'GET',
                url: '/stats',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.indexer.isRunning).toBe(true);
            expect(body.indexer.lastProcessedSlot).toBe(12300);
            expect(body.indexer.currentSlot).toBe(12345);
            expect(body.transactions.total).toBe(5000);
            expect(body.transactions.recentByType).toHaveLength(2);
        });

        it('should handle missing indexer state', async () => {
            mockDbQuery
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [{ count: '0' }] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await api['app'].inject({
                method: 'GET',
                url: '/stats',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.indexer.isRunning).toBe(false);
            expect(body.indexer.lastProcessedSlot).toBe(0);
        });

        it('should handle errors', async () => {
            mockDbQuery.mockRejectedValue(new Error('Database error'));

            const response = await api['app'].inject({
                method: 'GET',
                url: '/stats',
            });

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Failed to get stats');
        });
    });

    describe('GET /recent-activity', () => {
        it('should return recent activity', async () => {
            mockDbQuery.mockResolvedValue({
                rows: [
                    { instruction_type: 'mint', count: '15', last_seen: new Date() },
                    { instruction_type: 'transfer', count: '8', last_seen: new Date() },
                ],
            });

            const response = await api['app'].inject({
                method: 'GET',
                url: '/recent-activity',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body).toHaveLength(2);
            expect(body[0].instruction_type).toBe('mint');
        });

        it('should return empty array when no activity', async () => {
            mockDbQuery.mockResolvedValue({ rows: [] });

            const response = await api['app'].inject({
                method: 'GET',
                url: '/recent-activity',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body).toEqual([]);
        });

        it('should handle errors', async () => {
            mockDbQuery.mockRejectedValue(new Error('Database error'));

            const response = await api['app'].inject({
                method: 'GET',
                url: '/recent-activity',
            });

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Failed to get recent activity');
        });
    });

    describe('GET /reconciliation/status', () => {
        it('should return reconciliation status', async () => {
            mockDbQuery
                .mockResolvedValueOnce({
                    rows: [{
                        id: 1,
                        started_at: new Date(),
                        completed_at: new Date(),
                        status: 'COMPLETED',
                        tickets_checked: 100,
                        discrepancies_found: 5,
                        discrepancies_resolved: 5,
                    }],
                })
                .mockResolvedValueOnce({
                    rows: [
                        { discrepancy_type: 'OWNERSHIP_MISMATCH', count: '2' },
                    ],
                });

            const response = await api['app'].inject({
                method: 'GET',
                url: '/reconciliation/status',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.lastRun.status).toBe('COMPLETED');
            expect(body.unresolvedDiscrepancies).toHaveLength(1);
            expect(body.isRunning).toBe(false);
        });

        it('should handle no previous runs', async () => {
            mockDbQuery
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] });

            const response = await api['app'].inject({
                method: 'GET',
                url: '/reconciliation/status',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.lastRun).toBeNull();
            expect(body.unresolvedDiscrepancies).toEqual([]);
        });

        it('should handle errors', async () => {
            mockDbQuery.mockRejectedValue(new Error('Database error'));

            const response = await api['app'].inject({
                method: 'GET',
                url: '/reconciliation/status',
            });

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Failed to get reconciliation status');
        });
    });

    describe('POST /reconciliation/run', () => {
        it('should trigger manual reconciliation', async () => {
            const response = await api['app'].inject({
                method: 'POST',
                url: '/reconciliation/run',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.success).toBe(true);
            expect(body.result.ticketsChecked).toBe(10);
            expect(mockReconciliation.runReconciliation).toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalledWith('Manual reconciliation triggered');
        });

        it('should handle reconciliation errors', async () => {
            mockReconciliation.runReconciliation.mockRejectedValue(
                new Error('Reconciliation failed')
            );

            const response = await api['app'].inject({
                method: 'POST',
                url: '/reconciliation/run',
            });

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Failed to run reconciliation');
        });
    });

    describe('POST /control/stop', () => {
        it('should stop the indexer', async () => {
            const response = await api['app'].inject({
                method: 'POST',
                url: '/control/stop',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.success).toBe(true);
            expect(body.message).toBe('Indexer stopped');
            expect(mockIndexer.stop).toHaveBeenCalled();
        });

        it('should handle stop errors', async () => {
            mockIndexer.stop.mockRejectedValue(new Error('Stop failed'));

            const response = await api['app'].inject({
                method: 'POST',
                url: '/control/stop',
            });

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Failed to stop indexer');
        });
    });

    describe('POST /control/start', () => {
        it('should start the indexer', async () => {
            const response = await api['app'].inject({
                method: 'POST',
                url: '/control/start',
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.body);
            expect(body.success).toBe(true);
            expect(body.message).toBe('Indexer started');
            expect(mockIndexer.start).toHaveBeenCalled();
        });

        it('should handle start errors', async () => {
            mockIndexer.start.mockRejectedValue(new Error('Start failed'));

            const response = await api['app'].inject({
                method: 'POST',
                url: '/control/start',
            });

            expect(response.statusCode).toBe(500);
            const body = JSON.parse(response.body);
            expect(body.error).toBe('Failed to start indexer');
        });
    });

    describe('start and stop', () => {
        it('should start the API server', async () => {
            const port = 3457;
            const testApi = new IndexerAPI(mockIndexer, mockReconciliation, port);

            await testApi.start();

            expect(logger.info).toHaveBeenCalledWith(`Indexer API listening on port ${port}`);

            await testApi.stop();
        });

        it('should stop the API server', async () => {
            await api.start();
            await api.stop();

            expect(logger.info).toHaveBeenCalledWith('API server stopped');
        });
    });

    describe('middleware', () => {
        it('should log all requests', async () => {
            await api['app'].inject({
                method: 'GET',
                url: '/health',
            });

            expect(logger.debug).toHaveBeenCalledWith(
                { method: 'GET', path: '/health' },
                'API request'
            );
        });
    });
});
