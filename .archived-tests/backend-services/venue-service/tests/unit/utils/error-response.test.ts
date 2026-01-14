import { ErrorResponseBuilder, ErrorCodes } from '../../../src/utils/error-response';

describe('Error Response Utils', () => {
  let mockReply: any;
  let mockRequest: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      request: mockRequest,
    };
  });

  // =============================================================================
  // ErrorResponseBuilder.send - 2 test cases
  // =============================================================================

  describe('ErrorResponseBuilder.send', () => {
    it('should send error response with all fields', () => {
      ErrorResponseBuilder.send(mockReply, 400, 'Bad request', 'BAD_REQUEST', { field: 'name' });

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Bad request',
        code: 'BAD_REQUEST',
        details: { field: 'name' },
        requestId: 'req-123',
      });
    });

    it('should send error response without details', () => {
      ErrorResponseBuilder.send(mockReply, 500, 'Server error', 'INTERNAL_ERROR');

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Server error',
        code: 'INTERNAL_ERROR',
        requestId: 'req-123',
      });
    });
  });

  // =============================================================================
  // ErrorResponseBuilder.validation - 1 test case
  // =============================================================================

  describe('ErrorResponseBuilder.validation', () => {
    it('should send validation error', () => {
      const details = [{ field: 'email', message: 'Invalid email' }];

      ErrorResponseBuilder.validation(mockReply, details);

      expect(mockReply.status).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details,
        })
      );
    });
  });

  // =============================================================================
  // ErrorResponseBuilder.unauthorized - 1 test case
  // =============================================================================

  describe('ErrorResponseBuilder.unauthorized', () => {
    it('should send unauthorized error', () => {
      ErrorResponseBuilder.unauthorized(mockReply, 'Invalid credentials');

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Invalid credentials',
          code: 'UNAUTHORIZED',
        })
      );
    });
  });

  // =============================================================================
  // ErrorResponseBuilder.forbidden - 1 test case
  // =============================================================================

  describe('ErrorResponseBuilder.forbidden', () => {
    it('should send forbidden error', () => {
      ErrorResponseBuilder.forbidden(mockReply, 'Access denied');

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Access denied',
          code: 'FORBIDDEN',
        })
      );
    });
  });

  // =============================================================================
  // ErrorResponseBuilder.notFound - 1 test case
  // =============================================================================

  describe('ErrorResponseBuilder.notFound', () => {
    it('should send not found error', () => {
      ErrorResponseBuilder.notFound(mockReply, 'Venue');

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Venue not found',
          code: 'NOT_FOUND',
        })
      );
    });
  });

  // =============================================================================
  // ErrorResponseBuilder.conflict - 1 test case
  // =============================================================================

  describe('ErrorResponseBuilder.conflict', () => {
    it('should send conflict error', () => {
      ErrorResponseBuilder.conflict(mockReply, 'Resource already exists');

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Resource already exists',
          code: 'CONFLICT',
        })
      );
    });
  });

  // =============================================================================
  // ErrorResponseBuilder.tooManyRequests - 1 test case
  // =============================================================================

  describe('ErrorResponseBuilder.tooManyRequests', () => {
    it('should send rate limit error', () => {
      ErrorResponseBuilder.tooManyRequests(mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(429);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
        })
      );
    });
  });

  // =============================================================================
  // ErrorResponseBuilder.internal - 1 test case
  // =============================================================================

  describe('ErrorResponseBuilder.internal', () => {
    it('should send internal error', () => {
      ErrorResponseBuilder.internal(mockReply, 'Database connection failed');

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Database connection failed',
          code: 'INTERNAL_ERROR',
        })
      );
    });
  });

  // =============================================================================
  // ErrorCodes enum - 1 test case
  // =============================================================================

  describe('ErrorCodes', () => {
    it('should have all error code constants', () => {
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCodes.CONFLICT).toBe('CONFLICT');
      expect(ErrorCodes.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });
  });
});
