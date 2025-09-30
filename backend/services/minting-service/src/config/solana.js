const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

let connection;
let wallet;
let programId;

async function initializeSolana() {
  try {
    // Connect to Solana
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    connection = new Connection(rpcUrl, 'confirmed');
    
    // Load wallet
    const walletPath = process.env.WALLET_PATH || './devnet-wallet.json';
    if (walletPath && fs.existsSync(walletPath)) {
      const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
      wallet = Keypair.fromSecretKey(new Uint8Array(walletData));
    } else {
      wallet = Keypair.generate();
      logger.warn('⚠️  Using generated wallet. Configure WALLET_PATH for production.');
    }
    
    // YOUR ACTUAL DEPLOYED PROGRAM ID!
    programId = new PublicKey('HjTUywYbQQAb1h84UwAJXjNSFAEcygaLiaHJGhkFGquF');
    
    // Test connection
    const version = await connection.getVersion();
    logger.info('✅ Solana connection initialized');
    logger.info(`   RPC: ${rpcUrl}`);
    logger.info(`   Version: ${version['solana-core']}`);
    logger.info(`   Wallet: ${wallet.publicKey.toString()}`);
    logger.info(`   Program: ${programId.toString()} (DEPLOYED ON DEVNET!)`);
    
    // Verify program exists
    const programInfo = await connection.getAccountInfo(programId);
    if (programInfo) {
      logger.info(`   ✅ Program verified on devnet (${programInfo.data.length} bytes)`);
    } else {
      logger.warn('   ⚠️  Program not found - may need redeployment');
    }
    
    return { connection, wallet, programId };
  } catch (error) {
    logger.error('❌ Failed to initialize Solana:', error);
    throw error;
  }
}

module.exports = {
  initializeSolana,
  getConnection: () => connection,
  getWallet: () => wallet,
  getProgramId: () => programId
};
