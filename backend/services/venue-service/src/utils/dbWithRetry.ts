import { Knex } from 'knex';
import { withRetry } from './retry';
import { logger } from './logger';

// Add retry logic to specific database operations
export function retryableQuery<T>(
  queryFn: () => Promise<T>,
  operation: string = 'query'
): Promise<T> {
  return withRetry(
    queryFn,
    {
      maxAttempts: 3,
      initialDelay: 50,
      maxDelay: 1000,
      shouldRetry: isRetryableDbError,
      onRetry: (error, attempt) => {
        logger.debug({ 
          operation,
          error: error.message, 
          attempt 
        }, 'Retrying database operation');
      }
    }
  );
}

export function isRetryableDbError(error: any): boolean {
  // Retry on connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return true;
  }
  
  // Retry on deadlock errors (PostgreSQL)
  if (error.code === '40P01') {
    return true;
  }
  
  // Retry on serialization failures
  if (error.code === '40001') {
    return true;
  }
  
  // Don't retry on constraint violations or other logical errors
  if (error.code === '23505' || error.code === '23503') {
    return false;
  }
  
  return false;
}

// Decorator for database methods
export function RetryableDb(operation: string = 'database') {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      return retryableQuery(
        () => originalMethod.apply(this, args),
        `${operation}.${propertyKey}`
      );
    };
    
    return descriptor;
  };
}
