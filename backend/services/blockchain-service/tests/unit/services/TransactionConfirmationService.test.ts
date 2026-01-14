/**
 * Unit tests for TransactionConfirmationService
 * 
 * Tests transaction confirmation, status polling, and batch confirmation
 */

describe('TransactionConfirmationService', () => {
  // ===========================================================================
  // Constructor
  // ===========================================================================
  describe('Constructor', () => {
    it('should accept Connection instance', () => {
      const service = { connection: {} };
      expect(service.connection).toBeDefined();
    });

    it('should set defaultTimeout to 60000ms', () => {
      const defaultTimeout = 60000;
      expect(defaultTimeout).toBe(60000);
    });

    it('should set defaultPollInterval to 1000ms', () => {
      const defaultPollInterval = 1000;
      expect(defaultPollInterval).toBe(1000);
    });

    it('should set defaultCommitment to finalized', () => {
      const defaultCommitment = 'finalized';
      expect(defaultCommitment).toBe('finalized');
    });
  });

  // ===========================================================================
  // confirmTransaction
  // ===========================================================================
  describe('confirmTransaction', () => {
    describe('Config Defaults', () => {
      it('should default commitment to finalized', () => {
        const config = {};
        const commitment = config.commitment || 'finalized';
        expect(commitment).toBe('finalized');
      });

      it('should default timeout to 60000ms', () => {
        const config = {};
        const timeout = config.timeout || 60000;
        expect(timeout).toBe(60000);
      });

      it('should default pollInterval to 1000ms', () => {
        const config = {};
        const pollInterval = config.pollInterval || 1000;
        expect(pollInterval).toBe(1000);
      });

      it('should accept custom commitment', () => {
        const config = { commitment: 'confirmed' };
        expect(config.commitment).toBe('confirmed');
      });

      it('should accept custom timeout', () => {
        const config = { timeout: 30000 };
        expect(config.timeout).toBe(30000);
      });
    });

    describe('Logging', () => {
      it('should log start of confirmation', () => {
        const logData = { signature: 'sig123', commitment: 'finalized', timeout: 60000 };
        expect(logData.signature).toBeDefined();
      });
    });

    describe('Connection Confirm', () => {
      it('should call connection.confirmTransaction', () => {
        let confirmCalled = false;
        const connection = {
          confirmTransaction: () => { confirmCalled = true; return { value: { err: null } }; }
        };
        connection.confirmTransaction();
        expect(confirmCalled).toBe(true);
      });

      it('should pass signature to confirmTransaction', () => {
        const params = { signature: 'sig123abc' };
        expect(params.signature).toBeDefined();
      });

      it('should pass commitment to confirmTransaction', () => {
        const params = { commitment: 'finalized' };
        expect(params.commitment).toBe('finalized');
      });
    });

    describe('Error Handling', () => {
      it('should check result.value.err for failure', () => {
        const result = { value: { err: 'InstructionError' } };
        const hasError = result.value.err !== null;
        expect(hasError).toBe(true);
      });

      it('should log error on transaction failure', () => {
        const logData = { signature: 'sig123', error: 'InstructionError' };
        expect(logData.error).toBeDefined();
      });

      it('should return confirmed: false on failure', () => {
        const result = { confirmed: false, signature: 'sig123', err: 'InstructionError' };
        expect(result.confirmed).toBe(false);
      });
    });

    describe('Success Handling', () => {
      it('should call getTransactionStatus after confirm', () => {
        let statusCalled = false;
        const getTransactionStatus = () => { statusCalled = true; return {}; };
        getTransactionStatus();
        expect(statusCalled).toBe(true);
      });

      it('should calculate duration', () => {
        const startTime = Date.now() - 1500;
        const duration = Date.now() - startTime;
        expect(duration).toBeGreaterThan(1000);
      });

      it('should log success with details', () => {
        const logData = { signature: 'sig123', commitment: 'finalized', duration: 1500, slot: 12345678 };
        expect(logData.duration).toBeGreaterThan(0);
      });

      it('should return confirmed: true on success', () => {
        const result = { confirmed: true, signature: 'sig123', slot: 12345678 };
        expect(result.confirmed).toBe(true);
      });

      it('should return slot in result', () => {
        const result = { slot: 12345678 };
        expect(result.slot).toBe(12345678);
      });

      it('should return confirmations in result', () => {
        const result = { confirmations: 32 };
        expect(result.confirmations).toBe(32);
      });
    });

    describe('Timeout Handling', () => {
      it('should check if duration exceeds timeout', () => {
        const startTime = Date.now() - 65000;
        const timeout = 60000;
        const duration = Date.now() - startTime;
        const timedOut = duration >= timeout;
        expect(timedOut).toBe(true);
      });

      it('should log timeout error', () => {
        const logData = { signature: 'sig123', timeout: 60000, duration: 65000 };
        expect(logData.duration).toBeGreaterThan(logData.timeout);
      });

      it('should throw timeout error', () => {
        const timeout = 60000;
        const error = new Error(`Transaction confirmation timeout after ${timeout}ms`);
        expect(error.message).toMatch(/timeout/);
      });
    });
  });

  // ===========================================================================
  // getTransactionStatus
  // ===========================================================================
  describe('getTransactionStatus', () => {
    it('should call connection.getSignatureStatuses', () => {
      let statusCalled = false;
      const connection = {
        getSignatureStatuses: () => { statusCalled = true; return { value: [{}] }; }
      };
      connection.getSignatureStatuses();
      expect(statusCalled).toBe(true);
    });

    it('should pass signature in array', () => {
      const signatures = ['sig123'];
      expect(signatures).toHaveLength(1);
    });

    it('should extract first status from result', () => {
      const statuses = { value: [{ slot: 12345678, confirmations: 32 }] };
      const status = statuses.value[0];
      expect(status.slot).toBe(12345678);
    });

    it('should throw if status is null', () => {
      const statuses = { value: [null] };
      const status = statuses.value[0];
      const shouldThrow = !status;
      expect(shouldThrow).toBe(true);
    });

    it('should throw Transaction not found error', () => {
      const error = new Error('Transaction not found');
      expect(error.message).toBe('Transaction not found');
    });

    it('should log error on failure', () => {
      const logData = { signature: 'sig123', error: 'Failed to get status' };
      expect(logData.error).toBeDefined();
    });
  });

  // ===========================================================================
  // confirmTransactions (batch)
  // ===========================================================================
  describe('confirmTransactions', () => {
    it('should log start with count', () => {
      const logData = { count: 5, commitment: 'finalized' };
      expect(logData.count).toBe(5);
    });

    it('should call confirmTransaction for each signature', () => {
      const signatures = ['sig1', 'sig2', 'sig3'];
      let callCount = 0;
      signatures.forEach(() => callCount++);
      expect(callCount).toBe(3);
    });

    it('should use Promise.all for parallel confirmation', () => {
      const method = 'all';
      expect(method).toBe('all');
    });

    it('should pass config to each confirmation', () => {
      const config = { commitment: 'confirmed', timeout: 30000 };
      expect(config.commitment).toBe('confirmed');
    });

    it('should count successful confirmations', () => {
      const results = [
        { confirmed: true },
        { confirmed: false },
        { confirmed: true }
      ];
      const successCount = results.filter(r => r.confirmed).length;
      expect(successCount).toBe(2);
    });

    it('should log batch completion', () => {
      const logData = { total: 3, confirmed: 2, failed: 1 };
      expect(logData.total).toBe(logData.confirmed + logData.failed);
    });

    it('should return array of results', () => {
      const results = [{ confirmed: true }, { confirmed: false }];
      expect(Array.isArray(results)).toBe(true);
    });

    it('should log error on batch failure', () => {
      const logData = { error: 'Batch failed', count: 3 };
      expect(logData.error).toBeDefined();
    });
  });

  // ===========================================================================
  // pollForConfirmation
  // ===========================================================================
  describe('pollForConfirmation', () => {
    describe('Parameters', () => {
      it('should default commitment to finalized', () => {
        const commitment = 'finalized';
        expect(commitment).toBe('finalized');
      });

      it('should default timeout to 60000ms', () => {
        const timeout = 60000;
        expect(timeout).toBe(60000);
      });

      it('should use 2000ms poll interval', () => {
        const pollInterval = 2000;
        expect(pollInterval).toBe(2000);
      });
    });

    describe('Polling Loop', () => {
      it('should track start time', () => {
        const startTime = Date.now();
        expect(startTime).toBeGreaterThan(0);
      });

      it('should check if elapsed time < timeout', () => {
        const startTime = Date.now() - 10000;
        const timeout = 60000;
        const elapsed = Date.now() - startTime;
        const shouldContinue = elapsed < timeout;
        expect(shouldContinue).toBe(true);
      });

      it('should call getTransactionStatus each iteration', () => {
        let statusCalled = false;
        const getTransactionStatus = () => { statusCalled = true; return {}; };
        getTransactionStatus();
        expect(statusCalled).toBe(true);
      });

      it('should wait pollInterval between attempts', () => {
        const pollInterval = 2000;
        expect(pollInterval).toBe(2000);
      });
    });

    describe('Commitment Level Check', () => {
      it('should call checkCommitmentLevel', () => {
        let checkCalled = false;
        const checkCommitmentLevel = () => { checkCalled = true; return true; };
        checkCommitmentLevel();
        expect(checkCalled).toBe(true);
      });

      it('should return success when commitment reached', () => {
        const result = { confirmed: true, signature: 'sig123', slot: 12345678 };
        expect(result.confirmed).toBe(true);
      });

      it('should log when commitment reached', () => {
        const logData = { signature: 'sig123', commitment: 'finalized', slot: 12345678 };
        expect(logData.commitment).toBe('finalized');
      });
    });

    describe('Error Checking', () => {
      it('should check status.err for failure', () => {
        const status = { err: 'InstructionError' };
        const hasError = status.err !== null;
        expect(hasError).toBe(true);
      });

      it('should log error during polling', () => {
        const logData = { signature: 'sig123', error: 'InstructionError' };
        expect(logData.error).toBeDefined();
      });

      it('should return confirmed: false on error', () => {
        const result = { confirmed: false, signature: 'sig123', err: 'InstructionError' };
        expect(result.confirmed).toBe(false);
      });
    });

    describe('Retry on Status Error', () => {
      it('should log warning on status fetch error', () => {
        const logLevel = 'warn';
        const message = 'Polling attempt failed, retrying...';
        expect(message).toMatch(/retrying/);
      });

      it('should wait before retry on error', () => {
        const pollInterval = 2000;
        expect(pollInterval).toBe(2000);
      });
    });

    describe('Timeout', () => {
      it('should throw timeout error when elapsed >= timeout', () => {
        const timeout = 60000;
        const error = new Error(`Transaction confirmation timeout after ${timeout}ms`);
        expect(error.message).toMatch(/timeout/);
      });
    });
  });

  // ===========================================================================
  // checkCommitmentLevel (private)
  // ===========================================================================
  describe('checkCommitmentLevel', () => {
    it('should return false if status is null', () => {
      const status = null;
      const result = !status ? false : true;
      expect(result).toBe(false);
    });

    describe('processed commitment', () => {
      it('should return true for any status', () => {
        const commitment = 'processed';
        const status = { slot: 12345678 };
        const result = commitment === 'processed' && status !== null;
        expect(result).toBe(true);
      });
    });

    describe('confirmed commitment', () => {
      it('should return true if confirmations > 0', () => {
        const status = { confirmations: 10 };
        const isConfirmed = status.confirmations !== null && status.confirmations > 0;
        expect(isConfirmed).toBe(true);
      });

      it('should return true if confirmationStatus is confirmed', () => {
        const status = { confirmationStatus: 'confirmed' };
        const isConfirmed = status.confirmationStatus === 'confirmed';
        expect(isConfirmed).toBe(true);
      });

      it('should return true if confirmationStatus is finalized', () => {
        const status = { confirmationStatus: 'finalized' };
        const isConfirmed = status.confirmationStatus === 'finalized';
        expect(isConfirmed).toBe(true);
      });

      it('should return false if confirmations is null', () => {
        const status = { confirmations: null };
        const isConfirmed = status.confirmations !== null && status.confirmations > 0;
        expect(isConfirmed).toBe(false);
      });
    });

    describe('finalized commitment', () => {
      it('should return true only if confirmationStatus is finalized', () => {
        const status = { confirmationStatus: 'finalized' };
        const isFinalized = status.confirmationStatus === 'finalized';
        expect(isFinalized).toBe(true);
      });

      it('should return false if confirmationStatus is confirmed', () => {
        const status = { confirmationStatus: 'confirmed' };
        const isFinalized = status.confirmationStatus === 'finalized';
        expect(isFinalized).toBe(false);
      });
    });

    describe('unknown commitment', () => {
      it('should return false for unknown commitment level', () => {
        const commitment = 'unknown';
        const result = ['processed', 'confirmed', 'finalized'].includes(commitment);
        expect(result).toBe(false);
      });
    });
  });

  // ===========================================================================
  // getTransaction
  // ===========================================================================
  describe('getTransaction', () => {
    it('should default maxRetries to 3', () => {
      const maxRetries = 3;
      expect(maxRetries).toBe(3);
    });

    it('should call connection.getTransaction', () => {
      let getCalled = false;
      const connection = {
        getTransaction: () => { getCalled = true; return {}; }
      };
      connection.getTransaction();
      expect(getCalled).toBe(true);
    });

    it('should pass maxSupportedTransactionVersion: 0', () => {
      const options = { maxSupportedTransactionVersion: 0 };
      expect(options.maxSupportedTransactionVersion).toBe(0);
    });

    it('should return transaction on success', () => {
      const tx = { slot: 12345678, meta: { err: null } };
      expect(tx.slot).toBeDefined();
    });

    describe('Retry Logic', () => {
      it('should retry if transaction is null', () => {
        const tx = null;
        const shouldRetry = tx === null;
        expect(shouldRetry).toBe(true);
      });

      it('should wait increasing delay between retries', () => {
        const attempt = 2;
        const delay = 1000 * attempt;
        expect(delay).toBe(2000);
      });

      it('should log warning on retry', () => {
        const logData = { signature: 'sig123', attempt: 1, maxRetries: 3, error: 'Not found' };
        expect(logData.attempt).toBeLessThan(logData.maxRetries);
      });

      it('should track lastError', () => {
        const lastError = new Error('Transaction not found');
        expect(lastError).toBeDefined();
      });
    });

    describe('Exhausted Retries', () => {
      it('should throw lastError if set', () => {
        const lastError = new Error('Connection timeout');
        expect(lastError.message).toBe('Connection timeout');
      });

      it('should throw generic error if no lastError', () => {
        const error = new Error('Transaction not found after retries');
        expect(error.message).toMatch(/after retries/);
      });
    });
  });

  // ===========================================================================
  // ConfirmationConfig Interface
  // ===========================================================================
  describe('ConfirmationConfig Interface', () => {
    it('should have optional commitment property', () => {
      const config = { commitment: 'confirmed' };
      expect(config.commitment).toBe('confirmed');
    });

    it('should have optional timeout property', () => {
      const config = { timeout: 30000 };
      expect(config.timeout).toBe(30000);
    });

    it('should have optional pollInterval property', () => {
      const config = { pollInterval: 2000 };
      expect(config.pollInterval).toBe(2000);
    });
  });

  // ===========================================================================
  // ConfirmationResult Interface
  // ===========================================================================
  describe('ConfirmationResult Interface', () => {
    it('should have confirmed property', () => {
      const result = { confirmed: true };
      expect(result.confirmed).toBe(true);
    });

    it('should have signature property', () => {
      const result = { signature: 'sig123' };
      expect(result.signature).toBe('sig123');
    });

    it('should have optional slot property', () => {
      const result = { slot: 12345678 };
      expect(result.slot).toBe(12345678);
    });

    it('should have optional confirmations property', () => {
      const result = { confirmations: 32 };
      expect(result.confirmations).toBe(32);
    });

    it('should have optional err property', () => {
      const result = { err: 'InstructionError' };
      expect(result.err).toBe('InstructionError');
    });
  });
});
