const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { 
  MetadataProgram,
  TokenProgramVersion,
  TokenStandard
} = require('@metaplex-foundation/mpl-token-metadata');
const {
  PROGRAM_ID as BUBBLEGUM_PROGRAM_ID,
  createCreateTreeInstruction,
  createMintV1Instruction,
  createTransferInstruction
} = require('@metaplex-foundation/mpl-bubblegum');
const {
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
  SPL_NOOP_PROGRAM_ID,
  getConcurrentMerkleTreeAccountSize
} = require('@solana/spl-account-compression');
const logger = require('../utils/logger');
const fs = require('fs');

class CompressedNFTService {
  constructor() {
    this.connection = null;
    this.wallet = null;
    this.merkleTree = null;
    this.treeAuthority = null;
  }

  async initialize() {
    // Connect to devnet
    this.connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    
    // Load wallet
    const walletPath = './devnet-wallet.json';
    if (fs.existsSync(walletPath)) {
      const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
      this.wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
      logger.info(`Wallet loaded: ${this.wallet.publicKey.toString()}`);
      
      // Check balance
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      logger.info(`Wallet balance: ${balance / 1e9} SOL`);
      
      if (balance < 0.1 * 1e9) {
        logger.warn('Low balance! Request more devnet SOL');
      }
    } else {
      throw new Error('Wallet not found. Run get-devnet-sol.js first');
    }
    
    // Get or create merkle tree
    await this.getOrCreateMerkleTree();
  }

  async getOrCreateMerkleTree() {
    // For compressed NFTs, we need a merkle tree
    // Check if we have one saved
    const treeConfigPath = './merkle-tree-config.json';
    
    if (fs.existsSync(treeConfigPath)) {
      const config = JSON.parse(fs.readFileSync(treeConfigPath, 'utf-8'));
      this.merkleTree = new PublicKey(config.merkleTree);
      this.treeAuthority = new PublicKey(config.treeAuthority);
      logger.info(`Using existing merkle tree: ${this.merkleTree.toString()}`);
    } else {
      // Create new merkle tree
      await this.createMerkleTree();
    }
  }

  async createMerkleTree() {
    logger.info('Creating new merkle tree for compressed NFTs...');
    
    const maxDepth = 14; // Can store 16,384 NFTs
    const maxBufferSize = 64;
    
    // Calculate space needed
    const space = getConcurrentMerkleTreeAccountSize(maxDepth, maxBufferSize);
    
    // Generate tree keypair
    const merkleTree = Keypair.generate();
    
    // Derive tree authority PDA
    const [treeAuthority] = PublicKey.findProgramAddressSync(
      [merkleTree.publicKey.toBuffer()],
      new PublicKey(BUBBLEGUM_PROGRAM_ID)
    );
    
    // Create tree instruction
    const createTreeIx = createCreateTreeInstruction(
      {
        merkleTree: merkleTree.publicKey,
        treeAuthority,
        treeCreator: this.wallet.publicKey,
        payer: this.wallet.publicKey,
        logWrapper: SPL_NOOP_PROGRAM_ID,
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
      },
      {
        maxDepth,
        maxBufferSize,
        public: false,
      }
    );
    
    const tx = new Transaction().add(createTreeIx);
    
    try {
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.wallet, merkleTree],
        { commitment: 'confirmed' }
      );
      
      logger.info(`✅ Merkle tree created: ${merkleTree.publicKey.toString()}`);
      logger.info(`   Transaction: ${signature}`);
      
      // Save config
      const config = {
        merkleTree: merkleTree.publicKey.toString(),
        treeAuthority: treeAuthority.toString(),
        maxDepth,
        maxBufferSize,
        createdAt: new Date().toISOString()
      };
      
      fs.writeFileSync('./merkle-tree-config.json', JSON.stringify(config, null, 2));
      
      this.merkleTree = merkleTree.publicKey;
      this.treeAuthority = treeAuthority;
      
    } catch (error) {
      logger.error('Failed to create merkle tree:', error);
      throw error;
    }
  }

  async mintCompressedNFT(ticketData) {
    if (!this.merkleTree) {
      throw new Error('Merkle tree not initialized');
    }
    
    const { ticketId, metadata } = ticketData;
    
    logger.info(`Minting compressed NFT for ticket ${ticketId}`);
    
    // Create mint instruction
    const mintIx = createMintV1Instruction(
      {
        merkleTree: this.merkleTree,
        treeAuthority: this.treeAuthority,
        treeDelegate: this.wallet.publicKey,
        payer: this.wallet.publicKey,
        leafDelegate: this.wallet.publicKey,
        leafOwner: this.wallet.publicKey, // In production, this would be the buyer's wallet
        compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
        logWrapper: SPL_NOOP_PROGRAM_ID,
      },
      {
        message: {
          name: metadata.name,
          symbol: metadata.symbol,
          uri: metadata.uri,
          sellerFeeBasisPoints: 500, // 5% royalty
          primarySaleHappened: false,
          isMutable: true,
          editionNonce: null,
          tokenStandard: TokenStandard.NonFungible,
          collection: null,
          uses: null,
          tokenProgramVersion: TokenProgramVersion.Original,
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
    
    try {
      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [this.wallet],
        { commitment: 'confirmed' }
      );
      
      logger.info(`✅ Compressed NFT minted: ${signature}`);
      
      return {
        success: true,
        signature,
        merkleTree: this.merkleTree.toString(),
        ticketId
      };
      
    } catch (error) {
      logger.error(`Failed to mint compressed NFT:`, error);
      throw error;
    }
  }
}

module.exports = { CompressedNFTService };
