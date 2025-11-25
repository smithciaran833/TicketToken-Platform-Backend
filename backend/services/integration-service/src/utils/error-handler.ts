/**
 * Error Handler Utility
 * 
 * Categorizes and handles errors from third-party integrations
 */

export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  VALIDATION = 'validation',
  NETWORK = 'network',
  PROVIDER_ERROR = 'provider_error',
  DATA_ERROR = 'data_error',
  CONFIGURATION = 'configuration',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface CategorizedError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  originalError: Error;
  retryable: boolean;
  retryAfter?: number;
  provider?: string;
  operation?: string;
  timestamp: Date;
}

export class ErrorHandler {
  /**
   * Categorize an error
   */
  static categorize(
    error: Error,
    provider?: string,
    operation?: string
  ): CategorizedError {
    const errorMessage = error.message.toLowerCase();

    // Determine category based on error message
    let category = ErrorCategory.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;
    let retryable = false;
    let retryAfter: number | undefined;

    // Authentication errors
    if (
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('invalid token') ||
      errorMessage.includes('expired token') ||
      errorMessage.includes('invalid credentials')
    ) {
      category = ErrorCategory.AUTHENTICATION;
      severity = ErrorSeverity.HIGH;
      retryable = false;
    }
    // Authorization errors
    else if (
      errorMessage.includes('forbidden') ||
      errorMessage.includes('access denied') ||
      errorMessage.includes('permission')
    ) {
      category = ErrorCategory.AUTHORIZATION;
      severity = ErrorSeverity.HIGH;
      retryable = false;
    }
    // Rate limit errors
    else if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('429')
    ) {
      category = ErrorCategory.RATE_LIMIT;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
      retryAfter = this.extractRetryAfter(errorMessage);
    }
    // Validation errors
    else if (
      errorMessage.includes('validation') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing required') ||
      errorMessage.includes('bad request') ||
      errorMessage.includes('400')
    ) {
      category = ErrorCategory.VALIDATION;
      severity = ErrorSeverity.LOW;
      retryable = false;
    }
    // Network errors
    else if (
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('socket') ||
      errorMessage.includes('dns')
    ) {
      category = ErrorCategory.NETWORK;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
      retryAfter = 30; // 30 seconds
    }
    // Provider errors
    else if (
      errorMessage.includes('500') ||
      errorMessage.includes('503') ||
      errorMessage.includes('internal server error') ||
      errorMessage.includes('service unavailable')
    ) {
      category = ErrorCategory.PROVIDER_ERROR;
      severity = ErrorSeverity.HIGH;
      retryable = true;
      retryAfter = 60; // 1 minute
    }
    // Data errors
    else if (
      errorMessage.includes('data') ||
      errorMessage.includes('parsing') ||
      errorMessage.includes('json')
    ) {
      category = ErrorCategory.DATA_ERROR;
      severity = ErrorSeverity.MEDIUM;
      retryable = false;
    }
    // Configuration errors
    else if (
      errorMessage.includes('configuration') ||
      errorMessage.includes('not configured') ||
      errorMessage.includes('missing')
    ) {
      category = ErrorCategory.CONFIGURATION;
      severity = ErrorSeverity.CRITICAL;
      retryable = false;
    }

    return {
      category,
      severity,
      message: error.message,
      originalError: error,
      retryable,
      retryAfter,
      provider,
      operation,
      timestamp: new Date(),
    };
  }

  /**
   * Handle error with appropriate action
   */
  static async handle(
    error: Error,
    provider?: string,
    operation?: string
  ): Promise<CategorizedError> {
    const categorized = this.categorize(error, provider, operation);

    // Log error with category
    console.error(
      `[${categorized.severity.toUpperCase()}] ${categorized.category}: ${categorized.message}`,
      {
        provider,
        operation,
        retryable: categorized.retryable,
        timestamp: categorized.timestamp,
      }
    );

    // Send alerts for high severity errors
    if (
      categorized.severity === ErrorSeverity.HIGH ||
      categorized.severity === ErrorSeverity.CRITICAL
    ) {
      await this.sendAlert(categorized);
    }

    return categorized;
  }

  /**
   * Send alert for critical errors
   */
  private static async sendAlert(error: CategorizedError): Promise<void> {
    // Implement alert logic (e.g., send to monitoring service, PagerDuty, etc.)
    console.warn('ALERT:', {
      category: error.category,
      severity: error.severity,
      message: error.message,
      provider: error.provider,
      operation: error.operation,
    });

    // TODO: Integrate with alerting service
    // Example: await alertingService.send({ ... });
  }

  /**
   * Extract retry-after value from error message
   */
  private static extractRetryAfter(message: string): number | undefined {
    const match = message.match(/retry after (\d+)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    
    // Default retry-after for rate limits
    return 60;
  }

  /**
   * Create user-friendly error message
   */
  static getUserMessage(error: CategorizedError): string {
    switch (error.category) {
      case ErrorCategory.AUTHENTICATION:
        return 'Authentication failed. Please check your credentials and try again.';
      
      case ErrorCategory.AUTHORIZATION:
        return 'You do not have permission to perform this operation.';
      
      case ErrorCategory.RATE_LIMIT:
        return `Rate limit exceeded. Please try again in ${error.retryAfter || 60} seconds.`;
      
      case ErrorCategory.VALIDATION:
        return 'Invalid data provided. Please check your input and try again.';
      
      case ErrorCategory.NETWORK:
        return 'Network error occurred. Please check your connection and try again.';
      
      case ErrorCategory.PROVIDER_ERROR:
        return 'The service is temporarily unavailable. Please try again later.';
      
      case ErrorCategory.DATA_ERROR:
        return 'Error processing data. Please contact support if the issue persists.';
      
      case ErrorCategory.CONFIGURATION:
        return 'System configuration error. Please contact support.';
      
      default:
        return 'An unexpected error occurred. Please try again or contact support.';
    }
  }

  /**
   * Determine if operation should be retried
   */
  static shouldRetry(error: CategorizedError, attemptNumber: number): boolean {
    if (!error.retryable) {
      return false;
    }

    // Maximum retry attempts based on severity
    const maxRetries = error.severity === ErrorSeverity.CRITICAL ? 0 : 3;
    
    return attemptNumber < maxRetries;
  }

  /**
   * Calculate backoff delay for retry
   */
  static getRetryDelay(
    error: CategorizedError,
    attemptNumber: number
  ): number {
    if (error.retryAfter) {
      return error.retryAfter * 1000; // Convert to milliseconds
    }

    // Exponential backoff: 2^attempt * 1000ms
    return Math.min(Math.pow(2, attemptNumber) * 1000, 60000); // Max 60 seconds
  }

  /**
   * Execute with retry logic
   */
  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    provider?: string,
    operation?: string,
    maxAttempts: number = 3
  ): Promise<T> {
    let lastError: CategorizedError | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = await this.handle(error as Error, provider, operation);

        if (!this.shouldRetry(lastError, attempt + 1)) {
          throw lastError.originalError;
        }

        const delay = this.getRetryDelay(lastError, attempt);
        console.log(
          `Retrying operation after ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`
        );
        
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!.originalError;
  }
}
