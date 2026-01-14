import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { BalanceMonitor } from '../../src/services/BalanceMonitor';

// Mock the dependencies
jest.mock('../../src/config/solana');
jest.mock('../../src/utils/solana');

import { getConnection, getWallet } from '../../src/config/solana';
import { checkWalletBalance } from '../../src/utils/solana';
import { Keypair } from '@solana/web3.js';

describe('BalanceMonitor', () => {
  let monitor: BalanceMonitor;
  let mockConnection: any;
  let mockWallet: any;

  beforeEach(() => {
    // Setup mocks
    mockConnection = {};
    mockWallet = Keypair.generate();

    // @ts-ignore - Mock typing
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    // @ts-ignore - Mock typing
    (getWallet as jest.Mock).mockReturnValue(mockWallet);

    process.env.MIN_SOL_BALANCE = '0.1';
    process.env.BALANCE_CHECK_INTERVAL = '1000'; // 1 second for faster tests

    monitor = new BalanceMonitor();
  });

  afterEach(() => {
    monitor.stop();
    jest.clearAllTimers();
  });

  describe('start', () => {
    it('should start monitoring successfully', () => {
      // @ts-ignore - Mock typing
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });

      monitor.start();
      expect(getConnection).toHaveBeenCalled();
      expect(getWallet).toHaveBeenCalled();
    });

    it('should check balance immediately on start', async () => {
      // @ts-ignore - Mock typing
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });

      monitor.start();

      // Wait a bit for async check to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(checkWalletBalance).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop monitoring', () => {
      // @ts-ignore - Mock typing
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });

      monitor.start();
      monitor.stop();

      // Should not throw
      expect(() => monitor.stop()).not.toThrow();
    });
  });

  describe('getCurrentBalance', () => {
    it('should return current balance', async () => {
      // @ts-ignore - Mock typing
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.5,
        sufficient: true
      });

      monitor.start();
      const balance = await monitor.getCurrentBalance();

      expect(balance).toBe(0.5);
    });

    it('should return null if not initialized', async () => {
      const uninitializedMonitor = new BalanceMonitor();
      const balance = await uninitializedMonitor.getCurrentBalance();

      expect(balance).toBeNull();
    });
  });

  describe('isBalanceSufficient', () => {
    it('should return true when balance is sufficient', async () => {
      // @ts-ignore - Mock typing
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 1.0,
        sufficient: true
      });

      monitor.start();
      const result = await monitor.isBalanceSufficient();

      expect(result).toBe(true);
    });

    it('should return false when balance is insufficient', async () => {
      // @ts-ignore - Mock typing
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.05,
        sufficient: false
      });

      monitor.start();
      const result = await monitor.isBalanceSufficient();

      expect(result).toBe(false);
    });

    it('should return false if not initialized', async () => {
      const uninitializedMonitor = new BalanceMonitor();
      const result = await uninitializedMonitor.isBalanceSufficient();

      expect(result).toBe(false);
    });
  });

  describe('getBalanceStatus', () => {
    it('should return complete balance status', async () => {
      // @ts-ignore - Mock typing
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.8,
        sufficient: true
      });

      monitor.start();
      const status = await monitor.getBalanceStatus();

      expect(status).toMatchObject({
        balance: 0.8,
        sufficient: true,
        minRequired: 0.1
      });
      expect(status.lastCheck).toBeInstanceOf(Date);
    });
  });

  describe('low balance alerts', () => {
    it('should alert when balance is low', async () => {
      const consoleSpy = jest.spyOn(console, 'error');

      // @ts-ignore - Mock typing
      (checkWalletBalance as jest.Mock).mockResolvedValue({
        balance: 0.05,
        sufficient: false
      });

      monitor.start();

      // Wait for check to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
