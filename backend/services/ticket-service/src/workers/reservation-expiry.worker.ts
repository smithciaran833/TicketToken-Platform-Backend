import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/tickettoken_db'
});

export class ReservationExpiryWorker {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  start(intervalMs: number = 60000) { // Run every minute
    if (this.intervalId) {
      console.log('Reservation expiry worker already running');
      return;
    }

    console.log('Starting reservation expiry worker...');
    this.intervalId = setInterval(() => this.processExpiredReservations(), intervalMs);

    // Run immediately on start
    this.processExpiredReservations();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Reservation expiry worker stopped');
    }
  }

  private async processExpiredReservations() {
    if (this.isRunning) {
      console.log('Expiry job already running, skipping...');
      return;
    }

    this.isRunning = true;

    try {
      const startTime = Date.now();

      // Call the stored procedure to release expired reservations
      const result = await db.raw('SELECT release_expired_reservations() as count');
      const releasedCount = result.rows[0].count;

      if (releasedCount > 0) {
        console.log(`Released ${releasedCount} expired reservations in ${Date.now() - startTime}ms`);

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
          console.log(`Wrote ${expiredReservations.length} expiry events to outbox`);
        }
      }
    } catch (error) {
      console.error('Error processing expired reservations:', error);
    } finally {
      this.isRunning = false;
    }
  }
}
