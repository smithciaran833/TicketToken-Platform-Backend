describe('config/constants', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    
    // Clear module cache to allow re-import with new env vars
    jest.resetModules();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe('FILE_CONSTANTS', () => {
    describe('Size limits', () => {
      it('should calculate MAX_FILE_SIZE from environment variable', () => {
        process.env.MAX_FILE_SIZE_MB = '100';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
      });

      it('should calculate MAX_IMAGE_SIZE from environment variable', () => {
        process.env.MAX_IMAGE_SIZE_MB = '10';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.MAX_IMAGE_SIZE).toBe(10 * 1024 * 1024);
      });

      it('should calculate MAX_VIDEO_SIZE from environment variable', () => {
        process.env.MAX_VIDEO_SIZE_MB = '500';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.MAX_VIDEO_SIZE).toBe(500 * 1024 * 1024);
      });

      it('should calculate MAX_DOCUMENT_SIZE from environment variable', () => {
        process.env.MAX_DOCUMENT_SIZE_MB = '50';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.MAX_DOCUMENT_SIZE).toBe(50 * 1024 * 1024);
      });

      it('should calculate CHUNK_SIZE from environment variable', () => {
        process.env.CHUNK_SIZE_MB = '5';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.CHUNK_SIZE).toBe(5 * 1024 * 1024);
      });

      it('should handle NaN when env var is not a number', () => {
        process.env.MAX_FILE_SIZE_MB = 'invalid';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.MAX_FILE_SIZE).toBeNaN();
      });

      it('should handle undefined env vars', () => {
        delete process.env.MAX_FILE_SIZE_MB;
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.MAX_FILE_SIZE).toBeNaN();
      });
    });

    describe('THUMBNAIL_SIZES', () => {
      it('should have correct small thumbnail size', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.THUMBNAIL_SIZES.small).toEqual({
          width: 150,
          height: 150
        });
      });

      it('should have correct medium thumbnail size', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.THUMBNAIL_SIZES.medium).toEqual({
          width: 300,
          height: 300
        });
      });

      it('should have correct large thumbnail size', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.THUMBNAIL_SIZES.large).toEqual({
          width: 600,
          height: 600
        });
      });

      it('should have all three thumbnail sizes', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(Object.keys(FILE_CONSTANTS.THUMBNAIL_SIZES)).toEqual([
          'small',
          'medium',
          'large'
        ]);
      });
    });

    describe('Allowed MIME types', () => {
      it('should parse ALLOWED_IMAGE_TYPES from comma-separated string', () => {
        process.env.ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/gif';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ALLOWED_IMAGE_TYPES).toEqual([
          'image/jpeg',
          'image/png',
          'image/gif'
        ]);
      });

      it('should parse ALLOWED_DOCUMENT_TYPES from comma-separated string', () => {
        process.env.ALLOWED_DOCUMENT_TYPES = 'application/pdf,application/msword';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ALLOWED_DOCUMENT_TYPES).toEqual([
          'application/pdf',
          'application/msword'
        ]);
      });

      it('should parse ALLOWED_VIDEO_TYPES from comma-separated string', () => {
        process.env.ALLOWED_VIDEO_TYPES = 'video/mp4,video/quicktime';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ALLOWED_VIDEO_TYPES).toEqual([
          'video/mp4',
          'video/quicktime'
        ]);
      });

      it('should default to empty array when ALLOWED_IMAGE_TYPES not set', () => {
        delete process.env.ALLOWED_IMAGE_TYPES;
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ALLOWED_IMAGE_TYPES).toEqual([]);
      });

      it('should default to empty array when ALLOWED_DOCUMENT_TYPES not set', () => {
        delete process.env.ALLOWED_DOCUMENT_TYPES;
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ALLOWED_DOCUMENT_TYPES).toEqual([]);
      });

      it('should default to empty array when ALLOWED_VIDEO_TYPES not set', () => {
        delete process.env.ALLOWED_VIDEO_TYPES;
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ALLOWED_VIDEO_TYPES).toEqual([]);
      });

      it('should handle single MIME type without comma', () => {
        process.env.ALLOWED_IMAGE_TYPES = 'image/jpeg';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ALLOWED_IMAGE_TYPES).toEqual(['image/jpeg']);
      });

      it('should handle empty string', () => {
        process.env.ALLOWED_IMAGE_TYPES = '';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ALLOWED_IMAGE_TYPES).toEqual(['']);
      });
    });

    describe('Storage paths', () => {
      it('should use environment variable for UPLOAD_PATH', () => {
        process.env.LOCAL_STORAGE_PATH = '/custom/uploads';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.UPLOAD_PATH).toBe('/custom/uploads');
      });

      it('should use default ./uploads when LOCAL_STORAGE_PATH not set', () => {
        delete process.env.LOCAL_STORAGE_PATH;
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.UPLOAD_PATH).toBe('./uploads');
      });

      it('should use environment variable for TEMP_PATH', () => {
        process.env.TEMP_STORAGE_PATH = '/custom/temp';
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.TEMP_PATH).toBe('/custom/temp');
      });

      it('should use default ./temp when TEMP_STORAGE_PATH not set', () => {
        delete process.env.TEMP_STORAGE_PATH;
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.TEMP_PATH).toBe('./temp');
      });
    });

    describe('FILE_STATUS', () => {
      it('should have UPLOADING status', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.FILE_STATUS.UPLOADING).toBe('uploading');
      });

      it('should have PROCESSING status', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.FILE_STATUS.PROCESSING).toBe('processing');
      });

      it('should have READY status', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.FILE_STATUS.READY).toBe('ready');
      });

      it('should have FAILED status', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.FILE_STATUS.FAILED).toBe('failed');
      });

      it('should have DELETED status', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.FILE_STATUS.DELETED).toBe('deleted');
      });

      it('should have exactly 5 status values', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(Object.keys(FILE_CONSTANTS.FILE_STATUS)).toHaveLength(5);
      });
    });

    describe('ENTITY_TYPES', () => {
      it('should have VENUE entity type', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ENTITY_TYPES.VENUE).toBe('venue');
      });

      it('should have EVENT entity type', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ENTITY_TYPES.EVENT).toBe('event');
      });

      it('should have USER entity type', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ENTITY_TYPES.USER).toBe('user');
      });

      it('should have TICKET entity type', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(FILE_CONSTANTS.ENTITY_TYPES.TICKET).toBe('ticket');
      });

      it('should have exactly 4 entity types', () => {
        const { FILE_CONSTANTS } = require('../../../src/config/constants');
        
        expect(Object.keys(FILE_CONSTANTS.ENTITY_TYPES)).toHaveLength(4);
      });
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should have FILE_TOO_LARGE error message', () => {
      const { ERROR_MESSAGES } = require('../../../src/config/constants');
      
      expect(ERROR_MESSAGES.FILE_TOO_LARGE).toBe('File size exceeds maximum allowed size');
    });

    it('should have INVALID_FILE_TYPE error message', () => {
      const { ERROR_MESSAGES } = require('../../../src/config/constants');
      
      expect(ERROR_MESSAGES.INVALID_FILE_TYPE).toBe('File type is not allowed');
    });

    it('should have UPLOAD_FAILED error message', () => {
      const { ERROR_MESSAGES } = require('../../../src/config/constants');
      
      expect(ERROR_MESSAGES.UPLOAD_FAILED).toBe('Failed to upload file');
    });

    it('should have FILE_NOT_FOUND error message', () => {
      const { ERROR_MESSAGES } = require('../../../src/config/constants');
      
      expect(ERROR_MESSAGES.FILE_NOT_FOUND).toBe('File not found');
    });

    it('should have UNAUTHORIZED error message', () => {
      const { ERROR_MESSAGES } = require('../../../src/config/constants');
      
      expect(ERROR_MESSAGES.UNAUTHORIZED).toBe('Unauthorized to access this file');
    });

    it('should have PROCESSING_FAILED error message', () => {
      const { ERROR_MESSAGES } = require('../../../src/config/constants');
      
      expect(ERROR_MESSAGES.PROCESSING_FAILED).toBe('Failed to process file');
    });

    it('should have exactly 6 error messages', () => {
      const { ERROR_MESSAGES } = require('../../../src/config/constants');
      
      expect(Object.keys(ERROR_MESSAGES)).toHaveLength(6);
    });

    it('should have all error messages as non-empty strings', () => {
      const { ERROR_MESSAGES } = require('../../../src/config/constants');
      
      Object.values(ERROR_MESSAGES).forEach((message) => {
        expect(typeof message).toBe('string');
        expect((message as string).length).toBeGreaterThan(0);
      });
    });
  });
});
