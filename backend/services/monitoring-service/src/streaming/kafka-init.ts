import { kafkaProducer } from './kafka-producer';
import { kafkaConsumer } from './kafka-consumer';
import { logger } from '../utils/logger';

export async function initializeKafka() {
  try {
    logger.info('Initializing Kafka connections...');
    
    // Connect producer
    await kafkaProducer.connect();
    
    // Start consumer
    await kafkaConsumer.subscribeToMetrics();
    
    logger.info('✅ Kafka streaming pipeline initialized');
  } catch (error) {
    logger.error('Failed to initialize Kafka:', error);
    // Don't crash the service if Kafka isn't available
  }
}

export async function shutdownKafka() {
  try {
    await kafkaProducer.disconnect();
    await kafkaConsumer.disconnect();
    logger.info('Kafka connections closed');
  } catch (error) {
    logger.error('Error shutting down Kafka:', error);
  }
}
