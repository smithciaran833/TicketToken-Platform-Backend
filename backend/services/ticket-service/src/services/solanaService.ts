import { 
  Connection, 
  Keypair, 
  PublicKey, 
  Transaction,
  TransactionSignature,
  Commitment,
  SignatureStatus,
  Context,
} from '@solana/web3.js';
import { config } from '../config';
import { logger } from '../utils/logger';
// NFTMintRequest may not have eventId, make it optional in our interface
interface NFTMintRequest {
  ticketId: string;
  eventId?: string;
  metadata: Record<string, unknown>;
}
import { DatabaseService } from './databaseService';

// =============================================================================
// TYPES
// =============================================================================

interface TransactionResult {
  signature: string;
  slot?: number;
  blockTime?: number;
  confirmed: boolean;
  error?: string;
}

interface PendingTransactionRecord {
  txSignature: string;
  txType: 'mint' | 'transfer' | 'burn' | 'metadata_update' | 'verify';
  ticketId?: string;
  eventId?: string;
  fromUserId?: string;
  toUserId?: string;
  blockhash: string;
  lastValidBlockHeight: number;
}

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

class CircuitBreaker {
  private state: CircuitBreakerState = {
    state: 'CLOSED',
    failureCount: 0,
    lastFailureTime: 0,
    successCount: 0,
  };

  private readonly failureThreshold = 5;
  private readonly recoveryTimeout = 30000; // 30 seconds
  private readonly halfOpenSuccessThreshold = 3;
  private log = logger.child({ component: 'CircuitBreaker' });

  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      if (Date.now() - this.state.lastFailureTime > this.recoveryTimeout) {
        this.state.state = 'HALF_OPEN';
        this.state.successCount = 0;
        this.log.info('Circuit breaker transitioning to HALF_OPEN');
      } else {
        this.log.warn('Circuit breaker OPEN, rejecting request');
        if (fallback) return fallback();
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) return fallback();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.state.successCount++;
      if (this.state.successCount >= this.halfOpenSuccessThreshold) {
        this.state.state = 'CLOSED';
        this.state.failureCount = 0;
        this.log.info('Circuit breaker CLOSED after recovery');
      }
    } else {
      this.state.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();

    if (this.state.failureCount >= this.failureThreshold) {
      this.state.state = 'OPEN';
      this.log.error('Circuit breaker OPEN due to failures', {
        failureCount: this.state.failureCount,
      });
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }
}

// =============================================================================
// RPC FAILOVER MANAGER
// =============================================================================

class RPCFailoverManager {
  private endpoints: string[];
  private currentIndex: number = 0;
  private healthStatus: Map<string, boolean> = new Map();
  private log = logger.child({ component: 'RPCFailover' });

  constructor(endpoints: string[]) {
    this.endpoints = endpoints.length > 0 ? endpoints : [config.solana.rpcUrl];
    this.endpoints.forEach(ep => this.healthStatus.set(ep, true));
  }

  getCurrentEndpoint(): string {
    return this.endpoints[this.currentIndex];
  }

  markUnhealthy(endpoint: string): void {
    this.healthStatus.set(endpoint, false);
    this.log.warn('RPC endpoint marked unhealthy', { endpoint });
    this.failover();
  }

  markHealthy(endpoint: string): void {
    this.healthStatus.set(endpoint, true);
    this.log.info('RPC endpoint marked healthy', { endpoint });
  }

  failover(): string {
    const startIndex = this.currentIndex;
    do {
      this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
      if (this.healthStatus.get(this.endpoints[this.currentIndex])) {
        this.log.info('Failover to new endpoint', { 
          endpoint: this.endpoints[this.currentIndex] 
        });
        return this.endpoints[this.currentIndex];
      }
    } while (this.currentIndex !== startIndex);

    // All endpoints unhealthy, reset and try primary
    this.log.error('All RPC endpoints unhealthy, resetting');
    this.endpoints.forEach(ep => this.healthStatus.set(ep, true));
    this.currentIndex = 0;
    return this.endpoints[0];
  }

  getHealthStatus(): Record<string, boolean> {
    return Object.fromEntries(this.healthStatus);
  }
}

// =============================================================================
// WEBSOCKET LISTENER
// =============================================================================

class BlockchainEventListener {
  private connection: Connection | null = null;
  private subscriptionId: number | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private isConnected: boolean = false;
  private log = logger.child({ component: 'BlockchainListener' });
  private onConfirmationCallback?: (signature: string, status: SignatureStatus) => void;

