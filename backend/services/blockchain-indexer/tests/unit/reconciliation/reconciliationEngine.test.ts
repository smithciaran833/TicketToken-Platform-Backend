import ReconciliationEngine from '../../../src/reconciliation/reconciliationEngine';
import { Connection } from '@solana/web3.js';
import logger from '../../../src/utils/logger';
import db from '../../../src/utils/database';
import { ticketServiceClient } from '@tickettoken/shared/clients';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/database');
jest.mock('@tickettoken/shared/clients', () => ({
    ticketServiceClient: {
        getTicketsForReconciliation: jest.fn(),
        updateBlockchainSync: jest.fn(),
    },
}));

describe('ReconciliationEngine', () => {
    let engine: ReconciliationEngine;
    let mockConnection: jest.Mocked<Connection>;
    let mockDbQuery: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        // Mock Connection
        mockConnection = {
            rpcEndpoint: 'https://test-rpc.com',
        } as any;

        // Mock database query
        mockDbQuery = jest.fn();
        (db.query as jest.Mock) = mockDbQuery;

        engine = new ReconciliationEngine(mockConnection);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('constructor', () => {
        it('should initialize with connection and default state', () => {
            expect(engine).toBeDefined();
            expect(engine['connection']).toBe(mockConnection);
            expect(engine['isRunning']).toBe(false);
            expect(engine['reconciliationInterval']).toBeNull();
        });
    });

    describe('start', () => {
        it('should start reconciliation engine with default interval', async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // createRun
            mockDbQuery.mockResolvedValueOnce({}); // completeRun
            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockResolvedValue({
                count: 0,
                tickets: [],
            });

            await engine.start();

            expect(engine['isRunning']).toBe(true);
            expect(logger.info).toHaveBeenCalledWith('Starting reconciliation engine (interval: 300000ms)');
            expect(engine['reconciliationInterval']).toBeDefined();
        });

        it('should start reconciliation engine with custom interval', async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
            mockDbQuery.mockResolvedValueOnce({});
            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockResolvedValue({
                count: 0,
                tickets: [],
            });

            await engine.start(60000);

            expect(logger.info).toHaveBeenCalledWith('Starting reconciliation engine (interval: 60000ms)');
        });

        it('should not start if already running', async () => {
            engine['isRunning'] = true;

            await engine.start();

            expect(logger.warn).toHaveBeenCalledWith('Reconciliation engine already running');
        });

        it('should run reconciliation on interval', async () => {
            mockDbQuery.mockResolvedValue({ rows: [{ id: 1 }] });
            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockResolvedValue({
                count: 0,
                tickets: [],
            });

            await engine.start(1000);

            // Fast-forward time
            jest.advanceTimersByTime(1000);

            // Should have called reconciliation twice (initial + first interval)
            await Promise.resolve(); // Flush promises
            expect(mockDbQuery).toHaveBeenCalledTimes(4); // 2 runs * 2 queries each
        });
    });

    describe('stop', () => {
        it('should stop running reconciliation engine', async () => {
            mockDbQuery.mockResolvedValue({ rows: [{ id: 1 }] });
            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockResolvedValue({
                count: 0,
                tickets: [],
            });

            await engine.start();
            await engine.stop();

            expect(engine['isRunning']).toBe(false);
            expect(engine['reconciliationInterval']).toBeNull();
            expect(logger.info).toHaveBeenCalledWith('Reconciliation engine stopped');
        });

        it('should handle stop when not running', async () => {
            await engine.stop();

            expect(engine['isRunning']).toBe(false);
            expect(logger.info).toHaveBeenCalledWith('Reconciliation engine stopped');
        });
    });

    describe('createRun', () => {
        it('should create a new reconciliation run', async () => {
            const runId = 123;
            mockDbQuery.mockResolvedValue({ rows: [{ id: runId }] });

            const result = await engine.createRun();

            expect(result).toBe(runId);
            expect(mockDbQuery).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO reconciliation_runs'),
            );
        });
    });

    describe('completeRun', () => {
        it('should complete a reconciliation run with results', async () => {
            const runId = 123;
            const results = {
                ticketsChecked: 10,
                discrepanciesFound: 2,
                discrepanciesResolved: 2,
            };
            const duration = 5000;

            await engine.completeRun(runId, results, duration);

            expect(mockDbQuery).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE reconciliation_runs'),
                [runId, 10, 2, 2, 5000]
            );
        });
    });

    describe('failRun', () => {
        it('should mark a reconciliation run as failed', async () => {
            const runId = 123;
            const errorMessage = 'Something went wrong';

            await engine.failRun(runId, errorMessage);

            expect(mockDbQuery).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE reconciliation_runs'),
                [runId, errorMessage]
            );
        });
    });

    describe('getTicketsToReconcile', () => {
        it('should fetch tickets from ticket service', async () => {
            const mockTickets = [
                { id: 'ticket-1', tokenId: 'token-1', isMinted: true, walletAddress: 'wallet-1', status: 'MINTED' },
                { id: 'ticket-2', tokenId: 'token-2', isMinted: true, walletAddress: 'wallet-2', status: 'MINTED' },
            ];

            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockResolvedValue({
                count: 2,
                tickets: mockTickets,
            });

            const result = await engine.getTicketsToReconcile();

            expect(result).toEqual(mockTickets);
            expect(ticketServiceClient.getTicketsForReconciliation).toHaveBeenCalledWith(
                expect.objectContaining({
                    tenantId: 'system',
                    traceId: expect.stringContaining('recon-'),
                }),
                {
                    limit: 100,
                    staleHours: 1,
                }
            );
            expect(logger.debug).toHaveBeenCalledWith(
                { count: 2 },
                'Fetched tickets for reconciliation via service client'
            );
        });

        it('should handle errors from ticket service', async () => {
            const error = new Error('Service unavailable');
            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockRejectedValue(error);

            await expect(engine.getTicketsToReconcile()).rejects.toThrow('Service unavailable');
            expect(logger.error).toHaveBeenCalledWith(
                { error },
                'Failed to fetch tickets for reconciliation from ticket-service'
            );
        });
    });

    describe('checkTicket', () => {
        it('should return null if ticket has no tokenId', async () => {
            const ticket = {
                id: 'ticket-1',
                tokenId: null,
                isMinted: false,
                walletAddress: null,
                status: 'PENDING',
            };

            const result = await engine.checkTicket(ticket);

            expect(result).toBeNull();
        });

        it('should return TOKEN_NOT_FOUND discrepancy if on-chain data missing but marked as minted', async () => {
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: true,
                walletAddress: 'wallet-1',
                status: 'MINTED',
            };

            jest.spyOn(engine, 'getOnChainState').mockResolvedValue(null);

            const result = await engine.checkTicket(ticket);

            expect(result).toEqual({
                type: 'TOKEN_NOT_FOUND',
                field: 'is_minted',
                dbValue: true,
                chainValue: false,
            });
        });

        it('should return null if on-chain data missing and ticket not minted', async () => {
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: false,
                walletAddress: null,
                status: 'PENDING',
            };

            jest.spyOn(engine, 'getOnChainState').mockResolvedValue(null);

            const result = await engine.checkTicket(ticket);

            expect(result).toBeNull();
        });

        it('should return OWNERSHIP_MISMATCH discrepancy if owners differ', async () => {
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: true,
                walletAddress: 'wallet-1',
                status: 'MINTED',
            };

            const onChainData = {
                owner: 'wallet-2',
                burned: false,
            };

            jest.spyOn(engine, 'getOnChainState').mockResolvedValue(onChainData);

            const result = await engine.checkTicket(ticket);

            expect(result).toEqual({
                type: 'OWNERSHIP_MISMATCH',
                field: 'wallet_address',
                dbValue: 'wallet-1',
                chainValue: 'wallet-2',
            });
        });

        it('should return BURN_NOT_RECORDED discrepancy if token burned on-chain but not in DB', async () => {
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: true,
                walletAddress: 'wallet-1',
                status: 'MINTED',
            };

            const onChainData = {
                owner: 'wallet-1',
                burned: true,
            };

            jest.spyOn(engine, 'getOnChainState').mockResolvedValue(onChainData);

            const result = await engine.checkTicket(ticket);

            expect(result).toEqual({
                type: 'BURN_NOT_RECORDED',
                field: 'status',
                dbValue: 'MINTED',
                chainValue: 'BURNED',
            });
        });

        it('should return null if everything matches', async () => {
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: true,
                walletAddress: 'wallet-1',
                status: 'MINTED',
            };

            const onChainData = {
                owner: 'wallet-1',
                burned: false,
            };

            jest.spyOn(engine, 'getOnChainState').mockResolvedValue(onChainData);

            const result = await engine.checkTicket(ticket);

            expect(result).toBeNull();
        });

        it('should handle errors gracefully', async () => {
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: true,
                walletAddress: 'wallet-1',
                status: 'MINTED',
            };

            jest.spyOn(engine, 'getOnChainState').mockRejectedValue(new Error('RPC error'));

            const result = await engine.checkTicket(ticket);

            expect(result).toBeNull();
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('getOnChainState', () => {
        it('should return null (placeholder implementation)', async () => {
            const result = await engine.getOnChainState('token-123');

            expect(result).toBeNull();
            expect(logger.debug).toHaveBeenCalledWith({ tokenId: 'token-123' }, 'Getting on-chain state');
        });
    });

    describe('resolveDiscrepancy', () => {
        it('should resolve wallet_address discrepancy', async () => {
            const runId = 123;
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: true,
                walletAddress: 'wallet-1',
                status: 'MINTED',
            };
            const discrepancy = {
                type: 'OWNERSHIP_MISMATCH',
                field: 'wallet_address',
                dbValue: 'wallet-1',
                chainValue: 'wallet-2',
            };

            mockDbQuery.mockResolvedValue({});
            (ticketServiceClient.updateBlockchainSync as jest.Mock).mockResolvedValue({});

            const result = await engine.resolveDiscrepancy(runId, ticket, discrepancy);

            expect(result).toBe(true);
            expect(mockDbQuery).toHaveBeenCalledTimes(2); // discrepancy + log
            expect(ticketServiceClient.updateBlockchainSync).toHaveBeenCalledWith(
                'ticket-1',
                {
                    syncStatus: 'SYNCED',
                    walletAddress: 'wallet-2',
                },
                expect.objectContaining({
                    tenantId: 'system',
                    traceId: expect.stringContaining('recon-'),
                })
            );
        });

        it('should resolve status discrepancy', async () => {
            const runId = 123;
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: true,
                walletAddress: 'wallet-1',
                status: 'MINTED',
            };
            const discrepancy = {
                type: 'BURN_NOT_RECORDED',
                field: 'status',
                dbValue: 'MINTED',
                chainValue: 'BURNED',
            };

            mockDbQuery.mockResolvedValue({});
            (ticketServiceClient.updateBlockchainSync as jest.Mock).mockResolvedValue({});

            const result = await engine.resolveDiscrepancy(runId, ticket, discrepancy);

            expect(result).toBe(true);
            expect(ticketServiceClient.updateBlockchainSync).toHaveBeenCalledWith(
                'ticket-1',
                {
                    syncStatus: 'SYNCED',
                    status: 'BURNED',
                },
                expect.any(Object)
            );
        });

        it('should resolve is_minted discrepancy', async () => {
            const runId = 123;
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: true,
                walletAddress: 'wallet-1',
                status: 'MINTED',
            };
            const discrepancy = {
                type: 'TOKEN_NOT_FOUND',
                field: 'is_minted',
                dbValue: true,
                chainValue: false,
            };

            mockDbQuery.mockResolvedValue({});
            (ticketServiceClient.updateBlockchainSync as jest.Mock).mockResolvedValue({});

            const result = await engine.resolveDiscrepancy(runId, ticket, discrepancy);

            expect(result).toBe(true);
            expect(ticketServiceClient.updateBlockchainSync).toHaveBeenCalledWith(
                'ticket-1',
                {
                    syncStatus: 'SYNCED',
                    isMinted: false,
                },
                expect.any(Object)
            );
        });

        it('should return false on error', async () => {
            const runId = 123;
            const ticket = {
                id: 'ticket-1',
                tokenId: 'token-1',
                isMinted: true,
                walletAddress: 'wallet-1',
                status: 'MINTED',
            };
            const discrepancy = {
                type: 'OWNERSHIP_MISMATCH',
                field: 'wallet_address',
                dbValue: 'wallet-1',
                chainValue: 'wallet-2',
            };

            mockDbQuery.mockRejectedValue(new Error('DB error'));

            const result = await engine.resolveDiscrepancy(runId, ticket, discrepancy);

            expect(result).toBe(false);
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('markTicketReconciled', () => {
        it('should mark ticket as reconciled via service client', async () => {
            (ticketServiceClient.updateBlockchainSync as jest.Mock).mockResolvedValue({});

            await engine.markTicketReconciled('ticket-1');

            expect(ticketServiceClient.updateBlockchainSync).toHaveBeenCalledWith(
                'ticket-1',
                {
                    reconciledAt: expect.any(String),
                },
                expect.objectContaining({
                    tenantId: 'system',
                    traceId: expect.stringContaining('recon-'),
                })
            );
        });

        it('should not throw on error', async () => {
            (ticketServiceClient.updateBlockchainSync as jest.Mock).mockRejectedValue(
                new Error('Service error')
            );

            await expect(engine.markTicketReconciled('ticket-1')).resolves.not.toThrow();
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('runReconciliation', () => {
        it('should run complete reconciliation with no discrepancies', async () => {
            const runId = 123;
            const tickets = [
                { id: 'ticket-1', tokenId: 'token-1', isMinted: true, walletAddress: 'wallet-1', status: 'MINTED' },
                { id: 'ticket-2', tokenId: 'token-2', isMinted: true, walletAddress: 'wallet-2', status: 'MINTED' },
            ];

            mockDbQuery.mockResolvedValueOnce({ rows: [{ id: runId }] }); // createRun
            mockDbQuery.mockResolvedValue({}); // other queries

            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockResolvedValue({
                count: 2,
                tickets,
            });

            jest.spyOn(engine, 'checkTicket').mockResolvedValue(null);
            (ticketServiceClient.updateBlockchainSync as jest.Mock).mockResolvedValue({});

            const result = await engine.runReconciliation();

            expect(result).toEqual({
                ticketsChecked: 2,
                discrepanciesFound: 0,
                discrepanciesResolved: 0,
            });
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    runId,
                    ticketsChecked: 2,
                    discrepanciesFound: 0,
                    discrepanciesResolved: 0,
                }),
                'Reconciliation run completed'
            );
        });

        it('should run complete reconciliation with discrepancies', async () => {
            const runId = 123;
            const tickets = [
                { id: 'ticket-1', tokenId: 'token-1', isMinted: true, walletAddress: 'wallet-1', status: 'MINTED' },
                { id: 'ticket-2', tokenId: 'token-2', isMinted: true, walletAddress: 'wallet-2', status: 'MINTED' },
            ];

            const discrepancy = {
                type: 'OWNERSHIP_MISMATCH',
                field: 'wallet_address',
                dbValue: 'wallet-1',
                chainValue: 'wallet-3',
            };

            mockDbQuery.mockResolvedValueOnce({ rows: [{ id: runId }] }); // createRun
            mockDbQuery.mockResolvedValue({}); // other queries

            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockResolvedValue({
                count: 2,
                tickets,
            });

            jest.spyOn(engine, 'checkTicket')
                .mockResolvedValueOnce(discrepancy)
                .mockResolvedValueOnce(null);
            jest.spyOn(engine, 'resolveDiscrepancy').mockResolvedValue(true);
            (ticketServiceClient.updateBlockchainSync as jest.Mock).mockResolvedValue({});

            const result = await engine.runReconciliation();

            expect(result).toEqual({
                ticketsChecked: 2,
                discrepanciesFound: 1,
                discrepanciesResolved: 1,
            });
        });

        it('should handle discrepancies that cannot be resolved', async () => {
            const runId = 123;
            const tickets = [
                { id: 'ticket-1', tokenId: 'token-1', isMinted: true, walletAddress: 'wallet-1', status: 'MINTED' },
            ];

            const discrepancy = {
                type: 'OWNERSHIP_MISMATCH',
                field: 'wallet_address',
                dbValue: 'wallet-1',
                chainValue: 'wallet-3',
            };

            mockDbQuery.mockResolvedValueOnce({ rows: [{ id: runId }] });
            mockDbQuery.mockResolvedValue({});

            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockResolvedValue({
                count: 1,
                tickets,
            });

            jest.spyOn(engine, 'checkTicket').mockResolvedValue(discrepancy);
            jest.spyOn(engine, 'resolveDiscrepancy').mockResolvedValue(false);
            (ticketServiceClient.updateBlockchainSync as jest.Mock).mockResolvedValue({});

            const result = await engine.runReconciliation();

            expect(result).toEqual({
                ticketsChecked: 1,
                discrepanciesFound: 1,
                discrepanciesResolved: 0,
            });
        });

        it('should handle errors and fail the run', async () => {
            const runId = 123;
            const error = new Error('Reconciliation error');

            mockDbQuery.mockResolvedValueOnce({ rows: [{ id: runId }] });
            mockDbQuery.mockResolvedValue({});

            (ticketServiceClient.getTicketsForReconciliation as jest.Mock).mockRejectedValue(error);

            await expect(engine.runReconciliation()).rejects.toThrow('Reconciliation error');

            expect(logger.error).toHaveBeenCalledWith(
                { error, runId },
                'Reconciliation run failed'
            );
            expect(mockDbQuery).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE reconciliation_runs'),
                [runId, 'Reconciliation error']
            );
        });
    });
});
