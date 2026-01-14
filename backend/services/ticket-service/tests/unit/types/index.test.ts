import {
  Ticket,
  TicketStatus,
  TicketType,
  TransferRecord,
  TicketReservation,
  QRValidation,
  PurchaseRequest,
  Order,
  OrderStatus,
  OrderItem,
  NFTMintRequest,
  ServiceResponse,
} from '../../../src/types';

describe('Types', () => {
  describe('TicketStatus enum', () => {
    it('should have all expected statuses', () => {
      expect(TicketStatus.AVAILABLE).toBe('AVAILABLE');
      expect(TicketStatus.RESERVED).toBe('RESERVED');
      expect(TicketStatus.SOLD).toBe('SOLD');
      expect(TicketStatus.USED).toBe('USED');
      expect(TicketStatus.CANCELLED).toBe('CANCELLED');
      expect(TicketStatus.EXPIRED).toBe('EXPIRED');
      expect(TicketStatus.TRANSFERRED).toBe('TRANSFERRED');
    });

    it('should have 7 statuses', () => {
      const statusCount = Object.keys(TicketStatus).length;
      expect(statusCount).toBe(7);
    });
  });

  describe('OrderStatus enum', () => {
    it('should have all expected statuses', () => {
      expect(OrderStatus.PENDING).toBe('PENDING');
      expect(OrderStatus.PAID).toBe('PAID');
      expect(OrderStatus.AWAITING_MINT).toBe('AWAITING_MINT');
      expect(OrderStatus.COMPLETED).toBe('COMPLETED');
      expect(OrderStatus.PAYMENT_FAILED).toBe('PAYMENT_FAILED');
      expect(OrderStatus.CANCELLED).toBe('CANCELLED');
      expect(OrderStatus.EXPIRED).toBe('EXPIRED');
      expect(OrderStatus.MINT_FAILED).toBe('MINT_FAILED');
    });

    it('should have 8 statuses', () => {
      const statusCount = Object.keys(OrderStatus).length;
      expect(statusCount).toBe(8);
    });
  });

  describe('Type structures', () => {
    it('should allow creating a valid Ticket object', () => {
      const ticket: Ticket = {
        id: 'ticket-123',
        tenant_id: 'tenant-456',
        eventId: 'event-789',
        ticketTypeId: 'type-001',
        status: TicketStatus.AVAILABLE,
        priceCents: 5000,
        isTransferable: true,
        transferCount: 0,
        transferHistory: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(ticket.id).toBe('ticket-123');
      expect(ticket.priceCents).toBe(5000);
    });

    it('should allow creating a valid Order object', () => {
      const order: Order = {
        id: 'order-123',
        tenant_id: 'tenant-456',
        userId: 'user-789',
        eventId: 'event-001',
        orderNumber: 'ORD-001',
        status: OrderStatus.PENDING,
        subtotalCents: 10000,
        platformFeeCents: 500,
        processingFeeCents: 300,
        taxCents: 800,
        discountCents: 0,
        totalCents: 11600,
        ticketQuantity: 2,
        currency: 'USD',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(order.totalCents).toBe(11600);
    });

    it('should allow creating a valid ServiceResponse', () => {
      const successResponse: ServiceResponse<{ id: string }> = {
        success: true,
        data: { id: '123' },
      };

      const errorResponse: ServiceResponse<never> = {
        success: false,
        error: 'Something went wrong',
        code: 'ERR_001',
      };

      expect(successResponse.success).toBe(true);
      expect(errorResponse.success).toBe(false);
    });
  });
});
