import { query } from '../../config/database';

export class RoyaltySplitterService {
  async calculateRoyalties(
    salePrice: number,
    venueId: string,
    eventId: string
  ): Promise<{
    venueRoyalty: number;
    venuePercentage: number;
    artistRoyalty: number;
    artistPercentage: number;
    sellerProceeds: number;
    platformFee: number;
  }> {
    // Get venue royalty settings
    const venueSettings = await this.getVenueRoyaltySettings(venueId);
    
    // Get event-specific royalty settings (if any)
    const eventSettings = await this.getEventRoyaltySettings(eventId);
    
    // Use event settings if available, otherwise venue defaults
    const venuePercentage = eventSettings?.venueRoyaltyPercentage ?? 
                           venueSettings?.defaultRoyaltyPercentage ?? 
                           10; // 10% default
    
    const artistPercentage = eventSettings?.artistRoyaltyPercentage ?? 0;
    const platformPercentage = 5; // 5% platform fee on resales
    
    // Calculate amounts
    const venueRoyalty = salePrice * (venuePercentage / 100);
    const artistRoyalty = salePrice * (artistPercentage / 100);
    const platformFee = salePrice * (platformPercentage / 100);
    const sellerProceeds = salePrice - venueRoyalty - artistRoyalty - platformFee;
    
    return {
      venueRoyalty: Math.round(venueRoyalty * 100) / 100,
      venuePercentage,
      artistRoyalty: Math.round(artistRoyalty * 100) / 100,
      artistPercentage,
      sellerProceeds: Math.round(sellerProceeds * 100) / 100,
      platformFee: Math.round(platformFee * 100) / 100
    };
  }
  
  async distributeRoyalties(
    transactionId: string,
    royalties: any
  ): Promise<void> {
    // Record royalty distributions
    const distributions = [
      {
        transactionId,
        recipientType: 'venue',
        recipientId: royalties.venueId,
        amount: royalties.venueRoyalty,
        percentage: royalties.venuePercentage
      },
      {
        transactionId,
        recipientType: 'artist',
        recipientId: royalties.artistId,
        amount: royalties.artistRoyalty,
        percentage: royalties.artistPercentage
      },
      {
        transactionId,
        recipientType: 'platform',
        recipientId: 'tickettoken',
        amount: royalties.platformFee,
        percentage: 5
      }
    ];
    
    for (const distribution of distributions) {
      if (distribution.amount > 0) {
        await query(
          `INSERT INTO royalty_distributions 
           (transaction_id, recipient_type, recipient_id, amount, percentage)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            distribution.transactionId,
            distribution.recipientType,
            distribution.recipientId,
            distribution.amount,
            distribution.percentage
          ]
        );
      }
    }
  }
  
  private async getVenueRoyaltySettings(venueId: string): Promise<any> {
    const result = await query(
      'SELECT * FROM venue_royalty_settings WHERE venue_id = $1',
      [venueId]
    );
    
    return result.rows[0] || { defaultRoyaltyPercentage: 10 };
  }
  
  private async getEventRoyaltySettings(eventId: string): Promise<any> {
    const result = await query(
      'SELECT * FROM event_royalty_settings WHERE event_id = $1',
      [eventId]
    );
    
    return result.rows[0];
  }
  
  async getRoyaltyReport(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRoyalties: number;
    transactionCount: number;
    averageRoyalty: number;
    byEvent: Array<{
      eventId: string;
      eventName: string;
      royalties: number;
      transactions: number;
    }>;
  }> {
    // Get total royalties for venue
    const totalQuery = `
      SELECT 
        COUNT(*) as transaction_count,
        SUM(amount) as total_royalties,
        AVG(amount) as average_royalty
      FROM royalty_distributions
      WHERE recipient_id = $1 
        AND recipient_type = 'venue'
        AND created_at BETWEEN $2 AND $3
    `;
    
    const totalResult = await query(totalQuery, [venueId, startDate, endDate]);
    
    // Get breakdown by event
    const byEventQuery = `
      SELECT 
        e.id as event_id,
        e.name as event_name,
        COUNT(rd.id) as transactions,
        SUM(rd.amount) as royalties
      FROM royalty_distributions rd
      JOIN payment_transactions pt ON rd.transaction_id = pt.id
      JOIN events e ON pt.event_id = e.id
      WHERE rd.recipient_id = $1 
        AND rd.recipient_type = 'venue'
        AND rd.created_at BETWEEN $2 AND $3
      GROUP BY e.id, e.name
      ORDER BY royalties DESC
    `;
    
    const byEventResult = await query(byEventQuery, [venueId, startDate, endDate]);
    
    return {
      totalRoyalties: parseFloat(totalResult.rows[0].total_royalties || 0),
      transactionCount: parseInt(totalResult.rows[0].transaction_count || 0),
      averageRoyalty: parseFloat(totalResult.rows[0].average_royalty || 0),
      byEvent: byEventResult.rows
    };
  }
}
