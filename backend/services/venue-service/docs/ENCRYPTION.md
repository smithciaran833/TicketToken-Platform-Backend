# VENUE SERVICE - ENCRYPTION DOCUMENTATION

**Last Updated:** November 13, 2025  
**Service:** venue-service  
**Security Level:** Confidential

---

## OVERVIEW

The venue-service uses **field-level encryption** to protect sensitive data at rest in the database. This document describes the encryption implementation, key management, and operational procedures.

---

## WHAT IS ENCRYPTED

### Encrypted Fields in Database

| Table | Field | Data Type | Purpose |
|-------|-------|-----------|---------|
| `venue_integrations` | `api_key_encrypted` | TEXT | Third-party API keys (Stripe, Square, etc.) |
| `venue_integrations` | `api_secret_encrypted` | TEXT | Third-party API secrets |
| `venue_integrations` | `webhook_secret_encrypted` | TEXT | Webhook signing secrets |

### Why Field-Level Encryption?

- **Data at Rest Protection:** Even if database is compromised, encrypted fields remain protected
- **Regulatory Compliance:** Meets PCI-DSS and data protection requirements
- **Least Privilege:** Application requires encryption key, not just database access
- **Selective Protection:** Only sensitive fields encrypted, maintaining query performance

---

## ENCRYPTION ALGORITHM

### Primary Algorithm: AES-256-GCM

**Specification:**
- **Algorithm:** Advanced Encryption Standard (AES)
- **Key Size:** 256 bits (32 bytes)
- **Mode:** Galois/Counter Mode (GCM)
- **IV Size:** 96 bits (12 bytes) - randomly generated per encryption
- **Auth Tag Size:** 128 bits (16 bytes) - provides authentication

**Why AES-256-GCM?**
- ✅ Industry standard for data encryption
- ✅ Authenticated encryption (prevents tampering)
- ✅ FIPS 140-2 compliant
- ✅ High performance with hardware acceleration
- ✅ Resistant to known cryptographic attacks

### Encryption Format

**Stored Format:**
```
<algorithm_version>:<iv>:<encrypted_data>:<auth_tag>
```

**Example:**
```
v1:a1b2c3d4e5f67890abcd:4f8a2b3c...encrypted...1d2e3f:9a8b7c6d5e4f3a2b1c0d
```

**Components:**
1. **Algorithm Version** (`v1`): Allows for algorithm upgrades
2. **IV (Initialization Vector)**: Random 12-byte value (hex encoded)
3. **Encrypted Data**: Ciphertext (hex encoded)
4. **Auth Tag**: GCM authentication tag (hex encoded)

---

## KEY MANAGEMENT

### Encryption Key Storage

**Location:** Environment Variable  
**Variable Name:** `ENCRYPTION_KEY`  
**Format:** Base64-encoded 32-byte key

**Example:**
```bash
# .env file (NEVER commit real keys!)
ENCRYPTION_KEY=base64:S3cr3tK3yTh4tIsV3ryL0ngAndR4nd0m32Byt3s=
```

### Key Generation

**Generate a New Key:**
```bash
# Using OpenSSL
openssl rand -base64 32

# Using Node.js
node -e "console.log('base64:' + require('crypto').randomBytes(32).toString('base64'))"
```

**Key Requirements:**
- ✅ Minimum 256 bits (32 bytes)
- ✅ Cryptographically random
- ✅ Unique per environment (dev/staging/prod)
- ✅ Never reused across services

### Key Access Control

**Who Has Access:**
- Platform administrators (via secure key vault)
- CI/CD system (for deployments)
- Application runtime (from environment)

**Access Restrictions:**
- ❌ Developers do not have production keys
- ❌ Keys not stored in version control
- ❌ Keys not logged or printed
- ❌ Keys not transmitted over unsecured channels

### Key Storage Best Practices

**Development:**
```bash
# Use .env file (gitignored)
ENCRYPTION_KEY=base64:dev-key-not-for-production
```

**Staging/Production:**
- **Recommended:** AWS Secrets Manager, HashiCorp Vault, Azure Key Vault
- **Alternative:** Kubernetes Secrets (with encryption at rest)
- **Minimum:** Environment variables in secure deployment system

---

## IMPLEMENTATION DETAILS

### Encryption Service Location

