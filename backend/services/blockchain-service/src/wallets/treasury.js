const { Keypair, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fs = require('fs').promises;
const path = require('path');

class TreasuryWallet {
    constructor(connection, db) {
        this.connection = connection;
        this.db = db;
        this.keypair = null;
        this.publicKey = null;
        this.isInitialized = false;
    }
    
    async initialize() {
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
                
                console.log('Loaded treasury wallet:', this.publicKey.toString());
            } catch (err) {
                // Create new wallet
                console.log('Creating new treasury wallet...');
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
                
                console.log('Created new treasury wallet:', this.publicKey.toString());
                console.log('⚠️  IMPORTANT: Fund this wallet with SOL for operations');
            }
            
            this.isInitialized = true;
            
            // Check and log balance
            const balance = await this.getBalance();
            console.log(`Treasury balance: ${balance} SOL`);
            
            if (balance < 0.1) {
                console.warn('⚠️  LOW BALANCE: Treasury needs funding!');
            }
            
        } catch (error) {
            console.error('Failed to initialize treasury wallet:', error);
            throw error;
        }
    }
    
    async getBalance() {
        if (!this.publicKey) throw new Error('Wallet not initialized');
        const balance = await this.connection.getBalance(this.publicKey);
        return balance / LAMPORTS_PER_SOL;
    }
    
    async signTransaction(transaction) {
        if (!this.keypair) throw new Error('Wallet not initialized');
        transaction.partialSign(this.keypair);
        return transaction;
    }
}

module.exports = TreasuryWallet;
