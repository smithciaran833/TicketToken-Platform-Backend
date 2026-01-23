/**
 * Internal Routes - file-service
 *
 * For service-to-service communication only.
 * These endpoints provide file data to other services
 * (compliance-service for GDPR exports, ticket-service, etc.)
 *
 * Phase B HMAC Standardization - Routes now use shared middleware
 *
 * Endpoints:
 * - GET /internal/users/:userId/files - Get user's files (GDPR)
 * - GET /internal/files/:fileId - Get file metadata
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { internalAuthMiddleware } from '../middleware/internal-auth.middleware';

const log = logger.child({ component: 'InternalRoutes' });

export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply standardized HMAC authentication to all routes
  fastify.addHook('preHandler', internalAuthMiddleware);

  /**
   * GET /internal/users/:userId/files
   * Get all files for a user (GDPR data export)
   * Used by: compliance-service (for GDPR requests)
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { limit?: number; offset?: number; includeDeleted?: boolean };
  }>('/users/:userId/files', async (request, reply) => {
    const { userId } = request.params;
    const { limit = 100, offset = 0, includeDeleted = false } = request.query;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!userId) {
      return reply.status(400).send({ error: 'User ID required' });
    }

    try {
      // Build query based on includeDeleted flag (for GDPR compliance)
      let query = db('files')
        .where('user_id', userId)
        .select(
          'id',
          'user_id',
          'tenant_id',
          'file_name',
          'original_name',
          'mime_type',
          'size_bytes',
          'storage_key',
          'storage_provider',
          'status',
          'metadata',
          'created_at',
          'updated_at',
          'deleted_at'
        )
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset);

      if (!includeDeleted) {
        query = query.whereNull('deleted_at');
      }

      const files = await query;

      // Get total count
      let countQuery = db('files')
        .where('user_id', userId)
        .count('* as total')
        .first();

      if (!includeDeleted) {
        countQuery = countQuery.whereNull('deleted_at');
      }

      const countResult = await countQuery;
      const total = parseInt((countResult as any)?.total || '0');

      log.info({
        userId,
        fileCount: files.length,
        total,
        callingService,
        traceId,
      }, 'Internal user files lookup (GDPR)');

      return reply.send({
        userId,
        files: files.map(f => ({
          id: f.id,
          tenantId: f.tenant_id,
          fileName: f.file_name,
          originalName: f.original_name,
          mimeType: f.mime_type,
          sizeBytes: f.size_bytes,
          storageKey: f.storage_key,
          storageProvider: f.storage_provider,
          status: f.status,
          metadata: f.metadata,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
          deletedAt: f.deleted_at,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + files.length < total,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, userId, traceId }, 'Failed to get user files');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/files/:fileId
   * Get file metadata by ID
   * Used by: ticket-service, notification-service
   */
  fastify.get<{ Params: { fileId: string } }>('/files/:fileId', async (request, reply) => {
    const { fileId } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!fileId) {
      return reply.status(400).send({ error: 'File ID required' });
    }

    try {
      const file = await db('files')
        .where('id', fileId)
        .whereNull('deleted_at')
        .select(
          'id',
          'user_id',
          'tenant_id',
          'file_name',
          'original_name',
          'mime_type',
          'size_bytes',
          'storage_key',
          'storage_provider',
          'status',
          'metadata',
          'created_at',
          'updated_at'
        )
        .first();

      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }

      log.info({
        fileId,
        fileName: file.file_name,
        callingService,
        traceId,
      }, 'Internal file lookup');

      return reply.send({
        file: {
          id: file.id,
          userId: file.user_id,
          tenantId: file.tenant_id,
          fileName: file.file_name,
          originalName: file.original_name,
          mimeType: file.mime_type,
          sizeBytes: file.size_bytes,
          storageKey: file.storage_key,
          storageProvider: file.storage_provider,
          status: file.status,
          metadata: file.metadata,
          createdAt: file.created_at,
          updatedAt: file.updated_at,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, fileId, traceId }, 'Failed to get file');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}

export default internalRoutes;
