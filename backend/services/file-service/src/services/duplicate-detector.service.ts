import crypto from 'crypto';
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { cacheService, CachePrefix, CacheTTL } from './cache.service';

interface DuplicateFile {
  id: string;
  filename: string;
  hash: string;
  size: number;
  uploadedBy: string;
  createdAt: Date;
}

/**
 * Duplicate Detector Service
 * Identifies and manages duplicate files to save storage
 */
export class DuplicateDetectorService {
  
  /**
   * Calculate file hash (SHA-256)
   */
  async calculateFileHash(buffer: Buffer): Promise<string> {
    return crypto
      .createHash('sha256')
      .update(buffer)
      .digest('hex');
  }

  /**
   * Check if file already exists by hash
   */
  async findDuplicateByHash(hash: string): Promise<DuplicateFile | null> {
    try {
      // Check cache first
      const cached = await cacheService.get<DuplicateFile>(
        `file-hash:${hash}`,
        { prefix: CachePrefix.FILE }
      );

      if (cached) {
        logger.debug(`Found duplicate file in cache: ${hash}`);
        return cached;
      }

      // Check database
      const file = await db('files')
        .where({ hash_sha256: hash })
        .whereNull('deleted_at')
        .first();

      if (file) {
        const duplicate: DuplicateFile = {
          id: file.id,
          filename: file.filename,
          hash: file.hash_sha256,
          size: file.size_bytes,
          uploadedBy: file.uploaded_by,
          createdAt: file.created_at
        };

        // Cache the result
        await cacheService.set(
          `file-hash:${hash}`,
          duplicate,
          { ttl: CacheTTL.LONG, prefix: CachePrefix.FILE }
        );

        logger.info(`Found duplicate file: ${file.id} (hash: ${hash})`);
        return duplicate;
      }

      return null;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error finding duplicate file');
      return null;
    }
  }

  /**
   * Find all duplicates for a specific file
   */
  async findAllDuplicates(fileId: string): Promise<DuplicateFile[]> {
    try {
      // Get the file's hash
      const file = await db('files')
        .where({ id: fileId })
        .first();

      if (!file || !file.hash_sha256) {
        return [];
      }

      // Find all files with same hash
      const duplicates = await db('files')
        .where({ hash_sha256: file.hash_sha256 })
        .whereNot({ id: fileId })
        .whereNull('deleted_at')
        .select('id', 'filename', 'hash_sha256 as hash', 'size_bytes as size', 'uploaded_by', 'created_at');

      logger.info(`Found ${duplicates.length} duplicates for file ${fileId}`);
      return duplicates;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error finding all duplicates');
      return [];
    }
  }

  /**
   * Get duplicate statistics
   */
  async getDuplicateStats(): Promise<{
    totalDuplicates: number;
    wastedSpace: number;
    uniqueFiles: number;
    duplicateGroups: number;
  }> {
    try {
      // Find files with duplicate hashes
      const result = await db('files')
        .whereNull('deleted_at')
        .whereNotNull('hash_sha256')
        .select('hash_sha256')
        .count('* as count')
        .sum('size_bytes as total_size')
        .groupBy('hash_sha256')
        .having(db.raw('COUNT(*) > 1'));

      const stats = result as any[];
      
      let totalDuplicates = 0;
      let wastedSpace = 0;
      const duplicateGroups = stats.length;

      for (const group of stats) {
        const count = parseInt(group.count);
        const size = parseInt(group.total_size || '0');
        
        // Each duplicate after the first wastes space
        totalDuplicates += count - 1;
        wastedSpace += (count - 1) * (size / count);
      }

      const uniqueFiles = await db('files')
        .whereNull('deleted_at')
        .countDistinct('hash_sha256 as count')
        .first();

      return {
        totalDuplicates,
        wastedSpace: Math.round(wastedSpace),
        uniqueFiles: parseInt((uniqueFiles as any).count || '0'),
        duplicateGroups
      };
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error getting duplicate stats');
      return {
        totalDuplicates: 0,
        wastedSpace: 0,
        uniqueFiles: 0,
        duplicateGroups: 0
      };
    }
  }

