"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsDb = exports.db = void 0;
exports.connectDatabases = connectDatabases;
exports.getDb = getDb;
exports.getAnalyticsDb = getAnalyticsDb;
exports.closeDatabases = closeDatabases;
const knex_1 = __importDefault(require("knex"));
const util_1 = require("util");
const dns_1 = require("dns");
const index_1 = require("./index");
const logger_1 = require("../utils/logger");
const resolveDns = (0, util_1.promisify)(dns_1.resolve4);
async function connectDatabases() {
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 2000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            logger_1.logger.info(`Database connection attempt ${attempt}/${MAX_RETRIES}...`);
            const mainDbIps = await resolveDns(index_1.config.database.host);
            const mainDbIp = mainDbIps[0];
            logger_1.logger.info(`Resolved ${index_1.config.database.host} to ${mainDbIp}`);
            const analyticsDbIps = await resolveDns(index_1.config.analyticsDatabase.host);
            const analyticsDbIp = analyticsDbIps[0];
            logger_1.logger.info(`Resolved ${index_1.config.analyticsDatabase.host} to ${analyticsDbIp}`);
            exports.db = (0, knex_1.default)({
                client: 'postgresql',
                connection: {
                    host: mainDbIp,
                    port: index_1.config.database.port,
                    database: index_1.config.database.database,
                    user: index_1.config.database.user,
                    password: index_1.config.database.password,
                },
                pool: {
                    min: index_1.config.database.pool.min,
                    max: index_1.config.database.pool.max,
                    createTimeoutMillis: 3000,
                    acquireTimeoutMillis: 30000,
                    idleTimeoutMillis: 30000,
                    reapIntervalMillis: 1000,
                    createRetryIntervalMillis: 100,
                },
                acquireConnectionTimeout: 30000,
            });
            exports.analyticsDb = (0, knex_1.default)({
                client: 'postgresql',
                connection: {
                    host: analyticsDbIp,
                    port: index_1.config.analyticsDatabase.port,
                    database: index_1.config.analyticsDatabase.database,
                    user: index_1.config.analyticsDatabase.user,
                    password: index_1.config.analyticsDatabase.password,
                },
                pool: {
                    min: 2,
                    max: 10,
                },
            });
            exports.db.on('query', (query) => {
                if (global.currentTenant) {
                    query.on('query', async () => {
                        const tenantId = global.currentTenant;
                        if (!isValidTenantId(tenantId)) {
                            logger_1.logger.error(`Invalid tenant ID format: ${tenantId}`);
                            throw new Error('Invalid tenant ID');
                        }
                        const escapedTenantId = escapeTenantId(tenantId);
                        await exports.db.raw(`SET app.current_tenant = ?`, [escapedTenantId]);
                    });
                }
            });
            await exports.db.raw('SELECT 1');
            await exports.analyticsDb.raw('SELECT 1');
            logger_1.logger.info('Database connections established successfully');
            return;
        }
        catch (error) {
            logger_1.logger.error(`Connection attempt ${attempt} failed:`, error);
            if (attempt === MAX_RETRIES) {
                logger_1.logger.error('Failed to connect to databases after all retries');
                throw error;
            }
            const delayMs = RETRY_DELAY * attempt;
            logger_1.logger.info(`Waiting ${delayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}
function isValidTenantId(tenantId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const alphanumericRegex = /^[a-zA-Z0-9_-]+$/;
    return uuidRegex.test(tenantId) || alphanumericRegex.test(tenantId);
}
function escapeTenantId(tenantId) {
    return tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
}
function getDb() {
    if (!exports.db) {
        throw new Error('Database not initialized');
    }
    return exports.db;
}
function getAnalyticsDb() {
    if (!exports.analyticsDb) {
        throw new Error('Analytics database not initialized');
    }
    return exports.analyticsDb;
}
async function closeDatabases() {
    if (exports.db) {
        await exports.db.destroy();
    }
    if (exports.analyticsDb) {
        await exports.analyticsDb.destroy();
    }
    logger_1.logger.info('Database connections closed');
}
//# sourceMappingURL=database.js.map