# CUSTODIAL WALLET FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | December 31, 2024 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Custodial Wallet System (Platform-Held NFTs) |

---

## Executive Summary

**CRITICAL: NO CUSTODIAL WALLET SYSTEM EXISTS**

The current system is designed for **user-controlled wallets** (Phantom, MetaMask), NOT platform-controlled custodial wallets.

**Your Requirement:**
> "I don't want people being able to actually sell it on the blockchain themselves - they need to sell it through my system."

**Current Reality:**
- Users connect their own wallets
- NFT minting is a stub (simulated)
- No custodial wallet infrastructure
- Users could theoretically transfer NFTs outside your platform

---

## Files Verified

| Component | File | Status |
|-----------|------|--------|
| User Wallet Auth | auth-service/wallet.service.ts | ✅ Verified |
| User Wallet Connection | blockchain-service/userWallet.ts | ✅ Verified |
| Treasury Wallet | blockchain-service/treasury.ts | ✅ Verified |
| NFT Minting | blockchain-service/MetaplexService.ts | ✅ Verified |
| Ticket Solana Service | ticket-service/solanaService.ts | ✅ Verified (STUB) |
| Marketplace Blockchain | marketplace-service/blockchain.service.ts | ✅ Verified |
| DB Schema | Various migrations | ✅ Verified |

---

## What Currently Exists

### 1. User Wallet Authentication

**File:** `auth-service/services/wallet.service.ts`

Users can:
- Connect their Solana/Ethereum wallet
- Sign messages to prove ownership
- Login/register with wallet
- Link wallet to existing account
```typescript
// This lets users connect THEIR OWN wallets
async registerWithWallet(publicKey, signature, nonce, chain, tenantId) {
  // Verifies user owns the wallet
  // Creates user account linked to THEIR wallet
}
```

### 2. Treasury Wallet

**File:** `blockchain-service/wallets/treasury.ts`

A single platform wallet exists for:
- Signing transactions
- Paying gas fees
```typescript
class TreasuryWallet {
  async signTransaction(transaction) {
    // Signs with platform keypair
  }
}
```

**Problem:** This is for transaction fees, NOT for holding user NFTs.

### 3. NFT Minting (Metaplex)

**File:** `blockchain-service/services/MetaplexService.ts`
```typescript
async mintNFT(params: MintNFTParams): Promise<MintNFTResult> {
  // Uses Metaplex to mint
  // NFT goes to... whoever the code specifies (currently undefined!)
}
```

**Problem:** No code specifies WHERE the NFT should be minted to.

### 4. Ticket Service Solana (STUB!)

**File:** `ticket-service/services/solanaService.ts`
```typescript
async mintNFT(request: NFTMintRequest): Promise<{ tokenId: string; transactionHash: string }> {
  // This is a placeholder - actual implementation would use Metaplex
  this.log.info('Minting NFT (simulated)', { ticketId: request.ticketId });
  
  // FAKE DATA!
  return {
    tokenId: `token_${Date.now()}`,  // NOT REAL
    transactionHash: `tx_${Date.now()}`  // NOT REAL
  };
}
```

**CRITICAL:** NFT minting doesn't actually happen!

---

## Database Schema

### wallet_addresses

Stores **user's personal wallets**:

| Column | Type | Purpose |
|--------|------|---------|
| user_id | UUID | Which user |
| wallet_address | VARCHAR | User's wallet (Phantom, etc.) |
| blockchain_type | VARCHAR | SOLANA, ETHEREUM |
| is_primary | BOOLEAN | Primary wallet |
| verified_at | TIMESTAMP | When verified |

### treasury_wallets

Platform wallets:

| Column | Type | Purpose |
|--------|------|---------|
| wallet_address | VARCHAR | Platform wallet |
| purpose | VARCHAR | TREASURY, FEE_COLLECTION, ROYALTY |
| is_active | BOOLEAN | Active status |
| balance | DECIMAL | Tracked balance |

### tickets table

| Column | Type | Purpose |
|--------|------|---------|
| is_nft | BOOLEAN | Whether minted as NFT |
| (no wallet field) | - | **MISSING: No field for NFT owner wallet** |

---

## What's Missing for Custodial Wallets

### 1. Platform-Held Wallet Per User

**Need:** Generate a wallet keypair for each user that the PLATFORM controls.
```typescript
// DOESN'T EXIST - NEEDS TO BE BUILT
class CustodialWalletService {
  async createCustodialWallet(userId: string): Promise<{
    publicKey: string;
    // Private key stored encrypted in DB or KMS
  }>;
  
  async getCustodialWallet(userId: string): Promise<string>;
}
```

### 2. Database Table for Custodial Wallets

