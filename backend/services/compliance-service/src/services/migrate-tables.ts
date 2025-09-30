import { db } from './database.service';

export async function migrateTables() {
  try {
    // Add missing columns to venue_verifications if they don't exist
    const alterStatements = [
      `ALTER TABLE venue_verifications 
       ADD COLUMN IF NOT EXISTS w9_uploaded BOOLEAN DEFAULT false`,
      
      `ALTER TABLE venue_verifications 
       ADD COLUMN IF NOT EXISTS bank_verified BOOLEAN DEFAULT false`,
      
      `ALTER TABLE venue_verifications 
       ADD COLUMN IF NOT EXISTS ofac_cleared BOOLEAN DEFAULT false`,
      
      `ALTER TABLE venue_verifications 
       ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0`,
      
      `ALTER TABLE venue_verifications 
       ADD COLUMN IF NOT EXISTS business_address TEXT`,
      
      `ALTER TABLE venue_verifications 
       ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN DEFAULT false`,
      
      `ALTER TABLE venue_verifications 
       ADD COLUMN IF NOT EXISTS manual_review_notes TEXT`,
      
      // Add missing columns to tax_records
      `ALTER TABLE tax_records 
       ADD COLUMN IF NOT EXISTS form_1099_required BOOLEAN DEFAULT false`,
      
      `ALTER TABLE tax_records 
       ADD COLUMN IF NOT EXISTS form_1099_sent BOOLEAN DEFAULT false`,
      
      `ALTER TABLE tax_records 
       ADD COLUMN IF NOT EXISTS event_id VARCHAR(255)`
    ];
    
    for (const statement of alterStatements) {
      try {
        await db.query(statement);
      } catch (error: any) {
        // Column might already exist, that's ok
        if (!error.message.includes('already exists')) {
          console.error('Migration error:', error.message);
        }
      }
    }
    
    console.log('✅ Table migrations completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}
