# COMPLETE DATABASE ANALYSIS: blockchain-service
Generated: Thu Oct  2 15:07:48 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/wallets/userWallet.js
```typescript
const { PublicKey } = require('@solana/web3.js');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

class UserWalletManager {
    constructor(db) {
        this.db = db;
    }
    
    async connectWallet(userId, walletAddress, signatureBase64, message) {
        try {
            // Default message if not provided
            const signMessage = message || `Connect wallet to TicketToken: ${userId}`;
            
            // Verify signature
            const verified = await this.verifySignature(
                walletAddress,
                signatureBase64,
                signMessage
            );
            
            if (!verified) {
                throw new Error('Invalid wallet signature');
            }
            
            // Check if wallet already exists
            const existing = await this.db.query(
                'SELECT * FROM wallet_addresses WHERE user_id = $1 AND wallet_address = $2',
                [userId, walletAddress]
            );
            
            if (existing.rows.length > 0) {
                // Update existing connection
                await this.db.query(`
                    UPDATE wallet_addresses 
                    SET verified_at = NOW(), 
                        is_primary = true,
                        last_used_at = NOW(),
                        updated_at = NOW()
                    WHERE user_id = $1 AND wallet_address = $2
                `, [userId, walletAddress]);
                
                // Update other wallets to not be primary
                await this.db.query(`
                    UPDATE wallet_addresses 
                    SET is_primary = false
                    WHERE user_id = $1 AND wallet_address != $2
                `, [userId, walletAddress]);
                
                return {
                    success: true,
                    wallet: existing.rows[0],
                    message: 'Wallet reconnected successfully'
                };
            }
            
            // Set other wallets as non-primary
            await this.db.query(`
                UPDATE wallet_addresses 
                SET is_primary = false
                WHERE user_id = $1
            `, [userId]);
            
            // Store new wallet connection
            const result = await this.db.query(`
                INSERT INTO wallet_addresses 
                (user_id, wallet_address, blockchain_type, is_primary, verified_at, created_at, updated_at)
                VALUES ($1, $2, 'SOLANA', true, NOW(), NOW(), NOW())
                RETURNING *
            `, [userId, walletAddress]);
            
            // Log connection in user_wallet_connections
            await this.db.query(`
                INSERT INTO user_wallet_connections 
                (user_id, wallet_address, signature_proof, connected_at, is_primary)
                VALUES ($1, $2, $3, NOW(), true)
            `, [userId, walletAddress, signatureBase64]);
            
            return {
                success: true,
                wallet: result.rows[0],
                message: 'Wallet connected successfully'
            };
            
        } catch (error) {
            console.error('Wallet connection failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async verifySignature(publicKeyString, signatureBase64, message) {
        try {
            const publicKey = new PublicKey(publicKeyString);
            const signature = Buffer.from(signatureBase64, 'base64');
            const messageBytes = new TextEncoder().encode(message);
            
            return nacl.sign.detached.verify(
                messageBytes,
                signature,
                publicKey.toBuffer()
            );
        } catch (error) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }
    
    async getUserWallets(userId) {
        const result = await this.db.query(`
            SELECT * FROM wallet_addresses 
            WHERE user_id = $1 
            ORDER BY is_primary DESC NULLS LAST, created_at DESC
        `, [userId]);
        
        return result.rows;
    }
    
    async getPrimaryWallet(userId) {
        const result = await this.db.query(`
            SELECT * FROM wallet_addresses 
            WHERE user_id = $1 AND is_primary = true
            LIMIT 1
        `, [userId]);
        
        return result.rows[0] || null;
    }
    
    async verifyOwnership(userId, walletAddress) {
        const result = await this.db.query(`
            SELECT * FROM wallet_addresses 
            WHERE user_id = $1 AND wallet_address = $2
        `, [userId, walletAddress]);
        
        return result.rows.length > 0;
    }
    
    async disconnectWallet(userId, walletAddress) {
        await this.db.query(`
            DELETE FROM wallet_addresses 
            WHERE user_id = $1 AND wallet_address = $2
        `, [userId, walletAddress]);
        
        return { success: true, message: 'Wallet disconnected' };
    }
    
    async updateLastUsed(userId, walletAddress) {
        await this.db.query(`
            UPDATE wallet_addresses 
            SET last_used_at = NOW(), updated_at = NOW()
            WHERE user_id = $1 AND wallet_address = $2
        `, [userId, walletAddress]);
    }
}

module.exports = UserWalletManager;
```

### FILE: src/wallets/treasury.js
```typescript
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
```

### FILE: src/listeners/transactionMonitor.js
```typescript
const BaseListener = require('./baseListener');

class TransactionMonitor extends BaseListener {
    constructor(connection, db) {
        super(connection, db);
        this.pendingTransactions = new Map();
    }
    
    async monitorTransaction(signature, metadata = {}) {
        console.log(`Monitoring transaction: ${signature}`);
        
        this.pendingTransactions.set(signature, {
            signature,
            metadata,
            startTime: Date.now(),
            attempts: 0
        });
        
        // Start monitoring
        await this.checkTransaction(signature);
    }
    
    async checkTransaction(signature) {
        const txData = this.pendingTransactions.get(signature);
        if (!txData) return;
        
        txData.attempts++;
        
        try {
            const status = await this.connection.getSignatureStatus(signature);
            
            if (status.value) {
                const { confirmationStatus, confirmations, err } = status.value;
                
                console.log(`Transaction ${signature}: ${confirmationStatus} (${confirmations || 0} confirmations)`);
                
                // Update database
                await this.updateTransactionStatus(signature, confirmationStatus, confirmations, err);
                
                if (confirmationStatus === 'finalized' || err) {
                    // Transaction is finalized or failed
                    this.pendingTransactions.delete(signature);
                    this.emit('transaction:finalized', { signature, status: confirmationStatus, error: err });
                    
                    // Update related records
                    if (txData.metadata.ticketId) {
                        await this.finalizeTicketMinting(txData.metadata.ticketId, !err);
                    }
                } else {
                    // Check again in a few seconds
                    setTimeout(() => this.checkTransaction(signature), 2000);
                }
            } else {
                // Transaction not found yet, retry
                if (txData.attempts < 30) { // Max 1 minute
                    setTimeout(() => this.checkTransaction(signature), 2000);
                } else {
                    // Timeout
                    this.pendingTransactions.delete(signature);
                    this.emit('transaction:timeout', { signature });
                }
            }
            
        } catch (error) {
            console.error(`Error checking transaction ${signature}:`, error);
            
            if (txData.attempts < 30) {
                setTimeout(() => this.checkTransaction(signature), 5000);
            } else {
                this.pendingTransactions.delete(signature);
                await this.handleError(error, { signature, metadata: txData.metadata });
            }
        }
    }
    
    async updateTransactionStatus(signature, status, confirmations, error) {
        await this.db.query(`
            UPDATE blockchain_transactions 
            SET status = $1,
                confirmation_count = $2,
                error_message = $3,
                updated_at = NOW()
            WHERE id = $4 OR metadata->>'signature' = $4
        `, [status, confirmations || 0, error ? JSON.stringify(error) : null, signature]);
    }
    
    async finalizeTicketMinting(ticketId, success) {
        if (success) {
            await this.db.query(`
                UPDATE tickets 
                SET on_chain_confirmed = true,
                    status = 'SOLD'
                WHERE id = $1
            `, [ticketId]);
            
            await this.db.query(`
                UPDATE queue_jobs 
                SET status = 'CONFIRMED'
                WHERE ticket_id = $1 AND job_type = 'MINT'
            `, [ticketId]);
        } else {
            await this.db.query(`
                UPDATE tickets 
                SET is_minted = false,
                    status = 'AVAILABLE'
                WHERE id = $1
            `, [ticketId]);
            
            await this.db.query(`
                UPDATE queue_jobs 
                SET status = 'BLOCKCHAIN_FAILED'
                WHERE ticket_id = $1 AND job_type = 'MINT'
            `, [ticketId]);
        }
    }
    
    async setupSubscriptions() {
        // No subscriptions needed, we monitor on demand
        console.log('Transaction monitor ready');
    }
}

module.exports = TransactionMonitor;
```

### FILE: src/listeners/baseListener.js
```typescript
const { EventEmitter } = require('events');

class BaseListener extends EventEmitter {
    constructor(connection, db) {
        super();
        this.connection = connection;
        this.db = db;
        this.subscriptions = new Map();
        this.isRunning = false;
    }
    
    async start() {
        if (this.isRunning) {
            console.log('Listener already running');
            return;
        }
        
        this.isRunning = true;
        console.log(`Starting ${this.constructor.name}...`);
        await this.setupSubscriptions();
        console.log(`${this.constructor.name} started`);
    }
    
    async stop() {
        if (!this.isRunning) return;
        
        console.log(`Stopping ${this.constructor.name}...`);
        
        // Remove all subscriptions
        for (const [id, subscription] of this.subscriptions) {
            await this.connection.removeAccountChangeListener(subscription);
            this.subscriptions.delete(id);
        }
        
        this.isRunning = false;
        console.log(`${this.constructor.name} stopped`);
    }
    
    async setupSubscriptions() {
        // Override in subclass
        throw new Error('setupSubscriptions must be implemented');
    }
    
    async handleError(error, context) {
        console.error(`Error in ${this.constructor.name}:`, error);
        console.error('Context:', context);
        
        // Store error in database
        try {
            await this.db.query(`
                INSERT INTO blockchain_events (
                    event_type,
                    program_id,
                    event_data,
                    processed,
                    created_at
                )
                VALUES ('ERROR', $1, $2, false, NOW())
            `, [context.programId || 'unknown', JSON.stringify({ error: error.message, context })]);
        } catch (dbError) {
            console.error('Failed to log error to database:', dbError);
        }
    }
}

module.exports = BaseListener;
```

