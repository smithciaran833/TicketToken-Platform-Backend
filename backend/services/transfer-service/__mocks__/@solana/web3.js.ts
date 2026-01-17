/**
 * Mock for @solana/web3.js
 * Used in unit tests to avoid actual Solana dependencies
 */

export class PublicKey {
  private _key: string;

  constructor(key: string | number[] | Uint8Array | Buffer) {
    this._key = typeof key === 'string' ? key : 'mock-key';
  }

  toString(): string {
    return this._key;
  }

  toBase58(): string {
    return this._key;
  }

  toBuffer(): Buffer {
    return Buffer.from(this._key);
  }

  toBytes(): Uint8Array {
    return new Uint8Array(Buffer.from(this._key));
  }

  equals(other: PublicKey): boolean {
    return this._key === other._key;
  }

  static default = new PublicKey('11111111111111111111111111111111');
}

export class Transaction {
  recentBlockhash?: string;
  feePayer?: PublicKey;
  signatures: any[] = [];
  instructions: any[] = [];

  add(...items: any[]): Transaction {
    this.instructions.push(...items);
    return this;
  }

  serialize(): Buffer {
    return Buffer.from('mock-transaction');
  }
}

export class Connection {
  constructor(public endpoint: string, public config?: any) {}

  async getSlot(): Promise<number> {
    return 1000;
  }

  async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    return {
      blockhash: 'mock-blockhash',
      lastValidBlockHeight: 1000
    };
  }

  async simulateTransaction(transaction: Transaction): Promise<any> {
    return {
      value: {
        err: null,
        logs: [],
        unitsConsumed: 200000
      },
      context: { slot: 1000 }
    };
  }

  async getRecentPrioritizationFees(): Promise<any[]> {
    return [
      { slot: 1000, prioritizationFee: 1000 }
    ];
  }

  async getTokenAccountsByOwner(owner: PublicKey, filter: any): Promise<any> {
    return {
      value: []
    };
  }

  async confirmTransaction(signature: string): Promise<any> {
    return { value: { err: null } };
  }

  async sendTransaction(transaction: Transaction, signers: any[]): Promise<string> {
    return 'mock-signature';
  }
}

export type Commitment = 'processed' | 'confirmed' | 'finalized';

export interface ConnectionConfig {
  commitment?: Commitment;
  confirmTransactionInitialTimeout?: number;
  disableRetryOnRateLimit?: boolean;
}

export const LAMPORTS_PER_SOL = 1000000000;

export class Keypair {
  publicKey: PublicKey = new PublicKey('mock-keypair-public-key');
  secretKey: Uint8Array = new Uint8Array(64);

  static generate(): Keypair {
    return new Keypair();
  }

  static fromSecretKey(secretKey: Uint8Array): Keypair {
    return new Keypair();
  }
}
