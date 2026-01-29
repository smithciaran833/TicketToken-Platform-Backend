/**
 * Test Fixtures
 * 
 * Factory functions to create test data. All amounts in cents.
 */

import { v4 as uuidv4 } from 'uuid';
import { getPgPool } from './test-containers';
import { setTenantContextOnClient } from './database';
import { PoolClient } from 'pg';

// ============================================================================
// Default Test Tenant
// ============================================================================

export const DEFAULT_TENANT_ID = '11111111-1111-1111-1111-111111111111';
export const SECONDARY_TENANT_ID = '22222222-2222-2222-2222-222222222222';

// ============================================================================
// Tenant Fixtures
// ============================================================================

export interface TenantFixture {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, any>;
  created_at: Date;
}

export async function createTenant(overrides: Partial<TenantFixture> = {}): Promise<TenantFixture> {
  const pool = await getPgPool();
  const tenant: TenantFixture = {
    id: overrides.id || uuidv4(),
    name: overrides.name || 'Test Tenant',
    slug: overrides.slug || `tenant-${Date.now()}`,
    settings: overrides.settings || {},
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO tenants (id, name, slug, settings, created_at)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO NOTHING
  `, [tenant.id, tenant.name, tenant.slug, JSON.stringify(tenant.settings), tenant.created_at]);

  return tenant;
}

// ============================================================================
// User Fixtures
// ============================================================================

export interface UserFixture {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  roles: string[];
  created_at: Date;
}

export async function createUser(overrides: Partial<UserFixture> = {}): Promise<UserFixture> {
  const pool = await getPgPool();
  const user: UserFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    email: overrides.email || `user-${Date.now()}@test.com`,
    name: overrides.name || 'Test User',
    roles: overrides.roles || ['user'],
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO users (id, tenant_id, email, name, roles, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [user.id, user.tenant_id, user.email, user.name, user.roles, user.created_at]);

  return user;
}

// ============================================================================
// Venue Fixtures
// ============================================================================

export interface VenueFixture {
  id: string;
  tenant_id: string;
  name: string;
  stripe_account_id: string;
  pricing_tier: 'standard' | 'professional' | 'enterprise';
  settings: Record<string, any>;
  created_at: Date;
}

export async function createVenue(overrides: Partial<VenueFixture> = {}): Promise<VenueFixture> {
  const pool = await getPgPool();
  const venue: VenueFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    name: overrides.name || 'Test Venue',
    stripe_account_id: overrides.stripe_account_id || `acct_test_${Date.now()}`,
    pricing_tier: overrides.pricing_tier || 'standard',
    settings: overrides.settings || {},
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO venues (id, tenant_id, name, stripe_account_id, pricing_tier, settings, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [venue.id, venue.tenant_id, venue.name, venue.stripe_account_id, venue.pricing_tier, JSON.stringify(venue.settings), venue.created_at]);

  return venue;
}

// ============================================================================
// Venue Balance Fixtures
// ============================================================================

export interface VenueBalanceFixture {
  id: string;
  tenant_id: string;
  venue_id: string;
  available_balance: number;
  pending_balance: number;
  reserved_balance: number;
  currency: string;
  updated_at: Date;
}

export async function createVenueBalance(overrides: Partial<VenueBalanceFixture> = {}): Promise<VenueBalanceFixture> {
  const pool = await getPgPool();
  const balance: VenueBalanceFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    venue_id: overrides.venue_id || uuidv4(),
    available_balance: overrides.available_balance ?? 0,
    pending_balance: overrides.pending_balance ?? 0,
    reserved_balance: overrides.reserved_balance ?? 0,
    currency: overrides.currency || 'USD',
    updated_at: overrides.updated_at || new Date(),
  };

  await pool.query(`
    INSERT INTO venue_balances (id, tenant_id, venue_id, available_balance, pending_balance, reserved_balance, currency, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [balance.id, balance.tenant_id, balance.venue_id, balance.available_balance, balance.pending_balance, balance.reserved_balance, balance.currency, balance.updated_at]);

  return balance;
}

// ============================================================================
// Event Fixtures
// ============================================================================

export interface EventFixture {
  id: string;
  tenant_id: string;
  venue_id: string;
  name: string;
  date: Date;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  created_at: Date;
}

export async function createEvent(overrides: Partial<EventFixture> = {}): Promise<EventFixture> {
  const pool = await getPgPool();
  const event: EventFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    venue_id: overrides.venue_id || uuidv4(),
    name: overrides.name || 'Test Event',
    date: overrides.date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    status: overrides.status || 'published',
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO events (id, tenant_id, venue_id, name, date, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [event.id, event.tenant_id, event.venue_id, event.name, event.date, event.status, event.created_at]);

  return event;
}

// ============================================================================
// Order Fixtures
// ============================================================================

export interface OrderFixture {
  id: string;
  tenant_id: string;
  user_id: string;
  event_id: string;
  status: 'pending' | 'paid' | 'completed' | 'cancelled' | 'refunded';
  total_amount: number;
  currency: string;
  created_at: Date;
}

export async function createOrder(overrides: Partial<OrderFixture> = {}): Promise<OrderFixture> {
  const pool = await getPgPool();
  const order: OrderFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    user_id: overrides.user_id || uuidv4(),
    event_id: overrides.event_id || uuidv4(),
    status: overrides.status || 'pending',
    total_amount: overrides.total_amount ?? 10000, // $100.00
    currency: overrides.currency || 'USD',
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO orders (id, tenant_id, user_id, event_id, status, total_amount, currency, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [order.id, order.tenant_id, order.user_id, order.event_id, order.status, order.total_amount, order.currency, order.created_at]);

  return order;
}

// ============================================================================
// Payment Transaction Fixtures
// ============================================================================

export interface PaymentTransactionFixture {
  id: string;
  tenant_id: string;
  order_id: string;
  venue_id: string;
  user_id: string;
  stripe_payment_intent_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';
  platform_fee: number;
  stripe_fee: number;
  venue_payout: number;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export async function createPaymentTransaction(overrides: Partial<PaymentTransactionFixture> = {}): Promise<PaymentTransactionFixture> {
  const pool = await getPgPool();
  const amount = overrides.amount ?? 10000;
  const platformFee = overrides.platform_fee ?? Math.round(amount * 0.05);
  const stripeFee = overrides.stripe_fee ?? Math.round(amount * 0.029) + 30;
  
  const payment: PaymentTransactionFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    order_id: overrides.order_id || uuidv4(),
    venue_id: overrides.venue_id || uuidv4(),
    user_id: overrides.user_id || uuidv4(),
    stripe_payment_intent_id: overrides.stripe_payment_intent_id || `pi_test_${Date.now()}`,
    amount,
    currency: overrides.currency || 'USD',
    status: overrides.status || 'pending',
    platform_fee: platformFee,
    stripe_fee: stripeFee,
    venue_payout: overrides.venue_payout ?? (amount - platformFee - stripeFee),
    metadata: overrides.metadata || {},
    created_at: overrides.created_at || new Date(),
    updated_at: overrides.updated_at || new Date(),
  };

  await pool.query(`
    INSERT INTO payment_transactions (
      id, tenant_id, order_id, venue_id, user_id, stripe_payment_intent_id,
      amount, currency, status, platform_fee, stripe_fee, venue_payout,
      metadata, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
  `, [
    payment.id, payment.tenant_id, payment.order_id, payment.venue_id, payment.user_id,
    payment.stripe_payment_intent_id, payment.amount, payment.currency, payment.status,
    payment.platform_fee, payment.stripe_fee, payment.venue_payout,
    JSON.stringify(payment.metadata), payment.created_at, payment.updated_at
  ]);

  return payment;
}

// ============================================================================
// Payment Refund Fixtures
// ============================================================================

export interface PaymentRefundFixture {
  id: string;
  tenant_id: string;
  payment_transaction_id: string;
  stripe_refund_id: string;
  amount: number;
  reason: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  created_at: Date;
}

export async function createPaymentRefund(overrides: Partial<PaymentRefundFixture> = {}): Promise<PaymentRefundFixture> {
  const pool = await getPgPool();
  const refund: PaymentRefundFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    payment_transaction_id: overrides.payment_transaction_id || uuidv4(),
    stripe_refund_id: overrides.stripe_refund_id || `re_test_${Date.now()}`,
    amount: overrides.amount ?? 5000,
    reason: overrides.reason || 'requested_by_customer',
    status: overrides.status || 'pending',
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO payment_refunds (id, tenant_id, payment_transaction_id, stripe_refund_id, amount, reason, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [refund.id, refund.tenant_id, refund.payment_transaction_id, refund.stripe_refund_id, refund.amount, refund.reason, refund.status, refund.created_at]);

  return refund;
}

// ============================================================================
// Stripe Transfer Fixtures
// ============================================================================

export interface StripeTransferFixture {
  id: string;
  tenant_id: string;
  payment_transaction_id: string;
  venue_id: string;
  stripe_transfer_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'reversed';
  created_at: Date;
}

export async function createStripeTransfer(overrides: Partial<StripeTransferFixture> = {}): Promise<StripeTransferFixture> {
  const pool = await getPgPool();
  const transfer: StripeTransferFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    payment_transaction_id: overrides.payment_transaction_id || uuidv4(),
    venue_id: overrides.venue_id || uuidv4(),
    stripe_transfer_id: overrides.stripe_transfer_id || `tr_test_${Date.now()}`,
    amount: overrides.amount ?? 8000,
    currency: overrides.currency || 'USD',
    status: overrides.status || 'pending',
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO stripe_transfers (id, tenant_id, payment_transaction_id, venue_id, stripe_transfer_id, amount, currency, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [transfer.id, transfer.tenant_id, transfer.payment_transaction_id, transfer.venue_id, transfer.stripe_transfer_id, transfer.amount, transfer.currency, transfer.status, transfer.created_at]);

  return transfer;
}

// ============================================================================
// Escrow Fixtures
// ============================================================================

export interface EscrowFixture {
  id: string;
  tenant_id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  status: 'pending' | 'funded' | 'released' | 'refunded' | 'disputed';
  stripe_payment_intent_id: string;
  created_at: Date;
}

export async function createEscrow(overrides: Partial<EscrowFixture> = {}): Promise<EscrowFixture> {
  const pool = await getPgPool();
  const escrow: EscrowFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    order_id: overrides.order_id || uuidv4(),
    buyer_id: overrides.buyer_id || uuidv4(),
    seller_id: overrides.seller_id || uuidv4(),
    amount: overrides.amount ?? 15000,
    status: overrides.status || 'pending',
    stripe_payment_intent_id: overrides.stripe_payment_intent_id || `pi_escrow_${Date.now()}`,
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO escrow_accounts (id, tenant_id, order_id, buyer_id, seller_id, amount, status, stripe_payment_intent_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [escrow.id, escrow.tenant_id, escrow.order_id, escrow.buyer_id, escrow.seller_id, escrow.amount, escrow.status, escrow.stripe_payment_intent_id, escrow.created_at]);

  return escrow;
}

// ============================================================================
// Group Payment Fixtures
// ============================================================================

export interface GroupPaymentFixture {
  id: string;
  tenant_id: string;
  organizer_id: string;
  event_id: string;
  total_amount: number;
  status: 'pending' | 'partial' | 'complete' | 'expired' | 'cancelled';
  deadline: Date;
  created_at: Date;
}

export async function createGroupPayment(overrides: Partial<GroupPaymentFixture> = {}): Promise<GroupPaymentFixture> {
  const pool = await getPgPool();
  const group: GroupPaymentFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    organizer_id: overrides.organizer_id || uuidv4(),
    event_id: overrides.event_id || uuidv4(),
    total_amount: overrides.total_amount ?? 50000,
    status: overrides.status || 'pending',
    deadline: overrides.deadline || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO group_payments (id, tenant_id, organizer_id, event_id, total_amount, status, deadline, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [group.id, group.tenant_id, group.organizer_id, group.event_id, group.total_amount, group.status, group.deadline, group.created_at]);

  return group;
}

export interface GroupPaymentMemberFixture {
  id: string;
  tenant_id: string;
  group_payment_id: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed';
  paid_at: Date | null;
}

export async function createGroupPaymentMember(overrides: Partial<GroupPaymentMemberFixture> = {}): Promise<GroupPaymentMemberFixture> {
  const pool = await getPgPool();
  const member: GroupPaymentMemberFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    group_payment_id: overrides.group_payment_id || uuidv4(),
    user_id: overrides.user_id || uuidv4(),
    amount: overrides.amount ?? 10000,
    status: overrides.status || 'pending',
    paid_at: overrides.paid_at || null,
  };

  await pool.query(`
    INSERT INTO group_payment_members (id, tenant_id, group_payment_id, user_id, amount, status, paid_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [member.id, member.tenant_id, member.group_payment_id, member.user_id, member.amount, member.status, member.paid_at]);

  return member;
}

// ============================================================================
// Fraud Fixtures
// ============================================================================

export interface FraudCheckFixture {
  id: string;
  tenant_id: string;
  payment_transaction_id: string;
  user_id: string;
  score: number;
  decision: 'approve' | 'review' | 'block';
  signals: string[];
  created_at: Date;
}

export async function createFraudCheck(overrides: Partial<FraudCheckFixture> = {}): Promise<FraudCheckFixture> {
  const pool = await getPgPool();
  const check: FraudCheckFixture = {
    id: overrides.id || uuidv4(),
    tenant_id: overrides.tenant_id || DEFAULT_TENANT_ID,
    payment_transaction_id: overrides.payment_transaction_id || uuidv4(),
    user_id: overrides.user_id || uuidv4(),
    score: overrides.score ?? 15,
    decision: overrides.decision || 'approve',
    signals: overrides.signals || [],
    created_at: overrides.created_at || new Date(),
  };

  await pool.query(`
    INSERT INTO fraud_checks (id, tenant_id, payment_transaction_id, user_id, score, decision, signals, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [check.id, check.tenant_id, check.payment_transaction_id, check.user_id, check.score, check.decision, check.signals, check.created_at]);

  return check;
}

// ============================================================================
// Composite Fixtures (create related records together)
// ============================================================================

export interface FullPaymentScenario {
  tenant: TenantFixture;
  user: UserFixture;
  venue: VenueFixture;
  venueBalance: VenueBalanceFixture;
  event: EventFixture;
  order: OrderFixture;
  payment: PaymentTransactionFixture;
}

export async function createFullPaymentScenario(overrides: {
  tenant?: Partial<TenantFixture>;
  user?: Partial<UserFixture>;
  venue?: Partial<VenueFixture>;
  event?: Partial<EventFixture>;
  order?: Partial<OrderFixture>;
  payment?: Partial<PaymentTransactionFixture>;
} = {}): Promise<FullPaymentScenario> {
  const tenant = await createTenant({ id: DEFAULT_TENANT_ID, ...overrides.tenant });
  const user = await createUser({ tenant_id: tenant.id, ...overrides.user });
  const venue = await createVenue({ tenant_id: tenant.id, ...overrides.venue });
  const venueBalance = await createVenueBalance({ tenant_id: tenant.id, venue_id: venue.id });
  const event = await createEvent({ tenant_id: tenant.id, venue_id: venue.id, ...overrides.event });
  const order = await createOrder({ tenant_id: tenant.id, user_id: user.id, event_id: event.id, ...overrides.order });
  const payment = await createPaymentTransaction({
    tenant_id: tenant.id,
    user_id: user.id,
    venue_id: venue.id,
    order_id: order.id,
    ...overrides.payment,
  });

  return { tenant, user, venue, venueBalance, event, order, payment };
}
