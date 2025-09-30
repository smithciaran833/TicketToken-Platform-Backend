import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface BlacklistEntry {
  id: string;
  user_id?: string;
  wallet_address?: string;
  reason: string;
  banned_by: string;
  banned_at: Date;
  expires_at?: Date;
  is_active: boolean;
}

export class BlacklistModel {
  private readonly tableName = 'marketplace_blacklist';
  
  async addToBlacklist(
    identifier: { user_id?: string; wallet_address?: string },
    reason: string,
    bannedBy: string,
    duration?: number // Duration in days
  ): Promise<BlacklistEntry> {
    try {
      const entry: Partial<BlacklistEntry> = {
        id: uuidv4(),
        ...identifier,
        reason,
        banned_by: bannedBy,
        banned_at: new Date(),
        is_active: true
      };
      
      if (duration) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + duration);
        entry.expires_at = expiresAt;
      }
      
      await db(this.tableName).insert(entry);
      
      logger.info(`Added to blacklist: ${JSON.stringify(identifier)}`);
      return entry as BlacklistEntry;
    } catch (error) {
      logger.error('Error adding to blacklist:', error);
      throw error;
    }
  }
  
  async removeFromBlacklist(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<void> {
    try {
      const query = db(this.tableName).where('is_active', true);
      
      if (identifier.user_id) {
        query.where('user_id', identifier.user_id);
      }
      if (identifier.wallet_address) {
        query.where('wallet_address', identifier.wallet_address);
      }
      
      await query.update({ is_active: false });
      
      logger.info(`Removed from blacklist: ${JSON.stringify(identifier)}`);
    } catch (error) {
      logger.error('Error removing from blacklist:', error);
      throw error;
    }
  }
  
  async isBlacklisted(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<boolean> {
    try {
      const query = db(this.tableName)
        .where('is_active', true)
        .where(function() {
          if (identifier.user_id) {
            this.orWhere('user_id', identifier.user_id);
          }
          if (identifier.wallet_address) {
            this.orWhere('wallet_address', identifier.wallet_address);
          }
        });
      
      const entries = await query.select('*');
      
      // Check for expired entries and deactivate them
      const now = new Date();
      for (const entry of entries) {
        if (entry.expires_at && new Date(entry.expires_at) < now) {
          await db(this.tableName)
            .where('id', entry.id)
            .update({ is_active: false });
          continue;
        }
        return true; // Found active, non-expired entry
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking blacklist:', error);
      return false;
    }
  }
  
  async getBlacklistHistory(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<BlacklistEntry[]> {
    try {
      const query = db(this.tableName);
      
      if (identifier.user_id) {
        query.where('user_id', identifier.user_id);
      }
      if (identifier.wallet_address) {
        query.where('wallet_address', identifier.wallet_address);
      }
      
      return await query.orderBy('banned_at', 'desc').select('*');
    } catch (error) {
      logger.error('Error getting blacklist history:', error);
      return [];
    }
  }
}

export const blacklistModel = new BlacklistModel();
