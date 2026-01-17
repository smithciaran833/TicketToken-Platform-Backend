/**
 * Mock for @metaplex-foundation/js
 * Used in unit tests to avoid actual Metaplex dependencies
 */

export class Metaplex {
  private plugins: any[] = [];

  static make(connection: any): Metaplex {
    return new Metaplex();
  }

  use(plugin: any): Metaplex {
    this.plugins.push(plugin);
    return this;
  }

  getPlugins(): any[] {
    return this.plugins;
  }
}

export function keypairIdentity(keypair: any): any {
  return {
    name: 'keypairIdentity',
    keypair
  };
}

export const mockMetaplex = {
  use: jest.fn().mockReturnThis()
};
