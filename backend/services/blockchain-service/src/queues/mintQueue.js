"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MintQueue = void 0;
const baseQueue_1 = require("./baseQueue");
const pg_1 = require("pg");
const config_1 = __importDefault(require("../config"));
const queue_1 = __importDefault(require("../config/queue"));
class MintQueue extends baseQueue_1.BaseQueue {
    db;
    constructor() {
        super('nft-minting', {
            defaultJobOptions: {
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 3000
                },
                removeOnComplete: 50,
                removeOnFail: 100
            }
        });
        this.db = new pg_1.Pool(config_1.default.database);
        this.setupProcessor();
    }
    setupProcessor() {
        const concurrency = queue_1.default.queues['nft-minting'].concurrency || 5;
        this.queue.process(concurrency, async (job) => {
            const { ticketId, userId, eventId, metadata } = job.data;
            try {
                job.progress(10);
                const existing = await this.checkExistingMint(ticketId);
                if (existing) {
                    console.log(`Ticket ${ticketId} already minted`);
                    return existing;
                }
                job.progress(20);
                await this.updateTicketStatus(ticketId, 'RESERVED');
                job.progress(30);
                await this.storeJobRecord(job.id, ticketId, userId, 'PROCESSING');
                job.progress(40);
                const mintResult = await this.simulateMint(ticketId, metadata);
                job.progress(70);
                await this.storeTransaction(ticketId, mintResult);
                job.progress(90);
                await this.updateTicketAsMinted(ticketId, mintResult);
                await this.updateJobRecord(job.id, 'COMPLETED', mintResult);
                job.progress(100);
                console.log(`Successfully minted NFT for ticket ${ticketId}`);
                return mintResult;
            }
            catch (error) {
                console.error(`Minting failed for ticket ${ticketId}:`, error);
                await this.updateJobRecord(job.id, 'FAILED', null, error.message);
                if (job.attemptsMade >= (job.opts.attempts || 1) - 1) {
                    await this.updateTicketStatus(ticketId, 'AVAILABLE');
                }
                throw error;
            }
        });
    }
    async checkExistingMint(ticketId) {
        const result = await this.db.query('SELECT token_id, mint_transaction_id FROM tickets WHERE id = $1 AND is_minted = true', [ticketId]);
        if (result.rows.length > 0) {
            return {
                success: true,
                alreadyMinted: true,
                tokenId: result.rows[0].token_id,
                transactionId: result.rows[0].mint_transaction_id,
                signature: '',
                blockHeight: 0,
                timestamp: new Date().toISOString()
            };
        }
        return null;
    }
    async updateTicketStatus(ticketId, status) {
        await this.db.query('UPDATE tickets SET status = $1 WHERE id = $2', [status, ticketId]);
    }
    async storeJobRecord(jobId, ticketId, userId, status) {
        const existing = await this.db.query('SELECT id FROM queue_jobs WHERE job_id = $1', [jobId]);
        if (existing.rows.length > 0) {
            await this.db.query('UPDATE queue_jobs SET status = $1 WHERE job_id = $2', [status, jobId]);
        }
        else {
            await this.db.query(`
        INSERT INTO queue_jobs (
          job_id,
          queue_name,
          job_type,
          ticket_id,
          user_id,
          status,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
      `, [jobId, 'nft-minting', 'MINT', ticketId, userId, status]);
        }
    }
    async updateJobRecord(jobId, status, result = null, error = null) {
        const metadata = result ? { result } : {};
        await this.db.query(`
      UPDATE queue_jobs
      SET
        status = $1,
        metadata = $2,
        error_message = $3,
        completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE completed_at END,
        failed_at = CASE WHEN $1 = 'FAILED' THEN NOW() ELSE failed_at END
      WHERE job_id = $4
    `, [status, JSON.stringify(metadata), error, jobId]);
    }
    async simulateMint(ticketId, metadata) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return {
            success: true,
            tokenId: `token_${ticketId}_${Date.now()}`,
            transactionId: `tx_${Math.random().toString(36).substr(2, 9)}`,
            signature: `sig_${Math.random().toString(36).substr(2, 9)}`,
            blockHeight: Math.floor(Math.random() * 1000000),
            timestamp: new Date().toISOString()
        };
    }
    async storeTransaction(ticketId, mintResult) {
        await this.db.query(`
      INSERT INTO blockchain_transactions (
        ticket_id,
        type,
        status,
        slot_number,
        metadata,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [
            ticketId,
            'MINT',
            'CONFIRMED',
            mintResult.blockHeight || 0,
            JSON.stringify(mintResult)
        ]);
    }
    async updateTicketAsMinted(ticketId, mintResult) {
        await this.db.query(`
      UPDATE tickets
      SET
        is_minted = true,
        token_id = $1,
        mint_transaction_id = $2,
        status = 'SOLD',
        is_nft = true
      WHERE id = $3
    `, [mintResult.tokenId, mintResult.transactionId, ticketId]);
    }
    async addMintJob(ticketId, userId, eventId, metadata, options = {}) {
        return await this.addJob({
            ticketId,
            userId,
            eventId,
            metadata,
            timestamp: new Date().toISOString()
        }, {
            ...options,
            jobId: `mint_${ticketId}_${Date.now()}`
        });
    }
}
exports.MintQueue = MintQueue;
exports.default = MintQueue;
//# sourceMappingURL=mintQueue.js.map