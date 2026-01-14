import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { exportService } from '../services/export.service';
import { ExportModel } from '../models';
import { ExportType, ExportFormat, ExportStatus } from '../types';

interface VenueParams {
  venueId: string;
}

interface ExportParams {
  exportId: string;
}

interface GetExportsQuery {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  type?: string;
  page?: number;
  limit?: number;
}

interface CreateExportBody {
  venueId: string;
  type: 'analytics_report' | 'customer_list' | 'financial_report' | 'custom';
  format: 'csv' | 'xlsx' | 'pdf' | 'json';
  filters?: Record<string, any>;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
}

// Use the globally augmented FastifyRequest which has user?: AuthUser
// See: middleware/auth.middleware.ts for the Fastify module augmentation

class ExportController extends BaseController {
  getExports = async (
    request: FastifyRequest<{ Params: VenueParams; Querystring: GetExportsQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const { limit = 50 } = request.query;
      const userId = request.user?.id || '';
      
      const exports = await exportService.getUserExports(userId, venueId, limit);
      return this.success(reply, { exports });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getExportStatus = async (
    request: FastifyRequest<{ Params: ExportParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { exportId } = request.params;
      
      const exportRequest = await exportService.getExportStatus(exportId);
      if (!exportRequest) {
        return this.notFound(reply, 'Export not found');
      }
      return this.success(reply, { export: exportRequest });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  createExport = async (
    request: FastifyRequest<{ Body: CreateExportBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const body = request.body;
      const userId = request.user?.id || 'system';
      
      // Map type string to ExportType enum
      const typeMap: Record<string, ExportType> = {
        'analytics_report': ExportType.ANALYTICS_REPORT,
        'customer_list': ExportType.CUSTOMER_LIST,
        'financial_report': ExportType.FINANCIAL_REPORT,
        'custom': ExportType.CUSTOM_REPORT,
      };
      
      // Map format string to ExportFormat enum
      const formatMap: Record<string, ExportFormat> = {
        'csv': ExportFormat.CSV,
        'xlsx': ExportFormat.XLSX,
        'pdf': ExportFormat.PDF,
        'json': ExportFormat.JSON,
      };
      
      const exportRequest = await exportService.createExport({
        venueId: body.venueId,
        userId: userId,
        type: typeMap[body.type] || ExportType.ANALYTICS_REPORT,
        format: formatMap[body.format] || ExportFormat.CSV,
        filters: {
          dateRange: body.dateRange ? {
            start: body.dateRange.startDate ? new Date(body.dateRange.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end: body.dateRange.endDate ? new Date(body.dateRange.endDate) : new Date()
          } : {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end: new Date()
          },
          ...body.filters
        },
        options: {}
      });
      
      return this.success(reply, { exportId: exportRequest.id }, 202);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  downloadExport = async (
    request: FastifyRequest<{ Params: ExportParams }>,
    reply: FastifyReply
  ): Promise<void> => {
    try {
      const { exportId } = request.params;
      
      const exportRequest = await exportService.getExportStatus(exportId);
      if (!exportRequest) {
        reply.code(404).send({ success: false, error: { message: 'Export not found', statusCode: 404 } });
        return;
      }
      
      if (exportRequest.status !== ExportStatus.COMPLETED) {
        reply.code(400).send({ success: false, error: { message: 'Export not ready for download', statusCode: 400 } });
        return;
      }
      
      if (!exportRequest.fileUrl) {
        reply.code(404).send({ success: false, error: { message: 'Export file not found', statusCode: 404 } });
        return;
      }
      
      // In production, would redirect to signed URL or stream file
      reply.redirect(exportRequest.fileUrl);
    } catch (error) {
      this.handleError(error, reply);
    }
  };

  cancelExport = async (
    request: FastifyRequest<{ Params: ExportParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { exportId } = request.params;
      // tenantId available from request.user?.tenantId if needed for authorization

      const exportRequest = await exportService.getExportStatus(exportId);
      if (!exportRequest) {
        return this.notFound(reply, 'Export not found');
      }
      
      // Only allow cancellation of pending/processing exports
      if (exportRequest.status !== ExportStatus.PENDING && exportRequest.status !== ExportStatus.PROCESSING) {
        return this.badRequest(reply, 'Cannot cancel export in current status');
      }
      
      // Update status to failed/cancelled
      await ExportModel.updateExportStatus(exportId, ExportStatus.FAILED, {
        error: 'Cancelled by user'
      });
      
      return this.success(reply, { message: 'Export cancelled' });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  retryExport = async (
    request: FastifyRequest<{ Params: ExportParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { exportId } = request.params;
      const userId = request.user?.id || 'system';
      
      const originalExport = await exportService.getExportStatus(exportId);
      if (!originalExport) {
        return this.notFound(reply, 'Export not found');
      }
      
      // Create a new export with the same parameters
      const newExport = await exportService.createExport({
        venueId: originalExport.venueId,
        userId: userId,
        type: originalExport.type,
        format: originalExport.format,
        filters: originalExport.filters,
        options: originalExport.options
      });
      
      return this.success(reply, { exportId: newExport.id }, 202);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };
}

export const exportController = new ExportController();
