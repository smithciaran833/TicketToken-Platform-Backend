import jwt from 'jsonwebtoken';

export function createTestToken(payload: any = {}): string {
  const defaultPayload = {
    id: 'test-user-id',
    userId: 'test-user-id',
    venueId: 'test-venue-id',
    role: 'admin',
    permissions: ['manage_integrations'],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  return jwt.sign({ ...defaultPayload, ...payload }, process.env.JWT_SECRET || 'test-secret');
}

export function createExpiredToken(): string {
  return jwt.sign({
    id: 'test-user-id',
    exp: Math.floor(Date.now() / 1000) - 3600
  }, process.env.JWT_SECRET || 'test-secret');
}

export function createWebhookSignature(provider: string, payload: any): string {
  const signatures: Record<string, string> = {
    stripe: 'stripe_sig_' + Buffer.from(JSON.stringify(payload)).toString('base64'),
    square: 'square_sig_' + Buffer.from(JSON.stringify(payload)).toString('base64'),
    mailchimp: 'mailchimp_sig_' + Buffer.from(JSON.stringify(payload)).toString('base64'),
    quickbooks: 'quickbooks_sig_' + Buffer.from(JSON.stringify(payload)).toString('base64')
  };
  return signatures[provider] || 'invalid_sig';
}
