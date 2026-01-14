import { FastifyRequest, FastifyReply } from 'fastify';
import { BaseController } from './base.controller';
import { alertService } from '../services/alert.service';

interface VenueParams {
  venueId: string;
}

interface AlertParams {
  alertId: string;
  venueId: string;
}

interface InstanceParams {
  instanceId: string;
}

interface GetAlertsQuery {
  enabled?: boolean;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  page?: number;
  limit?: number;
}

interface CreateAlertBody {
  venueId: string;
  name: string;
  description?: string;
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  conditions: any[];
  actions: any[];
  enabled?: boolean;
  schedule?: Record<string, any>;
}

interface UpdateAlertBody {
  name?: string;
  description?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  conditions?: any[];
  actions?: any[];
  schedule?: Record<string, any>;
}

interface ToggleAlertBody {
  enabled: boolean;
}

interface GetInstancesQuery {
  status?: 'active' | 'acknowledged' | 'resolved';
  limit?: number;
}

interface AcknowledgeAlertBody {
  notes?: string;
}

// Use the globally augmented FastifyRequest which has user?: AuthUser
// See: middleware/auth.middleware.ts for the Fastify module augmentation

class AlertsController extends BaseController {
  getAlerts = async (
    request: FastifyRequest<{ Params: VenueParams; Querystring: GetAlertsQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { venueId } = request.params;
      const alerts = await alertService.getAlertsByVenue(venueId);
      return this.success(reply, { alerts });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getAlert = async (
    request: FastifyRequest<{ Params: AlertParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { alertId, venueId } = request.params;
      const alert = await alertService.getAlertById(alertId, venueId);
      if (!alert) {
        return this.notFound(reply, 'Alert not found');
      }
      return this.success(reply, { alert });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  createAlert = async (
    request: FastifyRequest<{ Body: CreateAlertBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const alertData = request.body as CreateAlertBody;
      const userId = request.user?.id || 'system';
      const alert = await alertService.createAlert({
        venueId: alertData.venueId,
        name: alertData.name,
        description: alertData.description,
        type: alertData.type as any,
        severity: alertData.severity as any,
        status: alertData.enabled ? 'active' : 'disabled' as any,
        conditions: alertData.conditions,
        actions: alertData.actions,
        enabled: alertData.enabled ?? true,
        triggerCount: 0,
        createdBy: userId,
        schedule: alertData.schedule as any,
      });
      return this.success(reply, { alert }, 201);
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  updateAlert = async (
    request: FastifyRequest<{ Params: AlertParams; Body: UpdateAlertBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { alertId } = request.params;
      const updateData = request.body;
      const alert = await alertService.updateAlert(alertId, updateData as any);
      return this.success(reply, { alert });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  deleteAlert = async (
    request: FastifyRequest<{ Params: AlertParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { alertId, venueId } = request.params;
      const deleted = await alertService.deleteAlert(alertId, venueId);
      if (!deleted) {
        return this.notFound(reply, 'Alert not found');
      }
      return this.success(reply, { message: 'Alert deleted' });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  toggleAlert = async (
    request: FastifyRequest<{ Params: AlertParams; Body: ToggleAlertBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { alertId } = request.params;
      const { enabled } = request.body;
      const alert = await alertService.toggleAlert(alertId, enabled);
      return this.success(reply, { alert });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  getAlertInstances = async (
    request: FastifyRequest<{ Params: AlertParams; Querystring: GetInstancesQuery }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { alertId } = request.params;
      const { limit = 50 } = request.query;
      const instances = await alertService.getAlertInstances(alertId, limit);
      return this.success(reply, { instances });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  acknowledgeAlert = async (
    request: FastifyRequest<{ Params: InstanceParams; Body: AcknowledgeAlertBody }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { instanceId } = request.params;
      const { notes } = request.body as AcknowledgeAlertBody;
      const userId = request.user?.id || 'system';
      const instance = await alertService.acknowledgeAlert(instanceId, userId, notes);
      return this.success(reply, { instance });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };

  testAlert = async (
    request: FastifyRequest<{ Params: AlertParams }>,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const { alertId, venueId } = request.params;
      await alertService.testAlert(alertId, venueId);
      return this.success(reply, { message: 'Test alert sent' });
    } catch (error) {
      return this.handleError(error, reply);
    }
  };
}

export const alertsController = new AlertsController();
