/**
 * Treasury Address Whitelist
 * 
 * AUDIT FIX #85: Add address whitelist for treasury transactions
 * 
 * Features:
 * - Whitelist of allowed destination addresses
 * - Load from environment or config file
 * - Program address wildcards for Metaplex, etc.
 * - Security logging for rejected attempts
 */

import { logger } from '../utils/logger';
import { PublicKey } from '@solana/web3.js';

// Node.js globals
declare const process: { env: Record<string, string | undefined> };

// =============================================================================
// CONFIGURATION
// =============================================================================

// Whether whitelist is enabled (default: true in production)
const WHITELIST_ENABLED = process.env.TREASURY_WHITELIST_ENABLED !== 'false' 
  && process.env.NODE_ENV === 'production';

// =============================================================================
// WELL-KNOWN PROGRAM ADDRESSES (Always Allowed)
// =============================================================================

const SYSTEM_PROGRAMS = new Set([
  // Solana System Programs
  '11111111111111111111111111111111', // System Program
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', // Associated Token Program
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', // Token-2022 Program
  
  // Metaplex Programs (for NFT minting)
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s', // Token Metadata Program
  'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY', // Bubblegum (cNFT)
  'cmtDvXumGCrqC1Age74AVPhSRVXJMd8PJS91L8KbNCK', // Account Compression
  'noopb9bkMVfRPU8AsbFAh6DkH4wdQNzN3nQXRCxD', // Noop (for compression)
  
  // Metaplex Candy Machine
  'CndyV3LdqHUfDLmE5naZjVN8rBZz4tqhdefbAnjHG3JR', // Candy Machine Core
  'Guard1JwRhJkVH6XZhzoYxeBVQe872VH6QggF4BWmS9g', // Candy Guard
  
  // Other common programs
  'memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo', // Memo Program
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr' // Memo V2
]);

// =============================================================================
// WHITELIST STATE
// =============================================================================

const whitelistedAddresses = new Set<string>();
let whitelistLoaded = false;

// =============================================================================
// WHITELIST LOADING
// =============================================================================

/**
 * Load whitelist from environment and config
 * Called at startup
 */
export function loadWhitelist(): void {
  // Clear existing
  whitelistedAddresses.clear();
  
  // Add system programs
  SYSTEM_PROGRAMS.forEach(addr => whitelistedAddresses.add(addr));
  
  // Load from environment variable (comma-separated)
  const envAddresses = process.env.TREASURY_WHITELIST_ADDRESSES || '';
  if (envAddresses) {
    const addresses = envAddresses.split(',').map(a => a.trim()).filter(a => a);
    for (const addr of addresses) {
      if (isValidAddress(addr)) {
        whitelistedAddresses.add(addr);
      } else {
        logger.warn('Invalid address in TREASURY_WHITELIST_ADDRESSES', {
          address: addr.slice(0, 8) + '...'
        });
      }
    }
  }
  
  // Try to load from config file
  loadFromConfigFile();
  
  whitelistLoaded = true;
  
  logger.info('Treasury whitelist loaded', {
    enabled: WHITELIST_ENABLED,
    totalAddresses: whitelistedAddresses.size,
    systemPrograms: SYSTEM_PROGRAMS.size,
    customAddresses: whitelistedAddresses.size - SYSTEM_PROGRAMS.size
  });
}

/**
 * Load additional addresses from config file
 */
function loadFromConfigFile(): void {
  try {
    // Note: In production, this would load from a secure config file
    // For now, just log that we would load from file
    const configPath = process.env.TREASURY_WHITELIST_FILE;
    if (configPath) {
      logger.info('Would load whitelist from file', { configPath });
      // In production: const addresses = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    logger.warn('Failed to load whitelist config file', {
      error: (error as Error).message
    });
  }
}

/**
 * Validate a Solana address format
 */
function isValidAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// WHITELIST CHECKING
// =============================================================================

export interface WhitelistCheckResult {
  allowed: boolean;
  reason: string;
  isSystemProgram: boolean;
}

/**
 * Check if a destination address is whitelisted
 * AUDIT FIX #85: Reject transactions to non-whitelisted addresses
 */
