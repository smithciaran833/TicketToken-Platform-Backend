const { Connection } = require('@solana/web3.js');
const { Pool } = require('pg');
const config = require('../config');
const ProgramEventListener = require('./programListener');
const TransactionMonitor = require('./transactionMonitor');

class ListenerManager {
    constructor() {
        this.connection = null;
        this.db = null;
        this.listeners = {};
        this.initialized = false;
    }
    
    async initialize() {
        if (this.initialized) return;
        
        console.log('Initializing event listeners...');
        
        // Setup connection
        this.connection = new Connection(config.solana.rpcUrl, {
            commitment: config.solana.commitment,
            wsEndpoint: config.solana.wsUrl
        });
        
        // Setup database
        this.db = new Pool(config.database);
        
        // Create listeners
        this.listeners.program = new ProgramEventListener(
            this.connection,
            this.db,
            config.solana.programId
        );
        
        this.listeners.transaction = new TransactionMonitor(
            this.connection,
            this.db
        );
        
        // Start all listeners
        await this.listeners.program.start();
        await this.listeners.transaction.start();
        
        this.initialized = true;
        console.log('Event listeners initialized');
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
        return await this.listeners.transaction.monitorTransaction(signature, metadata);
    }
    
    async shutdown() {
        console.log('Shutting down event listeners...');
        
        for (const listener of Object.values(this.listeners)) {
            await listener.stop();
        }
        
        if (this.db) {
            await this.db.end();
        }
        
        this.initialized = false;
        console.log('Event listeners shut down');
    }
}

module.exports = new ListenerManager();
