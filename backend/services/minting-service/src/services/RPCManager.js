const { Connection, ComputeBudgetProgram } = require('@solana/web3.js');
const logger = require('../utils/logger');

class RPCManager {
  constructor() {
    this.endpoints = [
      'https://api.devnet.solana.com',
      'https://devnet.helius-rpc.com/?api-key=YOUR_KEY', // Add your key
      'https://devnet.genesysgo.net/'
    ];
    this.currentEndpoint = 0;
    this.connections = [];
    this.maxRetries = 3;
    this.baseDelay = 1000;
  }

  async initialize() {
    this.connections = this.endpoints.map(endpoint => 
      new Connection(endpoint, 'confirmed')
    );
    logger.info(`Initialized ${this.connections.length} RPC endpoints`);
  }

  async getConnection() {
    return this.connections[this.currentEndpoint];
  }

  async sendTransactionWithRetry(transaction, signers) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const connection = await this.getConnection();
        
        // Add compute budget
        transaction.add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
        );
        
        const signature = await connection.sendTransaction(
          transaction,
          signers,
          { skipPreflight: false, preflightCommitment: 'confirmed' }
        );
        
        await connection.confirmTransaction(signature, 'confirmed');
        
        logger.info(`✅ Transaction confirmed: ${signature}`);
        return signature;
        
      } catch (error) {
        lastError = error;
        
        // Check for rate limiting
        if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
          logger.warn(`Rate limited on endpoint ${this.currentEndpoint}, switching...`);
          this.currentEndpoint = (this.currentEndpoint + 1) % this.endpoints.length;
        }
        
        // Exponential backoff
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        logger.info(`Retry ${attempt}/${this.maxRetries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error(`Transaction failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }
}

module.exports = { RPCManager };
