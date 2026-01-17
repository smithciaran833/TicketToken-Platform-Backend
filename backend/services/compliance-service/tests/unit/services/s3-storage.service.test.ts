/**
 * Unit Tests for S3 Storage Service
 */
const mockPutObject = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
const mockGetObject = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({ Body: Buffer.from('test') }) });
const mockDeleteObject = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
const mockHeadObject = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({
  ContentLength: 1024,
  LastModified: new Date(),
  ContentType: 'application/pdf',
  Metadata: { key: 'value' }
}) });
const mockCopyObject = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
const mockListObjectsV2 = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({ Contents: [] }) });
const mockPutBucketLifecycleConfiguration = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
const mockGetSignedUrlPromise = jest.fn().mockResolvedValue('https://presigned-url.example.com');

jest.mock('aws-sdk', () => ({
  S3: jest.fn().mockImplementation(() => ({
    putObject: mockPutObject,
    getObject: mockGetObject,
    deleteObject: mockDeleteObject,
    headObject: mockHeadObject,
    copyObject: mockCopyObject,
    listObjectsV2: mockListObjectsV2,
    putBucketLifecycleConfiguration: mockPutBucketLifecycleConfiguration,
    getSignedUrlPromise: mockGetSignedUrlPromise
  }))
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234')
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { S3StorageService, s3StorageService } from '../../../src/services/s3-storage.service';
import { logger } from '../../../src/utils/logger';

describe('S3StorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const service = new S3StorageService();
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('S3 Storage initialized')
      );
    });

    it('should use environment variables when set', () => {
      process.env.AWS_REGION = 'eu-west-1';
      process.env.S3_BUCKET_NAME = 'custom-bucket';

      const service = new S3StorageService();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('bucket=custom-bucket')
      );

      delete process.env.AWS_REGION;
      delete process.env.S3_BUCKET_NAME;
    });
  });

  describe('uploadFile', () => {
    it('should upload file with correct parameters', async () => {
      const buffer = Buffer.from('test content');
      
      const result = await s3StorageService.uploadFile(
        buffer,
        'test.pdf',
        'application/pdf',
        { customKey: 'customValue' }
      );

      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Body: buffer,
          ContentType: 'application/pdf',
          ServerSideEncryption: 'AES256',
          ACL: 'private',
          Metadata: { customKey: 'customValue' }
        })
      );
      expect(result.key).toContain('mock-uuid-1234-test.pdf');
      expect(result.url).toContain('s3.');
    });

    it('should generate correct S3 key with year prefix', async () => {
      const currentYear = new Date().getFullYear();
      
      const result = await s3StorageService.uploadFile(
        Buffer.from('test'),
        'document.pdf',
        'application/pdf'
      );

      expect(result.key).toContain(`documents/${currentYear}/`);
    });

    it('should handle upload errors', async () => {
      mockPutObject.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Upload failed'))
      });

      await expect(s3StorageService.uploadFile(
        Buffer.from('test'),
        'test.pdf',
        'application/pdf'
      )).rejects.toThrow('Failed to upload file to S3');

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle missing metadata', async () => {
      const result = await s3StorageService.uploadFile(
        Buffer.from('test'),
        'test.pdf',
        'application/pdf'
      );

      expect(mockPutObject).toHaveBeenCalledWith(
        expect.objectContaining({
          Metadata: {}
        })
      );
    });
  });

  describe('getPresignedDownloadUrl', () => {
    it('should generate presigned URL with default expiry', async () => {
      const url = await s3StorageService.getPresignedDownloadUrl('documents/test.pdf');

      expect(mockGetSignedUrlPromise).toHaveBeenCalledWith('getObject', expect.objectContaining({
        Key: 'documents/test.pdf',
        Expires: 3600
      }));
      expect(url).toBe('https://presigned-url.example.com');
    });

    it('should respect custom expiry time', async () => {
      await s3StorageService.getPresignedDownloadUrl('documents/test.pdf', 7200);

      expect(mockGetSignedUrlPromise).toHaveBeenCalledWith('getObject', expect.objectContaining({
        Expires: 7200
      }));
    });

    it('should handle errors', async () => {
      mockGetSignedUrlPromise.mockRejectedValueOnce(new Error('Signing failed'));

      await expect(s3StorageService.getPresignedDownloadUrl('test.pdf'))
        .rejects.toThrow('Failed to generate presigned URL');
    });
  });

  describe('getPresignedUploadUrl', () => {
    it('should generate presigned upload URL', async () => {
      const result = await s3StorageService.getPresignedUploadUrl(
        'upload.pdf',
        'application/pdf'
      );

      expect(mockGetSignedUrlPromise).toHaveBeenCalledWith('putObject', expect.objectContaining({
        ContentType: 'application/pdf',
        ServerSideEncryption: 'AES256',
        Expires: 300
      }));
      expect(result.url).toBe('https://presigned-url.example.com');
      expect(result.key).toContain('mock-uuid-1234-upload.pdf');
      expect(result.fields['Content-Type']).toBe('application/pdf');
    });

    it('should respect custom expiry', async () => {
      await s3StorageService.getPresignedUploadUrl('test.pdf', 'application/pdf', 600);

      expect(mockGetSignedUrlPromise).toHaveBeenCalledWith('putObject', expect.objectContaining({
        Expires: 600
      }));
    });

    it('should handle errors', async () => {
      mockGetSignedUrlPromise.mockRejectedValueOnce(new Error('Failed'));

      await expect(s3StorageService.getPresignedUploadUrl('test.pdf', 'application/pdf'))
        .rejects.toThrow('Failed to generate upload URL');
    });
  });

  describe('downloadFile', () => {
    it('should download file as buffer', async () => {
      const result = await s3StorageService.downloadFile('documents/test.pdf');

      expect(mockGetObject).toHaveBeenCalledWith(expect.objectContaining({
        Key: 'documents/test.pdf'
      }));
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle download errors', async () => {
      mockGetObject.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Not found'))
      });

      await expect(s3StorageService.downloadFile('missing.pdf'))
        .rejects.toThrow('Failed to download file from S3');
    });
  });

  describe('deleteFile', () => {
    it('should delete file from S3', async () => {
      await s3StorageService.deleteFile('documents/old.pdf');

      expect(mockDeleteObject).toHaveBeenCalledWith(expect.objectContaining({
        Key: 'documents/old.pdf'
      }));
      expect(logger.info).toHaveBeenCalledWith('Deleted file from S3: documents/old.pdf');
    });

    it('should handle deletion errors', async () => {
      mockDeleteObject.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Access denied'))
      });

      await expect(s3StorageService.deleteFile('protected.pdf'))
        .rejects.toThrow('Failed to delete file from S3');
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      const exists = await s3StorageService.fileExists('documents/exists.pdf');

      expect(exists).toBe(true);
      expect(mockHeadObject).toHaveBeenCalledWith(expect.objectContaining({
        Key: 'documents/exists.pdf'
      }));
    });

    it('should return false when file not found', async () => {
      const notFoundError: any = new Error('Not found');
      notFoundError.code = 'NotFound';
      mockHeadObject.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(notFoundError)
      });

      const exists = await s3StorageService.fileExists('missing.pdf');

      expect(exists).toBe(false);
    });

    it('should throw on other errors', async () => {
      mockHeadObject.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Access denied'))
      });

      await expect(s3StorageService.fileExists('protected.pdf'))
        .rejects.toThrow('Access denied');
    });
  });

  describe('getFileMetadata', () => {
    it('should return file metadata', async () => {
      const metadata = await s3StorageService.getFileMetadata('documents/test.pdf');

      expect(metadata.size).toBe(1024);
      expect(metadata.contentType).toBe('application/pdf');
      expect(metadata.metadata).toEqual({ key: 'value' });
      expect(metadata.lastModified).toBeInstanceOf(Date);
    });

    it('should handle missing metadata gracefully', async () => {
      mockHeadObject.mockReturnValueOnce({
        promise: jest.fn().mockResolvedValue({})
      });

      const metadata = await s3StorageService.getFileMetadata('documents/test.pdf');

      expect(metadata.size).toBe(0);
      expect(metadata.contentType).toBe('application/octet-stream');
      expect(metadata.metadata).toEqual({});
    });

    it('should handle errors', async () => {
      mockHeadObject.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Failed'))
      });

      await expect(s3StorageService.getFileMetadata('test.pdf'))
        .rejects.toThrow('Failed to get file metadata');
    });
  });

  describe('setExpirationPolicy', () => {
    it('should set lifecycle policy', async () => {
      await s3StorageService.setExpirationPolicy(365);

      expect(mockPutBucketLifecycleConfiguration).toHaveBeenCalledWith(expect.objectContaining({
        LifecycleConfiguration: {
          Rules: [expect.objectContaining({
            Id: 'DeleteOldDocuments',
            Status: 'Enabled',
            Prefix: 'documents/',
            Expiration: { Days: 365 }
          })]
        }
      }));
      expect(logger.info).toHaveBeenCalledWith('Set S3 expiration policy: 365 days');
    });

    it('should handle errors', async () => {
      mockPutBucketLifecycleConfiguration.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Permission denied'))
      });

      await expect(s3StorageService.setExpirationPolicy(30))
        .rejects.toThrow('Failed to set expiration policy');
    });
  });

  describe('listFiles', () => {
    it('should list files with prefix', async () => {
      mockListObjectsV2.mockReturnValueOnce({
        promise: jest.fn().mockResolvedValue({
          Contents: [
            { Key: 'documents/file1.pdf' },
            { Key: 'documents/file2.pdf' }
          ]
        })
      });

      const files = await s3StorageService.listFiles('documents/');

      expect(files).toEqual(['documents/file1.pdf', 'documents/file2.pdf']);
      expect(mockListObjectsV2).toHaveBeenCalledWith(expect.objectContaining({
        Prefix: 'documents/',
        MaxKeys: 1000
      }));
    });

    it('should respect custom maxKeys', async () => {
      await s3StorageService.listFiles('documents/', 50);

      expect(mockListObjectsV2).toHaveBeenCalledWith(expect.objectContaining({
        MaxKeys: 50
      }));
    });

    it('should handle empty results', async () => {
      mockListObjectsV2.mockReturnValueOnce({
        promise: jest.fn().mockResolvedValue({ Contents: null })
      });

      const files = await s3StorageService.listFiles('empty/');

      expect(files).toEqual([]);
    });

    it('should handle errors', async () => {
      mockListObjectsV2.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Failed'))
      });

      await expect(s3StorageService.listFiles('documents/'))
        .rejects.toThrow('Failed to list files');
    });
  });

  describe('copyFile', () => {
    it('should copy file within bucket', async () => {
      await s3StorageService.copyFile('source/file.pdf', 'dest/file.pdf');

      expect(mockCopyObject).toHaveBeenCalledWith(expect.objectContaining({
        CopySource: expect.stringContaining('source/file.pdf'),
        Key: 'dest/file.pdf',
        ServerSideEncryption: 'AES256'
      }));
      expect(logger.info).toHaveBeenCalledWith(
        'Copied file in S3: source/file.pdf -> dest/file.pdf'
      );
    });

    it('should handle errors', async () => {
      mockCopyObject.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Copy failed'))
      });

      await expect(s3StorageService.copyFile('a.pdf', 'b.pdf'))
        .rejects.toThrow('Failed to copy file in S3');
    });
  });

  describe('getBucketStats', () => {
    it('should return bucket statistics', async () => {
      mockListObjectsV2.mockReturnValueOnce({
        promise: jest.fn().mockResolvedValue({
          Contents: [
            { Size: 1000 },
            { Size: 2000 }
          ],
          NextContinuationToken: undefined
        })
      });

      const stats = await s3StorageService.getBucketStats();

      expect(stats.count).toBe(2);
      expect(stats.size).toBe(3000);
    });

    it('should paginate through all results', async () => {
      mockListObjectsV2
        .mockReturnValueOnce({
          promise: jest.fn().mockResolvedValue({
            Contents: [{ Size: 1000 }],
            NextContinuationToken: 'token1'
          })
        })
        .mockReturnValueOnce({
          promise: jest.fn().mockResolvedValue({
            Contents: [{ Size: 2000 }],
            NextContinuationToken: undefined
          })
        });

      const stats = await s3StorageService.getBucketStats();

      expect(stats.count).toBe(2);
      expect(stats.size).toBe(3000);
      expect(mockListObjectsV2).toHaveBeenCalledTimes(2);
    });

    it('should handle errors', async () => {
      mockListObjectsV2.mockReturnValueOnce({
        promise: jest.fn().mockRejectedValue(new Error('Failed'))
      });

      await expect(s3StorageService.getBucketStats())
        .rejects.toThrow('Failed to get bucket stats');
    });
  });

  describe('exported singleton', () => {
    it('should export s3StorageService instance', () => {
      expect(s3StorageService).toBeDefined();
      expect(s3StorageService.uploadFile).toBeInstanceOf(Function);
      expect(s3StorageService.downloadFile).toBeInstanceOf(Function);
      expect(s3StorageService.deleteFile).toBeInstanceOf(Function);
    });
  });
});
