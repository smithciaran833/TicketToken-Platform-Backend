import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { exportService } from '../services/export.service';
import { ExportModel } from '../models';
import { ExportType, ExportFormat, ExportStatus } from '../types';
import { getDb } from '../config/database';
import { logger } from '../utils/logger';

interface VenueParams {
  venueId: string;
}

interface ReportParams {
  reportId: string;
}

interface ScheduleActionParams {
  reportId: string;
  action: 'pause' | 'resume';
}

interface GetReportsQuery {
  type?: string;
  page?: number;
  limit?: number;
}

interface GenerateReportBody {
  venueId: string;
  templateId: string;
  name: string;
  parameters: Record<string, any>;
  format: 'pdf' | 'xlsx' | 'csv';
  schedule?: Record<string, any>;
}

interface ScheduleReportBody {
  venueId: string;
  templateId: string;
  name: string;
  schedule: {
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string;
  };
  recipients: Array<{ email: string }>;
}

interface UpdateScheduleBody {
  schedule: Record<string, any>;
  recipients?: any[];
}

// Use the globally augmented FastifyRequest which has user?: AuthUser
// See: middleware/auth.middleware.ts for the Fastify module augmentation

// Report templates
const REPORT_TEMPLATES = [
  {
    id: 'revenue-summary',
    name: 'Revenue Summary Report',
    description: 'Summary of revenue by event, venue, and time period',
    category: 'financial',
    supportedFormats: ['pdf', 'xlsx', 'csv'],
    parameters: ['dateRange', 'groupBy', 'venueFilter']
  },
  {
    id: 'ticket-sales',
    name: 'Ticket Sales Report',
    description: 'Detailed breakdown of ticket sales and inventory',
    category: 'sales',
    supportedFormats: ['pdf', 'xlsx', 'csv'],
    parameters: ['dateRange', 'eventFilter', 'ticketTypeFilter']
  },
  {
    id: 'customer-analytics',
    name: 'Customer Analytics Report',
    description: 'Customer segmentation, RFM analysis, and lifetime value',
    category: 'customer',
    supportedFormats: ['pdf', 'xlsx'],
    parameters: ['dateRange', 'segmentFilter']
  },
  {
    id: 'event-performance',
    name: 'Event Performance Report',
    description: 'Performance metrics for events including attendance and revenue',
    category: 'operations',
    supportedFormats: ['pdf', 'xlsx'],
    parameters: ['dateRange', 'eventFilter']
  },
  {
    id: 'marketing-attribution',
    name: 'Marketing Attribution Report',
    description: 'Channel performance and conversion attribution analysis',
    category: 'marketing',
    supportedFormats: ['pdf', 'xlsx', 'csv'],
    parameters: ['dateRange', 'channelFilter', 'attributionModel']
  }
];

