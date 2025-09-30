const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { createCreateTreeInstruction, SPL_ACCOUNT_COMPRESSION_PROGRAM_ID } = require('@solana/spl-account-compression');
const { SPL_NOOP_PROGRAM_ID } = require('@solana/spl-account-compression');
const fs = require('fs');

async function createMerkleTree() {
  // Load wallet
  const walletData = JSON.parse(fs.readFileSync('./marketplace-keypair.json', 'utf-8'));
  const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
  
  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  // Generate new merkle tree account
  const merkleTree = Keypair.generate();
  
  console.log('Creating Merkle Tree...');
  console.log('Tree address:', merkleTree.publicKey.toBase58());
  
  // Derive tree authority PDA
  const [treeAuthority] = PublicKey.findProgramAddressSync(
    [merkleTree.publicKey.toBuffer()],
    SPL_ACCOUNT_COMPRESSION_PROGRAM_ID
  );
  
  // Create tree with depth 14, buffer size 64 (can hold 16,384 NFTs)
  const maxDepth = 14;
  const maxBufferSize = 64;
  
  const allocTreeIx = await createCreateTreeInstruction({
    merkleTree: merkleTree.publicKey,
    treeAuthority,
    payer: wallet.publicKey,
    maxDepth,
    maxBufferSize,
  });
  
  const tx = new Transaction().add(allocTreeIx);
  
  // Send transaction
  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [wallet, merkleTree],
    { commitment: 'confirmed' }
  );
  
  console.log('✅ Merkle tree created!');
  console.log('Signature:', signature);
  
  // Save config
  const config = {
    merkleTree: merkleTree.publicKey.toBase58(),
    treeAuthority: treeAuthority.toBase58(),
    maxDepth,
    maxBufferSize,
    compressionProgram: SPL_ACCOUNT_COMPRESSION_PROGRAM_ID.toBase58(),
    logWrapper: SPL_NOOP_PROGRAM_ID.toBase58()
  };
  
  fs.writeFileSync(
    '../backend/services/minting-service/real-merkle-tree-config.json',
    JSON.stringify(config, null, 2)
  );
  
  console.log('Config saved to minting service!');
  return config;
}

createMerkleTree().catch(console.error);
