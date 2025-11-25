import { TemplateVariables, RenderTemplateResult } from '../types/notification.types';

export class TemplateRenderer {
  /**
   * Render template by replacing {{variable}} placeholders with actual values
   */
  static render(template: string, variables: TemplateVariables): string {
    let rendered = template;
    
    Object.keys(variables).forEach((key) => {
      const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      const value = this.formatValue(variables[key]);
      rendered = rendered.replace(placeholder, value);
    });
    
    return rendered;
  }

  /**
   * Render email template (subject, html body, text body)
   */
  static renderEmailTemplate(
    subject: string,
    htmlBody: string,
    textBody: string,
    variables: TemplateVariables
  ): RenderTemplateResult {
    return {
      subject: this.render(subject, variables),
      htmlBody: this.render(htmlBody, variables),
      textBody: this.render(textBody, variables),
    };
  }

  /**
   * Extract variables from template
   */
  static extractVariables(template: string): string[] {
    const regex = /{{\\s*([a-zA-Z0-9_]+)\\s*}}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  /**
   * Validate that all required variables are provided
   */
  static validateVariables(template: string, variables: TemplateVariables): string[] {
    const required = this.extractVariables(template);
    const provided = Object.keys(variables);
    return required.filter((v) => !provided.includes(v));
  }

  /**
   * Format value for display in template
   */
  private static formatValue(value: string | number | boolean | Date): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    return String(value);
  }
}
