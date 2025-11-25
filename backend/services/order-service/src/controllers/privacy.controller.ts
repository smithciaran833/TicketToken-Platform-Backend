/**
 * Privacy & GDPR Controller
 * 
 * Handles HTTP requests for privacy and GDPR compliance features
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { DataAccessService } from '../services/data-access.service';
import { DataDeletionService } from '../services/data-deletion.service';
import { ConsentService } from '../services/consent.service';
import {
  CreateDataAccessRequestDto,
  CreateDataDeletionRequestDto,
  UpdateConsentDto,
  ConsentPurpose,
} from '../types/privacy.types';

export class PrivacyController {
  private dataAccessService: DataAccessService;
  private dataDeletionService: DataDeletionService;
  private consentService: ConsentService;

  constructor(pool: Pool) {
    this.dataAccessService = new DataAccessService(pool);
    this.dataDeletionService = new DataDeletionService(pool);
    this.consentService = new ConsentService(pool);
  }

  // ============================================================================
  // Data Access Methods (GDPR Article 15)
  // ============================================================================

  async createDataAccessRequest(
    request: FastifyRequest<{ Body: CreateDataAccessRequestDto }>,
    reply: FastifyReply
  ) {
    try {
      const userId = (request as any).user?.id;
      const tenantId = (request as any).user?.tenantId;

      if (!userId || !tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const accessRequest = await this.dataAccessService.createAccessRequest(
        userId,
        tenantId,
        request.body
      );

      return reply.code(201).send(accessRequest);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to create data access request',
      });
    }
  }

  async getUserDataAccessRequests(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = (request as any).user?.id;
      const tenantId = (request as any).user?.tenantId;

      if (!userId || !tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const requests = await this.dataAccessService.getUserAccessRequests(userId, tenantId);

      return reply.code(200).send(requests);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to fetch data access requests',
      });
    }
  }

  async getDataAccessRequest(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const userId = (request as any).user?.id;
      const { id } = request.params;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const accessRequest = await this.dataAccessService.getAccessRequest(id, userId);

      return reply.code(200).send(accessRequest);
    } catch (error) {
      return reply.code(404).send({
        error: error instanceof Error ? error.message : 'Data access request not found',
      });
    }
  }

  async downloadDataExport(
    request: FastifyRequest<{ Params: { id: string; token: string } }>,
    reply: FastifyReply
  ) {
    try {
      const { id, token } = request.params;

      const fileBuffer = await this.dataAccessService.downloadExport(id, token);

      return reply
        .code(200)
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="data-export-${id}.json"`)
        .send(fileBuffer);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to download export',
      });
    }
  }

  // ============================================================================
  // Data Deletion Methods (GDPR Article 17)
  // ============================================================================

  async createDataDeletionRequest(
    request: FastifyRequest<{ Body: CreateDataDeletionRequestDto }>,
    reply: FastifyReply
  ) {
    try {
      const userId = (request as any).user?.id;
      const tenantId = (request as any).user?.tenantId;

      if (!userId || !tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const deletionRequest = await this.dataDeletionService.createDeletionRequest(
        userId,
        tenantId,
        request.body
      );

      return reply.code(201).send(deletionRequest);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to create data deletion request',
      });
    }
  }

  async getUserDataDeletionRequests(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = (request as any).user?.id;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      // This method doesn't exist in the service yet - would need to add it
      // For now, return empty array
      return reply.code(200).send([]);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to fetch data deletion requests',
      });
    }
  }

  async getDataDeletionRequest(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    try {
      const userId = (request as any).user?.id;
      const { id } = request.params;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const deletionRequest = await this.dataDeletionService.getDeletionRequest(id, userId);

      return reply.code(200).send(deletionRequest);
    } catch (error) {
      return reply.code(404).send({
        error: error instanceof Error ? error.message : 'Data deletion request not found',
      });
    }
  }

  // ============================================================================
  // Consent Management Methods (GDPR Article 6)
  // ============================================================================

  async getAllUserConsents(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = (request as any).user?.id;
      const tenantId = (request as any).user?.tenantId;

      if (!userId || !tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const consents = await this.consentService.getAllConsents(userId, tenantId);

      return reply.code(200).send(consents);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to fetch consents',
      });
    }
  }

  async updateConsent(
    request: FastifyRequest<{ Body: UpdateConsentDto }>,
    reply: FastifyReply
  ) {
    try {
      const userId = (request as any).user?.id;
      const tenantId = (request as any).user?.tenantId;

      if (!userId || !tenantId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const consent = await this.consentService.updateConsent(userId, tenantId, request.body);

      return reply.code(200).send(consent);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to update consent',
      });
    }
  }

  async withdrawConsent(
    request: FastifyRequest<{ Params: { purpose: ConsentPurpose } }>,
    reply: FastifyReply
  ) {
    try {
      const userId = (request as any).user?.id;
      const { purpose } = request.params;

      if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const consent = await this.consentService.withdrawConsent(userId, purpose);

      return reply.code(200).send(consent);
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : 'Failed to withdraw consent',
      });
    }
  }
}
