import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { DisputeStatus } from '../types/common.types';

export interface Dispute {
  id: string;
  transfer_id: string;
  listing_id: string;
  initiator_id: string;
  respondent_id: string;
  reason: string;
  description?: string;
  status: DisputeStatus;
  resolution?: string;
  resolved_by?: string;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
}

export interface DisputeEvidence {
  id: string;
  dispute_id: string;
  submitted_by: string;
  evidence_type: 'text' | 'image' | 'document' | 'blockchain_tx';
  content: string;
  metadata?: Record<string, any>;
  submitted_at: Date;
}

export class DisputeModel {
  private readonly tableName = 'marketplace_disputes';
  private readonly evidenceTable = 'dispute_evidence';
  
  async createDispute(
    transferId: string,
    listingId: string,
    initiatorId: string,
    respondentId: string,
    reason: string,
    description?: string
  ): Promise<Dispute> {
    try {
      const dispute: Partial<Dispute> = {
        id: uuidv4(),
        transfer_id: transferId,
        listing_id: listingId,
        initiator_id: initiatorId,
        respondent_id: respondentId,
        reason,
        description,
        status: 'open',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      await db(this.tableName).insert(dispute);
      
      logger.info(`Dispute created: ${dispute.id}`);
      return dispute as Dispute;
    } catch (error) {
      logger.error('Error creating dispute:', error);
      throw error;
    }
  }
  
  async addEvidence(
    disputeId: string,
    submittedBy: string,
    evidenceType: 'text' | 'image' | 'document' | 'blockchain_tx',
    content: string,
    metadata?: Record<string, any>
  ): Promise<DisputeEvidence> {
    try {
      const evidence: Partial<DisputeEvidence> = {
        id: uuidv4(),
        dispute_id: disputeId,
        submitted_by: submittedBy,
        evidence_type: evidenceType,
        content,
        metadata,
        submitted_at: new Date()
      };
      
      await db(this.evidenceTable).insert({
        ...evidence,
        metadata: evidence.metadata ? JSON.stringify(evidence.metadata) : null
      });
      
      logger.info(`Evidence added to dispute ${disputeId}`);
      return evidence as DisputeEvidence;
    } catch (error) {
      logger.error('Error adding evidence:', error);
      throw error;
    }
  }
  
  async updateDisputeStatus(
    disputeId: string,
    status: DisputeStatus,
    resolution?: string,
    resolvedBy?: string
  ): Promise<void> {
    try {
      const updates: Partial<Dispute> = {
        status,
        updated_at: new Date()
      };
      
      if (status === 'resolved' || status === 'cancelled') {
        updates.resolution = resolution;
        updates.resolved_by = resolvedBy;
        updates.resolved_at = new Date();
      }
      
      await db(this.tableName)
        .where('id', disputeId)
        .update(updates);
      
      logger.info(`Dispute ${disputeId} updated to status: ${status}`);
    } catch (error) {
      logger.error('Error updating dispute status:', error);
      throw error;
    }
  }
  
  async getDispute(disputeId: string): Promise<Dispute | null> {
    try {
      const dispute = await db(this.tableName)
        .where('id', disputeId)
        .first();
      
      return dispute || null;
    } catch (error) {
      logger.error('Error getting dispute:', error);
      return null;
    }
  }
  
  async getDisputeEvidence(disputeId: string): Promise<DisputeEvidence[]> {
    try {
      const evidence = await db(this.evidenceTable)
        .where('dispute_id', disputeId)
        .orderBy('submitted_at', 'asc')
        .select('*');
      
      return evidence.map(e => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : undefined
      }));
    } catch (error) {
      logger.error('Error getting dispute evidence:', error);
      return [];
    }
  }
  
  async getActiveDisputes(userId?: string): Promise<Dispute[]> {
    try {
      const query = db(this.tableName)
        .whereIn('status', ['open', 'investigating']);
      
      if (userId) {
        query.where(function() {
          this.where('initiator_id', userId)
            .orWhere('respondent_id', userId);
        });
      }
      
      return await query.orderBy('created_at', 'desc').select('*');
    } catch (error) {
      logger.error('Error getting active disputes:', error);
      return [];
    }
  }
}

export const disputeModel = new DisputeModel();
