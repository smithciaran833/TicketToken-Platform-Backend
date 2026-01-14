/**
 * Unit Tests: PDF Generator
 * Tests PDF ticket generation functionality
 */

import { PDFGenerator, TicketData } from '../../../src/utils/pdf-generator';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('PDFGenerator', () => {
  const sampleTicketData: TicketData = {
    orderId: 'order-123',
    orderNumber: 'ORD-2024-001',
    eventName: 'Summer Concert',
    eventDate: new Date('2024-07-15T19:00:00Z'),
    eventVenue: 'Madison Square Garden',
    ticketType: 'VIP',
    seatNumber: 'A1',
    quantity: 2,
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    qrCode: 'QR123456789',
    totalAmount: 25000,
  };

  // ============================================
  // generateTicket
  // ============================================
  describe('generateTicket', () => {
    it('should generate a buffer', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should include order number in output', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain(sampleTicketData.orderNumber);
    });

    it('should include event name in output', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain(sampleTicketData.eventName);
    });

    it('should include venue in output', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain(sampleTicketData.eventVenue);
    });

    it('should include ticket type in output', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain(sampleTicketData.ticketType);
    });

    it('should include seat number when provided', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain(sampleTicketData.seatNumber);
    });

    it('should handle missing seat number', async () => {
      const ticketWithoutSeat = { ...sampleTicketData, seatNumber: undefined };
      const result = await PDFGenerator.generateTicket(ticketWithoutSeat);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should include customer name in output', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain(sampleTicketData.customerName);
    });

    it('should include customer email in output', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain(sampleTicketData.customerEmail);
    });

    it('should include quantity in output', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain(sampleTicketData.quantity.toString());
    });

    it('should include formatted total amount', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain('250.00'); // $250.00
    });

    it('should include QR code in output', async () => {
      const result = await PDFGenerator.generateTicket(sampleTicketData);
      const content = result.toString();
      expect(content).toContain(sampleTicketData.qrCode);
    });

    it('should log generation success', async () => {
      const { logger } = require('../../../src/utils/logger');
      await PDFGenerator.generateTicket(sampleTicketData);
      expect(logger.info).toHaveBeenCalledWith(
        'Generated PDF ticket',
        expect.objectContaining({ orderId: sampleTicketData.orderId })
      );
    });

    it('should handle different date formats', async () => {
      const ticketWithDifferentDate = {
        ...sampleTicketData,
        eventDate: new Date('2024-12-31T23:59:59Z'),
      };
      const result = await PDFGenerator.generateTicket(ticketWithDifferentDate);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle zero total amount', async () => {
      const freeTicket = { ...sampleTicketData, totalAmount: 0 };
      const result = await PDFGenerator.generateTicket(freeTicket);
      const content = result.toString();
      expect(content).toContain('0.00');
    });

    it('should handle large total amounts', async () => {
      const expensiveTicket = { ...sampleTicketData, totalAmount: 10000000 }; // $100,000
      const result = await PDFGenerator.generateTicket(expensiveTicket);
      const content = result.toString();
      expect(content).toContain('100000.00');
    });
  });

  // ============================================
  // generateMultipleTickets
  // ============================================
  describe('generateMultipleTickets', () => {
    it('should generate buffer for multiple tickets', async () => {
      const tickets = [
        sampleTicketData,
        { ...sampleTicketData, orderId: 'order-456', seatNumber: 'A2' },
      ];
      const result = await PDFGenerator.generateMultipleTickets(tickets);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should include all tickets in output', async () => {
      const tickets = [
        { ...sampleTicketData, seatNumber: 'A1' },
        { ...sampleTicketData, seatNumber: 'A2' },
        { ...sampleTicketData, seatNumber: 'A3' },
      ];
      const result = await PDFGenerator.generateMultipleTickets(tickets);
      const content = result.toString();
      expect(content).toContain('A1');
      expect(content).toContain('A2');
      expect(content).toContain('A3');
    });

    it('should handle empty array', async () => {
      const result = await PDFGenerator.generateMultipleTickets([]);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should handle single ticket', async () => {
      const result = await PDFGenerator.generateMultipleTickets([sampleTicketData]);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should log generation with count', async () => {
      const { logger } = require('../../../src/utils/logger');
      const tickets = [sampleTicketData, sampleTicketData];
      await PDFGenerator.generateMultipleTickets(tickets);
      expect(logger.info).toHaveBeenCalledWith(
        'Generated multi-ticket PDF',
        expect.objectContaining({ count: 2 })
      );
    });

    it('should handle large number of tickets', async () => {
      const tickets = Array(50).fill(null).map((_, i) => ({
        ...sampleTicketData,
        orderId: `order-${i}`,
        seatNumber: `A${i + 1}`,
      }));
      const result = await PDFGenerator.generateMultipleTickets(tickets);
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  // ============================================
  // generateQRCode
  // ============================================
  describe('generateQRCode', () => {
    it('should generate QR code string', () => {
      const result = PDFGenerator.generateQRCode('test-data');
      expect(result).toBe('QR:test-data');
    });

    it('should handle empty string', () => {
      const result = PDFGenerator.generateQRCode('');
      expect(result).toBe('QR:');
    });

    it('should handle special characters', () => {
      const result = PDFGenerator.generateQRCode('test/data?param=value&other=123');
      expect(result).toBe('QR:test/data?param=value&other=123');
    });

    it('should handle long strings', () => {
      const longData = 'a'.repeat(1000);
      const result = PDFGenerator.generateQRCode(longData);
      expect(result).toBe(`QR:${longData}`);
    });

    it('should handle UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = PDFGenerator.generateQRCode(uuid);
      expect(result).toBe(`QR:${uuid}`);
    });

    it('should handle JSON stringified data', () => {
      const jsonData = JSON.stringify({ orderId: '123', ticketId: '456' });
      const result = PDFGenerator.generateQRCode(jsonData);
      expect(result).toBe(`QR:${jsonData}`);
    });
  });

  // ============================================
  // TicketData Interface
  // ============================================
  describe('TicketData Interface', () => {
    it('should accept all required fields', () => {
      const ticket: TicketData = {
        orderId: 'order-123',
        orderNumber: 'ORD-001',
        eventName: 'Event',
        eventDate: new Date(),
        eventVenue: 'Venue',
        ticketType: 'General',
        quantity: 1,
        customerName: 'Customer',
        customerEmail: 'email@test.com',
        qrCode: 'QR123',
        totalAmount: 1000,
      };
      expect(ticket.orderId).toBe('order-123');
    });

    it('should accept optional seatNumber', () => {
      const ticketWithSeat: TicketData = {
        ...sampleTicketData,
        seatNumber: 'B15',
      };
      expect(ticketWithSeat.seatNumber).toBe('B15');

      const ticketWithoutSeat: TicketData = {
        ...sampleTicketData,
        seatNumber: undefined,
      };
      expect(ticketWithoutSeat.seatNumber).toBeUndefined();
    });
  });

  // ============================================
  // Error Handling
  // ============================================
  describe('Error Handling', () => {
    it('should handle malformed date gracefully', async () => {
      const ticketWithBadDate = {
        ...sampleTicketData,
        eventDate: new Date('invalid-date'),
      };
      // Should not throw, just produce output with invalid date
      const result = await PDFGenerator.generateTicket(ticketWithBadDate);
      expect(result).toBeInstanceOf(Buffer);
    });
  });
});
