import { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { getDatabase } from '../config/database';
import { OrderSearchService } from '../services/order-search.service';
import { AdminOverrideService } from '../services/admin-override.service';
import { OrderNotesService } from '../services/order-notes.service';
import { CustomerInteractionService } from '../services/customer-interaction.service';
import { FraudDetectionService } from '../services/fraud-detection.service';
import { AdminRole } from '../types/admin.types';

export class AdminController {
  private pool: Pool;
  private searchService: OrderSearchService;
  private overrideService: AdminOverrideService;
  private notesService: OrderNotesService;
  private interactionService: CustomerInteractionService;
  private fraudService: FraudDetectionService;

  constructor() {
    this.pool = getDatabase();
    this.searchService = new OrderSearchService(this.pool);
    this.overrideService = new AdminOverrideService(this.pool);
    this.notesService = new OrderNotesService(this.pool);
    this.interactionService = new CustomerInteractionService(this.pool);
    this.fraudService = new FraudDetectionService(this.pool);
  }

  async searchOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const adminUserId = (request as any).user.id;
      const filters = request.body as any;

      const result = await this.searchService.searchOrders(
        tenantId,
        filters,
        filters.page,
        filters.pageSize
      );

      if (filters.query) {
        await this.searchService.recordSearchHistory(
          tenantId,
          adminUserId,
          filters.query,
          filters,
          result.total
        );
      }

      reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Search orders error');
      reply.status(500).send({ error: 'Failed to search orders' });
    }
  }

  async saveSearch(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const adminUserId = (request as any).user.id;
      const { name, filters, isDefault } = request.body as any;

      const savedSearch = await this.searchService.saveSearch(
        tenantId,
        adminUserId,
        name,
        filters,
        isDefault
      );

      reply.status(201).send(savedSearch);
    } catch (error) {
      request.log.error({ err: error }, 'Save search error');
      reply.status(500).send({ error: 'Failed to save search' });
    }
  }

  async getSavedSearches(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const adminUserId = (request as any).user.id;

      const searches = await this.searchService.getSavedSearches(tenantId, adminUserId);
      reply.send(searches);
    } catch (error) {
      request.log.error({ err: error }, 'Get saved searches error');
      reply.status(500).send({ error: 'Failed to get saved searches' });
    }
  }

  async deleteSavedSearch(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const adminUserId = (request as any).user.id;
      const { id } = request.params;

      await this.searchService.deleteSavedSearch(id, tenantId, adminUserId);
      reply.status(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Delete saved search error');
      reply.status(500).send({ error: 'Failed to delete saved search' });
    }
  }

  async getSearchHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const adminUserId = (request as any).user.id;
      const query = request.query as any;
      const limit = parseInt(query.limit as string) || 10;

      const history = await this.searchService.getSearchHistory(tenantId, adminUserId, limit);
      reply.send(history);
    } catch (error) {
      request.log.error({ err: error }, 'Get search history error');
      reply.status(500).send({ error: 'Failed to get search history' });
    }
  }

  async createOverride(request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const adminUserId = (request as any).user.id;
      const adminRole = (request as any).user.role as AdminRole;
      const { orderId } = request.params;
      const { overrideType, originalValue, newValue, reason, metadata } = request.body as any;

      const override = await this.overrideService.createOverride(
        tenantId,
        orderId,
        adminUserId,
        adminRole,
        overrideType,
        originalValue,
        newValue,
        reason,
        metadata
      );

      reply.status(201).send(override);
    } catch (error: any) {
      request.log.error({ err: error }, 'Create override error');
      reply.status(500).send({ error: error.message || 'Failed to create override' });
    }
  }

  async getOrderOverrides(request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const { orderId } = request.params;

      const overrides = await this.overrideService.getOrderOverrides(orderId, tenantId);
      reply.send(overrides);
    } catch (error) {
      request.log.error({ err: error }, 'Get order overrides error');
      reply.status(500).send({ error: 'Failed to get order overrides' });
    }
  }

  async approveOverride(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const approvingUserId = (request as any).user.id;
      const approvingUserRole = (request as any).user.role as AdminRole;
      const { id } = request.params;

      const override = await this.overrideService.approveOverride(
        id,
        tenantId,
        approvingUserId,
        approvingUserRole
      );

      reply.send(override);
    } catch (error: any) {
      request.log.error({ err: error }, 'Approve override error');
      reply.status(500).send({ error: error.message || 'Failed to approve override' });
    }
  }

  async rejectOverride(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const rejectingUserId = (request as any).user.id;
      const rejectingUserRole = (request as any).user.role as AdminRole;
      const { id } = request.params;
      const { rejectionReason } = request.body as any;

      const override = await this.overrideService.rejectOverride(
        id,
        tenantId,
        rejectingUserId,
        rejectingUserRole,
        rejectionReason
      );

      reply.send(override);
    } catch (error: any) {
      request.log.error({ err: error }, 'Reject override error');
      reply.status(500).send({ error: error.message || 'Failed to reject override' });
    }
  }

  async getPendingApprovals(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const overrides = await this.overrideService.getPendingApprovals(tenantId);
      reply.send(overrides);
    } catch (error) {
      request.log.error({ err: error }, 'Get pending approvals error');
      reply.status(500).send({ error: 'Failed to get pending approvals' });
    }
  }

  async createNote(request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const adminUserId = (request as any).user.id;
      const { orderId } = request.params;
      const { noteType, content, isInternal, isFlagged, tags, attachments, mentionedUsers } = request.body as any;

      const note = await this.notesService.createNote(
        tenantId,
        orderId,
        adminUserId,
        noteType,
        content,
        { isInternal, isFlagged, tags, attachments, mentionedUsers }
      );

      reply.status(201).send(note);
    } catch (error) {
      request.log.error({ err: error }, 'Create note error');
      reply.status(500).send({ error: 'Failed to create note' });
    }
  }

  async getOrderNotes(request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const { orderId } = request.params;
      const query = request.query as any;
      const includeInternal = query.includeInternal !== 'false';

      const notes = await this.notesService.getOrderNotes(orderId, tenantId, includeInternal);
      reply.send(notes);
    } catch (error) {
      request.log.error({ err: error }, 'Get order notes error');
      reply.status(500).send({ error: 'Failed to get order notes' });
    }
  }

  async updateNote(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const { id } = request.params;

      const note = await this.notesService.updateNote(id, tenantId, request.body as any);
      reply.send(note);
    } catch (error) {
      request.log.error({ err: error }, 'Update note error');
      reply.status(500).send({ error: 'Failed to update note' });
    }
  }

  async deleteNote(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const { id } = request.params;

      await this.notesService.deleteNote(id, tenantId);
      reply.status(204).send();
    } catch (error) {
      request.log.error({ err: error }, 'Delete note error');
      reply.status(500).send({ error: 'Failed to delete note' });
    }
  }

  async getFlaggedNotes(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const query = request.query as any;
      const limit = parseInt(query.limit as string) || 50;

      const notes = await this.notesService.getFlaggedNotes(tenantId, limit);
      reply.send(notes);
    } catch (error) {
      request.log.error({ err: error }, 'Get flagged notes error');
      reply.status(500).send({ error: 'Failed to get flagged notes' });
    }
  }

  async createNoteTemplate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const createdBy = (request as any).user.id;
      const { name, noteType, contentTemplate } = request.body as any;

      const template = await this.notesService.createTemplate(
        tenantId,
        name,
        noteType,
        contentTemplate,
        createdBy
      );

      reply.status(201).send(template);
    } catch (error) {
      request.log.error({ err: error }, 'Create note template error');
      reply.status(500).send({ error: 'Failed to create note template' });
    }
  }

  async getNoteTemplates(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const query = request.query as any;
      const noteType = query.noteType as string;

      const templates = await this.notesService.getTemplates(tenantId, noteType as any);
      reply.send(templates);
    } catch (error) {
      request.log.error({ err: error }, 'Get note templates error');
      reply.status(500).send({ error: 'Failed to get note templates' });
    }
  }

  async recordInteraction(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const adminUserId = (request as any).user.id;
      const { userId, interactionType, channel, summary, ...options } = request.body as any;

      const interaction = await this.interactionService.recordInteraction(
        tenantId,
        userId,
        adminUserId,
        interactionType,
        channel,
        summary,
        options
      );

      reply.status(201).send(interaction);
    } catch (error) {
      request.log.error({ err: error }, 'Record interaction error');
      reply.status(500).send({ error: 'Failed to record interaction' });
    }
  }

  async getUserInteractions(request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const { userId } = request.params;
      const query = request.query as any;
      const limit = parseInt(query.limit as string) || 50;

      const interactions = await this.interactionService.getUserInteractions(userId, tenantId, limit);
      reply.send(interactions);
    } catch (error) {
      request.log.error({ err: error }, 'Get user interactions error');
      reply.status(500).send({ error: 'Failed to get user interactions' });
    }
  }

  async getOrderInteractions(request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const { orderId } = request.params;

      const interactions = await this.interactionService.getOrderInteractions(orderId, tenantId);
      reply.send(interactions);
    } catch (error) {
      request.log.error({ err: error }, 'Get order interactions error');
      reply.status(500).send({ error: 'Failed to get order interactions' });
    }
  }

  async getUnresolvedInteractions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const query = request.query as any;
      const limit = parseInt(query.limit as string) || 50;

      const interactions = await this.interactionService.getUnresolvedInteractions(tenantId, limit);
      reply.send(interactions);
    } catch (error) {
      request.log.error({ err: error }, 'Get unresolved interactions error');
      reply.status(500).send({ error: 'Failed to get unresolved interactions' });
    }
  }

  async updateInteraction(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const { id } = request.params;

      const interaction = await this.interactionService.updateInteraction(id, tenantId, request.body as any);
      reply.send(interaction);
    } catch (error) {
      request.log.error({ err: error }, 'Update interaction error');
      reply.status(500).send({ error: 'Failed to update interaction' });
    }
  }

  async getInteractionStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const query = request.query as any;
      const dateFrom = query.dateFrom ? new Date(query.dateFrom as string) : undefined;
      const dateTo = query.dateTo ? new Date(query.dateTo as string) : undefined;

      const stats = await this.interactionService.getInteractionStats(tenantId, dateFrom, dateTo);
      reply.send(stats);
    } catch (error) {
      request.log.error({ err: error }, 'Get interaction stats error');
      reply.status(500).send({ error: 'Failed to get interaction stats' });
    }
  }

  async getFraudScore(request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const { orderId } = request.params;

      const fraudScore = await this.fraudService.getFraudScore(orderId, tenantId);
      if (!fraudScore) {
        reply.status(404).send({ error: 'Fraud score not found' });
        return;
      }

      reply.send(fraudScore);
    } catch (error) {
      request.log.error({ err: error }, 'Get fraud score error');
      reply.status(500).send({ error: 'Failed to get fraud score' });
    }
  }

  async getHighRiskOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const query = request.query as any;
      const limit = parseInt(query.limit as string) || 50;

      const fraudScores = await this.fraudService.getHighRiskOrders(tenantId, limit);
      reply.send(fraudScores);
    } catch (error) {
      request.log.error({ err: error }, 'Get high risk orders error');
      reply.status(500).send({ error: 'Failed to get high risk orders' });
    }
  }

  async reviewFraudScore(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const reviewedBy = (request as any).user.id;
      const { id } = request.params;
      const { resolution, notes } = request.body as any;

      const fraudScore = await this.fraudService.reviewFraudScore(
        id,
        tenantId,
        reviewedBy,
        resolution,
        notes
      );

      reply.send(fraudScore);
    } catch (error) {
      request.log.error({ err: error }, 'Review fraud score error');
      reply.status(500).send({ error: 'Failed to review fraud score' });
    }
  }

  async blockEntity(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const blockedBy = (request as any).user.id;
      const { entityType, entityValue, blockReason, isPermanent, blockedUntil } = request.body as any;

      const blockedEntity = await this.fraudService.blockEntity(
        tenantId,
        entityType,
        entityValue,
        blockReason,
        blockedBy,
        { isPermanent, blockedUntil: blockedUntil ? new Date(blockedUntil) : undefined }
      );

      reply.status(201).send(blockedEntity);
    } catch (error) {
      request.log.error({ err: error }, 'Block entity error');
      reply.status(500).send({ error: 'Failed to block entity' });
    }
  }

  async createFraudRule(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (request as any).user.tenantId;
      const createdBy = (request as any).user.id;
      const { name, ruleType, conditions, scoreImpact, priority } = request.body as any;

      const result = await this.pool.query(
        `INSERT INTO fraud_rules (tenant_id, name, rule_type, conditions, score_impact, priority, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [tenantId, name, ruleType, JSON.stringify(conditions), scoreImpact, priority || 0, createdBy]
      );

      reply.status(201).send(result.rows[0]);
    } catch (error) {
      request.log.error({ err: error }, 'Create fraud rule error');
      reply.status(500).send({ error: 'Failed to create fraud rule' });
    }
  }
}
