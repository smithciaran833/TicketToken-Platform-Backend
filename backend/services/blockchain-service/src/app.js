"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
exports.shutdownApp = shutdownApp;
exports.getInfrastructure = getInfrastructure;
const fastify_1 = __importDefault(require("fastify"));
const helmet_1 = __importDefault(require("@fastify/helmet"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const cors_1 = __importDefault(require("@fastify/cors"));
const uuid_1 = require("uuid");
const web3_js_1 = require("@solana/web3.js");
const pg_1 = require("pg");
const health_routes_1 = __importDefault(require("./routes/health.routes"));
const metrics_routes_1 = __importDefault(require("./routes/metrics.routes"));
const internal_mint_routes_1 = __importDefault(require("./routes/internal-mint.routes"));
const blockchain_routes_1 = __importDefault(require("./routes/blockchain.routes"));
const config_1 = __importDefault(require("./config"));
const treasury_1 = __importDefault(require("./wallets/treasury"));
const listeners_1 = __importDefault(require("./listeners"));
const queues_1 = __importDefault(require("./queues"));
const logger_1 = require("./utils/logger");
const BlockchainQueryService_1 = __importDefault(require("./services/BlockchainQueryService"));
const TransactionConfirmationService_1 = __importDefault(require("./services/TransactionConfirmationService"));
const RPCFailoverService_1 = __importDefault(require("./services/RPCFailoverService"));
const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-service';
let treasuryWallet = null;
let db = null;
let solanaConnection = null;
let rpcFailover = null;
let blockchainQuery = null;
let transactionConfirmation = null;
async function createApp() {
    const app = (0, fastify_1.default)({
        logger: false,
        trustProxy: true,
        requestIdHeader: 'x-request-id',
        genReqId: () => (0, uuid_1.v4)()
    });
    await app.register(helmet_1.default);
    await app.register(cors_1.default);
    await app.register(rate_limit_1.default, {
        max: 100,
        timeWindow: '1 minute'
    });
    logger_1.logger.info('Initializing blockchain service infrastructure...');
    try {
        solanaConnection = new web3_js_1.Connection(config_1.default.solana.rpcUrl, {
            commitment: config_1.default.solana.commitment,
            wsEndpoint: config_1.default.solana.wsUrl
        });
        logger_1.logger.info('Solana connection initialized', { rpcUrl: config_1.default.solana.rpcUrl });
        db = new pg_1.Pool(config_1.default.database);
        await db.query('SELECT 1');
        logger_1.logger.info('Database connection pool initialized');
        treasuryWallet = new treasury_1.default(solanaConnection, db);
        await treasuryWallet.initialize();
        logger_1.logger.info('Treasury wallet initialized');
        const balance = await treasuryWallet.getBalance();
        logger_1.logger.info('Treasury wallet balance', { balance, unit: 'SOL' });
        if (balance < 0.1) {
            logger_1.logger.warn('Treasury wallet has low balance - needs funding!', {
                balance,
                minimumRecommended: 0.1
            });
        }
        if (config_1.default.solana.programId) {
            await listeners_1.default.initialize();
            logger_1.logger.info('Event listener system initialized');
        }
        else {
            logger_1.logger.warn('Program ID not configured - event listeners will not start');
        }
        await queues_1.default.initialize();
        logger_1.logger.info('Queue system initialized');
        const rpcEndpoints = (process.env.SOLANA_RPC_ENDPOINTS || config_1.default.solana.rpcUrl)
            .split(',')
            .map(url => url.trim());
        if (rpcEndpoints.length > 1) {
            rpcFailover = new RPCFailoverService_1.default({
                endpoints: rpcEndpoints,
                commitment: config_1.default.solana.commitment
            });
            solanaConnection = rpcFailover.getConnection();
            logger_1.logger.info('RPC Failover initialized', { endpoints: rpcEndpoints.length });
        }
        blockchainQuery = new BlockchainQueryService_1.default(solanaConnection);
        transactionConfirmation = new TransactionConfirmationService_1.default(solanaConnection);
        logger_1.logger.info('Blockchain services initialized');
        app.decorate('blockchainQuery', blockchainQuery);
        app.decorate('transactionConfirmation', transactionConfirmation);
        app.decorate('rpcFailover', rpcFailover);
    }
    catch (error) {
        logger_1.logger.error('Failed to initialize infrastructure', { error: error.message, stack: error.stack });
        throw error;
    }
    await app.register(health_routes_1.default);
    await app.register(metrics_routes_1.default);
    await app.register(internal_mint_routes_1.default);
    await app.register(blockchain_routes_1.default);
    app.get('/ready', async (request, reply) => {
        try {
            const checks = {
                treasury: treasuryWallet !== null,
                database: db !== null,
                solana: solanaConnection !== null,
                listeners: listeners_1.default ? true : false,
                queues: queues_1.default ? true : false
            };
            const allReady = Object.values(checks).every(status => status === true);
            if (allReady) {
                return {
                    ready: true,
                    systems: checks
                };
            }
            else {
                return reply.status(503).send({
                    ready: false,
                    systems: checks
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Readiness check failed', { error: error.message });
            return reply.status(503).send({ ready: false, error: error.message });
        }
    });
    app.get('/info', async (request, reply) => {
        return {
            service: SERVICE_NAME,
            version: '1.0.0',
            port: process.env.PORT || 3011,
            status: 'healthy'
        };
    });
    app.get('/api/v1/status', async (request, reply) => {
        return {
            status: 'running',
            service: SERVICE_NAME,
            port: process.env.PORT || 3011
        };
    });
    app.get('/api/v1/test-communication', async (request, reply) => {
        return {
            success: true,
            service: SERVICE_NAME,
            message: 'Service communication not yet implemented'
        };
    });
    app.setErrorHandler((error, request, reply) => {
        logger_1.logger.error('Unhandled error', {
            error: error.message,
            stack: error.stack,
            path: request.url,
            method: request.method
        });
        reply.status(500).send({
            error: 'Internal Server Error',
            message: error.message
        });
    });
    return app;
}
async function shutdownApp() {
    logger_1.logger.info('Shutting down blockchain service infrastructure...');
    try {
        if (queues_1.default) {
            await queues_1.default.shutdown();
            logger_1.logger.info('Queue system shut down');
        }
        if (listeners_1.default) {
            await listeners_1.default.shutdown();
            logger_1.logger.info('Event listener system shut down');
        }
        if (db) {
            await db.end();
            logger_1.logger.info('Database connection pool closed');
        }
        logger_1.logger.info('Blockchain service infrastructure shutdown complete');
    }
    catch (error) {
        logger_1.logger.error('Error during shutdown', { error: error.message, stack: error.stack });
        throw error;
    }
}
function getInfrastructure() {
    return {
        treasuryWallet,
        db,
        solanaConnection,
        listenerManager: listeners_1.default,
        queueManager: queues_1.default
    };
}
//# sourceMappingURL=app.js.map