import { generateUploadUrlSchema, validateFileSizeForType } from '../../../src/validators/upload.validator';

describe('Upload Validator', () => {
  describe('generateUploadUrlSchema', () => {
    it('should validate correct upload request', () => {
      const validRequest = {
        fileName: 'document.pdf',
        contentType: 'application/pdf',
        fileSize: 1024 * 1024 // 1MB
      };

      const { error } = generateUploadUrlSchema.validate(validRequest);
      expect(error).toBeUndefined();
    });

    it('should reject missing fileName', () => {
      const invalidRequest = {
        contentType: 'application/pdf',
        fileSize: 1024
      };

      const { error } = generateUploadUrlSchema.validate(invalidRequest);
      expect(error).toBeDefined();
      expect(error?.message).toContain('fileName');
    });

    it('should reject invalid content type', () => {
      const invalidRequest = {
        fileName: 'file.xyz',
        contentType: 'application/x-executable',
        fileSize: 1024
      };

      const { error } = generateUploadUrlSchema.validate(invalidRequest);
      expect(error).toBeDefined();
    });

    it('should reject too large file', () => {
      const invalidRequest = {
        fileName: 'huge.zip',
        contentType: 'application/pdf',
        fileSize: 1024 * 1024 * 1024 // 1GB
      };

      const { error } = generateUploadUrlSchema.validate(invalidRequest);
      expect(error).toBeDefined();
      expect(error?.message).toContain('fileSize');
    });

    it('should accept optional metadata', () => {
      const validRequest = {
        fileName: 'document.pdf',
        contentType: 'application/pdf',
        fileSize: 1024,
        metadata: {
          description: 'Important document'
        }
      };

      const { error } = generateUploadUrlSchema.validate(validRequest);
      expect(error).toBeUndefined();
    });

    it('should accept entityType and entityId', () => {
      const validRequest = {
        fileName: 'file.txt',
        contentType: 'application/pdf',
        fileSize: 1024,
        entityType: 'venue',
        entityId: '123e4567-e89b-12d3-a456-426614174000'
      };

      const { error } = generateUploadUrlSchema.validate(validRequest);
      expect(error).toBeUndefined();
    });
  });

  describe('validateFileSizeForType', () => {
    it('should enforce image size limits', () => {
      const result = validateFileSizeForType(50 * 1024 * 1024, 'image/jpeg');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');
    });

    it('should allow video within limits', () => {
      const result = validateFileSizeForType(100 * 1024 * 1024, 'video/mp4');
      expect(result.valid).toBe(true);
    });

    it('should allow document within limits', () => {
      const result = validateFileSizeForType(10 * 1024 * 1024, 'application/pdf');
      expect(result.valid).toBe(true);
    });
  });

  describe('schema content type validation', () => {
    it('should accept common image types', () => {
      const imageTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
      ];

      imageTypes.forEach(contentType => {
        const request = {
          fileName: `image.jpg`,
          contentType,
          fileSize: 1024
        };

        const { error } = generateUploadUrlSchema.validate(request);
        expect(error).toBeUndefined();
      });
    });

    it('should accept common document types', () => {
      const docTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];

      docTypes.forEach(contentType => {
        const request = {
          fileName: 'document.pdf',
          contentType,
          fileSize: 1024
        };

        const { error } = generateUploadUrlSchema.validate(request);
        expect(error).toBeUndefined();
      });
    });

    it('should reject dangerous content types', () => {
      const dangerousTypes = [
        'application/x-msdownload',
        'application/x-executable'
      ];

      dangerousTypes.forEach(contentType => {
        const request = {
          fileName: 'file.exe',
          contentType,
          fileSize: 1024
        };

        const { error } = generateUploadUrlSchema.validate(request);
        expect(error).toBeDefined();
      });
    });
  });
});
