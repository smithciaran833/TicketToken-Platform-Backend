import { formatCents } from '@tickettoken/shared/utils/money';

describe('Ticket Service - Money Precision Integration', () => {
  // Skip database tests if no DATABASE_URL
  const hasDatabase = !!process.env.DATABASE_URL;

  describe('Fee Calculations', () => {
    test('calculates fees with no precision loss', () => {
      const ticketPriceCents = 4750;
      const quantity = 2;
      const subtotalCents = ticketPriceCents * quantity;

      const platformFeeCents = Math.floor((subtotalCents * 750) / 10000);
      expect(platformFeeCents).toBe(712);

      const taxCents = Math.floor((subtotalCents * 925) / 10000);
      expect(taxCents).toBe(878);

      const totalCents = subtotalCents + platformFeeCents + taxCents;
      expect(totalCents).toBe(11090);
      expect(Number.isInteger(totalCents)).toBe(true);
    });

    test('handles $0.01 transaction', () => {
      const oneCent = 1;
      const feeCents = Math.floor((oneCent * 750) / 10000);
      expect(feeCents).toBe(0);
      expect(oneCent + feeCents).toBe(1);
    });

    test('handles large transaction', () => {
      const largePriceCents = 999999;
      const feeCents = Math.floor((largePriceCents * 750) / 10000);
      expect(feeCents).toBe(74999);
      expect(largePriceCents + feeCents).toBe(1074998);
    });
  });

  describe('Refund Calculations', () => {
    test('pro-rata refund maintains precision', () => {
      const originalAmountCents = 10000;
      const platformFeeCents = 750;
      const refundAmountCents = 6000;
      
      const platformFeeRefundCents = Math.floor(
        (refundAmountCents / originalAmountCents) * platformFeeCents
      );
      expect(platformFeeRefundCents).toBe(450);
      
      const venueRefundCents = refundAmountCents - platformFeeRefundCents;
      expect(venueRefundCents).toBe(5550);
      expect(platformFeeRefundCents + venueRefundCents).toBe(refundAmountCents);
    });

    test('full refund of $157.50', () => {
      const originalAmountCents = 15750;
      const platformFeeCents = 1181;
      
      const platformFeeRefundCents = Math.floor(
        (originalAmountCents / originalAmountCents) * platformFeeCents
      );
      expect(platformFeeRefundCents).toBe(1181);
      
      const venueRefundCents = originalAmountCents - platformFeeRefundCents;
      expect(venueRefundCents).toBe(14569);
    });
  });

  describe('Display Formatting', () => {
    test('formats cents correctly', () => {
      expect(formatCents(1050)).toBe('$10.50');
      expect(formatCents(10000)).toBe('$100.00');
      expect(formatCents(1)).toBe('$0.01');
      expect(formatCents(999999)).toBe('$9,999.99');
    });
  });

  describe('Precision Through Multiple Operations', () => {
    test('ticket purchase -> fee -> tax -> refund maintains precision', () => {
      // Purchase
      const ticketPriceCents = 8500; // $85
      const platformFeeCents = Math.floor((ticketPriceCents * 500) / 10000); // 5%
      const taxCents = Math.floor((ticketPriceCents * 700) / 10000); // 7%
      const totalCents = ticketPriceCents + platformFeeCents + taxCents;
      
      expect(platformFeeCents).toBe(425); // $4.25
      expect(taxCents).toBe(595); // $5.95
      expect(totalCents).toBe(9520); // $95.20
      
      // Refund 50%
      const refundAmountCents = Math.floor(totalCents / 2);
      expect(refundAmountCents).toBe(4760); // $47.60
      
      // All values remain integers
      expect(Number.isInteger(platformFeeCents)).toBe(true);
      expect(Number.isInteger(taxCents)).toBe(true);
      expect(Number.isInteger(totalCents)).toBe(true);
      expect(Number.isInteger(refundAmountCents)).toBe(true);
    });
  });
});