### FILE: src/listeners/programListener.js
```typescript
const BaseListener = require('./baseListener');
const { PublicKey } = require('@solana/web3.js');

class ProgramEventListener extends BaseListener {
    constructor(connection, db, programId) {
        super(connection, db);
        this.programId = new PublicKey(programId);
    }
    
    async setupSubscriptions() {
        try {
            // Subscribe to program logs
            const logsSubscription = this.connection.onLogs(
                this.programId,
                async (logs) => {
                    await this.processLogs(logs);
                },
                'confirmed'
            );
            
            this.subscriptions.set('logs', logsSubscription);
            console.log(`Listening to program logs for ${this.programId.toString()}`);
            
        } catch (error) {
            await this.handleError(error, { programId: this.programId.toString() });
        }
    }
    
    async processLogs(logs) {
        try {
            console.log(`Processing logs for signature: ${logs.signature}`);
            
            // Store raw logs
            await this.storeRawLogs(logs);
            
            // Parse events from logs
            const events = this.parseEvents(logs.logs);
            
            // Process each event
            for (const event of events) {
                await this.processEvent(event, logs.signature);
            }
            
        } catch (error) {
            await this.handleError(error, { logs });
        }
    }
    
    parseEvents(logs) {
        const events = [];
        
        for (const log of logs) {
            // Look for specific event patterns
            if (log.includes('TicketMinted')) {
                events.push({
                    type: 'TICKET_MINTED',
                    data: this.extractEventData(log)
                });
            } else if (log.includes('TicketTransferred')) {
                events.push({
                    type: 'TICKET_TRANSFERRED',
                    data: this.extractEventData(log)
                });
            } else if (log.includes('TicketUsed')) {
                events.push({
                    type: 'TICKET_USED',
                    data: this.extractEventData(log)
                });
            }
        }
        
        return events;
    }
    
    extractEventData(log) {
        // Try to extract JSON data from log
        try {
            const jsonMatch = log.match(/\{.*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            // Not JSON, return raw log
        }
        return { raw: log };
    }
    
    async processEvent(event, signature) {
        console.log(`Processing event: ${event.type}`);
        
        // Store event in database
        await this.db.query(`
            INSERT INTO blockchain_events (
                event_type,
                program_id,
                transaction_signature,
                event_data,
                processed,
                created_at
            )
            VALUES ($1, $2, $3, $4, false, NOW())
        `, [event.type, this.programId.toString(), signature, JSON.stringify(event.data)]);
        
        // Emit event for other parts of the system
        this.emit('blockchain:event', { type: event.type, data: event.data, signature });
        
        // Handle specific event types
        switch (event.type) {
            case 'TICKET_MINTED':
                await this.handleTicketMinted(event.data, signature);
                break;
            case 'TICKET_TRANSFERRED':
                await this.handleTicketTransferred(event.data, signature);
                break;
            case 'TICKET_USED':
                await this.handleTicketUsed(event.data, signature);
                break;
        }
    }
    
    async handleTicketMinted(data, signature) {
        console.log('Ticket minted event:', data);
        // Update ticket in database if we have the ticket ID
        if (data.ticketId) {
            await this.db.query(`
                UPDATE tickets 
                SET on_chain_confirmed = true,
                    confirmation_signature = $1
                WHERE id = $2
            `, [signature, data.ticketId]);
        }
    }
    
    async handleTicketTransferred(data, signature) {
        console.log('Ticket transferred event:', data);
        // Record transfer in database
    }
    
    async handleTicketUsed(data, signature) {
        console.log('Ticket used event:', data);
        // Mark ticket as used
    }
    
    async storeRawLogs(logs) {
        // Store raw logs for debugging/audit
        await this.db.query(`
            INSERT INTO blockchain_events (
                event_type,
                program_id,
                transaction_signature,
                slot,
                event_data,
                processed,
                created_at
            )
            VALUES ('RAW_LOGS', $1, $2, $3, $4, true, NOW())
        `, [
            this.programId.toString(),
            logs.signature,
            logs.slot,
            JSON.stringify({ logs: logs.logs, err: logs.err })
        ]);
    }
}

module.exports = ProgramEventListener;
```

### FILE: src/routes/health.routes.ts
```typescript
import { Router } from 'express';
import { db } from '../config/database';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'blockchain-service' });
});

router.get('/health/db', async (req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'blockchain-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'blockchain-service'
    });
  }
});

export default router;
```

### FILE: src/queues/mintQueue.js
```typescript
const BaseQueue = require('./baseQueue');
const { Pool } = require('pg');
const config = require('../config');
const queueConfig = require('../config/queue');

class MintQueue extends BaseQueue {
    constructor() {
        super('nft-minting', {
            defaultJobOptions: {
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                },
                removeOnComplete: 50,
                removeOnFail: 100
            }
        });
        
        this.db = new Pool(config.database);
        this.setupProcessor();
    }
    
    setupProcessor() {
        const concurrency = queueConfig.queues['nft-minting'].concurrency || 5;
        
        this.queue.process(concurrency, async (job) => {
            const { ticketId, userId, eventId, metadata } = job.data;
            
            try {
                // Update job progress
                job.progress(10);
                
                // Check if already minted (idempotency)
                const existing = await this.checkExistingMint(ticketId);
                if (existing) {
                    console.log(`Ticket ${ticketId} already minted`);
                    return existing;
                }
                
                job.progress(20);
                
                // Update ticket status to RESERVED (while minting)
                await this.updateTicketStatus(ticketId, 'RESERVED');
                
                job.progress(30);
                
                // Store job in database (without updated_at)
                await this.storeJobRecord(job.id, ticketId, userId, 'PROCESSING');
                
                job.progress(40);
                
                // Simulate NFT minting (will be replaced with actual blockchain call)
                const mintResult = await this.simulateMint(ticketId, metadata);
                
                job.progress(70);
                
                // Store transaction result
                await this.storeTransaction(ticketId, mintResult);
                
                job.progress(90);
                
                // Update ticket as minted
                await this.updateTicketAsMinted(ticketId, mintResult);
                
                // Update job record
                await this.updateJobRecord(job.id, 'COMPLETED', mintResult);
                
                job.progress(100);
                
                console.log(`Successfully minted NFT for ticket ${ticketId}`);
                return mintResult;
                
            } catch (error) {
                console.error(`Minting failed for ticket ${ticketId}:`, error);
                
                // Update job record with error
                await this.updateJobRecord(job.id, 'FAILED', null, error.message);
                
                // If final attempt, update ticket status
                if (job.attemptsMade >= job.opts.attempts - 1) {
                    await this.updateTicketStatus(ticketId, 'AVAILABLE');
                }
                
                throw error;
            }
        });
    }
    
    async checkExistingMint(ticketId) {
        const result = await this.db.query(
            'SELECT token_id, mint_transaction_id FROM tickets WHERE id = $1 AND is_minted = true',
            [ticketId]
        );
        
        if (result.rows.length > 0) {
            return {
                alreadyMinted: true,
                tokenId: result.rows[0].token_id,
                transactionId: result.rows[0].mint_transaction_id
            };
        }
        
        return null;
    }
    
    async updateTicketStatus(ticketId, status) {
        await this.db.query(
            'UPDATE tickets SET status = $1 WHERE id = $2',
            [status, ticketId]
        );
    }
    
    async storeJobRecord(jobId, ticketId, userId, status) {
        // First check if job exists
        const existing = await this.db.query(
            'SELECT id FROM queue_jobs WHERE job_id = $1',
            [String(jobId)]
        );
        
        if (existing.rows.length > 0) {
            // Update existing
            await this.db.query(
                'UPDATE queue_jobs SET status = $1 WHERE job_id = $2',
                [status, String(jobId)]
            );
        } else {
            // Insert new
            await this.db.query(`
                INSERT INTO queue_jobs (
                    job_id, 
                    queue_name, 
                    job_type, 
                    ticket_id, 
                    user_id, 
                    status, 
                    created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, [String(jobId), 'nft-minting', 'MINT', ticketId, userId, status]);
        }
    }
    
    async updateJobRecord(jobId, status, result = null, error = null) {
        const metadata = result ? { result } : {};
        
        await this.db.query(`
            UPDATE queue_jobs 
            SET 
                status = $1,
                metadata = $2,
                error_message = $3,
                completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE completed_at END,
                failed_at = CASE WHEN $1 = 'FAILED' THEN NOW() ELSE failed_at END
            WHERE job_id = $4
        `, [status, JSON.stringify(metadata), error, String(jobId)]);
    }
    
    async simulateMint(ticketId, metadata) {
        // This will be replaced with actual blockchain minting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
            success: true,
            tokenId: `token_${ticketId}_${Date.now()}`,
            transactionId: `tx_${Math.random().toString(36).substr(2, 9)}`,
            signature: `sig_${Math.random().toString(36).substr(2, 9)}`,
            blockHeight: Math.floor(Math.random() * 1000000),
            timestamp: new Date().toISOString()
        };
    }
    
    async storeTransaction(ticketId, mintResult) {
        await this.db.query(`
            INSERT INTO blockchain_transactions (
                ticket_id,
                type,
                status,
                slot_number,
                metadata,
                created_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
            ticketId,
            'MINT',
            'CONFIRMED',
            mintResult.blockHeight || 0,
            JSON.stringify(mintResult)
        ]);
    }
    
    async updateTicketAsMinted(ticketId, mintResult) {
        await this.db.query(`
            UPDATE tickets 
            SET 
                is_minted = true,
                token_id = $1,
                mint_transaction_id = $2,
                status = 'SOLD',
                is_nft = true
            WHERE id = $3
        `, [mintResult.tokenId, mintResult.transactionId, ticketId]);
    }
    
    // Public method to add a minting job
    async addMintJob(ticketId, userId, eventId, metadata, options = {}) {
        return await this.addJob({
            ticketId,
            userId,
            eventId,
            metadata,
            timestamp: new Date().toISOString()
        }, {
            ...options,
            jobId: `mint_${ticketId}_${Date.now()}`
        });
    }
}

module.exports = MintQueue;
```

### FILE: src/config/database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken',
  pool: {
    min: 2,
    max: 10
  }
});
```

### FILE: src/services/compliance/fee-transparency.service.ts
```typescript
import { db } from '../../config/database';
import { logger } from '../../utils/logger';

