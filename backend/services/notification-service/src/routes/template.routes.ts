import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { templateService } from '../services/template.service';
import { logger } from '../config/logger';

export default async function templateRoutes(fastify: FastifyInstance) {

  // Create template
  fastify.post('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const template = await templateService.createTemplate(request.body as any);
      reply.status(201).send(template);
    } catch (error: any) {
      logger.error('Failed to create template', { error });
      reply.status(400).send({ error: error.message });
    }
  });

  // List templates
  fastify.get('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { type, status, category, language, limit, offset } = request.query as any;
      const result = await templateService.listTemplates({
        type, status, category, language,
        limit: limit ? parseInt(limit) : undefined,
        offset: offset ? parseInt(offset) : undefined,
      });
      reply.send(result);
    } catch (error: any) {
      logger.error('Failed to list templates', { error });
      reply.status(500).send({ error: error.message });
    }
  });

  // Get template by ID
  fastify.get('/templates/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const template = await templateService.getTemplateById(request.params.id);
      if (!template) {
        return reply.status(404).send({ error: 'Template not found' });
      }
      reply.send(template);
    } catch (error: any) {
      logger.error('Failed to get template', { error });
      reply.status(500).send({ error: error.message });
    }
  });

  // Update template
  fastify.put('/templates/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const template = await templateService.updateTemplate(request.params.id, request.body as any);
      reply.send(template);
    } catch (error: any) {
      logger.error('Failed to update template', { error });
      reply.status(400).send({ error: error.message });
    }
  });

  // Delete template
  fastify.delete('/templates/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      await templateService.deleteTemplate(request.params.id);
      reply.status(204).send();
    } catch (error: any) {
      logger.error('Failed to delete template', { error });
      reply.status(500).send({ error: error.message });
    }
  });

  // Preview template
  fastify.post('/templates/:id/preview', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const preview = await templateService.previewTemplate(request.params.id, request.body as any);
      reply.send(preview);
    } catch (error: any) {
      logger.error('Failed to preview template', { error });
      reply.status(400).send({ error: error.message });
    }
  });

  // Get template versions
  fastify.get('/templates/:id/versions', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const versions = await templateService.getVersionHistory(request.params.id);
      reply.send(versions);
    } catch (error: any) {
      logger.error('Failed to get template versions', { error });
      reply.status(500).send({ error: error.message });
    }
  });

  // Get template stats
  fastify.get('/templates/:id/stats', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const stats = await templateService.getUsageStats(request.params.id);
      reply.send(stats);
    } catch (error: any) {
      logger.error('Failed to get template stats', { error });
      reply.status(500).send({ error: error.message });
    }
  });
}
