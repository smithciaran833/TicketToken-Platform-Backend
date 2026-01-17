/**
 * Mock for bs58
 * Used in unit tests for base58 encoding/decoding
 */

export default {
  decode: jest.fn((input: string) => {
    // Return a valid 64-byte Uint8Array for Solana keypair
    return new Uint8Array(64);
  }),
  
  encode: jest.fn((input: Uint8Array | Buffer) => {
    return 'mock-base58-encoded-string';
  })
};
