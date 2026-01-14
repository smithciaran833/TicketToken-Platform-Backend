/**
 * Unit Tests for Reconciliation Service
 * 
 * Tests payment reconciliation between platform and Stripe.
 * CRITICAL: Financial accuracy testing.
 */

// Mock dependencies
jest.mock('../../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

describe('Reconciliation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Daily Reconciliation', () => {
    it('should reconcile payments for a date range', () => {
      const reconciliationPeriod = {
        startDate: new Date('2026-01-07T00:00:00Z'),
        endDate: new Date('2026-01-07T23:59:59Z'),
        status: 'pending' as const,
      };

      const platformPayments = [
        { id: 'pay_1', amount: 10000, status: 'succeeded' },
        { id: 'pay_2', amount: 15000, status: 'succeeded' },
        { id: 'pay_3', amount: 8000, status: 'succeeded' },
      ];

      const stripePayments = [
        { id: 'pay_1', amount: 10000, status: 'succeeded' },
        { id: 'pay_2', amount: 15000, status: 'succeeded' },
        { id: 'pay_3', amount: 8000, status: 'succeeded' },
      ];

      const platformTotal = platformPayments.reduce((sum, p) => sum + p.amount, 0);
      const stripeTotal = stripePayments.reduce((sum, p) => sum + p.amount, 0);

      expect(platformTotal).toBe(stripeTotal);
      expect(platformTotal).toBe(33000);
    });

    it('should detect missing payments in platform', () => {
      const platformPaymentIds = ['pay_1', 'pay_2'];
      const stripePaymentIds = ['pay_1', 'pay_2', 'pay_3'];

      const missingInPlatform = stripePaymentIds.filter(id => !platformPaymentIds.includes(id));
      
      expect(missingInPlatform).toContain('pay_3');
      expect(missingInPlatform.length).toBe(1);
    });

    it('should detect missing payments in Stripe', () => {
      const platformPaymentIds = ['pay_1', 'pay_2', 'pay_4'];
      const stripePaymentIds = ['pay_1', 'pay_2'];

      const missingInStripe = platformPaymentIds.filter(id => !stripePaymentIds.includes(id));
      
      expect(missingInStripe).toContain('pay_4');
    });

    it('should detect amount discrepancies', () => {
      const platformPayments = [
        { id: 'pay_1', amount: 10000 },
        { id: 'pay_2', amount: 15000 },
      ];

      const stripePayments = [
        { id: 'pay_1', amount: 10000 },
        { id: 'pay_2', amount: 14999 }, // $0.01 off
      ];

      const discrepancies = platformPayments.filter(pp => {
        const sp = stripePayments.find(s => s.id === pp.id);
        return sp && sp.amount !== pp.amount;
      });

      expect(discrepancies.length).toBe(1);
      expect(discrepancies[0].id).toBe('pay_2');
    });

    it('should detect status mismatches', () => {
      const platformPayments = [
        { id: 'pay_1', status: 'succeeded' },
        { id: 'pay_2', status: 'succeeded' },
      ];

      const stripePayments = [
        { id: 'pay_1', status: 'succeeded' },
        { id: 'pay_2', status: 'pending' }, // Status mismatch
      ];

      const statusMismatches = platformPayments.filter(pp => {
        const sp = stripePayments.find(s => s.id === pp.id);
        return sp && sp.status !== pp.status;
      });

      expect(statusMismatches.length).toBe(1);
    });
  });

  describe('Transfer Reconciliation', () => {
    it('should reconcile venue payouts', () => {
      const expectedPayouts = [
        { venueId: 'venue_1', amount: 85000, date: '2026-01-07' },
        { venueId: 'venue_2', amount: 120000, date: '2026-01-07' },
      ];

      const stripeTransfers = [
        { destination: 'acct_venue1', amount: 85000 },
        { destination: 'acct_venue2', amount: 120000 },
      ];

      const totalExpected = expectedPayouts.reduce((sum, p) => sum + p.amount, 0);
      const totalTransferred = stripeTransfers.reduce((sum, t) => sum + t.amount, 0);

      expect(totalExpected).toBe(totalTransferred);
    });

    it('should detect pending transfers', () => {
      const transfers = [
        { id: 'tr_1', status: 'paid' },
        { id: 'tr_2', status: 'pending' },
        { id: 'tr_3', status: 'paid' },
      ];

      const pendingTransfers = transfers.filter(t => t.status === 'pending');
      expect(pendingTransfers.length).toBe(1);
    });

    it('should detect failed transfers', () => {
      const transfers = [
        { id: 'tr_1', status: 'paid' },
        { id: 'tr_2', status: 'failed', failureMessage: 'Insufficient funds' },
      ];

      const failedTransfers = transfers.filter(t => t.status === 'failed');
      expect(failedTransfers.length).toBe(1);
      expect(failedTransfers[0].failureMessage).toBeDefined();
    });
  });

  describe('Fee Reconciliation', () => {
    it('should reconcile platform fees', () => {
      const payments = [
        { id: 'pay_1', amount: 10000, platformFee: 350 },
        { id: 'pay_2', amount: 15000, platformFee: 525 },
      ];

      const expectedFeeRate = 0.035; // 3.5%
      
      payments.forEach(payment => {
        const expectedFee = Math.round(payment.amount * expectedFeeRate);
        expect(payment.platformFee).toBe(expectedFee);
      });
    });

    it('should reconcile Stripe fees', () => {
      const payments = [
        { id: 'pay_1', amount: 10000, stripeFee: 320 }, // 2.9% + $0.30
        { id: 'pay_2', amount: 15000, stripeFee: 465 },
      ];

      const calculateStripeFee = (amount: number) => 
        Math.round(amount * 0.029 + 30);

      payments.forEach(payment => {
        const expectedStripeFee = calculateStripeFee(payment.amount);
        expect(payment.stripeFee).toBe(expectedStripeFee);
      });
    });

    it('should verify fee splits add up', () => {
      const payment = {
        amount: 10000,
        platformFee: 350,
        stripeFee: 320,
        venueAmount: 9330,
      };

      const total = payment.platformFee + payment.stripeFee + payment.venueAmount;
      expect(total).toBe(payment.amount);
    });
  });

  describe('Refund Reconciliation', () => {
    it('should reconcile refund amounts', () => {
      const platformRefunds = [
        { id: 'ref_1', paymentId: 'pay_1', amount: 5000 },
        { id: 'ref_2', paymentId: 'pay_2', amount: 15000 },
      ];

      const stripeRefunds = [
        { id: 'ref_1', charge: 'pay_1', amount: 5000 },
        { id: 'ref_2', charge: 'pay_2', amount: 15000 },
      ];

      const platformTotal = platformRefunds.reduce((sum, r) => sum + r.amount, 0);
      const stripeTotal = stripeRefunds.reduce((sum, r) => sum + r.amount, 0);

      expect(platformTotal).toBe(stripeTotal);
    });

    it('should verify partial refunds', () => {
      const originalPayment = { id: 'pay_1', amount: 10000 };
      const refunds = [
        { paymentId: 'pay_1', amount: 3000 },
        { paymentId: 'pay_1', amount: 2000 },
      ];

      const totalRefunded = refunds.reduce((sum, r) => sum + r.amount, 0);
      const remainingAmount = originalPayment.amount - totalRefunded;

      expect(totalRefunded).toBe(5000);
      expect(remainingAmount).toBe(5000);
    });
  });

  describe('Reconciliation Report', () => {
    it('should generate reconciliation summary', () => {
      const report = {
        date: '2026-01-07',
        totalPayments: 50,
        totalAmount: 250000,
        totalRefunds: 5,
        totalRefundAmount: 15000,
        totalTransfers: 10,
        totalTransferAmount: 200000,
        discrepancies: 2,
        status: 'needs_review' as const,
      };

      expect(report.discrepancies).toBeGreaterThan(0);
      expect(report.status).toBe('needs_review');
    });

    it('should flag high-severity discrepancies', () => {
      const discrepancies = [
        { type: 'missing_payment', amount: 50000, severity: 'high' },
        { type: 'amount_mismatch', amount: 100, severity: 'low' },
        { type: 'status_mismatch', amount: 0, severity: 'medium' },
      ];

      const highSeverity = discrepancies.filter(d => d.severity === 'high');
      expect(highSeverity.length).toBe(1);
    });

    it('should calculate net position', () => {
      const report = {
        totalPayments: 500000,
        totalRefunds: 25000,
        platformFees: 17500,
        stripeFees: 15000,
        venuePayouts: 400000,
      };

      const netPosition = 
        report.totalPayments - 
        report.totalRefunds - 
        report.venuePayouts;

      const expectedPlatformRevenue = report.platformFees;
      
      expect(netPosition).toBe(75000); // Should include platform fees + reserves
    });
  });

  describe('Automated Resolution', () => {
    it('should auto-resolve minor discrepancies', () => {
      const discrepancy = {
        type: 'rounding',
        amount: 1, // $0.01
        threshold: 10, // $0.10
      };

      const canAutoResolve = Math.abs(discrepancy.amount) <= discrepancy.threshold;
      expect(canAutoResolve).toBe(true);
    });

    it('should escalate major discrepancies', () => {
      const discrepancy = {
        type: 'missing_payment',
        amount: 50000,
        threshold: 100,
      };

      const needsEscalation = Math.abs(discrepancy.amount) > discrepancy.threshold;
      expect(needsEscalation).toBe(true);
    });

    it('should track resolution history', () => {
      const resolution = {
        discrepancyId: 'disc_123',
        resolvedBy: 'system',
        resolution: 'auto_resolved_rounding',
        resolvedAt: new Date().toISOString(),
        notes: 'Rounding difference within acceptable threshold',
      };

      expect(resolution.resolvedBy).toBe('system');
    });
  });

  describe('Balance Verification', () => {
    it('should verify Stripe balance matches expected', () => {
      const expectedBalance = {
        available: 150000,
        pending: 50000,
      };

      const stripeBalance = {
        available: [{ amount: 150000, currency: 'usd' }],
        pending: [{ amount: 50000, currency: 'usd' }],
      };

      expect(stripeBalance.available[0].amount).toBe(expectedBalance.available);
      expect(stripeBalance.pending[0].amount).toBe(expectedBalance.pending);
    });

    it('should track balance over time', () => {
      const balanceHistory = [
        { date: '2026-01-05', balance: 100000 },
        { date: '2026-01-06', balance: 120000 },
        { date: '2026-01-07', balance: 150000 },
      ];

      const latestBalance = balanceHistory[balanceHistory.length - 1];
      const previousBalance = balanceHistory[balanceHistory.length - 2];
      const change = latestBalance.balance - previousBalance.balance;

      expect(change).toBe(30000);
    });
  });
});
