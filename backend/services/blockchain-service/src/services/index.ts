/**
 * Blockchain Service - Services Index
 *
 * Export all service classes and utilities for use across the application.
 */

// =============================================================================
// CORE BLOCKCHAIN SERVICES
// =============================================================================

export { MetaplexService } from './MetaplexService';
export { BlockchainQueryService } from './BlockchainQueryService';
export { RPCFailoverService } from './RPCFailoverService';
export { TransactionConfirmationService } from './TransactionConfirmationService';

// =============================================================================
// CUSTODIAL WALLET SERVICES (Phase 1)
// =============================================================================

export {
  CustodialWalletService,
  type CustodialWallet,
  type EncryptedKeyData,
  type CreateWalletResult,
} from './CustodialWalletService';

export {
  TreasuryMonitoringService,
  type TreasuryWallet,
  type BalanceCheckResult,
  type MonitoringStats,
} from './TreasuryMonitoringService';

// =============================================================================
// INTERNAL CLIENTS
// =============================================================================

export * from './internal-client';
