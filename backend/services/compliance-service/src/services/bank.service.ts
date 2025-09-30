import { db } from './database.service';

export class BankService {
  // Mock Plaid integration
  async verifyBankAccount(
    venueId: string,
    accountNumber: string,
    routingNumber: string
  ): Promise<{
    verified: boolean;
    accountName: string;
    accountType: string;
  }> {
    // In production: Use Plaid Auth API
    // Cost: $0.50 per verification
    
    // Mock verification
    const mockVerified = !accountNumber.includes('000');
    
    const result = {
      verified: mockVerified,
      accountName: 'Mock Business Checking',
      accountType: 'checking'
    };
    
    // Store verification result
    await db.query(
      `INSERT INTO bank_verifications 
       (venue_id, account_last_four, routing_number, verified, account_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        venueId,
        accountNumber.slice(-4),
        routingNumber,
        mockVerified,
        result.accountName
      ]
    );
    
    // Update venue verification
    if (mockVerified) {
      await db.query(
        `UPDATE venue_verifications 
         SET bank_verified = true, updated_at = NOW()
         WHERE venue_id = $1`,
        [venueId]
      );
    }
    
    console.log(`🏦 Bank verification for ${venueId}: ${mockVerified ? 'SUCCESS' : 'FAILED'}`);
    
    return result;
  }
  
  async createPayoutMethod(
    venueId: string,
    accountToken: string
  ): Promise<string> {
    // In production: Create Stripe/Square payout destination
    const payoutId = `payout_${Date.now()}`;
    
    await db.query(
      `INSERT INTO payout_methods 
       (venue_id, payout_id, status, created_at)
       VALUES ($1, $2, 'active', NOW())`,
      [venueId, payoutId]
    );
    
    return payoutId;
  }
}

export const bankService = new BankService();
