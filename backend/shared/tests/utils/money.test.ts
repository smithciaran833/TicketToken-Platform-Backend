import {
  toCents,
  fromCents,
  addCents,
  subtractCents,
  percentOfCents,
  multiplyCents,
  formatCents,
  parseToCents,
} from '../../src/utils/money';

describe('Money Utilities', () => {
  describe('toCents', () => {
    test('converts dollars to cents', () => {
      expect(toCents(10.5)).toBe(1050);
      expect(toCents(100)).toBe(10000);
      expect(toCents(0.01)).toBe(1);
    });

    test('handles edge cases', () => {
      expect(toCents(0)).toBe(0);
      expect(toCents(999999.99)).toBe(99999999);
      expect(toCents(0.001)).toBe(0); // Rounds down sub-cent
    });

    test('handles floating point precision', () => {
      expect(toCents(10.1)).toBe(1010);
      expect(toCents(10.29)).toBe(1029);
      expect(toCents(0.07)).toBe(7);
    });
  });

  describe('fromCents', () => {
    test('converts cents to dollars', () => {
      expect(fromCents(1050)).toBe(10.5);
      expect(fromCents(10000)).toBe(100);
      expect(fromCents(1)).toBe(0.01);
    });

    test('handles zero', () => {
      expect(fromCents(0)).toBe(0);
    });
  });

  describe('addCents', () => {
    test('adds multiple cent amounts', () => {
      expect(addCents(1000, 500, 250)).toBe(1750);
      expect(addCents(100)).toBe(100);
      expect(addCents(0, 0, 0)).toBe(0);
    });

    test('handles large sums', () => {
      expect(addCents(99999999, 1)).toBe(100000000);
    });
  });

  describe('subtractCents', () => {
    test('subtracts cent amounts', () => {
      expect(subtractCents(1000, 250)).toBe(750);
      expect(subtractCents(100, 100)).toBe(0);
    });

    test('throws on negative result', () => {
      expect(() => subtractCents(100, 200)).toThrow('Cannot subtract');
    });
  });

  describe('percentOfCents', () => {
    test('calculates percentage using basis points', () => {
      // 10% of $100 = $10
      expect(percentOfCents(10000, 1000)).toBe(1000);

      // 7.5% of $100 = $7.50
      expect(percentOfCents(10000, 750)).toBe(750);

      // 2.5% of $100 = $2.50
      expect(percentOfCents(10000, 250)).toBe(250);
    });

    test('handles fractional cents (rounds down)', () => {
      // 7.5% of $10.01 = 75.075 cents → 75 cents
      expect(percentOfCents(1001, 750)).toBe(75);
    });

    test('handles zero', () => {
      expect(percentOfCents(0, 1000)).toBe(0);
      expect(percentOfCents(10000, 0)).toBe(0);
    });

    test('validates basis points range', () => {
      expect(() => percentOfCents(1000, -1)).toThrow('between 0 and 10000');
      expect(() => percentOfCents(1000, 10001)).toThrow('between 0 and 10000');
    });
  });

  describe('multiplyCents', () => {
    test('multiplies cents by quantity', () => {
      expect(multiplyCents(1000, 3)).toBe(3000);
      expect(multiplyCents(2550, 2)).toBe(5100);
    });

    test('handles zero', () => {
      expect(multiplyCents(1000, 0)).toBe(0);
      expect(multiplyCents(0, 5)).toBe(0);
    });
  });

  describe('formatCents', () => {
    test('formats cents as currency', () => {
      expect(formatCents(1050)).toBe('$10.50');
      expect(formatCents(10000)).toBe('$100.00');
      expect(formatCents(1)).toBe('$0.01');
      expect(formatCents(0)).toBe('$0.00');
    });

    test('handles large amounts', () => {
      expect(formatCents(123456789)).toBe('$1,234,567.89');
    });

    test('supports different currencies', () => {
      expect(formatCents(1050, 'EUR')).toBe('€10.50');
      expect(formatCents(1050, 'GBP')).toBe('£10.50');
    });
  });

  describe('parseToCents', () => {
    test('parses currency strings', () => {
      expect(parseToCents('$10.50')).toBe(1050);
      expect(parseToCents('$100')).toBe(10000);
      expect(parseToCents('10.50')).toBe(1050);
    });

    test('handles various formats', () => {
      expect(parseToCents('$1,234.56')).toBe(123456);
      expect(parseToCents('1234.56')).toBe(123456);
    });

    test('throws on invalid input', () => {
      expect(() => parseToCents('invalid')).toThrow();
      expect(() => parseToCents('')).toThrow();
    });
  });

  describe('Money Precision - No Loss in Chains', () => {
    test('complex calculation maintains precision', () => {
      // Buy 3 tickets at $47.50 each = $142.50
      const ticketPrice = toCents(47.5);
      const quantity = 3;
      const subtotal = multiplyCents(ticketPrice, quantity);
      expect(subtotal).toBe(14250);

      // Add 7.5% platform fee
      const platformFee = percentOfCents(subtotal, 750);
      expect(platformFee).toBe(1068); // $10.68

      // Add 9.25% tax
      const tax = percentOfCents(subtotal, 925);
      expect(tax).toBe(1318); // $13.18

      // Total
      const total = addCents(subtotal, platformFee, tax);
      expect(total).toBe(16636); // $166.36

      // Verify conversion back
      expect(fromCents(total)).toBe(166.36);
    });

    test('refund calculation maintains precision', () => {
      const originalAmount = 10000; // $100
      const platformFee = 750; // $7.50

      // Partial refund of $50
      const refundAmount = 5000;

      // Pro-rata platform fee refund
      const platformFeeRefund = Math.floor((refundAmount / originalAmount) * platformFee);
      expect(platformFeeRefund).toBe(375); // $3.75

      const venueRefund = refundAmount - platformFeeRefund;
      expect(venueRefund).toBe(4625); // $46.25

      // Verify total
      expect(platformFeeRefund + venueRefund).toBe(5000);
    });
  });

  describe('Real-world Scenarios', () => {
    test('ticket purchase with fees and taxes', () => {
      // $85 ticket
      const ticketPrice = 8500;

      // 5% platform fee = $4.25
      const platformFee = percentOfCents(ticketPrice, 500);
      expect(platformFee).toBe(425);

      // 7% state tax on ticket only = $5.95
      const tax = percentOfCents(ticketPrice, 700);
      expect(tax).toBe(595);

      // Total = $94.20
      const total = addCents(ticketPrice, platformFee, tax);
      expect(total).toBe(9520);
      expect(formatCents(total)).toBe('$95.20');
    });

    test('venue royalty split on resale', () => {
      // $200 resale price
      const resalePrice = 20000;

      // 10% venue royalty = $20
      const venueRoyalty = percentOfCents(resalePrice, 1000);
      expect(venueRoyalty).toBe(2000);

      // 5% platform fee = $10
      const platformFee = percentOfCents(resalePrice, 500);
      expect(platformFee).toBe(1000);

      // Seller gets = $170
      const sellerPayout = subtractCents(resalePrice, addCents(venueRoyalty, platformFee));
      expect(sellerPayout).toBe(17000);

      // Verify total
      expect(addCents(venueRoyalty, platformFee, sellerPayout)).toBe(20000);
    });
  });
});
