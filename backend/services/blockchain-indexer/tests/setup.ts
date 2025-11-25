// Mock Solana/web3.js before any imports
jest.mock('@solana/web3.js', () => ({
  Connection: jest.fn().mockImplementation(() => ({
    getSlot: jest.fn().mockResolvedValue(1000),
    getBlock: jest.fn().mockResolvedValue(null),
    getParsedTransaction: jest.fn().mockResolvedValue(null),
    getAccountInfo: jest.fn().mockResolvedValue(null),
    getSignaturesForAddress: jest.fn().mockResolvedValue([]),
    onProgramAccountChange: jest.fn().mockReturnValue(1),
    onAccountChange: jest.fn().mockReturnValue(1),
    removeAccountChangeListener: jest.fn().mockResolvedValue(undefined)
  })),
  PublicKey: jest.fn().mockImplementation((key: string) => ({ 
    toBase58: () => key,
    toString: () => key
  })),
  Keypair: {
    generate: jest.fn()
  },
  SystemProgram: {
    programId: 'SystemProgram111111111111111111111111111111'
  },
  LAMPORTS_PER_SOL: 1000000000
}));

// Mock Metaplex if needed
jest.mock('@metaplex-foundation/js', () => ({
  Metaplex: {
    make: jest.fn().mockReturnValue({
      use: jest.fn().mockReturnThis(),
      nfts: jest.fn().mockReturnValue({
        findByMint: jest.fn().mockResolvedValue(null)
      })
    })
  }
}));

// Global test setup
beforeAll(() => {
  // Suppress console logs during tests
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
});

afterAll(() => {
  jest.restoreAllMocks();
});
