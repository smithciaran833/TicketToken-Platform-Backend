import { Connection } from '@solana/web3.js';
import logger from '../utils/logger';
import db from '../utils/database';
import OnChainQuery from '../utils/onChainQuery';
import { ticketServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';
import { TicketForReconciliation } from '@tickettoken/shared/clients/types';

interface Discrepancy {
    type: string;
    field: string;
    dbValue: any;
    chainValue: any;
}

/**
 * Helper to create request context for service calls
 * Blockchain indexer operates as a system service
 */
function createSystemContext(): RequestContext {
    return {
        tenantId: 'system',
        traceId: `recon-enhanced-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
}

export default class EnhancedReconciliationEngine {
    private connection: Connection;
    private onChainQuery: OnChainQuery;
    private isRunning: boolean;
    private reconciliationInterval: NodeJS.Timeout | null;

    constructor(connection: Connection) {
        this.connection = connection;
        this.onChainQuery = new OnChainQuery(connection);
        this.isRunning = false;
        this.reconciliationInterval = null;
    }

    /**
     * REFACTORED: Now uses ticketServiceClient instead of direct DB updates
     * Checks a ticket against on-chain state and updates sync status via service client
     */
    async checkTicket(ticket: TicketForReconciliation): Promise<Discrepancy[] | null> {
        const ctx = createSystemContext();

        try {
            if (!ticket.tokenId) {
                return null;
            }

            logger.debug({ ticketId: ticket.id, tokenId: ticket.tokenId }, 'Checking ticket');

            const onChainState = await this.onChainQuery.getTokenState(ticket.tokenId);

            const discrepancies: Discrepancy[] = [];

            if (!onChainState.exists) {
                if (ticket.isMinted) {
                    discrepancies.push({
                        type: 'TOKEN_NOT_FOUND',
                        field: 'is_minted',
                        dbValue: true,
                        chainValue: false
                    });
                }

                if (ticket.status !== 'BURNED' && ticket.status !== 'CANCELLED') {
                    discrepancies.push({
                        type: 'TOKEN_BURNED',
                        field: 'status',
                        dbValue: ticket.status,
                        chainValue: 'BURNED'
                    });
                }
            }

            if (onChainState.burned && ticket.status !== 'BURNED') {
                discrepancies.push({
                    type: 'BURN_NOT_RECORDED',
                    field: 'status',
                    dbValue: ticket.status,
                    chainValue: 'BURNED'
                });
            }

            if (onChainState.owner && onChainState.owner !== ticket.walletAddress) {
                discrepancies.push({
                    type: 'OWNERSHIP_MISMATCH',
                    field: 'wallet_address',
                    dbValue: ticket.walletAddress,
                    chainValue: onChainState.owner
                });
            }

            if (discrepancies.length === 0) {
                // Use ticketServiceClient to update sync status
                await ticketServiceClient.updateBlockchainSync(ticket.id, {
                    syncStatus: 'SYNCED',
                    reconciledAt: new Date().toISOString(),
                }, ctx);

                return null;
            }

            return discrepancies;

        } catch (error) {
            logger.error({ error: (error as Error).message, ticketId: ticket.id }, 'Failed to check ticket');

            // Use ticketServiceClient to mark sync error
            try {
                await ticketServiceClient.updateBlockchainSync(ticket.id, {
                    syncStatus: 'ERROR',
                }, ctx);
            } catch (updateError) {
                logger.error({ error: updateError, ticketId: ticket.id }, 'Failed to update sync status to ERROR');
            }

            return null;
        }
    }

    /**
     * REFACTORED: Now uses ticketServiceClient instead of direct DB queries/updates
     * Detects burned tokens and updates via service client
     */
    async detectBurns(): Promise<{ detected: number; errors: number }> {
        const ctx = createSystemContext();
        logger.info('Starting burn detection scan...');

        // Fetch minted tickets via service client
        const ticketsResponse = await ticketServiceClient.getTicketsForReconciliation(ctx, {
            limit: 50,
            syncStatus: 'SYNCED', // Only check synced tickets that might have been burned
        });

        // Filter for minted tickets that aren't already burned
        const mintedTickets = ticketsResponse.tickets.filter(
            t => t.isMinted && t.status !== 'BURNED' && t.tokenId
        );

        let burnCount = 0;
        let errorCount = 0;

        for (const ticket of mintedTickets) {
            try {
                const state = await this.onChainQuery.getTokenState(ticket.tokenId);

                if (state.burned) {
                    // Use ticketServiceClient to update ticket status
                    await ticketServiceClient.updateBlockchainSync(ticket.id, {
                        status: 'BURNED',
                        syncStatus: 'SYNCED',
                        reconciledAt: new Date().toISOString(),
                    }, ctx);

                    // Record discrepancy (owned by blockchain-indexer)
                    await db.query(`
                        INSERT INTO ownership_discrepancies
                        (ticket_id, discrepancy_type, database_value, blockchain_value, resolved)
                        VALUES ($1, 'BURN_DETECTED', $2, 'BURNED', true)
                    `, [ticket.id, ticket.status]);

                    burnCount++;
                    logger.info({
                        ticketId: ticket.id,
                        tokenId: ticket.tokenId
                    }, 'Burned ticket detected and updated via ticket-service');
                }

            } catch (error) {
                logger.error({
                    error: (error as Error).message,
                    ticketId: ticket.id
                }, 'Failed to check burn status');
                errorCount++;
            }
        }

        logger.info({
            checked: mintedTickets.length,
            burns: burnCount,
            errors: errorCount
        }, 'Burn detection scan complete');

        return { detected: burnCount, errors: errorCount };
    }

    /**
     * REFACTORED: Now uses ticketServiceClient instead of direct DB queries/updates
     * Verifies marketplace activity and updates ticket ownership via service client
     */
    async verifyMarketplaceActivity(): Promise<{ checked: number; mismatches: number }> {
        const ctx = createSystemContext();

        // Query marketplace_activity which is owned by blockchain-indexer
        const recentActivity = await db.query(`
            SELECT
                ma.id,
                ma.token_id,
                ma.buyer,
                ma.activity_type
            FROM marketplace_activity ma
            WHERE ma.activity_type = 'SALE'
            AND ma.created_at > NOW() - INTERVAL '1 hour'
            ORDER BY ma.created_at DESC
            LIMIT 20
        `);

        let mismatches = 0;

        for (const activity of recentActivity.rows) {
            // Verify on-chain ownership
            const verification = await this.onChainQuery.verifyOwnership(
                activity.token_id,
                activity.buyer
            );

            if (!verification.valid) {
                logger.warn({
                    activityId: activity.id,
                    tokenId: activity.token_id,
                    expectedOwner: activity.buyer,
                    actualOwner: verification.actualOwner,
                    reason: verification.reason
                }, 'Marketplace activity verification failed');

                mismatches++;

                // Update ticket ownership via service client if we know the actual owner
                if (verification.actualOwner) {
                    try {
                        await ticketServiceClient.updateBlockchainSyncByToken(activity.token_id, {
                            walletAddress: verification.actualOwner,
                            syncStatus: 'SYNCED',
                        }, ctx);
                        
                        logger.info({
                            tokenId: activity.token_id,
                            newOwner: verification.actualOwner
                        }, 'Updated ticket ownership via ticket-service');
                    } catch (error) {
                        logger.error({
                            error,
                            tokenId: activity.token_id
                        }, 'Failed to update ticket ownership via ticket-service');
                    }
                }
            }
        }

        return { checked: recentActivity.rows.length, mismatches };
    }
}
