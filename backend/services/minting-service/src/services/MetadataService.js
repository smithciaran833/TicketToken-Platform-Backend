const logger = require('../utils/logger');

async function uploadToIPFS(metadata) {
  // Stub for IPFS upload - implement with Pinata, NFT.Storage, or Arweave
  logger.info('📤 Uploading metadata to IPFS (mock)');
  return `ipfs://mock-hash-${Date.now()}`;
}

module.exports = { uploadToIPFS };
