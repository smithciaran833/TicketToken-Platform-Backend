// WP-12 Phase 5: Blockchain RPC Failover

const FailoverManager = require('./failover-manager');
const { Connection } = require('@solana/web3.js');

class BlockchainFailover {
  constructor() {
    this.failoverManager = new FailoverManager({
      providers: {
        rpc: ['alchemy', 'infura', 'quicknode', 'public']
      }
    });
    
    this.endpoints = {
      alchemy: process.env.ALCHEMY_RPC_URL || 'https://solana-mainnet.alchemyapi.io',
      infura: process.env.INFURA_RPC_URL || 'https://solana.infura.io',
      quicknode: process.env.QUICKNODE_RPC_URL || 'https://solana.quicknode.pro',
      public: 'https://api.mainnet-beta.solana.com'
    };
    
    this.connections = {};
  }

  getConnection(provider) {
    if (!this.connections[provider]) {
      this.connections[provider] = new Connection(this.endpoints[provider], 'confirmed');
    }
    return this.connections[provider];
  }

  async getBlockHeight() {
    return await this.failoverManager.executeWithFailover('rpc', async (provider) => {
      const connection = this.getConnection(provider);
      return await connection.getBlockHeight();
    });
  }

  async getTransaction(signature) {
    return await this.failoverManager.executeWithFailover('rpc', async (provider) => {
      const connection = this.getConnection(provider);
      return await connection.getTransaction(signature);
    });
  }

  async sendTransaction(transaction) {
    return await this.failoverManager.executeWithFailover('rpc', async (provider) => {
      const connection = this.getConnection(provider);
      return await connection.sendTransaction(transaction);
    });
  }

  async getBalance(publicKey) {
    return await this.failoverManager.executeWithFailover('rpc', async (provider) => {
      const connection = this.getConnection(provider);
      return await connection.getBalance(publicKey);
    });
  }

  getStatus() {
    return this.failoverManager.getStatus();
  }
}

module.exports = BlockchainFailover;
