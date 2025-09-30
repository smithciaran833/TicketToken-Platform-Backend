import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { fileModel } from '../models/file.model';
import { videoProcessor } from '../processors/video/video.processor';
import { logger } from '../utils/logger';

export class VideoController {
  async getPreview(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      // Get video metadata from database
      const pool = await import('../config/database.config').then(m => m.getPool());
      const result = await pool?.query(
        'SELECT * FROM video_metadata WHERE file_id = $1',
        [id]
      );
      
      if (!result?.rows[0]) {
        // Process video if not yet processed
        await videoProcessor.processVideo(id);
      }
      
      reply.send({
        metadata: result?.rows[0] || {},
        thumbnails: [
          file.storagePath.replace(/\.[^.]+$/, '_thumb_1.jpg'),
          file.storagePath.replace(/\.[^.]+$/, '_thumb_2.jpg'),
          file.storagePath.replace(/\.[^.]+$/, '_thumb_3.jpg')
        ]
      });
      
    } catch (error: any) {
      logger.error('Video preview failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async transcode(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { format, quality } = request.body as any;
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      // Add to processing queue
      const pool = await import('../config/database.config').then(m => m.getPool());
      await pool?.query(
        `INSERT INTO file_processing_queue (file_id, operation, priority) 
         VALUES ($1, $2, $3)`,
        [id, `transcode_${format}_${quality}`, 5]
      );
      
      reply.send({
        success: true,
        message: 'Video transcoding queued',
        jobId: id,
        format,
        quality
      });
      
    } catch (error: any) {
      logger.error('Transcode failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async getMetadata(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const pool = await import('../config/database.config').then(m => m.getPool());
      const result = await pool?.query(
        'SELECT * FROM video_metadata WHERE file_id = $1',
        [id]
      );
      
      if (!result?.rows[0]) {
        return reply.status(404).send({ error: 'Video metadata not found' });
      }
      
      reply.send(result.rows[0]);
      
    } catch (error: any) {
      logger.error('Get video metadata failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
}

export const videoController = new VideoController();
