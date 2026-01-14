import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TemplateRegistry } from '../../../src/services/template-registry';
import * as fs from 'fs/promises';

// Mock fs/promises
jest.mock('fs/promises');
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new TemplateRegistry();
  });

  describe('Template Registration', () => {
    it('should register all email templates on initialization', () => {
      const emailTemplates = registry.getTemplatesByChannel('email');

      expect(emailTemplates.length).toBeGreaterThan(0);
      expect(emailTemplates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'payment-success', channel: 'email' }),
          expect.objectContaining({ name: 'payment-failed', channel: 'email' }),
          expect.objectContaining({ name: 'refund-processed', channel: 'email' }),
          expect.objectContaining({ name: 'ticket-purchased', channel: 'email' }),
          expect.objectContaining({ name: 'event-reminder', channel: 'email' }),
          expect.objectContaining({ name: 'account-verification', channel: 'email' })
        ])
      );
    });

    it('should register all SMS templates on initialization', () => {
      const smsTemplates = registry.getTemplatesByChannel('sms');

      expect(smsTemplates.length).toBeGreaterThan(0);
      expect(smsTemplates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'payment-success', channel: 'sms' }),
          expect.objectContaining({ name: 'event-reminder', channel: 'sms' })
        ])
      );
    });

    it('should register templates with correct metadata', () => {
      const template = registry.getTemplate('payment-success');

      expect(template).toBeDefined();
      expect(template).toMatchObject({
        name: 'payment-success',
        channel: 'email',
        subject: 'Payment Confirmed - {{eventName}}',
        variables: expect.arrayContaining(['user', 'amount', 'currency', 'eventName']),
        description: expect.any(String)
      });
    });
  });

  describe('getTemplate()', () => {
    it('should return template by name', () => {
      const template = registry.getTemplate('payment-success');

      expect(template).toBeDefined();
      expect(template?.name).toBe('payment-success');
      expect(template?.channel).toBe('email');
    });

    it('should return undefined for non-existent template', () => {
      const template = registry.getTemplate('non-existent-template');

      expect(template).toBeUndefined();
    });

    it('should return correct template with all properties', () => {
      const template = registry.getTemplate('ticket-purchased');

      expect(template).toEqual({
        name: 'ticket-purchased',
        channel: 'email',
        subject: 'Your Tickets for {{event.name}}',
        variables: expect.arrayContaining(['user', 'event', 'ticketCount', 'ticketType']),
        description: expect.any(String)
      });
    });

    it('should distinguish between email and SMS templates with same name', () => {
      const emailTemplate = registry.getTemplate('payment-success');
      const smsTemplate = registry.getTemplate('sms-payment-success');

      expect(emailTemplate?.channel).toBe('email');
      expect(smsTemplate?.channel).toBe('sms');
      expect(emailTemplate?.variables).not.toEqual(smsTemplate?.variables);
    });
  });

  describe('getAllTemplates()', () => {
    it('should return all registered templates', () => {
      const templates = registry.getAllTemplates();

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.every(t => t.name && t.channel && t.description)).toBe(true);
    });

    it('should return array of template info objects', () => {
      const templates = registry.getAllTemplates();

      templates.forEach(template => {
        expect(template).toHaveProperty('name');
        expect(template).toHaveProperty('channel');
        expect(template).toHaveProperty('variables');
        expect(template).toHaveProperty('description');
      });
    });

    it('should include both email and SMS templates', () => {
      const templates = registry.getAllTemplates();

      const emailTemplates = templates.filter(t => t.channel === 'email');
      const smsTemplates = templates.filter(t => t.channel === 'sms');

      expect(emailTemplates.length).toBeGreaterThan(0);
      expect(smsTemplates.length).toBeGreaterThan(0);
    });
  });

  describe('getTemplatesByChannel()', () => {
    it('should return only email templates', () => {
      const emailTemplates = registry.getTemplatesByChannel('email');

      expect(emailTemplates.every(t => t.channel === 'email')).toBe(true);
      expect(emailTemplates.length).toBeGreaterThan(0);
    });

    it('should return only SMS templates', () => {
      const smsTemplates = registry.getTemplatesByChannel('sms');

      expect(smsTemplates.every(t => t.channel === 'sms')).toBe(true);
      expect(smsTemplates.length).toBeGreaterThan(0);
    });

    it('should not include templates from other channels', () => {
      const emailTemplates = registry.getTemplatesByChannel('email');
      const smsTemplates = registry.getTemplatesByChannel('sms');

      const emailNames = emailTemplates.map(t => `${t.name}-${t.channel}`);
      const smsNames = smsTemplates.map(t => `${t.name}-${t.channel}`);

      const overlap = emailNames.filter(name => smsNames.includes(name));
      expect(overlap.length).toBe(0);
    });
  });

  describe('validateTemplate()', () => {
    it('should return empty array for valid template data', async () => {
      const errors = await registry.validateTemplate('payment-success', {
        user: { name: 'John' },
        amount: 100,
        currency: 'USD',
        eventName: 'Concert',
        ticketCount: 2,
        orderId: '123'
      });

      expect(errors).toEqual([]);
    });

    it('should return error for non-existent template', async () => {
      const errors = await registry.validateTemplate('non-existent', {});

      expect(errors).toEqual(['Template not found']);
    });

    it('should return errors for missing required variables', async () => {
      const errors = await registry.validateTemplate('payment-success', {
        user: { name: 'John' },
        amount: 100
        // Missing: currency, eventName, ticketCount, orderId
      });

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('Missing required variable: currency');
      expect(errors).toContain('Missing required variable: eventName');
      expect(errors).toContain('Missing required variable: ticketCount');
    });

    it('should validate all required variables', async () => {
      const errors = await registry.validateTemplate('account-verification', {
        // Missing all required variables
      });

      expect(errors).toContain('Missing required variable: user');
      expect(errors).toContain('Missing required variable: verificationCode');
      expect(errors).toContain('Missing required variable: verificationUrl');
    });

    it('should accept extra variables not in template', async () => {
      const errors = await registry.validateTemplate('payment-success', {
        user: { name: 'John' },
        amount: 100,
        currency: 'USD',
        eventName: 'Concert',
        ticketCount: 2,
        orderId: '123',
        extraField: 'should be ignored'
      });

      expect(errors).toEqual([]);
    });
  });

  describe('renderTemplate()', () => {
    it('should render email template successfully', async () => {
      mockReadFile.mockResolvedValue(
        '<html><body><h1>Payment Success</h1><p>Amount: {{amount}}</p></body></html>'
      );

      const result = await registry.renderTemplate('payment-success', {
        amount: 100,
        eventName: 'Concert'
      });

      expect(result).toHaveProperty('subject');
      expect(result).toHaveProperty('body');
      expect(result.subject).toContain('Concert');
      expect(result.body).toContain('100');
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should render template with compiled subject', async () => {
      mockReadFile.mockResolvedValue('<p>Template content</p>');

      const result = await registry.renderTemplate('ticket-purchased', {
        event: { name: 'Rock Concert' }
      });

      expect(result.subject).toBe('Your Tickets for Rock Concert');
    });

    it('should render SMS template without subject', async () => {
      mockReadFile.mockResolvedValue('TicketToken: Payment of ${{amount}} confirmed');

      const result = await registry.renderTemplate('sms-payment-success', {
        amount: 50
      });

      expect(result.subject).toBeUndefined();
      expect(result.body).toContain('50');
    });

    it('should throw error for non-existent template', async () => {
      await expect(
        registry.renderTemplate('non-existent-template', {})
      ).rejects.toThrow('Template non-existent-template not found');
    });

    it('should throw error when template file cannot be read', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      await expect(
        registry.renderTemplate('payment-success', {})
      ).rejects.toThrow();

      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should use correct file extension for email templates', async () => {
      mockReadFile.mockResolvedValue('<html></html>');

      await registry.renderTemplate('payment-success', {});

      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('.hbs'),
        'utf8'
      );
    });

    it('should use correct file extension for SMS templates', async () => {
      mockReadFile.mockResolvedValue('SMS content');

      await registry.renderTemplate('sms-payment-success', {});

      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('.txt'),
        'utf8'
      );
    });

    it('should handle complex template data', async () => {
      mockReadFile.mockResolvedValue(
        'Hello {{user.name}}, you purchased {{ticketCount}} tickets for {{event.name}}'
      );

      const result = await registry.renderTemplate('ticket-purchased', {
        user: { name: 'John Doe' },
        event: { name: 'Conference 2024' },
        ticketCount: 3
      });

      expect(result.body).toContain('John Doe');
      expect(result.body).toContain('3 tickets');
      expect(result.body).toContain('Conference 2024');
    });
  });

  describe('Template Metadata', () => {
    it('should have descriptions for all templates', () => {
      const templates = registry.getAllTemplates();

      templates.forEach(template => {
        expect(template.description).toBeTruthy();
        expect(template.description.length).toBeGreaterThan(0);
      });
    });

    it('should have variables defined for all templates', () => {
      const templates = registry.getAllTemplates();

      templates.forEach(template => {
        expect(Array.isArray(template.variables)).toBe(true);
        expect(template.variables.length).toBeGreaterThan(0);
      });
    });

    it('should have subjects for email templates', () => {
      const emailTemplates = registry.getTemplatesByChannel('email');

      emailTemplates.forEach(template => {
        expect(template.subject).toBeTruthy();
      });
    });

    it('should not have subjects for SMS templates', () => {
      const smsTemplates = registry.getTemplatesByChannel('sms');

      smsTemplates.forEach(template => {
        expect(template.subject).toBeUndefined();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty data object in validation', async () => {
      const errors = await registry.validateTemplate('payment-success', {});

      expect(errors.length).toBeGreaterThan(0);
    });

    it('should handle null template name gracefully', async () => {
      const template = registry.getTemplate(null as any);

      expect(template).toBeUndefined();
    });

    it('should handle undefined data in render', async () => {
      mockReadFile.mockResolvedValue('<p>{{value}}</p>');

      const result = await registry.renderTemplate('payment-success', {
        value: undefined
      });

      expect(result.body).toBeDefined();
    });
  });
});
