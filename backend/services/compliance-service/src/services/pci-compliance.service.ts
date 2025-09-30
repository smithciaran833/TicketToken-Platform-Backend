import { db } from './database.service';

export class PCIComplianceService {
  async logCardDataAccess(userId: string, action: string, reason: string): Promise<void> {
    // PCI requires logging all access to card data
    await db.query(
      `INSERT INTO pci_access_logs 
       (user_id, action, reason, ip_address, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, action, reason, 'system']
    );
  }

  async validatePCICompliance(): Promise<{compliant: boolean; issues: string[]}> {
    const issues: string[] = [];

    // Check if we're storing any card data (we shouldn't be)
    const cardDataCheck = await db.query(
      `SELECT COUNT(*) FROM information_schema.columns 
       WHERE column_name LIKE '%card%number%' OR column_name LIKE '%cvv%'`
    );

    if (parseInt(cardDataCheck.rows[0].count) > 0) {
      issues.push('Card data found in database - must be removed');
    }

    // Check encryption
    const encryptionCheck = await db.query(
      `SELECT current_setting('block_encryption_type') as encryption`
    );

    if (!encryptionCheck.rows[0].encryption) {
      issues.push('Database encryption not enabled');
    }

    // Check SSL/TLS
    const sslCheck = await db.query(`SELECT current_setting('ssl') as ssl`);
    
    if (sslCheck.rows[0].ssl !== 'on') {
      issues.push('SSL not enabled for database connections');
    }

    return {
      compliant: issues.length === 0,
      issues
    };
  }
}

export const pciComplianceService = new PCIComplianceService();
