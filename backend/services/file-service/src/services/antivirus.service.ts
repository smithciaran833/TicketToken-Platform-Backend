import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const execAsync = promisify(exec);

interface ScanResult {
  clean: boolean;
  threats: string[];
  scannedAt: Date;
  scanEngine: string;
  fileHash: string;
}

export class AntivirusService {
  private quarantinePath: string;
  private tempPath: string;

  constructor() {
    this.quarantinePath = process.env.QUARANTINE_PATH || '/var/quarantine';
    this.tempPath = process.env.TEMP_PATH || '/tmp/av-scan';
    
    // Ensure directories exist
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [this.quarantinePath, this.tempPath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Scan file for viruses using ClamAV
   */
  async scanFile(filePath: string): Promise<ScanResult> {
    try {
      logger.info(`Starting AV scan for: ${filePath}`);

      // Calculate file hash for tracking
      const fileHash = await this.calculateFileHash(filePath);

      // Check if file was already scanned
      const existingScan = await this.checkExistingScan(fileHash);
      if (existingScan && existingScan.clean) {
        logger.info(`File already scanned and clean: ${fileHash}`);
        return existingScan;
      }

      // Run ClamAV scan
      const scanResult = await this.runClamAVScan(filePath);

      // Store scan result
      await this.storeScanResult(fileHash, scanResult);

      // If infected, quarantine the file
      if (!scanResult.clean) {
        await this.quarantineFile(filePath, fileHash, scanResult.threats);
      }

      return scanResult;
    } catch (error) {
      logger.error('AV scan failed:', error);
      throw new Error('Antivirus scan failed');
    }
  }

  /**
   * Run ClamAV scan on file
   */
  private async runClamAVScan(filePath: string): Promise<ScanResult> {
    try {
      // Use clamscan command
      const { stdout, stderr } = await execAsync(`clamscan --no-summary "${filePath}"`);
      
      const clean = !stdout.includes('FOUND');
      const threats: string[] = [];

      if (!clean) {
        // Parse threats from output
        const lines = stdout.split('\n');
        lines.forEach(line => {
          if (line.includes('FOUND')) {
            const threat = line.split(':')[1]?.replace('FOUND', '').trim();
            if (threat) threats.push(threat);
          }
        });
      }

      return {
        clean,
        threats,
        scannedAt: new Date(),
        scanEngine: 'ClamAV',
        fileHash: ''
      };
    } catch (error: any) {
      // If clamscan is not installed, use alternative or mock
      if (error.code === 127) {
        logger.warn('ClamAV not installed, using mock scanner');
        return this.mockScan(filePath);
      }
      throw error;
    }
  }

  /**
   * Mock scanner for development/testing
   */
  private async mockScan(filePath: string): Promise<ScanResult> {
    // Simulate virus detection for test files
    const fileName = path.basename(filePath);
    const isMalicious = fileName.includes('eicar') || fileName.includes('virus');

    return {
      clean: !isMalicious,
      threats: isMalicious ? ['Test.Virus.EICAR'] : [],
      scannedAt: new Date(),
      scanEngine: 'MockScanner',
      fileHash: await this.calculateFileHash(filePath)
    };
  }

  /**
   * Calculate SHA256 hash of file
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('error', reject);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Check if file was already scanned
   */
  private async checkExistingScan(fileHash: string): Promise<ScanResult | null> {
    try {
      const result = await db('av_scans')
        .where({ file_hash: fileHash, clean: true })
        .orderBy('scanned_at', 'desc')
        .first();

      if (result) {
        return {
          clean: result.clean,
          threats: result.threats || [],
          scannedAt: result.scanned_at,
          scanEngine: result.scan_engine,
          fileHash: result.file_hash
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to check existing scan:', error);
      return null;
    }
  }

  /**
   * Store scan result in database
   */
  private async storeScanResult(fileHash: string, result: ScanResult): Promise<void> {
    await db('av_scans').insert({
      file_hash: fileHash,
      clean: result.clean,
      threats: JSON.stringify(result.threats),
      scanned_at: result.scannedAt,
      scan_engine: result.scanEngine
    });
  }

  /**
   * Move infected file to quarantine
   */
  private async quarantineFile(
    filePath: string,
    fileHash: string,
    threats: string[]
  ): Promise<void> {
    const quarantinedPath = path.join(
      this.quarantinePath,
      `${fileHash}_${Date.now()}_infected`
    );

    // Move file to quarantine
    fs.renameSync(filePath, quarantinedPath);

    // Log quarantine action
    await db('quarantined_files').insert({
      original_path: filePath,
      quarantine_path: quarantinedPath,
      file_hash: fileHash,
      threats: JSON.stringify(threats),
      quarantined_at: new Date()
    });

    logger.warn(`File quarantined: ${filePath} -> ${quarantinedPath}`, { threats });
  }

  /**
   * Scan S3 file by downloading temporarily
   */
  async scanS3File(s3Url: string): Promise<ScanResult> {
    const tempFile = path.join(this.tempPath, `scan_${Date.now()}`);
    
    try {
      // Download file temporarily
      // Implementation depends on your S3 setup
      
      // Scan the file
      const result = await this.scanFile(tempFile);
      
      return result;
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  }
}

export const antivirusService = new AntivirusService();
