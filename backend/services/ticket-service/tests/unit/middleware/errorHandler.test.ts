// =============================================================================
// TEST SUITE - errorHandler.ts
// =============================================================================

import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { errorHandler } from '../../../src/middleware/errorHandler';
import { AppError, ValidationError, UnauthorizedError } from '../../../src/utils/errors';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger');

describe('errorHandler middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      url: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should handle AppError', async () => {
    const error = new AppError('Test error', 400, 'TEST_ERROR');

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(400);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Test error',
      code: 'TEST_ERROR',
    });
  });

  it('should handle ValidationError', async () => {
    const error = new ValidationError('Invalid input');

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(400);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Invalid input',
      code: 'VALIDATION_ERROR',
    });
  });

  it('should handle generic ValidationError by name', async () => {
    const error: any = new Error('Validation failed');
    error.name = 'ValidationError';

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(400);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Validation error',
      details: 'Validation failed',
    });
  });

  it('should handle UnauthorizedError by name', async () => {
    const error: any = new Error('Not authorized');
    error.name = 'UnauthorizedError';

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(401);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Unauthorized',
    });
  });

  it('should handle generic errors as 500', async () => {
    const error: any = new Error('Something went wrong');

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(500);
    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Internal server error',
    });
  });

  it('should log error details', async () => {
    const error = new AppError('Test error');

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(logger.error).toHaveBeenCalledWith('Error handled:', {
      error: 'Test error',
      stack: expect.any(String),
      url: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
    });
  });

  it('should include error details in development mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const error: any = new Error('Dev error');

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Internal server error',
      details: 'Dev error',
    });

    process.env.NODE_ENV = originalEnv;
  });

  it('should not include error details in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error: any = new Error('Prod error');

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.send).toHaveBeenCalledWith({
      error: 'Internal server error',
    });

    process.env.NODE_ENV = originalEnv;
  });

  it('should console.log error', async () => {
    const error = new AppError('Test error', 400);

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(consoleLogSpy).toHaveBeenCalledWith('❌ ERROR:', 'Test error', 400);
  });

  it('should handle errors with different status codes', async () => {
    const error = new AppError('Not found', 404);

    await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(mockReply.status).toHaveBeenCalledWith(404);
  });
});
