import { Pool, QueryResult, PoolClient } from 'pg';
import logger from './logger';

const pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'svc_blockchain_service',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err: Error) => {
    logger.error({ err }, 'Unexpected database error');
});

pool.on('connect', () => {
    logger.debug('New database connection established');
});

export const query = async (text: string, params?: any[]): Promise<QueryResult> => {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
        logger.warn({ query: text, duration }, 'Slow query detected');
    }
    
    return res;
};

export const getClient = (): Promise<PoolClient> => pool.connect();

export { pool };

export default { query, pool, getClient };
