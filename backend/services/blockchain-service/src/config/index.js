require('dotenv').config();

const config = {
    database: {
        host: process.env.DB_HOST || 'postgres',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'tickettoken_db',
        user: process.env.DB_USER || 'svc_blockchain_service',
        password: process.env.DB_PASSWORD,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    },
    solana: {
        network: process.env.SOLANA_NETWORK || 'devnet',
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        commitment: process.env.SOLANA_COMMITMENT || 'confirmed',
        programId: process.env.PROGRAM_ID
    },
    fees: {
        rentExemption: parseFloat(process.env.RENT_EXEMPTION_FEE) || 0.00203928,
        transactionFee: parseFloat(process.env.TRANSACTION_FEE) || 0.000005,
        priorityFee: parseFloat(process.env.PRIORITY_FEE) || 0.0001,
    }
};

module.exports = config;

// Add WebSocket URL for event listeners
config.solana.wsUrl = config.solana.rpcUrl.replace('https', 'wss').replace('http', 'ws');
