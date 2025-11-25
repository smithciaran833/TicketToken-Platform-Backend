import { ErrorResponseBuilder, ErrorCodes } from '../../../src/utils/error-response';

describe('Error Response Utils', () => {
  let mockReply: any;
  let mockRequest: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = { id: 'req-123' };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      request: mockRequest,
    };
  });

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

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Server error',
          code: 'INTERNAL_ERROR',
        })
      );
    });
  });

  describe('ErrorResponseBuilder helper methods', () => {
    it('should send validation error', () => {
      ErrorResponseBuilder.validation(mockReply, [{ field: 'email' }]);

      expect(mockReply.status).toHaveBeenCalledWith(422);
    });

    it('should send unauthorized error', () => {
      ErrorResponseBuilder.unauthorized(mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should send forbidden error', () => {
      ErrorResponseBuilder.forbidden(mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should send not found error', () => {
      ErrorResponseBuilder.notFound(mockReply, 'Event');

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Event not found',
        })
      );
    });

    it('should send conflict error', () => {
      ErrorResponseBuilder.conflict(mockReply, 'Resource exists');

      expect(mockReply.status).toHaveBeenCalledWith(409);
    });

    it('should send rate limit error', () => {
      ErrorResponseBuilder.tooManyRequests(mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(429);
    });

    it('should send internal error', () => {
      ErrorResponseBuilder.internal(mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('ErrorCodes', () => {
    it('should have all error code constants', () => {
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED');
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND');
    });
  });
});
