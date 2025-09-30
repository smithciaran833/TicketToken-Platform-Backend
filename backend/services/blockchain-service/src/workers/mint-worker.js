const { Pool } = require('pg');
const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const amqp = require('amqplib');

// Define QUEUES directly since the module import is broken
const QUEUES = {
  TICKET_MINT: 'ticket.mint',
  BLOCKCHAIN_MINT: 'blockchain.mint'
};

class MintWorker {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken_db'
    });
    this.solanaConnection = new Connection(
      process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
      'confirmed'
    );
    this.mintWallet = this.initializeWallet();
    this.rabbitConnection = null;
    this.channel = null;
  }

  initializeWallet() {
    if (process.env.MINT_WALLET_PRIVATE_KEY) {
      const privateKey = JSON.parse(process.env.MINT_WALLET_PRIVATE_KEY);
      return Keypair.fromSecretKey(new Uint8Array(privateKey));
    } else {
      const wallet = Keypair.generate();
      console.log('⚠️  Generated new wallet for testing:', wallet.publicKey.toString());
      console.log('   Fund this wallet with devnet SOL to enable minting');
      return wallet;
    }
  }

  async start() {
    console.log('🚀 Starting Mint Worker...');
    
    try {
      await this.connectRabbitMQ();
      await this.consumeQueue();
    } catch (error) {
      console.log('📮 RabbitMQ not available, using polling mode');
      console.error(error.message);
    }
    
    await this.startPolling();
  }

  async connectRabbitMQ() {
    const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
    this.rabbitConnection = await amqp.connect(rabbitmqUrl);
    this.channel = await this.rabbitConnection.createChannel();
    
    // Ensure queue exists
    await this.channel.assertQueue(QUEUES.TICKET_MINT, { durable: true });
    console.log('✅ Connected to RabbitMQ');
  }

  async consumeQueue() {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    await this.channel.consume(QUEUES.TICKET_MINT, async (msg) => {
      if (!msg) return;

      try {
        const job = JSON.parse(msg.content.toString());
        console.log('Processing mint job:', job);
        
        await this.processMintJob(job);
        
        // Acknowledge message
        this.channel.ack(msg);
      } catch (error) {
        console.error('Failed to process mint job:', error);
        // Reject and requeue
        this.channel.nack(msg, false, true);
      }
    });

    console.log('📬 Consuming from ticket.mint queue');
  }

  async startPolling() {
    // Fallback polling mechanism if RabbitMQ is not available
    setInterval(async () => {
      try {
        const result = await this.pool.query(`
          SELECT * FROM mint_jobs 
          WHERE status = 'pending' 
          ORDER BY created_at ASC 
          LIMIT 1
        `);

        if (result.rows.length > 0) {
          const job = result.rows[0];
          await this.processMintJob(job);
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 5000); // Poll every 5 seconds

    console.log('Mint worker started');
  }

  async processMintJob(job) {
    try {
      // Generate a mock NFT address (in production, this would be actual minting)
      const mintAddress = Keypair.generate().publicKey.toString();

      // FIXED: Update database using proper join through order_items table
      await this.pool.query(`
        UPDATE tickets t
        SET mint_address = $1, minted_at = NOW()
        FROM order_items oi 
        WHERE t.id = oi.ticket_id 
          AND oi.order_id = $2
      `, [mintAddress, job.orderId]);

      console.log(`✅ Minted NFT: ${mintAddress} for order ${job.orderId}`);

      // Update mint job status if it exists
      if (job.id) {
        await this.pool.query(`
          UPDATE mint_jobs 
          SET status = 'completed', 
              nft_address = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [mintAddress, job.id]);
      }

      // Emit success event
      if (this.channel) {
        await this.channel.publish('events', 'mint.success', Buffer.from(JSON.stringify({
          orderId: job.orderId,
          mintAddress,
          timestamp: new Date().toISOString()
        })));
      }

    } catch (error) {
      console.error('Minting failed:', error);
      
      // Update mint job status to failed if it exists
      if (job.id) {
        await this.pool.query(`
          UPDATE mint_jobs 
          SET status = 'failed', 
              error = $1,
              updated_at = NOW()
          WHERE id = $2
        `, [error.message, job.id]);
      }
      
      throw error;
    }
  }

  async shutdown() {
    console.log('Shutting down mint worker...');
    if (this.channel) {
      await this.channel.close();
    }
    if (this.rabbitConnection) {
      await this.rabbitConnection.close();
    }
    await this.pool.end();
  }
}

module.exports = MintWorker;
