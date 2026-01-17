/**
 * Widget Model Unit Tests
 */

const mockFirst = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockInsert = jest.fn().mockReturnThis();
const mockUpdate = jest.fn().mockReturnThis();
const mockReturning = jest.fn();
const mockDelete = jest.fn();
const mockOrderBy = jest.fn().mockReturnThis();

const mockDb = jest.fn(() => ({
  where: mockWhere,
  first: mockFirst,
  insert: mockInsert,
  update: mockUpdate,
  returning: mockReturning,
  delete: mockDelete,
  orderBy: mockOrderBy,
}));

jest.mock('../../../../src/config/database', () => ({
  getDb: () => mockDb,
}));

import { WidgetModel, Widget } from '../../../../src/models/postgres/widget.model';

describe('WidgetModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnThis();
    mockInsert.mockReturnThis();
    mockUpdate.mockReturnThis();
    mockOrderBy.mockReturnThis();
  });

  describe('create', () => {
    it('should create widget and return it', async () => {
      const widgetData = {
        tenant_id: 'tenant-1',
        dashboard_id: 'dash-1',
        widget_type: 'chart',
        title: 'Revenue Chart',
        configuration: { chartType: 'line' },
        data_source: { metric: 'revenue' },
        position: { x: 0, y: 0 },
        size: { width: 4, height: 3 },
        style: {},
        refresh_interval: 60,
      };
      const created = { id: 'widget-1', ...widgetData };
      mockReturning.mockResolvedValue([created]);

      const result = await WidgetModel.create(widgetData as any);

      expect(result).toEqual(created);
      expect(mockDb).toHaveBeenCalledWith('analytics_widgets');
      expect(mockInsert).toHaveBeenCalledWith(widgetData);
    });
  });

  describe('findById', () => {
    it('should find widget by id and tenant', async () => {
      const widget = { id: 'widget-1', tenant_id: 'tenant-1', title: 'Test' };
      mockFirst.mockResolvedValue(widget);

      const result = await WidgetModel.findById('widget-1', 'tenant-1');

      expect(result).toEqual(widget);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'widget-1', tenant_id: 'tenant-1' });
    });

    it('should return null if not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await WidgetModel.findById('non-existent', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('findByDashboard', () => {
    it('should find all widgets for dashboard', async () => {
      const widgets = [
        { id: 'widget-1', dashboard_id: 'dash-1' },
        { id: 'widget-2', dashboard_id: 'dash-1' },
      ];
      mockOrderBy.mockResolvedValue(widgets);

      const result = await WidgetModel.findByDashboard('dash-1', 'tenant-1');

      expect(result).toEqual(widgets);
      expect(mockWhere).toHaveBeenCalledWith({
        dashboard_id: 'dash-1',
        tenant_id: 'tenant-1',
      });
      expect(mockOrderBy).toHaveBeenCalledWith('created_at', 'asc');
    });
  });

  describe('findByType', () => {
    it('should find widgets by type', async () => {
      const widgets = [{ id: 'widget-1', widget_type: 'chart' }];
      mockOrderBy.mockResolvedValue(widgets);

      const result = await WidgetModel.findByType('chart', 'tenant-1');

      expect(result).toEqual(widgets);
      expect(mockWhere).toHaveBeenCalledWith({
        widget_type: 'chart',
        tenant_id: 'tenant-1',
      });
      expect(mockOrderBy).toHaveBeenCalledWith('created_at', 'desc');
    });
  });

  describe('update', () => {
    it('should update widget and return it', async () => {
      const updates = { title: 'Updated Title', refresh_interval: 120 };
      const updated = { id: 'widget-1', ...updates };
      mockReturning.mockResolvedValue([updated]);

      const result = await WidgetModel.update('widget-1', 'tenant-1', updates);

      expect(result).toEqual(updated);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'widget-1', tenant_id: 'tenant-1' });
      expect(mockUpdate).toHaveBeenCalledWith(updates);
    });

    it('should return null if not found', async () => {
      mockReturning.mockResolvedValue([]);

      const result = await WidgetModel.update('non-existent', 'tenant-1', {});

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete widget and return true', async () => {
      mockDelete.mockResolvedValue(1);

      const result = await WidgetModel.delete('widget-1', 'tenant-1');

      expect(result).toBe(true);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'widget-1', tenant_id: 'tenant-1' });
    });

    it('should return false if not found', async () => {
      mockDelete.mockResolvedValue(0);

      const result = await WidgetModel.delete('non-existent', 'tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('deleteByDashboard', () => {
    it('should delete all widgets for dashboard', async () => {
      mockDelete.mockResolvedValue(5);

      const result = await WidgetModel.deleteByDashboard('dash-1', 'tenant-1');

      expect(result).toBe(5);
      expect(mockWhere).toHaveBeenCalledWith({
        dashboard_id: 'dash-1',
        tenant_id: 'tenant-1',
      });
    });

    it('should return 0 if no widgets found', async () => {
      mockDelete.mockResolvedValue(0);

      const result = await WidgetModel.deleteByDashboard('dash-empty', 'tenant-1');

      expect(result).toBe(0);
    });
  });
});
