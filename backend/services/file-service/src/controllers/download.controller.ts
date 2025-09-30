import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { uploadService } from '../services/upload.service';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';

export class DownloadController {
  async downloadFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const file = await uploadService.getFile(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      reply
        .header('Content-Type', file.mimeType)
        .header('Content-Disposition', `attachment; filename="${file.filename}"`)
        .header('Content-Length', file.sizeBytes.toString())
        .send(buffer);
        
    } catch (error: any) {
      logger.error('Download failed:', error);
      return reply.status(500).send({ error: 'Failed to download file' });
    }
  }
  
  async streamFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const file = await uploadService.getFile(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      reply
        .header('Content-Type', file.mimeType)
        .header('Content-Disposition', `inline; filename="${file.filename}"`)
        .send(buffer);
        
    } catch (error: any) {
      logger.error('Stream failed:', error);
      return reply.status(500).send({ error: 'Failed to stream file' });
    }
  }
}

export const downloadController = new DownloadController();
