"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthController = void 0;
const base_controller_1 = require("./base.controller");
const database_1 = require("../config/database");
const redis_1 = require("../config/redis");
const rabbitmq_1 = require("../config/rabbitmq");
const mongodb_1 = require("../config/mongodb");
const logger_1 = require("../utils/logger");
class HealthController extends base_controller_1.BaseController {
    health = async (_request, reply) => {
        try {
            return this.success(reply, {
                status: 'ok',
                timestamp: new Date().toISOString(),
                service: 'analytics-service'
            });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    readiness = async (_request, reply) => {
        try {
            const startTime = Date.now();
            const dbStatus = await this.testDatabaseConnection();
            const redisStatus = await this.testRedisConnection();
            const rabbitmqStatus = await this.testRabbitMQConnection();
            const totalLatency = Date.now() - startTime;
            const isReady = dbStatus.healthy && redisStatus.healthy && rabbitmqStatus.healthy;
            const response = {
                status: isReady ? 'ready' : 'not_ready',
                timestamp: new Date().toISOString(),
                checks: {
                    database: dbStatus,
                    redis: redisStatus,
                    rabbitmq: rabbitmqStatus
                },
                totalLatency
            };
            if (!isReady) {
                return reply.code(503).send(response);
            }
            return this.success(reply, response);
        }
        catch (error) {
            logger_1.logger.error('Readiness check failed:', error);
            return reply.code(503).send({
                status: 'not_ready',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
        }
    };
    liveness = async (_request, reply) => {
        try {
            return this.success(reply, {
                status: 'alive',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        }
        catch (error) {
            return this.handleError(error, reply);
        }
    };
    dependencies = async (_request, reply) => {
        try {
            const [postgresStatus, redisStatus, rabbitmqStatus, mongodbStatus] = await Promise.all([
                this.testDatabaseConnection(),
                this.testRedisConnection(),
                this.testRabbitMQConnection(),
                this.testMongoDBConnection()
            ]);
            const response = {
                timestamp: new Date().toISOString(),
                dependencies: {
                    postgres: postgresStatus,
                    redis: redisStatus,
                    rabbitmq: rabbitmqStatus,
                    mongodb: mongodbStatus
                }
            };
            const allHealthy = postgresStatus.healthy && redisStatus.healthy && rabbitmqStatus.healthy;
            if (!allHealthy) {
                return reply.code(503).send(response);
            }
            return this.success(reply, response);
        }
        catch (error) {
            logger_1.logger.error('Dependencies check failed:', error);
            return reply.code(503).send({
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
        }
    };
    async testDatabaseConnection() {
        const startTime = Date.now();
        try {
            await database_1.db.raw('SELECT 1');
            await database_1.analyticsDb.raw('SELECT 1');
            const latency = Date.now() - startTime;
            return {
                status: 'ok',
                healthy: true,
                latency
            };
        }
        catch (error) {
            const latency = Date.now() - startTime;
            logger_1.logger.error('Database health check failed:', error);
            return {
                status: 'error',
                healthy: false,
                latency,
                error: error instanceof Error ? error.message : 'Unknown database error'
            };
        }
    }
    async testRedisConnection() {
        const startTime = Date.now();
        try {
            const redis = (0, redis_1.getRedis)();
            await redis.ping();
            const latency = Date.now() - startTime;
            return {
                status: 'ok',
                healthy: true,
                latency
            };
        }
        catch (error) {
            const latency = Date.now() - startTime;
            logger_1.logger.error('Redis health check failed:', error);
            return {
                status: 'error',
                healthy: false,
                latency,
                error: error instanceof Error ? error.message : 'Unknown Redis error'
            };
        }
    }
    async testRabbitMQConnection() {
        const startTime = Date.now();
        try {
            const channel = (0, rabbitmq_1.getChannel)();
            if (!channel || channel.connection.connection.stream.destroyed) {
                throw new Error('RabbitMQ channel is closed');
            }
            const latency = Date.now() - startTime;
            return {
                status: 'ok',
                healthy: true,
                latency
            };
        }
        catch (error) {
            const latency = Date.now() - startTime;
            logger_1.logger.error('RabbitMQ health check failed:', error);
            return {
                status: 'error',
                healthy: false,
                latency,
                error: error instanceof Error ? error.message : 'Unknown RabbitMQ error'
            };
        }
    }
    async testMongoDBConnection() {
        const startTime = Date.now();
        const mongoEnabled = process.env.MONGODB_ENABLED === 'true';
        if (!mongoEnabled) {
            return {
                status: 'disabled',
                healthy: true,
                latency: 0
            };
        }
        try {
            const mongoClient = (0, mongodb_1.getMongoClient)();
            const adminDb = mongoClient.db().admin();
            await adminDb.ping();
            const latency = Date.now() - startTime;
            return {
                status: 'ok',
                healthy: true,
                latency
            };
        }
        catch (error) {
            const latency = Date.now() - startTime;
            logger_1.logger.warn('MongoDB health check failed (optional dependency):', error);
            return {
                status: 'warning',
                healthy: true,
                latency,
                error: error instanceof Error ? error.message : 'Unknown MongoDB error'
            };
        }
    }
}
exports.healthController = new HealthController();
//# sourceMappingURL=health.controller.js.map