interface FeeBreakdown {
  basePrice: number;
  platformFee: number;
  platformFeePercent: number;
  venueFee: number;
  venueFeePercent: number;
  paymentProcessingFee: number;
  paymentProcessingPercent: number;
  taxAmount: number;
  taxPercent: number;
  totalPrice: number;
  currency: string;
}

interface VenueFeePolicy {
  venueId: string;
  venueName: string;
  baseFeePercent: number;
  serviceFeePercent: number;
  resaleFeePercent: number;
  maxResalePrice?: number;
  effectiveDate: Date;
  lastUpdated: Date;
}

export class FeeTransparencyService {
  /**
   * Calculate complete fee breakdown for a ticket purchase
   */
  async calculateFeeBreakdown(
    basePrice: number,
    venueId: string,
    isResale: boolean = false,
    location?: string
  ): Promise<FeeBreakdown> {
    try {
      // Get venue fee policy
      const venuePolicy = await this.getVenueFeePolicy(venueId);
      
      // Platform fees (TicketToken's cut)
      const platformFeePercent = isResale ? 2.5 : 3.5; // Lower for resales
      const platformFee = Math.round(basePrice * platformFeePercent / 100);
      
      // Venue fees
      const venueFeePercent = isResale ? 
        venuePolicy.resaleFeePercent : 
        venuePolicy.baseFeePercent;
      const venueFee = Math.round(basePrice * venueFeePercent / 100);
      
      // Payment processing (Stripe/Square)
      const paymentProcessingPercent = 2.9; // + $0.30 typically
      const paymentProcessingFee = Math.round(basePrice * paymentProcessingPercent / 100) + 30;
      
      // Tax calculation (simplified - would use real tax API)
      const taxPercent = this.getTaxRate(location);
      const subtotal = basePrice + platformFee + venueFee + paymentProcessingFee;
      const taxAmount = Math.round(subtotal * taxPercent / 100);
      
      // Total
      const totalPrice = subtotal + taxAmount;
      
      return {
        basePrice,
        platformFee,
        platformFeePercent,
        venueFee,
        venueFeePercent,
        paymentProcessingFee,
        paymentProcessingPercent,
        taxAmount,
        taxPercent,
        totalPrice,
        currency: 'USD'
      };
      
    } catch (error) {
      logger.error('Failed to calculate fee breakdown:', error);
      throw error;
    }
  }

  /**
   * Get venue fee policy
   */
  async getVenueFeePolicy(venueId: string): Promise<VenueFeePolicy> {
    const policy = await db('venue_fee_policies')
      .where({ venue_id: venueId, active: true })
      .first();
    
    if (!policy) {
      // Return default policy
      return {
        venueId,
        venueName: 'Venue',
        baseFeePercent: 5.0,
        serviceFeePercent: 2.5,
        resaleFeePercent: 5.0,
        effectiveDate: new Date(),
        lastUpdated: new Date()
      };
    }
    
    return {
      venueId: policy.venue_id,
      venueName: policy.venue_name,
      baseFeePercent: parseFloat(policy.base_fee_percent),
      serviceFeePercent: parseFloat(policy.service_fee_percent),
      resaleFeePercent: parseFloat(policy.resale_fee_percent),
      maxResalePrice: policy.max_resale_price,
      effectiveDate: policy.effective_date,
      lastUpdated: policy.updated_at
    };
  }

  /**
   * Get all fees for a specific order
   */
  async getOrderFees(orderId: string): Promise<any> {
    const fees = await db('order_fees')
      .where({ order_id: orderId })
      .first();
    
    if (!fees) {
      throw new Error('Order fees not found');
    }
    
    return {
      orderId,
      breakdown: {
        tickets: fees.base_amount / 100,
        platformFee: fees.platform_fee / 100,
        venueFee: fees.venue_fee / 100,
        processingFee: fees.processing_fee / 100,
        tax: fees.tax_amount / 100,
        total: fees.total_amount / 100
      },
      currency: fees.currency,
      paidAt: fees.created_at
    };
  }

  /**
   * Generate fee report for venue
   */
  async generateVenueFeeReport(venueId: string, startDate: Date, endDate: Date): Promise<any> {
    const report = await db('order_fees')
      .where({ venue_id: venueId })
      .whereBetween('created_at', [startDate, endDate])
      .select(
        db.raw('SUM(base_amount) as total_sales'),
        db.raw('SUM(venue_fee) as total_venue_fees'),
        db.raw('SUM(platform_fee) as total_platform_fees'),
        db.raw('COUNT(*) as transaction_count'),
        db.raw('AVG(venue_fee) as avg_venue_fee')
      )
      .first();
    
    const breakdown = await db('order_fees')
      .where({ venue_id: venueId })
      .whereBetween('created_at', [startDate, endDate])
      .select(
        db.raw('DATE(created_at) as date'),
        db.raw('SUM(venue_fee) as daily_fees'),
        db.raw('COUNT(*) as transactions')
      )
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date', 'asc');
    
    return {
      venueId,
      period: {
        start: startDate,
        end: endDate
      },
      summary: {
        totalSales: (report.total_sales || 0) / 100,
        totalVenueFees: (report.total_venue_fees || 0) / 100,
        totalPlatformFees: (report.total_platform_fees || 0) / 100,
        transactionCount: report.transaction_count || 0,
        averageFeePerTransaction: (report.avg_venue_fee || 0) / 100
      },
      dailyBreakdown: breakdown.map((day: any) => ({
        date: day.date,
        fees: day.daily_fees / 100,
        transactions: day.transactions
      }))
    };
  }

  /**
   * Get tax rate based on location (simplified)
   */
  private getTaxRate(location?: string): number {
    // In production, would use a real tax API like TaxJar
    const taxRates: Record<string, number> = {
      'CA': 8.5,
      'NY': 8.0,
      'TX': 6.25,
      'FL': 6.0,
      'WA': 6.5
    };
    
    return taxRates[location || 'NY'] || 7.0;
  }
}

export const feeTransparencyService = new FeeTransparencyService();
```

### FILE: src/services/compliance/privacy-export.service.ts
```typescript
import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import crypto from 'crypto';

