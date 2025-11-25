/**
 * Script to create a Collection NFT for compressed NFTs using Metaplex Umi
 * 
 * This script should be run once to create the collection that all ticket NFTs will belong to.
 * The collection NFT is required for Metaplex Bubblegum compressed NFTs.
 * 
 * Usage:
 *   npx ts-node scripts/create-collection.ts
 * 
 * Requirements:
 *   - Wallet file at WALLET_PATH with sufficient SOL (~0.1 SOL)
 *   - Solana RPC connection configured in .env
 *   - Pinata IPFS credentials configured in .env
 */

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { 
  createV1, 
  TokenStandard,
  mplTokenMetadata 
} from '@metaplex-foundation/mpl-token-metadata';
import { 
  createSignerFromKeypair, 
  generateSigner, 
  percentAmount, 
  signerIdentity,
  publicKey as umiPublicKey
} from '@metaplex-foundation/umi';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { getIPFSService } from '../src/config/ipfs';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

interface CollectionConfig {
  collectionMint: string;
  metadataUri: string;
  createdAt: string;
}

async function createCollection() {
  console.log('🎨 Creating Collection NFT for TicketToken Platform (Umi)\n');

  // 1. Setup Umi instance
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const umi = createUmi(rpcUrl).use(mplTokenMetadata());

  console.log(`📍 RPC: ${rpcUrl}`);

  // 2. Load wallet
  const walletPath = process.env.WALLET_PATH || './devnet-wallet.json';
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet not found at ${walletPath}`);
  }

  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const walletKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(walletData));
  const walletSigner = createSignerFromKeypair(umi, walletKeypair);
  
  umi.use(signerIdentity(walletSigner));

  console.log(`👛 Wallet: ${walletSigner.publicKey}`);

  // Check balance
  const balance = await umi.rpc.getBalance(walletSigner.publicKey);
  const balanceSOL = Number(balance.basisPoints) / 1e9;
  console.log(`💰 Balance: ${balanceSOL} SOL\n`);

  if (balanceSOL < 0.05) {
    throw new Error('Insufficient balance. Need at least 0.05 SOL. Get devnet SOL from https://faucet.solana.com');
  }

  // 3. Upload collection metadata to IPFS
  console.log('📤 Uploading collection metadata to IPFS...');
  
  const collectionMetadata = {
    name: 'TicketToken Collection',
    symbol: 'TCKT',
    description: 'Official collection for TicketToken event tickets on Solana',
    image: 'https://arweave.net/tickettoken-collection-image', // Replace with actual image
    attributes: [
      { trait_type: 'Type', value: 'Collection' },
      { trait_type: 'Platform', value: 'TicketToken' }
    ],
    properties: {
      category: 'image',
      files: []
    }
  };

  const ipfsService = getIPFSService();
  const ipfsResult = await ipfsService.uploadJSON(collectionMetadata);
  const metadataUri = ipfsResult.ipfsUrl;

  console.log(`✅ Metadata uploaded: ${metadataUri}`);
  console.log(`   Gateway URL: ${ipfsResult.pinataUrl}\n`);

  // 4. Create collection NFT using Umi
  console.log('🪙 Creating collection NFT...');
  
  const collectionMint = generateSigner(umi);

  try {
    await createV1(umi, {
      mint: collectionMint,
      name: collectionMetadata.name,
      symbol: collectionMetadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5), // 5% royalty
      tokenStandard: TokenStandard.NonFungible,
      isCollection: true,
      creators: [
        {
          address: walletSigner.publicKey,
          verified: true,
          share: 100
        }
      ]
    }).sendAndConfirm(umi);

    console.log(`✅ Collection created!\n`);

    // 5. Save configuration
    const config: CollectionConfig = {
      collectionMint: collectionMint.publicKey,
      metadataUri,
      createdAt: new Date().toISOString()
    };

    const configPath = path.join(__dirname, '../collection-config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('📄 Configuration saved to collection-config.json\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Collection Details:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Collection Mint:     ${config.collectionMint}`);
    console.log(`Metadata URI:        ${config.metadataUri}`);
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/address/${config.collectionMint}?cluster=devnet\n`);
    console.log('✅ Next steps:');
    console.log('   1. Update .env file: COLLECTION_MINT=' + config.collectionMint);
    console.log('   2. Ensure merkle tree exists: check real-merkle-tree-config.json');
    console.log('   3. Start the minting service\n');

  } catch (error: any) {
    console.error('❌ Error creating collection:', error.message);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    throw error;
  }
}

// Run the script
createCollection()
  .then(() => {
    console.log('✅ Collection creation complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error creating collection:', error);
    process.exit(1);
  });
