/**
 * Privacy & GDPR Routes
 * 
 * API endpoints for GDPR compliance features:
 * - Right to Access (Article 15)
 * - Right to Deletion (Article 17)
 * - Consent Management (Article 6)
 */

import { FastifyInstance } from 'fastify';
import { PrivacyController } from '../controllers/privacy.controller';
import { getDatabase } from '../config/database';
import { authenticate } from '../middleware';
import { validate } from '../middleware/validation.middleware';
import * as schemas from '../validators/privacy.schemas';

export default async function privacyRoutes(fastify: FastifyInstance) {
  const pool = getDatabase();
  const controller = new PrivacyController(pool);

  // ============================================================================
  // Data Access Routes (GDPR Article 15 - Right to Access)
  // ============================================================================

  // Create data access request
  fastify.post('/data-access/request', {
    preHandler: [authenticate, validate({ body: schemas.createDataAccessRequestSchema })],
  }, async (request, reply) => controller.createDataAccessRequest(request, reply));

  // Get user's data access requests
  fastify.get('/data-access/requests', {
    preHandler: [authenticate, validate({ query: schemas.privacyQuerySchema })],
  }, async (request, reply) => controller.getUserDataAccessRequests(request, reply));

  // Get specific data access request
  fastify.get('/data-access/requests/:id', {
    preHandler: [authenticate, validate({ params: schemas.uuidParamSchema })],
  }, async (request, reply) => controller.getDataAccessRequest(request, reply));

  // Download export file
  fastify.get('/data-access/download/:id/:token', {
    preHandler: [],
  }, async (request, reply) => controller.downloadDataExport(request, reply));

  // ============================================================================
  // Data Deletion Routes (GDPR Article 17 - Right to Erasure)
  // ============================================================================

  // Create data deletion request
  fastify.post('/data-deletion/request', {
    preHandler: [authenticate, validate({ body: schemas.createDataDeletionRequestSchema })],
  }, async (request, reply) => controller.createDataDeletionRequest(request, reply));

  // Get user's data deletion requests
  fastify.get('/data-deletion/requests', {
    preHandler: [authenticate, validate({ query: schemas.privacyQuerySchema })],
  }, async (request, reply) => controller.getUserDataDeletionRequests(request, reply));

  // Get specific data deletion request
  fastify.get('/data-deletion/requests/:id', {
    preHandler: [authenticate, validate({ params: schemas.uuidParamSchema })],
  }, async (request, reply) => controller.getDataDeletionRequest(request, reply));

  // ============================================================================
  // Consent Management Routes (GDPR Article 6)
  // ============================================================================

  // Get all user consents
  fastify.get('/consent', {
    preHandler: [authenticate],
  }, async (request, reply) => controller.getAllUserConsents(request, reply));

  // Update consent
  fastify.put('/consent', {
    preHandler: [authenticate, validate({ body: schemas.updateConsentSchema })],
  }, async (request, reply) => controller.updateConsent(request, reply));

  // Withdraw consent
  fastify.delete('/consent/:purpose', {
    preHandler: [authenticate, validate({ params: schemas.getConsentSchema })],
  }, async (request, reply) => controller.withdrawConsent(request, reply));
}
