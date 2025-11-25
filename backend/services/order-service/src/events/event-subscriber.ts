import { getChannel } from '../config/rabbitmq';
import { logger } from '../utils/logger';

export class EventSubscriber {
  async subscribeToPaymentEvents(): Promise<void> {
    try {
      const channel = getChannel();
      
      // Listen to payment events that affect orders
      channel.consume('order_service_queue', async (msg) => {
        if (!msg) return;

        try {
          const event = JSON.parse(msg.content.toString());
          
          switch (event.type) {
            case 'payment.succeeded':
              await this.handlePaymentSucceeded(event);
              break;
            case 'payment.failed':
              await this.handlePaymentFailed(event);
              break;
            default:
              logger.debug('Unhandled event type', { type: event.type });
          }

          channel.ack(msg);
        } catch (error) {
          logger.error('Failed to process event', { 
            error: error instanceof Error ? error.message : error 
          });
          channel.nack(msg, false, false); // Don't requeue
        }
      });

      logger.info('Event subscriber initialized');
    } catch (error) {
      logger.error('Failed to initialize event subscriber', { 
        error: error instanceof Error ? error.message : error 
      });
    }
  }

  private async handlePaymentSucceeded(event: any): Promise<void> {
    logger.info('Payment succeeded event received', { 
      orderId: event.payload?.orderId 
    });
    // Order confirmation is handled by internal API call from payment service
  }

  private async handlePaymentFailed(event: any): Promise<void> {
    logger.info('Payment failed event received', { 
      orderId: event.payload?.orderId 
    });
    // Order expiration/cancellation is handled by internal API call from payment service
  }
}

export const eventSubscriber = new EventSubscriber();
