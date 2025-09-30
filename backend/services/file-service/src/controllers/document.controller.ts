import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { documentProcessor } from '../processors/document/document.processor';
import { logger } from '../utils/logger';
import pdf from 'pdf-parse';

export class DocumentController {
  async getPreview(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      if (file.mimeType === 'application/pdf') {
        const data = await pdf(buffer);
        reply.send({
          text: data.text.substring(0, 1000),
          pages: data.numpages,
          info: data.info
        });
      } else {
        reply.send({
          text: buffer.toString('utf8').substring(0, 1000)
        });
      }
      
    } catch (error: any) {
      logger.error('Document preview failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async getPage(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id, page } = request.params as { id: string; page: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      if (file.mimeType !== 'application/pdf') {
        return reply.status(400).send({ error: 'Not a PDF file' });
      }
      
      // For full implementation, would extract specific page
      // This is simplified version
      const buffer = await storageService.download(file.storagePath);
      const data = await pdf(buffer);
      
      reply.send({
        page: parseInt(page),
        totalPages: data.numpages,
        text: `Page ${page} content would be extracted here`
      });
      
    } catch (error: any) {
      logger.error('Get page failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async convertFormat(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { format } = request.body as { format: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      // Simplified - real implementation would use LibreOffice or similar
      reply.send({
        success: true,
        message: `Conversion to ${format} would be processed here`,
        originalFormat: file.mimeType,
        targetFormat: format
      });
      
    } catch (error: any) {
      logger.error('Convert format failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
  
  async extractText(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      
      const file = await fileModel.findById(id);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      let text = '';
      if (file.mimeType === 'application/pdf') {
        const data = await pdf(buffer);
        text = data.text;
      } else if (file.mimeType.includes('text')) {
        text = buffer.toString('utf8');
      }
      
      reply.send({ text, length: text.length });
      
    } catch (error: any) {
      logger.error('Extract text failed:', error);
      reply.status(500).send({ error: error.message });
    }
  }
}

export const documentController = new DocumentController();
