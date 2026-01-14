import { db } from './database.service';
import { venueServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

/**
 * Helper to create request context for service calls
 * Compliance service operates as a system service
 */
function createSystemContext(tenantId: string): RequestContext {
  return {
    tenantId,
    traceId: `bank-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

export class BankService {
  /**
   * REFACTORED: Verify bank account with tenant isolation
   * Uses venueServiceClient to validate venue ownership instead of direct DB query
   * 
   * @param tenantId - The tenant identifier for multi-tenant isolation
   * @param venueId - The venue ID being verified
   * @param accountNumber - Bank account number
   * @param routingNumber - Bank routing number
   */
  async verifyBankAccount(
    tenantId: string,
    venueId: string,
    accountNumber: string,
    routingNumber: string
  ): Promise<{
    verified: boolean;
    accountName: string;
    accountType: string;
  }> {
    const ctx = createSystemContext(tenantId);

    // In production: Use Plaid Auth API
    // Cost: $0.50 per verification
    
    // REFACTORED: Validate tenant owns this venue via venueServiceClient
    const venueExists = await venueServiceClient.venueExists(venueId, ctx);
    
    if (!venueExists) {
      throw new Error(`Venue ${venueId} not found or access denied for tenant ${tenantId}`);
    }
    
    // Mock verification
    const mockVerified = !accountNumber.includes('000');
    
    const result = {
      verified: mockVerified,
      accountName: 'Mock Business Checking',
      accountType: 'checking'
    };
    
    // Store verification result with tenant_id - compliance-service owned table
    await db.query(
      `INSERT INTO bank_verifications 
       (tenant_id, venue_id, account_last_four, routing_number, verified, account_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        tenantId,
        venueId,
        accountNumber.slice(-4),
        routingNumber,
        mockVerified,
        result.accountName
      ]
    );
    
    // Update venue verification with tenant check - compliance-service owned table
    if (mockVerified) {
      await db.query(
        `UPDATE venue_verifications 
         SET bank_verified = true, updated_at = NOW()
         WHERE venue_id = $1 AND tenant_id = $2`,
        [venueId, tenantId]
      );
    }
    
    console.log(`🏦 Bank verification for tenant ${tenantId}, venue ${venueId}: ${mockVerified ? 'SUCCESS' : 'FAILED'}`);
    
    return result;
  }
  
  /**
   * REFACTORED: Create payout method with tenant isolation
   * Uses venueServiceClient to validate venue ownership instead of direct DB query
   * 
   * @param tenantId - The tenant identifier for multi-tenant isolation
   * @param venueId - The venue ID for the payout method
   * @param accountToken - The account token from payment provider
   */
  async createPayoutMethod(
    tenantId: string,
    venueId: string,
    accountToken: string
  ): Promise<string> {
    const ctx = createSystemContext(tenantId);

    // REFACTORED: Validate tenant owns this venue via venueServiceClient
    const venueExists = await venueServiceClient.venueExists(venueId, ctx);
    
    if (!venueExists) {
      throw new Error(`Venue ${venueId} not found or access denied for tenant ${tenantId}`);
    }
    
    // In production: Create Stripe/Square payout destination
    const payoutId = `payout_${Date.now()}`;
    
    // Store payout method - compliance-service owned table
    await db.query(
      `INSERT INTO payout_methods 
       (tenant_id, venue_id, payout_id, status, created_at)
       VALUES ($1, $2, $3, 'active', NOW())`,
      [tenantId, venueId, payoutId]
    );
    
    return payoutId;
  }
  
  /**
   * Get payout methods for a venue
   * @param tenantId - The tenant identifier for multi-tenant isolation
   * @param venueId - The venue ID to get payout methods for
   */
  async getPayoutMethods(
    tenantId: string,
    venueId: string
  ): Promise<Array<{ payoutId: string; status: string; createdAt: Date }>> {
    // Query payout_methods - compliance-service owned table
    const result = await db.query(
      `SELECT payout_id, status, created_at 
       FROM payout_methods 
       WHERE venue_id = $1 AND tenant_id = $2 
       ORDER BY created_at DESC`,
      [venueId, tenantId]
    );
    
    return result.rows.map((row: any) => ({
      payoutId: row.payout_id,
      status: row.status,
      createdAt: row.created_at
    }));
  }
  
  /**
   * Get bank verification history for a venue
   * @param tenantId - The tenant identifier for multi-tenant isolation
   * @param venueId - The venue ID to get verification history for
   */
  async getBankVerificationHistory(
    tenantId: string,
    venueId: string
  ): Promise<Array<{ accountLastFour: string; verified: boolean; createdAt: Date }>> {
    // Query bank_verifications - compliance-service owned table
    const result = await db.query(
      `SELECT account_last_four, verified, created_at 
       FROM bank_verifications 
       WHERE venue_id = $1 AND tenant_id = $2 
       ORDER BY created_at DESC`,
      [venueId, tenantId]
    );
    
    return result.rows.map((row: any) => ({
      accountLastFour: row.account_last_four,
      verified: row.verified,
      createdAt: row.created_at
    }));
  }
}

export const bankService = new BankService();
