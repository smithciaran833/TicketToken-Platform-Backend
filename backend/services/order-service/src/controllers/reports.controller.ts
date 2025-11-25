import { FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from '../config/database';
import { OrderReportService } from '../services/order-report.service';
import { CustomerAnalyticsService } from '../services/customer-analytics.service';
import { FinancialReconciliationService } from '../services/financial-reconciliation.service';
import { FeeCalculatorService } from '../services/fee-calculator.service';
import { ChargebackHandlerService } from '../services/chargeback-handler.service';
import { ExportService } from '../services/export.service';
import { ScheduledExportService } from '../services/scheduled-export.service';
import { ExportFormat } from '../types/report.types';

export class ReportsController {
  private orderReportService: OrderReportService;
  private customerAnalyticsService: CustomerAnalyticsService;
  private reconciliationService: FinancialReconciliationService;
  private feeService: FeeCalculatorService;
  private chargebackService: ChargebackHandlerService;
  private exportService: ExportService;
  private scheduledExportService: ScheduledExportService;

  constructor() {
    const db = getDatabase();
    this.orderReportService = new OrderReportService(db);
    this.customerAnalyticsService = new CustomerAnalyticsService(db);
    this.reconciliationService = new FinancialReconciliationService(db);
    this.feeService = new FeeCalculatorService(db);
    this.chargebackService = new ChargebackHandlerService(db);
    this.exportService = new ExportService();
    this.scheduledExportService = new ScheduledExportService(db);
  }

  async getDailyReport(req: FastifyRequest<{ Querystring: { date: string } }>, reply: FastifyReply) {
    const { date } = req.query;
    const tenantId = (req as any).tenantId;
    const report = await this.orderReportService.generateDailySummary(tenantId, new Date(date));
    return reply.send(report);
  }

  async getWeeklyReport(req: FastifyRequest<{ Querystring: { startDate: string } }>, reply: FastifyReply) {
    const { startDate } = req.query;
    const tenantId = (req as any).tenantId;
    const report = await this.orderReportService.generateWeeklySummary(tenantId, new Date(startDate));
    return reply.send(report);
  }

  async getMonthlyReport(req: FastifyRequest<{ Querystring: { month: number; year: number } }>, reply: FastifyReply) {
    const { month, year } = req.query;
    const tenantId = (req as any).tenantId;
    const report = await this.orderReportService.generateMonthlySummary(tenantId, month, year);
    return reply.send(report);
  }

  async getRevenueByEvent(req: FastifyRequest<{ Params: { eventId: string }; Querystring: { startDate: string; endDate: string } }>, reply: FastifyReply) {
    const { eventId } = req.params;
    const { startDate, endDate } = req.query;
    const tenantId = (req as any).tenantId;
    const report = await this.orderReportService.getRevenueByEvent(tenantId, eventId, { startDate: new Date(startDate), endDate: new Date(endDate) });
    return reply.send(report);
  }

  async getTopEventsByRevenue(req: FastifyRequest<{ Querystring: { startDate: string; endDate: string; limit?: number } }>, reply: FastifyReply) {
    const { startDate, endDate, limit = 10 } = req.query;
    const tenantId = (req as any).tenantId;
    const reports = await this.orderReportService.getTopEventsByRevenue(tenantId, limit, { startDate: new Date(startDate), endDate: new Date(endDate) });
    return reply.send(reports);
  }

  async getCustomerAnalytics(req: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) {
    const { userId } = req.params;
    const tenantId = (req as any).tenantId;
    const analytics = await this.customerAnalyticsService.getCustomerAnalytics(tenantId, userId);
    return reply.send(analytics);
  }

  async getCustomersBySegment(req: FastifyRequest<{ Params: { segmentId: string } }>, reply: FastifyReply) {
    const { segmentId } = req.params;
    const tenantId = (req as any).tenantId;
    const customers = await this.customerAnalyticsService.getCustomersBySegment(tenantId, segmentId);
    return reply.send(customers);
  }

  async getTopCustomers(req: FastifyRequest<{ Querystring: { limit?: number; orderBy?: 'clv' | 'frequency' } }>, reply: FastifyReply) {
    const { limit = 10, orderBy = 'clv' } = req.query;
    const tenantId = (req as any).tenantId;
    const customers = await this.customerAnalyticsService.getTopCustomers(tenantId, limit, orderBy);
    return reply.send(customers);
  }

  async getVIPCustomers(req: FastifyRequest, reply: FastifyReply) {
    const tenantId = (req as any).tenantId;
    const customers = await this.customerAnalyticsService.getVIPCustomers(tenantId);
    return reply.send(customers);
  }

  async getAtRiskCustomers(req: FastifyRequest, reply: FastifyReply) {
    const tenantId = (req as any).tenantId;
    const customers = await this.customerAnalyticsService.getAtRiskCustomers(tenantId);
    return reply.send(customers);
  }

  async getDailyReconciliation(req: FastifyRequest<{ Querystring: { date: string } }>, reply: FastifyReply) {
    const { date } = req.query;
    const tenantId = (req as any).tenantId;
    const report = await this.reconciliationService.generateDailyReconciliation(tenantId, new Date(date));
    return reply.send(report);
  }

  async getDiscrepancies(req: FastifyRequest<{ Querystring: { startDate: string; endDate: string } }>, reply: FastifyReply) {
    const { startDate, endDate } = req.query;
    const tenantId = (req as any).tenantId;
    const discrepancies = await this.reconciliationService.detectDiscrepancies(tenantId, new Date(startDate));
    return reply.send(discrepancies);
  }

  async getUnreconciledOrders(req: FastifyRequest<{ Querystring: { days?: number } }>, reply: FastifyReply) {
    const { days = 7 } = req.query;
    const tenantId = (req as any).tenantId;
    const orders = await this.reconciliationService.getUnreconciledOrders(tenantId, days);
    return reply.send(orders);
  }

  async importTransactions(req: FastifyRequest<{ Body: { transactions: any[] } }>, reply: FastifyReply) {
    const { transactions } = req.body;
    const tenantId = (req as any).tenantId;
    await this.reconciliationService.importPaymentTransactions(tenantId, transactions);
    return reply.send({ success: true, imported: transactions.length });
  }

  async getFeeBreakdown(req: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply) {
    const { orderId } = req.params;
    const tenantId = (req as any).tenantId;
    const fees = await this.feeService.getFeeBreakdown(orderId, tenantId);
    return reply.send(fees);
  }

  async getChargebacks(req: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) {
    const { status } = req.query;
    const tenantId = (req as any).tenantId;
    const chargebacks = status === 'PENDING' 
      ? await this.chargebackService.getPendingChargebacks(tenantId)
      : [];
    return reply.send(chargebacks);
  }

  async exportReport(req: FastifyRequest<{ Body: { reportType: string; format: string; filters?: any } }>, reply: FastifyReply) {
    const { reportType, format, filters } = req.body;
    const data = {}; // Placeholder - would fetch actual data
    const buffer = await this.exportService.exportOrderReport(data, format as ExportFormat);
    
    reply.header('Content-Type', format === 'CSV' ? 'text/csv' : 'application/json');
    reply.header('Content-Disposition', `attachment; filename=report.${format.toLowerCase()}`);
    return reply.send(buffer);
  }

  async getScheduledExports(req: FastifyRequest, reply: FastifyReply) {
    const tenantId = (req as any).tenantId;
    const exports = await this.scheduledExportService.getScheduledExports(tenantId);
    return reply.send(exports);
  }

  async createScheduledExport(req: FastifyRequest<{ Body: any }>, reply: FastifyReply) {
    const tenantId = (req as any).tenantId;
    const scheduledExport = await this.scheduledExportService.createScheduledExport(tenantId, req.body);
    return reply.status(201).send(scheduledExport);
  }

  async deleteScheduledExport(req: FastifyRequest<{ Params: { exportId: string } }>, reply: FastifyReply) {
    const { exportId } = req.params;
    await this.scheduledExportService.deleteScheduledExport(exportId);
    return reply.status(204).send();
  }
}
