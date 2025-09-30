const { Connection, Keypair, PublicKey, Transaction } = require('@solana/web3.js');
const {
  createMintToCollectionV1Instruction,
  PROGRAM_ID: BUBBLEGUM_PROGRAM_ID
} = require('@metaplex-foundation/mpl-bubblegum');
const {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID
} = require('@solana/spl-account-compression');
const fs = require('fs');
const logger = require('../utils/logger');

class RealCompressedNFT {
  constructor() {
    this.connection = null;
    this.wallet = null;
    this.merkleTree = null;
    this.treeAuthority = null;
  }

  async initialize() {
    this.connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load wallet
    const walletData = JSON.parse(fs.readFileSync('./devnet-wallet.json', 'utf-8'));
    this.wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
    
    // Load merkle tree config
    const treeConfig = JSON.parse(fs.readFileSync('./real-merkle-tree-config.json', 'utf-8'));
    this.merkleTree = new PublicKey(treeConfig.merkleTree);
    this.treeAuthority = new PublicKey(treeConfig.treeAuthority);
    
    logger.info('✅ Real Compressed NFT service initialized');
    logger.info(`   Merkle Tree: ${this.merkleTree.toString()}`);
  }

  async mintNFT(ticketData) {
    const { ticketId, metadata } = ticketData;
    
    logger.info(`🎫 Minting REAL compressed NFT for ticket ${ticketId}`);
    
    // Create mint instruction
    const mintIx = createMintToCollectionV1Instruction(
      {
        merkleTree: this.merkleTree,
        treeAuthority: this.treeAuthority,
        treeDelegate: this.wallet.publicKey,
        payer: this.wallet.publicKey,
        leafOwner: this.wallet.publicKey, // In production, this would be the buyer
        leafDelegate: this.wallet.publicKey,
        collectionAuthority: this.wallet.publicKey,
        collectionAuthorityRecordPda: new PublicKey(BUBBLEGUM_PROGRAM_ID),
        collectionMint: this.wallet.publicKey, // Would be your collection NFT
        collectionMetadata: this.wallet.publicKey,
        editionAccount: this.wallet.publicKey,
        bubblegumSigner: this.wallet.publicKey,
        logWrapper: new PublicKey(SPL_NOOP_PROGRAM_ID),
        compressionProgram: new PublicKey(SPL_ACCOUNT_COMPRESSION_PROGRAM_ID),
        tokenMetadataProgram: new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'),
      },
      {
        metadataArgs: {
          name: metadata.name || `Ticket #${ticketId}`,
          symbol: 'TCKT',
          uri: metadata.uri || `https://api.tickettoken.io/metadata/${ticketId}`,
          sellerFeeBasisPoints: 500, // 5% royalty
          primarySaleHappened: false,
          isMutable: true,
          editionNonce: null,
          tokenStandard: 'NonFungible',
          tokenProgramVersion: 'Original',
          uses: null,
          collection: null,
          creators: [
            {
              address: this.wallet.publicKey,
              verified: false,
              share: 100,
            }
          ],
        }
      }
    );
    
    const tx = new Transaction().add(mintIx);
    
    const signature = await this.connection.sendTransaction(tx, [this.wallet], {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    });
    
    await this.connection.confirmTransaction(signature, 'confirmed');
    
    logger.info(`✅ REAL compressed NFT minted! Signature: ${signature}`);
    
    return {
      success: true,
      signature,
      merkleTree: this.merkleTree.toString(),
      ticketId
    };
  }
}

module.exports = { RealCompressedNFT };
