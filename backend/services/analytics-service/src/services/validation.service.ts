import { ValidationError } from '../utils/errors';

export class ValidationService {
  private static instance: ValidationService;

  static getInstance(): ValidationService {
    if (!this.instance) {
      this.instance = new ValidationService();
    }
    return this.instance;
  }

  validateDateRange(startDate: Date, endDate: Date): void {
    if (startDate > endDate) {
      throw new ValidationError('Start date must be before end date');
    }

    const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
    if (endDate.getTime() - startDate.getTime() > maxRange) {
      throw new ValidationError('Date range cannot exceed 1 year');
    }
  }

  validatePaginationParams(page: number, limit: number): void {
    if (page < 1) {
      throw new ValidationError('Page must be greater than 0');
    }

    if (limit < 1 || limit > 1000) {
      throw new ValidationError('Limit must be between 1 and 1000');
    }
  }

  validateMetricType(metricType: string): void {
    const validTypes = [
      'sales', 'revenue', 'attendance', 'capacity', 
      'conversion', 'cart_abandonment', 'average_order_value',
      'customer_lifetime_value'
    ];

    if (!validTypes.includes(metricType)) {
      throw new ValidationError(`Invalid metric type: ${metricType}`);
    }
  }

  validateExportFormat(format: string): void {
    const validFormats = ['csv', 'xlsx', 'pdf', 'json', 'xml'];
    
    if (!validFormats.includes(format.toLowerCase())) {
      throw new ValidationError(`Invalid export format: ${format}`);
    }
  }

  validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email address');
    }
  }

  validatePhoneNumber(phone: string): void {
    const phoneRegex = /^\+?[\d\s-()]+$/;
    if (!phoneRegex.test(phone) || phone.length < 10) {
      throw new ValidationError('Invalid phone number');
    }
  }

  validateUUID(uuid: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      throw new ValidationError('Invalid UUID format');
    }
  }

  validateTimeGranularity(unit: string, value: number): void {
    const validUnits = ['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];
    
    if (!validUnits.includes(unit)) {
      throw new ValidationError(`Invalid time unit: ${unit}`);
    }

    if (value < 1 || value > 100) {
      throw new ValidationError('Time value must be between 1 and 100');
    }
  }

  validateAlertThreshold(value: number, min?: number, max?: number): void {
    if (min !== undefined && value < min) {
      throw new ValidationError(`Threshold must be at least ${min}`);
    }

    if (max !== undefined && value > max) {
      throw new ValidationError(`Threshold must be at most ${max}`);
    }
  }

  validateWidgetConfig(config: any): void {
    if (!config.type) {
      throw new ValidationError('Widget type is required');
    }

    if (!config.title || config.title.length < 1) {
      throw new ValidationError('Widget title is required');
    }

    if (!config.metrics || !Array.isArray(config.metrics) || config.metrics.length === 0) {
      throw new ValidationError('At least one metric is required');
    }

    if (!config.size || !config.size.width || !config.size.height) {
      throw new ValidationError('Widget size is required');
    }

    if (config.size.width < 1 || config.size.width > 12) {
      throw new ValidationError('Widget width must be between 1 and 12');
    }

    if (config.size.height < 1 || config.size.height > 12) {
      throw new ValidationError('Widget height must be between 1 and 12');
    }
  }

  validateDashboardName(name: string): void {
    if (!name || name.trim().length < 1) {
      throw new ValidationError('Dashboard name is required');
    }

    if (name.length > 100) {
      throw new ValidationError('Dashboard name must be less than 100 characters');
    }

    const validNameRegex = /^[a-zA-Z0-9\s\-_]+$/;
    if (!validNameRegex.test(name)) {
      throw new ValidationError('Dashboard name contains invalid characters');
    }
  }

  validateCampaignDates(startDate: Date, endDate: Date): void {
    const now = new Date();
    
    if (startDate < now) {
      throw new ValidationError('Campaign start date cannot be in the past');
    }

    this.validateDateRange(startDate, endDate);
  }

  validateBudget(budget: number): void {
    if (budget < 0) {
      throw new ValidationError('Budget cannot be negative');
    }

    if (budget > 1000000000) {
      throw new ValidationError('Budget exceeds maximum allowed value');
    }
  }

  sanitizeInput(input: string): string {
    // Remove any potential XSS attempts
    return input
      .replace(/[<>]/g, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  validateSearchQuery(query: string): void {
    if (!query || query.trim().length < 1) {
      throw new ValidationError('Search query cannot be empty');
    }

    if (query.length > 200) {
      throw new ValidationError('Search query is too long');
    }

    // Check for SQL injection patterns
    const sqlPatterns = /(\b(union|select|insert|update|delete|drop|create)\b)|(-{2})|\/\*|\*\//i;
    if (sqlPatterns.test(query)) {
      throw new ValidationError('Invalid search query');
    }
  }
}

export const validationService = ValidationService.getInstance();
