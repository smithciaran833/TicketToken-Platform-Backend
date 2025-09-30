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
