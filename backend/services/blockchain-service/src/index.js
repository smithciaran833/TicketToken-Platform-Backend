"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const logger_1 = require("./utils/logger");
const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-service';
const PORT = parseInt(process.env.PORT || '3011', 10);
const HOST = process.env.HOST || '0.0.0.0';
async function startService() {
    try {
        logger_1.logger.info(`Starting ${SERVICE_NAME}...`);
        const app = await (0, app_1.createApp)();
        await app.listen({ port: PORT, host: HOST });
        logger_1.logger.info(`${SERVICE_NAME} running on port ${PORT}`, {
            port: PORT,
            host: HOST,
            healthUrl: `http://${HOST}:${PORT}/health`,
            infoUrl: `http://${HOST}:${PORT}/info`
        });
        const shutdown = async (signal) => {
            logger_1.logger.info(`${signal} received, shutting down ${SERVICE_NAME}...`);
            try {
                await app.close();
                logger_1.logger.info('HTTP server closed');
                await (0, app_1.shutdownApp)();
                logger_1.logger.info(`${SERVICE_NAME} shutdown complete`);
                process.exit(0);
            }
            catch (error) {
                logger_1.logger.error('Error during shutdown', { error: error.message, stack: error.stack });
                process.exit(1);
            }
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    catch (error) {
        logger_1.logger.error(`Failed to start ${SERVICE_NAME}`, {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}
startService().catch((error) => {
    logger_1.logger.error('Unhandled error during service startup', {
        error: error.message,
        stack: error.stack
    });
    process.exit(1);
});
//# sourceMappingURL=index.js.map