# COMPLETE DATABASE ANALYSIS: minting-service
Generated: Thu Oct  2 15:07:51 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/health.routes.ts
```typescript
import { Router } from 'express';

const router = Router();

// Basic health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'minting-service' });
});

// Database health check
router.get('/health/db', async (req, res) => {
  try {
    // Import the appropriate database connection for this service
    const { pool } = require('../config/database');
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'minting-service' 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: (error as Error).message || "Unknown error",
      service: 'minting-service'
    });
  }
});

export default router;
```

### FILE: src/config/database.js
```typescript
const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool;

async function initializeDatabase() {
  pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'TicketToken2024Secure!',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('✅ Database connected:', result.rows[0].now);
    return pool;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

module.exports = {
  initializeDatabase,
  getPool
};
```

### FILE: src/config/database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: { min: 2, max: 10 }
});

export default db;
```

### FILE: src/models/Collection.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface ICollection {
  id?: string;
  name: string;
  symbol: string;
  contract_address: string;
  blockchain: string;
  max_supply?: number;
  current_supply?: number;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class CollectionModel {
  private db: Knex;
  private tableName = 'collections';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ICollection): Promise<ICollection> {
    const [collection] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return collection;
  }

  async findById(id: string): Promise<ICollection | null> {
    const collection = await this.db(this.tableName)
      .where({ id })
      .first();
    return collection || null;
  }

  async findByContract(contractAddress: string): Promise<ICollection | null> {
    return this.db(this.tableName)
      .where({ contract_address: contractAddress })
      .first();
  }

  async update(id: string, data: Partial<ICollection>): Promise<ICollection | null> {
    const [collection] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return collection || null;
  }

  async incrementSupply(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .increment('current_supply', 1);
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default CollectionModel;
```

### FILE: src/models/Mint.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IMint {
  id?: string;
  ticket_id: string;
  nft_id?: string;
  status: 'pending' | 'minting' | 'completed' | 'failed';
  transaction_hash?: string;
  blockchain: string;
  error?: string;
  retry_count?: number;
  created_at?: Date;
  completed_at?: Date;
}

