"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageGatewayService = exports.MessageGatewayService = void 0;
const logger_1 = require("../utils/logger");
const rabbitmq_1 = require("../config/rabbitmq");
class MessageGatewayService {
    static instance;
    log = logger_1.logger.child({ component: 'MessageGatewayService' });
    templates = new Map();
    static getInstance() {
        if (!this.instance) {
            this.instance = new MessageGatewayService();
        }
        return this.instance;
    }
    constructor() {
        this.initializeTemplates();
    }
    initializeTemplates() {
        this.templates.set('alert-email', {
            id: 'alert-email',
            name: 'Alert Email',
            channel: 'email',
            subject: 'Analytics Alert: {{alertName}}',
            body: `
        <h2>{{alertName}}</h2>
        <p>{{alertDescription}}</p>
        <p><strong>Severity:</strong> {{severity}}</p>
        <p><strong>Triggered at:</strong> {{triggeredAt}}</p>
        <p><strong>Current value:</strong> {{currentValue}}</p>
        <p><strong>Threshold:</strong> {{threshold}}</p>
        <a href="{{dashboardUrl}}">View Dashboard</a>
      `,
            variables: ['alertName', 'alertDescription', 'severity', 'triggeredAt', 'currentValue', 'threshold', 'dashboardUrl']
        });
        this.templates.set('alert-sms', {
            id: 'alert-sms',
            name: 'Alert SMS',
            channel: 'sms',
            body: 'Analytics Alert: {{alertName}} - {{severity}}. Value: {{currentValue}}. Check dashboard for details.',
            variables: ['alertName', 'severity', 'currentValue']
        });
        this.templates.set('alert-slack', {
            id: 'alert-slack',
            name: 'Alert Slack',
            channel: 'slack',
            body: JSON.stringify({
                text: 'Analytics Alert',
                attachments: [{
                        color: '{{color}}',
                        title: '{{alertName}}',
                        text: '{{alertDescription}}',
                        fields: [
                            { title: 'Severity', value: '{{severity}}', short: true },
                            { title: 'Current Value', value: '{{currentValue}}', short: true },
                            { title: 'Threshold', value: '{{threshold}}', short: true },
                            { title: 'Time', value: '{{triggeredAt}}', short: true }
                        ],
                        actions: [{
                                type: 'button',
                                text: 'View Dashboard',
                                url: '{{dashboardUrl}}'
                            }]
                    }]
            }),
            variables: ['color', 'alertName', 'alertDescription', 'severity', 'currentValue', 'threshold', 'triggeredAt', 'dashboardUrl']
        });
        this.templates.set('report-ready-email', {
            id: 'report-ready-email',
            name: 'Report Ready Email',
            channel: 'email',
            subject: 'Your Analytics Report is Ready',
            body: `
        <h2>Your report is ready for download</h2>
        <p>Report: {{reportName}}</p>
        <p>Generated: {{generatedAt}}</p>
        <p>Size: {{fileSize}}</p>
        <a href="{{downloadUrl}}">Download Report</a>
        <p><em>This link will expire in {{expirationDays}} days.</em></p>
      `,
            variables: ['reportName', 'generatedAt', 'fileSize', 'downloadUrl', 'expirationDays']
        });
        this.templates.set('customer-insight-email', {
            id: 'customer-insight-email',
            name: 'Customer Insight Email',
            channel: 'email',
            subject: 'New Customer Insights Available',
            body: `
        <h2>New insights for your venue</h2>
        <ul>
        {{#insights}}
          <li>
            <strong>{{title}}</strong>: {{description}}
            <br>Impact: {{impact}}
            {{#actionable}}
            <br>Suggested actions:
            <ul>
              {{#suggestedActions}}
              <li>{{.}}</li>
              {{/suggestedActions}}
            </ul>
            {{/actionable}}
          </li>
        {{/insights}}
        </ul>
        <a href="{{dashboardUrl}}">View Full Analytics</a>
      `,
            variables: ['insights', 'dashboardUrl']
        });
    }
    async sendMessage(channel, recipient, templateId, variables) {
        try {
            const template = this.templates.get(templateId);
            if (!template) {
                throw new Error(`Template ${templateId} not found`);
            }
            const message = {
                id: `msg-${Date.now()}`,
                channel,
                recipient,
                subject: this.interpolateTemplate(template.subject || '', variables),
                body: this.interpolateTemplate(template.body, variables),
                metadata: { templateId, variables },
                status: 'pending'
            };
            await this.queueMessage(message);
            this.log.info('Message queued', {
                messageId: message.id,
                channel,
                recipient: this.maskRecipient(recipient)
            });
            return message;
        }
        catch (error) {
            this.log.error('Failed to send message', { error, channel, templateId });
            throw error;
        }
    }
    async sendAlertNotification(alert, channel, recipient) {
        try {
            const templateId = `alert-${channel}`;
            const variables = {
                alertName: alert.message,
                alertDescription: alert.message,
                severity: alert.severity,
                triggeredAt: alert.triggeredAt.toISOString(),
                currentValue: JSON.stringify(alert.triggerValues),
                threshold: 'Configured threshold',
                dashboardUrl: `${process.env.APP_URL}/dashboard/alerts/${alert.alertId}`,
                color: alert.severity === 'critical' ? '#ff0000' :
                    alert.severity === 'error' ? '#ff6600' :
                        alert.severity === 'warning' ? '#ffcc00' : '#0066cc'
            };
            await this.sendMessage(channel, recipient, templateId, variables);
        }
        catch (error) {
            this.log.error('Failed to send alert notification', { error, alertId: alert.id });
            throw error;
        }
    }
    async sendBulkMessages(messages) {
        try {
            const results = await Promise.allSettled(messages.map(msg => this.sendMessage(msg.channel, msg.recipient, msg.templateId, msg.variables)));
            const successful = results
                .filter(r => r.status === 'fulfilled')
                .map(r => r.value);
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) {
                this.log.warn(`Bulk send completed with ${failed} failures`, {
                    total: messages.length,
                    successful: successful.length,
                    failed
                });
            }
            return successful;
        }
        catch (error) {
            this.log.error('Failed to send bulk messages', { error });
            throw error;
        }
    }
    interpolateTemplate(template, variables) {
        let result = template;
        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, String(value));
        });
        return result;
    }
    async queueMessage(message) {
        try {
            const channel = (0, rabbitmq_1.getChannel)();
            const routingKey = `messages.${message.channel}`;
            channel.publish('tickettoken_events', routingKey, Buffer.from(JSON.stringify(message)), { persistent: true });
        }
        catch (error) {
            this.log.error('Failed to queue message', { error, messageId: message.id });
            throw error;
        }
    }
    maskRecipient(recipient) {
        if (recipient.includes('@')) {
            const [user, domain] = recipient.split('@');
            return `${user.substring(0, 2)}***@${domain}`;
        }
        else if (recipient.startsWith('+') || /^\d+$/.test(recipient)) {
            return `***${recipient.slice(-4)}`;
        }
        return '***';
    }
    async getMessageStatus(_messageId) {
        return null;
    }
    async retryFailedMessages(_since) {
        return 0;
    }
}
exports.MessageGatewayService = MessageGatewayService;
exports.messageGatewayService = MessageGatewayService.getInstance();
//# sourceMappingURL=message-gateway.service.js.map