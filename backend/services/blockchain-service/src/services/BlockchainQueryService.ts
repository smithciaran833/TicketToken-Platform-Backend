import { Connection, PublicKey, ParsedTransactionWithMeta, TokenAmount } from '@solana/web3.js';
import { logger } from '../utils/logger';

interface TokenAccountInfo {
  mint: string;
  owner: string;
  amount: string;
  decimals: number;
}

interface NFTInfo {
  mint: string;
  owner: string;
  name?: string;
  symbol?: string;
  uri?: string;
}

export class BlockchainQueryService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Get SOL balance for an address
   */
  async getBalance(address: string): Promise<number> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      
      logger.debug('Retrieved SOL balance', {
        address,
        balance,
        sol: balance / 1e9
      });

      return balance;
    } catch (error: any) {
      logger.error('Failed to get balance', {
        address,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all token accounts owned by an address
   */
  async getTokenAccounts(ownerAddress: string): Promise<TokenAccountInfo[]> {
    try {
      const publicKey = new PublicKey(ownerAddress);
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      );

      const accounts: TokenAccountInfo[] = tokenAccounts.value.map(account => {
        const parsedInfo = account.account.data.parsed.info;
        return {
          mint: parsedInfo.mint,
          owner: parsedInfo.owner,
          amount: parsedInfo.tokenAmount.amount,
          decimals: parsedInfo.tokenAmount.decimals
        };
      });

      logger.debug('Retrieved token accounts', {
        owner: ownerAddress,
        count: accounts.length
      });

      return accounts;
    } catch (error: any) {
      logger.error('Failed to get token accounts', {
        owner: ownerAddress,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get NFTs owned by an address
   */
  async getNFTsByOwner(ownerAddress: string): Promise<NFTInfo[]> {
    try {
      const tokenAccounts = await this.getTokenAccounts(ownerAddress);
      
      // Filter for NFTs (amount = 1, decimals = 0)
      const nftAccounts = tokenAccounts.filter(
        account => account.amount === '1' && account.decimals === 0
      );

      const nfts: NFTInfo[] = nftAccounts.map(account => ({
        mint: account.mint,
        owner: account.owner
      }));

      logger.debug('Retrieved NFTs', {
        owner: ownerAddress,
        count: nfts.length
      });

      return nfts;
    } catch (error: any) {
      logger.error('Failed to get NFTs', {
        owner: ownerAddress,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get transaction details
   */
  async getTransaction(signature: string): Promise<ParsedTransactionWithMeta | null> {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (tx) {
        logger.debug('Retrieved transaction', {
          signature,
          slot: tx.slot,
          success: tx.meta?.err === null
        });
      } else {
        logger.warn('Transaction not found', { signature });
      }

      return tx;
    } catch (error: any) {
      logger.error('Failed to get transaction', {
        signature,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get recent transactions for an address
   */
  async getRecentTransactions(
    address: string,
    limit: number = 10
  ): Promise<ParsedTransactionWithMeta[]> {
    try {
      const publicKey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(publicKey, {
        limit
      });

      const transactions = await Promise.all(
        signatures.map(sig => this.getTransaction(sig.signature))
      );

      const validTransactions = transactions.filter(
        (tx): tx is ParsedTransactionWithMeta => tx !== null
      );

      logger.debug('Retrieved recent transactions', {
        address,
        requested: limit,
        found: validTransactions.length
      });

      return validTransactions;
    } catch (error: any) {
      logger.error('Failed to get recent transactions', {
        address,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get account info
   */
  async getAccountInfo(address: string) {
    try {
      const publicKey = new PublicKey(address);
      const accountInfo = await this.connection.getAccountInfo(publicKey);

      if (accountInfo) {
        logger.debug('Retrieved account info', {
          address,
          lamports: accountInfo.lamports,
          owner: accountInfo.owner.toString()
        });
      } else {
        logger.warn('Account not found', { address });
      }

      return accountInfo;
    } catch (error: any) {
      logger.error('Failed to get account info', {
        address,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get token supply
   */
  async getTokenSupply(mintAddress: string): Promise<TokenAmount> {
    try {
      const publicKey = new PublicKey(mintAddress);
      const supply = await this.connection.getTokenSupply(publicKey);

      logger.debug('Retrieved token supply', {
        mint: mintAddress,
        amount: supply.value.amount,
        decimals: supply.value.decimals
      });

      return supply.value;
    } catch (error: any) {
      logger.error('Failed to get token supply', {
        mint: mintAddress,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get current slot
   */
  async getCurrentSlot(): Promise<number> {
    try {
      const slot = await this.connection.getSlot();
      logger.debug('Retrieved current slot', { slot });
      return slot;
    } catch (error: any) {
      logger.error('Failed to get current slot', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get block time
   */
  async getBlockTime(slot: number): Promise<number | null> {
    try {
      const blockTime = await this.connection.getBlockTime(slot);
      
      if (blockTime) {
        logger.debug('Retrieved block time', {
          slot,
          blockTime,
          date: new Date(blockTime * 1000).toISOString()
        });
      } else {
        logger.warn('Block time not available', { slot });
      }

      return blockTime;
    } catch (error: any) {
      logger.error('Failed to get block time', {
        slot,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if account exists
   */
  async accountExists(address: string): Promise<boolean> {
    try {
      const accountInfo = await this.getAccountInfo(address);
      return accountInfo !== null;
    } catch (error: any) {
      logger.error('Failed to check account existence', {
        address,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get latest blockhash
   */
  async getLatestBlockhash() {
    try {
      const blockhash = await this.connection.getLatestBlockhash();
      
      logger.debug('Retrieved latest blockhash', {
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight
      });

      return blockhash;
    } catch (error: any) {
      logger.error('Failed to get latest blockhash', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get minimum rent exemption amount
   */
  async getMinimumBalanceForRentExemption(dataLength: number): Promise<number> {
    try {
      const minBalance = await this.connection.getMinimumBalanceForRentExemption(dataLength);
      
      logger.debug('Retrieved minimum rent exemption', {
        dataLength,
        minBalance,
        sol: minBalance / 1e9
      });

      return minBalance;
    } catch (error: any) {
      logger.error('Failed to get minimum rent exemption', {
        dataLength,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get multiple accounts
   */
  async getMultipleAccounts(addresses: string[]) {
    try {
      const publicKeys = addresses.map(addr => new PublicKey(addr));
      const accounts = await this.connection.getMultipleAccountsInfo(publicKeys);

      logger.debug('Retrieved multiple accounts', {
        requested: addresses.length,
        found: accounts.filter(a => a !== null).length
      });

      return accounts;
    } catch (error: any) {
      logger.error('Failed to get multiple accounts', {
        count: addresses.length,
        error: error.message
      });
      throw error;
    }
  }
}

export default BlockchainQueryService;
