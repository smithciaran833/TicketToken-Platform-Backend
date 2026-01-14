import { FastifyRequest, FastifyReply } from 'fastify';
import { uploadService } from '../services/upload.service';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';
import { getTenantId } from '../middleware/tenant-context';

export class DownloadController {
  async downloadFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const tenantId = getTenantId(request);
      const file = await uploadService.getFile(id, tenantId);

      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }

      if (!file.storagePath) {
        return reply.status(400).send({ error: 'File has no storage path' });
      }

      const buffer = await storageService.download(file.storagePath);

      reply
        .header('Content-Type', file.mimeType ?? 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${file.filename}"`)
        .header('Content-Length', (file.sizeBytes ?? buffer.length).toString())
        .send(buffer);
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Download failed');
      return reply.status(500).send({ error: 'Failed to download file' });
    }
  }

  async streamFile(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const tenantId = getTenantId(request);
      const file = await uploadService.getFile(id, tenantId);

      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }

      if (!file.storagePath) {
        return reply.status(400).send({ error: 'File has no storage path' });
      }

      const buffer = await storageService.download(file.storagePath);

      reply
        .header('Content-Type', file.mimeType ?? 'application/octet-stream')
        .header('Content-Disposition', `inline; filename="${file.filename}"`)
        .send(buffer);
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Stream failed');
      return reply.status(500).send({ error: 'Failed to stream file' });
    }
  }
}

export const downloadController = new DownloadController();
