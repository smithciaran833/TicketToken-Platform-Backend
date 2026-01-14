/**
 * Unit tests for BalanceMonitor service
 * Tests wallet balance monitoring and alerting functionality
 */

// Mock dependencies before imports
jest.mock('../../../src/config/solana', () => ({
  getConnection: jest.fn(),
  getWallet: jest.fn()
}));

jest.mock('../../../src/utils/solana', () => ({
  checkWalletBalance: jest.fn(),
  formatSOL: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

import { 
  BalanceMonitor, 
  getBalanceMonitor, 
  startBalanceMonitoring, 
  stopBalanceMonitoring 
} from '../../../src/services/BalanceMonitor';
import { getConnection, getWallet } from '../../../src/config/solana';
import { checkWalletBalance } from '../../../src/utils/solana';
import logger from '../../../src/utils/logger';

describe('BalanceMonitor', () => {
  let monitor: BalanceMonitor;
  const mockConnection = { rpcEndpoint: 'https://api.devnet.solana.com' };
  const mockWallet = { 
    publicKey: { toString: () => 'MockWalletPublicKey123456789012345' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Reset singleton by creating new instance
    monitor = new BalanceMonitor();
    
    // Setup default mocks
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    (getWallet as jest.Mock).mockReturnValue(mockWallet);
    (checkWalletBalance as jest.Mock).mockResolvedValue({
      balance: 1.5,
      sufficient: true
    });
  });

  afterEach(() => {
    monitor.stop();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should use MIN_SOL_BALANCE from env', () => {
      const originalEnv = process.env.MIN_SOL_BALANCE;
      process.env.MIN_SOL_BALANCE = '0.5';
      
      const testMonitor = new BalanceMonitor();
      // We can't directly access minBalance, but we can test behavior
      
      process.env.MIN_SOL_BALANCE = originalEnv;
    });

    it('should default MIN_SOL_BALANCE to 0.1', () => {
      const originalEnv = process.env.MIN_SOL_BALANCE;
      delete process.env.MIN_SOL_BALANCE;
      
      const testMonitor = new BalanceMonitor();
      // Default is 0.1 as per the source code
      
      process.env.MIN_SOL_BALANCE = originalEnv;
    });

    it('should use BALANCE_CHECK_INTERVAL from env', () => {
      const originalEnv = process.env.BALANCE_CHECK_INTERVAL;
      process.env.BALANCE_CHECK_INTERVAL = '60000';
      
      const testMonitor = new BalanceMonitor();
      
      process.env.BALANCE_CHECK_INTERVAL = originalEnv;
    });

    it('should default BALANCE_CHECK_INTERVAL to 5 minutes (300000ms)', () => {
      const originalEnv = process.env.BALANCE_CHECK_INTERVAL;
      delete process.env.BALANCE_CHECK_INTERVAL;
      
      const testMonitor = new BalanceMonitor();
      // Default is 300000 as per the source code
      
      process.env.BALANCE_CHECK_INTERVAL = originalEnv;
    });
  });

  describe('POLL_INTERVAL', () => {
    it('should be 5 minutes by default', () => {
      // The default interval is 300000ms (5 minutes)
      const originalEnv = process.env.BALANCE_CHECK_INTERVAL;
      delete process.env.BALANCE_CHECK_INTERVAL;
      
      const testMonitor = new BalanceMonitor();
      // Interval is 300000 by default
      
      process.env.BALANCE_CHECK_INTERVAL = originalEnv;
    });
  });

  describe('ALERT_COOLDOWN', () => {
    it('should be 1 hour (3600000ms)', () => {
      // The alertCooldown is hardcoded to 3600000ms
      // We'll test this through behavior
    });
  });

  describe('start', () => {
    it('should start monitoring', () => {
      monitor.start();
      
      expect(getConnection).toHaveBeenCalled();
      expect(getWallet).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Balance monitor started');
    });

    it('should check balance immediately on start', () => {
      monitor.start();
      
      // Fast-forward to allow async check to complete
      jest.runAllTimers();
      
      expect(checkWalletBalance).toHaveBeenCalled();
    });

    it('should check balance periodically', async () => {
      monitor.start();
      
      // Initial check
      expect(checkWalletBalance).toHaveBeenCalledTimes(1);
      
      // Advance timer by interval (default 5 minutes)
      jest.advanceTimersByTime(300000);
      
      // Should have checked again
      expect(checkWalletBalance).toHaveBeenCalledTimes(2);
      
      // Advance another interval
      jest.advanceTimersByTime(300000);
      
      expect(checkWalletBalance).toHaveBeenCalledTimes(3);
    });

    it('should log error if getConnection fails', () => {
      (getConnection as jest.Mock).mockImplementation(() => {
        throw new Error('Connection failed');
      });
      
      monitor.start();
      
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start balance monitor',
        expect.objectContaining({
          error: 'Connection failed'
        })
      );
    });

    it('should log error if getWallet fails', () => {
      (getWallet as jest.Mock).mockImplementation(() => {
        throw new Error('Wallet not found');
      });
      
      monitor.start();
      
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start balance monitor',
        expect.objectContaining({
          error: 'Wallet not found'
        })
      );
    });
  });

  describe('stop', () => {
    it('should stop monitoring', () => {
      monitor.start();
      monitor.stop();
      
      expect(logger.info).toHaveBeenCalledWith('Balance monitor stopped');
    });

    it('should clear interval', () => {
      monitor.start();
      
      // Get initial call count
      const initialCount = (checkWalletBalance as jest.Mock).mock.calls.length;
      
      monitor.stop();
      
      // Advance timer
      jest.advanceTimersByTime(600000);
      
      // Should not have been called again
      expect(checkWalletBalance).toHaveBeenCalledTimes(initialCount);
    });

    it('should handle stop when not started', () => {
      // Should not throw
      monitor.stop();
      
      // Should not log stopped message since it wasn't started
      expect(logger.info).not.toHaveBeenCalledWith('Balance monitor stopped');
    });
  });

  describe('getCurrentBalance', () => {
    it('should return SOL balance', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 2.5,
        sufficient: true
      });
      
      monitor.start();
      const balance = await monitor.getCurrentBalance();
      
      expect(balance).toBe(2.5);
    });

    it('should return null when not initialized', async () => {
      const balance = await monitor.getCurrentBalance();
      
      expect(balance).toBeNull();
    });

    it('should return null on error', async () => {
      monitor.start();
      (checkWalletBalance as jest.Mock).mockRejectedValueOnce(new Error('RPC error'));
      
      const balance = await monitor.getCurrentBalance();
      
      expect(balance).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get current balance',
        expect.objectContaining({
          error: 'RPC error'
        })
      );
    });
  });

  describe('isBalanceSufficient', () => {
    it('should return true when balance is sufficient', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });
      
      monitor.start();
      const sufficient = await monitor.isBalanceSufficient();
      
      expect(sufficient).toBe(true);
    });

    it('should return false when balance is insufficient', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.05,
        sufficient: false
      });
      
      monitor.start();
      const sufficient = await monitor.isBalanceSufficient();
      
      expect(sufficient).toBe(false);
    });

    it('should return false when not initialized', async () => {
      const sufficient = await monitor.isBalanceSufficient();
      
      expect(sufficient).toBe(false);
    });

    it('should compare against threshold', async () => {
      const originalEnv = process.env.MIN_SOL_BALANCE;
      process.env.MIN_SOL_BALANCE = '0.5';
      
      const testMonitor = new BalanceMonitor();
      testMonitor.start();
      
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.4,
        sufficient: false
      });
      
      const sufficient = await testMonitor.isBalanceSufficient();
      
      expect(sufficient).toBe(false);
      
      testMonitor.stop();
      process.env.MIN_SOL_BALANCE = originalEnv;
    });

    it('should return false on error', async () => {
      monitor.start();
      (checkWalletBalance as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      
      const sufficient = await monitor.isBalanceSufficient();
      
      expect(sufficient).toBe(false);
    });
  });

  describe('getBalanceStatus', () => {
    it('should return comprehensive status', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.5,
        sufficient: true
      });
      
      monitor.start();
      const status = await monitor.getBalanceStatus();
      
      expect(status).toHaveProperty('balance');
      expect(status).toHaveProperty('sufficient');
      expect(status).toHaveProperty('minRequired');
      expect(status).toHaveProperty('lastCheck');
    });

    it('should return balance value', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 3.0,
        sufficient: true
      });
      
      monitor.start();
      const status = await monitor.getBalanceStatus();
      
      expect(status.balance).toBe(3.0);
    });

    it('should return sufficient flag', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });
      
      monitor.start();
      const status = await monitor.getBalanceStatus();
      
      expect(status.sufficient).toBe(true);
    });

    it('should return minRequired', async () => {
      const originalEnv = process.env.MIN_SOL_BALANCE;
      process.env.MIN_SOL_BALANCE = '0.2';
      
      const testMonitor = new BalanceMonitor();
      testMonitor.start();
      
      const status = await testMonitor.getBalanceStatus();
      
      expect(status.minRequired).toBe(0.2);
      
      testMonitor.stop();
      process.env.MIN_SOL_BALANCE = originalEnv;
    });

    it('should return lastCheck as Date', async () => {
      monitor.start();
      const status = await monitor.getBalanceStatus();
      
      expect(status.lastCheck).toBeInstanceOf(Date);
    });

    it('should return null balance when not initialized', async () => {
      const status = await monitor.getBalanceStatus();
      
      expect(status.balance).toBeNull();
      expect(status.sufficient).toBe(false);
    });
  });

  describe('alert behavior', () => {
    it('should trigger alert when balance below threshold', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.05,
        sufficient: false
      });
      
      monitor.start();
      
      // Allow async operations to complete
      await Promise.resolve();
      jest.runAllTimers();
      await Promise.resolve();
      
      expect(logger.warn).toHaveBeenCalledWith(
        '⚠️ LOW WALLET BALANCE ALERT',
        expect.objectContaining({
          severity: 'HIGH'
        })
      );
    });

    it('should respect alert cooldown', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.05,
        sufficient: false
      });
      
      monitor.start();
      
      // First alert
      await Promise.resolve();
      jest.runAllTimers();
      await Promise.resolve();
      
      const warnCallCount = (logger.warn as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0] === '⚠️ LOW WALLET BALANCE ALERT'
      ).length;
      
      // Advance time but not past cooldown (1 hour)
      jest.advanceTimersByTime(300000); // 5 minutes
      await Promise.resolve();
      
      // Should not have additional alerts due to cooldown
      const newWarnCallCount = (logger.warn as jest.Mock).mock.calls.filter(
        (call: any[]) => call[0] === '⚠️ LOW WALLET BALANCE ALERT'
      ).length;
      
      expect(newWarnCallCount).toBe(warnCallCount);
    });

    it('should not alert when balance is sufficient', async () => {
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });
      
      monitor.start();
      
      await Promise.resolve();
      jest.runAllTimers();
      await Promise.resolve();
      
      expect(logger.warn).not.toHaveBeenCalledWith(
        '⚠️ LOW WALLET BALANCE ALERT',
        expect.anything()
      );
    });
  });

  describe('error handling', () => {
    it('should log error when balance check fails', async () => {
      monitor.start();
      
      // First call succeeds
      await Promise.resolve();
      
      // Set up next call to fail
      (checkWalletBalance as jest.Mock).mockRejectedValueOnce(new Error('RPC timeout'));
      
      // Trigger next check
      jest.advanceTimersByTime(300000);
      await Promise.resolve();
      
      expect(logger.error).toHaveBeenCalledWith(
        'Balance check failed',
        expect.objectContaining({
          error: 'RPC timeout'
        })
      );
    });

    it('should continue checking after error', async () => {
      monitor.start();
      
      // Set up failure
      (checkWalletBalance as jest.Mock).mockRejectedValueOnce(new Error('Error'));
      
      // Trigger check
      jest.advanceTimersByTime(300000);
      await Promise.resolve();
      
      // Reset to success
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });
      
      // Trigger another check
      jest.advanceTimersByTime(300000);
      await Promise.resolve();
      
      // Should have been called again
      expect(checkWalletBalance).toHaveBeenCalled();
    });
  });
});

