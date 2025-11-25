import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { EmailTemplate, NotificationType, NotificationContext, TemplateVariables, RenderTemplateResult } from '../types/notification.types';
import { TemplateRenderer } from '../utils/template-renderer';

export class EmailTemplateService {
  async getTemplate(
    tenantId: string,
    templateType: NotificationType,
    languageCode: string = 'en'
  ): Promise<EmailTemplate | null> {
    const db = getDatabase();
    try {
      const result = await db.query(
        'SELECT * FROM email_templates WHERE tenant_id = $1 AND template_type = $2 AND language_code = $3 AND is_active = TRUE',
        [tenantId, templateType, languageCode]
      );
      
      if (result.rows.length === 0) {
        logger.warn('Email template not found', { tenantId, templateType, languageCode });
        return null;
      }
      
      return this.mapToTemplate(result.rows[0]);
    } catch (error) {
      logger.error('Error fetching email template', { error, tenantId, templateType });
      throw error;
    }
  }

  async renderTemplate(
    template: EmailTemplate,
    context: NotificationContext
  ): Promise<RenderTemplateResult> {
    try {
      const variables = this.buildVariables(context);
      
      // Validate all required variables are present
      const missingVars = TemplateRenderer.validateVariables(template.bodyHtml, variables);
      if (missingVars.length > 0) {
        logger.warn('Missing template variables', { missingVars, templateType: template.templateType });
      }
      
      return TemplateRenderer.renderEmailTemplate(
        template.subjectTemplate,
        template.bodyHtml,
        template.bodyText,
        variables
      );
    } catch (error) {
      logger.error('Error rendering email template', { error, templateId: template.id });
      throw error;
    }
  }

  async createTemplate(
    tenantId: string,
    templateData: Partial<EmailTemplate>
  ): Promise<EmailTemplate> {
    const db = getDatabase();
    try {
      const result = await db.query(
        `INSERT INTO email_templates (tenant_id, template_name, template_type, subject_template, body_html, body_text, language_code, variables) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          tenantId,
          templateData.templateName,
          templateData.templateType,
          templateData.subjectTemplate,
          templateData.bodyHtml,
          templateData.bodyText,
          templateData.languageCode || 'en',
          JSON.stringify(templateData.variables || []),
        ]
      );
      
      logger.info('Created email template', { templateId: result.rows[0].id, type: templateData.templateType });
      return this.mapToTemplate(result.rows[0]);
    } catch (error) {
      logger.error('Error creating email template', { error, templateData });
      throw error;
    }
  }

  private buildVariables(context: NotificationContext): TemplateVariables {
    const variables: TemplateVariables = {
      customerName: context.user?.name || 'Customer',
      customerEmail: context.user?.email || '',
      orderId: context.orderId || '',
      orderNumber: context.order?.orderNumber || '',
      eventName: context.event?.name || 'Event',
      eventDate: context.event?.date || new Date(),
      eventVenue: context.event?.venue || '',
      orderTotal: context.order?.totalCents ? `$${(context.order.totalCents / 100).toFixed(2)}` : '$0.00',
      tenantName: 'TicketToken',
      supportEmail: 'support@tickettoken.com',
      currentYear: new Date().getFullYear(),
    };
    
    return variables;
  }

  private mapToTemplate(row: any): EmailTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      templateName: row.template_name,
      templateType: row.template_type,
      subjectTemplate: row.subject_template,
      bodyHtml: row.body_html,
      bodyText: row.body_text,
      languageCode: row.language_code,
      variables: row.variables,
      isActive: row.is_active,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const emailTemplateService = new EmailTemplateService();
