# Blockchain Operations and Reliability Guide
## Solana & NFT Operations for TicketToken Platform

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Security research and audit guide for Solana blockchain operations

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
   - Transaction Confirmation Strategies
   - RPC Node Reliability and Failover
   - Wallet Management (Hot/Cold)
   - Gas/Fee Estimation
   - Transaction Retry Logic
   - Blockchain State Reconciliation
   - NFT Metadata Standards
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Sources](#4-sources)

---

## 1. Standards & Best Practices

### 1.1 Transaction Confirmation Strategies

Solana provides three commitment levels that represent different degrees of transaction finality. Understanding these is critical for building reliable applications.

#### Commitment Levels

| Level | Description | Use Case | Rollback Risk |
|-------|-------------|----------|---------------|
| **processed** | Transaction received and included in a block | Real-time UI updates | ~5% (fork risk) |
| **confirmed** | Block voted on by 66%+ of stake (supermajority) | Most operations | Very low |
| **finalized** | Block confirmed + 31 additional blocks built on top | High-value transactions, payments | Effectively zero |

**Key Facts:**
- A transaction is finalized when its block has been voted on by supermajority and sufficient additional blocks have been built on top of it.
- No confirmed block has reverted in Solana's five-year history.
- For high-value or mission-critical transactions that demand the highest level of finality, the "Finalized" commitment level should be used.

#### Best Practices for Ticket Minting

```typescript
// For ticket minting - use confirmed for speed, verify finalized for database sync
const mintTicket = async (connection: Connection, transaction: Transaction) => {
  // Send with confirmed commitment for faster response
  const signature = await connection.sendTransaction(transaction, [payer], {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  
  // Wait for confirmed status for user feedback
  await connection.confirmTransaction(signature, 'confirmed');
  
  // For database reconciliation, wait for finalized
  const finalStatus = await connection.confirmTransaction(signature, 'finalized');
  
  return { signature, finalized: finalStatus.value.err === null };
};
```

#### Blockhash Expiration

A given blockhash can only be used by transactions for about 60 to 90 seconds before it will be considered expired by the runtime. Solana validators look up blockhashes that are no more than 151 slots old.

**Recommendations:**
- Use confirmed commitment when fetching recent blockhash. This will provide a better (extended with approximately 13 seconds) time window as compared to finalized commitment, thus reducing the risk of transaction expiration.
- Preflight and getLatestBlockhash commitment must be set to the same level to allow the RPC node to perform retries normally.

---

### 1.2 RPC Node Reliability and Failover

#### Never Use Public Endpoints in Production

The public RPC endpoints are not intended for production applications. Please use dedicated/private RPC servers when you launch your application, drop NFTs, etc. The public services are subject to abuse and rate limits may change without prior notice.

**Public Endpoint Limits:**
- Maximum 100 requests per 10 seconds per IP
- Maximum 40 requests per 10 seconds per IP for a single RPC
- 403 errors indicate IP/website blocking
- 429 errors indicate rate limit exceeded

#### Multi-Endpoint Architecture

Use multiple Solana RPC endpoints to reduce latency and avoid single points of failure. A distributed setup ensures higher availability and faster data updates.

```typescript
// Connection pool implementation
interface RPCEndpoint {
  rpc: string;
  wss: string;
  priority: number;
  healthy: boolean;
}

class ConnectionPool {
  private endpoints: RPCEndpoint[];
  private connections: Map<string, Connection>;
  
  constructor(endpoints: RPCEndpoint[]) {
    this.endpoints = endpoints;
    this.connections = new Map();
    
    // Initialize connections
    endpoints.forEach(ep => {
      this.connections.set(ep.rpc, new Connection(ep.rpc, 'confirmed'));
    });
  }
  
  // Get healthiest connection with lowest latency
  async getConnection(): Promise<Connection> {
    const healthy = this.endpoints.filter(ep => ep.healthy);
    if (healthy.length === 0) {
      throw new Error('No healthy RPC endpoints available');
    }
    
    // Return highest priority healthy endpoint
    const best = healthy.sort((a, b) => a.priority - b.priority)[0];
    return this.connections.get(best.rpc)!;
  }
  
  // Health check all endpoints
  async healthCheck(): Promise<void> {
    await Promise.all(this.endpoints.map(async (ep) => {
      try {
        const conn = this.connections.get(ep.rpc)!;
        const start = Date.now();
        await conn.getSlot();
        const latency = Date.now() - start;
        ep.healthy = latency < 5000; // 5 second timeout
        ep.priority = latency;
      } catch {
        ep.healthy = false;
      }
    }));
  }
}
```

#### Recommended RPC Stack

Most production stacks use a staked, Solana-native RPC for critical writes, a multi-chain provider for resilience, and a decentralized gateway for fallback.

| Layer | Purpose | Examples |
|-------|---------|----------|
| Primary | Low-latency writes | Helius, Triton One, QuickNode |
| Secondary | Resilience | Alchemy, dRPC |
| Fallback | Decentralized backup | Lava Network, Pocket Network |

#### Key Metrics to Monitor

- Request/slot lag
- Compute units consumed
- Confirmation spread
- Dropped WebSocket events
- Transaction landing rates

---

### 1.3 Wallet Management (Hot/Cold)

#### Architecture Overview

| Wallet Type | Use Case | Security Level | Access Pattern |
|-------------|----------|----------------|----------------|
| **Hot Wallet** | Frequent transactions, user-facing | Lower | Always online |
| **Cold Wallet** | Treasury, reserves | Higher | Offline signing |
| **HSM** | Production signing | Highest | Hardware-protected |
| **Multisig** | Team operations, high-value | Very High | Multi-party approval |

#### Hot Wallet Best Practices

Hot wallets are software-based wallets connected to the internet, making them ideal for frequent transactions and seamless interaction with Solana's dApp ecosystem.

**For Ticket Minting Operations:**
- Use separate hot wallets for different operations (minting, transfers, fees)
- Implement spending limits per wallet
- Regular key rotation
- Monitor for unusual activity

```typescript
// Hot wallet configuration for ticket operations
interface HotWalletConfig {
  purpose: 'minting' | 'transfers' | 'fees';
  dailyLimit: number; // in lamports
  txLimit: number; // per transaction
  allowedPrograms: PublicKey[];
}

const mintingWallet: HotWalletConfig = {
  purpose: 'minting',
  dailyLimit: 10 * LAMPORTS_PER_SOL,
  txLimit: 0.1 * LAMPORTS_PER_SOL,
  allowedPrograms: [
    BUBBLEGUM_PROGRAM_ID,
    TOKEN_METADATA_PROGRAM_ID,
  ],
};
```

#### Cold Wallet Best Practices

Cold wallets store private keys offline, providing enhanced security against hacking and phishing attacks.

**Implementation:**
- Store 97%+ of assets in cold storage
- Use hardware wallets (Ledger, Trezor) for signing
- Air-gapped transaction signing
- Geographic distribution of backup seeds

#### Multisig for Operations

On Solana, individual validators primarily manage two authority keys: the vote authority and the withdraw authority. Using a simple hot/cold wallet solution or a CLI wallet to manage authority keys is potentially risky for teams and organizations.

**Recommended Setup:**
- 2-of-3 multisig for standard operations
- 3-of-5 for treasury management
- Use Squads Protocol for Solana multisig

```typescript
// Multisig configuration for TicketToken
const treasuryMultisig = {
  threshold: 3,
  owners: 5,
  timelock: 24 * 60 * 60, // 24 hour delay for large transfers
  dailyLimit: 100 * LAMPORTS_PER_SOL,
};
```

#### HSM Integration

The only mission critical industry which is not using HSMs is the Bitcoin exchange industry. When you deal with private keys that you cannot revoke, and whose compromise would result in massive losses, you just can't have them on a regular server architecture.

**HSM Architecture Components:**
- Rate limiter: Hard limits on signing velocity
- 2FA channel: Requires challenge approval
- Wallet app: Contains signing logic
- Secure key storage: Keys never leave HSM

---

### 1.4 Gas/Fee Estimation

#### Solana Fee Structure

Every Solana transaction requires a transaction fee, paid in SOL. Transaction fees are split into two parts: the base fee and the prioritization fee. The base fee compensates validators for processing the transaction. The prioritization fee is an optional fee to increase the chance that the current leader will process your transaction.

| Fee Type | Amount | Distribution |
|----------|--------|--------------|
| Base fee | 5,000 lamports per signature | 50% burned, 50% to validator |
| Priority fee | Variable (micro-lamports per CU) | 100% to validator |

#### Compute Unit Optimization

By default, each instruction is allocated 200,000 CUs and each transaction is allocated 1.4 million CUs. The priority fee is determined by the requested compute unit limit, not the actual number of compute units used.

**Best Practice:** Simulate transactions to estimate actual CU usage, then set limit slightly above.

```typescript
// Optimal fee estimation workflow
const estimateAndSetFees = async (
  connection: Connection,
  transaction: Transaction,
  payer: PublicKey
): Promise<Transaction> => {
  // 1. Simulate to get actual compute units
  const simulation = await connection.simulateTransaction(transaction);
  const unitsConsumed = simulation.value.unitsConsumed || 200000;
  
  // 2. Add 10% buffer
  const computeLimit = Math.ceil(unitsConsumed * 1.1);
  
  // 3. Get recent priority fees for relevant accounts
  const priorityFees = await connection.getRecentPrioritizationFees({
    lockedWritableAccounts: transaction.instructions
      .flatMap(ix => ix.keys.filter(k => k.isWritable).map(k => k.pubkey)),
  });
  
  // 4. Calculate appropriate priority fee (use median or 75th percentile)
  const medianFee = priorityFees
    .map(f => f.prioritizationFee)
    .sort((a, b) => a - b)[Math.floor(priorityFees.length / 2)] || 1000;
  
  // 5. Add compute budget instructions
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: medianFee })
  );
  
  return transaction;
};
```

#### Priority Fee API Integration

Our API provides six priority levels based on recent network activity.

Use provider-specific priority fee APIs (Helius, QuickNode) for more accurate estimates:

```typescript
// Using Helius Priority Fee API
const getPriorityFee = async (
  serializedTx: string,
  level: 'min' | 'low' | 'medium' | 'high' | 'veryHigh' | 'unsafeMax'
): Promise<number> => {
  const response = await fetch('https://mainnet.helius-rpc.com/?api-key=KEY', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getPriorityFeeEstimate',
      params: [{ transaction: serializedTx, options: { priorityLevel: level } }],
    }),
  });
  
  const { result } = await response.json();
  return result.priorityFeeEstimate;
};
```

---

### 1.5 Transaction Retry Logic

#### Why Transactions Get Dropped

On some occasions, a seemingly valid transaction may be dropped before it is included in a block. This most often occurs during periods of network congestion, when an RPC node fails to rebroadcast the transaction to the leader.

**Common Causes:**
1. Network issues (UDP packet loss, high traffic)
2. Validator overload
3. RPC pool inconsistencies
4. Blockhash from minority fork
5. Transaction on minority fork rejected after processing

#### Proper Retry Implementation

A common pattern for manually retrying transactions involves temporarily storing the lastValidBlockHeight that comes from getLatestBlockhash. Once stashed, an application can poll the cluster's blockheight and manually retry the transaction at an appropriate interval.

```typescript
interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const sendWithRetry = async (
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  config: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 500,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  }
): Promise<string> => {
  let lastError: Error | null = null;
  let delay = config.initialDelayMs;
  
  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      // Get fresh blockhash for each attempt
      const { blockhash, lastValidBlockHeight } = 
        await connection.getLatestBlockhash('confirmed');
      
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = signers[0].publicKey;
      transaction.sign(...signers);
      
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 0, // We handle retries ourselves
        }
      );
      
      // Poll for confirmation
      const startTime = Date.now();
      while (Date.now() - startTime < 60000) { // 60 second timeout
        const status = await connection.getSignatureStatus(signature);
        
        if (status.value?.confirmationStatus === 'confirmed' ||
            status.value?.confirmationStatus === 'finalized') {
          return signature;
        }
        
        if (status.value?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }
        
        // Check if blockhash expired
        const currentHeight = await connection.getBlockHeight();
        if (currentHeight > lastValidBlockHeight) {
          throw new Error('Blockhash expired');
        }
        
        await sleep(2000);
      }
      
      throw new Error('Transaction confirmation timeout');
      
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on certain errors
      if (error.message.includes('insufficient funds') ||
          error.message.includes('invalid signature')) {
        throw error;
      }
      
      console.log(`Attempt ${attempt + 1} failed: ${error.message}`);
      
      if (attempt < config.maxRetries - 1) {
        await sleep(delay);
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelayMs);
      }
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
```

#### Key Retry Principles

It is crucial to only re-sign a transaction when the blockhash is no longer valid, or else it is possible for both transactions to be accepted by the network.

1. **Fresh blockhash on retry**: Always get new blockhash before re-signing
2. **Exponential backoff**: Prevent overwhelming the network
3. **Check blockhash expiration**: Know when to safely retry
4. **Idempotent operations**: Same transaction submitted multiple times executes only once

---

### 1.6 Blockchain State Reconciliation

#### Database-Blockchain Sync Strategy

For ticket minting, maintain consistency between your database and blockchain state:

```typescript
interface TicketMintRecord {
  id: string;
  signature: string | null;
  status: 'pending' | 'submitted' | 'confirmed' | 'finalized' | 'failed';
  assetId: string | null;
  createdAt: Date;
  updatedAt: Date;
  retryCount: number;
}

class BlockchainReconciler {
  constructor(
    private connection: Connection,
    private db: Database
  ) {}
  
  // Run periodically (e.g., every minute)
  async reconcile(): Promise<void> {
    // 1. Find pending/submitted records older than 2 minutes
    const staleRecords = await this.db.findTickets({
      status: ['pending', 'submitted'],
      updatedAt: { $lt: new Date(Date.now() - 120000) },
    });
    
    for (const record of staleRecords) {
      await this.reconcileRecord(record);
    }
  }
  
  private async reconcileRecord(record: TicketMintRecord): Promise<void> {
    if (!record.signature) {
      // Never submitted - retry minting
      await this.retryMint(record);
      return;
    }
    
    // Check transaction status
    const status = await this.connection.getSignatureStatus(
      record.signature,
      { searchTransactionHistory: true }
    );
    
    if (status.value === null) {
      // Transaction not found - likely dropped
      if (record.retryCount < 3) {
        await this.retryMint(record);
      } else {
        await this.markFailed(record, 'Max retries exceeded');
      }
      return;
    }
    
    if (status.value.err) {
      await this.markFailed(record, JSON.stringify(status.value.err));
      return;
    }
    
    // Update status based on confirmation
    if (status.value.confirmationStatus === 'finalized') {
      await this.markFinalized(record);
    } else if (status.value.confirmationStatus === 'confirmed') {
      await this.markConfirmed(record);
    }
  }
  
  // Verify on-chain state matches database
  async verifyAssetOwnership(assetId: string, expectedOwner: string): Promise<boolean> {
    try {
      const asset = await this.getAssetFromDAS(assetId);
      return asset.ownership.owner === expectedOwner;
    } catch {
      return false;
    }
  }
}
```

#### Event-Driven Reconciliation

Use webhooks or WebSocket subscriptions for real-time updates:

```typescript
// WebSocket subscription for transaction confirmations
const subscribeToConfirmations = (
  connection: Connection,
  signature: string,
  onConfirmed: (status: 'confirmed' | 'finalized') => void
): number => {
  return connection.onSignature(
    signature,
    (result, context) => {
      if (result.err) {
        console.error('Transaction failed:', result.err);
        return;
      }
      onConfirmed('confirmed');
    },
    'confirmed'
  );
};
```

---

### 1.7 NFT Metadata Standards

#### Metaplex Token Metadata Standard

The Metadata account helps attach data to tokens regardless of their fungibility. The standard of the off-chain JSON file will vary slightly to accommodate their needs.

#### On-Chain Metadata Fields

| Field | Description | Max Size |
|-------|-------------|----------|
| name | Token name | 32 bytes |
| symbol | Token symbol | 10 bytes |
| uri | Link to off-chain JSON | 200 bytes |
| seller_fee_basis_points | Royalty percentage (0-10000) | - |
| creators | Array of creator addresses | 5 max |

#### Off-Chain JSON Schema (NFT Standard)

```json
{
  "name": "TicketToken Event Pass #1234",
  "symbol": "TKTK",
  "description": "VIP access pass for Concert Name - December 2025",
  "image": "https://arweave.net/abc123/image.png",
  "animation_url": "https://arweave.net/abc123/animation.mp4",
  "external_url": "https://tickettoken.com/event/123",
  "attributes": [
    { "trait_type": "Event", "value": "Concert Name" },
    { "trait_type": "Date", "value": "2025-12-25" },
    { "trait_type": "Venue", "value": "Madison Square Garden" },
    { "trait_type": "Section", "value": "VIP" },
    { "trait_type": "Row", "value": "A" },
    { "trait_type": "Seat", "value": "12" },
    { "trait_type": "Tier", "display_type": "number", "value": 1 }
  ],
  "properties": {
    "files": [
      { "uri": "https://arweave.net/abc123/image.png", "type": "image/png" },
      { "uri": "https://arweave.net/abc123/ticket.pdf", "type": "application/pdf" }
    ],
    "category": "ticket"
  }
}
```

#### Compressed NFT (cNFT) Considerations

Compressed NFTs make it possible to scale the creation of NFTs to new orders of magnitude by rethinking the way we store data onchain.

**Cost Comparison:**
- Traditional NFT: ~0.012 SOL per NFT
- Compressed NFT: ~0.00001 SOL per NFT (1000x cheaper)

Compressed NFTs can be transferred, delegated, and even decompressed into regular NFTs for interoperability with existing smart contracts.

#### DAS API for Fetching cNFTs

The Digital Asset Standard (DAS) API is an open-source specification that provides a unified interface for interacting with all types of digital assets on Solana.

```typescript
// Fetch compressed NFT with proof
const getAssetWithProof = async (assetId: string): Promise<AssetWithProof> => {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAsset',
      params: { id: assetId },
    }),
  });
  
  const { result: asset } = await response.json();
  
  // Get proof for transfer/burn operations
  const proofResponse = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAssetProof',
      params: { id: assetId },
    }),
  });
  
  const { result: proof } = await proofResponse.json();
  
  return { asset, proof };
};
```

#### Merkle Tree Configuration for Ticket Collections

The canopy effectively caches proof nodes onchain, so you don't have to pass all of them into the transaction, allowing for more complex transactions.

| Collection Size | Max Depth | Max Buffer | Canopy Depth | Approx Cost |
|-----------------|-----------|------------|--------------|-------------|
| 16,384 | 14 | 64 | 11 | ~1.5 SOL |
| 131,072 | 17 | 64 | 14 | ~3.5 SOL |
| 1,048,576 | 20 | 256 | 15 | ~5 SOL |

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Not Waiting for Transaction Finality

**Problem:** Updating database immediately after transaction submission without waiting for confirmation.

**Risk:** Transaction may be dropped, leading to database-blockchain inconsistency.

**Correct Approach:**
```typescript
// BAD: Don't trust sendTransaction response alone
const sig = await connection.sendTransaction(tx);
await db.markMinted(ticketId, sig); // WRONG!

// GOOD: Wait for appropriate confirmation
const sig = await connection.sendTransaction(tx);
await connection.confirmTransaction(sig, 'confirmed');
await db.markMinted(ticketId, sig, 'confirmed');

// For payments: wait for finalized
await connection.confirmTransaction(sig, 'finalized');
await db.markPaymentComplete(paymentId, sig);
```

### 2.2 Single RPC Endpoint (No Failover)

**Problem:** Application fails completely when single RPC endpoint goes down.

**Risk:** Complete service outage during RPC maintenance or issues.

**Correct Approach:**
- Maintain pool of 3+ RPC endpoints
- Implement health checks and automatic failover
- Use different providers for redundancy
- Monitor endpoint health continuously

### 2.3 Private Keys in Code or Environment Variables

**Problem:** Storing private keys directly in source code or plain environment variables.

**Risk:** Key exposure through logs, error messages, or repository leaks.

When you deal with private keys that you cannot revoke, and whose compromise would result in massive losses, you just can't have them on a regular server architecture.

**Correct Approach:**
```typescript
// BAD: Never do this
const privateKey = process.env.PRIVATE_KEY; // Exposed in environment
const keypair = Keypair.fromSecretKey(Buffer.from(privateKey, 'base64'));

// GOOD: Use secrets manager
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const getSigningKeypair = async (): Promise<Keypair> => {
  const client = new SecretsManagerClient({ region: 'us-east-1' });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: 'solana/minting-key' })
  );
  
  const secret = JSON.parse(response.SecretString!);
  return Keypair.fromSecretKey(Buffer.from(secret.privateKey, 'base64'));
};
```

### 2.4 No Transaction Retry on Failure

**Problem:** Giving up immediately when transaction fails.

**Risk:** Lost transactions during network congestion, poor user experience.

**Correct Approach:** Implement exponential backoff with fresh blockhash (see Section 1.5).

### 2.5 Database-Blockchain Inconsistency

**Problem:** Database state diverges from blockchain state over time.

**Symptoms:**
- Tickets showing as minted but not on-chain
- Duplicate mint attempts
- Missing assets in user wallets

**Correct Approach:**
- Implement reconciliation jobs (see Section 1.6)
- Use idempotency keys
- Log all blockchain operations
- Regular full audits of database vs on-chain state

### 2.6 Insufficient Fee Causing Dropped Transactions

**Problem:** Using default or fixed priority fees during congestion.

**Risk:** Transactions stuck in queue or dropped entirely.

**Correct Approach:**
```typescript
// BAD: Fixed priority fee
const priorityFee = 1000; // Will fail during congestion

// GOOD: Dynamic fee based on network conditions
const getRecommendedFee = async (
  connection: Connection,
  accounts: PublicKey[]
): Promise<number> => {
  const fees = await connection.getRecentPrioritizationFees({ lockedWritableAccounts: accounts });
  
  if (fees.length === 0) return 1000; // Default minimum
  
  // Use 75th percentile for reliable landing
  const sorted = fees.map(f => f.prioritizationFee).sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.75);
  
  return Math.max(sorted[idx], 1000);
};
```

### 2.7 Trusting Client-Provided Asset IDs

**Problem:** Processing transfers or burns using asset IDs from client without verification.

**Risk:** Users manipulating requests to affect assets they don't own.

**Correct Approach:**
```typescript
// BAD: Trust client blindly
app.post('/transfer', async (req, res) => {
  const { assetId, newOwner } = req.body;
  await transferNFT(assetId, newOwner); // DANGEROUS!
});

// GOOD: Verify ownership before any operation
app.post('/transfer', async (req, res) => {
  const { assetId, newOwner } = req.body;
  const userId = req.user.walletAddress;
  
  // Fetch asset and verify ownership
  const asset = await getAsset(assetId);
  if (asset.ownership.owner !== userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  
  await transferNFT(assetId, newOwner, userId);
});
```

---

## 3. Audit Checklist

### 3.1 Transaction Handling

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| TX-01 | All mint operations wait for 'confirmed' before updating DB | CRITICAL | Code review |
| TX-02 | Payment operations wait for 'finalized' before completing | CRITICAL | Code review |
| TX-03 | Transaction retry logic implemented with exponential backoff | HIGH | Code review |
| TX-04 | Fresh blockhash obtained on each retry attempt | HIGH | Code review |
| TX-05 | Blockhash expiration checked before retry | MEDIUM | Code review |
| TX-06 | Transaction timeout configured (60-90 seconds) | MEDIUM | Code review |
| TX-07 | Failed transactions logged with signature and error | HIGH | Log review |
| TX-08 | Priority fees dynamically calculated based on network | HIGH | Code review |
| TX-09 | Compute units estimated via simulation | MEDIUM | Code review |
| TX-10 | Idempotency keys used for retryable operations | HIGH | Code review |

**Verification Commands:**
```bash
# Check for missing confirmation waits
grep -rn "sendTransaction" --include="*.ts" | grep -v "confirmTransaction"

# Find hardcoded priority fees
grep -rn "setComputeUnitPrice" --include="*.ts" | grep -E "[0-9]{4,}"

# Check for proper retry logic
grep -rn "maxRetries\|retryCount\|exponentialBackoff" --include="*.ts"
```

### 3.2 RPC Configuration

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| RPC-01 | Multiple RPC endpoints configured (minimum 3) | CRITICAL | Config review |
| RPC-02 | Automatic failover implemented | HIGH | Code review |
| RPC-03 | No public RPC endpoints in production | CRITICAL | Config review |
| RPC-04 | RPC health checks running | HIGH | Monitoring review |
| RPC-05 | RPC credentials stored in secrets manager | HIGH | Config review |
| RPC-06 | Rate limiting handled gracefully | MEDIUM | Code review |
| RPC-07 | DAS API endpoint configured for cNFT operations | HIGH | Config review |
| RPC-08 | WebSocket connections have reconnection logic | MEDIUM | Code review |

**Verification Commands:**
```bash
# Check for public RPC endpoints
grep -rn "api.mainnet-beta.solana.com\|api.devnet.solana.com" --include="*.ts" --include="*.json"

# Verify multiple endpoints configured
grep -rn "RPC_URL\|rpcEndpoint" --include="*.ts" --include="*.env*"
```

### 3.3 Wallet Security

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| WAL-01 | Private keys NOT in source code | CRITICAL | Code scan |
| WAL-02 | Private keys NOT in plain environment variables | CRITICAL | Config review |
| WAL-03 | Keys loaded from secrets manager or HSM | HIGH | Code review |
| WAL-04 | Separate wallets for different operations | HIGH | Architecture review |
| WAL-05 | Hot wallet spending limits implemented | HIGH | Code review |
| WAL-06 | Cold storage used for treasury (97%+) | HIGH | Wallet audit |
| WAL-07 | Multisig for high-value operations | HIGH | Architecture review |
| WAL-08 | Key rotation capability exists | MEDIUM | Process review |
| WAL-09 | Wallet addresses whitelisted where applicable | MEDIUM | Code review |
| WAL-10 | Transaction signing is local (keys never sent over network) | CRITICAL | Code review |

**Verification Commands:**
```bash
# Scan for hardcoded keys (base58 patterns)
grep -rn "[1-9A-HJ-NP-Za-km-z]\{87,88\}" --include="*.ts" --include="*.js"

# Check for Keypair.fromSecretKey with inline data
grep -rn "fromSecretKey.*\[" --include="*.ts"

# Verify secrets manager usage
grep -rn "SecretsManager\|Vault\|KMS" --include="*.ts"
```

### 3.4 Compressed NFT (cNFT) Operations

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| CNFT-01 | DAS API used for fetching cNFT data | HIGH | Code review |
| CNFT-02 | Merkle proofs verified before transfers | CRITICAL | Code review |
| CNFT-03 | Asset ownership verified before operations | CRITICAL | Code review |
| CNFT-04 | Collection authority properly set | HIGH | On-chain verification |
| CNFT-05 | Merkle tree sized appropriately for collection | MEDIUM | On-chain verification |
| CNFT-06 | Canopy depth sufficient for operations | MEDIUM | On-chain verification |
| CNFT-07 | Tree creator key secured | CRITICAL | Key audit |
| CNFT-08 | Metadata URI points to permanent storage (Arweave) | HIGH | Metadata review |
| CNFT-09 | Batch minting limited to 15 simultaneous transactions | MEDIUM | Code review |
| CNFT-10 | Finalized commitment used for mint confirmation before asset ID retrieval | HIGH | Code review |

**Verification Commands:**
```bash
# Check for DAS API usage
grep -rn "getAsset\|getAssetsByOwner\|getAssetProof" --include="*.ts"

# Verify merkle proof verification
grep -rn "getAssetWithProof\|proof.*verify" --include="*.ts"

# Check metadata storage
grep -rn "arweave.net\|ipfs.io\|metadata.*uri" --include="*.ts"
```

### 3.5 State Reconciliation

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| REC-01 | Periodic reconciliation job exists | HIGH | Code review |
| REC-02 | Stale transaction detection (>2 min pending) | HIGH | Code review |
| REC-03 | Transaction status re-checked on reconciliation | HIGH | Code review |
| REC-04 | Failed transactions properly marked and handled | HIGH | Code review |
| REC-05 | Asset ownership verification capability | HIGH | Code review |
| REC-06 | Full audit trail of blockchain operations | MEDIUM | Log review |
| REC-07 | Alerting on reconciliation failures | MEDIUM | Monitoring review |
| REC-08 | Manual reconciliation tools available | MEDIUM | Tool review |

**Verification Commands:**
```bash
# Check for reconciliation jobs
grep -rn "reconcil\|sync.*blockchain\|verify.*state" --include="*.ts"

# Look for signature status checks
grep -rn "getSignatureStatus\|searchTransactionHistory" --include="*.ts"
```

### 3.6 Metaplex Integration

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| MPX-01 | Using official @metaplex-foundation packages | HIGH | Package review |
| MPX-02 | Bubblegum program ID correctly configured | CRITICAL | Code review |
| MPX-03 | Token Metadata program ID correctly configured | CRITICAL | Code review |
| MPX-04 | Collection verified on minted NFTs | HIGH | On-chain verification |
| MPX-05 | Creator verification signing implemented | MEDIUM | Code review |
| MPX-06 | Royalty basis points correctly set | MEDIUM | Metadata review |
| MPX-07 | Update authority properly secured | HIGH | Key audit |
| MPX-08 | Metadata follows Metaplex JSON standard | HIGH | Schema validation |

**Verification Commands:**
```bash
# Verify package versions
grep -rn "@metaplex-foundation" package.json

# Check program IDs
grep -rn "BUBBLEGUM_PROGRAM_ID\|TOKEN_METADATA_PROGRAM" --include="*.ts"

# Validate metadata schema
# Use JSON schema validator against metadata files
```

---

## 4. Sources

### Official Documentation
- Solana Transaction Confirmation Guide: https://solana.com/developers/guides/advanced/confirmation
- Solana Retrying Transactions: https://solana.com/developers/guides/advanced/retry
- Solana Priority Fees Guide: https://solana.com/developers/guides/advanced/how-to-use-priority-fees
- Solana Clusters & RPC Endpoints: https://solana.com/docs/references/clusters
- Solana Transaction Fees: https://solana.com/docs/core/fees

### Metaplex
- Bubblegum (cNFT) Documentation: https://developers.metaplex.com/bubblegum
- Bubblegum V2 Overview: https://developers.metaplex.com/bubblegum-v2
- Token Metadata Standard: https://developers.metaplex.com/token-metadata/token-standard
- Minting Compressed NFTs: https://developers.metaplex.com/bubblegum/mint-cnfts
- DAS API Specification: https://github.com/metaplex-foundation/digital-asset-standard-api

### RPC & Infrastructure
- Chainstack Multi-RPC Guide: https://docs.chainstack.com/docs/solana-how-to-use-multiple-rpc-endpoints-optimize-dapp-performance
- Helius DAS API: https://www.helius.dev/docs/das-api
- Helius Priority Fee API: https://www.helius.dev/docs/priority-fee-api
- Helius Transaction Optimization: https://www.helius.dev/docs/sending-transactions/optimizing-transactions
- QuickNode Transaction Optimization: https://www.quicknode.com/docs/solana/transactions
- Chainstack Commitment Levels: https://chainstack.com/solana-transaction-commitment-levels/

### Security
- Ledger Exchange Security Guide: https://www.ledger.com/how-to-properly-secure-cryptocurrencies-exchanges
- Squads Multisig for Validators: https://squads.so/blog/solana-validator-management-multisig
- Helius Commitment Levels: https://www.helius.dev/blog/solana-commitment-levels

### Additional Resources
- Helius NFT Compression Guide: https://www.helius.dev/blog/solana-nft-compression
- Helius DAS API Overview: https://www.helius.dev/blog/all-you-need-to-know-about-solanas-new-das-api
- Chainstack Retry Logic Guide: https://docs.chainstack.com/docs/enhancing-solana-spl-token-transfers-with-retry-logic
- QuickNode Transaction Propagation: https://www.quicknode.com/guides/solana-development/transactions/solana-transaction-propagation-handling-dropped-transactions
- Solana Foundation cNFT Course: https://github.com/solana-foundation/solana-com/blob/main/content/courses/state-compression/compressed-nfts.mdx

---

## Appendix: Quick Reference Commands

### Transaction Verification
```bash
# Check transaction status
solana confirm -v <SIGNATURE>

# Get transaction details
solana transaction-history <ADDRESS> --limit 10
```

### Wallet Operations
```bash
# Check wallet balance
solana balance <WALLET_ADDRESS>

# Get account info
solana account <ADDRESS>
```

### NFT/cNFT Verification
```bash
# Using DAS API via curl
curl -X POST https://mainnet.helius-rpc.com/?api-key=KEY \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAsset","params":{"id":"ASSET_ID"}}'

# Get all assets for wallet
curl -X POST https://mainnet.helius-rpc.com/?api-key=KEY \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getAssetsByOwner","params":{"ownerAddress":"WALLET"}}'
```

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**Maintained By:** TicketToken Security Team