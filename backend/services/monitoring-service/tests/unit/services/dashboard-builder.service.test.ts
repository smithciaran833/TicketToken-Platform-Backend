// Mock dependencies BEFORE imports
const mockDbRaw = jest.fn();

jest.mock('../../../src/config/database', () => ({
  db: { raw: mockDbRaw },
}));

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { DashboardBuilderService, dashboardBuilderService, Dashboard } from '../../../src/services/dashboard-builder.service';
import { logger } from '../../../src/logger';

describe('DashboardBuilderService', () => {
  let service: DashboardBuilderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DashboardBuilderService();
    mockDbRaw.mockResolvedValue({ rows: [] });
  });

  describe('createDashboard', () => {
    it('should create dashboard with all fields', async () => {
      const dashboardData: Dashboard = {
        user_id: 'user-123',
        name: 'My Dashboard',
        description: 'Test dashboard',
        layout: { widgets: [{ type: 'chart' }] },
        filters: { date_range: '7d' },
        is_public: true,
      };
      const createdRow = {
        id: 'dash-456',
        ...dashboardData,
        layout: JSON.stringify(dashboardData.layout),
        filters: JSON.stringify(dashboardData.filters),
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbRaw.mockResolvedValue({ rows: [createdRow] });

      const result = await service.createDashboard(dashboardData);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO dashboards'),
        [
          'user-123',
          'My Dashboard',
          'Test dashboard',
          JSON.stringify({ widgets: [{ type: 'chart' }] }),
          JSON.stringify({ date_range: '7d' }),
          true,
        ]
      );
      expect(result.id).toBe('dash-456');
      expect(result.name).toBe('My Dashboard');
    });

    it('should use empty string for missing description', async () => {
      const dashboardData: Dashboard = {
        user_id: 'user-123',
        name: 'No Description',
        layout: {},
        is_public: false,
      };
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'dash-1', ...dashboardData }] });

      await service.createDashboard(dashboardData);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([''])
      );
    });

    it('should use empty object for missing filters', async () => {
      const dashboardData: Dashboard = {
        user_id: 'user-123',
        name: 'No Filters',
        layout: {},
        is_public: false,
      };
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'dash-1', ...dashboardData }] });

      await service.createDashboard(dashboardData);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['{}'])
      );
    });

    it('should log dashboard creation', async () => {
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'dash-new' }] });

      await service.createDashboard({
        user_id: 'user-1',
        name: 'Test',
        layout: {},
        is_public: false,
      });

      expect(logger.info).toHaveBeenCalledWith('Dashboard created', { id: 'dash-new' });
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Insert failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(
        service.createDashboard({
          user_id: 'user-1',
          name: 'Test',
          layout: {},
          is_public: false,
        })
      ).rejects.toThrow('Insert failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to create dashboard:', dbError);
    });
  });

  describe('getDashboard', () => {
    it('should return dashboard when found', async () => {
      const mockRow = {
        id: 'dash-123',
        user_id: 'user-1',
        name: 'Test Dashboard',
        description: 'A test',
        layout: JSON.stringify({ widgets: [] }),
        filters: JSON.stringify({ date: '7d' }),
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbRaw.mockResolvedValue({ rows: [mockRow] });

      const result = await service.getDashboard('dash-123');

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM dashboards WHERE id = ?'),
        ['dash-123']
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe('dash-123');
      expect(result!.layout).toEqual({ widgets: [] });
    });

    it('should return null when dashboard not found', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      const result = await service.getDashboard('nonexistent');

      expect(result).toBeNull();
    });

    it('should parse JSON layout from string', async () => {
      const layout = { widgets: [{ id: 1, type: 'chart' }] };
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'dash-1', layout: JSON.stringify(layout), filters: '{}' }],
      });

      const result = await service.getDashboard('dash-1');

      expect(result!.layout).toEqual(layout);
    });

    it('should handle already parsed layout object', async () => {
      const layout = { widgets: [] };
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'dash-1', layout: layout, filters: {} }],
      });

      const result = await service.getDashboard('dash-1');

      expect(result!.layout).toEqual(layout);
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Query failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.getDashboard('dash-1')).rejects.toThrow('Query failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to get dashboard:', dbError);
    });
  });

  describe('listDashboards', () => {
    it('should return user dashboards and public dashboards by default', async () => {
      const mockRows = [
        { id: 'dash-1', user_id: 'user-1', name: 'My Dashboard', layout: '{}', filters: '{}' },
        { id: 'dash-2', user_id: 'user-2', name: 'Public Dashboard', is_public: true, layout: '{}', filters: '{}' },
      ];
      mockDbRaw.mockResolvedValue({ rows: mockRows });

      const result = await service.listDashboards('user-1');

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('user_id = ?'),
        ['user-1']
      );
      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('OR is_public = TRUE'),
        expect.any(Array)
      );
      expect(result).toHaveLength(2);
    });

    it('should exclude public dashboards when includePublic is false', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      await service.listDashboards('user-1', false);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.not.stringContaining('is_public'),
        ['user-1']
      );
    });

    it('should order by created_at DESC', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      await service.listDashboards('user-1');

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no dashboards found', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      const result = await service.listDashboards('user-1');

      expect(result).toEqual([]);
    });

    it('should map all rows to Dashboard objects', async () => {
      mockDbRaw.mockResolvedValue({
        rows: [
          { id: 'dash-1', layout: '{}', filters: '{}' },
          { id: 'dash-2', layout: '{}', filters: '{}' },
        ],
      });

      const result = await service.listDashboards('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('dash-1');
      expect(result[1].id).toBe('dash-2');
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('List query failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.listDashboards('user-1')).rejects.toThrow('List query failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to list dashboards:', dbError);
    });
  });

  describe('updateDashboard', () => {
    it('should update dashboard with provided fields', async () => {
      const updates = {
        name: 'Updated Name',
        description: 'New description',
        layout: { widgets: [{ id: 1 }] },
        is_public: true,
      };
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'dash-1', ...updates, layout: JSON.stringify(updates.layout), filters: '{}' }],
      });

      const result = await service.updateDashboard('dash-1', updates);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE dashboards'),
        expect.arrayContaining(['Updated Name', 'New description', JSON.stringify({ widgets: [{ id: 1 }] }), true, 'dash-1'])
      );
      expect(result.name).toBe('Updated Name');
    });

    it('should only update provided fields', async () => {
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'dash-1', name: 'Only Name', layout: '{}', filters: '{}' }] });

      await service.updateDashboard('dash-1', { name: 'Only Name' });

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('name = ?'),
        expect.arrayContaining(['Only Name', 'dash-1'])
      );
    });

    it('should update filters when provided', async () => {
      const filters = { date_range: '30d', service: 'api' };
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'dash-1', filters: JSON.stringify(filters), layout: '{}' }] });

      await service.updateDashboard('dash-1', { filters });

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('filters = ?'),
        expect.arrayContaining([JSON.stringify(filters)])
      );
    });

    it('should always update updated_at', async () => {
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'dash-1', layout: '{}', filters: '{}' }] });

      await service.updateDashboard('dash-1', { name: 'Test' });

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should log dashboard update', async () => {
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'dash-1', layout: '{}', filters: '{}' }] });

      await service.updateDashboard('dash-1', { name: 'Updated' });

      expect(logger.info).toHaveBeenCalledWith('Dashboard updated', { id: 'dash-1' });
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Update failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.updateDashboard('dash-1', { name: 'Test' })).rejects.toThrow('Update failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to update dashboard:', dbError);
    });
  });

  describe('deleteDashboard', () => {
    it('should delete dashboard by id', async () => {
      mockDbRaw.mockResolvedValue({ rowCount: 1 });

      await service.deleteDashboard('dash-to-delete');

      expect(mockDbRaw).toHaveBeenCalledWith(
        'DELETE FROM dashboards WHERE id = ?',
        ['dash-to-delete']
      );
    });

    it('should log dashboard deletion', async () => {
      mockDbRaw.mockResolvedValue({ rowCount: 1 });

      await service.deleteDashboard('dash-123');

      expect(logger.info).toHaveBeenCalledWith('Dashboard deleted', { id: 'dash-123' });
    });

    it('should not throw when dashboard does not exist', async () => {
      mockDbRaw.mockResolvedValue({ rowCount: 0 });

      await expect(service.deleteDashboard('nonexistent')).resolves.toBeUndefined();
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Delete failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.deleteDashboard('dash-1')).rejects.toThrow('Delete failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to delete dashboard:', dbError);
    });
  });

  describe('duplicateDashboard', () => {
    it('should duplicate dashboard for new user', async () => {
      const originalDashboard = {
        id: 'original-dash',
        user_id: 'user-1',
        name: 'Original Dashboard',
        description: 'Original description',
        layout: { widgets: [{ id: 1 }] },
        filters: { date: '7d' },
        is_public: true,
      };
      
      // First call: getDashboard
      mockDbRaw.mockResolvedValueOnce({
        rows: [{
          ...originalDashboard,
          layout: JSON.stringify(originalDashboard.layout),
          filters: JSON.stringify(originalDashboard.filters),
        }],
      });
      
      // Second call: insert
      mockDbRaw.mockResolvedValueOnce({
        rows: [{
          id: 'new-dash',
          user_id: 'user-2',
          name: 'Original Dashboard (Copy)',
          layout: JSON.stringify(originalDashboard.layout),
          filters: JSON.stringify(originalDashboard.filters),
        }],
      });

      const result = await service.duplicateDashboard('original-dash', 'user-2');

      expect(result.name).toBe('Original Dashboard (Copy)');
      expect(result.id).toBe('new-dash');
    });

    it('should set is_public to false on duplicate', async () => {
      mockDbRaw
        .mockResolvedValueOnce({
          rows: [{ id: 'orig', name: 'Test', is_public: true, layout: '{}', filters: '{}' }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'new', name: 'Test (Copy)', is_public: false, layout: '{}', filters: '{}' }],
        });

      await service.duplicateDashboard('orig', 'user-2');

      expect(mockDbRaw).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.arrayContaining([false])
      );
    });

    it('should throw error when original dashboard not found', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      await expect(service.duplicateDashboard('nonexistent', 'user-2')).rejects.toThrow('Dashboard not found');
    });

    it('should log duplicate operation', async () => {
      mockDbRaw
        .mockResolvedValueOnce({ rows: [{ id: 'orig', name: 'Test', layout: '{}', filters: '{}' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'new', name: 'Test (Copy)', layout: '{}', filters: '{}' }] });

      await service.duplicateDashboard('orig', 'user-2');

      expect(logger.info).toHaveBeenCalledWith('Dashboard duplicated', {
        original_id: 'orig',
        new_id: 'new',
      });
    });

    it('should throw and log error on database failure', async () => {
      mockDbRaw.mockResolvedValueOnce({ rows: [{ id: 'orig', name: 'Test', layout: '{}', filters: '{}' }] });
      const dbError = new Error('Duplicate failed');
      mockDbRaw.mockRejectedValueOnce(dbError);

      await expect(service.duplicateDashboard('orig', 'user-2')).rejects.toThrow('Duplicate failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to duplicate dashboard:', dbError);
    });
  });

  describe('mapRowToDashboard', () => {
    it('should handle null is_public as false', async () => {
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'dash-1', is_public: null, layout: '{}', filters: '{}' }],
      });

      const result = await service.getDashboard('dash-1');

      expect(result!.is_public).toBe(false);
    });

    it('should handle undefined is_public as false', async () => {
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'dash-1', layout: '{}', filters: '{}' }],
      });

      const result = await service.getDashboard('dash-1');

      expect(result!.is_public).toBe(false);
    });
  });

  describe('exported instance', () => {
    it('should export dashboardBuilderService as singleton', () => {
      const { dashboardBuilderService: exported1 } = require('../../../src/services/dashboard-builder.service');
      const { dashboardBuilderService: exported2 } = require('../../../src/services/dashboard-builder.service');
      expect(exported1).toBe(exported2);
    });
  });
});
