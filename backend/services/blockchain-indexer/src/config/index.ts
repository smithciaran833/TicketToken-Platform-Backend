import 'dotenv/config';

interface DatabaseConfig {
    host: string;
    port: number;
    database: string;
    user: string | undefined;
    password: string | undefined;
}

interface SolanaConfig {
    network: string;
    rpcUrl: string;
    wsUrl: string;
    commitment: string;
    programId: string | undefined;
}

interface IndexerConfig {
    port: number;
    batchSize: number;
    maxConcurrent: number;
    reconciliationInterval: number;
    syncLagThreshold: number;
}

interface MarketplacesConfig {
    magicEden: string | undefined;
    tensor: string | undefined;
}

interface RedisConfig {
    host: string;
    port: number;
    password: string | undefined;
}

interface Config {
    database: DatabaseConfig;
    solana: SolanaConfig;
    indexer: IndexerConfig;
    marketplaces: MarketplacesConfig;
    redis: RedisConfig;
    logLevel: string;
    nodeEnv: string;
}

const config: Config = {
    database: {
        host: process.env.DB_HOST || 'postgres',
        port: parseInt(process.env.DB_PORT || '6432'),
        database: process.env.DB_NAME || 'tickettoken_db',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    },
    solana: {
        network: process.env.SOLANA_NETWORK || 'devnet',
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        wsUrl: process.env.SOLANA_WS_URL || 'wss://api.devnet.solana.com',
        commitment: process.env.SOLANA_COMMITMENT || 'confirmed',
        programId: process.env.PROGRAM_ID,
    },
    indexer: {
        port: parseInt(process.env.INDEXER_PORT || '3456'),
        batchSize: parseInt(process.env.INDEXER_BATCH_SIZE || '1000'),
        maxConcurrent: parseInt(process.env.INDEXER_MAX_CONCURRENT || '5'),
        reconciliationInterval: parseInt(process.env.RECONCILIATION_INTERVAL || '300000'),
        syncLagThreshold: parseInt(process.env.SYNC_LAG_THRESHOLD || '1000'),
    },
    marketplaces: {
        magicEden: process.env.MARKETPLACE_MAGIC_EDEN,
        tensor: process.env.MARKETPLACE_TENSOR,
    },
    redis: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
    },
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development',
};

export default config;
