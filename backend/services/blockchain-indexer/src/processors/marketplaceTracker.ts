import { PublicKey, Connection, ConfirmedSignatureInfo } from '@solana/web3.js';
import logger from '../utils/logger';
import db from '../utils/database';

interface Marketplace {
    name: string;
    programId: string;
    version: string;
}

interface MarketplaceActivity {
    type: string | null;
    tokenId: string | null;
    price: number | null;
    seller: string | null;
    buyer: string | null;
}

export default class MarketplaceTracker {
    private connection: Connection;
    private marketplaces: Record<string, Marketplace>;
    private subscriptions: Map<string, number>;
    private pollingInterval?: NodeJS.Timeout;

    constructor(connection: Connection) {
        this.connection = connection;

        this.marketplaces = {
            MAGIC_EDEN: {
                name: 'Magic Eden',
                programId: 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K',
                version: 'v2'
            },
            TENSOR: {
                name: 'Tensor',
                programId: 'TCMPhJdwDryooaGtiocG1u3xcYbRpiJzb283XfCZsDp',
                version: 'v1'
            },
            SOLANART: {
                name: 'Solanart',
                programId: 'CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz',
                version: 'v1'
            }
        };

        this.subscriptions = new Map();
    }

    async startTracking(): Promise<void> {
        logger.info('Starting marketplace tracking...');

        for (const [key, marketplace] of Object.entries(this.marketplaces)) {
            try {
                await this.subscribeToMarketplace(key, marketplace);
            } catch (error) {
                logger.error({
                    error: (error as Error).message,
                    marketplace: marketplace.name
                }, 'Failed to subscribe to marketplace');
            }
        }

        this.startPolling();
    }

    async stopTracking(): Promise<void> {
        logger.info('Stopping marketplace tracking...');

        for (const [key, subscriptionId] of this.subscriptions) {
            try {
                await this.connection.removeAccountChangeListener(subscriptionId);
                logger.info({ marketplace: key }, 'Unsubscribed from marketplace');
            } catch (error) {
                logger.error({ error, marketplace: key }, 'Failed to unsubscribe');
            }
        }

        this.subscriptions.clear();

        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
    }

    async subscribeToMarketplace(key: string, marketplace: Marketplace): Promise<void> {
        const programId = new PublicKey(marketplace.programId);

        const subscriptionId = this.connection.onProgramAccountChange(
            programId,
            async (accountInfo, context) => {
                logger.debug({
                    marketplace: marketplace.name,
                    slot: context.slot
                }, 'Marketplace activity detected');

                await this.processMarketplaceActivity(marketplace, accountInfo, context);
            },
            'confirmed'
        );

        this.subscriptions.set(key, subscriptionId);
        logger.info({ marketplace: marketplace.name }, 'Subscribed to marketplace');
    }

    async processMarketplaceActivity(marketplace: Marketplace, accountInfo: any, context: any): Promise<void> {
        try {
            const signatures = await this.connection.getSignaturesForAddress(
                new PublicKey(marketplace.programId),
                { limit: 1 },
                'confirmed'
            );

            if (signatures.length === 0) return;

            const tx = await this.connection.getParsedTransaction(
                signatures[0].signature,
                { commitment: 'confirmed' }
            );

            if (!tx) return;

            const activity = this.parseMarketplaceTransaction(marketplace, tx);

            if (activity && activity.tokenId && await this.isOurNFT(activity.tokenId)) {
                await this.recordActivity(marketplace, activity, signatures[0]);
                await this.updateTicketStatus(activity);
            }

        } catch (error) {
            logger.error({
                error: (error as Error).message,
                marketplace: marketplace.name
            }, 'Failed to process marketplace activity');
        }
    }

    parseMarketplaceTransaction(marketplace: Marketplace, tx: any): MarketplaceActivity {
        const logs = tx.meta?.logMessages || [];

        switch (marketplace.name) {
            case 'Magic Eden':
                return this.parseMagicEdenTransaction(tx, logs);
            case 'Tensor':
                return this.parseTensorTransaction(tx, logs);
            case 'Solanart':
                return this.parseSolanartTransaction(tx, logs);
            default:
                return { type: null, tokenId: null, price: null, seller: null, buyer: null };
        }
    }

    parseMagicEdenTransaction(tx: any, logs: string[]): MarketplaceActivity {
        const activity: MarketplaceActivity = {
            type: null,
            tokenId: null,
            price: null,
            seller: null,
            buyer: null
        };

        for (const log of logs) {
            if (log.includes('Instruction: ExecuteSale')) {
                activity.type = 'SALE';
            } else if (log.includes('Instruction: List')) {
                activity.type = 'LIST';
            } else if (log.includes('Instruction: CancelListing')) {
                activity.type = 'DELIST';
            } else if (log.includes('Instruction: PlaceBid')) {
                activity.type = 'BID';
            }
        }

        if (tx.meta?.postTokenBalances?.length > 0) {
            activity.tokenId = tx.meta.postTokenBalances[0].mint;
            activity.buyer = tx.meta.postTokenBalances[0].owner;
        }

        if (tx.meta?.preTokenBalances?.length > 0) {
            activity.seller = tx.meta.preTokenBalances[0].owner;
        }

        const innerInstructions = tx.meta?.innerInstructions || [];
        for (const inner of innerInstructions) {
            for (const inst of inner.instructions) {
                if (inst.parsed?.type === 'transfer' && inst.parsed?.info?.lamports) {
                    activity.price = inst.parsed.info.lamports / 1e9;
                    break;
                }
            }
        }

        return activity;
    }

