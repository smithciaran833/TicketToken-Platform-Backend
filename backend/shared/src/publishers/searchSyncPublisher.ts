import * as amqp from 'amqplib';

let connection: any = null;
let channel: any = null;
let isConnecting = false;

const EXCHANGE_NAME = 'search.sync';
const RABBITMQ_URL =
  process.env.RABBITMQ_URL || process.env.AMQP_URL || 'amqp://admin:admin@rabbitmq:5672';

async function connect(): Promise<void> {
  if (connection && channel) return;
  if (isConnecting) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return connect();
  }

  isConnecting = true;

  try {
    console.log('🔌 Connecting to RabbitMQ for search sync...');
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

    console.log('✅ Search sync publisher connected');

    connection.on('error', (err: Error) => {
      console.error('❌ RabbitMQ connection error:', err);
      connection = null;
      channel = null;
    });

    connection.on('close', () => {
      console.warn('⚠️  RabbitMQ connection closed');
      connection = null;
      channel = null;
    });
  } catch (error) {
    console.error('❌ Failed to connect to RabbitMQ:', error);
    connection = null;
    channel = null;
    throw error;
  } finally {
    isConnecting = false;
  }
}

export async function publishSearchSync(routingKey: string, payload: any): Promise<void> {
  try {
    if (!connection || !channel) {
      await connect();
    }

    if (!channel) {
      throw new Error('Failed to establish RabbitMQ channel');
    }

    const message = JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
      routingKey,
    });

    const published = channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(message), {
      persistent: true,
      contentType: 'application/json',
    });

    if (!published) {
      await new Promise((resolve) => channel.once('drain', resolve));
      channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(message), {
        persistent: true,
        contentType: 'application/json',
      });
    }

    console.log(`📤 Search sync: ${routingKey}`);
  } catch (error) {
    console.error(`❌ Failed to publish search sync (${routingKey}):`, error);
    connection = null;
    channel = null;
  }
}

export async function closeSearchSync(): Promise<void> {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('✅ Search sync publisher closed');
  } catch (error) {
    console.error('Error closing search sync:', error);
  } finally {
    channel = null;
    connection = null;
  }
}
