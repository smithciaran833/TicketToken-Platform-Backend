// Mock dependencies BEFORE imports
jest.mock('../../../src/services/cache-integration');
jest.mock('../../../src/services/storage.s3');
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');

import { FastifyRequest, FastifyReply } from 'fastify';
import { UploadController } from '../../../src/controllers/upload.controller';
import { s3Storage } from '../../../src/services/storage.s3';
import { db } from '../../../src/config/database';

describe('controllers/upload.controller', () => {
  let controller: UploadController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockS3Storage: jest.Mocked<typeof s3Storage>;
  let mockDb: jest.Mocked<typeof db>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new UploadController();

    mockRequest = {
      body: {},
      params: {},
      user: { id: 'user-123' },
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    mockS3Storage = s3Storage as jest.Mocked<typeof s3Storage>;
    mockDb = db as any;

    // Mock Knex query builder chain
    const mockQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockReturnThis(),
    };
    (mockDb as any).mockReturnValue(mockQueryBuilder);
    mockDb.fn = { now: jest.fn() } as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateUploadUrl', () => {
    it('should generate signed upload URL for valid file', async () => {
      mockRequest.body = {
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
      };

      const mockSignedUrl = {
        uploadUrl: 'https://s3.amazonaws.com/bucket/signed-url',
        fileKey: 'uploads/user-123/test-123.jpg',
        expiresAt: new Date(Date.now() + 300000),
      };

      mockS3Storage.generateSignedUploadUrl = jest.fn().mockResolvedValue(mockSignedUrl);

      const mockInsert = jest.fn().mockResolvedValue([{ id: 'upload-1' }]);
      (mockDb as any).mockReturnValue({ insert: mockInsert });

      await controller.generateUploadUrl(mockRequest as any, mockReply as FastifyReply);

      expect(mockS3Storage.generateSignedUploadUrl).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          contentType: 'image/jpeg',
          maxSize: 10 * 1024 * 1024,
          expiresIn: 300,
        })
      );
      expect(mockInsert).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        uploadUrl: mockSignedUrl.uploadUrl,
        fileKey: mockSignedUrl.fileKey,
        expiresAt: mockSignedUrl.expiresAt,
      });
    });

    it('should accept PDF file type', async () => {
      mockRequest.body = {
        fileName: 'document.pdf',
        contentType: 'application/pdf',
      };

      const mockSignedUrl = {
        uploadUrl: 'https://s3.amazonaws.com/signed',
        fileKey: 'uploads/user-123/doc.pdf',
        expiresAt: new Date(),
      };

      mockS3Storage.generateSignedUploadUrl = jest.fn().mockResolvedValue(mockSignedUrl);

      const mockInsert = jest.fn().mockResolvedValue([{ id: 'upload-1' }]);
      (mockDb as any).mockReturnValue({ insert: mockInsert });

      await controller.generateUploadUrl(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalled();
      expect(mockReply.status).not.toHaveBeenCalledWith(400);
    });

    it('should reject invalid file type', async () => {
      mockRequest.body = {
        fileName: 'malware.exe',
        contentType: 'application/x-msdownload',
      };

      await controller.generateUploadUrl(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid file type',
      });
    });

    it('should handle anonymous user', async () => {
      mockRequest.body = {
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
      };
      mockRequest.user = undefined;

      const mockSignedUrl = {
        uploadUrl: 'https://s3.amazonaws.com/signed',
        fileKey: 'uploads/anonymous/test.jpg',
        expiresAt: new Date(),
      };

      mockS3Storage.generateSignedUploadUrl = jest.fn().mockResolvedValue(mockSignedUrl);

      const mockInsert = jest.fn().mockResolvedValue([{ id: 'upload-1' }]);
      (mockDb as any).mockReturnValue({ insert: mockInsert });

      await controller.generateUploadUrl(mockRequest as any, mockReply as FastifyReply);

      expect(mockS3Storage.generateSignedUploadUrl).toHaveBeenCalledWith('anonymous', expect.any(Object));
    });

    it('should return 500 on S3 error', async () => {
      mockRequest.body = {
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
      };

      mockS3Storage.generateSignedUploadUrl = jest.fn().mockRejectedValue(new Error('S3 error'));

      await controller.generateUploadUrl(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to generate upload URL',
      });
    });

    it('should handle database insert error', async () => {
      mockRequest.body = {
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
      };

      const mockSignedUrl = {
        uploadUrl: 'https://s3.amazonaws.com/signed',
        fileKey: 'uploads/user-123/test.jpg',
        expiresAt: new Date(),
      };

      mockS3Storage.generateSignedUploadUrl = jest.fn().mockResolvedValue(mockSignedUrl);

      const mockInsert = jest.fn().mockRejectedValue(new Error('DB error'));
      (mockDb as any).mockReturnValue({ insert: mockInsert });

      await controller.generateUploadUrl(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('confirmUpload', () => {
    it('should confirm file upload successfully', async () => {
      mockRequest.params = { fileKey: 'uploads/user-123/test.jpg' };

      const mockUpload = {
        id: 'upload-123',
        file_key: 'uploads/user-123/test.jpg',
        status: 'pending',
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUpload),
        update: jest.fn().mockResolvedValue(1),
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      await controller.confirmUpload(mockRequest as any, mockReply as FastifyReply);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({
        file_key: 'uploads/user-123/test.jpg',
        user_id: 'user-123',
        status: 'pending',
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Upload confirmed',
        fileId: 'upload-123',
      });
    });

    it('should return 404 when upload not found', async () => {
      mockRequest.params = { fileKey: 'nonexistent' };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      await controller.confirmUpload(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Upload not found' });
    });

    it('should handle processing error gracefully', async () => {
      mockRequest.params = { fileKey: 'uploads/user-123/test.jpg' };

      const mockUpload = {
        id: 'upload-123',
        file_key: 'uploads/user-123/test.jpg',
        status: 'pending',
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUpload),
        update: jest.fn().mockResolvedValue(1),
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      await controller.confirmUpload(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Upload confirmed',
        })
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      mockRequest.params = { fileId: 'upload-123' };

      const mockUpload = {
        id: 'upload-123',
        file_key: 'uploads/user-123/test.jpg',
        user_id: 'user-123',
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUpload),
        update: jest.fn().mockResolvedValue(1),
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      mockS3Storage.deleteFile = jest.fn().mockResolvedValue(undefined);

      await controller.deleteFile(mockRequest as any, mockReply as FastifyReply);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith({
        id: 'upload-123',
        user_id: 'user-123',
      });
      expect(mockS3Storage.deleteFile).toHaveBeenCalledWith('uploads/user-123/test.jpg');
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'File deleted successfully',
      });
    });

    it('should return 404 when file not found', async () => {
      mockRequest.params = { fileId: 'nonexistent' };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      await controller.deleteFile(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should return 500 on S3 deletion error', async () => {
      mockRequest.params = { fileId: 'upload-123' };

      const mockUpload = {
        id: 'upload-123',
        file_key: 'uploads/user-123/test.jpg',
        user_id: 'user-123',
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUpload),
        update: jest.fn(),
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      mockS3Storage.deleteFile = jest.fn().mockRejectedValue(new Error('S3 deletion failed'));

      await controller.deleteFile(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to delete file',
      });
    });

    it('should handle database update error', async () => {
      mockRequest.params = { fileId: 'upload-123' };

      const mockUpload = {
        id: 'upload-123',
        file_key: 'uploads/user-123/test.jpg',
        user_id: 'user-123',
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockUpload),
        update: jest.fn().mockRejectedValue(new Error('DB error')),
      };
      (mockDb as any).mockReturnValue(mockQueryBuilder);

      mockS3Storage.deleteFile = jest.fn().mockResolvedValue(undefined);

      await controller.deleteFile(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('edge cases', () => {
    it('should handle image/png file type', async () => {
      mockRequest.body = {
        fileName: 'image.png',
        contentType: 'image/png',
      };

      const mockSignedUrl = {
        uploadUrl: 'https://s3.amazonaws.com/signed',
        fileKey: 'uploads/user-123/image.png',
        expiresAt: new Date(),
      };

      mockS3Storage.generateSignedUploadUrl = jest.fn().mockResolvedValue(mockSignedUrl);

      const mockInsert = jest.fn().mockResolvedValue([{ id: 'upload-1' }]);
      (mockDb as any).mockReturnValue({ insert: mockInsert });

      await controller.generateUploadUrl(mockRequest as any, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalled();
      expect(mockReply.status).not.toHaveBeenCalledWith(400);
    });

    it('should handle image/gif and image/webp', async () => {
      const contentTypes = ['image/gif', 'image/webp'];

      for (const contentType of contentTypes) {
        jest.clearAllMocks();

        mockRequest.body = {
          fileName: 'image.' + contentType.split('/')[1],
          contentType,
        };

        const mockSignedUrl = {
          uploadUrl: 'https://s3.amazonaws.com/signed',
          fileKey: 'uploads/user-123/image.gif',
          expiresAt: new Date(),
        };

        mockS3Storage.generateSignedUploadUrl = jest.fn().mockResolvedValue(mockSignedUrl);

        const mockInsert = jest.fn().mockResolvedValue([{ id: 'upload-1' }]);
        (mockDb as any).mockReturnValue({ insert: mockInsert });

        await controller.generateUploadUrl(mockRequest as any, mockReply as FastifyReply);

        expect(mockReply.send).toHaveBeenCalled();
        expect(mockReply.status).not.toHaveBeenCalledWith(400);
      }
    });
  });
});
