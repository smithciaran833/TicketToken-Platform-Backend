"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const pg_1 = require("pg");
const config_1 = __importDefault(require("../config"));
const programListener_1 = __importDefault(require("./programListener"));
const transactionMonitor_1 = __importDefault(require("./transactionMonitor"));
const logger_1 = require("../utils/logger");
class ListenerManager {
    connection;
    db;
    listeners;
    initialized;
    constructor() {
        this.connection = null;
        this.db = null;
        this.listeners = {};
        this.initialized = false;
    }
    async initialize() {
        if (this.initialized)
            return;
        logger_1.logger.info('Initializing event listeners...');
        this.connection = new web3_js_1.Connection(config_1.default.solana.rpcUrl, {
            commitment: config_1.default.solana.commitment,
            wsEndpoint: config_1.default.solana.wsUrl
        });
        this.db = new pg_1.Pool(config_1.default.database);
        if (config_1.default.solana.programId) {
            this.listeners.program = new programListener_1.default(this.connection, this.db, config_1.default.solana.programId);
            this.listeners.transaction = new transactionMonitor_1.default(this.connection, this.db);
            await this.listeners.program.start();
            await this.listeners.transaction.start();
            logger_1.logger.info('Event listeners started', {
                programId: config_1.default.solana.programId,
                rpcUrl: config_1.default.solana.rpcUrl
            });
        }
        else {
            logger_1.logger.warn('No program ID configured - listeners not started');
        }
        this.initialized = true;
        logger_1.logger.info('Event listener system initialized');
    }
    getProgramListener() {
        return this.listeners.program;
    }
    getTransactionMonitor() {
        return this.listeners.transaction;
    }
    async monitorTransaction(signature, metadata) {
        if (!this.initialized) {
            throw new Error('Listeners not initialized');
        }
        if (this.listeners.transaction) {
            await this.listeners.transaction.monitorTransaction(signature, metadata);
        }
    }
    async shutdown() {
        logger_1.logger.info('Shutting down event listeners...');
        for (const listener of Object.values(this.listeners)) {
            if (listener) {
                await listener.stop();
            }
        }
        if (this.db) {
            await this.db.end();
        }
        this.initialized = false;
        logger_1.logger.info('Event listeners shut down');
    }
}
exports.default = new ListenerManager();
//# sourceMappingURL=index.js.map