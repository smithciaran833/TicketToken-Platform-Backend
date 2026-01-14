/**
 * Stripe Connect Webhook Handlers Tests
 * Tests for handling Stripe Connect webhook events
 */

// Mock database
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue(mockClient),
};

jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => mockPool,
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Mock metrics
jest.mock('../../../src/routes/metrics.routes', () => ({
  recordWebhook: jest.fn(),
}));

import {
  handleTransferReversed,
  handleTransferFailed,
  handlePayoutFailed,
  handlePayoutPaid,
  handleDisputeCreated,
  handleDisputeClosed,
  stripeConnectHandlers,
} from '../../../src/webhooks/stripe-connect-handlers';
import { recordWebhook } from '../../../src/routes/metrics.routes';
import Stripe from 'stripe';

describe('Stripe Connect Webhook Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient.query.mockReset();
    mockPool.query.mockReset();
  });

  describe('handleTransferReversed', () => {
    const createTransferEvent = (transferId: string, amount: number): Stripe.Event => ({
      id: 'evt_transfer_reversed',
      object: 'event',
      type: 'transfer.reversed',
      data: {
        object: {
          id: transferId,
          object: 'transfer',
          amount,
          destination: 'acct_123',
          metadata: { reversal_reason: 'refund' },
        } as Stripe.Transfer,
      },
      api_version: '2023-10-16',
      created: Date.now(),
      livemode: false,
      pending_webhooks: 0,
      request: null,
    });

    it('should process transfer reversal successfully', async () => {
      const event = createTransferEvent('tr_123', 10000);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 'transfer_rec_1',
            venue_id: 'venue_123',
            tenant_id: 'tenant_456',
          }],
        }) // SELECT transfer
        .mockResolvedValueOnce({}) // UPDATE transfer
        .mockResolvedValueOnce({}) // UPDATE venue balance
        .mockResolvedValueOnce({}) // INSERT audit log
        .mockResolvedValueOnce({}); // COMMIT

      await handleTransferReversed(event);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN ISOLATION LEVEL SERIALIZABLE');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(recordWebhook).toHaveBeenCalledWith('transfer.reversed', true);
    });

    it('should handle transfer not found', async () => {
      const event = createTransferEvent('tr_unknown', 5000);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SELECT - not found
        .mockResolvedValueOnce({}); // COMMIT

      await handleTransferReversed(event);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      // Should still commit, just log warning
    });

    it('should rollback on error', async () => {
      const event = createTransferEvent('tr_error', 5000);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(handleTransferReversed(event)).rejects.toThrow('Database error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(recordWebhook).toHaveBeenCalledWith('transfer.reversed', false);
    });

    it('should always release client', async () => {
      const event = createTransferEvent('tr_release', 5000);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      await handleTransferReversed(event);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should update venue balance on reversal', async () => {
      const event = createTransferEvent('tr_balance', 15000);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            id: 'transfer_rec_2',
            venue_id: 'venue_abc',
            tenant_id: 'tenant_xyz',
          }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await handleTransferReversed(event);

      // Check that venue balance update was called
      const balanceUpdateCall = mockClient.query.mock.calls.find(
        call => call[0]?.includes('venue_balances')
      );
      expect(balanceUpdateCall).toBeDefined();
      expect(balanceUpdateCall[1]).toContain(15000);
    });
  });

  describe('handleTransferFailed', () => {
    const createTransferFailedEvent = (transferId: string, amount: number): Stripe.Event => ({
      id: 'evt_transfer_failed',
      object: 'event',
      type: 'transfer.failed',
      data: {
        object: {
          id: transferId,
          object: 'transfer',
          amount,
          destination: 'acct_456',
          failure_message: 'Insufficient funds',
        } as any,
      },
      api_version: '2023-10-16',
      created: Date.now(),
      livemode: false,
      pending_webhooks: 0,
      request: null,
    });

    it('should record transfer failure', async () => {
      const event = createTransferFailedEvent('tr_failed', 20000);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // UPDATE transfer
        .mockResolvedValueOnce({}) // INSERT pending_transfers
        .mockResolvedValueOnce({}); // COMMIT

      await handleTransferFailed(event);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(recordWebhook).toHaveBeenCalledWith('transfer.failed', true);
    });

    it('should queue transfer for retry', async () => {
      const event = createTransferFailedEvent('tr_retry', 10000);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await handleTransferFailed(event);

      const retryCall = mockClient.query.mock.calls.find(
        call => call[0]?.includes('pending_transfers')
      );
      expect(retryCall).toBeDefined();
      expect(retryCall[0]).toContain('pending_retry');
    });

    it('should rollback on error', async () => {
      const event = createTransferFailedEvent('tr_err', 5000);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('DB Error'));

      await expect(handleTransferFailed(event)).rejects.toThrow('DB Error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(recordWebhook).toHaveBeenCalledWith('transfer.failed', false);
    });
  });

  describe('handlePayoutFailed', () => {
    const createPayoutFailedEvent = (payoutId: string, amount: number, failureCode?: string): Stripe.Event => ({
      id: 'evt_payout_failed',
      object: 'event',
      type: 'payout.failed',
      account: 'acct_connected_123',
      data: {
        object: {
          id: payoutId,
          object: 'payout',
          amount,
          failure_code: failureCode || 'account_closed',
          failure_message: 'The account was closed',
        } as Stripe.Payout,
      },
      api_version: '2023-10-16',
      created: Date.now(),
      livemode: false,
      pending_webhooks: 0,
      request: null,
    });

    it('should record payout failure', async () => {
      const event = createPayoutFailedEvent('po_failed', 50000);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'acc_1' }] }) // SELECT account
        .mockResolvedValueOnce({}) // INSERT payout_events
        .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // SELECT failure count
        .mockResolvedValueOnce({}); // COMMIT

      await handlePayoutFailed(event);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(recordWebhook).toHaveBeenCalledWith('payout.failed', true);
    });

    it('should suspend payouts after 3 failures', async () => {
      const event = createPayoutFailedEvent('po_suspend', 30000);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'acc_2' }] }) // SELECT account
        .mockResolvedValueOnce({}) // INSERT payout_events
        .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // 3 failures
        .mockResolvedValueOnce({}) // UPDATE account - suspend
        .mockResolvedValueOnce({}); // COMMIT

      await handlePayoutFailed(event);

      const suspendCall = mockClient.query.mock.calls.find(
        call => call[0]?.includes('payout_status') && call[0]?.includes('suspended')
      );
      expect(suspendCall).toBeDefined();
    });

    it('should not suspend payouts with less than 3 failures', async () => {
      const event = createPayoutFailedEvent('po_nosuspend', 25000);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'acc_3' }] }) // SELECT account
        .mockResolvedValueOnce({}) // INSERT payout_events
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // Only 2 failures
        .mockResolvedValueOnce({}); // COMMIT

      await handlePayoutFailed(event);

      const suspendCall = mockClient.query.mock.calls.find(
        call => call[0]?.includes('payout_status') && call[0]?.includes('suspended')
      );
      expect(suspendCall).toBeUndefined();
    });

    it('should rollback on error', async () => {
      const event = createPayoutFailedEvent('po_error', 10000);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Payout DB Error'));

      await expect(handlePayoutFailed(event)).rejects.toThrow('Payout DB Error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(recordWebhook).toHaveBeenCalledWith('payout.failed', false);
    });
  });

  describe('handlePayoutPaid', () => {
    const createPayoutPaidEvent = (payoutId: string, amount: number): Stripe.Event => ({
      id: 'evt_payout_paid',
      object: 'event',
      type: 'payout.paid',
      account: 'acct_connected_456',
      data: {
        object: {
          id: payoutId,
          object: 'payout',
          amount,
        } as Stripe.Payout,
      },
      api_version: '2023-10-16',
      created: Date.now(),
      livemode: false,
      pending_webhooks: 0,
      request: null,
    });

    it('should record successful payout', async () => {
      const event = createPayoutPaidEvent('po_paid', 100000);

      mockPool.query.mockResolvedValueOnce({});

      await handlePayoutPaid(event);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payout_events'),
        expect.arrayContaining(['acct_connected_456', 'po_paid', 100000])
      );
      expect(recordWebhook).toHaveBeenCalledWith('payout.paid', true);
    });

    it('should handle database error', async () => {
      const event = createPayoutPaidEvent('po_db_err', 50000);

      mockPool.query.mockRejectedValueOnce(new Error('Insert error'));

      await expect(handlePayoutPaid(event)).rejects.toThrow('Insert error');
      expect(recordWebhook).toHaveBeenCalledWith('payout.paid', false);
    });
  });

  describe('handleDisputeCreated', () => {
    const createDisputeEvent = (disputeId: string, chargeId: string, amount: number): Stripe.Event => ({
      id: 'evt_dispute_created',
      object: 'event',
      type: 'charge.dispute.created',
      data: {
        object: {
          id: disputeId,
          object: 'dispute',
          charge: chargeId,
          amount,
          reason: 'fraudulent',
          evidence_details: {
            due_by: Math.floor(Date.now() / 1000) + 86400 * 7,
          },
        } as unknown as Stripe.Dispute,
      },
      api_version: '2023-10-16',
      created: Date.now(),
      livemode: false,
      pending_webhooks: 0,
      request: null,
    });

    it('should create dispute record and hold funds', async () => {
      const event = createDisputeEvent('dp_123', 'ch_123', 10000);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 'payment_123',
            tenant_id: 'tenant_789',
            transfer_id: 'transfer_456',
            stripe_transfer_id: 'tr_stripe',
            transfer_amount: 9500,
          }],
        }) // SELECT payment
        .mockResolvedValueOnce({}) // INSERT dispute
        .mockResolvedValueOnce({}) // UPDATE payment status
        .mockResolvedValueOnce({}) // UPDATE transfer status
        .mockResolvedValueOnce({}) // UPDATE venue balance
        .mockResolvedValueOnce({}); // COMMIT

      await handleDisputeCreated(event);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN ISOLATION LEVEL SERIALIZABLE');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(recordWebhook).toHaveBeenCalledWith('charge.dispute.created', true);
    });

    it('should handle payment not found', async () => {
      const event = createDisputeEvent('dp_notfound', 'ch_notfound', 5000);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Payment not found
        .mockResolvedValueOnce({}); // COMMIT

      await handleDisputeCreated(event);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should update payment status to disputed', async () => {
      const event = createDisputeEvent('dp_status', 'ch_status', 8000);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            id: 'payment_status',
            tenant_id: 'tenant_status',
            transfer_id: null,
            transfer_amount: null,
          }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await handleDisputeCreated(event);

      const statusUpdateCall = mockClient.query.mock.calls.find(
        call => call[0]?.includes("status = 'disputed'")
      );
      expect(statusUpdateCall).toBeDefined();
    });

    it('should rollback on error', async () => {
      const event = createDisputeEvent('dp_error', 'ch_error', 5000);

      mockClient.query
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Dispute DB Error'));

      await expect(handleDisputeCreated(event)).rejects.toThrow('Dispute DB Error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(recordWebhook).toHaveBeenCalledWith('charge.dispute.created', false);
    });
  });

  describe('handleDisputeClosed', () => {
    const createDisputeClosedEvent = (disputeId: string, status: string): Stripe.Event => ({
      id: 'evt_dispute_closed',
      object: 'event',
      type: 'charge.dispute.closed',
      data: {
        object: {
          id: disputeId,
          object: 'dispute',
          charge: 'ch_closed',
          amount: 10000,
          status,
        } as unknown as Stripe.Dispute,
      },
      api_version: '2023-10-16',
      created: Date.now(),
      livemode: false,
      pending_webhooks: 0,
      request: null,
    });

    it('should handle dispute won - release funds', async () => {
      const event = createDisputeClosedEvent('dp_won', 'won');

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 'dispute_rec_1',
            payment_id: 'payment_won',
            tenant_id: 'tenant_won',
            transfer_id: 'transfer_won',
            transfer_amount: 9500,
            venue_id: 'venue_won',
          }],
        }) // SELECT dispute
        .mockResolvedValueOnce({}) // UPDATE dispute status
        .mockResolvedValueOnce({}) // UPDATE payment status
        .mockResolvedValueOnce({}) // UPDATE venue balance - release
        .mockResolvedValueOnce({}) // UPDATE transfer status
        .mockResolvedValueOnce({}); // COMMIT

      await handleDisputeClosed(event);

      const balanceCall = mockClient.query.mock.calls.find(
        call => call[0]?.includes('available_balance = available_balance + ')
      );
      expect(balanceCall).toBeDefined();
      expect(recordWebhook).toHaveBeenCalledWith('charge.dispute.closed', true);
    });

    it('should handle dispute lost - deduct funds', async () => {
      const event = createDisputeClosedEvent('dp_lost', 'lost');

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{
            id: 'dispute_rec_2',
            payment_id: 'payment_lost',
            tenant_id: 'tenant_lost',
            transfer_id: 'transfer_lost',
            transfer_amount: 9500,
            venue_id: 'venue_lost',
          }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await handleDisputeClosed(event);

      const lostCall = mockClient.query.mock.calls.find(
        call => call[0]?.includes('lost_to_disputes')
      );
      expect(lostCall).toBeDefined();
    });

    it('should handle dispute not found', async () => {
      const event = createDisputeClosedEvent('dp_notfound', 'won');

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      await handleDisputeClosed(event);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should update payment status based on outcome', async () => {
      const event = createDisputeClosedEvent('dp_outcome', 'won');

      mockClient.query
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            id: 'dispute_outcome',
            payment_id: 'payment_outcome',
            tenant_id: 'tenant_outcome',
            transfer_id: 'transfer_outcome',
            transfer_amount: 8000,
            venue_id: 'venue_outcome',
          }],
        })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      await handleDisputeClosed(event);

      const paymentStatusCall = mockClient.query.mock.calls.find(
        call => call[0]?.includes("status = $1") && call[1]?.includes('succeeded')
      );
      expect(paymentStatusCall).toBeDefined();
    });

    it('should rollback on error', async () => {
      const event = createDisputeClosedEvent('dp_err', 'won');

      mockClient.query
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Dispute close error'));

      await expect(handleDisputeClosed(event)).rejects.toThrow('Dispute close error');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(recordWebhook).toHaveBeenCalledWith('charge.dispute.closed', false);
    });
  });

  describe('stripeConnectHandlers registry', () => {
    it('should have handler for transfer.reversed', () => {
      expect(stripeConnectHandlers['transfer.reversed']).toBe(handleTransferReversed);
    });

    it('should have handler for transfer.failed', () => {
      expect(stripeConnectHandlers['transfer.failed']).toBe(handleTransferFailed);
    });

    it('should have handler for payout.failed', () => {
      expect(stripeConnectHandlers['payout.failed']).toBe(handlePayoutFailed);
    });

    it('should have handler for payout.paid', () => {
      expect(stripeConnectHandlers['payout.paid']).toBe(handlePayoutPaid);
    });

    it('should have handler for charge.dispute.created', () => {
      expect(stripeConnectHandlers['charge.dispute.created']).toBe(handleDisputeCreated);
    });

    it('should have handler for charge.dispute.closed', () => {
      expect(stripeConnectHandlers['charge.dispute.closed']).toBe(handleDisputeClosed);
    });

    it('should have handler for charge.dispute.updated', () => {
      expect(stripeConnectHandlers['charge.dispute.updated']).toBe(handleDisputeCreated);
    });
  });
});
