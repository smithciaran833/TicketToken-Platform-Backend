/**
 * Test Fixtures for Compliance Service
 * 
 * AUDIT FIXES:
 * - TST-M1: Factory functions for dynamic fixtures
 * - TST-M4: Error scenario fixtures
 * - TST-M3: Multi-tenant fixtures
 */
import { v4 as uuidv4 } from 'uuid';

// =============================================================================
// TENANT FIXTURES
// =============================================================================

export function createTenant(overrides: Partial<{
  id: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  active: boolean;
}> = {}) {
  return {
    id: uuidv4(),
    name: `Tenant ${Date.now()}`,
    plan: 'pro' as const,
    active: true,
    ...overrides
  };
}

export const TENANT_FIXTURES = {
  default: createTenant({ id: '00000000-0000-0000-0000-000000000001', name: 'Default Tenant' }),
  secondary: createTenant({ id: '00000000-0000-0000-0000-000000000002', name: 'Secondary Tenant' }),
  enterprise: createTenant({ id: '00000000-0000-0000-0000-000000000003', name: 'Enterprise Tenant', plan: 'enterprise' }),
  suspended: createTenant({ id: '00000000-0000-0000-0000-000000000004', name: 'Suspended Tenant', active: false })
};

// =============================================================================
// USER FIXTURES
// =============================================================================

export function createUser(overrides: Partial<{
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'user' | 'admin' | 'compliance_officer';
  verified: boolean;
}> = {}) {
  const id = overrides.id || uuidv4();
  return {
    id,
    tenantId: overrides.tenantId || TENANT_FIXTURES.default.id,
    email: overrides.email || `user-${id.slice(0, 8)}@test.com`,
    firstName: 'Test',
    lastName: 'User',
    role: 'user' as const,
    verified: true,
    ...overrides
  };
}

export const USER_FIXTURES = {
  regularUser: createUser({
    id: '10000000-0000-0000-0000-000000000001',
    email: 'user@test.com'
  }),
  adminUser: createUser({
    id: '10000000-0000-0000-0000-000000000002',
    email: 'admin@test.com',
    role: 'admin'
  }),
  complianceOfficer: createUser({
    id: '10000000-0000-0000-0000-000000000003',
    email: 'compliance@test.com',
    role: 'compliance_officer'
  }),
  unverifiedUser: createUser({
    id: '10000000-0000-0000-0000-000000000004',
    email: 'unverified@test.com',
    verified: false
  }),
  secondaryTenantUser: createUser({
    id: '10000000-0000-0000-0000-000000000005',
    tenantId: TENANT_FIXTURES.secondary.id,
    email: 'secondary@test.com'
  })
};

// =============================================================================
// VENUE FIXTURES
// =============================================================================

export function createVenue(overrides: Partial<{
  id: string;
  tenantId: string;
  name: string;
  ownerUserId: string;
  totalEarnings: number;
  riskScore: number;
}> = {}) {
  return {
    id: uuidv4(),
    tenantId: TENANT_FIXTURES.default.id,
    name: `Venue ${Date.now()}`,
    ownerUserId: USER_FIXTURES.regularUser.id,
    totalEarnings: 0,
    riskScore: 0,
    ...overrides
  };
}

export const VENUE_FIXTURES = {
  lowRisk: createVenue({
    id: '20000000-0000-0000-0000-000000000001',
    name: 'Low Risk Venue',
    riskScore: 10
  }),
  mediumRisk: createVenue({
    id: '20000000-0000-0000-0000-000000000002',
    name: 'Medium Risk Venue',
    riskScore: 50
  }),
  highRisk: createVenue({
    id: '20000000-0000-0000-0000-000000000003',
    name: 'High Risk Venue',
    riskScore: 90
  }),
  highEarner: createVenue({
    id: '20000000-0000-0000-0000-000000000004',
    name: 'High Earner Venue',
    totalEarnings: 100000000 // $1M in cents
  }),
  secondaryTenant: createVenue({
    id: '20000000-0000-0000-0000-000000000005',
    tenantId: TENANT_FIXTURES.secondary.id,
    name: 'Secondary Tenant Venue'
  })
};

// =============================================================================
// GDPR REQUEST FIXTURES
// =============================================================================

