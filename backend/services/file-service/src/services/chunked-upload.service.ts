import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { getPool } from '../config/database.config';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';

export class ChunkedUploadService {
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
  private readonly SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  async createSession(
    filename: string,
    fileSize: number,
    mimeType: string,
    userId?: string
  ): Promise<string> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    const sessionToken = uuidv4();
    const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
    const expiresAt = new Date(Date.now() + this.SESSION_TTL);
    
    await pool.query(`
      INSERT INTO upload_sessions (
        session_token, uploaded_by, filename, mime_type,
        total_size, total_chunks, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [sessionToken, userId, filename, mimeType, fileSize, totalChunks, expiresAt]);
    
    logger.info(`Chunked upload session created: ${sessionToken}`);
    return sessionToken;
  }
  
  async uploadChunk(
    sessionToken: string,
    chunkNumber: number,
    chunkData: Buffer
  ): Promise<{ progress: number; complete: boolean }> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get session
    const sessionResult = await pool.query(
      'SELECT * FROM upload_sessions WHERE session_token = $1 AND status = $2',
      [sessionToken, 'active']
    );
    
    if (sessionResult.rows.length === 0) {
      throw new Error('Invalid or expired session');
    }
    
    const session = sessionResult.rows[0];
    
    // Validate chunk number
    if (chunkNumber >= session.total_chunks) {
      throw new Error('Invalid chunk number');
    }
    
    // Store chunk temporarily
    const chunkPath = path.join('./temp', 'chunks', sessionToken, `chunk_${chunkNumber}`);
    await fs.mkdir(path.dirname(chunkPath), { recursive: true });
    await fs.writeFile(chunkPath, chunkData);
    
    // Update session progress
    const updatedChunks = session.uploaded_chunks + 1;
    const updatedBytes = session.uploaded_bytes + chunkData.length;
    
    await pool.query(`
      UPDATE upload_sessions 
      SET uploaded_chunks = $1, uploaded_bytes = $2
      WHERE session_token = $3
    `, [updatedChunks, updatedBytes, sessionToken]);
    
    const progress = (updatedChunks / session.total_chunks) * 100;
    const complete = updatedChunks === session.total_chunks;
    
    logger.debug(`Chunk ${chunkNumber} uploaded for session ${sessionToken}`);
    
    return { progress, complete };
  }
  
  async completeSession(sessionToken: string): Promise<string> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Get session
    const sessionResult = await pool.query(
      'SELECT * FROM upload_sessions WHERE session_token = $1',
      [sessionToken]
    );
    
    if (sessionResult.rows.length === 0) {
      throw new Error('Session not found');
    }
    
    const session = sessionResult.rows[0];
    
    if (session.uploaded_chunks !== session.total_chunks) {
      throw new Error('Not all chunks uploaded');
    }
    
    // Combine chunks
    const chunksDir = path.join('./temp', 'chunks', sessionToken);
    const chunks: Buffer[] = [];
    
    for (let i = 0; i < session.total_chunks; i++) {
      const chunkPath = path.join(chunksDir, `chunk_${i}`);
      const chunkData = await fs.readFile(chunkPath);
      chunks.push(chunkData);
    }
    
    const completeFile = Buffer.concat(chunks);
    
    // Create file record using regular upload service
    const { uploadService } = await import('./upload.service');
    const file = await uploadService.uploadFile(
      completeFile,
      session.filename,
      session.mime_type,
      session.uploaded_by
    );
    
    // Clean up chunks
    await fs.rm(chunksDir, { recursive: true, force: true });
    
    // Mark session as completed
    await pool.query(
      'UPDATE upload_sessions SET status = $1, completed_at = $2 WHERE session_token = $3',
      ['completed', new Date(), sessionToken]
    );
    
    logger.info(`Chunked upload completed: ${sessionToken} -> ${file.id}`);
    
    return file.id;
  }
  
  async cancelSession(sessionToken: string): Promise<void> {
    const pool = getPool();
    if (!pool) throw new Error('Database not available');
    
    // Clean up chunks
    const chunksDir = path.join('./temp', 'chunks', sessionToken);
    await fs.rm(chunksDir, { recursive: true, force: true }).catch(() => {});
    
    // Mark session as cancelled
    await pool.query(
      'UPDATE upload_sessions SET status = $1 WHERE session_token = $2',
      ['cancelled', sessionToken]
    );
    
    logger.info(`Upload session cancelled: ${sessionToken}`);
  }
}

export const chunkedUploadService = new ChunkedUploadService();
