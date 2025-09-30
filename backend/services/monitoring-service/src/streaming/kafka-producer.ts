import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

class KafkaProducerService {
  private kafka: Kafka;
  private producer: Producer;
  private connected: boolean = false;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'monitoring-service',
      brokers: [process.env.KAFKA_BROKERS || 'kafka:9092'],
      retry: {
        retries: 5,
        initialRetryTime: 100,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
  }

  async connect() {
    try {
      await this.producer.connect();
      this.connected = true;
      logger.info('Kafka producer connected');
    } catch (error) {
      logger.error('Failed to connect Kafka producer:', error);
    }
  }

  async disconnect() {
    await this.producer.disconnect();
    this.connected = false;
  }

  async sendMetric(metric: any) {
    if (!this.connected) await this.connect();

    const message = {
      key: uuidv4(),
      value: JSON.stringify({
        ...metric,
        timestamp: new Date().toISOString(),
        source: 'monitoring-service',
      }),
      headers: {
        'correlation-id': uuidv4(),
        'event-type': 'metric',
      },
    };

    try {
      await this.producer.send({
        topic: 'metrics-stream',
        messages: [message],
      });
    } catch (error) {
      logger.error('Failed to send metric to Kafka:', error);
    }
  }

  async sendAlert(alert: any) {
    if (!this.connected) await this.connect();

    const message = {
      key: alert.id || uuidv4(),
      value: JSON.stringify({
        ...alert,
        timestamp: new Date().toISOString(),
        source: 'monitoring-service',
      }),
      headers: {
        'correlation-id': uuidv4(),
        'event-type': 'alert',
        'severity': alert.severity || 'info',
      },
    };

    try {
      await this.producer.send({
        topic: 'alerts-stream',
        messages: [message],
        acks: -1, // Wait for all replicas
      });
      logger.debug(`Alert sent to Kafka: ${alert.title}`);
    } catch (error) {
      logger.error('Failed to send alert to Kafka:', error);
    }
  }

  async sendFraudEvent(fraudData: any) {
    if (!this.connected) await this.connect();

    const message = {
      key: fraudData.userId || uuidv4(),
      value: JSON.stringify({
        ...fraudData,
        timestamp: new Date().toISOString(),
        source: 'fraud-detection',
      }),
      headers: {
        'correlation-id': uuidv4(),
        'event-type': 'fraud-detection',
        'risk-level': fraudData.riskLevel || 'medium',
      },
    };

    try {
      await this.producer.send({
        topic: 'fraud-events',
        messages: [message],
        acks: -1,
      });
      logger.info(`🚨 Fraud event sent to Kafka: ${fraudData.pattern}`);
    } catch (error) {
      logger.error('Failed to send fraud event to Kafka:', error);
    }
  }

  async sendBatch(topic: string, messages: any[]) {
    if (!this.connected) await this.connect();

    const kafkaMessages = messages.map(msg => ({
      key: msg.key || uuidv4(),
      value: JSON.stringify(msg),
      headers: {
        'batch-id': uuidv4(),
        'batch-size': String(messages.length),
      },
    }));

    try {
      await this.producer.sendBatch({
        topicMessages: [
          {
            topic,
            messages: kafkaMessages,
          },
        ],
      });
      logger.debug(`Batch of ${messages.length} messages sent to ${topic}`);
    } catch (error) {
      logger.error(`Failed to send batch to ${topic}:`, error);
    }
  }
}

export const kafkaProducer = new KafkaProducerService();
