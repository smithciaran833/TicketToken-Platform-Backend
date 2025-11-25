import { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { ComplianceReportService } from '../services/compliance-report.service';
import { AuditLogService } from '../services/audit-log.service';
import { FinancialTransactionLogService } from '../services/financial-transaction-log.service';
import { DataAccessLogService } from '../services/data-access-log.service';

export class ComplianceController {
  private complianceReportService: ComplianceReportService;

  constructor(private db: Pool) {
    const auditLogService = new AuditLogService(db);
    const financialLogService = new FinancialTransactionLogService(db);
    const dataAccessLogService = new DataAccessLogService(db);
    
    this.complianceReportService = new ComplianceReportService(
      db,
      auditLogService,
      financialLogService,
      dataAccessLogService
    );
  }

  async generateReport(request: FastifyRequest<{
    Body: {
      report_type: 'SOC2' | 'GDPR' | 'PCI_DSS';
      tenant_id: string;
      start_date: string;
      end_date: string;
    }
  }>, reply: FastifyReply) {
    const { report_type, tenant_id, start_date, end_date } = request.body;
    
    const start = new Date(start_date);
    const end = new Date(end_date);
    
    let report;
    if (report_type === 'SOC2') {
      report = await this.complianceReportService.generateSOC2Report(tenant_id, start, end);
    } else if (report_type === 'GDPR') {
      report = await this.complianceReportService.generateGDPRReport(tenant_id, start, end);
    } else if (report_type === 'PCI_DSS') {
      report = await this.complianceReportService.generatePCIDSSReport(tenant_id, start, end);
    }
    
    reply.status(200).send(report);
  }
}