**Need:** Store encrypted keypairs:
```sql
-- DOESN'T EXIST - NEEDS TO BE BUILT
CREATE TABLE custodial_wallets (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE NOT NULL,
  public_key VARCHAR(255) NOT NULL,
  encrypted_private_key TEXT NOT NULL,  -- AES-256 encrypted
  encryption_key_id VARCHAR(255),       -- Reference to KMS key
  created_at TIMESTAMP
);
```

### 3. NFT Minting to Custodial Wallet

**Need:** When ticket purchased, mint NFT to user's custodial wallet:
```typescript
// DOESN'T EXIST - NEEDS TO BE BUILT
async mintTicketNFT(ticketId: string, userId: string) {
  const custodialWallet = await getCustodialWallet(userId);
  
  await metaplexService.mintNFT({
    ...metadata,
    owner: custodialWallet.publicKey  // Platform controls this wallet
  });
}
```

### 4. Transfer Logic Through Platform Only

**Need:** All transfers must go through platform:
```typescript
// PARTIALLY EXISTS in marketplace-service but not enforced
async transferNFT(fromUserId, toUserId, ticketId) {
  const fromWallet = await getCustodialWallet(fromUserId);
  const toWallet = await getCustodialWallet(toUserId);
  
  // Platform signs the transaction
  await signAndSubmit(fromWallet, toWallet, tokenId);
}
```

### 5. No User Access to Private Keys

Users should NEVER have access to their custodial wallet's private key:
- They can VIEW their wallet address
- They can VIEW their NFTs
- They CANNOT export or transfer directly

---

## Current Architecture vs. Required Architecture

### Current (User-Controlled)
```
User has Phantom wallet
         ↓
User connects wallet to platform
         ↓
Platform verifies ownership
         ↓
NFTs minted to user's wallet (NOT IMPLEMENTED)
         ↓
User can transfer NFTs anywhere (UNCONTROLLED)
```

### Required (Custodial)
```
User registers
         ↓
Platform generates custodial wallet (keypair)
         ↓
Private key encrypted, stored in DB/KMS
         ↓
User buys ticket
         ↓
NFT minted to user's CUSTODIAL wallet
         ↓
User lists for resale on YOUR platform
         ↓
Platform signs transfer to buyer's CUSTODIAL wallet
         ↓
User CANNOT transfer outside platform
```

---

## What Needs to Be Built

### Priority 0 (Critical)

| Component | Description | Effort |
|-----------|-------------|--------|
| `CustodialWalletService` | Generate/store/retrieve custodial wallets | 2-3 days |
| `custodial_wallets` table | Store encrypted keypairs | 1 day |
| KMS integration | Secure key storage (AWS KMS, etc.) | 2-3 days |
| Update `mintNFT()` | Mint to custodial wallet, not stub | 2-3 days |

### Priority 1 (Required)

| Component | Description | Effort |
|-----------|-------------|--------|
| Transfer service update | Use custodial wallets for all transfers | 2 days |
| Resale flow update | Ensure marketplace uses custodial wallets | 2 days |
| User dashboard | Show NFTs in custodial wallet (read-only) | 1 day |

### Priority 2 (Security)

| Component | Description | Effort |
|-----------|-------------|--------|
| Key rotation | Ability to rotate encryption keys | 2 days |
| Audit logging | Log all custodial wallet operations | 1 day |
| Rate limiting | Prevent abuse of wallet operations | 1 day |

---

## Security Considerations

### Key Storage Options

| Option | Pros | Cons |
|--------|------|------|
| AWS KMS | Best security, HSM-backed | Cost, AWS dependency |
| Vault (HashiCorp) | Self-hosted, flexible | Complexity |
| Encrypted DB | Simple | Less secure |

### Recommended Approach

1. **Generate keypair** using Solana's `Keypair.generate()`
2. **Encrypt private key** using AES-256-GCM
3. **Store encryption key** in AWS KMS (or similar)
4. **Never expose** private key to users or frontend
5. **Audit log** all operations

---

## Summary

| Aspect | Status |
|--------|--------|
| User wallet authentication | ✅ Exists (but wrong model) |
| Treasury wallet | ✅ Exists |
| Custodial wallet generation | ❌ MISSING |
| Custodial wallet storage | ❌ MISSING |
| NFT minting to custodial | ❌ MISSING (stub) |
| Platform-controlled transfers | ❌ MISSING |
| User cannot transfer outside | ❌ NOT ENFORCED |

**Bottom Line:** The custodial wallet system that enforces platform-only resales DOES NOT EXIST and needs to be built from scratch.

---

## Related Documents

- `PRIMARY_PURCHASE_FLOW_AUDIT.md` - Where minting should happen
- `SECONDARY_RESALE_FLOW_AUDIT.md` - Where custodial transfers should happen
- `USER_REGISTRATION_AUTH_FLOW_AUDIT.md` - Where custodial wallet should be created

