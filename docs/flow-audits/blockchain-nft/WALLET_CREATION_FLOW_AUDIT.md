# WALLET CREATION FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Wallet Creation / Connection |

---

## Executive Summary

**WORKING - External wallet connection, not custodial creation**

| Component | Status |
|-----------|--------|
| wallet_connections table | ✅ Exists |
| Request nonce | ✅ Working |
| Register with wallet | ✅ Working |
| Login with wallet | ✅ Working |
| Link wallet to account | ✅ Working |
| Unlink wallet | ✅ Working |
| Solana signature verification | ✅ Working |
| Ethereum signature verification | ✅ Working |
| Rate limiting | ✅ Working |
| Custodial wallet creation | ❌ Not implemented |

**Bottom Line:** Full wallet authentication flow supporting both Solana and Ethereum. Users connect their existing wallets (Phantom, MetaMask, etc.) via signature verification. This is NOT custodial wallet creation - users bring their own wallets. No platform-managed wallet generation.

---

## API Endpoints

| Endpoint | Method | Purpose | Auth | Status |
|----------|--------|---------|------|--------|
| `/auth/wallet/nonce` | POST | Request signing nonce | Public | ✅ Working |
| `/auth/wallet/register` | POST | Register new user with wallet | Public | ✅ Working |
| `/auth/wallet/login` | POST | Login with wallet | Public | ✅ Working |
| `/auth/wallet/link` | POST | Link wallet to existing account | Required | ✅ Working |
| `/auth/wallet/unlink/:publicKey` | DELETE | Unlink wallet | Required | ✅ Working |

---

## Authentication Flow

### 1. Request Nonce
```typescript
POST /auth/wallet/nonce
{
  "publicKey": "7xKXtg2CW87...",
  "chain": "solana"
}

Response:
{
  "nonce": "abc123...",
  "message": "Sign this message to authenticate with TicketToken\nNonce: abc123...\nTimestamp: 1704067200000"
}
```

### 2. Sign Message (Client-Side)

User signs the message with their wallet (Phantom, MetaMask, etc.)

### 3. Register or Login
```typescript
POST /auth/wallet/register (or /login)
{
  "publicKey": "7xKXtg2CW87...",
  "signature": "base58-encoded-signature",
  "nonce": "abc123...",
  "chain": "solana"
}

Response:
{
  "user": { "id": "uuid", "email": "wallet-7xkxtg2c@internal.wallet" },
  "tokens": { "accessToken": "...", "refreshToken": "..." },
  "wallet": { "address": "7xKXtg2CW87...", "chain": "solana", "connected": true }
}
```

---

## Implementation Details

### Signature Verification

**File:** `backend/services/auth-service/src/services/wallet.service.ts`

**Solana:**
```typescript
async verifySolanaSignature(publicKey, signature, message): Promise<boolean> {
  const publicKeyObj = new PublicKey(publicKey);
  const signatureBuffer = bs58.decode(signature);
  const messageBuffer = Buffer.from(message);

  return nacl.sign.detached.verify(
    messageBuffer,
    signatureBuffer,
    publicKeyObj.toBytes()
  );
}
```

**Ethereum:**
```typescript
async verifyEthereumSignature(address, signature, message): Promise<boolean> {
  const recoveredAddress = ethers.verifyMessage(message, signature);
  return recoveredAddress.toLowerCase() === address.toLowerCase();
}
```

### Nonce Management

- Stored in Redis with 15-minute expiration
- Deleted after use (prevents replay attacks)
- Includes timestamp and chain type

### User Creation (Wallet Register)
```typescript
// Creates synthetic email for wallet-only users
const syntheticEmail = `wallet-${publicKey.substring(0, 16).toLowerCase()}@internal.wallet`;

// User created with verified email (wallet is proof of identity)
await client.query(
  `INSERT INTO users (email, password_hash, email_verified, tenant_id)
   VALUES ($1, '', true, $2)`,
  [syntheticEmail, tenantId]
);

// Wallet connection created
await client.query(
  `INSERT INTO wallet_connections (user_id, wallet_address, network, verified)
   VALUES ($1, $2, $3, true)`,
  [user.id, publicKey, chain]
);
```

---

## What's Missing

### Custodial Wallet Creation

The platform does NOT create wallets for users. For custodial wallets (platform-managed), would need:
```typescript
// NOT IMPLEMENTED
async createCustodialWallet(userId: string) {
  // Generate Solana keypair
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  
  // Encrypt private key
  const encryptedPrivateKey = await kms.encrypt(keypair.secretKey);
  
  // Store in database
  await db('custodial_wallets').insert({
    user_id: userId,
    public_key: publicKey,
    encrypted_private_key: encryptedPrivateKey
  });
  
  return { publicKey };
}
```

See `CUSTODIAL_WALLET_FLOW_AUDIT.md` - this is a separate flow that's NOT implemented.

---

## Files Involved

| File | Purpose |
|------|---------|
| `auth-service/src/services/wallet.service.ts` | Core logic |
| `auth-service/src/controllers/wallet.controller.ts` | Controller |
| `auth-service/src/routes/auth.routes.ts` | Routes |
| `auth-service/src/migrations/001_auth_baseline.ts` | wallet_connections table |

---

## Related Documents

- `CUSTODIAL_WALLET_FLOW_AUDIT.md` - Platform-managed wallets (NOT IMPLEMENTED)
- `SOCIAL_LOGIN_FLOW_AUDIT.md` - Alternative auth method
- `USER_REGISTRATION_AUTH_FLOW_AUDIT.md` - Email/password auth
