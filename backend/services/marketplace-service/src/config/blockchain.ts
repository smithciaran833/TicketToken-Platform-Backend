import { Connection, Keypair, PublicKey, Commitment } from '@solana/web3.js';
import { logger } from '../utils/logger';

interface BlockchainConfig {
  rpcUrl: string;
  network: string;
  commitment: Commitment;
  programId: string;
  walletPrivateKey?: string;
}

class BlockchainService {
  private connection: Connection;
  private programId: PublicKey;
  private wallet?: Keypair;

  constructor(config: BlockchainConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment);
    this.programId = new PublicKey(config.programId);
    
    if (config.walletPrivateKey) {
      try {
        // Convert base64 private key to Keypair
        const privateKeyBuffer = Buffer.from(config.walletPrivateKey, 'base64');
        this.wallet = Keypair.fromSecretKey(new Uint8Array(privateKeyBuffer));
        logger.info('Blockchain wallet loaded', { 
          publicKey: this.wallet.publicKey.toBase58() 
        });
      } catch (error) {
        logger.error('Failed to load wallet from private key:', error);
      }
    }
  }

  getConnection(): Connection {
    return this.connection;
  }

  getProgramId(): PublicKey {
    return this.programId;
  }

  getWallet(): Keypair | undefined {
    return this.wallet;
  }

  async getBlockHeight(): Promise<number> {
    try {
      return await this.connection.getBlockHeight();
    } catch (error) {
      logger.error('Failed to get block height:', error);
      throw error;
    }
  }

  async getBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      logger.error('Failed to get balance:', error);
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const blockHeight = await this.getBlockHeight();
      logger.info('Blockchain connection successful', { blockHeight });
      return true;
    } catch (error) {
      logger.error('Blockchain connection test failed:', error);
      return false;
    }
  }
}

// Create singleton instance
export const blockchain = new BlockchainService({
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  network: process.env.SOLANA_NETWORK || 'devnet',
  commitment: 'confirmed' as Commitment,
  programId: process.env.PROGRAM_ID || '11111111111111111111111111111111',
  walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
});

export default blockchain;
