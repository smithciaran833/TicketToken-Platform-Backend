"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
exports.validateConfigOrExit = validateConfigOrExit;
exports.testSolanaConnection = testSolanaConnection;
exports.getConfigSummary = getConfigSummary;
const logger_1 = require("../utils/logger");
const REQUIRED_ENV_VARS = [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'REDIS_HOST',
    'REDIS_PORT',
    'JWT_SECRET',
    'SOLANA_RPC_URL',
    'SOLANA_NETWORK',
    'SOLANA_PROGRAM_ID',
    'SOLANA_WALLET_PRIVATE_KEY',
];
function validateConfig() {
    const missing = [];
    const invalid = [];
    for (const varName of REQUIRED_ENV_VARS) {
        const value = process.env[varName];
        if (!value || value.trim() === '') {
            missing.push(varName);
            continue;
        }
        if (varName === 'DB_PORT' || varName === 'REDIS_PORT') {
            const port = parseInt(value, 10);
            if (isNaN(port) || port < 1 || port > 65535) {
                invalid.push(`${varName} (must be valid port number)`);
            }
        }
        if (varName === 'SOLANA_NETWORK') {
            const validNetworks = ['mainnet-beta', 'devnet', 'testnet', 'localnet'];
            if (!validNetworks.includes(value)) {
                invalid.push(`${varName} (must be one of: ${validNetworks.join(', ')})`);
            }
        }
        if (varName === 'SOLANA_RPC_URL') {
            try {
                new URL(value);
            }
            catch {
                invalid.push(`${varName} (must be valid URL)`);
            }
        }
        if (varName === 'JWT_SECRET' && value.length < 32) {
            invalid.push(`${varName} (must be at least 32 characters)`);
        }
    }
    return {
        valid: missing.length === 0 && invalid.length === 0,
        missing,
        invalid
    };
}
function validateConfigOrExit() {
    logger_1.logger.info('Validating configuration...');
    const result = validateConfig();
    if (!result.valid) {
        logger_1.logger.error('Configuration validation failed!');
        if (result.missing.length > 0) {
            logger_1.logger.error('Missing required environment variables:', {
                missing: result.missing
            });
        }
        if (result.invalid.length > 0) {
            logger_1.logger.error('Invalid environment variable values:', {
                invalid: result.invalid
            });
        }
        logger_1.logger.error('Please check your .env file or environment configuration');
        process.exit(1);
    }
    logger_1.logger.info('Configuration validation passed');
}
async function testSolanaConnection() {
    try {
        const { Connection } = await Promise.resolve().then(() => __importStar(require('@solana/web3.js')));
        const connection = new Connection(process.env.SOLANA_RPC_URL, {
            commitment: 'confirmed'
        });
        const version = await connection.getVersion();
        logger_1.logger.info('Solana connection successful', {
            network: process.env.SOLANA_NETWORK,
            rpcUrl: process.env.SOLANA_RPC_URL,
            version: version['solana-core']
        });
        return true;
    }
    catch (error) {
        logger_1.logger.error('Failed to connect to Solana RPC', {
            error: error.message,
            rpcUrl: process.env.SOLANA_RPC_URL
        });
        return false;
    }
}
function getConfigSummary() {
    return {
        service: 'blockchain-service',
        port: process.env.PORT || '3015',
        nodeEnv: process.env.NODE_ENV || 'development',
        solanaNetwork: process.env.SOLANA_NETWORK,
        solanaRpcUrl: process.env.SOLANA_RPC_URL,
        dbHost: process.env.DB_HOST,
        dbName: process.env.DB_NAME,
        redisHost: process.env.REDIS_HOST,
        bundlrAddress: process.env.BUNDLR_ADDRESS || 'https://devnet.bundlr.network',
        logLevel: process.env.LOG_LEVEL || 'info'
    };
}
//# sourceMappingURL=validate.js.map