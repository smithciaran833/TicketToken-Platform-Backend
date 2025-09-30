const { addMintJob } = require('../queues/mintQueue');
const logger = require('../utils/logger');

class PaymentIntegration {
  /**
   * Called when a payment is successfully completed
   * This should be triggered by your payment service
   */
  static async onPaymentComplete(orderData) {
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

module.exports = { PaymentIntegration };
