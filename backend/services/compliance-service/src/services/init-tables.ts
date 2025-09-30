import { db } from './database.service';

export async function initializeTables() {
  try {
    // Main tables
    const tables = [
      // Venue verifications
      `CREATE TABLE IF NOT EXISTS venue_verifications (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255) NOT NULL UNIQUE,
        ein VARCHAR(20),
        business_name VARCHAR(255),
        business_address TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        verification_id VARCHAR(255) UNIQUE,
        w9_uploaded BOOLEAN DEFAULT false,
        bank_verified BOOLEAN DEFAULT false,
        ofac_cleared BOOLEAN DEFAULT false,
        risk_score INTEGER DEFAULT 0,
        manual_review_required BOOLEAN DEFAULT false,
        manual_review_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Tax records
      `CREATE TABLE IF NOT EXISTS tax_records (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255) NOT NULL,
        year INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        ticket_id VARCHAR(255),
        event_id VARCHAR(255),
        threshold_reached BOOLEAN DEFAULT false,
        form_1099_required BOOLEAN DEFAULT false,
        form_1099_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // OFAC checks
      `CREATE TABLE IF NOT EXISTS ofac_checks (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        name_checked VARCHAR(255),
        is_match BOOLEAN,
        confidence INTEGER,
        matched_name VARCHAR(255),
        reviewed BOOLEAN DEFAULT false,
        review_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Risk assessments
      `CREATE TABLE IF NOT EXISTS risk_assessments (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        risk_score INTEGER,
        factors JSONB,
        recommendation VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Risk flags
      `CREATE TABLE IF NOT EXISTS risk_flags (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        reason TEXT,
        severity VARCHAR(20) DEFAULT 'medium',
        resolved BOOLEAN DEFAULT false,
        resolution TEXT,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Compliance documents
      `CREATE TABLE IF NOT EXISTS compliance_documents (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(255) UNIQUE,
        venue_id VARCHAR(255),
        document_type VARCHAR(50),
        filename VARCHAR(255),
        original_name VARCHAR(255),
        storage_path TEXT,
        s3_url TEXT,
        uploaded_by VARCHAR(255),
        verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Bank verifications
      `CREATE TABLE IF NOT EXISTS bank_verifications (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        account_last_four VARCHAR(4),
        routing_number VARCHAR(20),
        verified BOOLEAN,
        account_name VARCHAR(255),
        account_type VARCHAR(20),
        plaid_request_id VARCHAR(255),
        plaid_item_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Payout methods
      `CREATE TABLE IF NOT EXISTS payout_methods (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        payout_id VARCHAR(255),
        provider VARCHAR(50),
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Notification log
      `CREATE TABLE IF NOT EXISTS notification_log (
        id SERIAL PRIMARY KEY,
        type VARCHAR(20),
        recipient VARCHAR(255),
        subject VARCHAR(255),
        message TEXT,
        template VARCHAR(100),
        status VARCHAR(20),
        error_message TEXT,
        updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Compliance settings
      `CREATE TABLE IF NOT EXISTS compliance_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Batch jobs
      `CREATE TABLE IF NOT EXISTS compliance_batch_jobs (
        id SERIAL PRIMARY KEY,
        job_type VARCHAR(50),
        status VARCHAR(20),
        progress INTEGER DEFAULT 0,
        total_items INTEGER,
        completed_items INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Form 1099 records
      `CREATE TABLE IF NOT EXISTS form_1099_records (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        year INTEGER,
        form_type VARCHAR(20),
        gross_amount DECIMAL(10,2),
        transaction_count INTEGER,
        form_data JSONB,
        sent_to_irs BOOLEAN DEFAULT false,
        sent_to_venue BOOLEAN DEFAULT false,
        generated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Webhook logs
      `CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50),
        type VARCHAR(100),
        payload JSONB,
        processed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // OFAC SDN list
      `CREATE TABLE IF NOT EXISTS ofac_sdn_list (
        id SERIAL PRIMARY KEY,
        uid VARCHAR(50),
        full_name VARCHAR(255),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        sdn_type VARCHAR(50),
        programs JSONB,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Audit log
      `CREATE TABLE IF NOT EXISTS compliance_audit_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(255),
        user_id VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    
    // Create all tables
    for (const table of tables) {
      await db.query(table);
    }
    
    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_venue_verifications_venue_id ON venue_verifications(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_venue_verifications_status ON venue_verifications(status)',
      'CREATE INDEX IF NOT EXISTS idx_tax_records_venue_id ON tax_records(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_tax_records_year ON tax_records(year)',
      'CREATE INDEX IF NOT EXISTS idx_ofac_checks_venue_id ON ofac_checks(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_risk_flags_venue_id ON risk_flags(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_compliance_documents_venue_id ON compliance_documents(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON compliance_audit_log(entity_type, entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_form_1099_venue ON form_1099_records(venue_id, year)',
      'CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs(source)',
      'CREATE INDEX IF NOT EXISTS idx_ofac_sdn_name ON ofac_sdn_list(full_name)'
    ];
    
    for (const index of indexes) {
      try {
        await db.query(index);
      } catch (error: any) {
        // Index might already exist
        if (!error.message.includes('already exists')) {
          console.error('Index creation error:', error.message);
        }
      }
    }
    
    // Insert default settings
    await db.query(`
      INSERT INTO compliance_settings (key, value, description)
      VALUES 
        ('tax_threshold', '600', 'IRS 1099-K threshold'),
        ('high_risk_score', '70', 'Score above which venues are blocked'),
        ('review_required_score', '50', 'Score requiring manual review'),
        ('ofac_update_enabled', 'true', 'Auto-update OFAC list daily'),
        ('auto_approve_low_risk', 'false', 'Auto-approve venues with score < 20')
      ON CONFLICT (key) DO NOTHING
    `);
    
    console.log('✅ All compliance tables and indexes created');
  } catch (error) {
    console.error('❌ Failed to initialize tables:', error);
  }
}
