import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  createSignerFromKeypair,
  publicKey as umiPublicKey,
  signerIdentity
} from '@metaplex-foundation/umi';
import {
  mintToCollectionV1,
  mplBubblegum
} from '@metaplex-foundation/mpl-bubblegum';
import fs from 'fs';
import logger from '../utils/logger';

interface TicketData {
  ticketId: string;
  ownerAddress?: string;
  metadata: {
    name?: string;
    uri?: string;
  };
}

interface MintResult {
  success: boolean;
  signature: string;
  merkleTree: string;
  ticketId: string;
  leafIndex?: number;
}

interface MerkleTreeConfig {
  merkleTree: string;
  treeAuthority: string;
  maxDepth: number;
  maxBufferSize: number;
}

interface CollectionConfig {
  collectionMint: string;
  metadataUri: string;
}

export class RealCompressedNFT {
  private umi: any = null;
  private merkleTreeConfig: MerkleTreeConfig | null = null;
  private collectionConfig: CollectionConfig | null = null;
  private walletPublicKey: string | null = null;

  async initialize(): Promise<void> {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

    // Create Umi instance with Bubblegum plugin
    this.umi = createUmi(rpcUrl).use(mplBubblegum());

    // Load wallet
    const walletPath = process.env.WALLET_PATH || './devnet-wallet.json';
    if (!fs.existsSync(walletPath)) {
      throw new Error(`Wallet not found at ${walletPath}`);
    }

    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
    const walletKeypair = this.umi.eddsa.createKeypairFromSecretKey(new Uint8Array(walletData));
    const walletSigner = createSignerFromKeypair(this.umi, walletKeypair);

    this.umi.use(signerIdentity(walletSigner));
    this.walletPublicKey = walletSigner.publicKey.toString();

    // Load merkle tree config
    const treeConfigPath = './real-merkle-tree-config.json';
    if (!fs.existsSync(treeConfigPath)) {
      throw new Error(`Merkle tree config not found at ${treeConfigPath}`);
    }
    this.merkleTreeConfig = JSON.parse(fs.readFileSync(treeConfigPath, 'utf-8'));

    // Load collection config
    const collectionConfigPath = './collection-config.json';
    if (!fs.existsSync(collectionConfigPath)) {
      throw new Error(`Collection config not found at ${collectionConfigPath}`);
    }
    this.collectionConfig = JSON.parse(fs.readFileSync(collectionConfigPath, 'utf-8'));

    logger.info('Real Compressed NFT service initialized (Umi)');
    logger.info(`Merkle Tree: ${this.merkleTreeConfig!.merkleTree}`);
    logger.info(`Collection: ${this.collectionConfig!.collectionMint}`);
  }

  async mintNFT(ticketData: TicketData): Promise<MintResult> {
    if (!this.umi || !this.merkleTreeConfig || !this.collectionConfig || !this.walletPublicKey) {
      throw new Error('RealCompressedNFT not initialized. Call initialize() first.');
    }

    const { ticketId, ownerAddress, metadata } = ticketData;

    logger.info(`Minting compressed NFT for ticket ${ticketId}`);

    // Determine the leaf owner (buyer's wallet or default to minting wallet)
    const leafOwner = ownerAddress
      ? umiPublicKey(ownerAddress)
      : umiPublicKey(this.walletPublicKey);

    try {
      const result = await mintToCollectionV1(this.umi, {
        merkleTree: umiPublicKey(this.merkleTreeConfig.merkleTree),
        leafOwner: leafOwner,
        leafDelegate: leafOwner,
        collectionMint: umiPublicKey(this.collectionConfig.collectionMint),
        metadata: {
          name: metadata.name || `Ticket #${ticketId}`,
          symbol: 'TCKT',
          uri: metadata.uri || `https://api.tickettoken.io/metadata/${ticketId}`,
          sellerFeeBasisPoints: 500, // 5% royalty
          collection: {
            key: umiPublicKey(this.collectionConfig.collectionMint),
            verified: false
          },
          creators: [
            {
              address: umiPublicKey(this.walletPublicKey),
              verified: false,
              share: 100
            }
          ]
        }
      }).sendAndConfirm(this.umi);

      const signature = Buffer.from(result.signature).toString('base64');

      logger.info(`Compressed NFT minted! Signature: ${signature}`);
      logger.info(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

      return {
        success: true,
        signature,
        merkleTree: this.merkleTreeConfig.merkleTree,
        ticketId
      };
    } catch (error: any) {
      logger.error(`Failed to mint compressed NFT for ticket ${ticketId}`, {
        error: error.message,
        logs: error.logs
      });
      throw error;
    }
  }

  getMerkleTreeAddress(): string | null {
    return this.merkleTreeConfig?.merkleTree || null;
  }

  getCollectionAddress(): string | null {
    return this.collectionConfig?.collectionMint || null;
  }
}