  /**
   * Get list of duplicate file groups
   */
  async getDuplicateGroups(limit: number = 50): Promise<Array<{
    hash: string;
    count: number;
    totalSize: number;
    files: DuplicateFile[];
  }>> {
    try {
      // Find hashes with duplicates
      const hashes = await db('files')
        .whereNull('deleted_at')
        .whereNotNull('hash_sha256')
        .select('hash_sha256')
        .count('* as count')
        .sum('size_bytes as total_size')
        .groupBy('hash_sha256')
        .having(db.raw('COUNT(*) > 1'))
        .orderBy('count', 'desc')
        .limit(limit);

      const groups = [];

      for (const group of hashes as any[]) {
        const files = await db('files')
          .where({ hash_sha256: group.hash_sha256 })
          .whereNull('deleted_at')
          .select('id', 'filename', 'hash_sha256 as hash', 'size_bytes as size', 'uploaded_by', 'created_at')
          .orderBy('created_at', 'asc');

        groups.push({
          hash: group.hash_sha256,
          count: parseInt(group.count),
          totalSize: parseInt(group.total_size || '0'),
          files
        });
      }

      return groups;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error getting duplicate groups');
      return [];
    }
  }

  /**
   * Deduplicate files by keeping oldest and referencing others
   */
  async deduplicateGroup(hash: string): Promise<{
    kept: string;
    removed: string[];
    spaceSaved: number;
  }> {
    try {
      // Get all files with this hash
      const files = await db('files')
        .where({ hash_sha256: hash })
        .whereNull('deleted_at')
        .orderBy('created_at', 'asc');

      if (files.length <= 1) {
        return { kept: '', removed: [], spaceSaved: 0 };
      }

      // Keep the oldest file
      const originalFile = files[0];
      const duplicates = files.slice(1);

      // Update duplicates to reference the original
      const removedIds: string[] = [];
      let spaceSaved = 0;

      for (const duplicate of duplicates) {
        // Mark as deleted and reference original
        await db('files')
          .where({ id: duplicate.id })
          .update({
            deleted_at: db.fn.now(),
            status: 'deduplicated',
            metadata: db.raw(`
              COALESCE(metadata, '{}')::jsonb || 
              '{"deduplication": {"original_file_id": "${originalFile.id}", "deduplicated_at": "${new Date().toISOString()}"}}'::jsonb
            `)
          });

        removedIds.push(duplicate.id);
        spaceSaved += duplicate.size_bytes;
        
        logger.info(`Deduplicated file ${duplicate.id} -> ${originalFile.id}`);
      }

      // Clear cache
      await cacheService.delete(`file-hash:${hash}`, { prefix: CachePrefix.FILE });

      return {
        kept: originalFile.id,
        removed: removedIds,
        spaceSaved
      };
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error deduplicating group');
      throw error;
    }
  }

  /**
   * Batch deduplicate all files
   */
  async deduplicateAll(): Promise<{
    totalGroups: number;
    totalRemoved: number;
    totalSpaceSaved: number;
  }> {
    try {
      logger.info('Starting batch deduplication');

      const groups = await this.getDuplicateGroups(1000);
      
      let totalRemoved = 0;
      let totalSpaceSaved = 0;

      for (const group of groups) {
        try {
          const result = await this.deduplicateGroup(group.hash);
          totalRemoved += result.removed.length;
          totalSpaceSaved += result.spaceSaved;
        } catch (error) {
          logger.error({ err: error instanceof Error ? error : new Error(String(error)), hash: group.hash }, 'Failed to deduplicate group');
        }
      }

      logger.info(`Batch deduplication complete: removed ${totalRemoved} files, saved ${totalSpaceSaved} bytes`);

      return {
        totalGroups: groups.length,
        totalRemoved,
        totalSpaceSaved
      };
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error in batch deduplication');
      throw error;
    }
  }

  /**
   * Find similar images (perceptual hash comparison)
   */
  async findSimilarImages(fileId: string, threshold: number = 0.9): Promise<DuplicateFile[]> {
    // This would use perceptual hashing (like pHash) to find visually similar images
    // Implementation would require an image similarity library
    logger.debug(`Finding similar images to ${fileId} with threshold ${threshold}`);
    
    // Placeholder - in production would use actual perceptual hashing
    return [];
  }

  /**
   * Update file hash if missing
   */
  async updateFileHash(fileId: string, buffer: Buffer): Promise<void> {
    const hash = await this.calculateFileHash(buffer);
    
    await db('files')
      .where({ id: fileId })
      .update({ hash_sha256: hash });

    logger.info(`Updated hash for file ${fileId}: ${hash}`);
  }

  /**
   * Scan for files missing hashes
   */
  async scanForMissingHashes(): Promise<string[]> {
    const files = await db('files')
      .whereNull('hash_sha256')
      .whereNull('deleted_at')
      .select('id');

    const fileIds = files.map(f => f.id);
    logger.info(`Found ${fileIds.length} files missing hashes`);
    
    return fileIds;
  }
}

// Export singleton instance
export const duplicateDetectorService = new DuplicateDetectorService();
