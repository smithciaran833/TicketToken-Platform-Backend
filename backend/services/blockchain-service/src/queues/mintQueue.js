const BaseQueue = require('./baseQueue');
const { Pool } = require('pg');
const config = require('../config');
const queueConfig = require('../config/queue');

class MintQueue extends BaseQueue {
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
        
        this.db = new Pool(config.database);
        this.setupProcessor();
    }
    
    setupProcessor() {
        const concurrency = queueConfig.queues['nft-minting'].concurrency || 5;
        
        this.queue.process(concurrency, async (job) => {
            const { ticketId, userId, eventId, metadata } = job.data;
            
            try {
                // Update job progress
                job.progress(10);
                
                // Check if already minted (idempotency)
                const existing = await this.checkExistingMint(ticketId);
                if (existing) {
                    console.log(`Ticket ${ticketId} already minted`);
                    return existing;
                }
                
                job.progress(20);
                
                // Update ticket status to RESERVED (while minting)
                await this.updateTicketStatus(ticketId, 'RESERVED');
                
                job.progress(30);
                
                // Store job in database (without updated_at)
                await this.storeJobRecord(job.id, ticketId, userId, 'PROCESSING');
                
                job.progress(40);
                
                // Simulate NFT minting (will be replaced with actual blockchain call)
                const mintResult = await this.simulateMint(ticketId, metadata);
                
                job.progress(70);
                
                // Store transaction result
                await this.storeTransaction(ticketId, mintResult);
                
                job.progress(90);
                
                // Update ticket as minted
                await this.updateTicketAsMinted(ticketId, mintResult);
                
                // Update job record
                await this.updateJobRecord(job.id, 'COMPLETED', mintResult);
                
                job.progress(100);
                
                console.log(`Successfully minted NFT for ticket ${ticketId}`);
                return mintResult;
                
            } catch (error) {
                console.error(`Minting failed for ticket ${ticketId}:`, error);
                
                // Update job record with error
                await this.updateJobRecord(job.id, 'FAILED', null, error.message);
                
                // If final attempt, update ticket status
                if (job.attemptsMade >= job.opts.attempts - 1) {
                    await this.updateTicketStatus(ticketId, 'AVAILABLE');
                }
                
                throw error;
            }
        });
    }
    
    async checkExistingMint(ticketId) {
        const result = await this.db.query(
            'SELECT token_id, mint_transaction_id FROM tickets WHERE id = $1 AND is_minted = true',
            [ticketId]
        );
        
        if (result.rows.length > 0) {
            return {
                alreadyMinted: true,
                tokenId: result.rows[0].token_id,
                transactionId: result.rows[0].mint_transaction_id
            };
        }
        
        return null;
    }
    
    async updateTicketStatus(ticketId, status) {
        await this.db.query(
            'UPDATE tickets SET status = $1 WHERE id = $2',
            [status, ticketId]
        );
    }
    
    async storeJobRecord(jobId, ticketId, userId, status) {
        // First check if job exists
        const existing = await this.db.query(
            'SELECT id FROM queue_jobs WHERE job_id = $1',
            [String(jobId)]
        );
        
        if (existing.rows.length > 0) {
            // Update existing
            await this.db.query(
                'UPDATE queue_jobs SET status = $1 WHERE job_id = $2',
                [status, String(jobId)]
            );
        } else {
            // Insert new
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
            `, [String(jobId), 'nft-minting', 'MINT', ticketId, userId, status]);
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
        `, [status, JSON.stringify(metadata), error, String(jobId)]);
    }
    
    async simulateMint(ticketId, metadata) {
        // This will be replaced with actual blockchain minting
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
    
    // Public method to add a minting job
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

module.exports = MintQueue;
