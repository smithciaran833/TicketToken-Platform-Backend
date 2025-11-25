import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { TemplateService } from '../../../src/services/template.service';
import { db } from '../../../src/config/database';
import { redisHelper } from '../../../src/config/redis';
import * as fs from 'fs/promises';
import Handlebars from 'handlebars';

// Mock dependencies
jest.mock('../../../src/config/database');
jest.mock('../../../src/config/redis');
jest.mock('fs/promises');

const mockDb = db as any;
const mockRedisHelper = redisHelper as any;
const mockReadFile = fs.readFile as any;

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TemplateService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Handlebars Helpers Registration', () => {
    it('should register formatDate helper', () => {
      const helper = Handlebars.helpers['formatDate'] as Function;
      const date = new Date('2024-01-15');
      
      const result = helper(date);
      
      expect(result).toMatch(/1\/15\/2024/);
    });

    it('should register formatTime helper', () => {
      const helper = Handlebars.helpers['formatTime'] as Function;
      const date = new Date('2024-01-15T14:30:00');
      
      const result = helper(date);
      
      expect(typeof result).toBe('string');
      expect(result).toContain(':');
    });

    it('should register formatCurrency helper', () => {
      const helper = Handlebars.helpers['formatCurrency'] as Function;
      
      const result = helper(5000); // 5000 cents = $50.00
      
      expect(result).toBe('$50.00');
    });

    it('should register comparison helpers', () => {
      expect(Handlebars.helpers['eq'](5, 5)).toBe(true);
      expect(Handlebars.helpers['eq'](5, 3)).toBe(false);
      expect(Handlebars.helpers['ne'](5, 3)).toBe(true);
      expect(Handlebars.helpers['gt'](5, 3)).toBe(true);
      expect(Handlebars.helpers['gte'](5, 5)).toBe(true);
      expect(Handlebars.helpers['lt'](3, 5)).toBe(true);
      expect(Handlebars.helpers['lte'](5, 5)).toBe(true);
    });
  });

  describe('getTemplate()', () => {
    it('should return cached template if available', async () => {
      const mockTemplate = {
        id: '123',
        name: 'payment-success',
        channel: 'email',
        content: 'Hello {{name}}',
        isActive: true
      };
      
      mockRedisHelper.get.mockResolvedValue(mockTemplate);

      const result = await service.getTemplate('payment-success', 'email');

      expect(result).toEqual(mockTemplate);
      expect(mockRedisHelper.get).toHaveBeenCalledWith('template:default:email:payment-success');
      expect(mockDb).not.toHaveBeenCalled();
    });

    it('should fetch venue-specific template from database', async () => {
      mockRedisHelper.get.mockResolvedValue(null);
      
      const dbTemplate = {
        id: '123',
        venue_id: 'venue-123',
        name: 'payment-success',
        channel: 'email',
        content: 'Custom template',
        is_active: true,
        version: 1,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(dbTemplate)
      });

      mockRedisHelper.setWithTTL.mockResolvedValue(undefined);

      const result = await service.getTemplate('payment-success', 'email', 'venue-123');

      expect(result).toBeDefined();
      expect(result?.venueId).toBe('venue-123');
      expect(mockRedisHelper.setWithTTL).toHaveBeenCalled();
    });

    it('should fall back to default template if venue-specific not found', async () => {
      mockRedisHelper.get.mockResolvedValue(null);

      const dbTemplate = {
        id: '123',
        venue_id: null,
        name: 'payment-success',
        channel: 'email',
        content: 'Default template',
        is_active: true,
        version: 1,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.mockReturnValueOnce({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      }).mockReturnValueOnce({
        whereNull: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(dbTemplate)
      });

      mockRedisHelper.setWithTTL.mockResolvedValue(undefined);

      const result = await service.getTemplate('payment-success', 'email', 'venue-123');

      expect(result).toBeDefined();
      expect(result?.venueId).toBeUndefined();
    });

    it('should return null if no template found', async () => {
      mockRedisHelper.get.mockResolvedValue(null);
      mockDb.mockReturnValue({
        whereNull: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      });

      const result = await service.getTemplate('non-existent', 'email');

      expect(result).toBeNull();
    });

    it('should cache template after fetching from database', async () => {
      mockRedisHelper.get.mockResolvedValue(null);
      
      const dbTemplate = {
        id: '123',
        name: 'test-template',
        channel: 'email',
        content: 'Content',
        is_active: true,
        version: 1,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.mockReturnValue({
        whereNull: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(dbTemplate)
      });

      mockRedisHelper.setWithTTL.mockResolvedValue(undefined);

      await service.getTemplate('test-template', 'email');

      expect(mockRedisHelper.setWithTTL).toHaveBeenCalledWith(
        'template:default:email:test-template',
        expect.any(Object),
        expect.any(Number)
      );
    });
  });

  describe('renderTemplate()', () => {
    const mockTemplate = {
      id: '123',
      name: 'payment-success',
      channel: 'email' as const,
      type: 'transactional' as const,
      content: 'Hello {{user.name}}',
      htmlContent: '<h1>Hello {{user.name}}</h1>',
      subject: 'Payment for {{eventName}}',
      isActive: true,
      version: 1,
      variables: ['user', 'eventName'],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it('should render template with text content', async () => {
      const result = await service.renderTemplate(mockTemplate, {
        user: { name: 'John' },
        eventName: 'Concert'
      });

      expect(result.content).toContain('John');
      expect(result.subject).toContain('Concert');
    });

    it('should render template with HTML content', async () => {
      const result = await service.renderTemplate(mockTemplate, {
        user: { name: 'Jane' },
        eventName: 'Festival'
      });

      expect(result.htmlContent).toContain('<h1>Hello Jane</h1>');
    });

    it('should render subject from template', async () => {
      const result = await service.renderTemplate(mockTemplate, {
        user: { name: 'John' },
        eventName: 'Rock Concert'
      });

      expect(result.subject).toBe('Payment for Rock Concert');
    });

    it('should cache compiled templates', async () => {
      const data = {
        user: { name: 'John' },
        eventName: 'Concert'
      };

      // First render
      await service.renderTemplate(mockTemplate, data);
      // Second render (should use cached compilation)
      const result = await service.renderTemplate(mockTemplate, data);

      expect(result.content).toContain('John');
    });

    it('should throw error on rendering failure', async () => {
      const badTemplate = {
        ...mockTemplate,
        content: '{{#each}}' // Invalid syntax
      };

      await expect(
        service.renderTemplate(badTemplate, {})
      ).rejects.toThrow('Failed to render template');
    });

    it('should handle template without HTML content', async () => {
      const textOnlyTemplate = {
        ...mockTemplate,
        htmlContent: undefined
      };

      const result = await service.renderTemplate(textOnlyTemplate, {
        user: { name: 'John' },
        eventName: 'Concert'
      });

      expect(result.htmlContent).toBeUndefined();
      expect(result.content).toBeDefined();
    });

    it('should handle template without subject', async () => {
      const noSubjectTemplate = {
        ...mockTemplate,
        subject: undefined
      };

      const result = await service.renderTemplate(noSubjectTemplate, {
        user: { name: 'John' },
        eventName: 'Concert'
      });

      expect(result.subject).toBeUndefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('render() - File-based templates', () => {
    it('should load and render file-based template', async () => {
      mockReadFile.mockResolvedValue('<h1>Hello {{name}}</h1>');

      const result = await service.render('welcome-email', { name: 'John' });

      expect(result).toContain('John');
      expect(mockReadFile).toHaveBeenCalled();
    });

    it('should cache loaded templates', async () => {
      mockReadFile.mockResolvedValue('<p>{{message}}</p>');

      // First call
      await service.render('test-template', { message: 'Hello' });
      // Second call (should use cache)
      const result = await service.render('test-template', { message: 'World' });

      expect(result).toContain('World');
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('should return fallback HTML on error', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await service.render('non-existent', { data: 'test' });

      expect(result).toContain('non-existent');
      expect(result).toContain('test');
    });

    it('should handle template rendering errors gracefully', async () => {
      mockReadFile.mockResolvedValue('{{#invalid}}');

      const result = await service.render('bad-template', {});

      expect(result).toContain('bad-template');
    });
  });

  describe('createTemplate()', () => {
    it('should create new template in database', async () => {
      const newTemplate = {
        name: 'new-template',
        channel: 'email' as const,
        type: 'transactional' as const,
        content: 'Content',
        isActive: true,
        version: 1,
        variables: ['user']
      };

      const created = {
        id: '456',
        ...newTemplate,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([created])
      });

      const result = await service.createTemplate(newTemplate);

      expect(result.id).toBe('456');
      expect(result.name).toBe('new-template');
    });

    it('should handle venue-specific template creation', async () => {
      const venueTemplate = {
        name: 'venue-template',
        channel: 'email' as const,
        type: 'transactional' as const,
        content: 'Venue content',
        venueId: 'venue-123',
        isActive: true,
        version: 1,
        variables: []
      };

      const created = {
        id: '789',
        ...venueTemplate,
        venue_id: 'venue-123',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.mockReturnValue({
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([created])
      });

      const result = await service.createTemplate(venueTemplate);

      expect(result.venueId).toBe('venue-123');
    });
  });

  describe('updateTemplate()', () => {
    it('should update existing template', async () => {
      const updates = {
        content: 'Updated content',
        isActive: false
      };

      const updated = {
        id: '123',
        name: 'test-template',
        channel: 'email',
        content: 'Updated content',
        is_active: false,
        version: 2,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([updated])
      });

      mockRedisHelper.delete.mockResolvedValue(1);

      const result = await service.updateTemplate('123', updates);

      expect(result.content).toBe('Updated content');
      expect(result.isActive).toBe(false);
      expect(mockRedisHelper.delete).toHaveBeenCalled();
    });

    it('should clear cache after update', async () => {
      const updates = { content: 'New content' };

      const updated = {
        id: '123',
        name: 'payment-success',
        channel: 'email',
        content: 'New content',
        is_active: true,
        version: 2,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValue([updated])
      });

      mockRedisHelper.delete.mockResolvedValue(1);

      await service.updateTemplate('123', updates);

      expect(mockRedisHelper.delete).toHaveBeenCalledWith(
        'template:default:email:payment-success'
      );
    });
  });

  describe('Template Versioning', () => {
    it('should return latest version of template', async () => {
      mockRedisHelper.get.mockResolvedValue(null);

      const v2Template = {
        id: '123',
        name: 'test-template',
        channel: 'email',
        content: 'Version 2',
        is_active: true,
        version: 2,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.mockReturnValue({
        whereNull: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(v2Template)
      });

      mockRedisHelper.setWithTTL.mockResolvedValue(undefined);

      const result = await service.getTemplate('test-template', 'email');

      expect(result?.version).toBe(2);
    });
  });

  describe('Complex Template Rendering', () => {
    it('should handle nested template variables', async () => {
      const template = {
        id: '123',
        name: 'order-confirmation',
        channel: 'email' as const,
        type: 'transactional' as const,
        content: 'Order: {{order.id}}, User: {{order.user.name}}',
        isActive: true,
        version: 1,
        variables: ['order'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await service.renderTemplate(template, {
        order: {
          id: 'ORD-123',
          user: { name: 'John Doe' }
        }
      });

      expect(result.content).toContain('ORD-123');
      expect(result.content).toContain('John Doe');
    });

    it('should handle arrays in templates', async () => {
      const template = {
        id: '123',
        name: 'cart-summary',
        channel: 'email' as const,
        type: 'transactional' as const,
        content: '{{#each items}}{{name}} {{/each}}',
        isActive: true,
        version: 1,
        variables: ['items'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await service.renderTemplate(template, {
        items: [
          { name: 'Item 1' },
          { name: 'Item 2' }
        ]
      });

      expect(result.content).toContain('Item 1');
      expect(result.content).toContain('Item 2');
    });

    it('should use registered helpers in rendering', async () => {
      const template = {
        id: '123',
        name: 'invoice',
        channel: 'email' as const,
        type: 'transactional' as const,
        content: 'Total: {{formatCurrency amount}}',
        isActive: true,
        version: 1,
        variables: ['amount'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await service.renderTemplate(template, {
        amount: 10000 // 100.00 USD
      });

      expect(result.content).toContain('$100.00');
    });
  });
});
