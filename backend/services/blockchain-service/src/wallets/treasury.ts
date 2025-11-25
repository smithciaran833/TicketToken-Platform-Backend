import { Keypair, PublicKey, LAMPORTS_PER_SOL, Connection, Transaction } from '@solana/web3.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

export class TreasuryWallet {
  private connection: Connection;
  private db: Pool;
  private keypair: Keypair | null;
  private publicKey: PublicKey | null;
  private isInitialized: boolean;

  constructor(connection: Connection, db: Pool) {
    this.connection = connection;
    this.db = db;
    this.keypair = null;
    this.publicKey = null;
    this.isInitialized = false;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const walletPath = path.join(__dirname, '../../.wallet/treasury.json');

      try {
        // Try to load existing wallet
        const walletData = await fs.readFile(walletPath, 'utf8');
        const data = JSON.parse(walletData);
        const secretKey = new Uint8Array(data.secretKey);
        this.keypair = Keypair.fromSecretKey(secretKey);
        this.publicKey = this.keypair.publicKey;

        logger.info('Loaded existing treasury wallet', { 
          publicKey: this.publicKey.toString(),
          path: walletPath
        });
      } catch (err) {
        // Create new wallet
        logger.info('Creating new treasury wallet...');
        this.keypair = Keypair.generate();
        this.publicKey = this.keypair.publicKey;

        // Save wallet
        await fs.mkdir(path.dirname(walletPath), { recursive: true });
        const walletData = {
          publicKey: this.publicKey.toString(),
          secretKey: Array.from(this.keypair.secretKey),
          createdAt: new Date().toISOString()
        };

        await fs.writeFile(walletPath, JSON.stringify(walletData, null, 2));

        // Store in database
        await this.db.query(`
          INSERT INTO treasury_wallets (wallet_address, blockchain_type, purpose, is_active)
          VALUES ($1, 'SOLANA', 'TREASURY', true)
          ON CONFLICT (wallet_address) DO NOTHING
        `, [this.publicKey.toString()]);

        logger.info('Created new treasury wallet', { 
          publicKey: this.publicKey.toString(),
          path: walletPath
        });
        logger.warn('IMPORTANT: Fund this wallet with SOL for operations', {
          publicKey: this.publicKey.toString()
        });
      }

      this.isInitialized = true;

      // Check and log balance
      const balance = await this.getBalance();
      logger.info('Treasury wallet balance checked', { 
        balance, 
        unit: 'SOL',
        publicKey: this.publicKey.toString()
      });

      if (balance < 0.1) {
        logger.warn('LOW BALANCE: Treasury wallet needs funding!', {
          currentBalance: balance,
          minimumRecommended: 0.1,
          publicKey: this.publicKey.toString()
        });
      }

    } catch (error: any) {
      logger.error('Failed to initialize treasury wallet', { 
        error: error.message, 
        stack: error.stack 
      });
      throw error;
    }
  }

  async getBalance(): Promise<number> {
    if (!this.publicKey) throw new Error('Wallet not initialized');
    const balance = await this.connection.getBalance(this.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  async signTransaction(transaction: Transaction): Promise<Transaction> {
    if (!this.keypair) throw new Error('Wallet not initialized');
    transaction.partialSign(this.keypair);
    return transaction;
  }
}

export default TreasuryWallet;
