import { ConsumeMessage } from 'amqplib';
import { notificationService } from '../services/notification.service';
import { logger } from '../config/logger';
import { 
  NotificationEvent, 
  PaymentCompletedEvent, 
  TicketTransferredEvent,
  EventReminderEvent,
  EventCancelledEvent,
  UserRegisteredEvent,
  PasswordResetEvent
} from '../types/events.types';
import { NotificationRequest } from '../types/notification.types';

export class EventHandler {
  async handleEvent(msg: ConsumeMessage): Promise<void> {
    try {
      const routingKey = msg.fields.routingKey;
      const event = JSON.parse(msg.content.toString()) as NotificationEvent;

      logger.info('Processing event', { 
        type: routingKey, 
        eventId: event.eventId,
        venueId: event.venueId 
      });

      switch (routingKey) {
        case 'payment.completed':
          await this.handlePaymentCompleted(event as PaymentCompletedEvent);
          break;

        case 'ticket.transferred':
          await this.handleTicketTransferred(event as TicketTransferredEvent);
          break;

        case 'event.reminder':
          await this.handleEventReminder(event as EventReminderEvent);
          break;

        case 'event.cancelled':
          await this.handleEventCancelled(event as EventCancelledEvent);
          break;

        case 'user.registered':
          await this.handleUserRegistered(event as UserRegisteredEvent);
          break;

        case 'user.password_reset':
          await this.handlePasswordReset(event as PasswordResetEvent);
          break;

        default:
          logger.warn('Unknown event type', { type: routingKey });
      }
    } catch (error) {
      logger.error('Event processing failed', error);
      throw error; // Will cause message to be requeued
    }
  }

  private async handlePaymentCompleted(event: PaymentCompletedEvent): Promise<void> {
    const { data } = event;

    // Send purchase confirmation email
    const emailRequest: NotificationRequest = {
      venueId: event.venueId,
      recipientId: data.customerId,
      recipient: {
        id: data.customerId,
        email: data.tickets[0].eventName, // This should come from user service
      },
      channel: 'email',
      type: 'transactional',
      template: 'purchase_confirmation',
      priority: 'high',
      data: {
        orderId: data.orderId,
        amount: data.amount,
        currency: data.currency,
        tickets: data.tickets,
        paymentMethod: data.paymentMethod,
        purchaseDate: new Date(),
      },
    };

    await notificationService.send(emailRequest);

    // Also send SMS if phone number is available
    // This would require fetching user details from auth service
    logger.info('Purchase confirmation notifications queued', { 
      orderId: data.orderId,
      customerId: data.customerId 
    });
  }

  private async handleTicketTransferred(event: TicketTransferredEvent): Promise<void> {
    const { data } = event;

    // Notify sender
    const senderRequest: NotificationRequest = {
      venueId: event.venueId,
      recipientId: data.fromUserId,
      recipient: {
        id: data.fromUserId,
        email: data.fromEmail,
      },
      channel: 'email',
      type: 'transactional',
      template: 'ticket_transfer_sender',
      priority: 'normal',
      data: {
        ticketId: data.ticketId,
        toEmail: data.toEmail,
        eventName: data.eventName,
        eventDate: data.eventDate,
        transferredAt: data.transferredAt,
      },
    };

    // Notify recipient
    const recipientRequest: NotificationRequest = {
      venueId: event.venueId,
      recipientId: data.toUserId,
      recipient: {
        id: data.toUserId,
        email: data.toEmail,
      },
      channel: 'email',
      type: 'transactional',
      template: 'ticket_transfer_recipient',
      priority: 'high',
      data: {
        ticketId: data.ticketId,
        fromEmail: data.fromEmail,
        eventName: data.eventName,
        eventDate: data.eventDate,
        transferredAt: data.transferredAt,
      },
    };

    await Promise.all([
      notificationService.send(senderRequest),
      notificationService.send(recipientRequest),
    ]);

    logger.info('Transfer notifications queued', { ticketId: data.ticketId });
  }

  private async handleEventReminder(event: EventReminderEvent): Promise<void> {
    const { data } = event;

    // Send reminders to all ticket holders
    const promises = data.ticketHolders.map(holder => {
      const request: NotificationRequest = {
        venueId: event.venueId,
        recipientId: holder.userId,
        recipient: {
          id: holder.userId,
          email: holder.email,
        },
        channel: 'email',
        type: 'transactional',
        template: 'event_reminder',
        priority: 'normal',
        data: {
          eventId: data.eventId,
          eventName: data.eventName,
          eventDate: data.eventDate,
          venueName: data.venueName,
          venueAddress: data.venueAddress,
          ticketId: holder.ticketId,
        },
      };

      return notificationService.send(request);
    });

    await Promise.all(promises);

    logger.info('Event reminders queued', { 
      eventId: data.eventId,
      recipientCount: data.ticketHolders.length 
    });
  }

  private async handleEventCancelled(event: EventCancelledEvent): Promise<void> {
    const { data } = event;

    // Send cancellation notices to all affected ticket holders
    const promises = data.affectedTickets.map(ticket => {
      const request: NotificationRequest = {
        venueId: event.venueId,
        recipientId: ticket.userId,
        recipient: {
          id: ticket.userId,
          email: ticket.email,
        },
        channel: 'email',
        type: 'transactional',
        template: 'event_cancelled',
        priority: 'critical',
        data: {
          eventId: data.eventId,
          eventName: data.eventName,
          eventDate: data.eventDate,
          reason: data.reason,
          refundAvailable: data.refundAvailable,
          ticketId: ticket.ticketId,
        },
      };

      return notificationService.send(request);
    });

    await Promise.all(promises);

    logger.info('Cancellation notifications queued', { 
      eventId: data.eventId,
      recipientCount: data.affectedTickets.length 
    });
  }

  private async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    const { data } = event;

    const request: NotificationRequest = {
      venueId: event.venueId,
      recipientId: data.userId,
      recipient: {
        id: data.userId,
        email: data.email,
        name: `${data.firstName} ${data.lastName}`,
      },
      channel: 'email',
      type: 'transactional',
      template: 'welcome_email',
      priority: 'normal',
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        verificationToken: data.verificationToken,
        registrationSource: data.registrationSource,
      },
    };

    await notificationService.send(request);

    logger.info('Welcome email queued', { userId: data.userId });
  }

  private async handlePasswordReset(event: PasswordResetEvent): Promise<void> {
    const { data } = event;

    const request: NotificationRequest = {
      venueId: event.venueId,
      recipientId: data.userId,
      recipient: {
        id: data.userId,
        email: data.email,
      },
      channel: 'email',
      type: 'transactional',
      template: 'password_reset',
      priority: 'critical',
      data: {
        resetToken: data.resetToken,
        expiresAt: data.expiresAt,
        resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${data.resetToken}`,
      },
    };

    await notificationService.send(request);

    logger.info('Password reset email queued', { userId: data.userId });
  }
}

export const eventHandler = new EventHandler();
