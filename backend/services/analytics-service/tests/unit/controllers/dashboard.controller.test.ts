/**
 * Dashboard Controller Unit Tests
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

jest.mock('../../../src/models', () => ({
  DashboardModel: {
    findByTenant: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

import { dashboardController } from '../../../src/controllers/dashboard.controller';
import { DashboardModel } from '../../../src/models';

describe('DashboardController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      query: {},
      body: {},
      params: {},
      user: {
        id: 'user-123',
        tenantId: 'tenant-123',
      },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Default successful responses
    (DashboardModel.findByTenant as jest.Mock).mockResolvedValue([
      {
        id: 'dashboard-1',
        tenant_id: 'tenant-123',
        name: 'Overview',
        type: 'overview',
      },
    ]);

    (DashboardModel.findById as jest.Mock).mockResolvedValue({
      id: 'dashboard-123',
      tenant_id: 'tenant-123',
      name: 'Test Dashboard',
      type: 'custom',
      layout: {},
    });

    (DashboardModel.create as jest.Mock).mockResolvedValue({
      id: 'dashboard-new',
      tenant_id: 'tenant-123',
      name: 'New Dashboard',
      type: 'custom',
    });

    (DashboardModel.update as jest.Mock).mockResolvedValue({
      id: 'dashboard-123',
      tenant_id: 'tenant-123',
      name: 'Updated Dashboard',
    });

    (DashboardModel.delete as jest.Mock).mockResolvedValue(true);
  });

  describe('getDashboards', () => {
    it('should get all dashboards for a venue', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await dashboardController.getDashboards(mockRequest, mockReply);

      expect(DashboardModel.findByTenant).toHaveBeenCalledWith('tenant-123');
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          dashboards: expect.any(Array),
        },
      });
    });

    it('should use venueId as fallback for tenantId', async () => {
      mockRequest.params = { venueId: 'venue-456' };
      mockRequest.user = undefined;

      await dashboardController.getDashboards(mockRequest, mockReply);

      expect(DashboardModel.findByTenant).toHaveBeenCalledWith('venue-456');
    });

    it('should handle errors', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      (DashboardModel.findByTenant as jest.Mock).mockRejectedValue(new Error('Database error'));

      await dashboardController.getDashboards(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('getDashboard', () => {
    it('should get a single dashboard', async () => {
      mockRequest.params = { dashboardId: 'dashboard-123' };

      await dashboardController.getDashboard(mockRequest, mockReply);

      expect(DashboardModel.findById).toHaveBeenCalledWith('dashboard-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          dashboard: expect.objectContaining({
            id: 'dashboard-123',
          }),
        },
      });
    });

    it('should return 404 if dashboard not found', async () => {
      mockRequest.params = { dashboardId: 'nonexistent' };
      (DashboardModel.findById as jest.Mock).mockResolvedValue(null);

      await dashboardController.getDashboard(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Dashboard not found',
          statusCode: 404,
        },
      });
    });
  });

  describe('createDashboard', () => {
    it('should create a new dashboard', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        name: 'New Dashboard',
        description: 'Test description',
        type: 'custom',
        isDefault: false,
        isPublic: false,
        config: { widgets: [] },
      };

      await dashboardController.createDashboard(mockRequest, mockReply);

      expect(DashboardModel.create).toHaveBeenCalledWith({
        tenant_id: 'tenant-123',
        name: 'New Dashboard',
        description: 'Test description',
        type: 'custom',
        layout: { widgets: [] },
        filters: {},
        visibility: 'private',
        created_by: 'user-123',
        is_default: false,
        display_order: 0,
      });

      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should create public dashboard when isPublic is true', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        name: 'Public Dashboard',
        type: 'overview',
        isPublic: true,
      };

      await dashboardController.createDashboard(mockRequest, mockReply);

      expect(DashboardModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: 'public',
        })
      );
    });
  });

  describe('updateDashboard', () => {
    it('should update dashboard', async () => {
      mockRequest.params = { dashboardId: 'dashboard-123' };
      mockRequest.body = {
        name: 'Updated Name',
        description: 'Updated description',
      };

      await dashboardController.updateDashboard(mockRequest, mockReply);

      expect(DashboardModel.update).toHaveBeenCalledWith('dashboard-123', 'tenant-123', {
        name: 'Updated Name',
        description: 'Updated description',
      });
    });

    it('should return 404 if dashboard not found', async () => {
      mockRequest.params = { dashboardId: 'nonexistent' };
      mockRequest.body = { name: 'New Name' };
      (DashboardModel.update as jest.Mock).mockResolvedValue(null);

      await dashboardController.updateDashboard(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteDashboard', () => {
    it('should delete dashboard', async () => {
      mockRequest.params = { dashboardId: 'dashboard-123' };

      await dashboardController.deleteDashboard(mockRequest, mockReply);

      expect(DashboardModel.delete).toHaveBeenCalledWith('dashboard-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Dashboard deleted',
        },
      });
    });

    it('should return 404 if dashboard not found', async () => {
      mockRequest.params = { dashboardId: 'nonexistent' };
      (DashboardModel.delete as jest.Mock).mockResolvedValue(false);

      await dashboardController.deleteDashboard(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });
  });

  describe('cloneDashboard', () => {
    it('should clone dashboard', async () => {
      mockRequest.params = { dashboardId: 'dashboard-123' };
      mockRequest.body = {
        name: 'Cloned Dashboard',
      };

      await dashboardController.cloneDashboard(mockRequest, mockReply);

      expect(DashboardModel.findById).toHaveBeenCalledWith('dashboard-123', 'tenant-123');
      expect(DashboardModel.create).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should return 404 if source dashboard not found', async () => {
      mockRequest.params = { dashboardId: 'nonexistent' };
      mockRequest.body = { name: 'Clone' };
      (DashboardModel.findById as jest.Mock).mockResolvedValue(null);

      await dashboardController.cloneDashboard(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(DashboardModel.create).not.toHaveBeenCalled();
    });
  });

  describe('shareDashboard', () => {
    it('should share dashboard with users', async () => {
      mockRequest.params = { dashboardId: 'dashboard-123' };
      mockRequest.body = {
        userIds: ['user-1', 'user-2'],
        permissions: ['view', 'edit'],
      };

      await dashboardController.shareDashboard(mockRequest, mockReply);

      expect(DashboardModel.findById).toHaveBeenCalledWith('dashboard-123', 'tenant-123');
      expect(DashboardModel.update).toHaveBeenCalled();
    });

    it('should return 404 if dashboard not found', async () => {
      mockRequest.params = { dashboardId: 'nonexistent' };
      mockRequest.body = {
        userIds: ['user-1'],
        permissions: ['view'],
      };
      (DashboardModel.findById as jest.Mock).mockResolvedValue(null);

      await dashboardController.shareDashboard(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(DashboardModel.update).not.toHaveBeenCalled();
    });
  });

  describe('getDashboardPermissions', () => {
    it('should get dashboard permissions', async () => {
      const dashboard = {
        id: 'dashboard-123',
        tenant_id: 'tenant-123',
        layout: {
          sharedWith: [
            { userId: 'user-1', permission: 'view' },
          ],
        },
      };

      (DashboardModel.findById as jest.Mock).mockResolvedValue(dashboard);
      mockRequest.params = { dashboardId: 'dashboard-123' };

      await dashboardController.getDashboardPermissions(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          permissions: expect.any(Array),
        },
      });
    });

    it('should return 404 if dashboard not found', async () => {
      mockRequest.params = { dashboardId: 'nonexistent' };
      (DashboardModel.findById as jest.Mock).mockResolvedValue(null);

      await dashboardController.getDashboardPermissions(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });
  });
});
