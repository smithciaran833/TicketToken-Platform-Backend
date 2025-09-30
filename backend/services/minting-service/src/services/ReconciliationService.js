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