export function createGdprRequest(overrides: Partial<{
  id: string;
  tenantId: string;
  userId: string;
  requestType: 'export' | 'deletion' | 'access' | 'rectification';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  createdAt: Date;
}> = {}) {
  return {
    id: uuidv4(),
    tenantId: TENANT_FIXTURES.default.id,
    userId: USER_FIXTURES.regularUser.id,
    requestType: 'export' as const,
    status: 'pending' as const,
    createdAt: new Date(),
    ...overrides
  };
}

export const GDPR_REQUEST_FIXTURES = {
  pendingExport: createGdprRequest({
    id: '30000000-0000-0000-0000-000000000001',
    requestType: 'export',
    status: 'pending'
  }),
  completedExport: createGdprRequest({
    id: '30000000-0000-0000-0000-000000000002',
    requestType: 'export',
    status: 'completed'
  }),
  pendingDeletion: createGdprRequest({
    id: '30000000-0000-0000-0000-000000000003',
    requestType: 'deletion',
    status: 'pending'
  }),
  inProgressDeletion: createGdprRequest({
    id: '30000000-0000-0000-0000-000000000004',
    requestType: 'deletion',
    status: 'in_progress'
  }),
  rejectedRequest: createGdprRequest({
    id: '30000000-0000-0000-0000-000000000005',
    requestType: 'export',
    status: 'rejected'
  })
};

// =============================================================================
// RISK FLAG FIXTURES
// =============================================================================

export function createRiskFlag(overrides: Partial<{
  id: string;
  tenantId: string;
  venueId: string;
  flagType: 'velocity' | 'pattern' | 'fraud' | 'compliance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'dismissed';
}> = {}) {
  return {
    id: uuidv4(),
    tenantId: TENANT_FIXTURES.default.id,
    venueId: VENUE_FIXTURES.lowRisk.id,
    flagType: 'pattern' as const,
    severity: 'medium' as const,
    status: 'open' as const,
    ...overrides
  };
}

export const RISK_FLAG_FIXTURES = {
  lowSeverity: createRiskFlag({
    id: '40000000-0000-0000-0000-000000000001',
    severity: 'low',
    flagType: 'velocity'
  }),
  criticalSeverity: createRiskFlag({
    id: '40000000-0000-0000-0000-000000000002',
    venueId: VENUE_FIXTURES.highRisk.id,
    severity: 'critical',
    flagType: 'fraud'
  }),
  resolvedFlag: createRiskFlag({
    id: '40000000-0000-0000-0000-000000000003',
    severity: 'high',
    status: 'resolved'
  })
};

// =============================================================================
// TAX 1099 FIXTURES
// =============================================================================

export function createTax1099(overrides: Partial<{
  id: string;
  tenantId: string;
  venueId: string;
  taxYear: number;
  totalAmount: number;
  status: 'pending' | 'generated' | 'filed' | 'corrected';
}> = {}) {
  return {
    id: uuidv4(),
    tenantId: TENANT_FIXTURES.default.id,
    venueId: VENUE_FIXTURES.highEarner.id,
    taxYear: 2025,
    totalAmount: 100000000,
    status: 'pending' as const,
    ...overrides
  };
}

export const TAX_1099_FIXTURES = {
  pending: createTax1099({
    id: '50000000-0000-0000-0000-000000000001',
    status: 'pending'
  }),
  generated: createTax1099({
    id: '50000000-0000-0000-0000-000000000002',
    status: 'generated'
  }),
  filed: createTax1099({
    id: '50000000-0000-0000-0000-000000000003',
    status: 'filed'
  }),
  belowThreshold: createTax1099({
    id: '50000000-0000-0000-0000-000000000004',
    totalAmount: 50000 // $500, below 1099 threshold
  })
};

// =============================================================================
// ERROR SCENARIO FIXTURES - TST-M4
// =============================================================================

export const ERROR_FIXTURES = {
  // Invalid UUIDs
  invalidUuid: 'not-a-uuid',
  malformedUuid: '12345',
  
  // Missing required fields
  emptyRequest: {},
  
  // Invalid data types
  invalidTypes: {
    userId: 12345,  // Should be string
    tenantId: null,
    requestType: true
  },
  
  // SQL injection attempts
  sqlInjection: {
    userId: "'; DROP TABLE users; --",
    requestType: "export' OR '1'='1"
  },
  
  // XSS attempts
  xssAttempts: {
    name: '<script>alert("xss")</script>',
    email: 'test@test.com<img src=x onerror=alert(1)>'
  },
  
  // Oversized payloads
  oversizedPayload: {
    data: 'x'.repeat(1000000)
  },
  
  // Rate limit trigger data
  rateLimitBurst: Array(100).fill({ type: 'request' }),
  
  // Authentication scenarios
  expiredToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjoxNjAwMDAwMDAwfQ.invalid',
  malformedToken: 'not.a.jwt',
  
  // Webhook scenarios
  invalidWebhookSignature: 'sha256=invalid_signature',
  replayedWebhook: {
    timestamp: Math.floor(Date.now() / 1000) - 600 // 10 minutes ago
  }
};

