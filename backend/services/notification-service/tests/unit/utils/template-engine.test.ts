import TemplateEngine, { TemplateHelpers, TemplateVariables } from '../../../src/utils/template-engine';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/config/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TemplateEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('render() - Basic Variables', () => {
    it('should replace simple variables', () => {
      const template = 'Hello {{name}}!';
      const variables = { name: 'John' };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('Hello John!');
    });

    it('should replace multiple variables', () => {
      const template = '{{greeting}} {{name}}, you have {{count}} messages.';
      const variables = { greeting: 'Hello', name: 'Alice', count: 5 };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('Hello Alice, you have 5 messages.');
    });

    it('should handle nested object properties', () => {
      const template = 'User: {{user.name}}, Email: {{user.email}}';
      const variables = { user: { name: 'Bob', email: 'bob@example.com' } };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('User: Bob, Email: bob@example.com');
    });

    it('should handle deep nesting', () => {
      const template = '{{a.b.c.d}}';
      const variables = { a: { b: { c: { d: 'deep value' } } } };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('deep value');
    });
  });

  describe('render() - Missing Variables', () => {
    it('should use default value for missing variables', () => {
      const template = 'Hello {{name}}!';
      const variables = {};
      
      const result = TemplateEngine.render(template, variables, { defaultValue: '[missing]' });
      
      expect(result).toBe('Hello [missing]!');
    });

    it('should throw error in strict mode', () => {
      const template = 'Hello {{name}}!';
      const variables = {};
      
      expect(() => {
        TemplateEngine.render(template, variables, { strict: true });
      }).toThrow('Missing template variable: name');
    });

    it('should log debug message for missing variables', () => {
      const template = 'Hello {{name}}!';
      const variables = {};
      
      TemplateEngine.render(template, variables);
      
      expect(logger.debug).toHaveBeenCalledWith('Template variable not found: name');
    });

    it('should handle null values', () => {
      const template = 'Value: {{value}}';
      const variables = { value: null };
      
      const result = TemplateEngine.render(template, variables, { defaultValue: 'N/A' });
      
      expect(result).toBe('Value: N/A');
    });

    it('should handle undefined values', () => {
      const template = 'Value: {{value}}';
      const variables = { value: undefined };
      
      const result = TemplateEngine.render(template, variables, { defaultValue: 'N/A' });
      
      expect(result).toBe('Value: N/A');
    });
  });

  describe('render() - HTML Escaping', () => {
    it('should escape HTML by default', () => {
      const template = 'Content: {{html}}';
      const variables = { html: '<script>alert("xss")</script>' };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('Content: &lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should not escape when disabled', () => {
      const template = 'Content: {{html}}';
      const variables = { html: '<b>bold</b>' };
      
      const result = TemplateEngine.render(template, variables, { escapeHtml: false });
      
      expect(result).toBe('Content: <b>bold</b>');
    });

    it('should escape all HTML special characters', () => {
      const template = '{{content}}';
      const variables = { content: '& < > " \' /' };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('&amp; &lt; &gt; &quot; &#x27; &#x2F;');
    });
  });

  describe('Conditionals', () => {
    it('should render conditional block when variable is truthy', () => {
      const template = '{{#if showMessage}}Hello!{{/if}}';
      const variables = { showMessage: true };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('Hello!');
    });

    it('should not render conditional block when variable is falsy', () => {
      const template = '{{#if showMessage}}Hello!{{/if}}';
      const variables = { showMessage: false };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('');
    });

    it('should handle multiple conditionals', () => {
      const template = '{{#if a}}A{{/if}} {{#if b}}B{{/if}}';
      const variables = { a: true, b: false };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('A ');
    });

    it('should treat non-empty strings as truthy', () => {
      const template = '{{#if name}}Hello {{name}}{{/if}}';
      const variables = { name: 'John' };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('Hello John');
    });

    it('should treat empty strings as falsy', () => {
      const template = '{{#if name}}Hello{{/if}}';
      const variables = { name: '' };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('');
    });

    it('should treat zero as falsy', () => {
      const template = '{{#if count}}Count: {{count}}{{/if}}';
      const variables = { count: 0 };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('');
    });

    it('should treat non-zero numbers as truthy', () => {
      const template = '{{#if count}}Count: {{count}}{{/if}}';
      const variables = { count: 5 };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('Count: 5');
    });
  });

  describe('Loops', () => {
    it('should iterate over array', () => {
      const template = '{{#each items}}{{items}},{{/each}}';
      const variables = { items: ['a', 'b', 'c'] };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('a,b,c,');
    });

    it('should provide loop metadata', () => {
      const template = '{{#each items}}{{index}}:{{items}}{{#if last}}{{/if}}{{/each}}';
      const variables = { items: ['a', 'b'] };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toContain('0:a');
      expect(result).toContain('1:b');
    });

    it('should handle empty arrays', () => {
      const template = '{{#each items}}Item{{/each}}';
      const variables = { items: [] };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('');
    });

    it('should warn when loop variable is not an array', () => {
      const template = '{{#each items}}{{items}}{{/each}}';
      const variables = { items: 'not an array' };
      
      const result = TemplateEngine.render(template, variables);
      
      expect(result).toBe('');
      expect(logger.warn).toHaveBeenCalledWith('Loop variable is not an array: items');
    });
  });

  describe('extractVariables()', () => {
    it('should extract simple variables', () => {
      const template = 'Hello {{name}}!';
      
      const variables = TemplateEngine.extractVariables(template);
      
      expect(variables).toEqual(['name']);
    });

    it('should extract multiple variables', () => {
      const template = '{{greeting}} {{name}}';
      
      const variables = TemplateEngine.extractVariables(template);
      
      expect(variables).toContain('greeting');
      expect(variables).toContain('name');
    });

    it('should extract variables from conditionals', () => {
      const template = '{{#if show}}Hello{{/if}}';
      
      const variables = TemplateEngine.extractVariables(template);
      
      expect(variables).toContain('show');
    });

    it('should extract variables from loops', () => {
      const template = '{{#each items}}{{items}}{{/each}}';
      
      const variables = TemplateEngine.extractVariables(template);
      
      expect(variables).toContain('items');
    });

    it('should return unique variables', () => {
      const template = '{{name}} {{name}}';
      
      const variables = TemplateEngine.extractVariables(template);
      
      expect(variables).toEqual(['name']);
    });
  });

  describe('validate()', () => {
    it('should validate correct template', () => {
      const template = 'Hello {{name}}!';
      
      const result = TemplateEngine.validate(template);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect unmatched opening tags', () => {
      const template = '{{#if show}}Hello';
      
      const result = TemplateEngine.validate(template);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unmatched opening/closing tags');
    });

    it('should detect unmatched closing tags', () => {
      const template = 'Hello{{/if}}';
      
      const result = TemplateEngine.validate(template);
      
      expect(result.valid).toBe(false);
    });

    it('should detect invalid nested syntax', () => {
      const template = '{{{{name}}';
      
      const result = TemplateEngine.validate(template);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid nested variable syntax');
    });
  });

  describe('preview()', () => {
    it('should preview template with sample data', () => {
      const template = 'Hello {{name}}!';
      const sampleData = { name: 'John' };
      
      const result = TemplateEngine.preview(template, sampleData);
      
      expect(result.rendered).toBe('Hello John!');
      expect(result.variables).toEqual(['name']);
      expect(result.missingVariables).toEqual([]);
    });

    it('should identify missing variables', () => {
      const template = 'Hello {{name}}, you have {{count}} messages.';
      const sampleData = { name: 'John' };
      
      const result = TemplateEngine.preview(template, sampleData);
      
      expect(result.missingVariables).toContain('count');
    });

    it('should use placeholders for missing variables', () => {
      const template = 'Hello {{name}}!';
      const sampleData = {};
      
      const result = TemplateEngine.preview(template, sampleData);
      
      expect(result.rendered).toBe('Hello [name]!');
    });
  });

  describe('Specialized Render Methods', () => {
    describe('renderSubject()', () => {
      it('should render subject without HTML escaping', () => {
        const subject = 'Re: {{topic}}';
        const variables = { topic: '<Important>' };
        
        const result = TemplateEngine.renderSubject(subject, variables);
        
        expect(result).toBe('Re: <Important>');
      });
    });

    describe('renderEmailHtml()', () => {
      it('should render HTML with escaping', () => {
        const html = '<p>Hello {{name}}</p>';
        const variables = { name: '<script>alert("xss")</script>' };
        
        const result = TemplateEngine.renderEmailHtml(html, variables);
        
        expect(result).toContain('&lt;script&gt;');
      });
    });

    describe('renderEmailText()', () => {
      it('should render text without HTML escaping', () => {
        const text = 'Hello {{name}}';
        const variables = { name: 'John' };
        
        const result = TemplateEngine.renderEmailText(text, variables);
        
        expect(result).toBe('Hello John');
      });
    });

    describe('renderSms()', () => {
      it('should render SMS message', () => {
        const sms = 'Hello {{name}}!';
        const variables = { name: 'John' };
        
        const result = TemplateEngine.renderSms(sms, variables);
        
        expect(result).toBe('Hello John!');
      });

      it('should warn when SMS exceeds 160 characters', () => {
        const sms = '{{message}}';
        const variables = { message: 'a'.repeat(161) };
        
        TemplateEngine.renderSms(sms, variables);
        
        expect(logger.warn).toHaveBeenCalledWith(
          'SMS message exceeds 160 characters',
          expect.objectContaining({ length: 161 })
        );
      });
    });
  });
});

