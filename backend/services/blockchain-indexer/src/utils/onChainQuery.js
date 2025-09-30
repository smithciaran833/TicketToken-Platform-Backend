const { PublicKey, Connection } = require('@solana/web3.js');
const { Metaplex } = require('@metaplex-foundation/js');
const logger = require('./logger');

class OnChainQuery {
    constructor(connection) {
        this.connection = connection;
        this.metaplex = Metaplex.make(connection);
    }
    
    async getTokenState(tokenId) {
        try {
            const mint = new PublicKey(tokenId);
            
            // First, check if the mint exists
            const mintInfo = await this.connection.getParsedAccountInfo(mint);
            
            if (!mintInfo.value) {
                // Mint doesn't exist
                return {
                    exists: false,
                    burned: true,
                    owner: null,
                    supply: 0
                };
            }
            
            const mintData = mintInfo.value.data.parsed.info;
            
            // Check supply - if 0, token is burned
            if (mintData.supply === '0') {
                return {
                    exists: true,
                    burned: true,
                    owner: null,
                    supply: 0
                };
            }
            
            // Get the token account (who owns it)
            const largestAccounts = await this.connection.getTokenLargestAccounts(mint);
            
            if (!largestAccounts.value || largestAccounts.value.length === 0) {
                // No token accounts - effectively burned
                return {
                    exists: true,
                    burned: true,
                    owner: null,
                    supply: parseInt(mintData.supply)
                };
            }
            
            // Get the owner of the largest account (should be only one for NFTs)
            const tokenAccount = largestAccounts.value[0];
            const accountInfo = await this.connection.getParsedAccountInfo(
                tokenAccount.address
            );
            
            if (!accountInfo.value) {
                return {
                    exists: true,
                    burned: true,
                    owner: null,
                    supply: parseInt(mintData.supply)
                };
            }
            
            const tokenAccountData = accountInfo.value.data.parsed.info;
            
            // Check if token account is closed or has 0 amount
            if (tokenAccountData.state === 'frozen' || 
                tokenAccountData.tokenAmount.uiAmount === 0) {
                return {
                    exists: true,
                    burned: true,
                    owner: tokenAccountData.owner,
                    supply: 0
                };
            }
            
            // Token exists and is owned
            return {
                exists: true,
                burned: false,
                owner: tokenAccountData.owner,
                supply: tokenAccountData.tokenAmount.uiAmount,
                frozen: tokenAccountData.state === 'frozen'
            };
            
        } catch (error) {
            logger.error({ error: error.message, tokenId }, 'Failed to get token state');
            
            // If we get specific errors, we can infer the state
            if (error.message.includes('could not find account')) {
                return {
                    exists: false,
                    burned: true,
                    owner: null,
                    supply: 0
                };
            }
            
            throw error;
        }
    }
    
    async getNFTMetadata(tokenId) {
        try {
            const mint = new PublicKey(tokenId);
            const nft = await this.metaplex.nfts().findByMint({ mintAddress: mint });
            
            return {
                name: nft.name,
                symbol: nft.symbol,
                uri: nft.uri,
                sellerFeeBasisPoints: nft.sellerFeeBasisPoints,
                creators: nft.creators,
                collection: nft.collection,
                uses: nft.uses
            };
        } catch (error) {
            logger.error({ error: error.message, tokenId }, 'Failed to get NFT metadata');
            return null;
        }
    }
    
    async getTransactionHistory(tokenId, limit = 10) {
        try {
            const mint = new PublicKey(tokenId);
            
            // Get signatures for this mint
            const signatures = await this.connection.getSignaturesForAddress(
                mint,
                { limit },
                'confirmed'
            );
            
            const history = [];
            
            for (const sigInfo of signatures) {
                const tx = await this.connection.getParsedTransaction(
                    sigInfo.signature,
                    { commitment: 'confirmed' }
                );
                
                if (!tx) continue;
                
                // Parse the transaction type
                const type = this.parseTransactionType(tx);
                
                history.push({
                    signature: sigInfo.signature,
                    slot: sigInfo.slot,
                    blockTime: sigInfo.blockTime,
                    type,
                    success: !sigInfo.err
                });
            }
            
            return history;
            
        } catch (error) {
            logger.error({ error: error.message, tokenId }, 'Failed to get transaction history');
            return [];
        }
    }
    
    parseTransactionType(tx) {
        const logs = tx.meta?.logMessages || [];
        
        for (const log of logs) {
            if (log.includes('MintTo')) return 'MINT';
            if (log.includes('Transfer')) return 'TRANSFER';
            if (log.includes('Burn')) return 'BURN';
            if (log.includes('Approve')) return 'APPROVE';
            if (log.includes('Revoke')) return 'REVOKE';
            if (log.includes('Freeze')) return 'FREEZE';
            if (log.includes('Thaw')) return 'THAW';
        }
        
        return 'UNKNOWN';
    }
    
    async verifyOwnership(tokenId, expectedOwner) {
        const state = await this.getTokenState(tokenId);
        
        if (state.burned) {
            return {
                valid: false,
                reason: 'TOKEN_BURNED',
                actualOwner: null
            };
        }
        
        if (!state.exists) {
            return {
                valid: false,
                reason: 'TOKEN_NOT_FOUND',
                actualOwner: null
            };
        }
        
        if (state.owner !== expectedOwner) {
            return {
                valid: false,
                reason: 'OWNERSHIP_MISMATCH',
                actualOwner: state.owner
            };
        }
        
        return {
            valid: true,
            reason: null,
            actualOwner: state.owner
        };
    }
}

module.exports = OnChainQuery;
