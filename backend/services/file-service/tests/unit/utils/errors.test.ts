describe('utils/errors', () => {
  let FileServiceError: any;
  let ValidationError: any;
  let NotFoundError: any;
  let UnauthorizedError: any;

  beforeEach(() => {
    jest.resetModules();
    const errors = require('../../../src/utils/errors');
    FileServiceError = errors.FileServiceError;
    ValidationError = errors.ValidationError;
    NotFoundError = errors.NotFoundError;
    UnauthorizedError = errors.UnauthorizedError;
  });

  describe('FileServiceError', () => {
    it('should create error with message and default status code 500', () => {
      const error = new FileServiceError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FileServiceError);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('FileServiceError');
    });

    it('should create error with custom status code', () => {
      const error = new FileServiceError('Custom error', 418);

      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(418);
    });

    it('should have stack trace', () => {
      const error = new FileServiceError('Stack test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Stack test');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new FileServiceError('Throw test', 503);
      }).toThrow(FileServiceError);

      try {
        throw new FileServiceError('Catch test', 502);
      } catch (error) {
        expect(error).toBeInstanceOf(FileServiceError);
        expect((error as any).statusCode).toBe(502);
      }
    });

    it('should preserve error message in stack', () => {
      const error = new FileServiceError('Error message');
      
      expect(error.stack).toContain('Error message');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with status code 400', () => {
      const error = new ValidationError('Invalid input');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FileServiceError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid input');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
    });

    it('should inherit from FileServiceError', () => {
      const error = new ValidationError('Test');

      expect(error).toBeInstanceOf(FileServiceError);
    });

    it('should be distinguishable from FileServiceError', () => {
      const validationError = new ValidationError('Validation failed');
      const fileError = new FileServiceError('File error', 400);

      expect(validationError).toBeInstanceOf(ValidationError);
      expect(fileError).not.toBeInstanceOf(ValidationError);
      expect(validationError.name).toBe('ValidationError');
      expect(fileError.name).toBe('FileServiceError');
    });

    it('should always have status code 400', () => {
      const error = new ValidationError('Test');
      
      expect(error.statusCode).toBe(400);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with status code 404', () => {
      const error = new NotFoundError('Resource not found');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FileServiceError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NotFoundError');
    });

    it('should use default message when not provided', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
    });

    it('should allow custom message', () => {
      const error = new NotFoundError('File not found');

      expect(error.message).toBe('File not found');
    });

    it('should inherit from FileServiceError', () => {
      const error = new NotFoundError();

      expect(error).toBeInstanceOf(FileServiceError);
    });

    it('should always have status code 404', () => {
      const error = new NotFoundError('Custom message');
      
      expect(error.statusCode).toBe(404);
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with status code 401', () => {
      const error = new UnauthorizedError('Access denied');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FileServiceError);
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should use default message when not provided', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
    });

    it('should allow custom message', () => {
      const error = new UnauthorizedError('Invalid credentials');

      expect(error.message).toBe('Invalid credentials');
    });

    it('should inherit from FileServiceError', () => {
      const error = new UnauthorizedError();

      expect(error).toBeInstanceOf(FileServiceError);
    });

    it('should always have status code 401', () => {
      const error = new UnauthorizedError('Token expired');
      
      expect(error.statusCode).toBe(401);
    });
  });

  describe('Error hierarchy', () => {
    it('should maintain proper inheritance chain', () => {
      const validation = new ValidationError('Test');
      const notFound = new NotFoundError('Test');
      const unauthorized = new UnauthorizedError('Test');
      const fileService = new FileServiceError('Test');

      // All should be instances of Error
      expect(validation).toBeInstanceOf(Error);
      expect(notFound).toBeInstanceOf(Error);
      expect(unauthorized).toBeInstanceOf(Error);
      expect(fileService).toBeInstanceOf(Error);

      // All should be instances of FileServiceError
      expect(validation).toBeInstanceOf(FileServiceError);
      expect(notFound).toBeInstanceOf(FileServiceError);
      expect(unauthorized).toBeInstanceOf(FileServiceError);
      expect(fileService).toBeInstanceOf(FileServiceError);

      // But specific errors should not be instances of each other
      expect(validation).not.toBeInstanceOf(NotFoundError);
      expect(validation).not.toBeInstanceOf(UnauthorizedError);
      expect(notFound).not.toBeInstanceOf(ValidationError);
      expect(notFound).not.toBeInstanceOf(UnauthorizedError);
      expect(unauthorized).not.toBeInstanceOf(ValidationError);
      expect(unauthorized).not.toBeInstanceOf(NotFoundError);
    });

    it('should allow catching by base type', () => {
      try {
        throw new ValidationError('Test');
      } catch (error) {
        expect(error).toBeInstanceOf(FileServiceError);
        expect((error as any).statusCode).toBe(400);
      }

      try {
        throw new NotFoundError('Test');
      } catch (error) {
        expect(error).toBeInstanceOf(FileServiceError);
        expect((error as any).statusCode).toBe(404);
      }

      try {
        throw new UnauthorizedError('Test');
      } catch (error) {
        expect(error).toBeInstanceOf(FileServiceError);
        expect((error as any).statusCode).toBe(401);
      }
    });

    it('should allow type-specific catching', () => {
      const errors = [
        new ValidationError('Validation'),
        new NotFoundError('Not found'),
        new UnauthorizedError('Unauthorized'),
      ];

      for (const error of errors) {
        if (error instanceof ValidationError) {
          expect(error.statusCode).toBe(400);
        } else if (error instanceof NotFoundError) {
          expect(error.statusCode).toBe(404);
        } else if (error instanceof UnauthorizedError) {
          expect(error.statusCode).toBe(401);
        }
      }
    });
  });

  describe('Status codes', () => {
    it('should have correct HTTP status codes', () => {
      const errors = {
        validation: new ValidationError('Test'),
        notFound: new NotFoundError('Test'),
        unauthorized: new UnauthorizedError('Test'),
        fileService: new FileServiceError('Test'),
        custom: new FileServiceError('Test', 503),
      };

      expect(errors.validation.statusCode).toBe(400); // Bad Request
      expect(errors.notFound.statusCode).toBe(404); // Not Found
      expect(errors.unauthorized.statusCode).toBe(401); // Unauthorized
      expect(errors.fileService.statusCode).toBe(500); // Internal Server Error
      expect(errors.custom.statusCode).toBe(503); // Service Unavailable
    });
  });

  describe('Error names', () => {
    it('should have distinct names for debugging', () => {
      const errors = {
        validation: new ValidationError('Test'),
        notFound: new NotFoundError('Test'),
        unauthorized: new UnauthorizedError('Test'),
        fileService: new FileServiceError('Test'),
      };

      expect(errors.validation.name).toBe('ValidationError');
      expect(errors.notFound.name).toBe('NotFoundError');
      expect(errors.unauthorized.name).toBe('UnauthorizedError');
      expect(errors.fileService.name).toBe('FileServiceError');

      // Names should be different
      const names = new Set([
        errors.validation.name,
        errors.notFound.name,
        errors.unauthorized.name,
        errors.fileService.name,
      ]);
      expect(names.size).toBe(4);
    });
  });
});
