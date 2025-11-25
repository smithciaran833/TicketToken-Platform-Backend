import knex from 'knex';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'ReservationExpiryWorker' });

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/tickettoken_db'
});

export class ReservationExpiryWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start(intervalMs: number = 60000) { // Run every minute
    if (this.intervalId) {
      log.info('Reservation expiry worker already running');
      return;
    }

    log.info('Starting reservation expiry worker', { intervalMs });
    this.intervalId = setInterval(() => this.processExpiredReservations(), intervalMs);

    // Run immediately on start
    this.processExpiredReservations();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log.info('Reservation expiry worker stopped');
    }
  }

  private async processExpiredReservations() {
    if (this.isRunning) {
      log.debug('Expiry job already running, skipping');
      return;
    }

    this.isRunning = true;

    try {
      const startTime = Date.now();

      // Call the stored procedure to release expired reservations
      const result = await db.raw('SELECT release_expired_reservations() as count');
      const releasedCount = result.rows[0].count;

      if (releasedCount > 0) {
        log.info('Released expired reservations', { 
          count: releasedCount,
          durationMs: Date.now() - startTime 
        });

        // Get the expired reservations to write to outbox
        const expiredReservations = await db('reservations')
          .where('status', 'EXPIRED')
          .where('released_at', '>=', db.raw("NOW() - INTERVAL '2 minutes'"))
          .select('id', 'order_id', 'user_id', 'quantity');

        // Write events to outbox (without tenant_id)
        for (const reservation of expiredReservations) {
          await db('outbox').insert({
            aggregate_type: 'reservation',
            aggregate_id: reservation.order_id,
            event_type: 'reservation.expired',
            payload: JSON.stringify({
              reservationId: reservation.id,
              orderId: reservation.order_id,
              userId: reservation.user_id,
              quantity: reservation.quantity,
              expiredAt: new Date()
            }),
            processed: false
          });
        }

        if (expiredReservations.length > 0) {
          log.info('Wrote expiry events to outbox', { count: expiredReservations.length });
        }
      }
    } catch (error) {
      log.error('Error processing expired reservations', { error });
    } finally {
      this.isRunning = false;
    }
  }
}
