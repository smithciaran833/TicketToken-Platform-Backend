import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
  createAllocTreeIx,
  SPL_ACCOUNT_COMPRESSION_PROGRAM_ID,
} from '@solana/spl-account-compression';
import fs from 'fs';

async function createMerkleTree() {
  console.log('Setting up merkle tree for compressed NFTs...');

  const walletData = JSON.parse(fs.readFileSync('./devnet-wallet.json', 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  console.log('Wallet:', wallet.publicKey.toBase58());
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  const merkleTree = Keypair.generate();

  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.publicKey.toBuffer()],
    SPL_ACCOUNT_COMPRESSION_PROGRAM_ID
  );

  const maxDepth = 14;
  const maxBufferSize = 64;

  const space = 32 + 32 + 8 + 32 + (2 ** maxDepth) * 32;

  const allocTreeIx = SystemProgram.createAccount({
    fromPubkey: wallet.publicKey,
    newAccountPubkey: merkleTree.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(space),
    space,
    programId: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID
  });

  const createTreeIx = createAllocTreeIx(
    merkleTree.publicKey,
    wallet.publicKey,
    { maxDepth, maxBufferSize },
    true
  );

  const tx = new Transaction().add(allocTreeIx).add(createTreeIx);

  try {
    const signature = await connection.sendTransaction(tx, [wallet, merkleTree]);
    await connection.confirmTransaction(signature, 'confirmed');

    console.log('✅ Merkle tree created!');
    console.log('Tree:', merkleTree.publicKey.toBase58());
    console.log('Authority:', treeAuthority.toBase58());

    const config = {
      merkleTree: merkleTree.publicKey.toBase58(),
      treeAuthority: treeAuthority.toBase58(),
      maxDepth,
      maxBufferSize
    };

    fs.writeFileSync('./real-merkle-tree-config.json', JSON.stringify(config, null, 2));
    console.log('Config saved!');

  } catch (error) {
    console.error('Error creating tree:', error);
  }
}

createMerkleTree();
