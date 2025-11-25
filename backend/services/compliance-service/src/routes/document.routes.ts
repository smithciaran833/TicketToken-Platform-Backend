import { FastifyInstance } from 'fastify';
import { DocumentController } from '../controllers/document.controller';

export async function documentRoutes(fastify: FastifyInstance) {
  const documentController = new DocumentController();

  // Document routes authenticated by default from parent
  fastify.post('/documents/upload', documentController.uploadDocument);
  fastify.get('/documents/:documentId', documentController.getDocument);
}
