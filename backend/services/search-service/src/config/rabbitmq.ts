import * as amqp from 'amqplib';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";

let connection: any;
let channel: amqp.Channel;

export async function connectRabbitMQ() {
  try {
    connection = await amqp.connect(process.env.RABBITMQ_URL || process.env.AMQP_URL || 'amqp://admin:admin@rabbitmq:5672');
    channel = await connection.createChannel();
    
    await channel.assertExchange('search.sync', 'topic', { durable: true });
    await channel.assertQueue('search.sync.queue', { durable: true });
    await channel.bindQueue('search.sync.queue', 'search.sync', '#');
    
    await channel.consume('search.sync.queue', async (msg) => {
      if (msg) {
        try {
          // Process message
          console.log('Processing message:', msg.content.toString());
          channel.ack(msg);
        } catch (error) {
          console.error('Error processing message:', error);
          channel.nack(msg, false, false);
        }
      }
    });
    
    console.log('RabbitMQ connected');
  } catch (error) {
    console.error('RabbitMQ connection failed:', error);
    setTimeout(connectRabbitMQ, 5000);
  }
}

export { channel };
