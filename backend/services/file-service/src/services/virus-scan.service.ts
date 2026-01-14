import NodeClam from 'clamscan';
import { logger } from '../utils/logger';
import { db } from '../config/database';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ScanResult {
  isInfected: boolean;
  viruses: string[];
  scanTime: number;
}

interface ScanOptions {
  fileId: string;
  filePath: string;
  fileName: string;
  uploadedBy: string;
}

export class VirusScanService {
  private clamScan: NodeClam | null = null;
  private initialized: boolean = false;
  private scanEnabled: boolean;

  constructor() {
    this.scanEnabled = process.env.ENABLE_VIRUS_SCAN === 'true';
  }

  /**
   * Initialize ClamAV scanner
   */
  async initialize(): Promise<void> {
    if (!this.scanEnabled) {
      logger.info('Virus scanning is disabled');
      return;
    }

    try {
      const clamHost = process.env.CLAMAV_HOST || 'localhost';
      const clamPort = parseInt(process.env.CLAMAV_PORT || '3310');

      this.clamScan = await new NodeClam().init({
        clamdscan: {
          host: clamHost,
          port: clamPort,
          timeout: 60000,
          multiscan: true,
          reloadDb: false,
          active: true,
          bypassTest: false
        },
        preference: 'clamdscan'
      });

      this.initialized = true;
      logger.info(`ClamAV initialized successfully (${clamHost}:${clamPort})`);
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to initialize ClamAV');
      // Don't throw - allow service to start without virus scanning
      this.initialized = false;
    }
  }

  /**
   * Scan a file for viruses
   */
  async scanFile(options: ScanOptions): Promise<ScanResult> {
    const startTime = Date.now();
    
    if (!this.scanEnabled || !this.initialized || !this.clamScan) {
      logger.debug(`Virus scanning skipped for file ${options.fileId}`);
      return {
        isInfected: false,
        viruses: [],
        scanTime: 0
      };
    }

    try {
      logger.info(`Starting virus scan for file ${options.fileId}: ${options.fileName}`);

      // Check if file exists
      try {
        await fs.access(options.filePath);
      } catch {
        throw new Error(`File not found: ${options.filePath}`);
      }

      // Perform scan
      const result = await this.clamScan.scanFile(options.filePath);
      const scanTime = Date.now() - startTime;

      const scanResult: ScanResult = {
        isInfected: result.isInfected,
        viruses: result.viruses || [],
        scanTime
      };

      // Log scan results
      await this.logScanResult(options, scanResult);

      if (scanResult.isInfected) {
        logger.warn({
          fileId: options.fileId,
          fileName: options.fileName,
          viruses: scanResult.viruses,
          uploadedBy: options.uploadedBy
        }, 'INFECTED FILE DETECTED');

        // Quarantine the infected file
        await this.quarantineFile(options);
      } else {
        logger.info(`File ${options.fileId} is clean (${scanTime}ms)`);
      }

      return scanResult;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId: options.fileId }, 'Virus scan failed');
      
      // Log failed scan attempt
      await this.logScanResult(options, {
        isInfected: false,
        viruses: [],
        scanTime: Date.now() - startTime
      }, 'failed', error instanceof Error ? error.message : 'Unknown error');

