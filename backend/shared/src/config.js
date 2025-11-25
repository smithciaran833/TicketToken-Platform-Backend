"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMongoDBConfig = exports.getRabbitMQConfig = exports.getRedisConfig = exports.getDatabaseConfig = exports.baseEnv = void 0;
const envalid_1 = require("envalid");
exports.baseEnv = (0, envalid_1.cleanEnv)(process.env, {
    NODE_ENV: (0, envalid_1.str)({ default: 'development', choices: ['development', 'test', 'production'] }),
    PORT: (0, envalid_1.port)({ default: 3000 }),
    SERVICE_NAME: (0, envalid_1.str)({ default: 'unknown-service' }),
    JWT_SECRET: (0, envalid_1.str)({ default: 'this-is-a-very-long-secret-key-that-is-at-least-32-characters' }),
});
const getDatabaseConfig = () => {
    if (process.env.DATABASE_URL) {
        return { connectionString: process.env.DATABASE_URL };
    }
    return {
        host: process.env.DB_HOST || 'postgres',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'tickettoken_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres'
    };
};
exports.getDatabaseConfig = getDatabaseConfig;
const getRedisConfig = () => {
    if (process.env.REDIS_URL) {
        return process.env.REDIS_URL;
    }
    return {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
    };
};
exports.getRedisConfig = getRedisConfig;
const getRabbitMQConfig = () => {
    return process.env.AMQP_URL || process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
};
exports.getRabbitMQConfig = getRabbitMQConfig;
const getMongoDBConfig = () => {
    return process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://mongodb:27017/tickettoken';
};
exports.getMongoDBConfig = getMongoDBConfig;
//# sourceMappingURL=config.js.map