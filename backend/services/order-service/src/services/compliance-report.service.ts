/**
 * Compliance Report Service
 * 
 * Generates compliance reports for SOC 2, GDPR, PCI DSS, and HIPAA audits.
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { AuditLogService } from './audit-log.service';
import { FinancialTransactionLogService } from './financial-transaction-log.service';
import { DataAccessLogService } from './data-access-log.service';

export class ComplianceReportService {
  constructor(
    private db: Pool,
    private auditLogService: AuditLogService,
    private financialLogService: FinancialTransactionLogService,
    private dataAccessLogService: DataAccessLogService
  ) {}

  /**
   * Generate SOC 2 compliance report
   */
  async generateSOC2Report(tenant_id: string, start_date: Date, end_date: Date) {
    const auditStats = await this.auditLogService.getAuditLogStats(tenant_id, start_date, end_date);
    const piiAccess = await this.dataAccessLogService.getPIIAccessLogs(tenant_id, start_date, end_date, 1000);
    const suspiciousAccess = await this.dataAccessLogService.getSuspiciousAccessLogs(tenant_id, 100);
    
    return {
      report_type: 'SOC2',
      tenant_id,
      period: { start_date, end_date },
      audit_trail: {
        total_logs: auditStats.total_logs,
        by_type: auditStats.by_type,
        suspicious_count: auditStats.suspicious_count
      },
      access_controls: {
        pii_accesses: piiAccess.length,
        suspicious_accesses: suspiciousAccess.length
      }
    };
  }

  /**
   * Generate GDPR compliance report
   */
  async generateGDPRReport(tenant_id: string, start_date: Date, end_date: Date) {
    const piiAccess = await this.dataAccessLogService.getPIIAccessLogs(tenant_id, start_date, end_date, 1000);
    
    return {
      report_type: 'GDPR',
      tenant_id,
      period: { start_date, end_date },
      pii_access_summary: {
        total_accesses: piiAccess.length,
        by_user: this.groupByUser(piiAccess)
      }
    };
  }

  /**
   * Generate PCI DSS compliance report
   */
  async generatePCIDSSReport(tenant_id: string, start_date: Date, end_date: Date) {
    const txnStats = await this.financialLogService.getTransactionStats(tenant_id, start_date, end_date);
    
    return {
      report_type: 'PCI_DSS',
      tenant_id,
      period: { start_date, end_date },
      financial_transactions: {
        total: txnStats.total_transactions,
        total_amount: txnStats.total_amount_cents,
        by_type: txnStats.by_type,
        flagged: txnStats.flagged_count
      }
    };
  }

  private groupByUser(logs: any[]) {
    const grouped: Record<string, number> = {};
    logs.forEach(log => {
      grouped[log.user_id] = (grouped[log.user_id] || 0) + 1;
    });
    return grouped;
  }
}
