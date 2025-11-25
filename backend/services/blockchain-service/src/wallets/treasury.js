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
exports.TreasuryWallet = void 0;
const web3_js_1 = require("@solana/web3.js");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
class TreasuryWallet {
    connection;
    db;
    keypair;
    publicKey;
    isInitialized;
    constructor(connection, db) {
        this.connection = connection;
        this.db = db;
        this.keypair = null;
        this.publicKey = null;
        this.isInitialized = false;
    }
    async initialize() {
        if (this.isInitialized)
            return;
        try {
            const walletPath = path.join(__dirname, '../../.wallet/treasury.json');
            try {
                const walletData = await fs_1.promises.readFile(walletPath, 'utf8');
                const data = JSON.parse(walletData);
                const secretKey = new Uint8Array(data.secretKey);
                this.keypair = web3_js_1.Keypair.fromSecretKey(secretKey);
                this.publicKey = this.keypair.publicKey;
                logger_1.logger.info('Loaded existing treasury wallet', {
                    publicKey: this.publicKey.toString(),
                    path: walletPath
                });
            }
            catch (err) {
                logger_1.logger.info('Creating new treasury wallet...');
                this.keypair = web3_js_1.Keypair.generate();
                this.publicKey = this.keypair.publicKey;
                await fs_1.promises.mkdir(path.dirname(walletPath), { recursive: true });
                const walletData = {
                    publicKey: this.publicKey.toString(),
                    secretKey: Array.from(this.keypair.secretKey),
                    createdAt: new Date().toISOString()
                };
                await fs_1.promises.writeFile(walletPath, JSON.stringify(walletData, null, 2));
                await this.db.query(`
          INSERT INTO treasury_wallets (wallet_address, blockchain_type, purpose, is_active)
          VALUES ($1, 'SOLANA', 'TREASURY', true)
          ON CONFLICT (wallet_address) DO NOTHING
        `, [this.publicKey.toString()]);
                logger_1.logger.info('Created new treasury wallet', {
                    publicKey: this.publicKey.toString(),
                    path: walletPath
                });
                logger_1.logger.warn('IMPORTANT: Fund this wallet with SOL for operations', {
                    publicKey: this.publicKey.toString()
                });
            }
            this.isInitialized = true;
            const balance = await this.getBalance();
            logger_1.logger.info('Treasury wallet balance checked', {
                balance,
                unit: 'SOL',
                publicKey: this.publicKey.toString()
            });
            if (balance < 0.1) {
                logger_1.logger.warn('LOW BALANCE: Treasury wallet needs funding!', {
                    currentBalance: balance,
                    minimumRecommended: 0.1,
                    publicKey: this.publicKey.toString()
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to initialize treasury wallet', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    async getBalance() {
        if (!this.publicKey)
            throw new Error('Wallet not initialized');
        const balance = await this.connection.getBalance(this.publicKey);
        return balance / web3_js_1.LAMPORTS_PER_SOL;
    }
    async signTransaction(transaction) {
        if (!this.keypair)
            throw new Error('Wallet not initialized');
        transaction.partialSign(this.keypair);
        return transaction;
    }
}
exports.TreasuryWallet = TreasuryWallet;
exports.default = TreasuryWallet;
//# sourceMappingURL=treasury.js.map