# WALLET VIEW / MANAGEMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Wallet View / Management |

---

## Executive Summary

**WORKING - View and manage connected wallets**

| Component | Status |
|-----------|--------|
| View connected wallets | ✅ Working (via profile) |
| Link new wallet | ✅ Working |
| Unlink wallet | ✅ Working |
| Multiple wallets per user | ✅ Supported |
| Multiple chains supported | ✅ Solana + Ethereum |
| Set primary wallet | ❌ Not implemented |
| Wallet nicknames | ❌ Not implemented |

**Bottom Line:** Users can view their connected wallets via the profile endpoint, link new wallets, and unlink existing ones. Multiple wallets and multiple chains are supported. Missing: ability to set a primary wallet or give wallets nicknames.

---

## How It Works

### View Connected Wallets

**Via Profile Endpoint:** `GET /api/v1/users/profile`
```typescript
// From profile.controller.ts
const walletsResult = await pool.query(
  `SELECT wallet_address, network, verified, created_at, last_login_at
   FROM wallet_connections
   WHERE user_id = $1`,
  [userId]
);

// Response includes:
{
  "user": { ... },
  "walletConnections": [
    {
      "wallet_address": "7xKXtg2CW87...",
      "network": "solana",
      "verified": true,
      "created_at": "2025-01-01T00:00:00Z",
      "last_login_at": "2025-01-01T12:00:00Z"
    },
    {
      "wallet_address": "0x742d35Cc...",
      "network": "ethereum",
      "verified": true,
      "created_at": "2025-01-01T00:00:00Z",
      "last_login_at": null
    }
  ]
}
```

### Link Additional Wallet
```
POST /auth/wallet/link
{
  "publicKey": "new-wallet-address",
  "signature": "signed-nonce",
  "nonce": "nonce-from-request",
  "chain": "ethereum"
}
```

### Unlink Wallet
```
DELETE /auth/wallet/unlink/:publicKey
```

---

## Database Schema

**Table:** `wallet_connections`
```sql
CREATE TABLE wallet_connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  wallet_address VARCHAR(255) NOT NULL,
  network VARCHAR(50) NOT NULL,  -- 'solana', 'ethereum'
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  last_login_at TIMESTAMP
);

CREATE INDEX idx_wallet_connections_user_id ON wallet_connections(user_id);
CREATE INDEX idx_wallet_connections_address ON wallet_connections(wallet_address);
```

---

## What's Missing

### 1. Set Primary Wallet
```sql
-- NOT IMPLEMENTED
ALTER TABLE wallet_connections ADD COLUMN is_primary BOOLEAN DEFAULT false;
```

### 2. Wallet Nicknames
```sql
-- NOT IMPLEMENTED
ALTER TABLE wallet_connections ADD COLUMN nickname VARCHAR(100);
```

### 3. Dedicated Wallet Endpoints

Could add:
```
GET  /api/v1/users/wallets         - List all wallets
PUT  /api/v1/users/wallets/:id     - Update wallet (nickname, primary)
```

---

## Recommendations

### P3 - Enhanced Wallet Management

| Task | Effort |
|------|--------|
| Add is_primary column | 0.25 day |
| Add nickname column | 0.25 day |
| Create dedicated wallet routes | 0.5 day |
| **Total** | **1 day** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `auth-service/src/controllers/profile.controller.ts` | Lists wallets |
| `auth-service/src/services/wallet.service.ts` | Link/unlink |
| `auth-service/src/routes/auth.routes.ts` | Routes |

---

## Related Documents

- `WALLET_CREATION_FLOW_AUDIT.md` - Connect wallets
- `USER_FEATURES_FLOW_AUDIT.md` - Profile endpoint