    parseTensorTransaction(tx: any, logs: string[]): MarketplaceActivity {
        const activity: MarketplaceActivity = {
            type: null,
            tokenId: null,
            price: null,
            seller: null,
            buyer: null
        };

        for (const log of logs) {
            if (log.includes('tcomp::buy')) {
                activity.type = 'SALE';
            } else if (log.includes('tcomp::list')) {
                activity.type = 'LIST';
            } else if (log.includes('tcomp::delist')) {
                activity.type = 'DELIST';
            } else if (log.includes('tcomp::bid')) {
                activity.type = 'BID';
            }
        }

        if (tx.meta?.postTokenBalances?.length > 0) {
            activity.tokenId = tx.meta.postTokenBalances[0].mint;
            activity.buyer = tx.meta.postTokenBalances[0].owner;
        }

        if (tx.meta?.preTokenBalances?.length > 0) {
            activity.seller = tx.meta.preTokenBalances[0].owner;
        }

        const innerInstructions = tx.meta?.innerInstructions || [];
        for (const inner of innerInstructions) {
            for (const inst of inner.instructions) {
                if (inst.parsed?.type === 'transfer' && inst.parsed?.info?.lamports) {
                    const lamports = inst.parsed.info.lamports;
                    activity.price = lamports / 1e9;
                    break;
                }
            }
        }

        return activity;
    }

    parseSolanartTransaction(tx: any, logs: string[]): MarketplaceActivity {
        return this.parseMagicEdenTransaction(tx, logs);
    }

    async isOurNFT(tokenId: string): Promise<boolean> {
        if (!tokenId) return false;

        const result = await db.query(
            'SELECT 1 FROM tickets WHERE token_id = $1',
            [tokenId]
        );

        return result.rows.length > 0;
    }

    async recordActivity(marketplace: Marketplace, activity: MarketplaceActivity, sigInfo: ConfirmedSignatureInfo): Promise<void> {
        try {
            const ticketResult = await db.query(
                'SELECT id FROM tickets WHERE token_id = $1',
                [activity.tokenId]
            );

            const ticketId = ticketResult.rows[0]?.id;

            await db.query(`
                INSERT INTO marketplace_activity
                (token_id, ticket_id, marketplace, activity_type, price,
                 seller, buyer, transaction_signature, block_time)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9))
                ON CONFLICT (transaction_signature) DO NOTHING
            `, [
                activity.tokenId,
                ticketId,
                marketplace.name,
                activity.type,
                activity.price,
                activity.seller,
                activity.buyer,
                sigInfo.signature,
                sigInfo.blockTime
            ]);

            logger.info({
                marketplace: marketplace.name,
                type: activity.type,
                tokenId: activity.tokenId,
                price: activity.price
            }, 'Marketplace activity recorded');

        } catch (error) {
            logger.error({ error, activity }, 'Failed to record marketplace activity');
        }
    }

    async updateTicketStatus(activity: MarketplaceActivity): Promise<void> {
        if (activity.type === 'SALE' && activity.buyer) {
            await db.query(`
                UPDATE tickets
                SET
                    wallet_address = $1,
                    marketplace_listed = false,
                    last_sale_price = $2,
                    last_sale_at = NOW(),
                    transfer_count = COALESCE(transfer_count, 0) + 1
                WHERE token_id = $3
            `, [activity.buyer, activity.price, activity.tokenId]);

        } else if (activity.type === 'LIST') {
            await db.query(`
                UPDATE tickets
                SET marketplace_listed = true
                WHERE token_id = $1
            `, [activity.tokenId]);

        } else if (activity.type === 'DELIST') {
            await db.query(`
                UPDATE tickets
                SET marketplace_listed = false
                WHERE token_id = $1
            `, [activity.tokenId]);
        }
    }

    startPolling(): void {
        this.pollingInterval = setInterval(async () => {
            for (const [key, marketplace] of Object.entries(this.marketplaces)) {
                await this.pollMarketplace(marketplace);
            }
        }, 30000);
    }

    async pollMarketplace(marketplace: Marketplace): Promise<void> {
        try {
            const signatures = await this.connection.getSignaturesForAddress(
                new PublicKey(marketplace.programId),
                { limit: 20 },
                'confirmed'
            );

            for (const sigInfo of signatures) {
                const tx = await this.connection.getParsedTransaction(
                    sigInfo.signature,
                    { commitment: 'confirmed' }
                );

                if (tx) {
                    const activity = this.parseMarketplaceTransaction(marketplace, tx);

                    if (activity && activity.tokenId && await this.isOurNFT(activity.tokenId)) {
                        await this.recordActivity(marketplace, activity, sigInfo);
                        await this.updateTicketStatus(activity);
                    }
                }
            }
        } catch (error) {
            logger.error({
                error: (error as Error).message,
                marketplace: marketplace.name
            }, 'Polling failed');
        }
    }
}