// =============================================================================
// JWT TOKEN FIXTURES
// =============================================================================

export function createMockJwt(payload: Record<string, any> = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const defaultPayload = {
    sub: USER_FIXTURES.regularUser.id,
    tenantId: TENANT_FIXTURES.default.id,
    role: 'user',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  const payloadB64 = Buffer.from(JSON.stringify({ ...defaultPayload, ...payload })).toString('base64url');
  // Note: This is a mock signature, not cryptographically valid
  return `${header}.${payloadB64}.mock_signature`;
}

export const JWT_FIXTURES = {
  validUser: createMockJwt(),
  adminUser: createMockJwt({ role: 'admin', sub: USER_FIXTURES.adminUser.id }),
  complianceOfficer: createMockJwt({ role: 'compliance_officer', sub: USER_FIXTURES.complianceOfficer.id }),
  expiredToken: createMockJwt({ exp: Math.floor(Date.now() / 1000) - 3600 }),
  wrongTenant: createMockJwt({ tenantId: TENANT_FIXTURES.secondary.id })
};

// =============================================================================
// WEBHOOK FIXTURES
// =============================================================================

export function createWebhookPayload(type: string, data: Record<string, any> = {}) {
  return {
    id: `evt_${uuidv4().replace(/-/g, '')}`,
    type,
    data,
    created: Math.floor(Date.now() / 1000),
    livemode: false
  };
}

export const WEBHOOK_FIXTURES = {
  stripePayment: createWebhookPayload('payment_intent.succeeded', {
    amount: 10000,
    currency: 'usd',
    metadata: { venueId: VENUE_FIXTURES.lowRisk.id }
  }),
  stripeDispute: createWebhookPayload('charge.dispute.created', {
    amount: 5000,
    reason: 'fraudulent'
  }),
  stripeRefund: createWebhookPayload('charge.refunded', {
    amount: 2500,
    reason: 'requested_by_customer'
  })
};

// =============================================================================
// MULTI-TENANT TEST HELPERS - TST-M3
// =============================================================================

export function createMultiTenantScenario() {
  return {
    tenants: [TENANT_FIXTURES.default, TENANT_FIXTURES.secondary, TENANT_FIXTURES.enterprise],
    users: [
      USER_FIXTURES.regularUser,
      USER_FIXTURES.secondaryTenantUser,
      createUser({ tenantId: TENANT_FIXTURES.enterprise.id, email: 'enterprise@test.com' })
    ],
    venues: [
      VENUE_FIXTURES.lowRisk,
      VENUE_FIXTURES.secondaryTenant,
      createVenue({ tenantId: TENANT_FIXTURES.enterprise.id, name: 'Enterprise Venue' })
    ]
  };
}

export function createTenantIsolationTest() {
  return {
    // User from tenant A should NOT see data from tenant B
    tenantA: {
      tenant: TENANT_FIXTURES.default,
      user: USER_FIXTURES.regularUser,
      venue: VENUE_FIXTURES.lowRisk,
      gdprRequest: GDPR_REQUEST_FIXTURES.pendingExport
    },
    tenantB: {
      tenant: TENANT_FIXTURES.secondary,
      user: USER_FIXTURES.secondaryTenantUser,
      venue: VENUE_FIXTURES.secondaryTenant,
      gdprRequest: createGdprRequest({
        tenantId: TENANT_FIXTURES.secondary.id,
        userId: USER_FIXTURES.secondaryTenantUser.id
      })
    }
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createTenant,
  createUser,
  createVenue,
  createGdprRequest,
  createRiskFlag,
  createTax1099,
  createMockJwt,
  createWebhookPayload,
  createMultiTenantScenario,
  createTenantIsolationTest,
  TENANT_FIXTURES,
  USER_FIXTURES,
  VENUE_FIXTURES,
  GDPR_REQUEST_FIXTURES,
  RISK_FLAG_FIXTURES,
  TAX_1099_FIXTURES,
  ERROR_FIXTURES,
  JWT_FIXTURES,
  WEBHOOK_FIXTURES
};
