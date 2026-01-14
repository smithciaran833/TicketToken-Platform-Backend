import { Keypair, Connection } from '@solana/web3.js';
import fs from 'fs';

const walletData = JSON.parse(fs.readFileSync('./devnet-wallet.json', 'utf-8'));
const wallet = Keypair.fromSecretKey(new Uint8Array(walletData));

console.log('Public Key:', wallet.publicKey.toBase58());
console.log('Can sign:', wallet.secretKey.length === 64);

// Check if this matches the expected address
const expectedAddress = 'BTNZP23sGbQsMwX1SBiyfTpDDqD8Sev7j78N45QBoYtv';
console.log('Matches expected:', wallet.publicKey.toBase58() === expectedAddress);

// Try to get account info
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
connection.getAccountInfo(wallet.publicKey).then(info => {
  console.log('Account exists:', !!info);
  if (info) {
    console.log('Lamports:', info.lamports / 1e9, 'SOL');
    console.log('Owner:', info.owner.toBase58());
    console.log('Executable:', info.executable);
  }
});
