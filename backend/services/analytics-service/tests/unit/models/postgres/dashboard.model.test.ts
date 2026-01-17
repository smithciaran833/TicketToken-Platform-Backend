/**
 * Dashboard Model Unit Tests
 */

const mockFirst = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockInsert = jest.fn().mockReturnThis();
const mockUpdate = jest.fn().mockReturnThis();
const mockReturning = jest.fn();
const mockDelete = jest.fn();
const mockOrderBy = jest.fn();

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

import { DashboardModel, Dashboard } from '../../../../src/models/postgres/dashboard.model';

describe('DashboardModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnThis();
    mockInsert.mockReturnThis();
    mockUpdate.mockReturnThis();
    // orderBy returns chainable object with where method for additional filtering
    mockOrderBy.mockReturnValue({
      where: mockWhere,
    });
  });

  describe('create', () => {
    it('should create dashboard and return it', async () => {
      const dashboardData = {
        tenant_id: 'tenant-1',
        name: 'Main Dashboard',
        type: 'analytics',
        layout: { columns: 3 },
        filters: {},
        visibility: 'public',
        created_by: 'user-1',
        is_default: false,
        display_order: 1,
      };
      const created = { id: 'dash-1', ...dashboardData };
      mockReturning.mockResolvedValue([created]);

      const result = await DashboardModel.create(dashboardData as any);

      expect(result).toEqual(created);
      expect(mockDb).toHaveBeenCalledWith('analytics_dashboards');
      expect(mockInsert).toHaveBeenCalledWith(dashboardData);
    });
  });

  describe('findById', () => {
    it('should find dashboard by id and tenant', async () => {
      const dashboard = { id: 'dash-1', tenant_id: 'tenant-1', name: 'Test' };
      mockFirst.mockResolvedValue(dashboard);

      const result = await DashboardModel.findById('dash-1', 'tenant-1');

      expect(result).toEqual(dashboard);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'dash-1', tenant_id: 'tenant-1' });
    });

    it('should return null if not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await DashboardModel.findById('non-existent', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should find all dashboards for tenant', async () => {
      const dashboards = [
        { id: 'dash-1', name: 'Dashboard 1' },
        { id: 'dash-2', name: 'Dashboard 2' },
      ];
      // When no options, orderBy is terminal
      mockOrderBy.mockResolvedValue(dashboards);

      const result = await DashboardModel.findByTenant('tenant-1');

      expect(result).toEqual(dashboards);
      expect(mockWhere).toHaveBeenCalledWith({ tenant_id: 'tenant-1' });
      expect(mockOrderBy).toHaveBeenCalledWith('display_order', 'asc');
    });

    it('should filter by type', async () => {
      // When options provided, orderBy returns chainable, where returns data
      mockOrderBy.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });

      await DashboardModel.findByTenant('tenant-1', { type: 'sales' });

      expect(mockOrderBy).toHaveBeenCalledWith('display_order', 'asc');
    });

    it('should filter by createdBy', async () => {
      mockOrderBy.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });

      await DashboardModel.findByTenant('tenant-1', { createdBy: 'user-1' });

      expect(mockOrderBy).toHaveBeenCalledWith('display_order', 'asc');
    });

    it('should filter by visibility', async () => {
      mockOrderBy.mockReturnValue({ where: jest.fn().mockResolvedValue([]) });

      await DashboardModel.findByTenant('tenant-1', { visibility: 'private' });

      expect(mockOrderBy).toHaveBeenCalledWith('display_order', 'asc');
    });
  });

  describe('findDefault', () => {
    it('should find default dashboard for tenant', async () => {
      const dashboard = { id: 'dash-1', is_default: true };
      mockFirst.mockResolvedValue(dashboard);

      const result = await DashboardModel.findDefault('tenant-1');

      expect(result).toEqual(dashboard);
      expect(mockWhere).toHaveBeenCalledWith({ tenant_id: 'tenant-1', is_default: true });
    });

    it('should filter by type', async () => {
      mockFirst.mockResolvedValue(null);

      await DashboardModel.findDefault('tenant-1', 'analytics');

      expect(mockWhere).toHaveBeenCalledWith('type', 'analytics');
    });

    it('should return null if no default', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await DashboardModel.findDefault('tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update dashboard', async () => {
      const updates = { name: 'Updated Dashboard' };
      const updated = { id: 'dash-1', name: 'Updated Dashboard' };
      mockReturning.mockResolvedValue([updated]);

      const result = await DashboardModel.update('dash-1', 'tenant-1', updates);

      expect(result).toEqual(updated);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'dash-1', tenant_id: 'tenant-1' });
      expect(mockUpdate).toHaveBeenCalledWith(updates);
    });

    it('should return null if not found', async () => {
      mockReturning.mockResolvedValue([]);

      const result = await DashboardModel.update('non-existent', 'tenant-1', {});

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete dashboard', async () => {
      mockDelete.mockResolvedValue(1);

      const result = await DashboardModel.delete('dash-1', 'tenant-1');

      expect(result).toBe(true);
    });

    it('should return false if not found', async () => {
      mockDelete.mockResolvedValue(0);

      const result = await DashboardModel.delete('non-existent', 'tenant-1');

      expect(result).toBe(false);
    });
  });

  describe('setDefault', () => {
    it('should set dashboard as default', async () => {
      const dashboard = { id: 'dash-1', type: 'analytics', is_default: false };
      mockFirst.mockResolvedValue(dashboard);
      mockReturning.mockResolvedValue([{ ...dashboard, is_default: true }]);

      const result = await DashboardModel.setDefault('dash-1', 'tenant-1');

      expect(result?.is_default).toBe(true);
    });

    it('should return null if dashboard not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await DashboardModel.setDefault('non-existent', 'tenant-1');

      expect(result).toBeNull();
    });

    it('should only unset defaults of same type', async () => {
      const dashboard = { id: 'dash-1', type: 'sales', is_default: false };
      mockFirst.mockResolvedValue(dashboard);
      mockReturning.mockResolvedValue([{ ...dashboard, is_default: true }]);

      await DashboardModel.setDefault('dash-1', 'tenant-1');

      expect(mockWhere).toHaveBeenCalledWith({ tenant_id: 'tenant-1', type: 'sales' });
    });
  });
});
