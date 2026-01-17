import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { documentService } from '../services/document.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class DocumentController {
  async uploadDocument(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const data = await request.file();

      if (!data) {
        return reply.code(400).send({
          success: false,
          error: 'No file uploaded'
        });
      }

      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowedTypes.includes(data.mimetype)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid file type. Only PDF, JPG, and PNG are allowed.'
        });
      }

      // Check file size (10MB limit)
      const buffer = await data.toBuffer();
      if (buffer.length > 10 * 1024 * 1024) {
        return reply.code(400).send({
          success: false,
          error: 'File size exceeds 10MB limit'
        });
      }

      const fields = data.fields as any;
      const venueId = (fields.venueId as any)?.value;
      const documentType = (fields.documentType as any)?.value;

      // Use filename as-is, including empty string if that's what we received
      const filename = data.filename;

      const documentId = await documentService.storeDocument(
        venueId,
        documentType,
        buffer,
        filename,
        tenantId
      );

      logger.info(`Document uploaded for tenant ${tenantId}, venue ${venueId}, type: ${documentType}`);

      return reply.send({
        success: true,
        message: 'Document uploaded successfully',
        data: {
          documentId,
          venueId,
          documentType,
          filename: data.filename
        }
      });
    } catch (error: any) {
      logger.error(`Error uploading document: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async getDocument(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { documentId } = request.params as any;

      const doc = await documentService.getDocument(documentId, tenantId);

      logger.info(`Document retrieved for tenant ${tenantId}, documentId: ${documentId}`);

      reply.header('Content-Type', doc.contentType);
      reply.header('Content-Disposition', `attachment; filename="${doc.filename}"`);

      return reply.send(doc.buffer);
    } catch (error: any) {
      logger.error(`Error retrieving document: ${error.message}`);
      return reply.code(404).send({
        success: false,
        error: error.message
      });
    }
  }
}
