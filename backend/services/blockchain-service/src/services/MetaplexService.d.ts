import { Connection, Keypair, PublicKey } from '@solana/web3.js';
interface NFTMetadata {
    name: string;
    symbol: string;
    description: string;
    image: string;
    attributes?: Array<{
        trait_type: string;
        value: string;
    }>;
    properties?: {
        files?: Array<{
            uri: string;
            type: string;
        }>;
        category?: string;
    };
}
interface Creator {
    address: string;
    share: number;
}
interface MintNFTParams {
    metadata: NFTMetadata;
    creators: Creator[];
    sellerFeeBasisPoints: number;
    collection?: PublicKey;
}
interface MintNFTResult {
    mintAddress: string;
    transactionSignature: string;
    metadataUri: string;
}
export declare class MetaplexService {
    private connection;
    private metaplex;
    private authority;
    constructor(connection: Connection, authority: Keypair);
    uploadMetadata(metadata: NFTMetadata): Promise<string>;
    mintNFT(params: MintNFTParams): Promise<MintNFTResult>;
    createCollection(params: {
        name: string;
        symbol: string;
        description: string;
        image: string;
    }): Promise<PublicKey>;
    verifyCollectionItem(nftMint: PublicKey, collectionMint: PublicKey): Promise<string>;
    findNFTByMint(mintAddress: PublicKey): Promise<import("@metaplex-foundation/js").Nft | import("@metaplex-foundation/js").Sft | import("@metaplex-foundation/js").SftWithToken | import("@metaplex-foundation/js").NftWithToken>;
    getNFTMetadata(mintAddress: PublicKey): Promise<{
        name: string;
        symbol: string;
        uri: string;
        sellerFeeBasisPoints: number;
        creators: import("@metaplex-foundation/js").Creator[];
        collection: import("@metaplex-foundation/js").Option<{
            address: PublicKey;
            verified: boolean;
        }>;
        address: string;
    }>;
}
export default MetaplexService;
//# sourceMappingURL=MetaplexService.d.ts.map