**File:** `src/services/encryption.service.ts`

### Core Functions

#### 1. **encrypt(plaintext: string): string**

**Purpose:** Encrypts data and returns storable format

**Process:**
```typescript
1. Generate random IV (12 bytes)
2. Create AES-256-GCM cipher with key and IV
3. Encrypt plaintext
4. Get authentication tag
5. Format: v1:IV:ciphertext:tag (hex encoded)
6. Return formatted string
```

**Example Usage:**
```typescript
const apiKey = 'sk_test_1234567890abcdef';
const encrypted = encryptionService.encrypt(apiKey);
// Result: "v1:a1b2c3d4e5f6:4f8a2b3c...1d2e3f:9a8b7c6d"
```

#### 2. **decrypt(ciphertext: string): string**

**Purpose:** Decrypts stored format back to plaintext

**Process:**
```typescript
1. Parse format version, IV, ciphertext, tag
2. Create AES-256-GCM decipher with key and IV
3. Set authentication tag
4. Decrypt ciphertext
5. Verify authentication tag (automatic in GCM)
6. Return plaintext
```

**Example Usage:**
```typescript
const encrypted = "v1:a1b2c3d4e5f6:4f8a2b3c...1d2e3f:9a8b7c6d";
const plaintext = encryptionService.decrypt(encrypted);
// Result: "sk_test_1234567890abcdef"
```

### Error Handling

**Encryption Errors:**
- Invalid plaintext → Throws `EncryptionError`
- Missing encryption key → Throws `ConfigurationError`
- Encryption failure → Logged and re-thrown

**Decryption Errors:**
- Invalid format → Throws `DecryptionError`
- Authentication failure → Throws `TamperedDataError`
- Wrong key → Throws `DecryptionError`
- Missing key → Throws `ConfigurationError`

---

## DATABASE

Schema

### Table Structure

```sql
CREATE TABLE venue_integrations (
    id UUID PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES venues(id),
    integration_type VARCHAR(50) NOT NULL, -- 'stripe', 'square', etc.
    
    -- Encrypted Fields
    api_key_encrypted TEXT,              -- AES-256-GCM encrypted
    api_secret_encrypted TEXT,           -- AES-256-GCM encrypted
    webhook_secret_encrypted TEXT,       -- AES-256-GCM encrypted
    
    -- Non-Sensitive Metadata
    integration_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    environment VARCHAR(20),             -- 'sandbox', 'production'
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Query Examples

**Storing Encrypted Data:**
```typescript
await db('venue_integrations').insert({
  id: uuid(),
  venue_id: venueId,
  integration_type: 'stripe',
  api_key_encrypted: encryptionService.encrypt(apiKey),
  api_secret_encrypted: encryptionService.encrypt(apiSecret),
  environment: 'production'
});
```

**Retrieving and Decrypting:**
```typescript
const integration = await db('venue_integrations')
  .where({ venue_id: venueId, integration_type: 'stripe' })
  .first();

if (integration) {
  const apiKey = encryptionService.decrypt(integration.api_key_encrypted);
  const apiSecret = encryptionService.decrypt(integration.api_secret_encrypted);
  // Use decrypted credentials...
}
```

---

## KEY ROTATION PROCEDURE

### When to Rotate Keys

**Scheduled Rotation:**
- Every 90 days (recommended)
- Annually (minimum)

**Emergency Rotation:**
- Key potentially compromised
- Employee with key access leaves
- Security incident detected
- Compliance requirement

### Rotation Process

**Phase 1: Preparation (1 hour)**
1. Generate new encryption key
2. Test key in development environment
3. Prepare deployment scripts
4. Schedule maintenance window

**Phase 2: Deployment (2-4 hours)**
```bash
# Step 1: Add new key as ENCRYPTION_KEY_NEW
export ENCRYPTION_KEY_NEW=base64:NewKeyGeneratedHere

# Step 2: Run re-encryption script
node scripts/rotate-encryption-key.js

# Step 3: Verify all records re-encrypted
node scripts/verify-encryption.js

# Step 4: Switch keys
export ENCRYPTION_KEY=$ENCRYPTION_KEY_NEW
unset ENCRYPTION_KEY_NEW

