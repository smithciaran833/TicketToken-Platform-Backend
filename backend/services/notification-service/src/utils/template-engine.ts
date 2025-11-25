import { logger } from '../config/logger';

/**
 * Template variable types
 */
export interface TemplateVariables {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Template rendering options
 */
export interface RenderOptions {
  strict?: boolean; // Throw error on missing variables
  escapeHtml?: boolean; // Escape HTML in variables
  defaultValue?: string; // Default value for missing variables
}

/**
 * Template Engine
 * 
 * Handles variable substitution in templates using {{variable}} syntax
 */
export class TemplateEngine {
  private static readonly VARIABLE_REGEX = /\{\{([^}]+)\}\}/g;
  private static readonly CONDITIONAL_REGEX = /\{\{#if\s+(\w+)\}\}(.*?)\{\{\/if\}\}/gs;
  private static readonly LOOP_REGEX = /\{\{#each\s+(\w+)\}\}(.*?)\{\{\/each\}\}/gs;

  /**
   * Render template with variables
   */
  static render(
    template: string,
    variables: TemplateVariables,
    options: RenderOptions = {}
  ): string {
    const {
      strict = false,
      escapeHtml = true,
      defaultValue = '',
    } = options;

    let rendered = template;

    // Process conditionals {{#if variable}}...{{/if}}
    rendered = this.processConditionals(rendered, variables);

    // Process loops {{#each array}}...{{/each}}
    rendered = this.processLoops(rendered, variables);

    // Replace simple variables {{variable}}
    rendered = rendered.replace(this.VARIABLE_REGEX, (match, variablePath) => {
      const trimmedPath = variablePath.trim();
      const value = this.getNestedValue(variables, trimmedPath);

      if (value === undefined || value === null) {
        if (strict) {
          throw new Error(`Missing template variable: ${trimmedPath}`);
        }
        logger.debug(`Template variable not found: ${trimmedPath}`);
        return defaultValue;
      }

      const stringValue = String(value);
      return escapeHtml ? this.escapeHtml(stringValue) : stringValue;
    });

    return rendered;
  }

  /**
   * Process conditional blocks
   */
  private static processConditionals(
    template: string,
    variables: TemplateVariables
  ): string {
    return template.replace(this.CONDITIONAL_REGEX, (match, variable, content) => {
      const value = this.getNestedValue(variables, variable.trim());
      return this.isTruthy(value) ? content : '';
    });
  }

  /**
   * Process loop blocks
   */
  private static processLoops(
    template: string,
    variables: TemplateVariables
  ): string {
    return template.replace(this.LOOP_REGEX, (match, arrayName, content) => {
      const array = this.getNestedValue(variables, arrayName.trim());
      
      if (!Array.isArray(array)) {
        logger.warn(`Loop variable is not an array: ${arrayName}`);
        return '';
      }

      return array.map((item, index) => {
        const loopVars = {
          ...variables,
          [arrayName]: item,
          index,
          first: index === 0,
          last: index === array.length - 1,
        };
        return this.render(content, loopVars, { strict: false });
      }).join('');
    });
  }

  /**
   * Get nested value from object using dot notation
   */
  private static getNestedValue(
    obj: any,
    path: string
  ): any {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Check if value is truthy for conditionals
   */
  private static isTruthy(value: any): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }

  /**
   * Escape HTML special characters
   */
  private static escapeHtml(text: string): string {
    const htmlEscapeMap: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };

    return text.replace(/[&<>"'/]/g, (char) => htmlEscapeMap[char]);
  }

  /**
   * Extract variables used in template
   */
  static extractVariables(template: string): string[] {
    const variables = new Set<string>();
    const matches = template.matchAll(this.VARIABLE_REGEX);

    for (const match of matches) {
      const variable = match[1].trim();
      variables.add(variable);
    }

    // Extract from conditionals
    const conditionalMatches = template.matchAll(this.CONDITIONAL_REGEX);
    for (const match of conditionalMatches) {
      variables.add(match[1].trim());
    }

    // Extract from loops
    const loopMatches = template.matchAll(this.LOOP_REGEX);
    for (const match of loopMatches) {
      variables.add(match[1].trim());
    }

    return Array.from(variables);
  }

  /**
   * Validate template syntax
   */
  static validate(template: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check for unclosed tags
    const openTags = (template.match(/\{\{#/g) || []).length;
    const closeTags = (template.match(/\{\{\//g) || []).length;

    if (openTags !== closeTags) {
      errors.push('Unmatched opening/closing tags');
    }

    // Check for invalid variable syntax
    const invalidVars = template.match(/\{\{[^}]*\{\{/g);
    if (invalidVars) {
      errors.push('Invalid nested variable syntax');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Preview template with sample data
   */
  static preview(
    template: string,
    sampleData: TemplateVariables = {}
  ): {
    rendered: string;
    variables: string[];
    missingVariables: string[];
  } {
    const variables = this.extractVariables(template);
    const missingVariables = variables.filter(
      (v) => !(v in sampleData) && !v.includes('.')
    );

    // Fill in missing variables with placeholders
    const previewData = { ...sampleData };
    for (const variable of missingVariables) {
      previewData[variable] = `[${variable}]`;
    }

    const rendered = this.render(template, previewData, {
      strict: false,
      defaultValue: '[missing]',
    });

    return {
      rendered,
      variables,
      missingVariables,
    };
  }

  /**
   * Create personalized subject line
   */
  static renderSubject(
    subject: string,
    variables: TemplateVariables
  ): string {
    return this.render(subject, variables, {
      strict: false,
      escapeHtml: false, // Don't escape HTML in subject lines
      defaultValue: '',
    });
  }

  /**
   * Create personalized email body (HTML)
   */
  static renderEmailHtml(
    htmlTemplate: string,
    variables: TemplateVariables
  ): string {
    return this.render(htmlTemplate, variables, {
      strict: false,
      escapeHtml: true,
      defaultValue: '',
    });
  }

  /**
   * Create personalized email body (plain text)
   */
  static renderEmailText(
    textTemplate: string,
    variables: TemplateVariables
  ): string {
    return this.render(textTemplate, variables, {
      strict: false,
      escapeHtml: false,
      defaultValue: '',
    });
  }

  /**
   * Create personalized SMS message
   */
  static renderSms(
    template: string,
    variables: TemplateVariables
  ): string {
    const rendered = this.render(template, variables, {
      strict: false,
      escapeHtml: false,
      defaultValue: '',
    });

    // SMS length limit (160 characters for single message)
    if (rendered.length > 160) {
      logger.warn('SMS message exceeds 160 characters', {
        length: rendered.length,
      });
    }

    return rendered;
  }
}

/**
 * Helper functions for common template patterns
 */
export const TemplateHelpers = {
  /**
   * Format date
   */
  formatDate(date: Date | string, format: string = 'YYYY-MM-DD'): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    // Simple date formatting (in production, use a library like date-fns)
    return d.toISOString().split('T')[0];
  },

  /**
   * Format currency
   */
  formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  },

  /**
   * Truncate text
   */
  truncate(text: string, length: number, suffix: string = '...'): string {
    if (text.length <= length) return text;
    return text.substring(0, length - suffix.length) + suffix;
  },

  /**
   * Capitalize first letter
   */
  capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  },
};

export default TemplateEngine;
