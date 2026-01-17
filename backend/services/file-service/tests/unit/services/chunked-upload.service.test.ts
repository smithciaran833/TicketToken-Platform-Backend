import { ChunkedUploadService } from '../../../src/services/chunked-upload.service';
import { getPool } from '../../../src/config/database.config';
import { logger } from '../../../src/utils/logger';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('../../../src/config/database.config');
jest.mock('../../../src/utils/logger');
jest.mock('fs/promises');
jest.mock('../../../src/services/upload.service', () => ({
  uploadService: {
    uploadFile: jest.fn().mockResolvedValue({ id: 'new-file-id' })
  }
}));

describe('ChunkedUploadService', () => {
  let chunkedUploadService: ChunkedUploadService;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = {
      query: jest.fn()
    };
    (getPool as jest.Mock).mockReturnValue(mockPool);

    chunkedUploadService = new ChunkedUploadService();
  });

  describe('createSession', () => {
    it('should create upload session successfully', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const sessionToken = await chunkedUploadService.createSession(
        'largefile.mp4',
        50 * 1024 * 1024, // 50MB
        'video/mp4',
        'user-123'
      );

      expect(sessionToken).toBeDefined();
      expect(mockPool.query).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Chunked upload session created'));
    });

    it('should calculate total chunks correctly', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const fileSize = 25 * 1024 * 1024; // 25MB (should be 5 chunks of 5MB each)

      await chunkedUploadService.createSession(
        'file.zip',
        fileSize,
        'application/zip',
        'user-123'
      );

      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[1][5]).toBe(5); // total_chunks parameter
    });

    it('should set expiration time', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await chunkedUploadService.createSession(
        'file.pdf',
        1024 * 1024,
        'application/pdf'
      );

      const queryCall = mockPool.query.mock.calls[0];
      const expiresAt = queryCall[1][6];

      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should throw error when database not available', async () => {
      (getPool as jest.Mock).mockReturnValue(null);

      await expect(
        chunkedUploadService.createSession('file.pdf', 1024, 'application/pdf')
      ).rejects.toThrow('Database not available');
    });
  });

  describe('uploadChunk', () => {
    const mockSession = {
      session_token: 'session-123',
      total_chunks: 10,
      uploaded_chunks: 2,
      uploaded_bytes: 10 * 1024 * 1024,
      status: 'active'
    };

    it('should upload chunk successfully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockSession] }) // Get session
        .mockResolvedValueOnce({ rows: [] }); // Update session

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const chunkData = Buffer.from('chunk data');

      const result = await chunkedUploadService.uploadChunk(
        'session-123',
        2,
        chunkData
      );

      expect(result.progress).toBeGreaterThan(0);
      expect(result.complete).toBe(false);
      expect(fs.writeFile).toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should mark as complete when all chunks uploaded', async () => {
      const completingSession = {
        ...mockSession,
        total_chunks: 3,
        uploaded_chunks: 2 // This will be the last chunk
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [completingSession] })
        .mockResolvedValueOnce({ rows: [] });

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await chunkedUploadService.uploadChunk(
        'session-123',
        2,
        Buffer.from('last chunk')
      );

      expect(result.complete).toBe(true);
      expect(result.progress).toBe(100);
    });

    it('should throw error for invalid session', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(
        chunkedUploadService.uploadChunk('invalid-session', 0, Buffer.from('data'))
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should throw error for invalid chunk number', async () => {
      mockPool.query.mockResolvedValue({ rows: [mockSession] });

      await expect(
        chunkedUploadService.uploadChunk('session-123', 15, Buffer.from('data'))
      ).rejects.toThrow('Invalid chunk number');
    });

    it('should create chunk directory if not exists', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockSession] })
        .mockResolvedValueOnce({ rows: [] });

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await chunkedUploadService.uploadChunk(
        'session-123',
        0,
        Buffer.from('data')
      );

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('session-123'),
        expect.objectContaining({ recursive: true })
      );
    });

    it('should update progress correctly', async () => {
      const session = {
        ...mockSession,
        total_chunks: 10,
        uploaded_chunks: 4
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [session] })
        .mockResolvedValueOnce({ rows: [] });

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await chunkedUploadService.uploadChunk(
        'session-123',
        5,
        Buffer.from('data')
      );

      expect(result.progress).toBe(50); // 5 of 10 chunks
    });
  });

  describe('completeSession', () => {
    const mockSession = {
      session_token: 'session-123',
      total_chunks: 3,
      uploaded_chunks: 3,
      filename: 'complete-file.pdf',
      mime_type: 'application/pdf',
      uploaded_by: 'user-123'
    };

    it('should complete session and combine chunks', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockSession] }) // Get session
        .mockResolvedValueOnce({ rows: [] }); // Update session

      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce(Buffer.from('chunk0'))
        .mockResolvedValueOnce(Buffer.from('chunk1'))
        .mockResolvedValueOnce(Buffer.from('chunk2'));

      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      const fileId = await chunkedUploadService.completeSession('session-123');

      expect(fileId).toBe('new-file-id');
      expect(fs.readFile).toHaveBeenCalledTimes(3);
      expect(fs.rm).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE upload_sessions'),
        expect.any(Array)
      );
    });

    it('should throw error for non-existent session', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(
        chunkedUploadService.completeSession('invalid-session')
      ).rejects.toThrow('Session not found');
    });

    it('should throw error when not all chunks uploaded', async () => {
      const incompleteSession = {
        ...mockSession,
        uploaded_chunks: 2
      };

      mockPool.query.mockResolvedValue({ rows: [incompleteSession] });

      await expect(
        chunkedUploadService.completeSession('session-123')
      ).rejects.toThrow('Not all chunks uploaded');
    });

    it('should clean up chunks directory after completion', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockSession] })
        .mockResolvedValueOnce({ rows: [] });

      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('chunk'));
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      await chunkedUploadService.completeSession('session-123');

      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining('session-123'),
        expect.objectContaining({ recursive: true, force: true })
      );
    });

    it('should log completion', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [mockSession] })
        .mockResolvedValueOnce({ rows: [] });

      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('chunk'));
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      await chunkedUploadService.completeSession('session-123');

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Chunked upload completed')
      );
    });
  });

  describe('cancelSession', () => {
    it('should cancel session and clean up chunks', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      (fs.rm as jest.Mock).mockResolvedValue(undefined);

      await chunkedUploadService.cancelSession('session-123');

      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining('session-123'),
        expect.objectContaining({ recursive: true, force: true })
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE upload_sessions'),
        ['cancelled', 'session-123']
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Upload session cancelled')
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      (fs.rm as jest.Mock).mockRejectedValue(new Error('Cleanup failed'));

      await chunkedUploadService.cancelSession('session-123');

      // Should still update database even if cleanup fails
      expect(mockPool.query).toHaveBeenCalled();
    });

    it('should throw error when database not available', async () => {
      (getPool as jest.Mock).mockReturnValue(null);

      await expect(
        chunkedUploadService.cancelSession('session-123')
      ).rejects.toThrow('Database not available');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete upload workflow', async () => {
      // Create session
      mockPool.query.mockResolvedValue({ rows: [] });
      const sessionToken = await chunkedUploadService.createSession(
        'test.zip',
        10 * 1024 * 1024,
        'application/zip',
        'user-123'
      );

      expect(sessionToken).toBeDefined();

      // Upload chunks
      const mockSession = {
        session_token: sessionToken,
        total_chunks: 2,
        uploaded_chunks: 0,
        uploaded_bytes: 0,
        status: 'active'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockSession] })
        .mockResolvedValueOnce({ rows: [] });

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      const chunk1Result = await chunkedUploadService.uploadChunk(
        sessionToken,
        0,
        Buffer.from('chunk1')
      );

      expect(chunk1Result.complete).toBe(false);
    });

    it('should handle concurrent chunk uploads', async () => {
      const mockSession = {
        session_token: 'session-123',
        total_chunks: 5,
        uploaded_chunks: 0,
        uploaded_bytes: 0,
        status: 'active'
      };

      // For concurrent uploads, always return the session for SELECT queries
      // The mock needs to handle interleaved calls (all SELECTs may come before UPDATEs)
      mockPool.query.mockResolvedValue({ rows: [mockSession] });

      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      // Upload multiple chunks concurrently
      const uploads = [0, 1, 2].map(chunkNum =>
        chunkedUploadService.uploadChunk(
          'session-123',
          chunkNum,
          Buffer.from(`chunk${chunkNum}`)
        )
      );

      const results = await Promise.all(uploads);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('progress');
        expect(result).toHaveProperty('complete');
      });
    });
  });
});
