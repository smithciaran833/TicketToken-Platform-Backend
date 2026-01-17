import { asyncHandler, withErrorHandling } from '../../../src/utils/async-handler';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('asyncHandler', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockRequest = {};
    mockReply = {};
  });

  it('should execute async function successfully', async () => {
    const handler = jest.fn().mockResolvedValue('success');
    const wrappedHandler = asyncHandler(handler);

    const result = await wrappedHandler(
      mockRequest as FastifyRequest,
      mockReply as FastifyReply
    );

    expect(result).toBe('success');
    expect(handler).toHaveBeenCalledWith(mockRequest, mockReply);
  });

  it('should pass through errors', async () => {
    const error = new Error('Test error');
    const handler = jest.fn().mockRejectedValue(error);
    const wrappedHandler = asyncHandler(handler);

    await expect(
      wrappedHandler(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).rejects.toThrow('Test error');
  });

  it('should handle synchronous errors', async () => {
    const error = new Error('Sync error');
    const handler = jest.fn().mockImplementation(() => {
      throw error;
    });
    const wrappedHandler = asyncHandler(handler);

    await expect(
      wrappedHandler(mockRequest as FastifyRequest, mockReply as FastifyReply)
    ).rejects.toThrow('Sync error');
  });

  it('should preserve handler context', async () => {
    let capturedReq: any;
    let capturedReply: any;

    const handler = async (req: FastifyRequest, reply: FastifyReply) => {
      capturedReq = req;
      capturedReply = reply;
      return 'ok';
    };

    const wrappedHandler = asyncHandler(handler);
    await wrappedHandler(mockRequest as FastifyRequest, mockReply as FastifyReply);

    expect(capturedReq).toBe(mockRequest);
    expect(capturedReply).toBe(mockReply);
  });
});

describe('withErrorHandling', () => {
  it('should execute function successfully', async () => {
    const fn = jest.fn().mockResolvedValue('result');
    const wrapped = withErrorHandling(fn);

    const result = await wrapped('arg1', 'arg2');

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should call error handler on error', async () => {
    const error = new Error('Test error');
    const fn = jest.fn().mockRejectedValue(error);
    const errorHandler = jest.fn();
    const wrapped = withErrorHandling(fn, errorHandler);

    await expect(wrapped()).rejects.toThrow('Test error');
    expect(errorHandler).toHaveBeenCalledWith(error);
  });

  it('should not call error handler if not provided', async () => {
    const error = new Error('Test error');
    const fn = jest.fn().mockRejectedValue(error);
    const wrapped = withErrorHandling(fn);

    await expect(wrapped()).rejects.toThrow('Test error');
  });

  it('should handle non-Error objects', async () => {
    const fn = jest.fn().mockRejectedValue('string error');
    const errorHandler = jest.fn();
    const wrapped = withErrorHandling(fn, errorHandler);

    await expect(wrapped()).rejects.toBe('string error');
    expect(errorHandler).not.toHaveBeenCalled();
  });

  it('should preserve function arguments', async () => {
    const fn = jest.fn().mockImplementation(async (a: number, b: string, c: boolean) => {
      return `${a}-${b}-${c}`;
    });
    const wrapped = withErrorHandling(fn);

    const result = await wrapped(42, 'test', true);

    expect(result).toBe('42-test-true');
    expect(fn).toHaveBeenCalledWith(42, 'test', true);
  });

  it('should work with no-argument functions', async () => {
    const fn = jest.fn().mockResolvedValue('no-args');
    const wrapped = withErrorHandling(fn);

    const result = await wrapped();

    expect(result).toBe('no-args');
  });

  it('should re-throw error after handling', async () => {
    const error = new Error('Handled error');
    const fn = jest.fn().mockRejectedValue(error);
    const errorHandler = jest.fn();
    const wrapped = withErrorHandling(fn, errorHandler);

    await expect(wrapped()).rejects.toThrow('Handled error');
    expect(errorHandler).toHaveBeenCalledWith(error);
  });
});
