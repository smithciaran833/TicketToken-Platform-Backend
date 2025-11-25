"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionMonitor = void 0;
const baseListener_1 = require("./baseListener");
class TransactionMonitor extends baseListener_1.BaseListener {
    pendingTransactions;
    constructor(connection, db) {
        super(connection, db);
        this.pendingTransactions = new Map();
    }
    async monitorTransaction(signature, metadata = {}) {
        console.log(`Monitoring transaction: ${signature}`);
        this.pendingTransactions.set(signature, {
            signature,
            metadata,
            startTime: Date.now(),
            attempts: 0
        });
        await this.checkTransaction(signature);
    }
    async checkTransaction(signature) {
        const txData = this.pendingTransactions.get(signature);
        if (!txData)
            return;
        txData.attempts++;
        try {
            const status = await this.connection.getSignatureStatus(signature);
            if (status.value) {
                const { confirmationStatus, confirmations, err } = status.value;
                console.log(`Transaction ${signature}: ${confirmationStatus} (${confirmations || 0} confirmations)`);
                await this.updateTransactionStatus(signature, confirmationStatus || '', confirmations || 0, err);
                if (confirmationStatus === 'finalized' || err) {
                    this.pendingTransactions.delete(signature);
                    this.emit('transaction:finalized', { signature, status: confirmationStatus, error: err });
                    if (txData.metadata.ticketId) {
                        await this.finalizeTicketMinting(txData.metadata.ticketId, !err);
                    }
                }
                else {
                    setTimeout(() => this.checkTransaction(signature), 2000);
                }
            }
            else {
                if (txData.attempts < 30) {
                    setTimeout(() => this.checkTransaction(signature), 2000);
                }
                else {
                    this.pendingTransactions.delete(signature);
                    this.emit('transaction:timeout', { signature });
                }
            }
        }
        catch (error) {
            console.error(`Error checking transaction ${signature}:`, error);
            if (txData.attempts < 30) {
                setTimeout(() => this.checkTransaction(signature), 5000);
            }
            else {
                this.pendingTransactions.delete(signature);
                await this.handleError(error, { signature, metadata: txData.metadata });
            }
        }
    }
    async updateTransactionStatus(signature, status, confirmations, error) {
        await this.db.query(`
      UPDATE blockchain_transactions
      SET status = $1,
          confirmation_count = $2,
          error_message = $3,
          updated_at = NOW()
      WHERE id = $4 OR metadata->>'signature' = $4
    `, [status, confirmations, error ? JSON.stringify(error) : null, signature]);
    }
    async finalizeTicketMinting(ticketId, success) {
        if (success) {
            await this.db.query(`
        UPDATE tickets
        SET on_chain_confirmed = true,
            status = 'SOLD'
        WHERE id = $1
      `, [ticketId]);
            await this.db.query(`
        UPDATE queue_jobs
        SET status = 'CONFIRMED'
        WHERE ticket_id = $1 AND job_type = 'MINT'
      `, [ticketId]);
        }
        else {
            await this.db.query(`
        UPDATE tickets
        SET is_minted = false,
            status = 'AVAILABLE'
        WHERE id = $1
      `, [ticketId]);
            await this.db.query(`
        UPDATE queue_jobs
        SET status = 'BLOCKCHAIN_FAILED'
        WHERE ticket_id = $1 AND job_type = 'MINT'
      `, [ticketId]);
        }
    }
    async setupSubscriptions() {
        console.log('Transaction monitor ready');
    }
}
exports.TransactionMonitor = TransactionMonitor;
exports.default = TransactionMonitor;
//# sourceMappingURL=transactionMonitor.js.map