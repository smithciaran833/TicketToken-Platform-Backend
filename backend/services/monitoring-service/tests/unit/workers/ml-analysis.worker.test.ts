// Mock dependencies BEFORE imports
jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { MLAnalysisWorker } from '../../../src/workers/ml-analysis.worker';
import { logger } from '../../../src/logger';

describe('MLAnalysisWorker', () => {
  let worker: MLAnalysisWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: false });
    worker = new MLAnalysisWorker();
  });

  afterEach(async () => {
    await worker.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create instance with null interval', () => {
      expect((worker as any).interval).toBeNull();
    });
  });

  describe('start', () => {
    it('should log starting message', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Starting ML Analysis Worker...');
    });

    it('should run initial analysis immediately', async () => {
      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Running ML analysis...');
    });

    it('should log success message after starting', async () => {
      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('ML Analysis Worker started successfully');
    });

    it('should set up interval for periodic analysis', async () => {
      await worker.start();

      expect(jest.getTimerCount()).toBe(1);
    });

    it('should analyze every 10 minutes', async () => {
      await worker.start();
      jest.clearAllMocks();

      // Advance 10 minutes
      jest.advanceTimersByTime(10 * 60 * 1000);
      await Promise.resolve();

      expect(logger.debug).toHaveBeenCalledWith('Running ML analysis...');
    });

    it('should handle initial analysis failure', async () => {
      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Analysis failed');
      });

      await expect(worker.start()).rejects.toThrow('Analysis failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to start ML Analysis Worker:',
        expect.any(Error)
      );
    });

    it('should log error if analysis cycle fails', async () => {
      await worker.start();
      jest.clearAllMocks();

      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Cycle failed');
      });

      jest.advanceTimersByTime(10 * 60 * 1000);
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        'ML analysis cycle failed:',
        expect.any(Error)
      );
    });
  });

  describe('analyze', () => {
    it('should log running ML analysis', async () => {
      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Running ML analysis...');
    });

    it('should analyze payment patterns', async () => {
      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Analyzing payment patterns...');
      expect(logger.debug).toHaveBeenCalledWith('Payment pattern analysis completed');
    });

    it('should analyze ticket sales', async () => {
      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Analyzing ticket sales...');
      expect(logger.debug).toHaveBeenCalledWith('Ticket sales analysis completed');
    });

    it('should analyze system performance', async () => {
      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Analyzing system performance...');
      expect(logger.debug).toHaveBeenCalledWith('System performance analysis completed');
    });

    it('should predict future load', async () => {
      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Predicting future load...');
      expect(logger.debug).toHaveBeenCalledWith('Load prediction completed');
    });

    it('should log completion message', async () => {
      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('ML analysis completed');
    });

    it('should run all analysis tasks in order', async () => {
      const callOrder: string[] = [];
      (logger.debug as jest.Mock).mockImplementation((msg: string) => {
        callOrder.push(msg);
      });

      await worker.start();

      const expectedOrder = [
        'Running ML analysis...',
        'Analyzing payment patterns...',
        'Payment pattern analysis completed',
        'Analyzing ticket sales...',
        'Ticket sales analysis completed',
        'Analyzing system performance...',
        'System performance analysis completed',
        'Predicting future load...',
        'Load prediction completed',
        'ML analysis completed',
      ];

      expect(callOrder).toEqual(expectedOrder);
    });
  });

  describe('analyzePaymentPatterns', () => {
    it('should log start and completion', async () => {
      await (worker as any).analyzePaymentPatterns();

      expect(logger.debug).toHaveBeenCalledWith('Analyzing payment patterns...');
      expect(logger.debug).toHaveBeenCalledWith('Payment pattern analysis completed');
    });

    it('should throw error on failure', async () => {
      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Payment analysis failed');
      });

      await expect((worker as any).analyzePaymentPatterns()).rejects.toThrow('Payment analysis failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Payment pattern analysis failed:',
        expect.any(Error)
      );
    });
  });

  describe('analyzeTicketSales', () => {
    it('should log start and completion', async () => {
      await (worker as any).analyzeTicketSales();

      expect(logger.debug).toHaveBeenCalledWith('Analyzing ticket sales...');
      expect(logger.debug).toHaveBeenCalledWith('Ticket sales analysis completed');
    });

    it('should throw error on failure', async () => {
      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Sales analysis failed');
      });

      await expect((worker as any).analyzeTicketSales()).rejects.toThrow('Sales analysis failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Ticket sales analysis failed:',
        expect.any(Error)
      );
    });
  });

  describe('analyzeSystemPerformance', () => {
    it('should log start and completion', async () => {
      await (worker as any).analyzeSystemPerformance();

      expect(logger.debug).toHaveBeenCalledWith('Analyzing system performance...');
      expect(logger.debug).toHaveBeenCalledWith('System performance analysis completed');
    });

    it('should throw error on failure', async () => {
      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Performance analysis failed');
      });

      await expect((worker as any).analyzeSystemPerformance()).rejects.toThrow('Performance analysis failed');

      expect(logger.error).toHaveBeenCalledWith(
        'System performance analysis failed:',
        expect.any(Error)
      );
    });
  });

  describe('predictLoad', () => {
    it('should log start and completion', async () => {
      await (worker as any).predictLoad();

      expect(logger.debug).toHaveBeenCalledWith('Predicting future load...');
      expect(logger.debug).toHaveBeenCalledWith('Load prediction completed');
    });

    it('should throw error on failure', async () => {
      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Load prediction failed');
      });

      await expect((worker as any).predictLoad()).rejects.toThrow('Load prediction failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Load prediction failed:',
        expect.any(Error)
      );
    });
  });

  describe('stop', () => {
    it('should clear the interval', async () => {
      await worker.start();

      expect(jest.getTimerCount()).toBe(1);

      await worker.stop();

      expect(jest.getTimerCount()).toBe(0);
    });

    it('should set interval to null', async () => {
      await worker.start();
      await worker.stop();

      expect((worker as any).interval).toBeNull();
    });

    it('should log stopped message', async () => {
      await worker.start();
      jest.clearAllMocks();

      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('ML Analysis Worker stopped');
    });

    it('should handle stop when not started', async () => {
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('ML Analysis Worker stopped');
    });

    it('should be idempotent', async () => {
      await worker.start();

      await worker.stop();
      await worker.stop();

      expect(logger.info).toHaveBeenCalledWith('ML Analysis Worker stopped');
    });
  });

  describe('multiple analysis cycles', () => {
    it('should run complete analysis when analyze method is called', async () => {
      // Directly test the analyze method to verify full cycle runs
      await (worker as any).analyze();

      expect(logger.debug).toHaveBeenCalledWith('Running ML analysis...');
      expect(logger.debug).toHaveBeenCalledWith('Analyzing payment patterns...');
      expect(logger.debug).toHaveBeenCalledWith('Payment pattern analysis completed');
      expect(logger.debug).toHaveBeenCalledWith('Analyzing ticket sales...');
      expect(logger.debug).toHaveBeenCalledWith('Ticket sales analysis completed');
      expect(logger.debug).toHaveBeenCalledWith('Analyzing system performance...');
      expect(logger.debug).toHaveBeenCalledWith('System performance analysis completed');
      expect(logger.debug).toHaveBeenCalledWith('Predicting future load...');
      expect(logger.debug).toHaveBeenCalledWith('Load prediction completed');
      expect(logger.debug).toHaveBeenCalledWith('ML analysis completed');
    });

    it('should handle error in one cycle and continue', async () => {
      await worker.start();
      jest.clearAllMocks();

      // First cycle will fail
      (logger.debug as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Temporary failure');
      });

      jest.advanceTimersByTime(10 * 60 * 1000);
      await Promise.resolve();

      expect(logger.error).toHaveBeenCalledWith(
        'ML analysis cycle failed:',
        expect.any(Error)
      );

      jest.clearAllMocks();

      // Second cycle should work
      jest.advanceTimersByTime(10 * 60 * 1000);
      await Promise.resolve();

      expect(logger.debug).toHaveBeenCalledWith('Running ML analysis...');
    });

    it('should be able to run multiple analyses directly', async () => {
      // Run analyze multiple times
      await (worker as any).analyze();
      jest.clearAllMocks();
      
      await (worker as any).analyze();
      
      expect(logger.debug).toHaveBeenCalledWith('Running ML analysis...');
      expect(logger.debug).toHaveBeenCalledWith('ML analysis completed');
    });
  });

  describe('restart behavior', () => {
    it('should allow restart after stop', async () => {
      await worker.start();
      await worker.stop();

      jest.clearAllMocks();

      await worker.start();

      expect(logger.info).toHaveBeenCalledWith('Starting ML Analysis Worker...');
      expect(logger.info).toHaveBeenCalledWith('ML Analysis Worker started successfully');
    });

    it('should run full analysis on restart', async () => {
      await worker.start();
      await worker.stop();

      jest.clearAllMocks();

      await worker.start();

      expect(logger.debug).toHaveBeenCalledWith('Running ML analysis...');
      expect(logger.debug).toHaveBeenCalledWith('Analyzing payment patterns...');
      expect(logger.debug).toHaveBeenCalledWith('Analyzing ticket sales...');
      expect(logger.debug).toHaveBeenCalledWith('Analyzing system performance...');
      expect(logger.debug).toHaveBeenCalledWith('Predicting future load...');
      expect(logger.debug).toHaveBeenCalledWith('ML analysis completed');
    });
  });
});
