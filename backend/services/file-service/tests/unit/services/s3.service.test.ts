describe('services/s3.service', () => {
  let S3Service: any;
  let s3Service: any;
  let service: any;
  let mockSend: jest.Mock;
  let mockGetSignedUrl: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    // Setup mock send function
    mockSend = jest.fn();
    mockGetSignedUrl = jest.fn().mockResolvedValue('https://signed-url.example.com/file?signature=abc123');

    // Mock AFTER resetModules using doMock
    jest.doMock('@aws-sdk/client-s3', () => ({
      S3Client: jest.fn(() => ({ send: mockSend })),
      PutObjectCommand: jest.requireActual('@aws-sdk/client-s3').PutObjectCommand,
      GetObjectCommand: jest.requireActual('@aws-sdk/client-s3').GetObjectCommand,
      DeleteObjectCommand: jest.requireActual('@aws-sdk/client-s3').DeleteObjectCommand,
      HeadObjectCommand: jest.requireActual('@aws-sdk/client-s3').HeadObjectCommand,
      ListObjectsV2Command: jest.requireActual('@aws-sdk/client-s3').ListObjectsV2Command,
      CopyObjectCommand: jest.requireActual('@aws-sdk/client-s3').CopyObjectCommand,
    }));

    jest.doMock('@aws-sdk/s3-request-presigner', () => ({
      getSignedUrl: mockGetSignedUrl,
    }));

    process.env.S3_BUCKET = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';

    // Import fresh module after mocks are set up
    const s3Module = require('../../../src/services/s3.service');
    S3Service = s3Module.S3Service;
    s3Service = s3Module.s3Service;
    service = new S3Service();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('uploadToS3', () => {
    it('should upload with tenant-scoped key', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockResolvedValue({ ETag: '"abc123"' });

      const result = await service.uploadToS3({
        tenantId,
        filename: 'test.jpg',
        contentType: 'image/jpeg',
        buffer: Buffer.from('test content')
      });

      expect(result.key).toContain(`tenants/${tenantId}/files/`);
      expect(result.bucket).toBe('test-bucket');
      expect(result.etag).toBe('"abc123"');
      expect(mockSend).toHaveBeenCalledTimes(1);
      // Verify it's a PutObjectCommand by checking the input structure
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('test-bucket');
      expect(command.input.ContentType).toBe('image/jpeg');
    });

    it('should throw when tenant ID missing', async () => {
      await expect(
        service.uploadToS3({
          tenantId: '',
          filename: 'test.jpg',
          contentType: 'image/jpeg',
          buffer: Buffer.from('test')
        })
      ).rejects.toThrow('Tenant ID is required');
    });

    it('should validate tenant ID format (UUID)', async () => {
      await expect(
        service.uploadToS3({
          tenantId: 'invalid-tenant-id',
          filename: 'test.jpg',
          contentType: 'image/jpeg',
          buffer: Buffer.from('test')
        })
      ).rejects.toThrow('Invalid tenant ID format');
    });

    it('should add tenant metadata', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockResolvedValue({ ETag: '"abc123"' });

      await service.uploadToS3({
        tenantId,
        filename: 'test.jpg',
        contentType: 'image/jpeg',
        buffer: Buffer.from('test'),
        metadata: { customKey: 'customValue' }
      });

      const sendCall = mockSend.mock.calls[0][0];
      expect(sendCall.input.Metadata).toMatchObject({
        'x-tenant-id': tenantId,
        customKey: 'customValue'
      });
    });

    it('should set ACL to public-read when isPublic true', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockResolvedValue({ ETag: '"abc"' });

      await service.uploadToS3({
        tenantId,
        filename: 'test.jpg',
        contentType: 'image/jpeg',
        buffer: Buffer.from('test'),
        isPublic: true
      });

      const sendCall = mockSend.mock.calls[0][0];
      expect(sendCall.input.ACL).toBe('public-read');
    });

    it('should set ACL to private when isPublic false', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockResolvedValue({ ETag: '"abc"' });

      await service.uploadToS3({
        tenantId,
        filename: 'test.jpg',
        contentType: 'image/jpeg',
        buffer: Buffer.from('test'),
        isPublic: false
      });

      const sendCall = mockSend.mock.calls[0][0];
      expect(sendCall.input.ACL).toBe('private');
    });

    it('should handle upload errors', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockRejectedValue(new Error('Upload failed'));

      await expect(
        service.uploadToS3({
          tenantId,
          filename: 'test.jpg',
          contentType: 'image/jpeg',
          buffer: Buffer.from('test')
        })
      ).rejects.toThrow('Failed to upload file');
    });
  });

  describe('downloadFromS3', () => {
    it('should download with tenant validation', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const key = `tenants/${tenantId}/files/2024/01/abc_test.jpg`;
      const mockBody = {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from('file content');
        }
      };
      mockSend.mockResolvedValue({ Body: mockBody });

      const result = await service.downloadFromS3({ tenantId, key });

      expect(result).toBeInstanceOf(Buffer);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('test-bucket');
      expect(command.input.Key).toBe(key);
    });

    it('should throw on cross-tenant access attempt', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const wrongTenantId = '87654321-4321-4321-4321-cba987654321';
      const key = `tenants/${wrongTenantId}/files/2024/01/abc_test.jpg`;

      await expect(
        service.downloadFromS3({ tenantId, key })
      ).rejects.toThrow('cross-tenant access not allowed');
    });

    it('should throw when file not found (NoSuchKey)', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const key = `tenants/${tenantId}/files/2024/01/missing.jpg`;
      const error: any = new Error('NoSuchKey');
      error.name = 'NoSuchKey';
      mockSend.mockRejectedValue(error);

      await expect(
        service.downloadFromS3({ tenantId, key })
      ).rejects.toThrow('File not found');
    });

    it('should handle download errors', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const key = `tenants/${tenantId}/files/2024/01/test.jpg`;
      mockSend.mockRejectedValue(new Error('Download failed'));

      await expect(
        service.downloadFromS3({ tenantId, key })
      ).rejects.toThrow('Failed to download file');
    });
  });

  describe('deleteFromS3', () => {
    it('should delete with tenant validation', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const key = `tenants/${tenantId}/files/2024/01/test.jpg`;
      mockSend.mockResolvedValue({});

      const result = await service.deleteFromS3(tenantId, key);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Bucket).toBe('test-bucket');
      expect(command.input.Key).toBe(key);
    });

    it('should throw on cross-tenant delete', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const wrongTenantId = '87654321-4321-4321-4321-cba987654321';
      const key = `tenants/${wrongTenantId}/files/2024/01/test.jpg`;

      await expect(
        service.deleteFromS3(tenantId, key)
      ).rejects.toThrow('cross-tenant access not allowed');
    });

    it('should handle delete errors', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const key = `tenants/${tenantId}/files/2024/01/test.jpg`;
      mockSend.mockRejectedValue(new Error('Delete failed'));

      await expect(
        service.deleteFromS3(tenantId, key)
      ).rejects.toThrow('Failed to delete file');
    });
  });

  describe('generateUploadUrl', () => {
    it('should generate presigned upload URL', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';

      const result = await service.generateUploadUrl({
        tenantId,
        key: 'test.jpg',
        contentType: 'image/jpeg'
      });

      expect(result.url).toContain('signed-url.example.com');
      expect(result.key).toContain(`tenants/${tenantId}/files/`);
      expect(mockGetSignedUrl).toHaveBeenCalled();
    });

    it('should throw when tenant ID missing', async () => {
      await expect(
        service.generateUploadUrl({
          tenantId: '',
          key: 'test.jpg'
        })
      ).rejects.toThrow('Tenant ID is required');
    });

    it('should use default expiry of 3600', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';

      await service.generateUploadUrl({
        tenantId,
        key: 'test.jpg',
        contentType: 'image/jpeg'
      });

      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      const callArgs = mockGetSignedUrl.mock.calls[0];
      expect(callArgs[2]).toEqual({ expiresIn: 3600 });
      // Verify it's a PutObjectCommand
      expect(callArgs[1].input.Bucket).toBe('test-bucket');
    });

    it('should use custom expiry', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';

      await service.generateUploadUrl({
        tenantId,
        key: 'test.jpg',
        expiresIn: 7200
      });

      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      const callArgs = mockGetSignedUrl.mock.calls[0];
      expect(callArgs[2]).toEqual({ expiresIn: 7200 });
    });
  });

  describe('generateDownloadUrl', () => {
    it('should generate presigned download URL', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const key = `tenants/${tenantId}/files/2024/01/test.jpg`;

      const result = await service.generateDownloadUrl({
        tenantId,
        key,
        expiresIn: 3600
      });

      expect(result).toContain('signed-url.example.com');
      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
      const callArgs = mockGetSignedUrl.mock.calls[0];
      expect(callArgs[2]).toEqual({ expiresIn: 3600 });
      // Verify it's a GetObjectCommand
      expect(callArgs[1].input.Key).toBe(key);
    });

    it('should validate tenant access to key', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const wrongTenantId = '87654321-4321-4321-4321-cba987654321';
      const key = `tenants/${wrongTenantId}/files/2024/01/test.jpg`;

      await expect(
        service.generateDownloadUrl({ tenantId, key })
      ).rejects.toThrow('cross-tenant access not allowed');
    });

    it('should handle URL generation errors', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const key = `tenants/${tenantId}/files/2024/01/test.jpg`;
      mockGetSignedUrl.mockRejectedValue(new Error('Generation failed'));

      await expect(
        service.generateDownloadUrl({ tenantId, key })
      ).rejects.toThrow('Failed to generate download URL');
    });
  });

  describe('fileExists', () => {
    it('should return true when file exists', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const key = `tenants/${tenantId}/files/2024/01/test.jpg`;
      mockSend.mockResolvedValue({});

      const result = await service.fileExists(tenantId, key);

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Key).toBe(key);
    });

    it('should return false when not found', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const key = `tenants/${tenantId}/files/2024/01/test.jpg`;
      const error: any = new Error('NotFound');
      error.name = 'NotFound';
      mockSend.mockRejectedValue(error);

      const result = await service.fileExists(tenantId, key);

      expect(result).toBe(false);
    });

    it('should validate tenant access', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const wrongTenantId = '87654321-4321-4321-4321-cba987654321';
      const key = `tenants/${wrongTenantId}/files/2024/01/test.jpg`;

      await expect(
        service.fileExists(tenantId, key)
      ).rejects.toThrow('cross-tenant access not allowed');
    });
  });

  describe('listTenantFiles', () => {
    it('should list files with tenant prefix', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockResolvedValue({
        Contents: [
          { Key: `tenants/${tenantId}/files/file1.jpg` },
          { Key: `tenants/${tenantId}/files/file2.jpg` }
        ]
      });

      const result = await service.listTenantFiles(tenantId);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain(tenantId);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input.Prefix).toContain(`tenants/${tenantId}/files/`);
    });

    it('should throw when tenant ID missing', async () => {
      await expect(
        service.listTenantFiles('')
      ).rejects.toThrow('Tenant ID is required');
    });

    it('should respect maxKeys parameter', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockResolvedValue({ Contents: [] });

      await service.listTenantFiles(tenantId, undefined, 500);

      const sendCall = mockSend.mock.calls[0][0];
      expect(sendCall.input.MaxKeys).toBe(500);
    });

    it('should add optional prefix', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockResolvedValue({ Contents: [] });

      await service.listTenantFiles(tenantId, '2024/01/');

      const sendCall = mockSend.mock.calls[0][0];
      expect(sendCall.input.Prefix).toContain('2024/01/');
    });
  });

  describe('copyFile', () => {
    it('should copy within tenant namespace', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const sourceKey = `tenants/${tenantId}/files/2024/01/source.jpg`;
      mockSend.mockResolvedValue({});

      const destKey = await service.copyFile(tenantId, sourceKey, 'destination.jpg');

      expect(destKey).toContain(`tenants/${tenantId}/files/`);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input.CopySource).toContain(sourceKey);
    });

    it('should validate source tenant', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const wrongTenantId = '87654321-4321-4321-4321-cba987654321';
      const sourceKey = `tenants/${wrongTenantId}/files/2024/01/source.jpg`;

      await expect(
        service.copyFile(tenantId, sourceKey, 'destination.jpg')
      ).rejects.toThrow('cross-tenant access not allowed');
    });

    it('should set copy metadata', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      const sourceKey = `tenants/${tenantId}/files/2024/01/source.jpg`;
      mockSend.mockResolvedValue({});

      await service.copyFile(tenantId, sourceKey, 'destination.jpg');

      const sendCall = mockSend.mock.calls[0][0];
      expect(sendCall.input.Metadata).toMatchObject({
        'x-tenant-id': tenantId,
        'x-copied-from': sourceKey
      });
    });
  });

  describe('getTenantStorageUsage', () => {
    it('should calculate total bytes', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockResolvedValue({
        Contents: [
          { Size: 1024 },
          { Size: 2048 },
          { Size: 512 }
        ]
      });

      const result = await service.getTenantStorageUsage(tenantId);

      expect(result.totalBytes).toBe(3584);
      expect(result.count).toBe(3);
    });

    it('should count files', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend.mockResolvedValue({
        Contents: [
          { Size: 100 },
          { Size: 200 }
        ]
      });

      const result = await service.getTenantStorageUsage(tenantId);

      expect(result.count).toBe(2);
    });

    it('should handle pagination (ContinuationToken)', async () => {
      const tenantId = '12345678-1234-1234-1234-123456789abc';
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Size: 1000 }],
          NextContinuationToken: 'token123'
        })
        .mockResolvedValueOnce({
          Contents: [{ Size: 2000 }]
        });

      const result = await service.getTenantStorageUsage(tenantId);

      expect(result.count).toBe(2);
      expect(result.totalBytes).toBe(3000);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw when tenant ID missing', async () => {
      await expect(
        service.getTenantStorageUsage('')
      ).rejects.toThrow('Tenant ID is required');
    });
  });

  describe('singleton instance', () => {
    it('should export s3Service instance', () => {
      expect(s3Service).toBeDefined();
      expect(s3Service.constructor.name).toBe('S3Service');
    });
  });
});
