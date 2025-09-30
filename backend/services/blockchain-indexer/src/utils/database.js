const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'svc_blockchain_service',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    logger.error('Unexpected database error:', err);
    // Don't exit, just log the error
});

pool.on('connect', () => {
    logger.debug('New database connection established');
});

module.exports = {
    query: (text, params) => {
        const start = Date.now();
        return pool.query(text, params).then(res => {
            const duration = Date.now() - start;
            if (duration > 1000) {
                logger.warn({ query: text, duration }, 'Slow query detected');
            }
            return res;
        });
    },
    pool,
    getClient: () => pool.connect()
};
