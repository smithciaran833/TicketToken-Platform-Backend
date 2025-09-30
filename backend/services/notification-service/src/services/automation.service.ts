import { db } from '../config/database';
import { logger } from '../config/logger';
import { notificationServiceV2 } from './notification.service.v2';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';

interface AutomationTrigger {
  id: string;
  venueId: string;
  name: string;
  triggerType: 'event' | 'time' | 'behavior' | 'api';
  conditions: any;
  actions: any[];
  enabled: boolean;
}

export class AutomationService {
  private triggers: Map<string, cron.ScheduledTask> = new Map();

  async initializeAutomations() {
    const automations = await db('automation_triggers')
      .where('enabled', true);

    for (const automation of automations) {
      await this.setupTrigger(automation);
    }

    logger.info('Automations initialized', { count: automations.length });
  }

  async createAutomation(automation: {
    venueId: string;
    name: string;
    triggerType: AutomationTrigger['triggerType'];
    conditions: any;
    actions: any[];
  }): Promise<string> {
    const id = uuidv4();

    await db('automation_triggers').insert({
      id,
      venue_id: automation.venueId,
      name: automation.name,
      trigger_type: automation.triggerType,
      conditions: JSON.stringify(automation.conditions),
      actions: JSON.stringify(automation.actions),
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await this.setupTrigger({
      id,
      ...automation,
      enabled: true,
    });

    logger.info('Automation created', { id, name: automation.name });
    return id;
  }

  private async setupTrigger(trigger: any) {
    switch (trigger.trigger_type || trigger.triggerType) {
      case 'time':
        this.setupTimeTrigger(trigger);
        break;
      case 'event':
        this.setupEventTrigger(trigger);
        break;
      case 'behavior':
        this.setupBehaviorTrigger(trigger);
        break;
    }
  }

  private setupTimeTrigger(trigger: any) {
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    if (conditions.cronExpression) {
      const task = cron.schedule(conditions.cronExpression, async () => {
        await this.executeActions(trigger);
      });

      this.triggers.set(trigger.id, task);
      logger.info('Time trigger scheduled', { 
        id: trigger.id, 
        cron: conditions.cronExpression 
      });
    }
  }

  private setupEventTrigger(trigger: any) {
    // Register event listener for specific events
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    // This would integrate with your event system
    logger.info('Event trigger registered', { 
      id: trigger.id, 
      event: conditions.eventName 
    });
  }

  private setupBehaviorTrigger(trigger: any) {
    // Set up behavior-based triggers
    const conditions = typeof trigger.conditions === 'string' 
      ? JSON.parse(trigger.conditions) 
      : trigger.conditions;

    // Examples:
    // - Customer hasn't purchased in 30 days
    // - Customer viewed event 3 times
    // - Cart abandoned for 2 hours
    
    logger.info('Behavior trigger configured', { 
      id: trigger.id, 
      behavior: conditions.behaviorType 
    });
  }

  private async executeActions(trigger: any) {
    const actions = typeof trigger.actions === 'string' 
      ? JSON.parse(trigger.actions) 
      : trigger.actions;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'send_notification':
            await this.executeSendNotification(trigger.venue_id, action);
            break;
          case 'update_customer':
            await this.executeUpdateCustomer(action);
            break;
          case 'webhook':
            await this.executeWebhook(action);
            break;
          case 'delay':
            await this.executeDelay(action);
            break;
        }
      } catch (error) {
        logger.error('Failed to execute automation action', {
          triggerId: trigger.id,
          action: action.type,
          error,
        });
      }
    }

    // Log execution
    await db('automation_executions').insert({
      id: uuidv4(),
      trigger_id: trigger.id,
      executed_at: new Date(),
      status: 'completed',
    });
  }

  private async executeSendNotification(venueId: string, action: any) {
    const recipients = await this.getActionRecipients(action);
    
    for (const recipient of recipients) {
      await notificationServiceV2.send({
        venueId,
        recipientId: recipient.id,
        recipient,
        channel: action.channel || 'email',
        type: 'transactional',
        template: action.template,
        priority: action.priority || 'normal',
        data: action.data || {},
      });
    }
  }

  private async executeUpdateCustomer(action: any) {
    // Update customer attributes
    logger.info('Updating customer', action);
  }

  private async executeWebhook(action: any) {
    // Call external webhook
    logger.info('Calling webhook', { url: action.url });
  }

  private async executeDelay(action: any) {
    const delay = action.duration || 60000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async getActionRecipients(action: any): Promise<any[]> {
    // Get recipients based on action criteria
    if (action.recipientQuery) {
      // Execute dynamic query
      return [];
    }

    if (action.recipientIds) {
      // Get specific recipients
      return action.recipientIds.map((id: string) => ({
        id,
        email: `${id}@example.com`, // Would fetch from DB
      }));
    }

    return [];
  }

  // Behavioral trigger checks
  async checkAbandonedCarts() {
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    // Find abandoned carts
    const abandonedCarts = await db('shopping_carts')
      .where('status', 'active')
      .where('updated_at', '<', twoHoursAgo)
      .whereNull('completed_at');

    for (const cart of abandonedCarts) {
      // Trigger abandoned cart automation
      const triggers = await db('automation_triggers')
        .where('trigger_type', 'behavior')
        .whereRaw(`conditions->>'behaviorType' = 'cart_abandoned'`)
        .where('venue_id', cart.venue_id)
        .where('enabled', true);

      for (const trigger of triggers) {
        await this.executeActions(trigger);
      }
    }
  }

  async checkReEngagement() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find inactive customers
    const inactiveCustomers = await db('customers')
      .where('last_activity_at', '<', thirtyDaysAgo)
      .whereNotIn('id', function() {
        this.select('customer_id')
          .from('suppression_list')
          .where('channel', 'all');
      });

    logger.info('Found inactive customers', { count: inactiveCustomers.length });
    // Trigger re-engagement campaigns
  }
}

export const automationService = new AutomationService();