interface UserDataExport {
  requestId: string;
  userId: string;
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class PrivacyExportService {
  private exportPath = process.env.EXPORT_PATH || '/tmp/exports';

  /**
   * Request full data export for GDPR/CCPA compliance
   */
  async requestDataExport(userId: string, reason: string): Promise<UserDataExport> {
    try {
      const requestId = crypto.randomUUID();
      
      // Store export request
      await db('privacy_export_requests').insert({
        id: requestId,
        user_id: userId,
        reason,
        status: 'pending',
        requested_at: new Date()
      });
      
      // Queue for processing (async)
      this.processExportAsync(requestId, userId);
      
      return {
        requestId,
        userId,
        requestedAt: new Date(),
        status: 'pending'
      };
      
    } catch (error) {
      logger.error('Failed to create export request:', error);
      throw error;
    }
  }

  /**
   * Process data export asynchronously
   */
  private async processExportAsync(requestId: string, userId: string): Promise<void> {
    try {
      // Update status
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({ status: 'processing' });
      
      // Collect all user data
      const userData = await this.collectUserData(userId);
      
      // Create export file
      const exportFile = await this.createExportArchive(userId, userData);
      
      // Generate secure download URL
      const downloadUrl = await this.generateDownloadUrl(exportFile);
      
      // Update request
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'completed',
          completed_at: new Date(),
          download_url: downloadUrl,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });
      
      // Send notification to user
      await this.notifyUserExportReady(userId, downloadUrl);
      
    } catch (error) {
      logger.error('Export processing failed:', error);
      
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'failed',
          error_message: (error as Error).message
        });
    }
  }

  /**
   * Collect all user data from various tables
   */
  private async collectUserData(userId: string): Promise<any> {
    const data: any = {};
    
    // Profile data
    data.profile = await db('users')
      .where({ id: userId })
      .select('id', 'email', 'name', 'phone', 'created_at', 'last_login')
      .first();
    
    // Purchase history
    data.purchases = await db('orders')
      .where({ customer_id: userId })
      .select('id', 'event_id', 'ticket_count', 'total_amount', 'status', 'created_at');
    
    // Tickets owned
    data.tickets = await db('tickets')
      .where({ owner_id: userId })
      .select('id', 'event_id', 'seat_number', 'price', 'status', 'created_at');
    
    // NFTs
    data.nfts = await db('nft_mints')
      .where({ owner_address: userId })
      .select('mint_address', 'metadata', 'created_at');
    
    // Marketplace activity
    data.listings = await db('marketplace_listings')
      .where({ seller_id: userId })
      .orWhere({ buyer_id: userId })
      .select('id', 'ticket_id', 'price', 'status', 'created_at');
    
    // Payment methods (masked)
    data.paymentMethods = await db('payment_methods')
      .where({ user_id: userId })
      .select(
        'id',
        'type',
        db.raw('RIGHT(card_last4, 4) as last4'),
        'card_brand',
        'created_at'
      );
    
    // Notifications
    data.notifications = await db('notifications')
      .where({ recipient_id: userId })
      .select('id', 'type', 'channel', 'status', 'created_at');
    
    // Consent records
    data.consent = await db('consent')
      .where({ customer_id: userId })
      .select('channel', 'type', 'granted', 'granted_at', 'revoked_at');
    
    // Activity logs (last 90 days)
    data.activityLogs = await db('activity_logs')
      .where({ user_id: userId })
      .where('created_at', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      .select('action', 'ip_address', 'user_agent', 'created_at')
      .limit(1000);
    
    return data;
  }

  /**
   * Create ZIP archive of user data
   */
  private async createExportArchive(userId: string, data: any): Promise<string> {
    const timestamp = Date.now();
    const filename = `user_data_export_${userId}_${timestamp}.zip`;
    const filepath = path.join(this.exportPath, filename);
    
    // Ensure export directory exists
    if (!fs.existsSync(this.exportPath)) {
      fs.mkdirSync(this.exportPath, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filepath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      
      output.on('close', () => {
        logger.info(`Export created: ${filepath} (${archive.pointer()} bytes)`);
        resolve(filepath);
      });
      
      archive.on('error', reject);
      archive.pipe(output);
      
      // Add JSON files
      archive.append(JSON.stringify(data.profile, null, 2), { name: 'profile.json' });
      archive.append(JSON.stringify(data.purchases, null, 2), { name: 'purchases.json' });
      archive.append(JSON.stringify(data.tickets, null, 2), { name: 'tickets.json' });
      archive.append(JSON.stringify(data.nfts, null, 2), { name: 'nfts.json' });
      archive.append(JSON.stringify(data.listings, null, 2), { name: 'marketplace.json' });
      archive.append(JSON.stringify(data.paymentMethods, null, 2), { name: 'payment_methods.json' });
      archive.append(JSON.stringify(data.notifications, null, 2), { name: 'notifications.json' });
      archive.append(JSON.stringify(data.consent, null, 2), { name: 'consent.json' });
      archive.append(JSON.stringify(data.activityLogs, null, 2), { name: 'activity_logs.json' });
      
      // Add README
      archive.append(this.generateReadme(userId), { name: 'README.txt' });
      
      archive.finalize();
    });
  }

  /**
   * Generate README for export
   */
  private generateReadme(userId: string): string {
    return `TicketToken Data Export
========================
User ID: ${userId}
Export Date: ${new Date().toISOString()}

This archive contains all personal data associated with your TicketToken account.

Files included:
- profile.json: Your account information
- purchases.json: Order history
- tickets.json: Tickets you own
- nfts.json: NFT tickets on blockchain
- marketplace.json: Marketplace activity
- payment_methods.json: Payment methods (masked)
- notifications.json: Notification history
- consent.json: Privacy consent records
- activity_logs.json: Recent account activity

This export is provided in compliance with GDPR Article 20 (Right to Data Portability)
and CCPA regulations.

For questions, contact: privacy@tickettoken.com`;
  }

  /**
   * Request account deletion
   */
  async requestAccountDeletion(userId: string, reason: string): Promise<any> {
    try {
      const requestId = crypto.randomUUID();
      
      // Store deletion request
      await db('account_deletion_requests').insert({
        id: requestId,
        user_id: userId,
        reason,
        status: 'pending',
        requested_at: new Date(),
        scheduled_for: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      });
      
      // Send confirmation email
      await this.sendDeletionConfirmation(userId, requestId);
      
      return {
        requestId,
        message: 'Account deletion scheduled',
        scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        canCancelUntil: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000)
      };
      
    } catch (error) {
      logger.error('Failed to create deletion request:', error);
      throw error;
    }
  }

  /**
   * Generate secure download URL
   */
  private async generateDownloadUrl(filepath: string): Promise<string> {
    // In production, would upload to S3 and return signed URL
    // For now, return local path
    return `/exports/${path.basename(filepath)}`;
  }

  /**
   * Notify user that export is ready
   */
  private async notifyUserExportReady(userId: string, downloadUrl: string): Promise<void> {
    // Would send email notification
    logger.info(`Export ready for user ${userId}: ${downloadUrl}`);
  }

  /**
   * Send deletion confirmation
   */
  private async sendDeletionConfirmation(userId: string, requestId: string): Promise<void> {
    // Would send email with cancellation link
    logger.info(`Deletion requested for user ${userId}: ${requestId}`);
  }
}

export const privacyExportService = new PrivacyExportService();
```

### FILE: src/workers/mint-worker.js
```typescript
const { Pool } = require('pg');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const amqp = require('amqplib');

// Define QUEUES directly since the module import is broken
const QUEUES = {
  TICKET_MINT: 'ticket.mint',
  BLOCKCHAIN_MINT: 'blockchain.mint'
};