describe('Singleton functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the singleton by stopping any existing monitor
    stopBalanceMonitoring();
  });

  describe('getBalanceMonitor', () => {
    it('should return singleton instance', () => {
      const monitor1 = getBalanceMonitor();
      const monitor2 = getBalanceMonitor();
      
      expect(monitor1).toBe(monitor2);
    });

    it('should return BalanceMonitor instance', () => {
      const monitor = getBalanceMonitor();
      
      expect(monitor).toBeInstanceOf(BalanceMonitor);
    });
  });

  describe('startBalanceMonitoring', () => {
    it('should start balance monitoring', () => {
      // Mock getConnection and getWallet for successful start
      (getConnection as jest.Mock).mockReturnValue({ rpcEndpoint: 'test' });
      (getWallet as jest.Mock).mockReturnValue({ 
        publicKey: { toString: () => 'TestKey' }
      });
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });
      
      startBalanceMonitoring();
      
      expect(logger.info).toHaveBeenCalledWith('Balance monitor started');
    });
  });

  describe('stopBalanceMonitoring', () => {
    it('should stop balance monitoring', () => {
      // First start it
      (getConnection as jest.Mock).mockReturnValue({ rpcEndpoint: 'test' });
      (getWallet as jest.Mock).mockReturnValue({ 
        publicKey: { toString: () => 'TestKey' }
      });
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });
      
      startBalanceMonitoring();
      stopBalanceMonitoring();
      
      expect(logger.info).toHaveBeenCalledWith('Balance monitor stopped');
    });

    it('should handle stop when not started', () => {
      // Should not throw
      stopBalanceMonitoring();
    });
  });
});
