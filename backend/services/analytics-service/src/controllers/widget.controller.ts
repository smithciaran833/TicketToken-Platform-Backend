import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { WidgetModel } from '../models';
import { aggregationService } from '../services/aggregation.service';
import { exportService } from '../services/export.service';
import { MetricType, TimeGranularity, ExportType, ExportFormat } from '../types';

interface DashboardParams {
  dashboardId: string;
}

interface WidgetParams {
  widgetId: string;
}

interface GetWidgetDataQuery {
  startDate?: string;
  endDate?: string;
  refresh?: boolean;
}

interface CreateWidgetBody {
  dashboardId: string;
  type: string;
  title: string;
  config: Record<string, any>;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
}

interface UpdateWidgetBody {
  title?: string;
  config?: Record<string, any>;
  position?: Record<string, any>;
  size?: Record<string, any>;
}

interface MoveWidgetBody {
  targetDashboardId: string;
  position?: Record<string, any>;
}

interface DuplicateWidgetBody {
  targetDashboardId?: string;
}

interface ExportWidgetBody {
  format: 'csv' | 'xlsx' | 'json';
  startDate?: string;
  endDate?: string;
}

class WidgetController extends BaseController {
  getWidgets = async (
    request: FastifyRequest<{ Params: DashboardParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { dashboardId } = request.params;
      const tenantId = request.user?.tenantId || '';
      
      const widgets = await WidgetModel.findByDashboard(dashboardId, tenantId);
      return this.success(reply, { widgets });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getWidget = async (
    request: FastifyRequest<{ Params: WidgetParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { widgetId } = request.params;
      const tenantId = request.user?.tenantId || '';
      
      const widget = await WidgetModel.findById(widgetId, tenantId);
      if (!widget) {
        return this.notFound(reply, 'Widget not found');
      }
      return this.success(reply, { widget });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getWidgetData = async (
    request: FastifyRequest<{ Params: WidgetParams; Querystring: GetWidgetDataQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { widgetId } = request.params;
      const { startDate, endDate } = request.query;
      const tenantId = request.user?.tenantId || '';
      
      const widget = await WidgetModel.findById(widgetId, tenantId);
      if (!widget) {
        return this.notFound(reply, 'Widget not found');
      }
      
      // Get data based on widget configuration
      const dataSource = widget.data_source || {};
      const metricType = (dataSource.metricType as MetricType) || MetricType.REVENUE;
      const granularity: TimeGranularity = dataSource.granularity || { unit: 'day', value: 1 };
      
      const dateRange = {
        startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: endDate ? new Date(endDate) : new Date()
      };
      
      const data = await aggregationService.aggregateMetrics(
        tenantId,
        metricType,
        dateRange,
        granularity
      );
      
      return this.success(reply, { data });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  createWidget = async (
    request: FastifyRequest<{ Body: CreateWidgetBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const body = request.body;
      const tenantId = request.user?.tenantId || '';
      
      const widget = await WidgetModel.create({
        tenant_id: tenantId,
        dashboard_id: body.dashboardId,
        widget_type: body.type,
        title: body.title,
        configuration: body.config,
        data_source: body.config.dataSource || {},
        position: body.position,
        size: body.size,
        style: body.config.style || {},
        refresh_interval: body.config.refreshInterval || 60,
      });
      
      return this.success(reply, { widget }, 201);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  updateWidget = async (
    request: FastifyRequest<{ Params: WidgetParams; Body: UpdateWidgetBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { widgetId } = request.params;
      const body = request.body;
      const tenantId = request.user?.tenantId || '';
      
      const updates: Record<string, any> = {};
      if (body.title !== undefined) updates.title = body.title;
      if (body.config !== undefined) updates.configuration = body.config;
      if (body.position !== undefined) updates.position = body.position;
      if (body.size !== undefined) updates.size = body.size;
      
      const widget = await WidgetModel.update(widgetId, tenantId, updates);
      if (!widget) {
        return this.notFound(reply, 'Widget not found');
      }
      return this.success(reply, { widget });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  deleteWidget = async (
    request: FastifyRequest<{ Params: WidgetParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { widgetId } = request.params;
      const tenantId = request.user?.tenantId || '';
      
      const deleted = await WidgetModel.delete(widgetId, tenantId);
      if (!deleted) {
        return this.notFound(reply, 'Widget not found');
      }
      return this.success(reply, { message: 'Widget deleted' });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  moveWidget = async (
    request: FastifyRequest<{ Params: WidgetParams; Body: MoveWidgetBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { widgetId } = request.params;
      const { targetDashboardId, position } = request.body;
      const tenantId = request.user?.tenantId || '';
      
      const updates: Record<string, any> = {
        dashboard_id: targetDashboardId
      };
      if (position) {
        updates.position = position;
      }
      
      const widget = await WidgetModel.update(widgetId, tenantId, updates);
      if (!widget) {
        return this.notFound(reply, 'Widget not found');
      }
      return this.success(reply, { widget });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  duplicateWidget = async (
    request: FastifyRequest<{ Params: WidgetParams; Body: DuplicateWidgetBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { widgetId } = request.params;
      const { targetDashboardId } = request.body;
      const tenantId = request.user?.tenantId || '';
      
      // Get the source widget
      const sourceWidget = await WidgetModel.findById(widgetId, tenantId);
      if (!sourceWidget) {
        return this.notFound(reply, 'Widget not found');
      }
      
      // Create a duplicate
      const duplicatedWidget = await WidgetModel.create({
        tenant_id: tenantId,
        dashboard_id: targetDashboardId || sourceWidget.dashboard_id,
        widget_type: sourceWidget.widget_type,
        title: `${sourceWidget.title} (Copy)`,
        configuration: sourceWidget.configuration,
        data_source: sourceWidget.data_source,
        position: {
          ...sourceWidget.position,
          x: (sourceWidget.position as any).x + 1,
          y: (sourceWidget.position as any).y + 1
        },
        size: sourceWidget.size,
        style: sourceWidget.style,
        refresh_interval: sourceWidget.refresh_interval,
      });
      
      return this.success(reply, { widget: duplicatedWidget }, 201);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  exportWidgetData = async (
    request: FastifyRequest<{ Params: WidgetParams; Body: ExportWidgetBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { widgetId } = request.params;
      const { format, startDate, endDate } = request.body;
      const userId = request.user?.id || 'system';
      const tenantId = request.user?.tenantId || '';
      
      // Get the widget
      const widget = await WidgetModel.findById(widgetId, tenantId);
      if (!widget) {
        return this.notFound(reply, 'Widget not found');
      }
      
      // Map format string to ExportFormat enum
      const formatMap: Record<string, ExportFormat> = {
        'csv': ExportFormat.CSV,
        'xlsx': ExportFormat.XLSX,
        'json': ExportFormat.JSON,
      };
      
      // Create export request
      const exportRequest = await exportService.createExport({
        venueId: tenantId,
        userId: userId,
        type: ExportType.ANALYTICS_REPORT,
        format: formatMap[format] || ExportFormat.CSV,
        filters: {
          widgetId: widgetId,
          widgetType: widget.widget_type,
          dateRange: {
            start: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            end: endDate ? new Date(endDate) : new Date()
          }
        },
        options: {
          widgetConfig: widget.configuration
        }
      });
      
      return this.success(reply, { exportId: exportRequest.id });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };
}

export const widgetController = new WidgetController();
