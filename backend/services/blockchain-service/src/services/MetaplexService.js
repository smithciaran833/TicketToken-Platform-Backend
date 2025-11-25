"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaplexService = void 0;
const web3_js_1 = require("@solana/web3.js");
const js_1 = require("@metaplex-foundation/js");
const logger_1 = require("../utils/logger");
const retry_1 = require("../utils/retry");
const blockchain_metrics_1 = require("../utils/blockchain-metrics");
class MetaplexService {
    connection;
    metaplex;
    authority;
    constructor(connection, authority) {
        this.connection = connection;
        this.authority = authority;
        const bundlrAddress = process.env.BUNDLR_ADDRESS || 'https://devnet.bundlr.network';
        const bundlrProviderUrl = process.env.BUNDLR_PROVIDER_URL || process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
        const bundlrTimeout = parseInt(process.env.BUNDLR_TIMEOUT || '60000', 10);
        this.metaplex = js_1.Metaplex.make(connection)
            .use((0, js_1.keypairIdentity)(authority))
            .use((0, js_1.bundlrStorage)({
            address: bundlrAddress,
            providerUrl: bundlrProviderUrl,
            timeout: bundlrTimeout,
        }));
        logger_1.logger.info('MetaplexService initialized', {
            authority: authority.publicKey.toString(),
            bundlrAddress,
            bundlrProviderUrl
        });
    }
    async uploadMetadata(metadata) {
        const startTime = Date.now();
        try {
            logger_1.logger.info('Uploading metadata to Arweave', {
                name: metadata.name
            });
            const uri = await (0, retry_1.retryOperation)(async () => {
                const { uri } = await this.metaplex.nfts().uploadMetadata(metadata);
                return uri;
            }, 'Metadata upload', { maxAttempts: 3 });
            const duration = Date.now() - startTime;
            blockchain_metrics_1.blockchainMetrics.recordMetadataUpload('success', duration);
            logger_1.logger.info('Metadata uploaded successfully', {
                uri,
                name: metadata.name,
                durationMs: duration
            });
            return uri;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            blockchain_metrics_1.blockchainMetrics.recordMetadataUpload('failure');
            logger_1.logger.error('Failed to upload metadata', {
                error: error.message,
                stack: error.stack,
                durationMs: duration
            });
            throw error;
        }
    }
    async mintNFT(params) {
        const startTime = Date.now();
        try {
            logger_1.logger.info('Starting NFT mint', {
                name: params.metadata.name,
                creators: params.creators.length,
                hasCollection: !!params.collection
            });
            const metadataUri = await this.uploadMetadata(params.metadata);
            const creators = params.creators.map(creator => ({
                address: new web3_js_1.PublicKey(creator.address),
                share: creator.share
            }));
            const result = await (0, retry_1.retryOperation)(async () => {
                const { nft, response } = await this.metaplex.nfts().create({
                    uri: metadataUri,
                    name: params.metadata.name,
                    symbol: params.metadata.symbol,
                    sellerFeeBasisPoints: params.sellerFeeBasisPoints,
                    creators,
                    collection: params.collection,
                    isMutable: true,
                });
                return {
                    mintAddress: nft.address.toString(),
                    transactionSignature: response.signature,
                    metadataUri
                };
            }, 'NFT mint', { maxAttempts: 3 });
            const duration = Date.now() - startTime;
            blockchain_metrics_1.blockchainMetrics.recordMintSuccess(duration);
            logger_1.logger.info('NFT minted successfully', {
                mintAddress: result.mintAddress,
                signature: result.transactionSignature,
                name: params.metadata.name,
                durationMs: duration
            });
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            blockchain_metrics_1.blockchainMetrics.recordMintFailure(error.message);
            logger_1.logger.error('Failed to mint NFT', {
                error: error.message,
                stack: error.stack,
                name: params.metadata.name,
                durationMs: duration
            });
            throw error;
        }
    }
    async createCollection(params) {
        try {
            logger_1.logger.info('Creating collection', {
                name: params.name
            });
            const metadataUri = await this.uploadMetadata({
                name: params.name,
                symbol: params.symbol,
                description: params.description,
                image: params.image
            });
            const address = await (0, retry_1.retryOperation)(async () => {
                const { nft } = await this.metaplex.nfts().create({
                    uri: metadataUri,
                    name: params.name,
                    symbol: params.symbol,
                    sellerFeeBasisPoints: 0,
                    isCollection: true,
                });
                return nft.address;
            }, 'Collection creation', { maxAttempts: 3 });
            blockchain_metrics_1.blockchainMetrics.recordCollectionCreation();
            logger_1.logger.info('Collection created', {
                address: address.toString(),
                name: params.name
            });
            return address;
        }
        catch (error) {
            logger_1.logger.error('Failed to create collection', {
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }
    async verifyCollectionItem(nftMint, collectionMint) {
        try {
            const signature = await (0, retry_1.retryOperation)(async () => {
                const { response } = await this.metaplex.nfts().verifyCollection({
                    mintAddress: nftMint,
                    collectionMintAddress: collectionMint,
                });
                return response.signature;
            }, 'Collection verification', { maxAttempts: 2 });
            blockchain_metrics_1.blockchainMetrics.recordCollectionVerification('success');
            logger_1.logger.info('Collection verified', {
                nft: nftMint.toString(),
                collection: collectionMint.toString(),
                signature
            });
            return signature;
        }
        catch (error) {
            blockchain_metrics_1.blockchainMetrics.recordCollectionVerification('failure');
            logger_1.logger.error('Failed to verify collection', {
                error: error.message,
                nft: nftMint.toString(),
                collection: collectionMint.toString()
            });
            throw error;
        }
    }
    async findNFTByMint(mintAddress) {
        try {
            const nft = await this.metaplex.nfts().findByMint({
                mintAddress
            });
            return nft;
        }
        catch (error) {
            logger_1.logger.error('Failed to find NFT', {
                error: error.message,
                mintAddress: mintAddress.toString()
            });
            throw error;
        }
    }
    async getNFTMetadata(mintAddress) {
        try {
            const nft = await this.findNFTByMint(mintAddress);
            return {
                name: nft.name,
                symbol: nft.symbol,
                uri: nft.uri,
                sellerFeeBasisPoints: nft.sellerFeeBasisPoints,
                creators: nft.creators,
                collection: nft.collection,
                address: nft.address.toString()
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get NFT metadata', {
                error: error.message,
                mintAddress: mintAddress.toString()
            });
            throw error;
        }
    }
}
exports.MetaplexService = MetaplexService;
exports.default = MetaplexService;
//# sourceMappingURL=MetaplexService.js.map