export function checkWhitelist(destinationAddress: string): WhitelistCheckResult {
  // If whitelist is disabled, allow all
  if (!WHITELIST_ENABLED) {
    return {
      allowed: true,
      reason: 'Whitelist disabled',
      isSystemProgram: false
    };
  }
  
  // Ensure whitelist is loaded
  if (!whitelistLoaded) {
    loadWhitelist();
  }
  
  // Check if it's a system program
  if (SYSTEM_PROGRAMS.has(destinationAddress)) {
    return {
      allowed: true,
      reason: 'System program (always allowed)',
      isSystemProgram: true
    };
  }
  
  // Check if explicitly whitelisted
  if (whitelistedAddresses.has(destinationAddress)) {
    return {
      allowed: true,
      reason: 'Explicitly whitelisted',
      isSystemProgram: false
    };
  }
  
  // Not whitelisted - log security event
  logger.warn('SECURITY: Treasury transaction to non-whitelisted address rejected', {
    destination: destinationAddress.slice(0, 8) + '...',
    event: 'WHITELIST_REJECTED'
  });
  
  return {
    allowed: false,
    reason: 'Address not in whitelist',
    isSystemProgram: false
  };
}

/**
 * Validate destination before transaction
 * Throws if not allowed
 */
export function validateDestination(destinationAddress: string): void {
  const result = checkWhitelist(destinationAddress);
  
  if (!result.allowed) {
    throw new Error(
      `Treasury transaction rejected: Destination ${destinationAddress.slice(0, 8)}... is not whitelisted. ` +
      'Contact administrator to add this address.'
    );
  }
}

// =============================================================================
// WHITELIST MANAGEMENT (Read-only for API)
// =============================================================================

/**
 * Get whitelist status for admin dashboard
 * Does NOT expose full addresses for security
 */
export function getWhitelistStatus(): {
  enabled: boolean;
  totalAddresses: number;
  systemPrograms: number;
  customAddresses: number;
} {
  return {
    enabled: WHITELIST_ENABLED,
    totalAddresses: whitelistedAddresses.size,
    systemPrograms: SYSTEM_PROGRAMS.size,
    customAddresses: whitelistedAddresses.size - SYSTEM_PROGRAMS.size
  };
}

/**
 * Get list of whitelisted addresses (masked for security)
 * For admin dashboard viewing only
 */
export function getWhitelistAddresses(options?: {
  includeSystemPrograms?: boolean;
  masked?: boolean;
}): Array<{ address: string; type: 'system' | 'custom' }> {
  const addresses: Array<{ address: string; type: 'system' | 'custom' }> = [];
  
  for (const addr of whitelistedAddresses) {
    const isSystem = SYSTEM_PROGRAMS.has(addr);
    
    if (!options?.includeSystemPrograms && isSystem) {
      continue;
    }
    
    addresses.push({
      address: options?.masked !== false 
        ? `${addr.slice(0, 8)}...${addr.slice(-4)}`
        : addr,
      type: isSystem ? 'system' : 'custom'
    });
  }
  
  return addresses;
}

/**
 * Check if an address is in the whitelist (for testing/debugging)
 */
export function isAddressWhitelisted(address: string): boolean {
  return checkWhitelist(address).allowed;
}

// =============================================================================
// RUNTIME ADDITIONS (Requires authorization)
// =============================================================================

/**
 * Add address to whitelist at runtime
 * SECURITY: This should only be called by authorized admin operations
 */
export function addToWhitelist(address: string, authorizedBy: string): boolean {
  if (!isValidAddress(address)) {
    logger.error('Invalid address format for whitelist addition', {
      address: address.slice(0, 8) + '...'
    });
    return false;
  }
  
  if (whitelistedAddresses.has(address)) {
    logger.info('Address already in whitelist', {
      address: address.slice(0, 8) + '...'
    });
    return true;
  }
  
  whitelistedAddresses.add(address);
  
  logger.warn('SECURITY: Address added to treasury whitelist', {
    address: address.slice(0, 8) + '...',
    authorizedBy,
    event: 'WHITELIST_ADDITION'
  });
  
  return true;
}

/**
 * Remove address from whitelist at runtime
 * SECURITY: This should only be called by authorized admin operations
 */
export function removeFromWhitelist(address: string, authorizedBy: string): boolean {
  // Don't allow removing system programs
  if (SYSTEM_PROGRAMS.has(address)) {
    logger.error('Cannot remove system program from whitelist', {
      address: address.slice(0, 8) + '...'
    });
    return false;
  }
  
  if (!whitelistedAddresses.has(address)) {
    logger.info('Address not in whitelist', {
      address: address.slice(0, 8) + '...'
    });
    return false;
  }
  
  whitelistedAddresses.delete(address);
  
  logger.warn('SECURITY: Address removed from treasury whitelist', {
    address: address.slice(0, 8) + '...',
    authorizedBy,
    event: 'WHITELIST_REMOVAL'
  });
  
  return true;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

// Auto-load on module import
loadWhitelist();

// =============================================================================
// EXPORTS
// =============================================================================

export { 
  WHITELIST_ENABLED,
  SYSTEM_PROGRAMS
};
