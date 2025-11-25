import { FastifyInstance } from 'fastify';
import { ReportsController } from '../controllers/reports.controller';
import * as schemas from '../validators/report.schemas';

export default async function reportsRoutes(fastify: FastifyInstance) {
  const controller = new ReportsController();

  // Order reports
  fastify.get('/orders/daily', {
    schema: { querystring: schemas.dailyReportSchema },
  }, controller.getDailyReport.bind(controller));

  fastify.get('/orders/weekly', {
    schema: { querystring: schemas.weeklyReportSchema },
  }, controller.getWeeklyReport.bind(controller));

  fastify.get('/orders/monthly', {
    schema: { querystring: schemas.monthlyReportSchema },
  }, controller.getMonthlyReport.bind(controller));

  fastify.get('/revenue/event/:eventId', {
    schema: { querystring: schemas.dateRangeSchema },
  }, controller.getRevenueByEvent.bind(controller));

  fastify.get('/revenue/top', {
    schema: { querystring: schemas.dateRangeSchema },
  }, controller.getTopEventsByRevenue.bind(controller));

  // Customer analytics
  fastify.get('/customers/analytics/:userId', 
    controller.getCustomerAnalytics.bind(controller));

  fastify.get('/customers/segment/:segmentId',
    controller.getCustomersBySegment.bind(controller));

  fastify.get('/customers/top', {
    schema: { querystring: schemas.topCustomersQuerySchema },
  }, controller.getTopCustomers.bind(controller));

  fastify.get('/customers/vip',
    controller.getVIPCustomers.bind(controller));

  fastify.get('/customers/at-risk',
    controller.getAtRiskCustomers.bind(controller));

  // Financial reconciliation
  fastify.get('/financial/reconciliation/daily', {
    schema: { querystring: schemas.dailyReportSchema },
  }, controller.getDailyReconciliation.bind(controller));

  fastify.get('/financial/discrepancies', {
    schema: { querystring: schemas.dateRangeSchema },
  }, controller.getDiscrepancies.bind(controller));

  fastify.get('/financial/unreconciled', {
    schema: { querystring: schemas.unreconciledOrdersQuerySchema },
  }, controller.getUnreconciledOrders.bind(controller));

  fastify.post('/financial/transactions/import', {
    schema: { body: schemas.reconciliationImportSchema },
  }, controller.importTransactions.bind(controller));

  fastify.get('/financial/fees/:orderId',
    controller.getFeeBreakdown.bind(controller));

  fastify.get('/financial/chargebacks', {
    schema: { querystring: schemas.chargebacksQuerySchema },
  }, controller.getChargebacks.bind(controller));

  // Export
  fastify.post('/export', {
    schema: { body: schemas.exportRequestSchema },
  }, controller.exportReport.bind(controller));

  fastify.get('/scheduled-exports',
    controller.getScheduledExports.bind(controller));

  fastify.post('/scheduled-exports', {
    schema: { body: schemas.scheduledExportSchema },
  }, controller.createScheduledExport.bind(controller));

  fastify.delete('/scheduled-exports/:exportId',
    controller.deleteScheduledExport.bind(controller));
}
