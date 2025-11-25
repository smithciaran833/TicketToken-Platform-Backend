import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  createSignerFromKeypair,
  generateSigner,
  signerIdentity
} from '@metaplex-foundation/umi';
import {
  createTree,
  mplBubblegum
} from '@metaplex-foundation/mpl-bubblegum';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function createMerkleTree() {
  console.log('🌳 Creating Merkle Tree for Compressed NFTs (Umi)\n');

  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const umi = createUmi(rpcUrl).use(mplBubblegum());

  // Load wallet
  const walletPath = process.env.WALLET_PATH || './devnet-wallet.json';
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet not found at ${walletPath}`);
  }

  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const walletKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(walletData));
  const walletSigner = createSignerFromKeypair(umi, walletKeypair);

  umi.use(signerIdentity(walletSigner));

  console.log(`📍 RPC: ${rpcUrl}`);
  console.log(`👛 Wallet: ${walletSigner.publicKey}`);

  // Check balance
  const balance = await umi.rpc.getBalance(walletSigner.publicKey);
  const balanceSOL = Number(balance.basisPoints) / 1e9;
  console.log(`💰 Balance: ${balanceSOL} SOL\n`);

  if (balanceSOL < 0.5) {
    throw new Error('Need at least 0.5 SOL to create merkle tree. Get devnet SOL from https://faucet.solana.com');
  }

  // Generate tree signer
  const merkleTree = generateSigner(umi);

  console.log('🪙 Creating merkle tree...');

  // maxDepth=14, maxBufferSize=64 = 16,384 NFTs capacity
  const maxDepth = 14;
  const maxBufferSize = 64;

  try {
    const builder = await createTree(umi, {
      merkleTree,
      maxDepth,
      maxBufferSize,
      public: false
    });

    await builder.sendAndConfirm(umi);

    console.log('✅ Merkle tree created!\n');

    // Save config
    const config = {
      merkleTree: merkleTree.publicKey.toString(),
      maxDepth,
      maxBufferSize,
      capacity: Math.pow(2, maxDepth),
      createdAt: new Date().toISOString()
    };

    const configPath = path.join(__dirname, '../real-merkle-tree-config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log('📄 Configuration saved to real-merkle-tree-config.json\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Merkle Tree Details:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Merkle Tree:    ${config.merkleTree}`);
    console.log(`Max Depth:      ${config.maxDepth}`);
    console.log(`Max Buffer:     ${config.maxBufferSize}`);
    console.log(`Capacity:       ${config.capacity} NFTs`);
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🔗 View on Solana Explorer:');
    console.log(`   https://explorer.solana.com/address/${config.merkleTree}?cluster=devnet\n`);

  } catch (error: any) {
    console.error('❌ Failed to create merkle tree:', error.message);
    if (error.logs) {
      console.error('Logs:', error.logs);
    }
    throw error;
  }
}

createMerkleTree()
  .then(() => {
    console.log('✅ Merkle tree creation complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
