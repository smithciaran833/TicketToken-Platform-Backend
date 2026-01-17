/**
 * Widget Controller Unit Tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockWidgetModel = {
  findByDashboard: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../../../src/models', () => ({
  WidgetModel: mockWidgetModel,
}));

const mockAggregationService = {
  aggregateMetrics: jest.fn(),
};

jest.mock('../../../src/services/aggregation.service', () => ({
  aggregationService: mockAggregationService,
}));

const mockExportService = {
  createExport: jest.fn(),
};

jest.mock('../../../src/services/export.service', () => ({
  exportService: mockExportService,
}));

import { widgetController } from '../../../src/controllers/widget.controller';
import { MetricType, ExportType, ExportFormat } from '../../../src/types';

describe('WidgetController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
      log: { error: jest.fn(), info: jest.fn() },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('getWidgets', () => {
    beforeEach(() => {
      mockRequest.params = { dashboardId: 'dash-123' };
    });

    it('should return widgets for dashboard', async () => {
      const mockWidgets = [
        { id: 'widget-1', title: 'Revenue Chart', widget_type: 'line' },
        { id: 'widget-2', title: 'Sales Table', widget_type: 'table' },
      ];
      mockWidgetModel.findByDashboard.mockResolvedValue(mockWidgets);

      await widgetController.getWidgets(mockRequest, mockReply);

      expect(mockWidgetModel.findByDashboard).toHaveBeenCalledWith('dash-123', 'tenant-123');
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { widgets: mockWidgets },
      });
    });

    it('should return empty array when no widgets exist', async () => {
      mockWidgetModel.findByDashboard.mockResolvedValue([]);

      await widgetController.getWidgets(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { widgets: [] },
      });
    });

    it('should use empty string for tenantId when user not authenticated', async () => {
      mockRequest.user = undefined;
      mockWidgetModel.findByDashboard.mockResolvedValue([]);

      await widgetController.getWidgets(mockRequest, mockReply);

      expect(mockWidgetModel.findByDashboard).toHaveBeenCalledWith('dash-123', '');
    });

    it('should handle model errors', async () => {
      mockWidgetModel.findByDashboard.mockRejectedValue(new Error('Database error'));

      await widgetController.getWidgets(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          message: 'Database error',
        }),
      });
    });
  });

  describe('getWidget', () => {
    beforeEach(() => {
      mockRequest.params = { widgetId: 'widget-123' };
    });

    it('should return widget when found', async () => {
      const mockWidget = {
        id: 'widget-123',
        title: 'Revenue Chart',
        widget_type: 'line',
        configuration: { color: 'blue' },
      };
      mockWidgetModel.findById.mockResolvedValue(mockWidget);

      await widgetController.getWidget(mockRequest, mockReply);

      expect(mockWidgetModel.findById).toHaveBeenCalledWith('widget-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { widget: mockWidget },
      });
    });

    it('should return 404 when widget not found', async () => {
      mockWidgetModel.findById.mockResolvedValue(null);

      await widgetController.getWidget(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Widget not found',
          statusCode: 404,
        },
      });
    });

    it('should handle model errors', async () => {
      mockWidgetModel.findById.mockRejectedValue(new Error('Connection failed'));

      await widgetController.getWidget(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getWidgetData', () => {
    beforeEach(() => {
      mockRequest.params = { widgetId: 'widget-123' };
      mockRequest.query = {};
    });

    it('should return aggregated data for widget', async () => {
      const mockWidget = {
        id: 'widget-123',
        data_source: {
          metricType: MetricType.REVENUE,
          granularity: { unit: 'hour', value: 1 },
        },
      };
      mockWidgetModel.findById.mockResolvedValue(mockWidget);

      const mockData = [
        { timestamp: '2024-01-01T00:00:00Z', value: 1000 },
        { timestamp: '2024-01-01T01:00:00Z', value: 1500 },
      ];
      mockAggregationService.aggregateMetrics.mockResolvedValue(mockData);

      await widgetController.getWidgetData(mockRequest, mockReply);

      expect(mockAggregationService.aggregateMetrics).toHaveBeenCalledWith(
        'tenant-123',
        MetricType.REVENUE,
        expect.objectContaining({
          startDate: expect.any(Date),
          endDate: expect.any(Date),
        }),
        { unit: 'hour', value: 1 }
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { data: mockData },
      });
    });

    it('should use custom date range when provided', async () => {
      mockRequest.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };
      const mockWidget = {
        id: 'widget-123',
        data_source: {},
      };
      mockWidgetModel.findById.mockResolvedValue(mockWidget);
      mockAggregationService.aggregateMetrics.mockResolvedValue([]);

      await widgetController.getWidgetData(mockRequest, mockReply);

      expect(mockAggregationService.aggregateMetrics).toHaveBeenCalledWith(
        'tenant-123',
        expect.any(String),
        expect.objectContaining({
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
        }),
        expect.any(Object)
      );
    });

    it('should use default REVENUE metric type when not specified', async () => {
      const mockWidget = {
        id: 'widget-123',
        data_source: {},
      };
      mockWidgetModel.findById.mockResolvedValue(mockWidget);
      mockAggregationService.aggregateMetrics.mockResolvedValue([]);

      await widgetController.getWidgetData(mockRequest, mockReply);

      expect(mockAggregationService.aggregateMetrics).toHaveBeenCalledWith(
        'tenant-123',
        MetricType.REVENUE,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should return 404 when widget not found', async () => {
      mockWidgetModel.findById.mockResolvedValue(null);

      await widgetController.getWidgetData(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockAggregationService.aggregateMetrics).not.toHaveBeenCalled();
    });

    it('should handle aggregation service errors', async () => {
      mockWidgetModel.findById.mockResolvedValue({ id: 'widget-123', data_source: {} });
      mockAggregationService.aggregateMetrics.mockRejectedValue(new Error('Aggregation failed'));

      await widgetController.getWidgetData(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('createWidget', () => {
    beforeEach(() => {
      mockRequest.body = {
        dashboardId: 'dash-123',
        type: 'line',
        title: 'New Widget',
        config: {
          dataSource: { metricType: 'revenue' },
          style: { color: 'blue' },
          refreshInterval: 30,
        },
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
      };
    });

    it('should create widget with all properties', async () => {
      const createdWidget = {
        id: 'widget-new',
        ...mockRequest.body,
      };
      mockWidgetModel.create.mockResolvedValue(createdWidget);

      await widgetController.createWidget(mockRequest, mockReply);

      expect(mockWidgetModel.create).toHaveBeenCalledWith({
        tenant_id: 'tenant-123',
        dashboard_id: 'dash-123',
        widget_type: 'line',
        title: 'New Widget',
        configuration: mockRequest.body.config,
        data_source: { metricType: 'revenue' },
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
        style: { color: 'blue' },
        refresh_interval: 30,
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { widget: createdWidget },
      });
    });

    it('should use default refresh interval when not specified', async () => {
      mockRequest.body.config = { dataSource: {} };
      mockWidgetModel.create.mockResolvedValue({ id: 'widget-new' });

      await widgetController.createWidget(mockRequest, mockReply);

      expect(mockWidgetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          refresh_interval: 60,
        })
      );
    });

    it('should use empty object for style when not specified', async () => {
      mockRequest.body.config = {};
      mockWidgetModel.create.mockResolvedValue({ id: 'widget-new' });

      await widgetController.createWidget(mockRequest, mockReply);

      expect(mockWidgetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          style: {},
          data_source: {},
        })
      );
    });

    it('should handle model errors', async () => {
      mockWidgetModel.create.mockRejectedValue(new Error('Insert failed'));

      await widgetController.createWidget(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('updateWidget', () => {
    beforeEach(() => {
      mockRequest.params = { widgetId: 'widget-123' };
      mockRequest.body = {
        title: 'Updated Title',
        config: { color: 'red' },
        position: { x: 2, y: 2 },
        size: { width: 6, height: 4 },
      };
    });

    it('should update widget with all provided fields', async () => {
      const updatedWidget = { id: 'widget-123', ...mockRequest.body };
      mockWidgetModel.update.mockResolvedValue(updatedWidget);

      await widgetController.updateWidget(mockRequest, mockReply);

      expect(mockWidgetModel.update).toHaveBeenCalledWith(
        'widget-123',
        'tenant-123',
        {
          title: 'Updated Title',
          configuration: { color: 'red' },
          position: { x: 2, y: 2 },
          size: { width: 6, height: 4 },
        }
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { widget: updatedWidget },
      });
    });

    it('should update only provided fields', async () => {
      mockRequest.body = { title: 'Only Title' };
      mockWidgetModel.update.mockResolvedValue({ id: 'widget-123', title: 'Only Title' });

      await widgetController.updateWidget(mockRequest, mockReply);

      expect(mockWidgetModel.update).toHaveBeenCalledWith(
        'widget-123',
        'tenant-123',
        { title: 'Only Title' }
      );
    });

    it('should return 404 when widget not found', async () => {
      mockWidgetModel.update.mockResolvedValue(null);

      await widgetController.updateWidget(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Widget not found',
          statusCode: 404,
        },
      });
    });

    it('should handle empty update body', async () => {
      mockRequest.body = {};
      mockWidgetModel.update.mockResolvedValue({ id: 'widget-123' });

      await widgetController.updateWidget(mockRequest, mockReply);

      expect(mockWidgetModel.update).toHaveBeenCalledWith('widget-123', 'tenant-123', {});
    });
  });

  describe('deleteWidget', () => {
    beforeEach(() => {
      mockRequest.params = { widgetId: 'widget-123' };
    });

    it('should delete widget successfully', async () => {
      mockWidgetModel.delete.mockResolvedValue(true);

      await widgetController.deleteWidget(mockRequest, mockReply);

      expect(mockWidgetModel.delete).toHaveBeenCalledWith('widget-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Widget deleted' },
      });
    });

    it('should return 404 when widget not found', async () => {
      mockWidgetModel.delete.mockResolvedValue(false);

      await widgetController.deleteWidget(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Widget not found',
          statusCode: 404,
        },
      });
    });

    it('should handle model errors', async () => {
      mockWidgetModel.delete.mockRejectedValue(new Error('Delete failed'));

      await widgetController.deleteWidget(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('moveWidget', () => {
    beforeEach(() => {
      mockRequest.params = { widgetId: 'widget-123' };
      mockRequest.body = {
        targetDashboardId: 'dash-456',
        position: { x: 5, y: 3 },
      };
    });

    it('should move widget to new dashboard with position', async () => {
      const movedWidget = { id: 'widget-123', dashboard_id: 'dash-456' };
      mockWidgetModel.update.mockResolvedValue(movedWidget);

      await widgetController.moveWidget(mockRequest, mockReply);

      expect(mockWidgetModel.update).toHaveBeenCalledWith(
        'widget-123',
        'tenant-123',
        {
          dashboard_id: 'dash-456',
          position: { x: 5, y: 3 },
        }
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { widget: movedWidget },
      });
    });

    it('should move widget without position change', async () => {
      mockRequest.body = { targetDashboardId: 'dash-456' };
      mockWidgetModel.update.mockResolvedValue({ id: 'widget-123' });

      await widgetController.moveWidget(mockRequest, mockReply);

      expect(mockWidgetModel.update).toHaveBeenCalledWith(
        'widget-123',
        'tenant-123',
        { dashboard_id: 'dash-456' }
      );
    });

    it('should return 404 when widget not found', async () => {
      mockWidgetModel.update.mockResolvedValue(null);

      await widgetController.moveWidget(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });
  });

  describe('duplicateWidget', () => {
    beforeEach(() => {
      mockRequest.params = { widgetId: 'widget-123' };
      mockRequest.body = {};
    });

    it('should duplicate widget to same dashboard', async () => {
      const sourceWidget = {
        id: 'widget-123',
        dashboard_id: 'dash-123',
        widget_type: 'line',
        title: 'Original',
        configuration: { color: 'blue' },
        data_source: { metricType: 'revenue' },
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
        style: { border: true },
        refresh_interval: 60,
      };
      mockWidgetModel.findById.mockResolvedValue(sourceWidget);

      const duplicatedWidget = { id: 'widget-456', title: 'Original (Copy)' };
      mockWidgetModel.create.mockResolvedValue(duplicatedWidget);

      await widgetController.duplicateWidget(mockRequest, mockReply);

      expect(mockWidgetModel.create).toHaveBeenCalledWith({
        tenant_id: 'tenant-123',
        dashboard_id: 'dash-123',
        widget_type: 'line',
        title: 'Original (Copy)',
        configuration: { color: 'blue' },
        data_source: { metricType: 'revenue' },
        position: { x: 1, y: 1 },
        size: { width: 4, height: 3 },
        style: { border: true },
        refresh_interval: 60,
      });
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should duplicate widget to different dashboard', async () => {
      mockRequest.body = { targetDashboardId: 'dash-999' };
      const sourceWidget = {
        id: 'widget-123',
        dashboard_id: 'dash-123',
        widget_type: 'bar',
        title: 'Source',
        configuration: {},
        data_source: {},
        position: { x: 2, y: 2 },
        size: { width: 2, height: 2 },
        style: {},
        refresh_interval: 30,
      };
      mockWidgetModel.findById.mockResolvedValue(sourceWidget);
      mockWidgetModel.create.mockResolvedValue({ id: 'widget-new' });

      await widgetController.duplicateWidget(mockRequest, mockReply);

      expect(mockWidgetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboard_id: 'dash-999',
        })
      );
    });

    it('should return 404 when source widget not found', async () => {
      mockWidgetModel.findById.mockResolvedValue(null);

      await widgetController.duplicateWidget(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockWidgetModel.create).not.toHaveBeenCalled();
    });

    it('should offset position by 1 in both directions', async () => {
      const sourceWidget = {
        id: 'widget-123',
        dashboard_id: 'dash-123',
        widget_type: 'pie',
        title: 'Test',
        configuration: {},
        data_source: {},
        position: { x: 5, y: 10 },
        size: { width: 3, height: 3 },
        style: {},
        refresh_interval: 60,
      };
      mockWidgetModel.findById.mockResolvedValue(sourceWidget);
      mockWidgetModel.create.mockResolvedValue({ id: 'widget-dup' });

      await widgetController.duplicateWidget(mockRequest, mockReply);

      expect(mockWidgetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          position: { x: 6, y: 11 },
        })
      );
    });
  });

  describe('exportWidgetData', () => {
    beforeEach(() => {
      mockRequest.params = { widgetId: 'widget-123' };
      mockRequest.body = {
        format: 'csv',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };
    });

    it('should create export request for widget data', async () => {
      const mockWidget = {
        id: 'widget-123',
        widget_type: 'table',
        configuration: { columns: ['date', 'value'] },
      };
      mockWidgetModel.findById.mockResolvedValue(mockWidget);
      mockExportService.createExport.mockResolvedValue({ id: 'export-789' });

      await widgetController.exportWidgetData(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith({
        venueId: 'tenant-123',
        userId: 'user-123',
        type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        filters: {
          widgetId: 'widget-123',
          widgetType: 'table',
          dateRange: {
            start: new Date('2024-01-01'),
            end: new Date('2024-01-31'),
          },
        },
        options: {
          widgetConfig: { columns: ['date', 'value'] },
        },
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { exportId: 'export-789' },
      });
    });

    it('should handle xlsx format', async () => {
      mockRequest.body.format = 'xlsx';
      mockWidgetModel.findById.mockResolvedValue({ id: 'widget-123', widget_type: 'chart' });
      mockExportService.createExport.mockResolvedValue({ id: 'export-xlsx' });

      await widgetController.exportWidgetData(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: ExportFormat.XLSX,
        })
      );
    });

    it('should handle json format', async () => {
      mockRequest.body.format = 'json';
      mockWidgetModel.findById.mockResolvedValue({ id: 'widget-123', widget_type: 'data' });
      mockExportService.createExport.mockResolvedValue({ id: 'export-json' });

      await widgetController.exportWidgetData(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: ExportFormat.JSON,
        })
      );
    });

    it('should use default date range when not specified', async () => {
      mockRequest.body = { format: 'csv' };
      mockWidgetModel.findById.mockResolvedValue({ id: 'widget-123', widget_type: 'chart' });
      mockExportService.createExport.mockResolvedValue({ id: 'export-default' });

      await widgetController.exportWidgetData(mockRequest, mockReply);

      const createCall = mockExportService.createExport.mock.calls[0][0];
      expect(createCall.filters.dateRange.start).toBeInstanceOf(Date);
      expect(createCall.filters.dateRange.end).toBeInstanceOf(Date);
      // Default is 30 days ago to now
      const daysDiff = (createCall.filters.dateRange.end - createCall.filters.dateRange.start) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(30, 0);
    });

    it('should return 404 when widget not found', async () => {
      mockWidgetModel.findById.mockResolvedValue(null);

      await widgetController.exportWidgetData(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockExportService.createExport).not.toHaveBeenCalled();
    });

    it('should use system user ID when not authenticated', async () => {
      mockRequest.user = undefined;
      mockWidgetModel.findById.mockResolvedValue({ id: 'widget-123', widget_type: 'chart' });
      mockExportService.createExport.mockResolvedValue({ id: 'export-sys' });

      await widgetController.exportWidgetData(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system',
          venueId: '',
        })
      );
    });

    it('should handle export service errors', async () => {
      mockWidgetModel.findById.mockResolvedValue({ id: 'widget-123', widget_type: 'chart' });
      mockExportService.createExport.mockRejectedValue(new Error('Export queue full'));

      await widgetController.exportWidgetData(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });
});
