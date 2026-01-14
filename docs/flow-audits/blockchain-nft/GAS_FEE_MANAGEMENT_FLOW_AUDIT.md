# GAS FEE MANAGEMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Gas Fee Management |

---

## Executive Summary

**WORKING - Comprehensive gas/fee management**

| Component | Status |
|-----------|--------|
| BalanceMonitor service | ✅ Working |
| Low balance alerts | ✅ Working |
| Pre-mint balance check | ✅ Working |
| Gas fee estimator | ✅ Working |
| Solana fee estimation | ✅ Working |
| Polygon fee estimation | ✅ Working |
| Ethereum fee estimation | ⚠️ Placeholder |
| Health check integration | ✅ Working |
| Metrics tracking | ✅ Working |

**Bottom Line:** Comprehensive gas fee management with balance monitoring, low-balance alerts, pre-mint validation, and multi-chain fee estimation. The system prevents minting when wallet balance is insufficient and alerts operators when funds are low.

---

## Balance Monitoring

### BalanceMonitor Service

**File:** `backend/services/minting-service/src/services/BalanceMonitor.ts`
```typescript
class BalanceMonitor {
  private minBalance = 0.1;  // SOL
  private checkInterval = 300000;  // 5 minutes
  private alertCooldown = 3600000;  // 1 hour

  start() {
    // Check immediately, then periodically
    this.checkBalance();
    setInterval(() => this.checkBalance(), this.checkInterval);
  }

  private async checkBalance() {
    const result = await checkWalletBalance(connection, wallet, minBalance);
    
    if (!result.sufficient) {
      this.alertLowBalance(result.balance);
    }
  }

  private alertLowBalance(currentBalance: number) {
    // Rate-limited alert (once per hour)
    logger.warn('⚠️ LOW WALLET BALANCE ALERT', {
      wallet: this.wallet.toString(),
      currentBalance,
      minRequired: this.minBalance,
      deficit: this.minBalance - currentBalance,
      severity: 'HIGH'
    });
  }
}
```

### Pre-Mint Balance Check

**File:** `backend/services/minting-service/src/services/MintingOrchestrator.ts`
```typescript
async mintCompressedNFT(ticketData) {
  // 1. Check wallet balance BEFORE minting
  const minBalance = parseFloat(process.env.MIN_SOL_BALANCE || '0.1');
  const balanceCheck = await checkWalletBalance(
    this.connection,
    this.wallet.publicKey,
    minBalance
  );

  walletBalanceSOL.set(balanceCheck.balance);  // Update metrics

  if (!balanceCheck.sufficient) {
    mintsFailedTotal.inc({ reason: 'insufficient_balance' });
    throw new Error(
      `Insufficient wallet balance: ${balanceCheck.balance} SOL (minimum: ${minBalance} SOL)`
    );
  }

  // Continue with minting...
}
```

---

## Gas Fee Estimation

### Multi-Chain Estimator

**File:** `backend/services/payment-service/src/services/core/gas-fee-estimator.service.ts`
```typescript
interface GasFeeEstimate {
  blockchain: string;
  baseFee: string;
  priorityFee?: string;
  estimatedTotal: string;
  currency: string;
  usdEquivalent: number;
}

class GasFeeEstimatorService {
  async estimateGasFees(
    blockchain: 'solana' | 'polygon' | 'ethereum',
    ticketCount: number
  ): Promise<GasFeeEstimate> {
    switch (blockchain) {
      case 'solana':
        return await this.estimateSolanaFees(ticketCount);
      case 'polygon':
        return await this.estimatePolygonFees(ticketCount);
      case 'ethereum':
        return await this.estimateEthereumFees(ticketCount);
    }
  }

  private async estimateSolanaFees(ticketCount: number): Promise<GasFeeEstimate> {
    // Get recent prioritization fees from Solana
    // Calculate based on compressed NFT costs
    // Return estimate
  }

  private async estimatePolygonFees(ticketCount: number): Promise<GasFeeEstimate> {
    // Get gas price from Polygon
    // Estimate gas units needed
    // Return estimate
  }
}
```

### Fallback Estimates
```typescript
// Conservative fallback estimates when RPC fails
getFallbackEstimate(blockchain: string, ticketCount: number) {
  const estimates = {
    solana: { baseFee: '0.00025', perTicket: '0.0001' },
    polygon: { baseFee: '0.01', perTicket: '0.001' },
    ethereum: { baseFee: '5.00', perTicket: '2.00' }
  };
}
```

---

## Configuration

### Environment Variables
```bash
# Minimum SOL balance to allow minting
MIN_SOL_BALANCE=0.1

# Balance check interval (ms)
BALANCE_CHECK_INTERVAL=300000

# Solana RPC endpoint
SOLANA_RPC_URL=https://api.devnet.solana.com

# Polygon RPC endpoint
POLYGON_RPC_URL=https://polygon-rpc.com
```

---

## Health Check Integration

**File:** `backend/services/minting-service/src/routes/health.routes.ts`
```typescript
// Health check includes balance status
{
  status: 'healthy',
  components: {
    wallet: {
      balance: 1.5,
      sufficient: true,
      minRequired: 0.1
    }
  }
}
```

---

## Metrics

**File:** `backend/services/minting-service/src/utils/metrics.ts`
```typescript
// Wallet balance gauge
walletBalanceSOL.set(balanceCheck.balance);

// Mints failed by reason
mintsFailedTotal.inc({ reason: 'insufficient_balance' });
```

---

## Alert Flow
```
Balance Check
    ↓
Below Threshold?
    ↓ YES
Cooldown Expired?
    ↓ YES
Log CRITICAL Alert
    ↓
Console Error with Details
    ↓
(TODO: PagerDuty, Email, SMS)
```

---

## Recommendations

### P2 - Add External Alerting

| Task | Effort |
|------|--------|
| Integrate PagerDuty/OpsGenie | 0.5 day |
| Add email alerts | 0.5 day |
| Add Slack webhook | 0.25 day |
| Auto-fund from treasury (optional) | 2 days |
| **Total** | **1.25 - 3.25 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `minting-service/src/services/BalanceMonitor.ts` | Balance monitoring |
| `minting-service/src/services/MintingOrchestrator.ts` | Pre-mint check |
| `minting-service/src/utils/solana.ts` | Balance utilities |
| `payment-service/src/services/core/gas-fee-estimator.service.ts` | Fee estimation |

---

## Related Documents

- `NFT_MINTING_LIFECYCLE_FLOW_AUDIT.md` - Where balance is checked
- `BLOCKCHAIN_FLOW_AUDIT.md` - General blockchain status