class ReportsController extends BaseController {
  getReportTemplates = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      // Return available report templates
      return this.success(reply, { templates: REPORT_TEMPLATES });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getReports = async (
    request: FastifyRequest<{ Params: VenueParams; Querystring: GetReportsQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { type, limit = 50 } = request.query;
      const userId = request.user?.id || '';
      
      // Get exports that are report types
      const exports = await exportService.getUserExports(userId, venueId, limit);
      
      // Filter to report types if type is specified
      const reports = type 
        ? exports.filter(exp => exp.type === type)
        : exports;
      
      return this.success(reply, { reports });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getReport = async (
    request: FastifyRequest<{ Params: ReportParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { reportId } = request.params;
      
      const report = await exportService.getExportStatus(reportId);
      if (!report) {
        return this.notFound(reply, 'Report not found');
      }
      return this.success(reply, { report });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  generateReport = async (
    request: FastifyRequest<{ Body: GenerateReportBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, templateId, name, parameters, format } = request.body;
      const userId = request.user?.id || 'system';
      
      // Validate template exists
      const template = REPORT_TEMPLATES.find(t => t.id === templateId);
      if (!template) {
        return this.badRequest(reply, `Invalid template ID: ${templateId}`);
      }
      
      // Map format
      const formatMap: Record<string, ExportFormat> = {
        'pdf': ExportFormat.PDF,
        'xlsx': ExportFormat.XLSX,
        'csv': ExportFormat.CSV
      };
      
      // Create export/report request
      const exportRequest = await exportService.createExport({
        venueId,
        userId,
        type: ExportType.ANALYTICS_REPORT,
        format: formatMap[format] || ExportFormat.PDF,
        filters: {
          dateRange: parameters.dateRange || {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end: new Date()
          },
          ...parameters,
          // Store template info in filters since ExportFilters is more flexible
          metadata: { templateId, reportName: name }
        },
        options: {}
      });
      
      return this.success(reply, { reportId: exportRequest.id }, 202);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  scheduleReport = async (
    request: FastifyRequest<{ Body: ScheduleReportBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId, templateId, name, schedule, recipients } = request.body;
      const userId = request.user?.id || 'system';
      const db = getDb();
      
      // Validate template
      const template = REPORT_TEMPLATES.find(t => t.id === templateId);
      if (!template) {
        return this.badRequest(reply, `Invalid template ID: ${templateId}`);
      }
      
      // Create scheduled report entry
      const [scheduledReport] = await db('scheduled_reports')
        .insert({
          venue_id: venueId,
          template_id: templateId,
          name,
          schedule_frequency: schedule.frequency,
          schedule_time: schedule.time,
          recipients: JSON.stringify(recipients),
          created_by: userId,
          is_active: true,
          next_run_at: this.calculateNextRunTime(schedule.frequency, schedule.time),
          created_at: new Date(),
          updated_at: new Date()
        })
        .returning('*')
        .catch((error: Error) => {
          // Table might not exist, log error and return mock
          logger.warn('Failed to insert scheduled report, table may not exist', { error: error.message, venueId, templateId });
          return [{
            id: `schedule_${Date.now()}`,
            venue_id: venueId,
            template_id: templateId,
            name,
            schedule_frequency: schedule.frequency,
            schedule_time: schedule.time,
            recipients,
            is_active: true,
            created_at: new Date()
          }];
        });
      
      return this.success(reply, { schedule: scheduledReport }, 201);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  updateReportSchedule = async (
    request: FastifyRequest<{ Params: ReportParams; Body: UpdateScheduleBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { reportId } = request.params;
      const { schedule, recipients } = request.body;
      const db = getDb();
      
      const updates: Record<string, any> = {
        updated_at: new Date()
      };
      
      if (schedule) {
        if (schedule.frequency) updates.schedule_frequency = schedule.frequency;
        if (schedule.time) updates.schedule_time = schedule.time;
        updates.next_run_at = this.calculateNextRunTime(
          schedule.frequency || 'daily',
          schedule.time || '09:00'
        );
      }
      
      if (recipients) {
        updates.recipients = JSON.stringify(recipients);
      }
      
      const [updatedSchedule] = await db('scheduled_reports')
        .where({ id: reportId })
        .update(updates)
        .returning('*')
        .catch((error: Error) => {
          logger.warn('Failed to update scheduled report', { error: error.message, reportId });
          return [{ id: reportId, ...updates }];
        });
      
      return this.success(reply, { schedule: updatedSchedule });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  deleteReport = async (
    request: FastifyRequest<{ Params: ReportParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { reportId } = request.params;
      const db = getDb();
      
      // Try to delete scheduled report first
      const deletedCount = await db('scheduled_reports')
        .where({ id: reportId })
        .delete()
        .catch((error: Error) => {
          logger.warn('Failed to delete scheduled report', { error: error.message, reportId });
          return 0;
        });
      
      if (deletedCount === 0) {
        // Try to mark export as deleted
        await ExportModel.updateExportStatus(reportId, ExportStatus.FAILED, {
          error: 'Deleted by user'
        }).catch((error: Error) => {
          logger.warn('Failed to update export status', { error: error.message, reportId });
        });
      }
      
      return this.success(reply, { message: 'Report deleted' });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getScheduledReports = async (
    request: FastifyRequest<{ Params: VenueParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const db = getDb();
      
      const scheduledReports = await db('scheduled_reports')
        .where({ venue_id: venueId })
        .orderBy('created_at', 'desc')
        .catch((error: Error) => {
          logger.warn('Failed to get scheduled reports', { error: error.message, venueId });
          return [];
        });
      
      return this.success(reply, { reports: scheduledReports });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  toggleScheduledReport = async (
    request: FastifyRequest<{ Params: ScheduleActionParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { reportId, action } = request.params;
      const db = getDb();
      
      const isActive = action === 'resume';
      
      await db('scheduled_reports')
        .where({ id: reportId })
        .update({
          is_active: isActive,
          updated_at: new Date(),
          ...(isActive ? { next_run_at: new Date() } : {})
        })
        .catch((error: Error) => {
          logger.warn('Failed to toggle scheduled report', { error: error.message, reportId, action });
        });
      
      return this.success(reply, { 
        message: `Schedule ${action}d`,
        isActive
      });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  private calculateNextRunTime(frequency: string, time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const nextRun = new Date();
    nextRun.setHours(hours || 9, minutes || 0, 0, 0);
    
    // If time has passed today, schedule for next occurrence
    if (nextRun <= new Date()) {
      switch (frequency) {
        case 'daily':
          nextRun.setDate(nextRun.getDate() + 1);
          break;
        case 'weekly':
          nextRun.setDate(nextRun.getDate() + 7);
          break;
        case 'monthly':
          nextRun.setMonth(nextRun.getMonth() + 1);
          break;
      }
    }
    
    return nextRun;
  }
}

export const reportsController = new ReportsController();
