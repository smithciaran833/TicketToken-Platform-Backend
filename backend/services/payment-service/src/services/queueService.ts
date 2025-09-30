const amqp = require('amqplib');
// import { QUEUES } from '@tickettoken/shared/src/mq/queues'; // Commented out - unused

export class QueueService {
  private connection: any = null;
  private channel: any = null;

  async connect(): Promise<void> {
    if (!this.connection) {
      this.connection = await amqp.connect(process.env.AMQP_URL || 'amqp://rabbitmq:5672');
      this.channel = await this.connection.createChannel();
    }
  }

  async publish(queue: string, message: any): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    await this.channel.assertQueue(queue, { durable: true });
    const buffer = Buffer.from(JSON.stringify(message));
    await this.channel.sendToQueue(queue, buffer, { persistent: true });
  }

  async close(): Promise<void> {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
    this.channel = null;
    this.connection = null;
  }
}

export const queueService = new QueueService();
