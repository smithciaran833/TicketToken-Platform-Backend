import { logger } from '../utils/logger';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError, NotFoundError } from '../utils/errors';

class DisputeServiceClass {
  async createDispute(
    transferId: string,
    listingId: string,
    initiatorId: string,
    reason: string,
    description?: string,
    evidence?: any
  ) {
    try {
      const transfer = await db('marketplace_transfers')
        .where('id', transferId)
        .first();
      
      if (!transfer) {
        throw new NotFoundError('Transfer not found');
      }
      
      const respondentId = initiatorId === transfer.buyer_id 
        ? transfer.seller_id 
        : transfer.buyer_id;
      
      const dispute = {
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
      
      await db('marketplace_disputes').insert(dispute);
      
      if (evidence) {
        await this.addEvidence(dispute.id, initiatorId, 'text', JSON.stringify(evidence));
      }
      
      logger.info(`Dispute created: ${dispute.id}`);
      return dispute;
    } catch (error) {
      logger.error('Error creating dispute:', error);
      throw error;
    }
  }
  
  async addEvidence(disputeId: string, userId: string, type: string, content: string, metadata?: any) {
    try {
      await db('dispute_evidence').insert({
        id: uuidv4(),
        dispute_id: disputeId,
        submitted_by: userId,
        evidence_type: type,
        content,
        metadata: metadata ? JSON.stringify(metadata) : null,
        submitted_at: new Date()
      });
    } catch (error) {
      logger.error('Error adding evidence:', error);
      throw error;
    }
  }
  
  async getDispute(disputeId: string) {
    try {
      return await db('marketplace_disputes')
        .where('id', disputeId)
        .first();
    } catch (error) {
      logger.error('Error getting dispute:', error);
      return null;
    }
  }
  
  async getUserDisputes(userId: string) {
    try {
      return await db('marketplace_disputes')
        .where(function() {
          this.where('initiator_id', userId)
            .orWhere('respondent_id', userId);
        })
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error getting user disputes:', error);
      return [];
    }
  }
}

export const disputeService = new DisputeServiceClass();
