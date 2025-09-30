import { SystemMetricsCollector } from './system/cpu.collector';
import { MemoryCollector } from './system/memory.collector';
import { DiskCollector } from './system/disk.collector';
import { HTTPMetricsCollector } from './application/http.collector';
import { DatabaseMetricsCollector } from './application/database.collector';
import { BusinessMetricsCollector } from './business/revenue.collector';
import { logger } from '../utils/logger';
import { config } from '../config';

const collectors: any[] = [];

export async function initializeCollectors() {
  try {
    logger.info('Initializing metric collectors...');
    
    // System collectors
    collectors.push(new SystemMetricsCollector());
    collectors.push(new MemoryCollector());
    collectors.push(new DiskCollector());
    
    // Application collectors
    collectors.push(new HTTPMetricsCollector());
    collectors.push(new DatabaseMetricsCollector());
    
    // Business collectors
    collectors.push(new BusinessMetricsCollector());
    
    // Start all collectors
    for (const collector of collectors) {
      await collector.start();
      logger.info(`Started collector: ${collector.getName()}`);
    }
    
    logger.info('All metric collectors initialized');
  } catch (error) {
    logger.error('Failed to initialize collectors:', error);
    throw error;
  }
}

export async function stopCollectors() {
  for (const collector of collectors) {
    try {
      await collector.stop();
    } catch (error) {
      logger.error(`Error stopping collector ${collector.getName()}:`, error);
    }
  }
}

// Import new collectors
import { BlockchainMetricsCollector } from './blockchain/blockchain.collector';
import { FraudDetectionCollector } from './blockchain/fraud.collector';

// Add to existing collectors
const blockchainCollector = new BlockchainMetricsCollector();
const fraudCollector = new FraudDetectionCollector();

// Update the initialize function (append to existing)
export async function initializeBlockchainCollectors() {
  logger.info('Initializing blockchain collectors...');
  await blockchainCollector.start();
  await fraudCollector.start();
  logger.info('Blockchain collectors initialized');
}
