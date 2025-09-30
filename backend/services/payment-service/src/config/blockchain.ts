export const blockchainConfig = {
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    commitment: 'confirmed' as const,
    programId: process.env.SOLANA_PROGRAM_ID || '',
    priorityFees: {
      low: 1000,
      medium: 10000,
      high: 100000
    }
  },
  
  polygon: {
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://rpc-mumbai.maticvigil.com',
    chainId: 80001, // Mumbai testnet
    contractAddress: process.env.POLYGON_CONTRACT || '',
    gasLimits: {
      mint: 150000,
      transfer: 65000
    }
  },
  
  batchSizes: {
    solana: 50,
    polygon: 100
  },
  
  retryConfig: {
    maxAttempts: 3,
    baseDelay: 5000,
    maxDelay: 60000
  }
};
