import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { DashboardModel } from '../models';

interface VenueParams {
  venueId: string;
}

interface DashboardParams {
  dashboardId: string;
}

interface CreateDashboardBody {
  venueId: string;
  name: string;
  description?: string;
  type: 'overview' | 'sales' | 'customer' | 'operations' | 'custom';
  isDefault?: boolean;
  isPublic?: boolean;
  config?: Record<string, any>;
}

interface UpdateDashboardBody {
  name?: string;
  description?: string;
  isPublic?: boolean;
  config?: Record<string, any>;
}

interface CloneDashboardBody {
  name: string;
  venueId?: string;
}

interface ShareDashboardBody {
  userIds: string[];
  permissions: ('view' | 'edit')[];
}
class DashboardController extends BaseController {
  getDashboards = async (
    request: FastifyRequest<{ Params: VenueParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const tenantId = request.user?.tenantId || venueId;
      
      const dashboards = await DashboardModel.findByTenant(tenantId);
      return this.success(reply, { dashboards });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getDashboard = async (
    request: FastifyRequest<{ Params: DashboardParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { dashboardId } = request.params;
      const tenantId = request.user?.tenantId || '';
      
      const dashboard = await DashboardModel.findById(dashboardId, tenantId);
      if (!dashboard) {
        return this.notFound(reply, 'Dashboard not found');
      }
      return this.success(reply, { dashboard });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  createDashboard = async (
    request: FastifyRequest<{ Body: CreateDashboardBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const body = request.body;
      const userId = request.user?.id || 'system';
      const tenantId = request.user?.tenantId || body.venueId;
      
      const dashboard = await DashboardModel.create({
        tenant_id: tenantId,
        name: body.name,
        description: body.description,
        type: body.type,
        layout: body.config || {},
        filters: {},
        visibility: body.isPublic ? 'public' : 'private',
        created_by: userId,
        is_default: body.isDefault || false,
        display_order: 0,
      });
      
      return this.success(reply, { dashboard }, 201);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  updateDashboard = async (
    request: FastifyRequest<{ Params: DashboardParams; Body: UpdateDashboardBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { dashboardId } = request.params;
      const body = request.body;
      const tenantId = request.user?.tenantId || '';
      
      const updates: Record<string, any> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.isPublic !== undefined) updates.visibility = body.isPublic ? 'public' : 'private';
      if (body.config !== undefined) updates.layout = body.config;
      
      const dashboard = await DashboardModel.update(dashboardId, tenantId, updates);
      if (!dashboard) {
        return this.notFound(reply, 'Dashboard not found');
      }
      return this.success(reply, { dashboard });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  deleteDashboard = async (
    request: FastifyRequest<{ Params: DashboardParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { dashboardId } = request.params;
      const tenantId = request.user?.tenantId || '';
      
      const deleted = await DashboardModel.delete(dashboardId, tenantId);
      if (!deleted) {
        return this.notFound(reply, 'Dashboard not found');
      }
      return this.success(reply, { message: 'Dashboard deleted' });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  cloneDashboard = async (
    request: FastifyRequest<{ Params: DashboardParams; Body: CloneDashboardBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { dashboardId } = request.params;
      const { name, venueId } = request.body;
      const userId = request.user?.id || 'system';
      const tenantId = request.user?.tenantId || '';
      
      // Get the source dashboard
      const sourceDashboard = await DashboardModel.findById(dashboardId, tenantId);
      if (!sourceDashboard) {
        return this.notFound(reply, 'Dashboard not found');
      }
      
      // Create a clone
      const clonedDashboard = await DashboardModel.create({
        tenant_id: venueId || sourceDashboard.tenant_id,
        name: name,
        description: sourceDashboard.description,
        type: sourceDashboard.type,
        layout: sourceDashboard.layout,
        filters: sourceDashboard.filters,
        visibility: sourceDashboard.visibility,
        created_by: userId,
        is_default: false,
        display_order: 0,
      });
      
      return this.success(reply, { dashboard: clonedDashboard }, 201);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  shareDashboard = async (
    request: FastifyRequest<{ Params: DashboardParams; Body: ShareDashboardBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { dashboardId } = request.params;
      const { userIds, permissions } = request.body;
      const tenantId = request.user?.tenantId || '';
      
      // Verify dashboard exists
      const dashboard = await DashboardModel.findById(dashboardId, tenantId);
      if (!dashboard) {
        return this.notFound(reply, 'Dashboard not found');
      }
      
      // Update visibility to shared and store share info in layout
      await DashboardModel.update(dashboardId, tenantId, {
        visibility: 'shared',
        layout: {
          ...dashboard.layout,
          sharedWith: userIds.map((userId, index) => ({
            userId,
            permission: permissions[index] || 'view'
          }))
        }
      });
      
      return this.success(reply, { message: 'Dashboard shared', sharedWith: userIds });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getDashboardPermissions = async (
    request: FastifyRequest<{ Params: DashboardParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { dashboardId } = request.params;
      const tenantId = request.user?.tenantId || '';
      
      const dashboard = await DashboardModel.findById(dashboardId, tenantId);
      if (!dashboard) {
        return this.notFound(reply, 'Dashboard not found');
      }
      
      const permissions = (dashboard.layout as any)?.sharedWith || [];
      return this.success(reply, { permissions });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };
}

export const dashboardController = new DashboardController();