export class MintModel {
  private db: Knex;
  private tableName = 'mints';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IMint): Promise<IMint> {
    const [mint] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return mint;
  }

  async findById(id: string): Promise<IMint | null> {
    const mint = await this.db(this.tableName)
      .where({ id })
      .first();
    return mint || null;
  }

  async findPending(limit = 10): Promise<IMint[]> {
    return this.db(this.tableName)
      .where({ status: 'pending' })
      .where('retry_count', '<', 3)
      .orderBy('created_at', 'asc')
      .limit(limit);
  }

  async update(id: string, data: Partial<IMint>): Promise<IMint | null> {
    const [mint] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return mint || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default MintModel;
```

### FILE: src/models/NFT.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface INFT {
  id?: string;
  token_id: string;
  contract_address: string;
  owner_address: string;
  metadata_uri?: string;
  metadata?: any;
  blockchain: string;
  created_at?: Date;
  updated_at?: Date;
}

export class NFTModel {
  private db: Knex;
  private tableName = 'nfts';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: INFT): Promise<INFT> {
    const [nft] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return nft;
  }

  async findById(id: string): Promise<INFT | null> {
    const nft = await this.db(this.tableName)
      .where({ id })
      .first();
    return nft || null;
  }

  async findByTokenId(tokenId: string, contractAddress: string): Promise<INFT | null> {
    return this.db(this.tableName)
      .where({ token_id: tokenId, contract_address: contractAddress })
      .first();
  }

  async findByOwner(ownerAddress: string): Promise<INFT[]> {
    return this.db(this.tableName)
      .where({ owner_address: ownerAddress })
      .orderBy('created_at', 'desc');
  }

  async update(id: string, data: Partial<INFT>): Promise<INFT | null> {
    const [nft] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return nft || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default NFTModel;
```

### FILE: src/services/ReconciliationService.js
```typescript
const { Connection, PublicKey } = require('@solana/web3.js');
const { getPool } = require('../config/database');
const logger = require('../utils/logger');

class ReconciliationService {
  constructor() {
    this.connection = null;
    this.reconcileInterval = 60000; // 1 minute
    this.reasonCodes = {
      MINT_MISSING: 'mint_missing',
      METADATA_MISMATCH: 'metadata_mismatch',
      CHAIN_ORPHANED: 'chain_orphaned',
      DB_ORPHANED: 'db_orphaned',
      SUCCESS: 'success'
    };
  }

  async initialize() {
    this.connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    logger.info('🔄 Reconciliation service initialized');
  }

  async start() {
    await this.initialize();
    
    // Run initial reconciliation
    await this.reconcile();
    
    // Schedule periodic reconciliation
    setInterval(() => {
      this.reconcile().catch(err => {
        logger.error('Reconciliation failed:', err);
      });
    }, this.reconcileInterval);
  }

  async reconcile() {
    logger.info('🔍 Starting reconciliation...');
    
    const startTime = Date.now();
    const report = {
      timestamp: new Date().toISOString(),
      dbToChain: [],
      chainToDb: [],
      mismatches: [],
      success: []
    };
    
    try {
      // 1. DB → Chain reconciliation
      await this.reconcileDbToChain(report);
      
      // 2. Chain → DB reconciliation  
      await this.reconcileChainToDb(report);
      
      // 3. Save reconciliation report
      await this.saveReport(report);
      
      const duration = Date.now() - startTime;
      logger.info(`✅ Reconciliation complete in ${duration}ms`);
      logger.info(`   DB→Chain issues: ${report.dbToChain.length}`);
      logger.info(`   Chain→DB issues: ${report.chainToDb.length}`);
      logger.info(`   Mismatches: ${report.mismatches.length}`);
      
    } catch (error) {
      logger.error('Reconciliation error:', error);
      throw error;
    }
  }

  async reconcileDbToChain(report) {
    const pool = getPool();
    
    // Get all mints from database
    const dbMints = await pool.query(`
      SELECT 
        ticket_id,
        transaction_signature,
        mint_address,
        merkle_tree,
        status,
        created_at
      FROM nft_mints
      WHERE status = 'completed'
      ORDER BY created_at DESC
      LIMIT 1000
    `);
    
    for (const mint of dbMints.rows) {
      try {
        // Check if transaction exists on chain
        const tx = await this.connection.getTransaction(
          mint.transaction_signature,
          { commitment: 'confirmed' }
        );
        
        if (!tx) {
          // Transaction not found on chain
          report.dbToChain.push({
            ticketId: mint.ticket_id,
            reasonCode: this.reasonCodes.MINT_MISSING,
            signature: mint.transaction_signature,
            details: 'Transaction not found on chain'
          });
          
          // Update database status
          await pool.query(
            `UPDATE nft_mints 
             SET status = 'missing_on_chain', 
                 updated_at = NOW() 
             WHERE ticket_id = $1`,
            [mint.ticket_id]
          );
        } else {
          // Transaction found - verify it succeeded
          if (tx.meta?.err) {
            report.mismatches.push({
              ticketId: mint.ticket_id,
              reasonCode: 'transaction_failed',
              signature: mint.transaction_signature,
              error: tx.meta.err
            });
          } else {
            report.success.push({
              ticketId: mint.ticket_id,
              reasonCode: this.reasonCodes.SUCCESS
            });
          }
        }
      } catch (error) {
        logger.error(`Error checking ticket ${mint.ticket_id}:`, error);
      }
    }
  }

  async reconcileChainToDb(report) {
    // This would query the merkle tree for all NFTs
    // and check if they exist in the database
    // For now, this is a placeholder
    
    logger.info('Chain→DB reconciliation: Checking merkle tree events...');
    
    // In production, you would:
    // 1. Query the merkle tree account
    // 2. Get all mint events
    // 3. Check each exists in database
    // 4. Report orphaned on-chain mints
  }

  async saveReport(report) {
    const pool = getPool();
    
    // Create reconciliation reports table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reconciliation_reports (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT NOW(),
        report_data JSONB,
        db_to_chain_count INTEGER,
        chain_to_db_count INTEGER,
        mismatch_count INTEGER,
        success_count INTEGER
      )
    `);
    
    // Save report
    await pool.query(`
      INSERT INTO reconciliation_reports (
        report_data,
        db_to_chain_count,
        chain_to_db_count,
        mismatch_count,
        success_count
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      JSON.stringify(report),
      report.dbToChain.length,
      report.chainToDb.length,
      report.mismatches.length,
      report.success.length
    ]);
  }
}

module.exports = { ReconciliationService };
```

### FILE: src/services/MintingOrchestrator.js
```typescript
const { getConnection, getWallet, getProgramId } = require('../config/solana');
const { getPool } = require('../config/database');
const { uploadToIPFS } = require('./MetadataService');
const { 
  Transaction, 
  SystemProgram,
  PublicKey,
  Keypair,
  ComputeBudgetProgram 
} = require('@solana/web3.js');
const bs58 = require('bs58');
const logger = require('../utils/logger');

class MintingOrchestrator {
  constructor() {
    this.connection = null;
    this.wallet = null;
    this.programId = null;
    this.maxRetries = 3;
    this.baseDelay = 2000;
  }

  async mintCompressedNFT(ticketData) {
    this.connection = getConnection();
    this.wallet = getWallet();
    this.programId = getProgramId();
    
    const { ticketId, orderId, eventId, metadata } = ticketData;
    
    logger.info(`🎨 Starting compressed NFT mint for ticket ${ticketId}`);
    
    try {
      // 1. Prepare metadata
      const metadataUri = await this.prepareMetadata(ticketData);
      
      // 2. Create mint transaction
      const mintTx = await this.createMintTransaction(ticketData, metadataUri);
      
      // 3. Send transaction with retries
      const signature = await this.sendWithRetry(mintTx);
      
      // 4. Save to database
      await this.saveMintRecord({
        ticketId,
        signature,
        mintAddress: mintTx.mintAddress,
        metadataUri
      });
      
      // 5. Update ticket status to SOLD (valid status)
      // await this.updateTicketStatus(ticketId, 'SOLD');
      
      logger.info(`✅ Mint successful for ticket ${ticketId}: ${signature}`);
      
      return {
        success: true,
        ticketId,
        signature,
        mintAddress: mintTx.mintAddress,
        metadataUri
      };
    } catch (error) {
      logger.error(`❌ Mint failed for ticket ${ticketId}:`, error);
      throw error;
    }
  }

  async prepareMetadata(ticketData) {
    const metadata = {
      name: `Ticket #${ticketData.ticketId}`,
      symbol: 'TCKT',
      description: `Event ticket for ${ticketData.metadata?.eventName || 'Event'}`,
      image: ticketData.metadata?.image || 'https://placeholder.com/ticket.png',
      attributes: [
        { trait_type: 'Event ID', value: ticketData.eventId },
        { trait_type: 'Order ID', value: ticketData.orderId },
        { trait_type: 'Ticket ID', value: ticketData.ticketId },
        { trait_type: 'Issue Date', value: new Date().toISOString() }
      ],
      properties: {
        files: [],
        category: 'ticket'
      }
    };
    
    // For now, return a mock URI - implement IPFS upload later
    return `https://ipfs.io/ipfs/mock-${ticketData.ticketId}`;
  }

  async createMintTransaction(ticketData, metadataUri) {
    // This is a simplified version - adapt to your Solana program
    const transaction = new Transaction();
    
    // Add compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })
    );
    
    // Mock mint address for now
    const mintAddress = Keypair.generate().publicKey;
    
    // In production, add your actual mint instruction here
    // transaction.add(yourMintInstruction);
    
    return { 
      transaction, 
      mintAddress: mintAddress.toString() 
    };
  }

  async sendWithRetry(mintTx) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(`📤 Sending transaction (attempt ${attempt}/${this.maxRetries})`);
        
        // For now, return a mock signature
        // In production: const signature = await this.connection.sendTransaction(mintTx.transaction);
        const mockSignature = bs58.encode(Buffer.from(`mock-sig-${Date.now()}`));
        
        logger.info(`✅ Transaction sent: ${mockSignature}`);
        return mockSignature;
        
      } catch (error) {
        lastError = error;
        logger.error(`❌ Attempt ${attempt} failed:`, error.message);
        
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          logger.info(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw new Error(`Failed after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  async saveMintRecord(mintData) {
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // First check if the table exists, if not create it
      await client.query(`
        CREATE TABLE IF NOT EXISTS nft_mints (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          ticket_id VARCHAR(255) UNIQUE NOT NULL,
          transaction_signature VARCHAR(255),
          mint_address VARCHAR(255),
          metadata_uri TEXT,
          merkle_tree VARCHAR(255),
          retry_count INTEGER DEFAULT 0,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      const query = `
        INSERT INTO nft_mints (
          ticket_id,
          transaction_signature,
          mint_address,
          metadata_uri,
          status,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (ticket_id)
        DO UPDATE SET
          transaction_signature = EXCLUDED.transaction_signature,
          mint_address = EXCLUDED.mint_address,
          metadata_uri = EXCLUDED.metadata_uri,
          status = EXCLUDED.status,
          updated_at = NOW()
      `;

      await client.query(query, [
        mintData.ticketId,
        mintData.signature,
        mintData.mintAddress,
        mintData.metadataUri,
        'completed'
      ]);
      
      // UPDATE tickets table with asset_id (WP-14 requirement)
      await client.query(`
        UPDATE tickets
        SET
          mint_address = $1,
          
          blockchain_status = 'minted',
          
          updated_at = NOW()
        WHERE id = $2::uuid
      `, [mintData.mintAddress, mintData.ticketId]);
      
      await client.query('COMMIT');
      logger.info(`💾 Saved mint record for ticket ${mintData.ticketId}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Failed to save mint record: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }
  async updateTicketStatus(ticketId, status) {
    const pool = getPool();
    
    // Check if ticket exists first - handle both UUID and string ticket IDs
    const checkQuery = `
      SELECT id 
      FROM tickets 
      WHERE id::text = $1 OR ticket_number = $1
    `;
    const checkResult = await pool.query(checkQuery, [ticketId]);
    
    if (checkResult.rows.length === 0) {
      logger.warn(`⚠️ Ticket ${ticketId} not found in database - creating mock entry`);
      
      // For testing, create a mock ticket with proper UUID and valid status
      // First check if ticketId looks like a UUID
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId);
      
      if (!isUUID) {
        // Create with generated UUID and use ticketId as ticket_number
        await pool.query(`
          INSERT INTO tickets (id, ticket_number, status, created_at)
          VALUES (gen_random_uuid(), $1, $2, NOW())
          ON CONFLICT (ticket_number) DO NOTHING
        `, [ticketId, status]);
      } else {
        // Use ticketId as UUID
        await pool.query(`
          INSERT INTO tickets (id, ticket_number, status, created_at)
          VALUES ($1::uuid, $1, $2, NOW())
          ON CONFLICT (id) DO NOTHING
        `, [ticketId, status]);
      }
      return;
    }
    
    // Update existing ticket with proper type casting
    const query = `
      UPDATE tickets 
      SET 
        
        status = $2,
        updated_at = NOW()
      WHERE id::text = $1 OR ticket_number = $1
    `;
    
    await pool.query(query, [ticketId, status]);
    logger.info(`📝 Updated ticket ${ticketId} status to ${status}`);
  }
}

module.exports = { MintingOrchestrator };
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/models/Collection.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface ICollection {
  id?: string;
  name: string;
  symbol: string;
  contract_address: string;
  blockchain: string;
  max_supply?: number;
  current_supply?: number;
  metadata?: any;
  created_at?: Date;
  updated_at?: Date;
}

export class CollectionModel {
  private db: Knex;
  private tableName = 'collections';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: ICollection): Promise<ICollection> {
    const [collection] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return collection;
  }

  async findById(id: string): Promise<ICollection | null> {
    const collection = await this.db(this.tableName)
      .where({ id })
      .first();
    return collection || null;
  }

  async findByContract(contractAddress: string): Promise<ICollection | null> {
    return this.db(this.tableName)
      .where({ contract_address: contractAddress })
      .first();
  }

  async update(id: string, data: Partial<ICollection>): Promise<ICollection | null> {
    const [collection] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return collection || null;
  }

  async incrementSupply(id: string): Promise<boolean> {
    const result = await this.db(this.tableName)
      .where({ id })
      .increment('current_supply', 1);
    return result > 0;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default CollectionModel;
```

### FILE: src/models/Mint.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface IMint {
  id?: string;
  ticket_id: string;
  nft_id?: string;
  status: 'pending' | 'minting' | 'completed' | 'failed';
  transaction_hash?: string;
  blockchain: string;
  error?: string;
  retry_count?: number;
  created_at?: Date;
  completed_at?: Date;
}

export class MintModel {
  private db: Knex;
  private tableName = 'mints';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: IMint): Promise<IMint> {
    const [mint] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return mint;
  }

  async findById(id: string): Promise<IMint | null> {
    const mint = await this.db(this.tableName)
      .where({ id })
      .first();
    return mint || null;
  }

  async findPending(limit = 10): Promise<IMint[]> {
    return this.db(this.tableName)
      .where({ status: 'pending' })
      .where('retry_count', '<', 3)
      .orderBy('created_at', 'asc')
      .limit(limit);
  }

  async update(id: string, data: Partial<IMint>): Promise<IMint | null> {
    const [mint] = await this.db(this.tableName)
      .where({ id })
      .update(data)
      .returning('*');
    return mint || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default MintModel;
```

### FILE: src/models/NFT.ts
```typescript
import { Knex } from 'knex';
import { db as knex } from '../config/database';

export interface INFT {
  id?: string;
  token_id: string;
  contract_address: string;
  owner_address: string;
  metadata_uri?: string;
  metadata?: any;
  blockchain: string;
  created_at?: Date;
  updated_at?: Date;
}

export class NFTModel {
  private db: Knex;
  private tableName = 'nfts';

  constructor(db?: Knex) {
    this.db = db || knex;
  }

  async create(data: INFT): Promise<INFT> {
    const [nft] = await this.db(this.tableName)
      .insert(data)
      .returning('*');
    return nft;
  }

  async findById(id: string): Promise<INFT | null> {
    const nft = await this.db(this.tableName)
      .where({ id })
      .first();
    return nft || null;
  }

  async findByTokenId(tokenId: string, contractAddress: string): Promise<INFT | null> {
    return this.db(this.tableName)
      .where({ token_id: tokenId, contract_address: contractAddress })
      .first();
  }

  async findByOwner(ownerAddress: string): Promise<INFT[]> {
    return this.db(this.tableName)
      .where({ owner_address: ownerAddress })
      .orderBy('created_at', 'desc');
  }

  async update(id: string, data: Partial<INFT>): Promise<INFT | null> {
    const [nft] = await this.db(this.tableName)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return nft || null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db(this.tableName)
      .where({ id })
      .del();
    return deleted > 0;
  }
}

export default NFTModel;
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/minting-service//src/routes/health.routes.ts:15:    await pool.query('SELECT 1');
backend/services/minting-service//src/config/database.js:21:    const result = await client.query('SELECT NOW()');
backend/services/minting-service//src/models/Collection.ts:14:  updated_at?: Date;
backend/services/minting-service//src/models/Collection.ts:45:  async update(id: string, data: Partial<ICollection>): Promise<ICollection | null> {
backend/services/minting-service//src/models/Collection.ts:48:      .update({ ...data, updated_at: new Date() })
backend/services/minting-service//src/models/Mint.ts:47:  async update(id: string, data: Partial<IMint>): Promise<IMint | null> {
backend/services/minting-service//src/models/Mint.ts:50:      .update(data)
backend/services/minting-service//src/models/NFT.ts:13:  updated_at?: Date;
backend/services/minting-service//src/models/NFT.ts:50:  async update(id: string, data: Partial<INFT>): Promise<INFT | null> {
backend/services/minting-service//src/models/NFT.ts:53:      .update({ ...data, updated_at: new Date() })
backend/services/minting-service//src/middleware/internal-auth.js:65:      .update(payload)
backend/services/minting-service//src/services/ReconciliationService.js:76:      SELECT 
backend/services/minting-service//src/services/ReconciliationService.js:106:          // Update database status
backend/services/minting-service//src/services/ReconciliationService.js:108:            `UPDATE nft_mints 
backend/services/minting-service//src/services/ReconciliationService.js:110:                 updated_at = NOW() 
backend/services/minting-service//src/services/ReconciliationService.js:168:      INSERT INTO reconciliation_reports (
backend/services/minting-service//src/services/MintingOrchestrator.js:50:      // 5. Update ticket status to SOLD (valid status)
backend/services/minting-service//src/services/MintingOrchestrator.js:51:      // await this.updateTicketStatus(ticketId, 'SOLD');
backend/services/minting-service//src/services/MintingOrchestrator.js:160:          updated_at TIMESTAMP DEFAULT NOW()
backend/services/minting-service//src/services/MintingOrchestrator.js:165:        INSERT INTO nft_mints (
backend/services/minting-service//src/services/MintingOrchestrator.js:174:        DO UPDATE SET
backend/services/minting-service//src/services/MintingOrchestrator.js:179:          updated_at = NOW()
backend/services/minting-service//src/services/MintingOrchestrator.js:190:      // UPDATE tickets table with asset_id (WP-14 requirement)
backend/services/minting-service//src/services/MintingOrchestrator.js:192:        UPDATE tickets
backend/services/minting-service//src/services/MintingOrchestrator.js:198:          updated_at = NOW()
backend/services/minting-service//src/services/MintingOrchestrator.js:213:  async updateTicketStatus(ticketId, status) {
backend/services/minting-service//src/services/MintingOrchestrator.js:218:      SELECT id 
backend/services/minting-service//src/services/MintingOrchestrator.js:234:          INSERT INTO tickets (id, ticket_number, status, created_at)
backend/services/minting-service//src/services/MintingOrchestrator.js:241:          INSERT INTO tickets (id, ticket_number, status, created_at)
backend/services/minting-service//src/services/MintingOrchestrator.js:249:    // Update existing ticket with proper type casting
backend/services/minting-service//src/services/MintingOrchestrator.js:251:      UPDATE tickets 
backend/services/minting-service//src/services/MintingOrchestrator.js:255:        updated_at = NOW()
backend/services/minting-service//src/services/MintingOrchestrator.js:260:    logger.info(`📝 Updated ticket ${ticketId} status to ${status}`);

### All JOIN operations:

### All WHERE clauses:
backend/services/minting-service//src/services/ReconciliationService.js:84:      WHERE status = 'completed'
backend/services/minting-service//src/services/ReconciliationService.js:111:             WHERE ticket_id = $1`,
backend/services/minting-service//src/services/MintingOrchestrator.js:199:        WHERE id = $2::uuid
backend/services/minting-service//src/services/MintingOrchestrator.js:220:      WHERE id::text = $1 OR ticket_number = $1
backend/services/minting-service//src/services/MintingOrchestrator.js:256:      WHERE id::text = $1 OR ticket_number = $1

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  pool: { min: 2, max: 10 }
});

export default db;
```
### .env.example
```
# Service Configuration
NODE_ENV=development
PORT=3000
SERVICE_NAME=service-name

# Database
DATABASE_URL=postgresql://tickettoken:CHANGE_ME@localhost:5432/tickettoken_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=tickettoken
DB_PASSWORD=CHANGE_ME

# Redis
REDIS_URL=redis://:CHANGE_ME@localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME

# RabbitMQ
RABBITMQ_URL=amqp://tickettoken:CHANGE_ME@localhost:5672

# JWT
JWT_SECRET=CHANGE_ME

# Monitoring
PROMETHEUS_PORT=9090
METRICS_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

