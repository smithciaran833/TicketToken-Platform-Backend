# Security Policy

## Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to security@tickettoken.com. You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the following information:

- Type of issue (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Features

### Token Security

#### Secure Storage
The SDK provides multiple token storage options with varying security levels:

1. **MemoryTokenStorage** (Default - Most Secure)
   - Tokens stored only in memory
   - Cleared on page refresh
   - Not accessible to other scripts
   - **Recommended for browser applications**

2. **EncryptedLocalStorage**
   - Tokens encrypted with AES-256-GCM
   - Persists across browser sessions
   - Requires encryption key management
   - Use only when persistence is required

3. **SessionStorage**
   - Cleared when tab is closed
   - Not encrypted
   - Accessible to same-origin scripts
   - Use for temporary sessions

4. **CookieStorage**
   - For SSR/Next.js applications
   - Supports HttpOnly, Secure, SameSite flags
   - Server-side only (HttpOnly)

Example:
```typescript
import { TicketTokenSDK, createTokenStorage } from '@tickettoken/sdk-typescript';

// Most secure - memory storage (default)
const sdk = new TicketTokenSDK({
  apiKey: 'your-api-key',
  tokenStorage: createTokenStorage({ type: 'memory' })
});

// With encrypted persistence
const sdk = new TicketTokenSDK({
  apiKey: 'your-api-key',
  tokenStorage: createTokenStorage({
    type: 'localStorage',
    encryptionKey: process.env.ENCRYPTION_KEY
  })
});
```

#### Token Encryption
- All tokens can be encrypted at rest using AES-256-GCM
- Automatic IV generation for each encryption
- Auth tags prevent tampering
- Constant-time comparison prevents timing attacks

#### Automatic Token Refresh
- Tokens refreshed 60 seconds before expiration
- Refresh failures gracefully handled
- Token rotation supported
- Race condition protection for concurrent requests

### HTTPS Enforcement

The SDK enforces HTTPS in production environments:

```typescript
import { isSecureContext } from '@tickettoken/sdk-typescript';

if (!isSecureContext()) {
  console.warn('SDK is not running in a secure context (HTTPS)');
}
```

**Production Requirements:**
- HTTPS required for all API calls
- TLS 1.2 or higher
- Valid SSL certificates
- No mixed content warnings

### Request Security

#### Request Signing
Sign sensitive requests to prevent tampering:

```typescript
import { sign, verify } from '@tickettoken/sdk-typescript';

// Sign request
const payload = JSON.stringify(requestData);
const signature = sign(payload, secretKey);

// Verify signature
const isValid = verify(payload, signature, secretKey);
```

#### Replay Attack Prevention
- Nonce generation for sensitive operations
- Timestamp validation with configurable tolerance
- Request deduplication

```typescript
import { generateNonce } from '@tickettoken/sdk-typescript';

const nonce = generateNonce();
// Include nonce in request headers
```

#### Rate Limiting
Built-in rate limiting prevents abuse:

```typescript
import { RateLimiter } from '@tickettoken/sdk-typescript';

const limiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000 // 1 minute
});

await limiter.checkLimit('user-id');
```

### Data Protection

#### Sensitive Data Masking
Automatic masking for logs and debugging:

```typescript
import { maskSensitiveData, sanitizeForLogging } from '@tickettoken/sdk-typescript';

// Mask tokens
const masked = maskSensitiveData(accessToken); // "abc1...xyz9"

// Sanitize objects for logging
const sanitized = sanitizeForLogging({
  username: 'john',
  password: 'secret123',
  apiKey: 'key_abc123'
});
// { username: 'john', password: '***', apiKey: 'key_***123' }
```

#### Input Validation
All inputs validated before API calls:

```typescript
import { validateRequired, validateEmail, validateUrl } from '@tickettoken/sdk-typescript';

validateRequired(value, 'fieldName');
validateEmail(email);
validateUrl(url);
```

#### XSS Prevention
- All user inputs sanitized
- HTML escaped by default
- No `innerHTML` usage
- CSP headers recommended

### Webhook Security

Verify webhook signatures to ensure authenticity:

```typescript
import { verifyWebhook } from '@tickettoken/sdk-typescript';

const event = verifyWebhook(
  payload,
  signature,
  {
    secret: 'your-webhook-secret',
    tolerance: 300 // 5 minutes
  },
  timestamp
);
```

**Webhook Best Practices:**
- Always verify signatures
- Use HTTPS endpoints only
- Implement idempotency
- Set reasonable timeouts
- Log all webhook attempts

### Cryptography

#### Algorithms Used
- **Encryption**: AES-256-GCM
- **Hashing**: SHA-256
- **Signing**: HMAC-SHA256
- **Key Derivation**: PBKDF2 (when applicable)

#### Key Management
```typescript
import { generateKey } from '@tickettoken/sdk-typescript';

// Generate secure encryption key
const key = generateKey(32); // 32 bytes = 256 bits
console.log(key.toString('hex'));
```

**Key Storage Recommendations:**
- Never commit keys to version control
- Use environment variables
- Rotate keys regularly
- Use key management services (AWS KMS, Azure Key Vault)

### Authentication

#### Multi-Factor Authentication (MFA)
Support for TOTP-based MFA:

```typescript
await sdk.auth.setupMFA();
await sdk.auth.verifyMFACode(code);
```

#### OAuth 2.0
Secure OAuth flows with PKCE:

```typescript
await sdk.auth.oauthAuthorize({
  provider: 'google',
  usePKCE: true
});
```

### Error Handling

#### Secure Error Messages
- Production errors sanitized
- No sensitive data in error messages
- Detailed errors only in development
- Structured error logging

```typescript
try {
  await sdk.api.call();
} catch (error) {
  // Error messages are automatically sanitized
  console.error(error.message);
}
```

## Security Best Practices

### For Developers

1. **Always use HTTPS** in production
2. **Never log sensitive data** (tokens, passwords, API keys)
3. **Validate all inputs** before processing
4. **Use memory storage** for tokens when possible
5. **Implement rate limiting** for public endpoints
6. **Keep SDK updated** to latest version
7. **Review dependency security** regularly
8. **Use strong authentication** (MFA when available)
9. **Rotate secrets regularly** (API keys, encryption keys)
10. **Monitor for security advisories**

### For Applications

1. **Content Security Policy** (CSP)
   ```html
   <meta http-equiv="Content-Security-Policy" 
         content="default-src 'self' https://api.tickettoken.com">
   ```

2. **Subresource Integrity** (SRI)
   ```html
   <script src="https://cdn.tickettoken.com/sdk.js" 
           integrity="sha384-..." 
           crossorigin="anonymous"></script>
   ```

3. **CORS Configuration**
   - Restrict allowed origins
   - Use credentials carefully
   - Validate Origin headers

4. **Environment Variables**
   ```bash
   # .env (never commit!)
   TICKETTOKEN_API_KEY=your_key_here
   TICKETTOKEN_ENCRYPTION_KEY=your_encryption_key
   ```

5. **Dependency Auditing**
   ```bash
   npm audit
   npm audit fix
   ```

## Vulnerability Disclosure Policy

We follow coordinated vulnerability disclosure:

1. **Report** security issue privately
2. **Acknowledge** receipt within 48 hours
3. **Investigate** and validate issue
4. **Develop** fix in private repository
5. **Test** fix thoroughly
6. **Coordinate** disclosure date with reporter
7. **Release** fix in new version
8. **Publish** security advisory
9. **Credit** reporter (if desired)

## Security Updates

Security updates are released as soon as possible after a vulnerability is confirmed:

- **Critical**: Within 24 hours
- **High**: Within 1 week
- **Medium**: Within 2 weeks
- **Low**: Next minor version

Subscribe to security advisories:
- GitHub Security Advisories
- npm security advisories
- Email list: security-announce@tickettoken.com

## Compliance

The SDK follows security best practices aligned with:

- **OWASP Top 10** - Web Application Security
- **CWE/SANS Top 25** - Most Dangerous Software Errors
- **GDPR** - Data protection requirements
- **PCI DSS** - Payment card industry standards (where applicable)
- **SOC 2** - Security, availability, and confidentiality

## Security Testing

We perform regular security testing:

- **Static Analysis** (SAST) - ESLint security rules, Semgrep
- **Dependency Scanning** - npm audit, Snyk
- **Dynamic Testing** (DAST) - Penetration testing
- **Code Reviews** - Security-focused reviews
- **Automated Testing** - Security test cases

## Additional Resources

- [OWASP Cheat Sheet Series](https://cheatsheetseries.owasp.org/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [npm Security Best Practices](https://docs.npmjs.com/security-best-practices)
- [TypeScript Security](https://www.typescriptlang.org/docs/handbook/security.html)

## Contact

For security concerns:
- Email: security@tickettoken.com
- PGP Key: [Link to public key]
- Bug Bounty: [Link to program if available]

---

Last Updated: November 18, 2025
