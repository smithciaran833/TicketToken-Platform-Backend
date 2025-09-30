import axios from 'axios';
import { Pool } from 'pg';
import amqp from 'amqplib';

export class IntegrationTestBase {
  protected db: Pool;
  protected rabbitConnection: amqp.Connection;
  protected services = {
    auth: 'http://localhost:3001',
    venue: 'http://localhost:3002',
    event: 'http://localhost:3003',
    ticket: 'http://localhost:3004',
    payment: 'http://localhost:3005',
    marketplace: 'http://localhost:3006',
    blockchain: 'http://localhost:3015'
  };

  async setup() {
    // Connect to test database
    this.db = new Pool({
      connectionString: process.env.TEST_DATABASE_URL
    });

    // Connect to RabbitMQ
    this.rabbitConnection = await amqp.connect(
      process.env.TEST_RABBITMQ_URL || 'amqp://localhost'
    );

    // Clear test data
    await this.clearTestData();
  }

  async teardown() {
    await this.db.end();
    await this.rabbitConnection.close();
  }

  async clearTestData() {
    // Clean tables in correct order
    await this.db.query('TRUNCATE tickets, orders, events, venues CASCADE');
  }
}
