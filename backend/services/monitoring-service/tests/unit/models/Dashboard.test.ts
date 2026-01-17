import { DashboardModel, IDashboard } from '../../../src/models/Dashboard';

describe('DashboardModel', () => {
  let dashboardModel: DashboardModel;
  let mockDb: any;
  let mockQueryBuilder: any;

  const createMockDashboard = (overrides: Partial<IDashboard> = {}): IDashboard => ({
    id: 'dashboard-123',
    name: 'Test Dashboard',
    description: 'A test dashboard',
    widgets: [
      { id: 'widget-1', type: 'chart', config: {} },
      { id: 'widget-2', type: 'metric', config: {} },
    ],
    layout: { columns: 2, rows: 2 },
    owner: 'user-456',
    shared: false,
    created_at: new Date('2024-01-15T10:00:00Z'),
    updated_at: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  });

  beforeEach(() => {
    mockQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      first: jest.fn(),
      update: jest.fn().mockReturnThis(),
      del: jest.fn(),
      returning: jest.fn(),
      orderBy: jest.fn().mockReturnThis(),
    };

    mockDb = jest.fn().mockReturnValue(mockQueryBuilder);
    dashboardModel = new DashboardModel(mockDb);
  });

  describe('constructor', () => {
    it('should use provided db instance', () => {
      const customDb = jest.fn();
      const model = new DashboardModel(customDb);

      expect(model).toBeInstanceOf(DashboardModel);
    });

    it('should use default db when none provided', () => {
      expect(() => new DashboardModel()).not.toThrow();
    });
  });

  describe('create', () => {
    it('should insert dashboard and return created record', async () => {
      const dashboardData: IDashboard = {
        name: 'New Dashboard',
        description: 'My new dashboard',
        owner: 'user-123',
      };

      const createdDashboard = createMockDashboard(dashboardData);
      mockQueryBuilder.returning.mockResolvedValue([createdDashboard]);

      const result = await dashboardModel.create(dashboardData);

      expect(mockDb).toHaveBeenCalledWith('dashboards');
      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(dashboardData);
      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(createdDashboard);
    });

    it('should handle dashboard with widgets', async () => {
      const widgets = [
        { id: 'w1', type: 'line-chart', config: { metric: 'cpu' } },
        { id: 'w2', type: 'gauge', config: { min: 0, max: 100 } },
        { id: 'w3', type: 'table', config: { columns: ['name', 'value'] } },
      ];

      const dashboardData: IDashboard = {
        name: 'Widget Dashboard',
        widgets,
        owner: 'user-123',
      };

      const createdDashboard = createMockDashboard(dashboardData);
      mockQueryBuilder.returning.mockResolvedValue([createdDashboard]);

      const result = await dashboardModel.create(dashboardData);

      expect(mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ widgets })
      );
      expect(result.widgets).toEqual(widgets);
    });

    it('should handle complex layout configuration', async () => {
      const layout = {
        columns: 12,
        rows: 4,
        breakpoints: { lg: 1200, md: 996, sm: 768 },
        positions: [
          { id: 'w1', x: 0, y: 0, w: 6, h: 2 },
          { id: 'w2', x: 6, y: 0, w: 6, h: 2 },
        ],
      };

      const dashboardData: IDashboard = {
        name: 'Layout Dashboard',
        layout,
        owner: 'user-123',
      };

      const createdDashboard = createMockDashboard(dashboardData);
      mockQueryBuilder.returning.mockResolvedValue([createdDashboard]);

      const result = await dashboardModel.create(dashboardData);

      expect(result.layout).toEqual(layout);
    });

    it('should create shared dashboard', async () => {
      const dashboardData: IDashboard = {
        name: 'Shared Dashboard',
        owner: 'user-123',
        shared: true,
      };

      const createdDashboard = createMockDashboard(dashboardData);
      mockQueryBuilder.returning.mockResolvedValue([createdDashboard]);

      const result = await dashboardModel.create(dashboardData);

      expect(result.shared).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return dashboard when found', async () => {
      const dashboard = createMockDashboard();
      mockQueryBuilder.first.mockResolvedValue(dashboard);

      const result = await dashboardModel.findById('dashboard-123');

      expect(mockDb).toHaveBeenCalledWith('dashboards');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'dashboard-123' });
      expect(mockQueryBuilder.first).toHaveBeenCalled();
      expect(result).toEqual(dashboard);
    });

    it('should return null when dashboard not found', async () => {
      mockQueryBuilder.first.mockResolvedValue(undefined);

      const result = await dashboardModel.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should return null when first() returns null', async () => {
      mockQueryBuilder.first.mockResolvedValue(null);

      const result = await dashboardModel.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByOwner', () => {
    it('should return owned and shared dashboards ordered by name', async () => {
      const dashboards = [
        createMockDashboard({ id: '1', name: 'Alpha Dashboard', owner: 'user-123' }),
        createMockDashboard({ id: '2', name: 'Beta Dashboard', owner: 'user-123' }),
        createMockDashboard({ id: '3', name: 'Shared Dashboard', owner: 'other-user', shared: true }),
      ];

      mockQueryBuilder.orderBy.mockResolvedValue(dashboards);

      const result = await dashboardModel.findByOwner('user-123');

      expect(mockDb).toHaveBeenCalledWith('dashboards');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ owner: 'user-123' });
      expect(mockQueryBuilder.orWhere).toHaveBeenCalledWith({ shared: true });
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('name', 'asc');
      expect(result).toEqual(dashboards);
    });

    it('should return empty array when no dashboards found', async () => {
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      const result = await dashboardModel.findByOwner('user-with-no-dashboards');

      expect(result).toEqual([]);
    });

    it('should include shared dashboards from other owners', async () => {
      const dashboards = [
        createMockDashboard({ owner: 'other-user', shared: true }),
      ];

      mockQueryBuilder.orderBy.mockResolvedValue(dashboards);

      const result = await dashboardModel.findByOwner('user-123');

      expect(mockQueryBuilder.orWhere).toHaveBeenCalledWith({ shared: true });
      expect(result).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should update dashboard and return updated record', async () => {
      const updateData = { name: 'Updated Dashboard', description: 'New description' };
      const updatedDashboard = createMockDashboard(updateData);

      mockQueryBuilder.returning.mockResolvedValue([updatedDashboard]);

      const result = await dashboardModel.update('dashboard-123', updateData);

      expect(mockDb).toHaveBeenCalledWith('dashboards');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'dashboard-123' });
      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updateData,
          updated_at: expect.any(Date),
        })
      );
      expect(mockQueryBuilder.returning).toHaveBeenCalledWith('*');
      expect(result).toEqual(updatedDashboard);
    });

    it('should return null when dashboard not found', async () => {
      mockQueryBuilder.returning.mockResolvedValue([]);

      const result = await dashboardModel.update('non-existent', { name: 'test' });

      expect(result).toBeNull();
    });

    it('should return null when returning undefined', async () => {
      mockQueryBuilder.returning.mockResolvedValue([undefined]);

      const result = await dashboardModel.update('dashboard-123', { name: 'test' });

      expect(result).toBeNull();
    });

    it('should set updated_at timestamp', async () => {
      const beforeUpdate = new Date();
      mockQueryBuilder.returning.mockResolvedValue([createMockDashboard()]);

      await dashboardModel.update('dashboard-123', { name: 'test' });

      const updateCall = mockQueryBuilder.update.mock.calls[0][0];
      expect(updateCall.updated_at).toBeInstanceOf(Date);
      expect(updateCall.updated_at.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should update widgets array', async () => {
      const newWidgets = [
        { id: 'new-widget', type: 'pie-chart', config: {} },
      ];

      mockQueryBuilder.returning.mockResolvedValue([createMockDashboard({ widgets: newWidgets })]);

      const result = await dashboardModel.update('dashboard-123', { widgets: newWidgets });

      expect(mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ widgets: newWidgets })
      );
      expect(result?.widgets).toEqual(newWidgets);
    });

    it('should update layout configuration', async () => {
      const newLayout = { columns: 3, rows: 3 };

      mockQueryBuilder.returning.mockResolvedValue([createMockDashboard({ layout: newLayout })]);

      const result = await dashboardModel.update('dashboard-123', { layout: newLayout });

      expect(result?.layout).toEqual(newLayout);
    });

    it('should toggle shared status', async () => {
      mockQueryBuilder.returning.mockResolvedValue([createMockDashboard({ shared: true })]);

      const result = await dashboardModel.update('dashboard-123', { shared: true });

      expect(result?.shared).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete dashboard and return true on success', async () => {
      mockQueryBuilder.del.mockResolvedValue(1);

      const result = await dashboardModel.delete('dashboard-123');

      expect(mockDb).toHaveBeenCalledWith('dashboards');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith({ id: 'dashboard-123' });
      expect(mockQueryBuilder.del).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when dashboard not found', async () => {
      mockQueryBuilder.del.mockResolvedValue(0);

      const result = await dashboardModel.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should return true when multiple rows affected', async () => {
      mockQueryBuilder.del.mockResolvedValue(2);

      const result = await dashboardModel.delete('dashboard-123');

      expect(result).toBe(true);
    });
  });

  describe('table name', () => {
    it('should use dashboards table for all operations', async () => {
      mockQueryBuilder.returning.mockResolvedValue([createMockDashboard()]);
      mockQueryBuilder.first.mockResolvedValue(createMockDashboard());
      mockQueryBuilder.del.mockResolvedValue(1);
      mockQueryBuilder.orderBy.mockResolvedValue([]);

      await dashboardModel.create(createMockDashboard());
      expect(mockDb).toHaveBeenLastCalledWith('dashboards');

      await dashboardModel.findById('123');
      expect(mockDb).toHaveBeenLastCalledWith('dashboards');

      await dashboardModel.findByOwner('user-123');
      expect(mockDb).toHaveBeenLastCalledWith('dashboards');

      await dashboardModel.delete('123');
      expect(mockDb).toHaveBeenLastCalledWith('dashboards');
    });
  });
});
