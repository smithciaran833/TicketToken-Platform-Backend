"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionConfirmationService = void 0;
const logger_1 = require("../utils/logger");
class TransactionConfirmationService {
    connection;
    defaultTimeout = 60000;
    defaultPollInterval = 1000;
    defaultCommitment = 'finalized';
    constructor(connection) {
        this.connection = connection;
    }
    async confirmTransaction(signature, config = {}) {
        const commitment = config.commitment || this.defaultCommitment;
        const timeout = config.timeout || this.defaultTimeout;
        const pollInterval = config.pollInterval || this.defaultPollInterval;
        logger_1.logger.info('Starting transaction confirmation', {
            signature,
            commitment,
            timeout,
            pollInterval
        });
        const startTime = Date.now();
        try {
            const result = await this.connection.confirmTransaction({
                signature,
                ...(commitment && { commitment })
            }, commitment);
            if (result.value.err) {
                logger_1.logger.error('Transaction failed', {
                    signature,
                    error: result.value.err
                });
                return {
                    confirmed: false,
                    signature,
                    err: result.value.err
                };
            }
            const status = await this.getTransactionStatus(signature);
            const duration = Date.now() - startTime;
            logger_1.logger.info('Transaction confirmed', {
                signature,
                commitment,
                duration,
                slot: status.slot,
                confirmations: status.confirmations
            });
            return {
                confirmed: true,
                signature,
                slot: status.slot,
                confirmations: status.confirmations,
                err: status.err
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            if (duration >= timeout) {
                logger_1.logger.error('Transaction confirmation timeout', {
                    signature,
                    timeout,
                    duration
                });
                throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
            }
            logger_1.logger.error('Transaction confirmation error', {
                signature,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    async getTransactionStatus(signature) {
        try {
            const statuses = await this.connection.getSignatureStatuses([signature]);
            const status = statuses.value[0];
            if (!status) {
                throw new Error('Transaction not found');
            }
            return status;
        }
        catch (error) {
            logger_1.logger.error('Failed to get transaction status', {
                signature,
                error: error.message
            });
            throw error;
        }
    }
    async confirmTransactions(signatures, config = {}) {
        logger_1.logger.info('Confirming multiple transactions', {
            count: signatures.length,
            commitment: config.commitment
        });
        try {
            const results = await Promise.all(signatures.map(sig => this.confirmTransaction(sig, config)));
            const successCount = results.filter(r => r.confirmed).length;
            logger_1.logger.info('Batch confirmation complete', {
                total: signatures.length,
                confirmed: successCount,
                failed: signatures.length - successCount
            });
            return results;
        }
        catch (error) {
            logger_1.logger.error('Batch confirmation error', {
                error: error.message,
                count: signatures.length
            });
            throw error;
        }
    }
    async pollForConfirmation(signature, commitment = 'finalized', timeout = 60000) {
        const startTime = Date.now();
        const pollInterval = 2000;
        while (Date.now() - startTime < timeout) {
            try {
                const status = await this.getTransactionStatus(signature);
                const isConfirmed = this.checkCommitmentLevel(status, commitment);
                if (isConfirmed) {
                    logger_1.logger.info('Transaction reached desired commitment', {
                        signature,
                        commitment,
                        slot: status.slot,
                        confirmations: status.confirmations
                    });
                    return {
                        confirmed: true,
                        signature,
                        slot: status.slot,
                        confirmations: status.confirmations,
                        err: status.err
                    };
                }
                if (status.err) {
                    logger_1.logger.error('Transaction failed during polling', {
                        signature,
                        error: status.err
                    });
                    return {
                        confirmed: false,
                        signature,
                        err: status.err
                    };
                }
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
            catch (error) {
                logger_1.logger.warn('Polling attempt failed, retrying...', {
                    signature,
                    error: error.message
                });
                await new Promise(resolve => setTimeout(resolve, pollInterval));
            }
        }
        throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
    }
    checkCommitmentLevel(status, commitment) {
        if (!status)
            return false;
        switch (commitment) {
            case 'processed':
                return true;
            case 'confirmed':
                return (status.confirmations !== null && status.confirmations > 0) ||
                    status.confirmationStatus === 'confirmed' ||
                    status.confirmationStatus === 'finalized';
            case 'finalized':
                return status.confirmationStatus === 'finalized';
            default:
                return false;
        }
    }
    async getTransaction(signature, maxRetries = 3) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const tx = await this.connection.getTransaction(signature, {
                    maxSupportedTransactionVersion: 0
                });
                if (tx) {
                    return tx;
                }
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
            catch (error) {
                lastError = error;
                logger_1.logger.warn('Failed to get transaction, retrying...', {
                    signature,
                    attempt,
                    maxRetries,
                    error: error.message
                });
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        throw lastError || new Error('Transaction not found after retries');
    }
}
exports.TransactionConfirmationService = TransactionConfirmationService;
exports.default = TransactionConfirmationService;
//# sourceMappingURL=TransactionConfirmationService.js.map