import { query } from '../../config/database';
import { complianceConfig } from '../../config/compliance';

export class Form1099DAService {
  async generateForm1099DA(
    userId: string,
    taxYear: number
  ): Promise<{
    required: boolean;
    formData?: any;
    transactions?: any[];
  }> {
    // Check if form is required (starting Jan 2025)
    const startDate = new Date(complianceConfig.tax.digitalAssetReporting.startDate);
    if (new Date() < startDate) {
      return { required: false };
    }

    // Get all NFT transactions for the user
    const transactions = await this.getUserNFTTransactions(userId, taxYear);

    // Calculate total proceeds (convert from cents to dollars)
    const totalProceeds = transactions.reduce((sum, tx) => sum + tx.proceeds, 0);

    // Check if meets reporting threshold ($600)
    if (totalProceeds < complianceConfig.tax.digitalAssetReporting.threshold) {
      return {
        required: false,
        transactions
      };
    }

    // Get user information
    const userInfo = await this.getUserTaxInfo(userId);

    // Generate form data
    const formData = {
      recipientInfo: {
        name: userInfo.name,
        address: userInfo.address,
        tin: userInfo.tin // Taxpayer Identification Number
      },
      payerInfo: {
        name: 'TicketToken Inc.',
        address: '123 Music Row, Nashville, TN 37203',
        tin: '12-3456789' // Company EIN
      },
      taxYear,
      transactions: transactions.map(tx => ({
        dateAcquired: tx.acquiredDate,
        dateDisposed: tx.disposedDate,
        proceeds: tx.proceeds,
        costBasis: tx.costBasis,
        gain: tx.proceeds - tx.costBasis,
        assetDescription: `NFT Ticket - ${tx.eventName}`,
        transactionId: tx.transactionId
      })),
      summary: {
        totalProceeds,
        totalCostBasis: transactions.reduce((sum, tx) => sum + tx.costBasis, 0),
        totalGain: transactions.reduce((sum, tx) => sum + (tx.proceeds - tx.costBasis), 0),
        transactionCount: transactions.length
      }
    };

    return {
      required: true,
      formData,
      transactions
    };
  }

  private async getUserNFTTransactions(
    userId: string,
    taxYear: number
  ): Promise<any[]> {
    const yearStart = new Date(taxYear, 0, 1);
    const yearEnd = new Date(taxYear + 1, 0, 1);

    // Query marketplace_listings (not resale_listings)
    // price and original_face_value are in INTEGER CENTS
    const sqlQuery = `
      SELECT
        ml.id as transaction_id,
        ml.sold_at as disposed_date,
        ml.price as proceeds_cents,
        ml.original_face_value as cost_basis_cents,
        t.purchased_at as acquired_date,
        e.name as event_name,
        ml.ticket_id
      FROM marketplace_listings ml
      JOIN tickets t ON ml.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE ml.seller_id = $1
        AND ml.status = 'sold'
        AND ml.sold_at >= $2
        AND ml.sold_at < $3
      ORDER BY ml.sold_at`;

    const result = await query(sqlQuery, [userId, yearStart, yearEnd]);

    // Convert cents to dollars for tax reporting
    return result.rows.map((row: any) => ({
      transactionId: row.transaction_id,
      disposedDate: row.disposed_date,
      proceeds: row.proceeds_cents / 100, // Convert cents to dollars
      costBasis: row.cost_basis_cents / 100, // Convert cents to dollars
      acquiredDate: row.acquired_date,
      eventName: row.event_name,
      ticketId: row.ticket_id
    }));
  }

  private async getUserTaxInfo(userId: string): Promise<any> {
    // Get user tax information
    const result = await query(
      `SELECT
        u.id,
        u.email,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) as name,
        uti.address,
        uti.tin,
        uti.tin_type
       FROM users u
       LEFT JOIN user_tax_info uti ON u.id = uti.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return result.rows[0];
  }

  async recordFormGeneration(
    userId: string,
    taxYear: number,
    formData: any
  ): Promise<void> {
    await query(
      `INSERT INTO tax_forms_1099da
       (user_id, tax_year, form_data, total_proceeds,
        transaction_count, generated_at, status)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'generated')`,
      [
        userId,
        taxYear,
        JSON.stringify(formData),
        formData.summary.totalProceeds,
        formData.summary.transactionCount
      ]
    );
  }

  async batchGenerate1099DA(taxYear: number): Promise<{
    totalGenerated: number;
    totalRequired: number;
    errors: any[];
  }> {
    // Get all users who need 1099-DA
    // Note: price is in cents, threshold is in dollars, so multiply threshold by 100
    const usersQuery = `
      SELECT DISTINCT
        ml.seller_id as user_id,
        SUM(ml.price) / 100.0 as total_proceeds,
        COUNT(*) as transaction_count
      FROM marketplace_listings ml
      WHERE ml.status = 'sold'
        AND EXTRACT(YEAR FROM ml.sold_at) = $1
      GROUP BY ml.seller_id
      HAVING SUM(ml.price) / 100.0 >= $2`;

    const users = await query(usersQuery, [
      taxYear,
      complianceConfig.tax.digitalAssetReporting.threshold
    ]);

    let generated = 0;
    const errors: any[] = [];

    for (const user of users.rows) {
      try {
        const form = await this.generateForm1099DA(user.user_id, taxYear);
        if (form.required && form.formData) {
          await this.recordFormGeneration(user.user_id, taxYear, form.formData);
          generated++;
        }
      } catch (error) {
        errors.push({
          userId: user.user_id,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return {
      totalGenerated: generated,
      totalRequired: users.rows.length,
      errors
    };
  }

  async getFormStatus(userId: string, taxYear: number): Promise<{
    status: string;
    generatedAt?: Date;
    downloadUrl?: string;
    summary?: any;
  }> {
    const result = await query(
      `SELECT * FROM tax_forms_1099da
       WHERE user_id = $1 AND tax_year = $2
       ORDER BY generated_at DESC
       LIMIT 1`,
      [userId, taxYear]
    );

    if (result.rows.length === 0) {
      // Check if form is needed
      const formCheck = await this.generateForm1099DA(userId, taxYear);

      return {
        status: formCheck.required ? 'pending' : 'not_required',
        summary: formCheck.formData?.summary
      };
    }

    const form = result.rows[0];

    return {
      status: form.status,
      generatedAt: form.generated_at,
      downloadUrl: `/api/tax/forms/1099-da/${userId}/${taxYear}`,
      summary: JSON.parse(form.form_data).summary
    };
  }
}
