import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { logger } from '../utils/logger';
import { pgPool } from '../utils/database';

class KafkaConsumerService {
  private kafka: Kafka;
  private consumers: Map<string, Consumer> = new Map();

  constructor() {
    this.kafka = new Kafka({
      clientId: 'monitoring-consumer',
      brokers: [process.env.KAFKA_BROKERS || 'kafka:9092'],
    });
  }

  async subscribeToMetrics() {
    const consumer = this.kafka.consumer({ 
      groupId: 'monitoring-metrics-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    await consumer.subscribe({ 
      topics: ['metrics-stream', 'fraud-events', 'alerts-stream'],
      fromBeginning: false,
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
        try {
          const value = message.value?.toString();
          if (!value) return;

          const data = JSON.parse(value);
          
          switch (topic) {
            case 'metrics-stream':
              await this.processMetric(data);
              break;
            case 'fraud-events':
              await this.processFraudEvent(data);
              break;
            case 'alerts-stream':
              await this.processAlert(data);
              break;
          }
        } catch (error) {
          logger.error(`Error processing message from ${topic}:`, error);
        }
      },
    });

    this.consumers.set('metrics', consumer);
    logger.info('Kafka consumer subscribed to metrics streams');
  }

  private async processMetric(metric: any) {
    // Real-time metric processing
    logger.debug(`Processing metric: ${metric.metric_name}`);
    
    // Could add real-time aggregations, windowing, etc.
    if (metric.value > 1000) {
      logger.warn(`High value detected: ${metric.metric_name} = ${metric.value}`);
    }
  }

  private async processFraudEvent(event: any) {
    logger.warn(`🚨 FRAUD EVENT: ${event.pattern} detected for user ${event.userId}`);
    
    // Store in database for analysis
    try {
      await pgPool.query(
        `INSERT INTO fraud_events (user_id, pattern, risk_level, timestamp, data)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [event.userId, event.pattern, event.riskLevel, new Date(), JSON.stringify(event)]
      );
    } catch (error) {
      logger.error('Failed to store fraud event:', error);
    }
  }

  private async processAlert(alert: any) {
    logger.info(`📢 ALERT: ${alert.title} [${alert.severity}]`);
    
    // Could trigger additional actions here
    if (alert.severity === 'critical') {
      // Send to PagerDuty, trigger auto-remediation, etc.
      logger.error(`CRITICAL ALERT: ${alert.title}`);
    }
  }

  async disconnect() {
    for (const [name, consumer] of this.consumers) {
      await consumer.disconnect();
      logger.info(`Kafka consumer ${name} disconnected`);
    }
  }
}

export const kafkaConsumer = new KafkaConsumerService();
