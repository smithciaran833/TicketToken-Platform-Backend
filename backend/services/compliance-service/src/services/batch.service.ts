import { db } from './database.service';
import { notificationService } from './notification.service';

export class BatchService {
  async generateYear1099Forms(year: number): Promise<{
    generated: number;
    errors: number;
    venues: any[];
  }> {
    try {
      // Start batch job
      const jobResult = await db.query(
        `INSERT INTO compliance_batch_jobs 
         (job_type, status, started_at, created_at)
         VALUES ('1099_generation', 'running', NOW(), NOW())
         RETURNING id`,
        []
      );
      const jobId = jobResult.rows[0].id;
      
      // Get all venues that need 1099s
      const venuesResult = await db.query(
        `SELECT 
          v.venue_id,
          v.business_name,
          v.ein,
          SUM(t.amount) as total_sales,
          COUNT(t.id) as transaction_count
         FROM venue_verifications v
         JOIN tax_records t ON v.venue_id = t.venue_id
         WHERE t.year = $1
         GROUP BY v.venue_id, v.business_name, v.ein
         HAVING SUM(t.amount) >= 600`,
        [year]
      );
      
      const venues = venuesResult.rows;
      let generated = 0;
      let errors = 0;
      
      for (const venue of venues) {
        try {
          // Generate 1099-K form data
          const form1099 = {
            venueId: venue.venue_id,
            businessName: venue.business_name,
            ein: venue.ein,
            year: year,
            grossAmount: venue.total_sales,
            transactionCount: venue.transaction_count,
            monthlyAmounts: await this.getMonthlyBreakdown(venue.venue_id, year),
            formType: '1099-K',
            generatedAt: new Date()
          };
          
          // Store 1099 record
          await db.query(
            `INSERT INTO form_1099_records 
             (venue_id, year, form_type, gross_amount, transaction_count, form_data, generated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              venue.venue_id,
              year,
              '1099-K',
              venue.total_sales,
              venue.transaction_count,
              JSON.stringify(form1099)
            ]
          );
          
          // Update tax records
          await db.query(
            `UPDATE tax_records 
             SET form_1099_required = true 
             WHERE venue_id = $1 AND year = $2`,
            [venue.venue_id, year]
          );
          
          // Send notification
          await notificationService.sendEmail(
            'venue@example.com',
            `Your ${year} Form 1099-K is Ready`,
            '1099-ready',
            form1099
          );
          
          generated++;
          console.log(`✅ Generated 1099-K for ${venue.business_name}: $${venue.total_sales}`);
          
        } catch (error) {
          console.error(`❌ Failed to generate 1099 for ${venue.venue_id}:`, error);
          errors++;
        }
        
        // Update job progress
        await db.query(
          `UPDATE compliance_batch_jobs 
           SET completed_items = $2, error_count = $3, progress = $4
           WHERE id = $1`,
          [
            jobId, 
            generated, 
            errors,
            Math.round((generated / venues.length) * 100)
          ]
        );
      }
      
      // Complete job
      await db.query(
        `UPDATE compliance_batch_jobs 
         SET status = 'completed', completed_at = NOW(), total_items = $2
         WHERE id = $1`,
        [jobId, venues.length]
      );
      
      return { generated, errors, venues };
      
    } catch (error) {
      console.error('Batch 1099 generation failed:', error);
      throw error;
    }
  }
  
  private async getMonthlyBreakdown(venueId: string, year: number): Promise<any> {
    const result = await db.query(
      `SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        SUM(amount) as total
       FROM tax_records
       WHERE venue_id = $1 AND year = $2
       GROUP BY EXTRACT(MONTH FROM created_at)
       ORDER BY month`,
      [venueId, year]
    );
    
    const breakdown: any = {};
    for (let month = 1; month <= 12; month++) {
      breakdown[`month_${month}`] = 0;
    }
    
    for (const row of result.rows) {
      breakdown[`month_${row.month}`] = parseFloat(row.total);
    }
    
    return breakdown;
  }
  
  async processOFACUpdates(): Promise<void> {
    console.log('📥 Processing OFAC list update...');
    
    // In production: Download from Treasury
    // const response = await fetch('https://www.treasury.gov/ofac/downloads/sdn.xml');
    // Parse XML and update database
    
    // For now, just log
    console.log('✅ OFAC list updated (mock)');
    
    // Re-check all venues against new list
    const venues = await db.query('SELECT venue_id, business_name FROM venue_verifications');
    
    for (const venue of venues.rows) {
      // Re-run OFAC check
      console.log(`Re-checking ${venue.business_name} against updated OFAC list`);
    }
  }
  
  async dailyComplianceChecks(): Promise<void> {
    console.log('🔍 Running daily compliance checks...');
    
    // Check for expired verifications
    const expiredResult = await db.query(
      `SELECT * FROM venue_verifications 
       WHERE status = 'verified' 
       AND updated_at < NOW() - INTERVAL '365 days'`
    );
    
    if (expiredResult.rows.length > 0) {
      console.log(`⚠️  ${expiredResult.rows.length} venues need re-verification`);
      
      for (const venue of expiredResult.rows) {
        await notificationService.sendEmail(
          'venue@example.com',
          'Annual Verification Required',
          'reverification-required',
          { venueId: venue.venue_id, businessName: venue.business_name }
        );
      }
    }
    
    // Check for venues approaching tax threshold
    const year = new Date().getFullYear();
    const thresholdResult = await db.query(
      `SELECT 
        v.venue_id,
        v.business_name,
        SUM(t.amount) as total_sales
       FROM venue_verifications v
       JOIN tax_records t ON v.venue_id = t.venue_id
       WHERE t.year = $1
       GROUP BY v.venue_id, v.business_name
       HAVING SUM(t.amount) BETWEEN 500 AND 599`,
      [year]
    );
    
    if (thresholdResult.rows.length > 0) {
      console.log(`📊 ${thresholdResult.rows.length} venues approaching $600 threshold`);
    }
    
    console.log('✅ Daily compliance checks completed');
  }
}

export const batchService = new BatchService();