# Step 5: Restart service
pm2 restart venue-service
```

**Phase 3: Verification (30 minutes)**
1. Test encrypted field access
2. Verify no decryption errors in logs
3. Confirm integration credentials work
4. Monitor for 24 hours

### Re-Encryption Script

**Location:** `scripts/rotate-encryption-key.ts`

**Process:**
```typescript
// Pseudo-code
1. Load old and new keys
2. Query all encrypted records
3. For each record:
   a. Decrypt with old key
   b. Encrypt with new key
   c. Update database
   d. Verify round-trip
4. Log progress and errors
5. Transaction rollback on failure
```

**Safety Features:**
- ✅ Database transactions (rollback on error)
- ✅ Dry-run mode for testing
- ✅ Progress logging
- ✅ Automatic backup before rotation
- ✅ Verification step after rotation

---

## SECURITY CONSIDERATIONS

### Attack Vectors & Mitigations

| Attack | Mitigation |
|--------|------------|
| **Key Theft** | Keys in secure vault, not in code |
| **SQL Injection** | Parameterized queries (Knex) |
| **Tampering** | GCM authentication tag |
| **Replay Attack** | Random IV per encryption |
| **Brute Force** | 256-bit key space (2^256 combinations) |
| **Memory Dump** | Keys cleared after use (best effort) |

### Audit Logging

**Encrypted Field Access:**
```typescript
// Log when encrypted data is decrypted
logger.audit({
  action: 'decrypt_api_key',
  venue_id: venueId,
  integration_type: 'stripe',
  user_id: userId,
  timestamp: new Date()
});
```

**Key Operations:**
```typescript
// Log key rotation events
logger.audit({
  action: 'encryption_key_rotated',
  old_key_hash: sha256(oldKey).slice(0, 8),
  new_key_hash: sha256(newKey).slice(0, 8),
  records_updated: count,
  timestamp: new Date()
});
```

---

## COMPLIANCE

### Standards Met

- ✅ **PCI-DSS 3.2.1:** Requirement 3 (Protect Stored Cardholder Data)
- ✅ **GDPR:** Article 32 (Security of Processing)
- ✅ **HIPAA:** If handling healthcare data (optional)
- ✅ **SOC 2 Type II:** Data encryption controls

### Documentation Requirements

**For Auditors:**
1. This encryption documentation
2. Key management procedures
3. Key rotation logs
4. Access control lists
5. Audit logs of encrypted field access

---

## TROUBLESHOOTING

### Common Issues

#### 1. "Decryption Failed" Error

**Symptoms:**
```
Error: Unable to decrypt field: invalid ciphertext
```

**Causes:**
- Wrong encryption key loaded
- Data corrupted in database
- Key rotated but data not re-encrypted

**Resolution:**
```bash
# Check encryption key is set
echo $ENCRYPTION_KEY | wc -c  # Should be ~44 characters

# Verify key hash matches expected
node -e "const crypto = require('crypto'); const key = Buffer.from(process.env.ENCRYPTION_KEY.replace('base64:', ''), 'base64'); console.log(crypto.createHash('sha256').update(key).digest('hex').slice(0, 16));"

# Compare with documented key hash
```

#### 2. "Encryption Key Not Found" Error

**Symptoms:**
```
Fatal: ENCRYPTION_KEY environment variable not set
```

**Resolution:**
```bash
# Check environment variable
env | grep ENCRYPTION_KEY

# If missing, add to .env or deployment config
export ENCRYPTION_KEY=base64:YourKeyHere
```

#### 3. "Authentication Tag Mismatch" Error

**Symptoms:**
```
Error: Unsupported state or unable to authenticate data
```

**Cause:** Data was tampered with or corrupted

**Resolution:**
- Check database integrity
- Restore from backup if needed
- Report security incident if tampering suspected

---

## REFERENCES

### Internal Documentation
- `src/services/encryption.service.ts` - Implementation
- `scripts/rotate-encryption-key.ts` - Key rotation script
- `.env.example` - Configuration template

### External Resources
- [NIST SP 800-38D](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf) - GCM Specification
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [AWS KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)

---

## CHANGE LOG

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2025-11-13 | 1.0 | Initial documentation | Phase 2 Remediation |

---

**Classification:** Confidential - Internal Use Only  
**Owner:** Security Team  
**Review Schedule:** Quarterly

---

**END OF ENCRYPTION DOCUMENTATION**
