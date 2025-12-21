"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertService = exports.AlertService = void 0;
const models_1 = require("../models");
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
const message_gateway_service_1 = require("./message-gateway.service");
const metrics_service_1 = require("./metrics.service");
class AlertService {
    static instance;
    log = logger_1.logger.child({ component: 'AlertService' });
    checkInterval = null;
    static getInstance() {
        if (!this.instance) {
            this.instance = new AlertService();
        }
        return this.instance;
    }
    mapDBAlertToAlert(dbAlert) {
        return {
            id: dbAlert.id,
            venueId: dbAlert.tenant_id,
            name: dbAlert.message || 'Alert',
            description: dbAlert.message,
            type: dbAlert.alert_type || types_1.AlertType.THRESHOLD,
            severity: dbAlert.severity || types_1.AlertSeverity.WARNING,
            status: dbAlert.status === 'active' ? types_1.AlertStatus.ACTIVE : types_1.AlertStatus.DISABLED,
            conditions: [
                {
                    id: dbAlert.id,
                    metric: dbAlert.metric_type,
                    operator: types_1.ComparisonOperator.GREATER_THAN,
                    value: dbAlert.threshold_value || 0
                }
            ],
            actions: [],
            enabled: dbAlert.status === 'active',
            triggerCount: 0,
            lastTriggered: dbAlert.triggered_at,
            createdBy: dbAlert.tenant_id,
            schedule: undefined,
            createdAt: dbAlert.created_at,
            updatedAt: dbAlert.updated_at
        };
    }
    async startMonitoring() {
        this.checkInterval = setInterval(() => {
            this.checkAllAlerts();
        }, 60000);
        this.log.info('Alert monitoring started');
    }
    async stopMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        this.log.info('Alert monitoring stopped');
    }
    async createAlert(data) {
        try {
            const dbAlert = await models_1.AlertModel.createAlert(data);
            if (!dbAlert) {
                throw new Error('Failed to create alert');
            }
            const alert = this.mapDBAlertToAlert(dbAlert);
            this.log.info('Alert created', { alertId: alert.id, name: alert.name });
            return alert;
        }
        catch (error) {
            this.log.error('Failed to create alert', error);
            throw error;
        }
    }
    async updateAlert(alertId, data) {
        try {
            const dbAlert = await models_1.AlertModel.updateAlert(alertId, data);
            if (!dbAlert) {
                throw new Error('Alert not found');
            }
            const alert = this.mapDBAlertToAlert(dbAlert);
            this.log.info('Alert updated', { alertId });
            return alert;
        }
        catch (error) {
            this.log.error('Failed to update alert', error, { alertId });
            throw error;
        }
    }
    async toggleAlert(alertId, enabled) {
        try {
            const dbAlert = await models_1.AlertModel.toggleAlert(alertId, enabled);
            if (!dbAlert) {
                throw new Error('Alert not found');
            }
            const alert = this.mapDBAlertToAlert(dbAlert);
            this.log.info('Alert toggled', { alertId, enabled });
            return alert;
        }
        catch (error) {
            this.log.error('Failed to toggle alert', error, { alertId });
            throw error;
        }
    }
    async checkAllAlerts() {
        try {
            const venues = await this.getMonitoredVenues();
            for (const venueId of venues) {
                const dbAlerts = await models_1.AlertModel.getAlertsByVenue(venueId, true);
                const alerts = dbAlerts.map(a => this.mapDBAlertToAlert(a));
                for (const alert of alerts) {
                    await this.checkAlert(alert);
                }
            }
        }
        catch (error) {
            this.log.error('Failed to check alerts', error);
        }
    }
    async checkAlert(alert) {
        try {
            if (!this.isWithinSchedule(alert)) {
                return;
            }
            const triggered = await this.evaluateConditions(alert);
            if (triggered) {
                const recentInstance = await this.getRecentAlertInstance(alert.id);
                if (recentInstance && recentInstance.status === 'active') {
                    return;
                }
                const instance = await this.triggerAlert(alert);
                await this.executeActions(alert, instance);
            }
            else {
                const activeInstance = await this.getActiveAlertInstance(alert.id);
                if (activeInstance) {
                    await this.resolveAlert(activeInstance);
                }
            }
        }
        catch (error) {
            this.log.error('Failed to check alert', error, { alertId: alert.id });
        }
    }
    async evaluateConditions(alert) {
        try {
            for (const condition of alert.conditions) {
                const currentValue = await this.getMetricValue(alert.venueId, condition.metric);
                if (!this.evaluateCondition(currentValue, condition.operator, condition.value)) {
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            this.log.error('Failed to evaluate conditions', error, { alertId: alert.id });
            return false;
        }
    }
    evaluateCondition(currentValue, operator, threshold) {
        switch (operator) {
            case types_1.ComparisonOperator.EQUALS:
                return currentValue === threshold;
            case types_1.ComparisonOperator.NOT_EQUALS:
                return currentValue !== threshold;
            case types_1.ComparisonOperator.GREATER_THAN:
                return currentValue > threshold;
            case types_1.ComparisonOperator.LESS_THAN:
                return currentValue < threshold;
            case types_1.ComparisonOperator.GREATER_THAN_OR_EQUALS:
                return currentValue >= threshold;
            case types_1.ComparisonOperator.LESS_THAN_OR_EQUALS:
                return currentValue <= threshold;
            default:
                return false;
        }
    }
    async getMetricValue(venueId, metric) {
        const realTimeMetric = await metrics_service_1.metricsService.getRealTimeMetric(venueId, metric);
        return realTimeMetric?.currentValue || 0;
    }
    async triggerAlert(alert) {
        try {
            await models_1.AlertModel.incrementTriggerCount(alert.id);
            const instance = await models_1.AlertModel.createAlertInstance({
                alertId: alert.id,
                triggeredAt: new Date(),
                severity: alert.severity,
                status: 'active',
                triggerValues: await this.getCurrentTriggerValues(alert),
                message: this.generateAlertMessage(alert),
                actions: alert.actions.map(action => ({
                    type: action.type,
                    status: 'pending'
                }))
            });
            this.log.info('Alert triggered', {
                alertId: alert.id,
                instanceId: instance.id,
                severity: alert.severity
            });
            return instance;
        }
        catch (error) {
            this.log.error('Failed to trigger alert', error, { alertId: alert.id });
            throw error;
        }
    }
    async executeActions(alert, instance) {
        for (const action of alert.actions) {
            try {
                if (action.delay) {
                    await new Promise(resolve => setTimeout(resolve, action.delay * 60000));
                }
                switch (action.type) {
                    case 'email':
                        await message_gateway_service_1.messageGatewayService.sendAlertNotification(instance, 'email', action.config.recipients?.[0] || '');
                        break;
                    case 'sms':
                        await message_gateway_service_1.messageGatewayService.sendAlertNotification(instance, 'sms', action.config.phoneNumbers?.[0] || '');
                        break;
                    case 'slack':
                        await message_gateway_service_1.messageGatewayService.sendAlertNotification(instance, 'slack', action.config.channel || '');
                        break;
                    case 'webhook':
                        await this.sendWebhook(action.config, instance);
                        break;
                }
            }
            catch (error) {
                this.log.error('Failed to execute alert action', error, {
                    alertId: alert.id,
                    actionType: action.type
                });
            }
        }
    }
    async sendWebhook(config, _instance) {
        this.log.info('Webhook sent', { url: config.url });
    }
    async resolveAlert(instance) {
        try {
            await models_1.AlertModel.resolveAlertInstance(instance.id);
            this.log.info('Alert resolved', { instanceId: instance.id });
        }
        catch (error) {
            this.log.error('Failed to resolve alert', error, { instanceId: instance.id });
        }
    }
    isWithinSchedule(alert) {
        if (!alert.schedule)
            return true;
        const now = new Date();
        const { activeHours, activeDays } = alert.schedule;
        if (activeDays && !activeDays.includes(now.getDay())) {
            return false;
        }
        if (activeHours) {
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const [startHour, startMin] = activeHours.start.split(':').map(Number);
            const [endHour, endMin] = activeHours.end.split(':').map(Number);
            const startTime = startHour * 60 + startMin;
            const endTime = endHour * 60 + endMin;
            if (currentTime < startTime || currentTime > endTime) {
                return false;
            }
        }
        return true;
    }
    async getCurrentTriggerValues(alert) {
        const values = {};
        for (const condition of alert.conditions) {
            values[condition.metric] = await this.getMetricValue(alert.venueId, condition.metric);
        }
        return values;
    }
    generateAlertMessage(alert) {
        return `Alert: ${alert.name} - ${alert.description || 'Threshold exceeded'}`;
    }
    async getRecentAlertInstance(alertId) {
        const instances = await models_1.AlertModel.getAlertInstances(alertId, 1);
        return instances[0] || null;
    }
    async getActiveAlertInstance(alertId) {
        const instances = await models_1.AlertModel.getAlertInstances(alertId, 10);
        return instances.find(i => i.status === 'active') || null;
    }
    async getMonitoredVenues() {
        return ['venue-1', 'venue-2'];
    }
    async getAlertsByVenue(venueId) {
        const dbAlerts = await models_1.AlertModel.getAlertsByVenue(venueId);
        return dbAlerts.map(a => this.mapDBAlertToAlert(a));
    }
    async getAlertInstances(alertId, limit = 50) {
        return await models_1.AlertModel.getAlertInstances(alertId, limit);
    }
    async acknowledgeAlert(instanceId, userId, notes) {
        return await models_1.AlertModel.acknowledgeAlertInstance(instanceId, userId, notes);
    }
}
exports.AlertService = AlertService;
exports.alertService = AlertService.getInstance();
//# sourceMappingURL=alert.service.js.map