      throw error;
    }
  }

  /**
   * Log scan result to database
   */
  private async logScanResult(
    options: ScanOptions,
    result: ScanResult,
    status: 'clean' | 'infected' | 'failed' = 'clean',
    errorMessage?: string
  ): Promise<void> {
    try {
      if (result.isInfected) {
        status = 'infected';
      }

      await db('av_scans').insert({
        file_id: options.fileId,
        scan_engine: 'clamav',
        scan_result: status,
        threats_found: result.viruses.length > 0 ? result.viruses.join(', ') : null,
        scan_duration_ms: result.scanTime,
        error_message: errorMessage || null,
        scanned_at: db.fn.now()
      });

      logger.debug(`Scan result logged for file ${options.fileId}`);
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to log scan result');
      // Don't throw - this is not critical
    }
  }

  /**
   * Quarantine an infected file
   */
  private async quarantineFile(options: ScanOptions): Promise<void> {
    try {
      const quarantinePath = process.env.QUARANTINE_PATH || '/var/quarantine';
      const quarantineFileName = `${options.fileId}_${Date.now()}_${options.fileName}`;
      const quarantineFullPath = path.join(quarantinePath, quarantineFileName);

      // Ensure quarantine directory exists
      await fs.mkdir(quarantinePath, { recursive: true });

      // Move file to quarantine
      await fs.rename(options.filePath, quarantineFullPath);
      logger.info(`File quarantined: ${quarantineFullPath}`);

      // Log quarantine action
      await db('quarantined_files').insert({
        file_id: options.fileId,
        original_path: options.filePath,
        quarantine_path: quarantineFullPath,
        reason: 'virus_detected',
        quarantined_by: 'system',
        quarantined_at: db.fn.now()
      });

      // Update file record to mark as infected
      await db('files')
        .where({ id: options.fileId })
        .update({
          status: 'quarantined',
          updated_at: db.fn.now()
        });

    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to quarantine file');
      throw new Error(`Failed to quarantine infected file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get scan history for a file
   */
  async getScanHistory(fileId: string) {
    try {
      const scans = await db('av_scans')
        .where({ file_id: fileId })
        .orderBy('scanned_at', 'desc')
        .select('*');

      return scans;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to get scan history');
      return [];
    }
  }

  /**
   * Get latest scan result for a file
   */
  async getLatestScan(fileId: string) {
    try {
      const scan = await db('av_scans')
        .where({ file_id: fileId })
        .orderBy('scanned_at', 'desc')
        .first();

      return scan || null;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to get latest scan');
      return null;
    }
  }

  /**
   * Check if a file needs scanning
   */
  async needsScan(fileId: string): Promise<boolean> {
    if (!this.scanEnabled) {
      return false;
    }

    try {
      const latestScan = await this.getLatestScan(fileId);
      
      // No scan exists
      if (!latestScan) {
        return true;
      }

      // Previous scan failed
      if (latestScan.scan_result === 'failed') {
        return true;
      }

      // File is already infected
      if (latestScan.scan_result === 'infected') {
        return false;
      }

      // Rescan after 7 days
      const scanAge = Date.now() - new Date(latestScan.scanned_at).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      return scanAge > sevenDays;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to check if file needs scan');
      return true; // Default to scanning if check fails
    }
  }

  /**
   * Get quarantined files
   */
  async getQuarantinedFiles(limit = 100, offset = 0) {
    try {
      const files = await db('quarantined_files')
        .orderBy('quarantined_at', 'desc')
        .limit(limit)
        .offset(offset)
        .select('*');

      return files;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to get quarantined files');
      return [];
    }
  }

  /**
   * Delete a quarantined file permanently
   */
  async deleteQuarantinedFile(fileId: string, deletedBy: string): Promise<boolean> {
    try {
      const quarantined = await db('quarantined_files')
        .where({ file_id: fileId })
        .first();

      if (!quarantined) {
        return false;
      }

      // Delete the physical file
      try {
        await fs.unlink(quarantined.quarantine_path);
        logger.info(`Deleted quarantined file: ${quarantined.quarantine_path}`);
      } catch (error) {
        logger.warn({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to delete quarantined file physically');
      }

      // Mark as deleted in database
      await db('quarantined_files')
        .where({ file_id: fileId })
        .update({
          deleted_at: db.fn.now(),
          deleted_by: deletedBy
        });

      return true;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to delete quarantined file');
      return false;
    }
  }

  /**
   * Check ClamAV health status
   */
  async getHealth(): Promise<{ healthy: boolean; version?: string; error?: string }> {
    if (!this.scanEnabled) {
      return { healthy: false, error: 'Virus scanning disabled' };
    }

    if (!this.initialized || !this.clamScan) {
      return { healthy: false, error: 'ClamAV not initialized' };
    }

    try {
      const version = await this.clamScan.getVersion();
      return { healthy: true, version };
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const virusScanService = new VirusScanService();
