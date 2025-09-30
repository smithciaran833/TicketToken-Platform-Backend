import { logger } from './logger';

// Validate Solana wallet address format
export const isValidSolanaAddress = (address: string): boolean => {
  if (!address) return false;
  
  // Basic validation - Solana addresses are base58 encoded and typically 32-44 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
};

// Format wallet address for display
export const formatWalletAddress = (address: string): string => {
  if (!address || address.length < 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

// Verify wallet ownership (simplified - in production would check signature)
export const verifyWalletOwnership = async (
  walletAddress: string,
  message: string,
  signature: string
): Promise<boolean> => {
  try {
    // In production, this would verify the signature using Solana's nacl library
    logger.info(`Verifying wallet ownership for ${formatWalletAddress(walletAddress)}`);
    
    // Placeholder verification - replace with actual signature verification
    if (!walletAddress || !message || !signature) {
      return false;
    }
    
    // For now, return true if all parameters are present
    return true;
  } catch (error) {
    logger.error('Error verifying wallet ownership:', error);
    return false;
  }
};

// Get wallet type
export const getWalletType = (address: string): 'solana' | 'unknown' => {
  if (isValidSolanaAddress(address)) return 'solana';
  return 'unknown';
};

// Check if wallet is program-owned
export const isProgramWallet = (address: string): boolean => {
  // Check if address matches known program addresses
  const programAddresses = [
    process.env.TICKET_PROGRAM_ADDRESS,
    process.env.MARKETPLACE_PROGRAM_ADDRESS
  ].filter(Boolean);
  
  return programAddresses.includes(address);
};