describe('TemplateHelpers', () => {
  describe('formatDate()', () => {
    it('should format date object', () => {
      const date = new Date('2024-01-15');
      
      const result = TemplateHelpers.formatDate(date);
      
      expect(result).toBe('2024-01-15');
    });

    it('should format date string', () => {
      const result = TemplateHelpers.formatDate('2024-01-15');
      
      expect(result).toBe('2024-01-15');
    });
  });

  describe('formatCurrency()', () => {
    it('should format USD by default', () => {
      const result = TemplateHelpers.formatCurrency(1234.56);
      
      expect(result).toBe('$1,234.56');
    });

    it('should format other currencies', () => {
      const result = TemplateHelpers.formatCurrency(1234.56, 'EUR');
      
      expect(result).toContain('1,234.56');
    });
  });

  describe('truncate()', () => {
    it('should truncate long text', () => {
      const result = TemplateHelpers.truncate('Hello World', 8);
      
      expect(result).toBe('Hello...');
    });

    it('should not truncate short text', () => {
      const result = TemplateHelpers.truncate('Hello', 10);
      
      expect(result).toBe('Hello');
    });

    it('should use custom suffix', () => {
      const result = TemplateHelpers.truncate('Hello World', 8, '---');
      
      expect(result).toBe('Hello---');
    });
  });

  describe('capitalize()', () => {
    it('should capitalize first letter', () => {
      const result = TemplateHelpers.capitalize('hello');
      
      expect(result).toBe('Hello');
    });

    it('should not affect other letters', () => {
      const result = TemplateHelpers.capitalize('hELLO');
      
      expect(result).toBe('HELLO');
    });
  });
});
