import { db } from '../config/database';
import { NotificationTemplate, NotificationChannel } from '../types/notification.types';
import { logger } from '../config/logger';
import Handlebars from 'handlebars';
import { redis } from '../config/redis';
import { env } from '../config/env';
import * as fs from 'fs/promises';
import * as path from 'path';

export class TemplateService {
  private readonly tableName = 'notification_templates';
  private compiledTemplates: Map<string, Handlebars.TemplateDelegate> = new Map();
  private templates: Map<string, Handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers() {
    Handlebars.registerHelper('formatDate', (date: Date) => {
      return new Date(date).toLocaleDateString();
    });

    Handlebars.registerHelper('formatTime', (date: Date) => {
      return new Date(date).toLocaleTimeString();
    });

    Handlebars.registerHelper('formatCurrency', (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount / 100);
    });

    Handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    Handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    Handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    Handlebars.registerHelper('gte', (a: any, b: any) => a >= b);
    Handlebars.registerHelper('lt', (a: any, b: any) => a < b);
    Handlebars.registerHelper('lte', (a: any, b: any) => a <= b);
  }

  async getTemplateById(id: string): Promise<NotificationTemplate | null> {
    const template = await db(this.tableName).where({ id }).first();
    if (!template) return null;
    return this.mapToTemplate(template);
  }

  async getTemplate(
    name: string,
    channel: NotificationChannel,
    venueId?: string
  ): Promise<NotificationTemplate | null> {
    const cacheKey = `template:${venueId || 'default'}:${channel}:${name}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as NotificationTemplate;
    }

    let template = null;
    if (venueId) {
      template = await db(this.tableName)
        .where('venue_id', venueId)
        .andWhere('name', name)
        .andWhere('channel', channel)
        .andWhere('is_active', true)
        .orderBy('version', 'desc')
        .first();
    }

    if (!template) {
      template = await db(this.tableName)
        .whereNull('venue_id')
        .andWhere('name', name)
        .andWhere('channel', channel)
        .andWhere('is_active', true)
        .orderBy('version', 'desc')
        .first();
    }

    if (template) {
      const mapped = this.mapToTemplate(template);
      await redis.setex(cacheKey, env.TEMPLATE_CACHE_TTL, JSON.stringify(mapped));
      return mapped;
    }

    return null;
  }

  async renderTemplate(
    template: NotificationTemplate,
    data: Record<string, any>
  ): Promise<{
    subject?: string;
    content: string;
    htmlContent?: string;
  }> {
    try {
      const contentKey = `${template.id}:content`;
      if (!this.compiledTemplates.has(contentKey)) {
        this.compiledTemplates.set(contentKey, Handlebars.compile(template.content));
      }

      const htmlKey = `${template.id}:html`;
      if (template.htmlContent && !this.compiledTemplates.has(htmlKey)) {
        this.compiledTemplates.set(htmlKey, Handlebars.compile(template.htmlContent));
      }

      const subjectKey = `${template.id}:subject`;
      if (template.subject && !this.compiledTemplates.has(subjectKey)) {
        this.compiledTemplates.set(subjectKey, Handlebars.compile(template.subject));
      }

      const content = this.compiledTemplates.get(contentKey)!(data);
      const htmlContent = template.htmlContent
        ? this.compiledTemplates.get(htmlKey)!(data)
        : undefined;
      const subject = template.subject
        ? this.compiledTemplates.get(subjectKey)!(data)
        : undefined;

      return { subject, content, htmlContent };
    } catch (error) {
      logger.error('Template rendering failed', {
        templateId: template.id,
        error
      });
      throw new Error('Failed to render template');
    }
  }

  async render(templateName: string, data: any): Promise<string> {
    try {
      if (!this.templates.has(templateName)) {
        await this.loadTemplate(templateName);
      }

      const template = this.templates.get(templateName);
      if (!template) {
        throw new Error(`Template ${templateName} not found`);
      }

      return template(data);
    } catch (error) {
      logger.error(`Failed to render template ${templateName}:`, error);
      return `<html><body><h1>${templateName}</h1><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
    }
  }

  private async loadTemplate(templateName: string): Promise<void> {
    const templatePath = path.join(__dirname, '../templates/email', `${templateName}.hbs`);
    try {
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const compiled = Handlebars.compile(templateContent);
      this.templates.set(templateName, compiled);
    } catch (error) {
      logger.error(`Failed to load template ${templateName}:`, error);
    }
  }

  async createTemplate(template: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationTemplate> {
    const [created] = await db(this.tableName)
      .insert({
        ...template,
        venue_id: template.venueId,
        is_active: template.isActive,
        html_content: template.htmlContent,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    logger.info('Template created', {
      name: template.name,
      channel: template.channel
    });

    return this.mapToTemplate(created);
  }

  async updateTemplate(
    id: string,
    updates: Partial<NotificationTemplate>
  ): Promise<NotificationTemplate> {
    const [updated] = await db(this.tableName)
      .where('id', id)
      .update({
        ...updates,
        updated_at: new Date(),
      })
      .returning('*');

    const template = this.mapToTemplate(updated);
    const cacheKey = `template:${template.venueId || 'default'}:${template.channel}:${template.name}`;
    await redis.del(cacheKey);

    return template;
  }

  async listTemplates(filters: any = {}): Promise<{ templates: NotificationTemplate[]; total: number }> {
    let query = db(this.tableName);

    if (filters.type) query = query.where({ type: filters.type });
    if (filters.channel) query = query.where({ channel: filters.channel });
    if (filters.status) query = query.where({ is_active: filters.status === 'active' });

    const [{ count }] = await query.clone().count('* as count');
    const templates = await query
      .orderBy('created_at', 'desc')
      .limit(filters.limit || 50)
      .offset(filters.offset || 0);

    return {
      templates: templates.map(t => this.mapToTemplate(t)),
      total: parseInt(count as string),
    };
  }

  async deleteTemplate(id: string): Promise<void> {
    await db(this.tableName).where({ id }).update({ is_active: false });
  }

  async previewTemplate(id: string, sampleData: any): Promise<any> {
    const template = await db(this.tableName).where({ id }).first();
    if (!template) throw new Error('Template not found');
    return this.renderTemplate(this.mapToTemplate(template), sampleData);
  }

  async getVersionHistory(id: string): Promise<any[]> {
    return db('template_versions').where({ template_id: id }).orderBy('version', 'desc');
  }

  async getUsageStats(id: string): Promise<any> {
    const [stats] = await db('template_usage')
      .where({ template_id: id })
      .select(
        db.raw('COUNT(*) as total_usage'),
        db.raw('SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as success_rate')
      );
    return {
      totalUsage: parseInt(stats?.total_usage || '0'),
      successRate: parseFloat(stats?.success_rate || '0'),
      recentUsage: [],
    };
  }

  private mapToTemplate(row: any): NotificationTemplate {
    return {
      id: row.id,
      venueId: row.venue_id,
      name: row.name,
      channel: row.channel,
      type: row.type,
      subject: row.subject,
      content: row.content,
      htmlContent: row.html_content,
      variables: row.variables || [],
      isActive: row.is_active,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const templateService = new TemplateService();
