"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    solana: {
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        wsUrl: process.env.SOLANA_WS_URL,
        commitment: process.env.SOLANA_COMMITMENT || 'confirmed',
        network: process.env.SOLANA_NETWORK || 'devnet',
        programId: process.env.SOLANA_PROGRAM_ID
    },
    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'tickettoken',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: parseInt(process.env.DB_POOL_MAX || '20'),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000')
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0')
    },
    service: {
        name: process.env.SERVICE_NAME || 'blockchain-service',
        port: parseInt(process.env.PORT || '3015'),
        env: process.env.NODE_ENV || 'development'
    }
};
exports.default = config;
//# sourceMappingURL=index.js.map