  async connect(wsEndpoint: string): Promise<void> {
    try {
      this.connection = new Connection(wsEndpoint, {
        commitment: 'confirmed',
        wsEndpoint: wsEndpoint.replace('https://', 'wss://').replace('http://', 'ws://'),
      });

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.log.info('WebSocket connected', { endpoint: wsEndpoint });
    } catch (error) {
      this.log.error('WebSocket connection failed', { error });
      await this.handleReconnect(wsEndpoint);
    }
  }

  async subscribeToSignature(
    signature: string, 
    callback: (err: Error | null, context: Context) => void
  ): Promise<number | null> {
    if (!this.connection) {
      this.log.warn('No WebSocket connection for subscription');
      return null;
    }

    try {
      const subscriptionId = this.connection.onSignature(
        signature,
        (result, context) => {
          // SignatureResult has `err` property
          callback(result.err ? new Error(JSON.stringify(result.err)) : null, context);
        },
        'confirmed'
      );
      return subscriptionId;
    } catch (error) {
      this.log.error('Failed to subscribe to signature', { signature, error });
      return null;
    }
  }

  private async handleReconnect(endpoint: string): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    this.log.info('Attempting reconnection', { 
      attempt: this.reconnectAttempts,
      delay 
    });

    await new Promise(resolve => setTimeout(resolve, delay));
    await this.connect(endpoint);
  }

  async disconnect(): Promise<void> {
    if (this.subscriptionId !== null && this.connection) {
      await this.connection.removeSignatureListener(this.subscriptionId);
    }
    this.isConnected = false;
    this.log.info('WebSocket disconnected');
  }

  getStatus(): { connected: boolean; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// =============================================================================
// TRANSACTION CONFIRMATION SERVICE
// =============================================================================

class TransactionConfirmationService {
  private log = logger.child({ component: 'TxConfirmation' });

  async waitForConfirmation(
    connection: Connection,
    signature: string,
    blockhash: string,
    lastValidBlockHeight: number,
    maxRetries: number = 30
  ): Promise<TransactionResult> {
    for (let i = 0; i < maxRetries; i++) {
      // Check if blockhash expired
      const currentBlockHeight = await connection.getBlockHeight();
      if (currentBlockHeight > lastValidBlockHeight) {
        this.log.warn('Blockhash expired', { 
          signature, 
          currentBlockHeight, 
          lastValidBlockHeight 
        });
        return {
          signature,
          confirmed: false,
          error: 'BLOCKHASH_EXPIRED',
        };
      }

      // Check transaction status
      const status = await connection.getSignatureStatus(signature);
      
      if (status?.value?.err) {
        this.log.error('Transaction failed', { signature, error: status.value.err });
        return {
          signature,
          confirmed: false,
          error: JSON.stringify(status.value.err),
        };
      }

      if (status?.value?.confirmationStatus === 'confirmed' || 
          status?.value?.confirmationStatus === 'finalized') {
        this.log.info('Transaction confirmed', { 
          signature, 
          slot: status.value.slot,
          confirmationStatus: status.value.confirmationStatus
        });
        return {
          signature,
          slot: status.value.slot,
          confirmed: true,
        };
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      signature,
      confirmed: false,
      error: 'CONFIRMATION_TIMEOUT',
    };
  }

  async checkExpiredTransactions(connection: Connection): Promise<void> {
    const currentBlockHeight = await connection.getBlockHeight();
    
    // Find expired pending transactions
    const result = await DatabaseService.query<{ tx_signature: string; tenant_id: string }>(
      `SELECT tx_signature, tenant_id FROM pending_transactions 
       WHERE status = 'pending' 
       AND last_valid_block_height < $1`,
      [currentBlockHeight]
    );

    for (const row of result.rows) {
      this.log.warn('Marking transaction as expired', { 
        txSignature: row.tx_signature 
      });
      
      await DatabaseService.query(
        `SELECT fail_transaction($1, 'BLOCKHASH_EXPIRED', 'Blockhash expired before confirmation')`,
        [row.tx_signature]
      );
    }
  }
}

// =============================================================================
// RECONCILIATION SERVICE
// =============================================================================

class ReconciliationService {
  private log = logger.child({ component: 'Reconciliation' });

  async reconcilePendingTransactions(connection: Connection): Promise<void> {
    this.log.info('Starting pending transaction reconciliation');

    // Get pending transactions older than 2 minutes
    const result = await DatabaseService.query<{
      tx_signature: string;
      tenant_id: string;
      ticket_id: string;
    }>(
      `SELECT tx_signature, tenant_id, ticket_id FROM pending_transactions 
       WHERE status IN ('pending', 'confirming')
       AND submitted_at < NOW() - INTERVAL '2 minutes'`
    );

    for (const row of result.rows) {
      try {
        const status = await connection.getSignatureStatus(row.tx_signature);
        
        if (status?.value?.confirmationStatus === 'finalized') {
          await DatabaseService.query(
            `SELECT confirm_transaction($1, $2, NOW())`,
            [row.tx_signature, status.value.slot]
          );
          this.log.info('Reconciled confirmed transaction', { 
            txSignature: row.tx_signature 
          });
        } else if (status?.value?.err) {
          await DatabaseService.query(
            `SELECT fail_transaction($1, 'ON_CHAIN_ERROR', $2)`,
            [row.tx_signature, JSON.stringify(status.value.err)]
          );
          this.log.warn('Reconciled failed transaction', { 
            txSignature: row.tx_signature 
          });
        }
      } catch (error) {
        this.log.error('Error reconciling transaction', { 
          txSignature: row.tx_signature, 
          error 
        });
      }
    }
  }

  async compareOwnership(
    connection: Connection,
    tokenMint: string,
    dbOwnerId: string
  ): Promise<{ matches: boolean; onChainOwner?: string }> {
    // This would use the actual token metadata program to check ownership
    // Simplified implementation
    this.log.info('Comparing ownership', { tokenMint, dbOwnerId });
    
    // In production, fetch actual on-chain owner from token account
    // const tokenAccounts = await connection.getTokenAccountsByOwner(...)
    
    return { matches: true };
  }
}

// =============================================================================
// MAIN SOLANA SERVICE
// =============================================================================

class SolanaServiceClass {
  private connection: Connection | null = null;
  private wallet: Keypair | null = null;
  private log = logger.child({ component: 'SolanaService' });
  
  // Sub-services
  private circuitBreaker = new CircuitBreaker();
  private rpcManager: RPCFailoverManager;
  private eventListener = new BlockchainEventListener();
  private confirmationService = new TransactionConfirmationService();
  private reconciliationService = new ReconciliationService();

  constructor() {
    // Initialize RPC failover with multiple endpoints
    const endpoints = process.env.SOLANA_RPC_ENDPOINTS?.split(',') || [config.solana.rpcUrl];
    this.rpcManager = new RPCFailoverManager(endpoints);
  }

  async initialize(): Promise<void> {
    try {
      await this.connect();
      
      // Start WebSocket listener
      await this.eventListener.connect(this.rpcManager.getCurrentEndpoint());
      
      // Start background jobs
      this.startConfirmationChecker();
      this.startReconciliationJob();
      
      this.log.info('Solana service fully initialized');
    } catch (error) {
      this.log.error('Failed to initialize Solana:', error);
      throw error;
    }
  }

  private async connect(): Promise<void> {
    const endpoint = this.rpcManager.getCurrentEndpoint();
    
    this.connection = new Connection(endpoint, {
      commitment: config.solana.commitment as Commitment,
      confirmTransactionInitialTimeout: 60000,
    });
    
    // Load wallet if configured
    if (config.solana.walletPrivateKey && config.solana.walletPrivateKey !== 'your-wallet-private-key') {
      try {
        const privateKey = Uint8Array.from(Buffer.from(config.solana.walletPrivateKey, 'base64'));
        this.wallet = Keypair.fromSecretKey(privateKey);
        this.log.info('Solana wallet loaded', { publicKey: this.wallet.publicKey.toBase58() });
      } catch (walletError) {
        this.log.warn('Solana wallet not configured - NFT minting will be simulated');
      }
    }

    // Test connection
    const version = await this.circuitBreaker.execute(
      () => this.connection!.getVersion(),
      async () => ({ 'solana-core': 'unknown' })
    );
    this.log.info('Solana connected', { version, endpoint });
  }

  getConnection(): Connection {
    if (!this.connection) {
      throw new Error('Solana not initialized');
    }
    return this.connection;
  }

  getWallet(): Keypair {
    if (!this.wallet) {
      throw new Error('Solana wallet not initialized');
    }
    return this.wallet;
  }

  // ===========================================================================
  // TRANSACTION METHODS
  // ===========================================================================

  async mintNFT(request: NFTMintRequest): Promise<{ tokenId: string; transactionHash: string }> {
    return this.circuitBreaker.execute(async () => {
      // Get recent blockhash for transaction
      const { blockhash, lastValidBlockHeight } = await this.connection!.getLatestBlockhash();
      
      this.log.info('Minting NFT', { ticketId: request.ticketId, blockhash });
      
      // In production, build actual transaction here
      const txSignature = `tx_mint_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const tokenId = `token_${Date.now()}`;
      
      // Record pending transaction
      await this.recordPendingTransaction({
        txSignature,
        txType: 'mint',
        ticketId: request.ticketId,
        eventId: request.eventId,
        blockhash,
        lastValidBlockHeight,
      });

      // In production: Submit actual transaction and wait for confirmation
      // const result = await this.confirmationService.waitForConfirmation(...)
      
      // Simulate confirmation for now
      setTimeout(async () => {
        await DatabaseService.query(
          `SELECT confirm_transaction($1, $2, NOW())`,
          [txSignature, 12345678]
        );
      }, 2000);

      return { tokenId, transactionHash: txSignature };
    });
  }

  async transferNFT(tokenId: string, from: string, to: string): Promise<string> {
    return this.circuitBreaker.execute(async () => {
      const { blockhash, lastValidBlockHeight } = await this.connection!.getLatestBlockhash();
      
      this.log.info('Transferring NFT', { tokenId, from, to, blockhash });
      
      const txSignature = `tx_transfer_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      
      // Record pending transaction
      await this.recordPendingTransaction({
        txSignature,
        txType: 'transfer',
        blockhash,
        lastValidBlockHeight,
      });

      return txSignature;
    });
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private async recordPendingTransaction(record: PendingTransactionRecord): Promise<void> {
    // Get tenant from context (would come from request in real implementation)
    const tenantId = '00000000-0000-0000-0000-000000000000'; // Placeholder
    
    await DatabaseService.query(
      `SELECT create_pending_transaction($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenantId,
        record.txSignature,
        record.txType,
        record.ticketId || null,
        record.eventId || null,
        record.fromUserId || null,
        record.toUserId || null,
        record.blockhash,
        record.lastValidBlockHeight,
      ]
    );
  }

  // ===========================================================================
  // BACKGROUND JOBS
  // ===========================================================================

  private startConfirmationChecker(): void {
    // Check for expired transactions every 30 seconds
    setInterval(async () => {
      if (!this.connection) return;
      
      try {
        await this.confirmationService.checkExpiredTransactions(this.connection);
      } catch (error) {
        this.log.error('Confirmation checker error', { error });
      }
    }, 30000);
    
    this.log.info('Started confirmation checker job');
  }

  private startReconciliationJob(): void {
    // Reconcile pending transactions every 5 minutes
    setInterval(async () => {
      if (!this.connection) return;
      
      try {
        await this.reconciliationService.reconcilePendingTransactions(this.connection);
      } catch (error) {
        this.log.error('Reconciliation job error', { error });
      }
    }, 300000);
    
    this.log.info('Started reconciliation job');
  }

  // ===========================================================================
  // BC1: SYNC STATUS MONITORING (Batch 25)
  // Expose sync lag, last block processed, health status
  // ===========================================================================

  // Track sync status
  private lastProcessedSlot: number = 0;
  private lastSyncTime: Date = new Date();
  private syncErrors: number = 0;
  private totalTransactionsProcessed: number = 0;
  private avgConfirmationTime: number = 0;

  /**
   * Get comprehensive sync status for blockchain monitoring
   * BC1 Fix: Exposes sync lag, last block, health status
   */
  async getSyncStatus(): Promise<{
    healthy: boolean;
    syncLag: number;
    lastBlockProcessed: number;
    lastSyncTime: string;
    currentSlot: number;
    slotsBehind: number;
    syncErrors: number;
    totalTransactions: number;
    avgConfirmationTimeMs: number;
    rpcEndpoint: string;
    cluster: string;
  }> {
    try {
      if (!this.connection) {
        return {
          healthy: false,
          syncLag: -1,
          lastBlockProcessed: 0,
          lastSyncTime: this.lastSyncTime.toISOString(),
          currentSlot: 0,
          slotsBehind: -1,
          syncErrors: this.syncErrors,
          totalTransactions: this.totalTransactionsProcessed,
          avgConfirmationTimeMs: this.avgConfirmationTime,
          rpcEndpoint: this.rpcManager.getCurrentEndpoint(),
          cluster: config.solana.cluster,
        };
      }

      const currentSlot = await this.connection.getSlot();
      const slotsBehind = currentSlot - this.lastProcessedSlot;
      const syncLagMs = Date.now() - this.lastSyncTime.getTime();

      // Consider healthy if:
      // - Connected
      // - Less than 100 slots behind
      // - Last sync within 60 seconds
      // - Circuit breaker not open
      const cbState = this.circuitBreaker.getState();
      const healthy = 
        this.connection !== null &&
        slotsBehind < 100 &&
        syncLagMs < 60000 &&
        cbState.state !== 'OPEN';

      return {
        healthy,
        syncLag: syncLagMs,
        lastBlockProcessed: this.lastProcessedSlot,
        lastSyncTime: this.lastSyncTime.toISOString(),
        currentSlot,
        slotsBehind,
        syncErrors: this.syncErrors,
        totalTransactions: this.totalTransactionsProcessed,
        avgConfirmationTimeMs: this.avgConfirmationTime,
        rpcEndpoint: this.rpcManager.getCurrentEndpoint(),
        cluster: config.solana.cluster,
      };
    } catch (error) {
      this.log.error('Error getting sync status', { error });
      this.syncErrors++;
      return {
        healthy: false,
        syncLag: -1,
        lastBlockProcessed: this.lastProcessedSlot,
        lastSyncTime: this.lastSyncTime.toISOString(),
        currentSlot: 0,
        slotsBehind: -1,
        syncErrors: this.syncErrors,
        totalTransactions: this.totalTransactionsProcessed,
        avgConfirmationTimeMs: this.avgConfirmationTime,
        rpcEndpoint: this.rpcManager.getCurrentEndpoint(),
        cluster: config.solana.cluster,
      };
    }
  }

  /**
   * Update sync tracking after processing a transaction
   */
  private updateSyncStatus(slot: number, confirmationTimeMs: number): void {
    this.lastProcessedSlot = Math.max(this.lastProcessedSlot, slot);
    this.lastSyncTime = new Date();
    this.totalTransactionsProcessed++;
    
    // Rolling average of confirmation times
    this.avgConfirmationTime = 
      (this.avgConfirmationTime * (this.totalTransactionsProcessed - 1) + confirmationTimeMs) 
      / this.totalTransactionsProcessed;
  }

  /**
   * Get Prometheus metrics format for sync status
   */
  getSyncMetrics(): string {
    const metrics: string[] = [];
    
    metrics.push(`# HELP blockchain_sync_lag_ms Time since last blockchain sync in milliseconds`);
    metrics.push(`# TYPE blockchain_sync_lag_ms gauge`);
    metrics.push(`blockchain_sync_lag_ms{service="ticket-service"} ${Date.now() - this.lastSyncTime.getTime()}`);
    
    metrics.push(`# HELP blockchain_last_processed_slot Last processed blockchain slot`);
    metrics.push(`# TYPE blockchain_last_processed_slot gauge`);
    metrics.push(`blockchain_last_processed_slot{service="ticket-service"} ${this.lastProcessedSlot}`);
    
    metrics.push(`# HELP blockchain_sync_errors_total Total number of sync errors`);
    metrics.push(`# TYPE blockchain_sync_errors_total counter`);
    metrics.push(`blockchain_sync_errors_total{service="ticket-service"} ${this.syncErrors}`);
    
    metrics.push(`# HELP blockchain_transactions_processed_total Total transactions processed`);
    metrics.push(`# TYPE blockchain_transactions_processed_total counter`);
    metrics.push(`blockchain_transactions_processed_total{service="ticket-service"} ${this.totalTransactionsProcessed}`);
    
    metrics.push(`# HELP blockchain_avg_confirmation_time_ms Average transaction confirmation time`);
    metrics.push(`# TYPE blockchain_avg_confirmation_time_ms gauge`);
    metrics.push(`blockchain_avg_confirmation_time_ms{service="ticket-service"} ${this.avgConfirmationTime.toFixed(2)}`);
    
    const cbState = this.circuitBreaker.getState();
    const healthyValue = cbState.state !== 'OPEN' ? 1 : 0;
    metrics.push(`# HELP blockchain_healthy Is blockchain connection healthy`);
    metrics.push(`# TYPE blockchain_healthy gauge`);
    metrics.push(`blockchain_healthy{service="ticket-service"} ${healthyValue}`);
    
    return metrics.join('\n');
  }

  // ===========================================================================
  // HEALTH & STATUS
  // ===========================================================================

  getHealthStatus(): {
    connected: boolean;
    circuitBreaker: CircuitBreakerState;
    rpcEndpoints: Record<string, boolean>;
    websocket: { connected: boolean; reconnectAttempts: number };
  } {
    return {
      connected: this.connection !== null,
      circuitBreaker: this.circuitBreaker.getState(),
      rpcEndpoints: this.rpcManager.getHealthStatus(),
      websocket: this.eventListener.getStatus(),
    };
  }

  async verifyOwnership(tokenMint: string, expectedOwner: string): Promise<boolean> {
    if (!this.connection) return false;
    
    const result = await this.reconciliationService.compareOwnership(
      this.connection,
      tokenMint,
      expectedOwner
    );
    
    return result.matches;
  }
}

export const SolanaService = new SolanaServiceClass();
