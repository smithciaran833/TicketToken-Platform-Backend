"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MintWorker = void 0;
const pg_1 = require("pg");
const web3_js_1 = require("@solana/web3.js");
const amqplib_1 = __importDefault(require("amqplib"));
const logger_1 = require("../utils/logger");
const MetaplexService_1 = __importDefault(require("../services/MetaplexService"));
const TransactionConfirmationService_1 = __importDefault(require("../services/TransactionConfirmationService"));
const QUEUES = {
    TICKET_MINT: 'ticket.mint',
    BLOCKCHAIN_MINT: 'blockchain.mint'
};
class MintWorker {
    pool;
    solanaConnection;
    mintWallet;
    rabbitConnection;
    channel;
    metaplexService;
    confirmationService;
    constructor() {
        this.pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken_db'
        });
        this.solanaConnection = new web3_js_1.Connection(process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
        this.mintWallet = this.initializeWallet();
        this.rabbitConnection = null;
        this.channel = null;
        this.metaplexService = new MetaplexService_1.default(this.solanaConnection, this.mintWallet);
        this.confirmationService = new TransactionConfirmationService_1.default(this.solanaConnection);
    }
    initializeWallet() {
        if (process.env.MINT_WALLET_PRIVATE_KEY) {
            const privateKey = JSON.parse(process.env.MINT_WALLET_PRIVATE_KEY);
            return web3_js_1.Keypair.fromSecretKey(new Uint8Array(privateKey));
        }
        else {
            const wallet = web3_js_1.Keypair.generate();
            logger_1.logger.warn('Generated new wallet for testing - fund with devnet SOL to enable minting', {
                publicKey: wallet.publicKey.toString()
            });
            return wallet;
        }
    }
    async start() {
        logger_1.logger.info('Starting Mint Worker...');
        try {
            await this.connectRabbitMQ();
            await this.consumeQueue();
        }
        catch (error) {
            logger_1.logger.info('RabbitMQ not available, using polling mode', {
                error: error.message
            });
        }
        await this.startPolling();
    }
    async connectRabbitMQ() {
        const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
        this.rabbitConnection = await amqplib_1.default.connect(rabbitmqUrl);
        this.channel = await this.rabbitConnection.createChannel();
        await this.channel.assertQueue(QUEUES.TICKET_MINT, { durable: true });
        logger_1.logger.info('Connected to RabbitMQ', { queue: QUEUES.TICKET_MINT });
    }
    async consumeQueue() {
        if (!this.channel) {
            throw new Error('RabbitMQ channel not initialized');
        }
        await this.channel.consume(QUEUES.TICKET_MINT, async (msg) => {
            if (!msg)
                return;
            try {
                const job = JSON.parse(msg.content.toString());
                logger_1.logger.info('Processing mint job', { job });
                await this.processMintJob(job);
                this.channel.ack(msg);
            }
            catch (error) {
                logger_1.logger.error('Failed to process mint job', {
                    error: error.message,
                    stack: error.stack
                });
                this.channel.nack(msg, false, true);
            }
        });
        logger_1.logger.info('Consuming from queue', { queue: QUEUES.TICKET_MINT });
    }
    async startPolling() {
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
            }
            catch (error) {
                logger_1.logger.error('Polling error', {
                    error: error.message
                });
            }
        }, 5000);
        logger_1.logger.info('Mint worker started in polling mode', {
            interval: '5000ms'
        });
    }
    async getVenueWallet(venueId) {
        try {
            const settingsResult = await this.pool.query('SELECT royalty_wallet_address FROM venue_marketplace_settings WHERE venue_id = $1', [venueId]);
            if (settingsResult.rows.length > 0 && settingsResult.rows[0].royalty_wallet_address) {
                logger_1.logger.info('Found venue royalty wallet', {
                    venueId,
                    wallet: settingsResult.rows[0].royalty_wallet_address
                });
                return settingsResult.rows[0].royalty_wallet_address;
            }
            const venueResult = await this.pool.query('SELECT wallet_address FROM venues WHERE id = $1', [venueId]);
            if (venueResult.rows.length > 0 && venueResult.rows[0].wallet_address) {
                logger_1.logger.info('Found venue wallet', {
                    venueId,
                    wallet: venueResult.rows[0].wallet_address
                });
                return venueResult.rows[0].wallet_address;
            }
            logger_1.logger.warn('No wallet address found for venue', { venueId });
            return null;
        }
        catch (error) {
            logger_1.logger.error('Failed to fetch venue wallet', {
                venueId,
                error: error.message
            });
            return null;
        }
    }
    getPlatformWallet() {
        return process.env.PLATFORM_TREASURY_WALLET || this.mintWallet.publicKey.toString();
    }
    async processMintJob(job) {
        try {
            const ticketResult = await this.pool.query(`
        SELECT t.*, e.name as event_name, e.description as event_description,
               v.name as venue_name
        FROM tickets t
        JOIN order_items oi ON t.id = oi.ticket_id
        JOIN orders o ON oi.order_id = o.id
        JOIN events e ON t.event_id = e.id
        LEFT JOIN venues v ON e.venue_id = v.id
        WHERE o.id = $1
        LIMIT 1
      `, [job.orderId]);
            if (ticketResult.rows.length === 0) {
                throw new Error(`No ticket found for order ${job.orderId}`);
            }
            const ticket = ticketResult.rows[0];
            let venueWallet = null;
            if (job.venueId) {
                venueWallet = await this.getVenueWallet(job.venueId);
            }
            const platformWallet = this.getPlatformWallet();
            const creators = [];
            if (venueWallet) {
                creators.push({
                    address: venueWallet,
                    share: 50
                });
            }
            creators.push({
                address: platformWallet,
                share: venueWallet ? 50 : 100
            });
            logger_1.logger.info('NFT Royalty Configuration', {
                orderId: job.orderId,
                venueId: job.venueId,
                creators: creators.map(c => ({ address: c.address, share: c.share })),
                sellerFeeBasisPoints: 1000
            });
            const nftMetadata = {
                name: `${ticket.event_name} - Ticket #${ticket.seat_number || 'GA'}`,
                symbol: 'TICKET',
                description: ticket.event_description || `Ticket for ${ticket.event_name}`,
                image: job.metadata?.image || 'https://placeholder.com/ticket.png',
                attributes: [
                    {
                        trait_type: 'Event',
                        value: ticket.event_name
                    },
                    {
                        trait_type: 'Venue',
                        value: ticket.venue_name || 'Unknown'
                    },
                    {
                        trait_type: 'Section',
                        value: ticket.section || 'General Admission'
                    },
                    ...(ticket.seat_number ? [{
                            trait_type: 'Seat',
                            value: ticket.seat_number
                        }] : []),
                    {
                        trait_type: 'Ticket Type',
                        value: ticket.ticket_type || 'Standard'
                    }
                ]
            };
            const mintResult = await this.metaplexService.mintNFT({
                metadata: nftMetadata,
                creators,
                sellerFeeBasisPoints: 1000,
                collection: job.metadata?.collectionMint ? new web3_js_1.PublicKey(job.metadata.collectionMint) : undefined
            });
            await this.confirmationService.confirmTransaction(mintResult.transactionSignature, {
                commitment: 'finalized'
            });
            await this.pool.query(`
        UPDATE tickets t
        SET mint_address = $1, 
            minted_at = NOW(),
            metadata_uri = $2,
            transaction_signature = $3
        FROM order_items oi
        WHERE t.id = oi.ticket_id
          AND oi.order_id = $4
      `, [
                mintResult.mintAddress,
                mintResult.metadataUri,
                mintResult.transactionSignature,
                job.orderId
            ]);
            logger_1.logger.info('NFT minted successfully', {
                mintAddress: mintResult.mintAddress,
                signature: mintResult.transactionSignature,
                orderId: job.orderId,
                metadataUri: mintResult.metadataUri
            });
            if (job.id) {
                await this.pool.query(`
          UPDATE mint_jobs
          SET status = 'completed',
              nft_address = $1,
              transaction_signature = $2,
              metadata_uri = $3,
              updated_at = NOW()
          WHERE id = $4
        `, [
                    mintResult.mintAddress,
                    mintResult.transactionSignature,
                    mintResult.metadataUri,
                    job.id
                ]);
            }
            if (this.channel) {
                await this.channel.publish('events', 'mint.success', Buffer.from(JSON.stringify({
                    orderId: job.orderId,
                    mintAddress: mintResult.mintAddress,
                    transactionSignature: mintResult.transactionSignature,
                    metadataUri: mintResult.metadataUri,
                    venueId: job.venueId,
                    creators,
                    timestamp: new Date().toISOString()
                })));
            }
        }
        catch (error) {
            logger_1.logger.error('Minting failed', {
                error: error.message,
                stack: error.stack,
                orderId: job.orderId,
                jobId: job.id
            });
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
        logger_1.logger.info('Shutting down mint worker...');
        if (this.channel) {
            await this.channel.close();
        }
        if (this.rabbitConnection) {
            await this.rabbitConnection.close();
        }
        await this.pool.end();
    }
}
exports.MintWorker = MintWorker;
exports.default = MintWorker;
//# sourceMappingURL=mint-worker.js.map