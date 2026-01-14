import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';
import { RedisService } from '../services/redisService';
import { QueueService } from '../services/queueService';
import { withSystemContextPool } from './system-job-utils';

interface OrphanReservation {
  reservation_id: string;
  order_id: string;
  user_id: string;
  created_at: Date;
  expires_at: Date;
  status: string;
  quantity: number;
  issue_type: 'no_order' | 'order_failed' | 'should_be_expired';
}

export class ReservationCleanupWorker {
  private pool: Pool;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private log = logger.child({ component: 'ReservationCleanupWorker' });
  private metrics = {
    totalReleased: 0,
    orphansFound: 0,
    orphansFixed: 0,
    errors: 0,
    lastRun: null as Date | null
  };

  constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: 5 // Dedicated pool for cleanup worker
    });
  }

  async start(intervalMs: number = 60000): Promise<void> {
    if (this.intervalId) {
      this.log.info('Reservation cleanup worker already running');
      return;
    }

    this.log.info('Starting reservation cleanup worker', { interval: intervalMs });

    // Run immediately on start
    await this.runCleanup();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.runCleanup().catch(error => {
        this.log.error('Cleanup run failed', error);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.log.info('Reservation cleanup worker stopped');
    }
  }

  private async runCleanup(): Promise<void> {
    if (this.isRunning) {
      this.log.debug('Cleanup already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // 1. Release expired reservations
      const expiredCount = await this.releaseExpiredReservations();

      // 2. Find and fix orphan reservations
      const orphansFixed = await this.fixOrphanReservations();

      // 3. Clean up stale Redis entries
      const redisCleanup = await this.cleanupRedisReservations();

      // 4. Reconcile inventory discrepancies
      await this.reconcileInventory();

      // 5. Notify about cleaned up reservations
      await this.notifyCleanups();

      const duration = Date.now() - startTime;
      this.metrics.lastRun = new Date();

      this.log.info('Cleanup completed', {
        duration,
        expired: expiredCount,
        orphansFixed,
        redisCleaned: redisCleanup,
        metrics: this.metrics
      });

    } catch (error) {
      this.metrics.errors++;
      this.log.error('Cleanup error', error);
    } finally {
      this.isRunning = false;
    }
  }

  private async releaseExpiredReservations(): Promise<number> {
    return withSystemContextPool(this.pool, async (client) => {
      try {
        await client.query('BEGIN');

        // Call the stored procedure
        const result = await client.query('SELECT release_expired_reservations() as count');
        const releasedCount = result.rows[0].count;

        if (releasedCount > 0) {
          // Get details of expired reservations for events
          const expiredDetails = await client.query(`
            SELECT
              r.id,
              r.order_id,
              r.user_id,
              r.quantity,
              r.expires_at,
              r.event_id,
              COALESCE(r.tickets, '[]'::jsonb) as tickets
            FROM reservations r
            WHERE r.status = 'EXPIRED'
              AND r.released_at >= NOW() - INTERVAL '2 minutes'
          `);

          // Write to outbox for each expired reservation
          for (const reservation of expiredDetails.rows) {
            await client.query(`
              INSERT INTO outbox (
                aggregate_id,
                aggregate_type,
                event_type,
                payload,
                created_at
              ) VALUES ($1, $2, $3, $4, NOW())
            `, [
              reservation.order_id || reservation.id,
              'reservation',
              'reservation.expired',
              JSON.stringify({
                reservationId: reservation.id,
                orderId: reservation.order_id,
                userId: reservation.user_id,
                eventId: reservation.event_id,
                quantity: reservation.quantity,
                tickets: reservation.tickets,
                expiredAt: new Date()
              })
            ]);

            // Clear from Redis
            await RedisService.del(`reservation:${reservation.id}`);

            // Send notification to user
            await QueueService.publish('notifications', {
              type: 'reservation.expired',
              userId: reservation.user_id,
              data: {
                reservationId: reservation.id,
                eventId: reservation.event_id
              }
            });
          }

          this.log.info(`Released ${releasedCount} expired reservations`);
        }

        await client.query('COMMIT');
        this.metrics.totalReleased += releasedCount;
        return releasedCount;

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async fixOrphanReservations(): Promise<number> {
    let fixed = 0;

    await withSystemContextPool(this.pool, async (client) => {
      // Find orphan reservations
      const orphans = await client.query<OrphanReservation>(
        'SELECT * FROM find_orphan_reservations()'
      );

      this.metrics.orphansFound += orphans.rows.length;

      if (orphans.rows.length > 0) {
        this.log.warn(`Found ${orphans.rows.length} orphan reservations`);

        for (const orphan of orphans.rows) {
          await client.query('BEGIN');

          try {
            switch (orphan.issue_type) {
              case 'no_order':
                // Release reservation with no order
                await this.releaseOrphanReservation(client, orphan, 'no_order');
                break;

              case 'order_failed':
                // Release reservation for failed order
                await this.releaseOrphanReservation(client, orphan, 'order_failed');
                break;

              case 'should_be_expired':
                // Force expire old reservations
                await this.releaseOrphanReservation(client, orphan, 'force_expired');
                break;
            }

            await client.query('COMMIT');
            fixed++;

          } catch (error) {
            await client.query('ROLLBACK');
            this.log.error(`Failed to fix orphan reservation ${orphan.reservation_id}`, error);
          }
        }

        this.metrics.orphansFixed += fixed;
        this.log.info(`Fixed ${fixed} orphan reservations`);
      }
    });

    return fixed;
  }

  private async releaseOrphanReservation(
    client: any,
    orphan: OrphanReservation,
    reason: string
  ): Promise<void> {
    // Get reservation details including tickets
    const reservation = await client.query(`
      SELECT * FROM reservations WHERE id = $1
    `, [orphan.reservation_id]);

    if (reservation.rows.length === 0) return;

    const res = reservation.rows[0];

    // Update reservation status
    await client.query(`
      UPDATE reservations
      SET status = 'EXPIRED',
          released_at = NOW(),
          release_reason = $2,
          updated_at = NOW()
      WHERE id = $1
    `, [orphan.reservation_id, reason]);

    // Release inventory
    if (res.tickets && Array.isArray(res.tickets)) {
      for (const ticket of res.tickets) {
        if (ticket.ticketTypeId && ticket.quantity) {
          await client.query(`
            UPDATE ticket_types
            SET available_quantity = available_quantity + $1,
                updated_at = NOW()
            WHERE id = $2
          `, [ticket.quantity, ticket.ticketTypeId]);
        }
      }
    }

    // Record in history
    await client.query(`
      INSERT INTO reservation_history (
        reservation_id,
        order_id,
        user_id,
        status_from,
        status_to,
        reason,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      orphan.reservation_id,
      orphan.order_id,
      orphan.user_id,
      orphan.status,
      'EXPIRED',
      `Orphan cleanup: ${reason}`,
      JSON.stringify({
        issue_type: orphan.issue_type,
        original_expires_at: orphan.expires_at,
        cleaned_at: new Date()
      })
    ]);

    // Clear from Redis
    await RedisService.del(`reservation:${orphan.reservation_id}`);

    this.log.info(`Released orphan reservation`, {
      reservationId: orphan.reservation_id,
      reason,
      issueType: orphan.issue_type
    });
  }

  private async cleanupRedisReservations(): Promise<number> {
    let cleaned = 0;

    try {
      const redisClient = RedisService.getClient();
      const keys = await redisClient.keys('reservation:*');

      for (const key of keys) {
        const reservationId = key.split(':')[1];

        // Check if reservation still exists and is active
        const result = await withSystemContextPool(this.pool, async (client) => {
          return client.query(`
            SELECT status FROM reservations WHERE id = $1
          `, [reservationId]);
        });

        if (result.rows.length === 0 ||
            !['PENDING', 'ACTIVE'].includes(result.rows[0].status)) {
          await RedisService.del(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.log.info(`Cleaned ${cleaned} stale Redis reservation entries`);
      }

    } catch (error) {
      this.log.error('Failed to cleanup Redis reservations', error);
    }

    return cleaned;
  }

  private async reconcileInventory(): Promise<void> {
    await withSystemContextPool(this.pool, async (client) => {
      // Find ticket types with negative inventory (should never happen)
      const negativeInventory = await client.query(`
        SELECT id, name, available_quantity, total_quantity
        FROM ticket_types
        WHERE available_quantity < 0
      `);

      if (negativeInventory.rows.length > 0) {
        this.log.error('Found ticket types with negative inventory', {
          types: negativeInventory.rows
        });

        // Fix by setting to 0
        for (const type of negativeInventory.rows) {
          await client.query(`
            UPDATE ticket_types
            SET available_quantity = 0,
                updated_at = NOW()
            WHERE id = $1
          `, [type.id]);

          // Alert admins
          await QueueService.publish('alerts', {
            type: 'inventory.negative',
            severity: 'critical',
            data: type
          });
        }
      }

      // Find discrepancies between reserved and available quantities
      const discrepancies = await client.query(`
        WITH reservation_counts AS (
          SELECT
            tt.id as ticket_type_id,
            COALESCE(SUM(
              (SELECT SUM((value->>'quantity')::int)
               FROM jsonb_array_elements(r.tickets)
               WHERE value->>'ticketTypeId' = tt.id::text)
            ), 0) as reserved_quantity
          FROM ticket_types tt
          LEFT JOIN reservations r ON r.status IN ('PENDING', 'ACTIVE')
            AND r.expires_at > NOW()
            AND r.tickets::text LIKE '%' || tt.id::text || '%'
          GROUP BY tt.id
        )
        SELECT
          tt.id,
          tt.name,
          tt.total_quantity,
          tt.available_quantity,
          rc.reserved_quantity,
          (tt.total_quantity - tt.available_quantity - rc.reserved_quantity) as discrepancy
        FROM ticket_types tt
        JOIN reservation_counts rc ON rc.ticket_type_id = tt.id
        WHERE (tt.total_quantity - tt.available_quantity - rc.reserved_quantity) != 0
      `);

      if (discrepancies.rows.length > 0) {
        this.log.warn('Found inventory discrepancies', {
          count: discrepancies.rows.length,
          discrepancies: discrepancies.rows
        });

        // Log for manual review
        for (const disc of discrepancies.rows) {
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4)
          `, [
            disc.id,
            'ticket_type',
            'inventory.discrepancy',
            JSON.stringify(disc)
          ]);
        }
      }
    });
  }

  private async notifyCleanups(): Promise<void> {
    // Send summary notification if significant cleanups occurred
    if (this.metrics.orphansFixed > 10 || this.metrics.errors > 5) {
      await QueueService.publish('alerts', {
        type: 'reservation.cleanup.summary',
        severity: this.metrics.errors > 5 ? 'warning' : 'info',
        data: {
          ...this.metrics,
          timestamp: new Date()
        }
      });
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }
}
