import jwt from 'jsonwebtoken';

export function generateTestToken(payload: any = {}) {
  return jwt.sign(
    {
      userId: 'test-user-123',
      venueId: 'test-venue-456',
      role: 'admin',
      ...payload
    },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

export function generateComplianceOfficerToken() {
  return generateTestToken({ role: 'compliance-officer' });
}

export function generateAdminToken() {
  return generateTestToken({ role: 'admin' });
}

export function generateWebhookSignature(provider: string, payload: any) {
  const crypto = require('crypto');
  const secret = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}
