"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const server_1 = require("./server");
const logger_1 = require("./utils/logger");
const database_1 = require("./config/database");
const redis_1 = require("./config/redis");
const rabbitmq_1 = require("./config/rabbitmq");
const websocket_1 = require("./config/websocket");
const processors_1 = require("./processors");
const scheduler_1 = require("./utils/scheduler");
const rfm_calculator_worker_1 = require("./workers/rfm-calculator.worker");
let connectMongoDB;
if (process.env.MONGODB_ENABLED !== 'false') {
    connectMongoDB = require('./config/mongodb').connectMongoDB;
}
async function startService() {
    try {
        logger_1.logger.info('Starting Analytics Service...');
        await (0, database_1.connectDatabases)();
        await (0, redis_1.connectRedis)();
        await (0, rabbitmq_1.connectRabbitMQ)();
        if (process.env.MONGODB_ENABLED !== 'false' && connectMongoDB) {
            await connectMongoDB();
        }
        else {
            logger_1.logger.info('MongoDB disabled, skipping connection');
        }
        const app = await (0, server_1.createServer)();
        const PORT = Number(process.env.PORT) || 3010;
        const HOST = process.env.HOST || '0.0.0.0';
        await app.listen({ port: PORT, host: HOST });
        logger_1.logger.info(`Analytics Service running on ${HOST}:${PORT}`);
        await (0, websocket_1.startWebSocketServer)(app.server);
        await (0, processors_1.startEventProcessors)();
        await (0, scheduler_1.startScheduledJobs)();
        logger_1.logger.info('Starting RFM Calculator Worker...');
        await rfm_calculator_worker_1.rfmCalculatorWorker.start();
        logger_1.logger.info('RFM Calculator Worker started successfully');
        const shutdown = async (signal) => {
            logger_1.logger.info(`${signal} received, shutting down gracefully...`);
            try {
                await app.close();
                logger_1.logger.info('Server closed');
                process.exit(0);
            }
            catch (err) {
                logger_1.logger.error('Error during shutdown:', err);
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    catch (error) {
        logger_1.logger.error('Failed to start Analytics Service:', error);
        process.exit(1);
    }
}
startService();
//# sourceMappingURL=index.js.map