class MintWorker {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken_db'
    });
    this.solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    this.mintWallet = this.initializeWallet();
    this.rabbitConnection = null;
    this.channel = null;
  }

  initializeWallet() {
    if (process.env.MINT_WALLET_PRIVATE_KEY) {
      const privateKey = JSON.parse(process.env.MINT_WALLET_PRIVATE_KEY);
      return Keypair.fromSecretKey(new Uint8Array(privateKey));
    } else {
      const wallet = Keypair.generate();
      console.log('⚠️  Generated new wallet for testing:', wallet.publicKey.toString());
      console.log('   Fund this wallet with devnet SOL to enable minting');
      return wallet;
    }
  }

  async start() {
    console.log('🚀 Starting Mint Worker...');
    
    try {
      await this.connectRabbitMQ();
      await this.consumeQueue();
    } catch (error) {
      console.log('📮 RabbitMQ not available, using polling mode');
      console.error(error.message);
    }
    
    await this.startPolling();
  }

  async connectRabbitMQ() {
    const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
    this.rabbitConnection = await amqp.connect(rabbitmqUrl);
    this.channel = await this.rabbitConnection.createChannel();
    
    // Ensure queue exists
    await this.channel.assertQueue(QUEUES.TICKET_MINT, { durable: true });
    console.log('✅ Connected to RabbitMQ');
  }

  async consumeQueue() {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    await this.channel.consume(QUEUES.TICKET_MINT, async (msg) => {
      if (!msg) return;

      try {
        const job = JSON.parse(msg.content.toString());
        console.log('Processing mint job:', job);
        
        await this.processMintJob(job);
        
        // Acknowledge message
        this.channel.ack(msg);
      } catch (error) {
        console.error('Failed to process mint job:', error);
        // Reject and requeue
        this.channel.nack(msg, false, true);
      }
    });

    console.log('📬 Consuming from ticket.mint queue');
  }

  async startPolling() {
    // Fallback polling mechanism if RabbitMQ is not available
    setInterval(async () => {
      try {
        const result = await this.pool.query(`
          SELECT * FROM mint_jobs 
          WHERE status = 'pending' 
          ORDER BY created_at ASC 
          LIMIT 1
        `);

        if (result.rows.length > 0) {
          const job = result.rows[0];
          await this.processMintJob(job);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000); // Poll every 5 seconds

    console.log('Mint worker started');
  }

  async processMintJob(job) {
    try {
      // Generate a mock NFT address (in production, this would be actual minting)
      const mintAddress = Keypair.generate().publicKey.toString();

      // FIXED: Update database using proper join through order_items table
      await this.pool.query(`
        UPDATE tickets t
        SET mint_address = $1, minted_at = NOW()
        FROM order_items oi 
        WHERE t.id = oi.ticket_id 
          AND oi.order_id = $2
      `, [mintAddress, job.orderId]);

      console.log(`✅ Minted NFT: ${mintAddress} for order ${job.orderId}`);

      // Update mint job status if it exists
      if (job.id) {
        await this.pool.query(`
          UPDATE mint_jobs 
          SET status = 'completed', 
              nft_address = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [mintAddress, job.id]);
      }

      // Emit success event
      if (this.channel) {
        await this.channel.publish('events', 'mint.success', Buffer.from(JSON.stringify({
          orderId: job.orderId,
          mintAddress,
          timestamp: new Date().toISOString()
        })));
      }

    } catch (error) {
      console.error('Minting failed:', error);
      
      // Update mint job status to failed if it exists
      if (job.id) {
        await this.pool.query(`
          UPDATE mint_jobs 
          SET status = 'failed', 
              error = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [error.message, job.id]);
      }
      
      throw error;
    }
  }

  async shutdown() {
    console.log('Shutting down mint worker...');
    if (this.channel) {
      await this.channel.close();
    }
    if (this.rabbitConnection) {
      await this.rabbitConnection.close();
    }
    await this.pool.end();
  }
}

module.exports = MintWorker;
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/services/compliance/fee-transparency.service.ts
```typescript
import { db } from '../../config/database';
import { logger } from '../../utils/logger';

interface FeeBreakdown {
  basePrice: number;
  platformFee: number;
  platformFeePercent: number;
  venueFee: number;
  venueFeePercent: number;
  paymentProcessingFee: number;
  paymentProcessingPercent: number;
  taxAmount: number;
  taxPercent: number;
  totalPrice: number;
  currency: string;
}

interface VenueFeePolicy {
  venueId: string;
  venueName: string;
  baseFeePercent: number;
  serviceFeePercent: number;
  resaleFeePercent: number;
  maxResalePrice?: number;
  effectiveDate: Date;
  lastUpdated: Date;
}

export class FeeTransparencyService {
  /**
   * Calculate complete fee breakdown for a ticket purchase
   */
  async calculateFeeBreakdown(
    basePrice: number,
    venueId: string,
    isResale: boolean = false,
    location?: string
  ): Promise<FeeBreakdown> {
    try {
      // Get venue fee policy
      const venuePolicy = await this.getVenueFeePolicy(venueId);
      
      // Platform fees (TicketToken's cut)
      const platformFeePercent = isResale ? 2.5 : 3.5; // Lower for resales
      const platformFee = Math.round(basePrice * platformFeePercent / 100);
      
      // Venue fees
      const venueFeePercent = isResale ? 
        venuePolicy.resaleFeePercent : 
        venuePolicy.baseFeePercent;
      const venueFee = Math.round(basePrice * venueFeePercent / 100);
      
      // Payment processing (Stripe/Square)
      const paymentProcessingPercent = 2.9; // + $0.30 typically
      const paymentProcessingFee = Math.round(basePrice * paymentProcessingPercent / 100) + 30;
      
      // Tax calculation (simplified - would use real tax API)
      const taxPercent = this.getTaxRate(location);
      const subtotal = basePrice + platformFee + venueFee + paymentProcessingFee;
      const taxAmount = Math.round(subtotal * taxPercent / 100);
      
      // Total
      const totalPrice = subtotal + taxAmount;
      
      return {
        basePrice,
        platformFee,
        platformFeePercent,
        venueFee,
        venueFeePercent,
        paymentProcessingFee,
        paymentProcessingPercent,
        taxAmount,
        taxPercent,
        totalPrice,
        currency: 'USD'
      };
      
    } catch (error) {
      logger.error('Failed to calculate fee breakdown:', error);
      throw error;
    }
  }

  /**
   * Get venue fee policy
   */
  async getVenueFeePolicy(venueId: string): Promise<VenueFeePolicy> {
    const policy = await db('venue_fee_policies')
      .where({ venue_id: venueId, active: true })
      .first();
    
    if (!policy) {
      // Return default policy
      return {
        venueId,
        venueName: 'Venue',
        baseFeePercent: 5.0,
        serviceFeePercent: 2.5,
        resaleFeePercent: 5.0,
        effectiveDate: new Date(),
        lastUpdated: new Date()
      };
    }
    
    return {
      venueId: policy.venue_id,
      venueName: policy.venue_name,
      baseFeePercent: parseFloat(policy.base_fee_percent),
      serviceFeePercent: parseFloat(policy.service_fee_percent),
      resaleFeePercent: parseFloat(policy.resale_fee_percent),
      maxResalePrice: policy.max_resale_price,
      effectiveDate: policy.effective_date,
      lastUpdated: policy.updated_at
    };
  }

  /**
   * Get all fees for a specific order
   */
  async getOrderFees(orderId: string): Promise<any> {
    const fees = await db('order_fees')
      .where({ order_id: orderId })
      .first();
    
    if (!fees) {
      throw new Error('Order fees not found');
    }
    
    return {
      orderId,
      breakdown: {
        tickets: fees.base_amount / 100,
        platformFee: fees.platform_fee / 100,
        venueFee: fees.venue_fee / 100,
        processingFee: fees.processing_fee / 100,
        tax: fees.tax_amount / 100,
        total: fees.total_amount / 100
      },
      currency: fees.currency,
      paidAt: fees.created_at
    };
  }

  /**
   * Generate fee report for venue
   */
  async generateVenueFeeReport(venueId: string, startDate: Date, endDate: Date): Promise<any> {
    const report = await db('order_fees')
      .where({ venue_id: venueId })
      .whereBetween('created_at', [startDate, endDate])
      .select(
        db.raw('SUM(base_amount) as total_sales'),
        db.raw('SUM(venue_fee) as total_venue_fees'),
        db.raw('SUM(platform_fee) as total_platform_fees'),
        db.raw('COUNT(*) as transaction_count'),
        db.raw('AVG(venue_fee) as avg_venue_fee')
      )
      .first();
    
    const breakdown = await db('order_fees')
      .where({ venue_id: venueId })
      .whereBetween('created_at', [startDate, endDate])
      .select(
        db.raw('DATE(created_at) as date'),
        db.raw('SUM(venue_fee) as daily_fees'),
        db.raw('COUNT(*) as transactions')
      )
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date', 'asc');
    
    return {
      venueId,
      period: {
        start: startDate,
        end: endDate
      },
      summary: {
        totalSales: (report.total_sales || 0) / 100,
        totalVenueFees: (report.total_venue_fees || 0) / 100,
        totalPlatformFees: (report.total_platform_fees || 0) / 100,
        transactionCount: report.transaction_count || 0,
        averageFeePerTransaction: (report.avg_venue_fee || 0) / 100
      },
      dailyBreakdown: breakdown.map((day: any) => ({
        date: day.date,
        fees: day.daily_fees / 100,
        transactions: day.transactions
      }))
    };
  }

  /**
   * Get tax rate based on location (simplified)
   */
  private getTaxRate(location?: string): number {
    // In production, would use a real tax API like TaxJar
    const taxRates: Record<string, number> = {
      'CA': 8.5,
      'NY': 8.0,
      'TX': 6.25,
      'FL': 6.0,
      'WA': 6.5
    };
    
    return taxRates[location || 'NY'] || 7.0;
  }
}

export const feeTransparencyService = new FeeTransparencyService();
```

### FILE: src/services/compliance/privacy-export.service.ts
```typescript
import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import crypto from 'crypto';

interface UserDataExport {
  requestId: string;
  userId: string;
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class PrivacyExportService {
  private exportPath = process.env.EXPORT_PATH || '/tmp/exports';

  /**
   * Request full data export for GDPR/CCPA compliance
   */
  async requestDataExport(userId: string, reason: string): Promise<UserDataExport> {
    try {
      const requestId = crypto.randomUUID();
      
      // Store export request
      await db('privacy_export_requests').insert({
        id: requestId,
        user_id: userId,
        reason,
        status: 'pending',
        requested_at: new Date()
      });
      
      // Queue for processing (async)
      this.processExportAsync(requestId, userId);
      
      return {
        requestId,
        userId,
        requestedAt: new Date(),
        status: 'pending'
      };
      
    } catch (error) {
      logger.error('Failed to create export request:', error);
      throw error;
    }
  }

  /**
   * Process data export asynchronously
   */
  private async processExportAsync(requestId: string, userId: string): Promise<void> {
    try {
      // Update status
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({ status: 'processing' });
      
      // Collect all user data
      const userData = await this.collectUserData(userId);
      
      // Create export file
      const exportFile = await this.createExportArchive(userId, userData);
      
      // Generate secure download URL
      const downloadUrl = await this.generateDownloadUrl(exportFile);
      
      // Update request
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'completed',
          completed_at: new Date(),
          download_url: downloadUrl,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });
      
      // Send notification to user
      await this.notifyUserExportReady(userId, downloadUrl);
      
    } catch (error) {
      logger.error('Export processing failed:', error);
      
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'failed',
          error_message: (error as Error).message
        });
    }
  }

  /**
   * Collect all user data from various tables
   */
  private async collectUserData(userId: string): Promise<any> {
    const data: any = {};
    
    // Profile data
    data.profile = await db('users')
      .where({ id: userId })
      .select('id', 'email', 'name', 'phone', 'created_at', 'last_login')
      .first();
    
    // Purchase history
    data.purchases = await db('orders')
      .where({ customer_id: userId })
      .select('id', 'event_id', 'ticket_count', 'total_amount', 'status', 'created_at');
    
    // Tickets owned
    data.tickets = await db('tickets')
      .where({ owner_id: userId })
      .select('id', 'event_id', 'seat_number', 'price', 'status', 'created_at');
    
    // NFTs
    data.nfts = await db('nft_mints')
      .where({ owner_address: userId })
      .select('mint_address', 'metadata', 'created_at');
    
    // Marketplace activity
    data.listings = await db('marketplace_listings')
      .where({ seller_id: userId })
      .orWhere({ buyer_id: userId })
      .select('id', 'ticket_id', 'price', 'status', 'created_at');
    
    // Payment methods (masked)
    data.paymentMethods = await db('payment_methods')
      .where({ user_id: userId })
      .select(
        'id',
        'type',
        db.raw('RIGHT(card_last4, 4) as last4'),
        'card_brand',
        'created_at'
      );
    
    // Notifications
    data.notifications = await db('notifications')
      .where({ recipient_id: userId })
      .select('id', 'type', 'channel', 'status', 'created_at');
    
    // Consent records
    data.consent = await db('consent')
      .where({ customer_id: userId })
      .select('channel', 'type', 'granted', 'granted_at', 'revoked_at');
    
    // Activity logs (last 90 days)
    data.activityLogs = await db('activity_logs')
      .where({ user_id: userId })
      .where('created_at', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      .select('action', 'ip_address', 'user_agent', 'created_at')
      .limit(1000);
    
    return data;
  }

  /**
   * Create ZIP archive of user data
   */
  private async createExportArchive(userId: string, data: any): Promise<string> {
    const timestamp = Date.now();
    const filename = `user_data_export_${userId}_${timestamp}.zip`;
    const filepath = path.join(this.exportPath, filename);
    
    // Ensure export directory exists
    if (!fs.existsSync(this.exportPath)) {
      fs.mkdirSync(this.exportPath, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filepath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      
      output.on('close', () => {
        logger.info(`Export created: ${filepath} (${archive.pointer()} bytes)`);
        resolve(filepath);
      });
      
      archive.on('error', reject);
      archive.pipe(output);
      
      // Add JSON files
      archive.append(JSON.stringify(data.profile, null, 2), { name: 'profile.json' });
      archive.append(JSON.stringify(data.purchases, null, 2), { name: 'purchases.json' });
      archive.append(JSON.stringify(data.tickets, null, 2), { name: 'tickets.json' });
      archive.append(JSON.stringify(data.nfts, null, 2), { name: 'nfts.json' });
      archive.append(JSON.stringify(data.listings, null, 2), { name: 'marketplace.json' });
      archive.append(JSON.stringify(data.paymentMethods, null, 2), { name: 'payment_methods.json' });
      archive.append(JSON.stringify(data.notifications, null, 2), { name: 'notifications.json' });
      archive.append(JSON.stringify(data.consent, null, 2), { name: 'consent.json' });
      archive.append(JSON.stringify(data.activityLogs, null, 2), { name: 'activity_logs.json' });
      
      // Add README
      archive.append(this.generateReadme(userId), { name: 'README.txt' });
      
      archive.finalize();
    });
  }

  /**
   * Generate README for export
   */
  private generateReadme(userId: string): string {
    return `TicketToken Data Export
========================
User ID: ${userId}
Export Date: ${new Date().toISOString()}

This archive contains all personal data associated with your TicketToken account.

Files included:
- profile.json: Your account information
- purchases.json: Order history
- tickets.json: Tickets you own
- nfts.json: NFT tickets on blockchain
- marketplace.json: Marketplace activity
- payment_methods.json: Payment methods (masked)
- notifications.json: Notification history
- consent.json: Privacy consent records
- activity_logs.json: Recent account activity

This export is provided in compliance with GDPR Article 20 (Right to Data Portability)
and CCPA regulations.

For questions, contact: privacy@tickettoken.com`;
  }

  /**
   * Request account deletion
   */
  async requestAccountDeletion(userId: string, reason: string): Promise<any> {
    try {
      const requestId = crypto.randomUUID();
      
      // Store deletion request
      await db('account_deletion_requests').insert({
        id: requestId,
        user_id: userId,
        reason,
        status: 'pending',
        requested_at: new Date(),
        scheduled_for: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      });
      
      // Send confirmation email
      await this.sendDeletionConfirmation(userId, requestId);
      
      return {
        requestId,
        message: 'Account deletion scheduled',
        scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        canCancelUntil: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000)
      };
      
    } catch (error) {
      logger.error('Failed to create deletion request:', error);
      throw error;
    }
  }

  /**
   * Generate secure download URL
   */
  private async generateDownloadUrl(filepath: string): Promise<string> {
    // In production, would upload to S3 and return signed URL
    // For now, return local path
    return `/exports/${path.basename(filepath)}`;
  }

  /**
   * Notify user that export is ready
   */
  private async notifyUserExportReady(userId: string, downloadUrl: string): Promise<void> {
    // Would send email notification
    logger.info(`Export ready for user ${userId}: ${downloadUrl}`);
  }

  /**
   * Send deletion confirmation
   */
  private async sendDeletionConfirmation(userId: string, requestId: string): Promise<void> {
    // Would send email with cancellation link
    logger.info(`Deletion requested for user ${userId}: ${requestId}`);
  }
}

export const privacyExportService = new PrivacyExportService();
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/blockchain-service//src/wallets/userWallet.js:28:                'SELECT * FROM wallet_addresses WHERE user_id = $1 AND wallet_address = $2',
backend/services/blockchain-service//src/wallets/userWallet.js:33:                // Update existing connection
backend/services/blockchain-service//src/wallets/userWallet.js:35:                    UPDATE wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:39:                        updated_at = NOW()
backend/services/blockchain-service//src/wallets/userWallet.js:43:                // Update other wallets to not be primary
backend/services/blockchain-service//src/wallets/userWallet.js:45:                    UPDATE wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:59:                UPDATE wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:66:                INSERT INTO wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:67:                (user_id, wallet_address, blockchain_type, is_primary, verified_at, created_at, updated_at)
backend/services/blockchain-service//src/wallets/userWallet.js:74:                INSERT INTO user_wallet_connections 
backend/services/blockchain-service//src/wallets/userWallet.js:113:            SELECT * FROM wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:123:            SELECT * FROM wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:133:            SELECT * FROM wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:142:            DELETE FROM wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:149:    async updateLastUsed(userId, walletAddress) {
backend/services/blockchain-service//src/wallets/userWallet.js:151:            UPDATE wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:152:            SET last_used_at = NOW(), updated_at = NOW()
backend/services/blockchain-service//src/wallets/treasury.js:47:                    INSERT INTO treasury_wallets (wallet_address, blockchain_type, purpose, is_active)
backend/services/blockchain-service//src/listeners/transactionMonitor.js:37:                // Update database
backend/services/blockchain-service//src/listeners/transactionMonitor.js:38:                await this.updateTransactionStatus(signature, confirmationStatus, confirmations, err);
backend/services/blockchain-service//src/listeners/transactionMonitor.js:45:                    // Update related records
backend/services/blockchain-service//src/listeners/transactionMonitor.js:76:    async updateTransactionStatus(signature, status, confirmations, error) {
backend/services/blockchain-service//src/listeners/transactionMonitor.js:78:            UPDATE blockchain_transactions 
backend/services/blockchain-service//src/listeners/transactionMonitor.js:82:                updated_at = NOW()
backend/services/blockchain-service//src/listeners/transactionMonitor.js:90:                UPDATE tickets 
backend/services/blockchain-service//src/listeners/transactionMonitor.js:97:                UPDATE queue_jobs 
backend/services/blockchain-service//src/listeners/transactionMonitor.js:103:                UPDATE tickets 
backend/services/blockchain-service//src/listeners/transactionMonitor.js:110:                UPDATE queue_jobs 
backend/services/blockchain-service//src/listeners/baseListener.js:51:                INSERT INTO blockchain_events (
backend/services/blockchain-service//src/listeners/programListener.js:93:            INSERT INTO blockchain_events (
backend/services/blockchain-service//src/listeners/programListener.js:123:        // Update ticket in database if we have the ticket ID
backend/services/blockchain-service//src/listeners/programListener.js:126:                UPDATE tickets 
backend/services/blockchain-service//src/listeners/programListener.js:147:            INSERT INTO blockchain_events (
backend/services/blockchain-service//src/routes/internal-mint.routes.js:25:      .update(payload)
backend/services/blockchain-service//src/routes/health.routes.ts:12:    await db.raw('SELECT 1');
backend/services/blockchain-service//src/queues/mintQueue.js:31:                // Update job progress
backend/services/blockchain-service//src/queues/mintQueue.js:43:                // Update ticket status to RESERVED (while minting)
backend/services/blockchain-service//src/queues/mintQueue.js:44:                await this.updateTicketStatus(ticketId, 'RESERVED');
backend/services/blockchain-service//src/queues/mintQueue.js:48:                // Store job in database (without updated_at)
backend/services/blockchain-service//src/queues/mintQueue.js:63:                // Update ticket as minted
backend/services/blockchain-service//src/queues/mintQueue.js:64:                await this.updateTicketAsMinted(ticketId, mintResult);
backend/services/blockchain-service//src/queues/mintQueue.js:66:                // Update job record
backend/services/blockchain-service//src/queues/mintQueue.js:67:                await this.updateJobRecord(job.id, 'COMPLETED', mintResult);
backend/services/blockchain-service//src/queues/mintQueue.js:77:                // Update job record with error
backend/services/blockchain-service//src/queues/mintQueue.js:78:                await this.updateJobRecord(job.id, 'FAILED', null, error.message);
backend/services/blockchain-service//src/queues/mintQueue.js:80:                // If final attempt, update ticket status
backend/services/blockchain-service//src/queues/mintQueue.js:82:                    await this.updateTicketStatus(ticketId, 'AVAILABLE');
backend/services/blockchain-service//src/queues/mintQueue.js:92:            'SELECT token_id, mint_transaction_id FROM tickets WHERE id = $1 AND is_minted = true',
backend/services/blockchain-service//src/queues/mintQueue.js:107:    async updateTicketStatus(ticketId, status) {
backend/services/blockchain-service//src/queues/mintQueue.js:109:            'UPDATE tickets SET status = $1 WHERE id = $2',
backend/services/blockchain-service//src/queues/mintQueue.js:117:            'SELECT id FROM queue_jobs WHERE job_id = $1',
backend/services/blockchain-service//src/queues/mintQueue.js:122:            // Update existing
backend/services/blockchain-service//src/queues/mintQueue.js:124:                'UPDATE queue_jobs SET status = $1 WHERE job_id = $2',
backend/services/blockchain-service//src/queues/mintQueue.js:130:                INSERT INTO queue_jobs (
backend/services/blockchain-service//src/queues/mintQueue.js:144:    async updateJobRecord(jobId, status, result = null, error = null) {
backend/services/blockchain-service//src/queues/mintQueue.js:148:            UPDATE queue_jobs 
backend/services/blockchain-service//src/queues/mintQueue.js:175:            INSERT INTO blockchain_transactions (
backend/services/blockchain-service//src/queues/mintQueue.js:193:    async updateTicketAsMinted(ticketId, mintResult) {
backend/services/blockchain-service//src/queues/mintQueue.js:195:            UPDATE tickets 
backend/services/blockchain-service//src/controllers/compliance/compliance.controller.ts:162:      lastUpdated: '2025-08-10',
backend/services/blockchain-service//src/services/compliance/fee-transparency.service.ts:26:  lastUpdated: Date;
backend/services/blockchain-service//src/services/compliance/fee-transparency.service.ts:102:        lastUpdated: new Date()
backend/services/blockchain-service//src/services/compliance/fee-transparency.service.ts:114:      lastUpdated: policy.updated_at
backend/services/blockchain-service//src/services/compliance/fee-transparency.service.ts:152:      .select(
backend/services/blockchain-service//src/services/compliance/fee-transparency.service.ts:164:      .select(
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:58:      // Update status
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:61:        .update({ status: 'processing' });
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:72:      // Update request
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:75:        .update({
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:90:        .update({
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:106:      .select('id', 'email', 'name', 'phone', 'created_at', 'last_login')
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:112:      .select('id', 'event_id', 'ticket_count', 'total_amount', 'status', 'created_at');
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:117:      .select('id', 'event_id', 'seat_number', 'price', 'status', 'created_at');
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:122:      .select('mint_address', 'metadata', 'created_at');
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:128:      .select('id', 'ticket_id', 'price', 'status', 'created_at');
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:133:      .select(
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:144:      .select('id', 'type', 'channel', 'status', 'created_at');
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:149:      .select('channel', 'type', 'granted', 'granted_at', 'revoked_at');
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:155:      .select('action', 'ip_address', 'user_agent', 'created_at')
backend/services/blockchain-service//src/workers/mint-worker.js:92:          SELECT * FROM mint_jobs 
backend/services/blockchain-service//src/workers/mint-worker.js:115:      // FIXED: Update database using proper join through order_items table
backend/services/blockchain-service//src/workers/mint-worker.js:117:        UPDATE tickets t
backend/services/blockchain-service//src/workers/mint-worker.js:126:      // Update mint job status if it exists
backend/services/blockchain-service//src/workers/mint-worker.js:129:          UPDATE mint_jobs 
backend/services/blockchain-service//src/workers/mint-worker.js:132:              updated_at = NOW()
backend/services/blockchain-service//src/workers/mint-worker.js:149:      // Update mint job status to failed if it exists
backend/services/blockchain-service//src/workers/mint-worker.js:152:          UPDATE mint_jobs 
backend/services/blockchain-service//src/workers/mint-worker.js:155:              updated_at = NOW()

### All JOIN operations:
backend/services/blockchain-service//src/wallets/treasury.js:18:            const walletPath = path.join(__dirname, '../../.wallet/treasury.json');
backend/services/blockchain-service//src/wallets/feeManager.js:97:        return lines.join('\n');
backend/services/blockchain-service//src/index.js:11:const ServiceBootstrap = require(path.join(__dirname, '../../../shared/src/service-bootstrap'));
backend/services/blockchain-service//src/services/compliance/privacy-export.service.ts:167:    const filepath = path.join(this.exportPath, filename);
backend/services/blockchain-service//src/workers/mint-worker.js:115:      // FIXED: Update database using proper join through order_items table

### All WHERE clauses:
backend/services/blockchain-service//src/wallets/userWallet.js:28:                'SELECT * FROM wallet_addresses WHERE user_id = $1 AND wallet_address = $2',
backend/services/blockchain-service//src/wallets/userWallet.js:40:                    WHERE user_id = $1 AND wallet_address = $2
backend/services/blockchain-service//src/wallets/userWallet.js:47:                    WHERE user_id = $1 AND wallet_address != $2
backend/services/blockchain-service//src/wallets/userWallet.js:61:                WHERE user_id = $1
backend/services/blockchain-service//src/wallets/userWallet.js:114:            WHERE user_id = $1 
backend/services/blockchain-service//src/wallets/userWallet.js:124:            WHERE user_id = $1 AND is_primary = true
backend/services/blockchain-service//src/wallets/userWallet.js:134:            WHERE user_id = $1 AND wallet_address = $2
backend/services/blockchain-service//src/wallets/userWallet.js:143:            WHERE user_id = $1 AND wallet_address = $2
backend/services/blockchain-service//src/wallets/userWallet.js:153:            WHERE user_id = $1 AND wallet_address = $2
backend/services/blockchain-service//src/listeners/transactionMonitor.js:83:            WHERE id = $4 OR metadata->>'signature' = $4
backend/services/blockchain-service//src/listeners/transactionMonitor.js:93:                WHERE id = $1
backend/services/blockchain-service//src/listeners/transactionMonitor.js:99:                WHERE ticket_id = $1 AND job_type = 'MINT'
backend/services/blockchain-service//src/listeners/transactionMonitor.js:106:                WHERE id = $1
backend/services/blockchain-service//src/listeners/transactionMonitor.js:112:                WHERE ticket_id = $1 AND job_type = 'MINT'
backend/services/blockchain-service//src/listeners/programListener.js:129:                WHERE id = $2
backend/services/blockchain-service//src/queues/mintQueue.js:92:            'SELECT token_id, mint_transaction_id FROM tickets WHERE id = $1 AND is_minted = true',
backend/services/blockchain-service//src/queues/mintQueue.js:109:            'UPDATE tickets SET status = $1 WHERE id = $2',
backend/services/blockchain-service//src/queues/mintQueue.js:117:            'SELECT id FROM queue_jobs WHERE job_id = $1',
backend/services/blockchain-service//src/queues/mintQueue.js:124:                'UPDATE queue_jobs SET status = $1 WHERE job_id = $2',
backend/services/blockchain-service//src/queues/mintQueue.js:155:            WHERE job_id = $4
backend/services/blockchain-service//src/queues/mintQueue.js:202:            WHERE id = $3
backend/services/blockchain-service//src/workers/mint-worker.js:93:          WHERE status = 'pending' 
backend/services/blockchain-service//src/workers/mint-worker.js:120:        WHERE t.id = oi.ticket_id 
backend/services/blockchain-service//src/workers/mint-worker.js:133:          WHERE id = $2
backend/services/blockchain-service//src/workers/mint-worker.js:156:          WHERE id = $2

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken',
  pool: {
    min: 2,
    max: 10
  }
});
```
### .env.example
```
# ================================================
# BLOCKCHAIN-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: blockchain-service
# Port: 3015
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=blockchain-service           # Service identifier

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== REQUIRED: Solana Configuration ====
SOLANA_RPC_URL=https://api.devnet.solana.com   # Solana RPC endpoint
SOLANA_NETWORK=devnet                          # devnet | testnet | mainnet-beta
SOLANA_PROGRAM_ID=<PROGRAM_ID>                 # Deployed program ID
SOLANA_WALLET_PRIVATE_KEY=<WALLET_KEY>         # Service wallet private key

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/compliance/fee-transparency.service.ts
```typescript
import { db } from '../../config/database';
import { logger } from '../../utils/logger';

interface FeeBreakdown {
  basePrice: number;
  platformFee: number;
  platformFeePercent: number;
  venueFee: number;
  venueFeePercent: number;
  paymentProcessingFee: number;
  paymentProcessingPercent: number;
  taxAmount: number;
  taxPercent: number;
  totalPrice: number;
  currency: string;
}

interface VenueFeePolicy {
  venueId: string;
  venueName: string;
  baseFeePercent: number;
  serviceFeePercent: number;
  resaleFeePercent: number;
  maxResalePrice?: number;
  effectiveDate: Date;
  lastUpdated: Date;
}

export class FeeTransparencyService {
  /**
   * Calculate complete fee breakdown for a ticket purchase
   */
  async calculateFeeBreakdown(
    basePrice: number,
    venueId: string,
    isResale: boolean = false,
    location?: string
  ): Promise<FeeBreakdown> {
    try {
      // Get venue fee policy
      const venuePolicy = await this.getVenueFeePolicy(venueId);
      
      // Platform fees (TicketToken's cut)
      const platformFeePercent = isResale ? 2.5 : 3.5; // Lower for resales
      const platformFee = Math.round(basePrice * platformFeePercent / 100);
      
      // Venue fees
      const venueFeePercent = isResale ? 
        venuePolicy.resaleFeePercent : 
        venuePolicy.baseFeePercent;
      const venueFee = Math.round(basePrice * venueFeePercent / 100);
      
      // Payment processing (Stripe/Square)
      const paymentProcessingPercent = 2.9; // + $0.30 typically
      const paymentProcessingFee = Math.round(basePrice * paymentProcessingPercent / 100) + 30;
      
      // Tax calculation (simplified - would use real tax API)
      const taxPercent = this.getTaxRate(location);
      const subtotal = basePrice + platformFee + venueFee + paymentProcessingFee;
      const taxAmount = Math.round(subtotal * taxPercent / 100);
      
      // Total
      const totalPrice = subtotal + taxAmount;
      
      return {
        basePrice,
        platformFee,
        platformFeePercent,
        venueFee,
        venueFeePercent,
        paymentProcessingFee,
        paymentProcessingPercent,
        taxAmount,
        taxPercent,
        totalPrice,
        currency: 'USD'
      };
      
    } catch (error) {
      logger.error('Failed to calculate fee breakdown:', error);
      throw error;
    }
  }

  /**
   * Get venue fee policy
   */
  async getVenueFeePolicy(venueId: string): Promise<VenueFeePolicy> {
    const policy = await db('venue_fee_policies')
      .where({ venue_id: venueId, active: true })
      .first();
    
    if (!policy) {
      // Return default policy
      return {
        venueId,
        venueName: 'Venue',
        baseFeePercent: 5.0,
        serviceFeePercent: 2.5,
        resaleFeePercent: 5.0,
        effectiveDate: new Date(),
        lastUpdated: new Date()
      };
    }
    
    return {
      venueId: policy.venue_id,
      venueName: policy.venue_name,
      baseFeePercent: parseFloat(policy.base_fee_percent),
      serviceFeePercent: parseFloat(policy.service_fee_percent),
      resaleFeePercent: parseFloat(policy.resale_fee_percent),
      maxResalePrice: policy.max_resale_price,
      effectiveDate: policy.effective_date,
      lastUpdated: policy.updated_at
    };
  }

  /**
   * Get all fees for a specific order
   */
  async getOrderFees(orderId: string): Promise<any> {
    const fees = await db('order_fees')
      .where({ order_id: orderId })
      .first();
    
    if (!fees) {
      throw new Error('Order fees not found');
    }
    
    return {
      orderId,
      breakdown: {
        tickets: fees.base_amount / 100,
        platformFee: fees.platform_fee / 100,
        venueFee: fees.venue_fee / 100,
        processingFee: fees.processing_fee / 100,
        tax: fees.tax_amount / 100,
        total: fees.total_amount / 100
      },
      currency: fees.currency,
      paidAt: fees.created_at
    };
  }

  /**
   * Generate fee report for venue
   */
  async generateVenueFeeReport(venueId: string, startDate: Date, endDate: Date): Promise<any> {
    const report = await db('order_fees')
      .where({ venue_id: venueId })
      .whereBetween('created_at', [startDate, endDate])
      .select(
        db.raw('SUM(base_amount) as total_sales'),
        db.raw('SUM(venue_fee) as total_venue_fees'),
        db.raw('SUM(platform_fee) as total_platform_fees'),
        db.raw('COUNT(*) as transaction_count'),
        db.raw('AVG(venue_fee) as avg_venue_fee')
      )
      .first();
    
    const breakdown = await db('order_fees')
      .where({ venue_id: venueId })
      .whereBetween('created_at', [startDate, endDate])
      .select(
        db.raw('DATE(created_at) as date'),
        db.raw('SUM(venue_fee) as daily_fees'),
        db.raw('COUNT(*) as transactions')
      )
      .groupBy(db.raw('DATE(created_at)'))
      .orderBy('date', 'asc');
    
    return {
      venueId,
      period: {
        start: startDate,
        end: endDate
      },
      summary: {
        totalSales: (report.total_sales || 0) / 100,
        totalVenueFees: (report.total_venue_fees || 0) / 100,
        totalPlatformFees: (report.total_platform_fees || 0) / 100,
        transactionCount: report.transaction_count || 0,
        averageFeePerTransaction: (report.avg_venue_fee || 0) / 100
      },
      dailyBreakdown: breakdown.map((day: any) => ({
        date: day.date,
        fees: day.daily_fees / 100,
        transactions: day.transactions
      }))
    };
  }

  /**
   * Get tax rate based on location (simplified)
   */
  private getTaxRate(location?: string): number {
    // In production, would use a real tax API like TaxJar
    const taxRates: Record<string, number> = {
      'CA': 8.5,
      'NY': 8.0,
      'TX': 6.25,
      'FL': 6.0,
      'WA': 6.5
    };
    
    return taxRates[location || 'NY'] || 7.0;
  }
}

export const feeTransparencyService = new FeeTransparencyService();
```

### FILE: src/services/compliance/privacy-export.service.ts
```typescript
import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import crypto from 'crypto';

interface UserDataExport {
  requestId: string;
  userId: string;
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class PrivacyExportService {
  private exportPath = process.env.EXPORT_PATH || '/tmp/exports';

  /**
   * Request full data export for GDPR/CCPA compliance
   */
  async requestDataExport(userId: string, reason: string): Promise<UserDataExport> {
    try {
      const requestId = crypto.randomUUID();
      
      // Store export request
      await db('privacy_export_requests').insert({
        id: requestId,
        user_id: userId,
        reason,
        status: 'pending',
        requested_at: new Date()
      });
      
      // Queue for processing (async)
      this.processExportAsync(requestId, userId);
      
      return {
        requestId,
        userId,
        requestedAt: new Date(),
        status: 'pending'
      };
      
    } catch (error) {
      logger.error('Failed to create export request:', error);
      throw error;
    }
  }

  /**
   * Process data export asynchronously
   */
  private async processExportAsync(requestId: string, userId: string): Promise<void> {
    try {
      // Update status
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({ status: 'processing' });
      
      // Collect all user data
      const userData = await this.collectUserData(userId);
      
      // Create export file
      const exportFile = await this.createExportArchive(userId, userData);
      
      // Generate secure download URL
      const downloadUrl = await this.generateDownloadUrl(exportFile);
      
      // Update request
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'completed',
          completed_at: new Date(),
          download_url: downloadUrl,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });
      
      // Send notification to user
      await this.notifyUserExportReady(userId, downloadUrl);
      
    } catch (error) {
      logger.error('Export processing failed:', error);
      
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'failed',
          error_message: (error as Error).message
        });
    }
  }

  /**
   * Collect all user data from various tables
   */
  private async collectUserData(userId: string): Promise<any> {
    const data: any = {};
    
    // Profile data
    data.profile = await db('users')
      .where({ id: userId })
      .select('id', 'email', 'name', 'phone', 'created_at', 'last_login')
      .first();
    
    // Purchase history
    data.purchases = await db('orders')
      .where({ customer_id: userId })
      .select('id', 'event_id', 'ticket_count', 'total_amount', 'status', 'created_at');
    
    // Tickets owned
    data.tickets = await db('tickets')
      .where({ owner_id: userId })
      .select('id', 'event_id', 'seat_number', 'price', 'status', 'created_at');
    
    // NFTs
    data.nfts = await db('nft_mints')
      .where({ owner_address: userId })
      .select('mint_address', 'metadata', 'created_at');
    
    // Marketplace activity
    data.listings = await db('marketplace_listings')
      .where({ seller_id: userId })
      .orWhere({ buyer_id: userId })
      .select('id', 'ticket_id', 'price', 'status', 'created_at');
    
    // Payment methods (masked)
    data.paymentMethods = await db('payment_methods')
      .where({ user_id: userId })
      .select(
        'id',
        'type',
        db.raw('RIGHT(card_last4, 4) as last4'),
        'card_brand',
        'created_at'
      );
    
    // Notifications
    data.notifications = await db('notifications')
      .where({ recipient_id: userId })
      .select('id', 'type', 'channel', 'status', 'created_at');
    
    // Consent records
    data.consent = await db('consent')
      .where({ customer_id: userId })
      .select('channel', 'type', 'granted', 'granted_at', 'revoked_at');
    
    // Activity logs (last 90 days)
    data.activityLogs = await db('activity_logs')
      .where({ user_id: userId })
      .where('created_at', '>', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
      .select('action', 'ip_address', 'user_agent', 'created_at')
      .limit(1000);
    
    return data;
  }

  /**
   * Create ZIP archive of user data
   */
  private async createExportArchive(userId: string, data: any): Promise<string> {
    const timestamp = Date.now();
    const filename = `user_data_export_${userId}_${timestamp}.zip`;
    const filepath = path.join(this.exportPath, filename);
    
    // Ensure export directory exists
    if (!fs.existsSync(this.exportPath)) {
      fs.mkdirSync(this.exportPath, { recursive: true });
    }
    
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filepath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      
      output.on('close', () => {
        logger.info(`Export created: ${filepath} (${archive.pointer()} bytes)`);
        resolve(filepath);
      });
      
      archive.on('error', reject);
      archive.pipe(output);
      
      // Add JSON files
      archive.append(JSON.stringify(data.profile, null, 2), { name: 'profile.json' });
      archive.append(JSON.stringify(data.purchases, null, 2), { name: 'purchases.json' });
      archive.append(JSON.stringify(data.tickets, null, 2), { name: 'tickets.json' });
      archive.append(JSON.stringify(data.nfts, null, 2), { name: 'nfts.json' });
      archive.append(JSON.stringify(data.listings, null, 2), { name: 'marketplace.json' });
      archive.append(JSON.stringify(data.paymentMethods, null, 2), { name: 'payment_methods.json' });
      archive.append(JSON.stringify(data.notifications, null, 2), { name: 'notifications.json' });
      archive.append(JSON.stringify(data.consent, null, 2), { name: 'consent.json' });
      archive.append(JSON.stringify(data.activityLogs, null, 2), { name: 'activity_logs.json' });
      
      // Add README
      archive.append(this.generateReadme(userId), { name: 'README.txt' });
      
      archive.finalize();
    });
  }

  /**
   * Generate README for export
   */
  private generateReadme(userId: string): string {
    return `TicketToken Data Export
========================
User ID: ${userId}
Export Date: ${new Date().toISOString()}

This archive contains all personal data associated with your TicketToken account.

Files included:
- profile.json: Your account information
- purchases.json: Order history
- tickets.json: Tickets you own
- nfts.json: NFT tickets on blockchain
- marketplace.json: Marketplace activity
- payment_methods.json: Payment methods (masked)
- notifications.json: Notification history
- consent.json: Privacy consent records
- activity_logs.json: Recent account activity

This export is provided in compliance with GDPR Article 20 (Right to Data Portability)
and CCPA regulations.

For questions, contact: privacy@tickettoken.com`;
  }

  /**
   * Request account deletion
   */
  async requestAccountDeletion(userId: string, reason: string): Promise<any> {
    try {
      const requestId = crypto.randomUUID();
      
      // Store deletion request
      await db('account_deletion_requests').insert({
        id: requestId,
        user_id: userId,
        reason,
        status: 'pending',
        requested_at: new Date(),
        scheduled_for: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      });
      
      // Send confirmation email
      await this.sendDeletionConfirmation(userId, requestId);
      
      return {
        requestId,
        message: 'Account deletion scheduled',
        scheduledFor: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        canCancelUntil: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000)
      };
      
    } catch (error) {
      logger.error('Failed to create deletion request:', error);
      throw error;
    }
  }

  /**
   * Generate secure download URL
   */
  private async generateDownloadUrl(filepath: string): Promise<string> {
    // In production, would upload to S3 and return signed URL
    // For now, return local path
    return `/exports/${path.basename(filepath)}`;
  }

  /**
   * Notify user that export is ready
   */
  private async notifyUserExportReady(userId: string, downloadUrl: string): Promise<void> {
    // Would send email notification
    logger.info(`Export ready for user ${userId}: ${downloadUrl}`);
  }

  /**
   * Send deletion confirmation
   */
  private async sendDeletionConfirmation(userId: string, requestId: string): Promise<void> {
    // Would send email with cancellation link
    logger.info(`Deletion requested for user ${userId}: ${requestId}`);
  }
}

export const privacyExportService = new PrivacyExportService();
```

