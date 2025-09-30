import NodeClam from 'clamscan';
import { logger } from '../utils/logger';

export class VirusScanService {
  private clam: any;
  private initialized: boolean = false;
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      this.clam = await new NodeClam().init({
        clamdscan: {
          host: process.env.CLAMAV_HOST || 'clamav',
          port: parseInt(process.env.CLAMAV_PORT || '3310'),
          bypassTest: process.env.NODE_ENV === 'development'
        },
        preference: 'clamdscan'
      });
      
      this.initialized = true;
      logger.info('Virus scanner initialized');
    } catch (error) {
      logger.warn('Virus scanner not available, skipping scans');
      this.initialized = false;
    }
  }
  
  async scanBuffer(buffer: Buffer): Promise<{ isClean: boolean; virus?: string }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.clam) {
      logger.debug('Virus scanning skipped - scanner not available');
      return { isClean: true };
    }
    
    try {
      const { isInfected, viruses } = await this.clam.scanBuffer(buffer);
      
      if (isInfected) {
        logger.warn(`Virus detected: ${viruses.join(', ')}`);
        return { isClean: false, virus: viruses[0] };
      }
      
      return { isClean: true };
      
    } catch (error) {
      logger.error('Virus scan failed:', error);
      // Don't block upload if scanner fails
      return { isClean: true };
    }
  }
  
  async scanFile(filePath: string): Promise<{ isClean: boolean; virus?: string }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.clam) {
      return { isClean: true };
    }
    
    try {
      const { isInfected, viruses, file } = await this.clam.scanFile(filePath);
      
      if (isInfected) {
        logger.warn(`Virus detected in ${file}: ${viruses.join(', ')}`);
        return { isClean: false, virus: viruses[0] };
      }
      
      return { isClean: true };
      
    } catch (error) {
      logger.error('Virus scan failed:', error);
      return { isClean: true };
    }
  }
}

export const virusScanService = new VirusScanService();
