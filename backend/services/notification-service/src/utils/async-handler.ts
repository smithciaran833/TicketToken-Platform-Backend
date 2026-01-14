import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Async handler wrapper for Fastify route handlers
 * Catches async errors and passes them to Fastify's error handler
 */
export const asyncHandler = <T>(
  fn: (req: FastifyRequest, reply: FastifyReply) => Promise<T>
) => {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<T | void> => {
    try {
      return await fn(req, reply);
    } catch (error) {
      // Let Fastify's built-in error handler deal with the error
      throw error;
    }
  };
};

/**
 * Generic async wrapper for any async function
 * Useful for wrapping service methods that need error handling
 */
export const withErrorHandling = <TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  errorHandler?: (error: Error) => void
) => {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (errorHandler && error instanceof Error) {
        errorHandler(error);
      }
      throw error;
    }
  };
};
