import { addMintJob } from '../queues/mintQueue';
import logger from '../utils/logger';

interface Ticket {
  id: string;
  eventName: string;
  venue: string;
  eventDate: string;
  tier: string;
  seatNumber: string;
  price: number;
}

interface OrderData {
  orderId: string;
  tickets: Ticket[];
  eventId: string;
  userId: string;
}

export class PaymentIntegration {
  /**
   * Called when a payment is successfully completed
   * This should be triggered by your payment service
   */
  static async onPaymentComplete(orderData: OrderData) {
    const { orderId, tickets, eventId, userId } = orderData;

    logger.info(`💳 Payment completed for order ${orderId}, triggering mints for ${tickets.length} tickets`);

    const mintJobs = [];

    for (const ticket of tickets) {
      const mintData = {
        ticketId: ticket.id,
        orderId,
        eventId,
        userId,
        metadata: {
          eventName: ticket.eventName,
          venue: ticket.venue,
          date: ticket.eventDate,
          tier: ticket.tier,
          seatNumber: ticket.seatNumber,
          price: ticket.price
        }
      };

      const job = await addMintJob(mintData);
      mintJobs.push(job);
    }

    logger.info(`✅ Added ${mintJobs.length} mint jobs to queue`);
    return mintJobs;
  }
}
