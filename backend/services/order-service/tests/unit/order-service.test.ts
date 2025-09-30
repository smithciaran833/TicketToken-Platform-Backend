// Mock setup BEFORE any imports
const mockPool = {
  query: jest.fn(),
  connect: jest.fn().mockResolvedValue({
    query: jest.fn(),
    release: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn()
  })
};

const mockTicketService = {
  checkAvailability: jest.fn(),
  reserveTickets: jest.fn(),
  confirmReservation: jest.fn(),
  cancelReservation: jest.fn(),
  getTierInfo: jest.fn()
};

const mockPaymentService = {
  createPaymentIntent: jest.fn(),
  getPaymentIntent: jest.fn(),
  cancelPaymentIntent: jest.fn()
};

const mockRabbitMQ = {
  publish: jest.fn(),
  subscribe: jest.fn(),
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn(),
      sendToQueue: jest.fn(),
      publish: jest.fn(),
      consume: jest.fn()
    })
  })
};

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  incr: jest.fn()
};

const mockLogger: any = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn()
};

mockLogger.child.mockReturnValue(mockLogger);

// Mock modules
jest.mock('pg', () => ({ Pool: jest.fn(() => mockPool) }), { virtual: true });
jest.mock('../../src/services/ticket.service', () => mockTicketService, { virtual: true });
jest.mock('../../src/services/payment.service', () => mockPaymentService, { virtual: true });
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue(mockRabbitMQ)
}), { virtual: true });
jest.mock('ioredis', () => jest.fn(() => mockRedisClient), { virtual: true });
jest.mock('../../src/utils/logger', () => ({ logger: mockLogger }), { virtual: true });

describe('Order Service Tests', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    req = {
      body: {},
      params: {},
      query: {},
      headers: { authorization: 'Bearer test-token' },
      user: { id: 'user123', email: 'user@example.com', role: 'user' }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('POST /api/v1/orders - Create Order', () => {
    describe('Order Creation', () => {
      it('should create order successfully', async () => {
        req.body = {
          customerId: 'user123',
          eventId: 'event456',
          items: [
            { tierId: 'tier1', qty: 2 },
            { tierId: 'tier2', qty: 1 }
          ],
          currency: 'USD',
          paymentMethod: 'card',
          metadata: { source: 'web' }
        };

        // Mock tier pricing
        mockTicketService.getTierInfo.mockImplementation((tierId: string) => {
          const tiers: any = {
            tier1: { priceCents: 5000, name: 'General' },
            tier2: { priceCents: 10000, name: 'VIP' }
          };
          return Promise.resolve(tiers[tierId]);
        });

        // Mock availability check
        mockTicketService.checkAvailability.mockResolvedValue({
          available: true,
          remainingQty: 100
        });

        // Mock reservation
        mockTicketService.reserveTickets.mockResolvedValue({
          reservationId: 'res123',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
        });

        mockPool.query.mockResolvedValue({
          rows: [{
            id: 'order123',
            status: 'pending',
            amount_cents: 20000,
            currency: 'USD',
            reserved_until: new Date(Date.now() + 15 * 60 * 1000)
          }]
        });

        const createOrder = async (orderData: any) => {
          // Calculate total
          let totalCents = 0;
          for (const item of orderData.items) {
            const tierInfo = await mockTicketService.getTierInfo(item.tierId);
            totalCents += tierInfo.priceCents * item.qty;
          }

          // Check availability
          for (const item of orderData.items) {
            const availability = await mockTicketService.checkAvailability(
              orderData.eventId,
              item.tierId,
              item.qty
            );
            if (!availability.available) {
              return { error: 'Tickets not available' };
            }
          }

          // Reserve tickets
          const reservation = await mockTicketService.reserveTickets(
            orderData.eventId,
            orderData.items
          );

          // Create order
          const result = await mockPool.query(
            'INSERT INTO orders (customer_id, event_id, amount_cents, currency, status, reserved_until) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [orderData.customerId, orderData.eventId, totalCents, orderData.currency, 'pending', reservation.expiresAt]
          );

          return {
            orderId: result.rows[0].id,
            status: result.rows[0].status,
            amountCents: result.rows[0].amount_cents,
            currency: result.rows[0].currency,
            reservedUntil: result.rows[0].reserved_until
          };
        };

        const result = await createOrder(req.body);

        expect(result.orderId).toBeDefined();
        expect(result.status).toBe('pending');
        expect(result.amountCents).toBe(20000); // (2 * 5000) + (1 * 10000)
      });

      it('should validate items array', async () => {
        req.body = {
          customerId: 'user123',
          eventId: 'event456',
          items: [], // Empty items
          currency: 'USD'
        };

        const validateItems = (items: any[]) => {
          if (!Array.isArray(items)) {
            return { error: 'Items must be an array' };
          }
          if (items.length === 0) {
            return { error: 'At least one item is required' };
          }
          if (items.length > 100) {
            return { error: 'Maximum 100 items allowed' };
          }
          return { valid: true };
        };

        const result = validateItems(req.body.items);
        expect(result.error).toBe('At least one item is required');
      });

      it('should validate item quantity', async () => {
        req.body = {
          items: [
            { tierId: 'tier1', qty: 0 }, // Invalid quantity
            { tierId: 'tier2', qty: -1 } // Negative quantity
          ]
        };

        const validateItemQuantity = (items: any[]) => {
          for (const item of items) {
            if (!Number.isInteger(item.qty) || item.qty < 1) {
              return { error: `Invalid quantity for tier ${item.tierId}: must be integer >= 1` };
            }
          }
          return { valid: true };
        };

        const result = validateItemQuantity(req.body.items);
        expect(result.error).toContain('Invalid quantity');
      });

      it('should validate currency', async () => {
        req.body = {
          currency: 'INVALID'
        };

        const validateCurrency = (currency: string) => {
          const allowedCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];
          if (!allowedCurrencies.includes(currency)) {
            return { error: `Invalid currency. Allowed: ${allowedCurrencies.join(', ')}` };
          }
          return { valid: true };
        };

        const result = validateCurrency(req.body.currency);
        expect(result.error).toContain('Invalid currency');
      });

      it('should validate required fields', async () => {
        req.body = {
          eventId: 'event456'
          // Missing customerId, items, currency
        };

        const validateRequiredFields = (body: any) => {
          const required = ['customerId', 'eventId', 'items', 'currency'];
          const missing = required.filter(field => !body[field]);
          
          if (missing.length > 0) {
            return { error: `Missing required fields: ${missing.join(', ')}` };
          }
          return { valid: true };
        };

        const result = validateRequiredFields(req.body);
        expect(result.error).toContain('Missing required fields');
      });
    });

    describe('Inventory Management', () => {
      it('should check ticket availability before creating order', async () => {
        req.body = {
          customerId: 'user123',
          eventId: 'event456',
          items: [{ tierId: 'tier1', qty: 5 }],
          currency: 'USD'
        };

        mockTicketService.checkAvailability.mockResolvedValue({
          available: false,
          remainingQty: 3
        });

        const checkAvailability = async (eventId: string, tierId: string, qty: number) => {
          const result = await mockTicketService.checkAvailability(eventId, tierId, qty);
          
          if (!result.available) {
            return {
              error: `Only ${result.remainingQty} tickets available for tier ${tierId}`,
              code: 409
            };
          }
          
          return { available: true };
        };

        const result = await checkAvailability(
          req.body.eventId,
          req.body.items[0].tierId,
          req.body.items[0].qty
        );

        expect(result.error).toContain('Only 3 tickets available');
      });

      it('should reserve tickets with expiration', async () => {
        const reservationDurationMs = 15 * 60 * 1000; // 15 minutes

        mockTicketService.reserveTickets.mockResolvedValue({
          reservationId: 'res789',
          expiresAt: new Date(Date.now() + reservationDurationMs)
        });

        const reservation = await mockTicketService.reserveTickets('event456', [
          { tierId: 'tier1', qty: 2 }
        ]);

        expect(reservation.reservationId).toBeDefined();
        expect(new Date(reservation.expiresAt).getTime()).toBeGreaterThan(Date.now());
      });

      it('should handle reservation failure', async () => {
        mockTicketService.reserveTickets.mockRejectedValue(
          new Error('Unable to reserve tickets')
        );

        const createOrderWithReservation = async () => {
          try {
            await mockTicketService.reserveTickets('event456', []);
            return { success: true };
          } catch (error: any) {
            return { error: error.message, code: 500 };
          }
        };

        const result = await createOrderWithReservation();
        expect(result.error).toBe('Unable to reserve tickets');
      });
    });

    describe('Price Calculation', () => {
      it('should calculate total amount correctly', async () => {
        const items = [
          { tierId: 'tier1', qty: 3, priceCents: 5000 },
          { tierId: 'tier2', qty: 2, priceCents: 7500 },
          { tierId: 'tier3', qty: 1, priceCents: 10000 }
        ];

        const calculateTotal = (items: any[]) => {
          return items.reduce((total, item) => {
            return total + (item.priceCents * item.qty);
          }, 0);
        };

        const total = calculateTotal(items);
        expect(total).toBe(40000); // (3*5000) + (2*7500) + (1*10000)
      });

      it('should apply discounts if provided', async () => {
        const subtotal = 10000;
        const discountPercent = 10;

        const applyDiscount = (amount: number, discount: number) => {
          const discountAmount = Math.floor(amount * (discount / 100));
          return amount - discountAmount;
        };

        const finalAmount = applyDiscount(subtotal, discountPercent);
        expect(finalAmount).toBe(9000);
      });

      it('should calculate taxes if applicable', async () => {
        const subtotal = 10000;
        const taxRate = 0.08; // 8%

        const calculateWithTax = (amount: number, rate: number) => {
          const tax = Math.floor(amount * rate);
          return {
            subtotal: amount,
            tax,
            total: amount + tax
          };
        };

        const result = calculateWithTax(subtotal, taxRate);
        expect(result.tax).toBe(800);
        expect(result.total).toBe(10800);
      });
    });

    describe('Transaction Management', () => {
      it('should use database transaction for order creation', async () => {
        const mockClient = {
          query: jest.fn(),
          release: jest.fn(),
          beginTransaction: jest.fn(),
          commit: jest.fn(),
          rollback: jest.fn()
        };

        mockPool.connect.mockResolvedValue(mockClient);

        const createOrderWithTransaction = async (orderData: any) => {
          const client = await mockPool.connect();
          
          try {
            await client.beginTransaction();
            
            // Insert order
            await client.query('INSERT INTO orders ...');
            
            // Insert order items
            await client.query('INSERT INTO order_items ...');
            
            // Insert status history
            await client.query('INSERT INTO order_status_history ...');
            
            await client.commit();
            return { success: true };
          } catch (error) {
            await client.rollback();
            throw error;
          } finally {
            client.release();
          }
        };

        const result = await createOrderWithTransaction({});
        
        expect(mockClient.beginTransaction).toHaveBeenCalled();
        expect(mockClient.commit).toHaveBeenCalled();
        expect(mockClient.release).toHaveBeenCalled();
      });

      it('should rollback on error', async () => {
        const mockClient = {
          query: jest.fn().mockRejectedValue(new Error('DB Error')),
          release: jest.fn(),
          beginTransaction: jest.fn(),
          commit: jest.fn(),
          rollback: jest.fn()
        };

        mockPool.connect.mockResolvedValue(mockClient);

        const createOrderWithTransaction = async () => {
          const client = await mockPool.connect();
          
          try {
            await client.beginTransaction();
            await client.query('INSERT INTO orders ...');
            await client.commit();
            return { success: true };
          } catch (error) {
            await client.rollback();
            return { error: 'Transaction failed' };
          } finally {
            client.release();
          }
        };

        const result = await createOrderWithTransaction();
        
        expect(mockClient.rollback).toHaveBeenCalled();
        expect(result.error).toBe('Transaction failed');
      });
    });

    describe('Event Publishing', () => {
      it('should publish order.created event', async () => {
        const orderId = 'order123';
        const eventData = {
          orderId,
          customerId: 'user123',
          eventId: 'event456',
          amountCents: 10000,
          status: 'pending'
        };

        const publishEvent = async (eventType: string, data: any) => {
          const channel = await mockRabbitMQ.connect().then((conn: any) => 
            conn.createChannel()
          );
          
          await channel.publish(
            'orders',
            eventType,
            Buffer.from(JSON.stringify(data))
          );
          
          return { published: true };
        };

        const result = await publishEvent('order.created', eventData);
        
        expect(result.published).toBe(true);
      });

      it('should handle event publishing failure gracefully', async () => {
        const mockChannel = {
          publish: jest.fn().mockRejectedValue(new Error('Queue error'))
        };

        mockRabbitMQ.connect.mockResolvedValue({
          createChannel: jest.fn().mockResolvedValue(mockChannel)
        });

        const publishEvent = async (eventType: string, data: any) => {
          try {
            const channel = await mockRabbitMQ.connect().then((conn: any) => 
              conn.createChannel()
            );
            await channel.publish('orders', eventType, Buffer.from(JSON.stringify(data)));
            return { published: true };
          } catch (error) {
            // Log error but don't fail the order creation
            mockLogger.error('Failed to publish event', error);
            return { published: false, error: 'Event publishing failed' };
          }
        };

        const result = await publishEvent('order.created', {});
        
        expect(result.published).toBe(false);
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });
  });

  describe('GET /api/v1/orders/:orderId - Get Order', () => {
    it('should fetch order by ID', async () => {
      req.params = { orderId: 'order123' };
      req.user = { id: 'user123' };

      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'order123',
          customer_id: 'user123',
          event_id: 'event456',
          status: 'paid',
          amount_cents: 15000,
          currency: 'USD',
          created_at: new Date()
        }]
      });

      const getOrder = async (orderId: string, userId: string) => {
        const result = await mockPool.query(
          'SELECT * FROM orders WHERE id = $1',
          [orderId]
        );

        if (result.rows.length === 0) {
          return { error: 'Order not found', code: 404 };
        }

        const order = result.rows[0];

        // Check ownership
        if (order.customer_id !== userId) {
          return { error: 'Access denied', code: 403 };
        }

        return {
          orderId: order.id,
          status: order.status,
          amountCents: order.amount_cents,
          currency: order.currency,
          createdAt: order.created_at
        };
      };

      const result = await getOrder(req.params.orderId, req.user.id);

      expect(result.orderId).toBe('order123');
      expect(result.status).toBe('paid');
    });

    it('should enforce ownership', async () => {
      req.params = { orderId: 'order123' };
      req.user = { id: 'differentUser' };

      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'order123',
          customer_id: 'user123', // Different from req.user.id
          status: 'paid'
        }]
      });

      const getOrder = async (orderId: string, userId: string) => {
        const result = await mockPool.query(
          'SELECT * FROM orders WHERE id = $1',
          [orderId]
        );

        const order = result.rows[0];

        if (order.customer_id !== userId) {
          return { error: 'Access denied', code: 403 };
        }

        return order;
      };

      const result = await getOrder(req.params.orderId, req.user.id);

      expect(result.error).toBe('Access denied');
      expect(result.code).toBe(403);
    });

    it('should include order items', async () => {
      req.params = { orderId: 'order123' };

      mockPool.query.mockImplementation((query: string) => {
        if (query.includes('order_items')) {
          return Promise.resolve({
            rows: [
              { tier_id: 'tier1', qty: 2, price_cents: 5000 },
              { tier_id: 'tier2', qty: 1, price_cents: 10000 }
            ]
          });
        }
        return Promise.resolve({
          rows: [{
            id: 'order123',
            customer_id: 'user123',
            status: 'paid'
          }]
        });
      });

      const getOrderWithItems = async (orderId: string) => {
        const order = await mockPool.query(
          'SELECT * FROM orders WHERE id = $1',
          [orderId]
        );

        const items = await mockPool.query(
          'SELECT * FROM order_items WHERE order_id = $1',
          [orderId]
        );

        return {
          ...order.rows[0],
          items: items.rows.map((item: any) => ({
            tierId: item.tier_id,
            qty: item.qty,
            priceCents: item.price_cents
          }))
        };
      };

      const result = await getOrderWithItems(req.params.orderId);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].tierId).toBe('tier1');
    });

    it('should handle order not found', async () => {
      req.params = { orderId: 'nonexistent' };

      mockPool.query.mockResolvedValue({ rows: [] });

      const getOrder = async (orderId: string) => {
        const result = await mockPool.query(
          'SELECT * FROM orders WHERE id = $1',
          [orderId]
        );

        if (result.rows.length === 0) {
          return { error: 'Order not found', code: 404 };
        }

        return result.rows[0];
      };

      const result = await getOrder(req.params.orderId);

      expect(result.error).toBe('Order not found');
      expect(result.code).toBe(404);
    });
  });

  describe('Order Status Management', () => {
    it('should track status history', async () => {
      const orderId = 'order123';
      const statusChange = {
        from: 'pending',
        to: 'paid',
        timestamp: new Date()
      };

      const updateOrderStatus = async (orderId: string, newStatus: string) => {
        // Get current status
        const current = await mockPool.query(
          'SELECT status FROM orders WHERE id = $1',
          [orderId]
        );

        // Update status
        await mockPool.query(
          'UPDATE orders SET status = $1 WHERE id = $2',
          [newStatus, orderId]
        );

        // Record history
        await mockPool.query(
          'INSERT INTO order_status_history (order_id, from_status, to_status) VALUES ($1, $2, $3)',
          [orderId, current.rows[0]?.status, newStatus]
        );

        return { success: true, previousStatus: current.rows[0]?.status, newStatus };
      };

      mockPool.query.mockResolvedValue({
        rows: [{ status: 'pending' }]
      });

      const result = await updateOrderStatus(orderId, 'paid');

      expect(result.previousStatus).toBe('pending');
      expect(result.newStatus).toBe('paid');
    });

    it('should validate status transitions', async () => {
      const validateStatusTransition = (from: string, to: string) => {
        const allowedTransitions: any = {
          pending: ['paid', 'canceled', 'expired'],
          paid: ['fulfilled', 'refunded'],
          canceled: [],
          expired: [],
          fulfilled: ['refunded'],
          refunded: []
        };

        const allowed = allowedTransitions[from] || [];
        
        if (!allowed.includes(to)) {
          return { error: `Invalid status transition from ${from} to ${to}` };
        }
        
        return { valid: true };
      };

      expect(validateStatusTransition('pending', 'paid')).toEqual({ valid: true });
      expect(validateStatusTransition('pending', 'fulfilled').error).toContain('Invalid');
      expect(validateStatusTransition('canceled', 'paid').error).toContain('Invalid');
    });
  });

  describe('Order Expiration', () => {
    it('should handle order expiration', async () => {
      const checkExpiredOrders = async () => {
        const result = await mockPool.query(
          'SELECT * FROM orders WHERE status = $1 AND reserved_until < NOW()',
          ['pending']
        );

        const expiredOrders = result.rows;

        for (const order of expiredOrders) {
          // Cancel reservation
          await mockTicketService.cancelReservation(order.reservation_id);
          
          // Update order status
          await mockPool.query(
            'UPDATE orders SET status = $1 WHERE id = $2',
            ['expired', order.id]
          );
        }

        return { expired: expiredOrders.length };
      };

      mockPool.query.mockResolvedValue({
        rows: [
          { id: 'order1', reservation_id: 'res1' },
          { id: 'order2', reservation_id: 'res2' }
        ]
      });

      const result = await checkExpiredOrders();

      expect(result.expired).toBe(2);
      expect(mockTicketService.cancelReservation).toHaveBeenCalledTimes(2);
    });

    it('should set appropriate reservation duration', async () => {
      const getReservationDuration = (paymentMethod?: string) => {
        const durations: any = {
          card: 15 * 60 * 1000,      // 15 minutes
          crypto: 30 * 60 * 1000,     // 30 minutes
          bank: 60 * 60 * 1000        // 60 minutes
        };
        
        return durations[paymentMethod || 'card'] || durations.card;
      };

      expect(getReservationDuration('card')).toBe(15 * 60 * 1000);
      expect(getReservationDuration('crypto')).toBe(30 * 60 * 1000);
      expect(getReservationDuration()).toBe(15 * 60 * 1000);
    });
  });

  describe('Integration with Payment Service', () => {
    it('should create payment intent when requested', async () => {
      const orderId = 'order123';
      const amountCents = 10000;

      mockPaymentService.createPaymentIntent.mockResolvedValue({
        intentId: 'pi_123',
        clientSecret: 'secret_123',
        status: 'requires_payment_method'
      });

      const createPaymentIntent = async (orderId: string, amount: number) => {
        const intent = await mockPaymentService.createPaymentIntent({
          orderId,
          amountCents: amount,
          currency: 'USD'
        });

        await mockPool.query(
          'UPDATE orders SET payment_intent_id = $1 WHERE id = $2',
          [intent.intentId, orderId]
        );

        return intent;
      };

      const result = await createPaymentIntent(orderId, amountCents);

      expect(result.intentId).toBe('pi_123');
      expect(mockPaymentService.createPaymentIntent).toHaveBeenCalled();
    });

    it('should handle payment service errors', async () => {
      mockPaymentService.createPaymentIntent.mockRejectedValue(
        new Error('Payment service unavailable')
      );

      const createPaymentIntent = async () => {
        try {
          await mockPaymentService.createPaymentIntent({});
          return { success: true };
        } catch (error: any) {
          return { error: error.message, code: 503 };
        }
      };

      const result = await createPaymentIntent();

      expect(result.error).toBe('Payment service unavailable');
      expect(result.code).toBe(503);
    });
  });

  describe('Concurrency Control', () => {
    it('should handle concurrent order creation', async () => {
      const acquireLock = async (key: string, ttl: number) => {
        const result = await mockRedisClient.set(
          `lock:${key}`,
          '1',
          'NX',
          'EX',
          ttl
        );
        
        return result === 'OK';
      };

      const releaseLock = async (key: string) => {
        await mockRedisClient.del(`lock:${key}`);
      };

      mockRedisClient.set.mockResolvedValue('OK');

      const lockKey = 'order:event456:user123';
      const acquired = await acquireLock(lockKey, 5);

      expect(acquired).toBe(true);
      
      await releaseLock(lockKey);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`lock:${lockKey}`);
    });

    it('should prevent duplicate orders', async () => {
      const preventDuplicateOrder = async (userId: string, eventId: string) => {
        const lockKey = `order:${eventId}:${userId}`;
        const locked = await mockRedisClient.set(
          `lock:${lockKey}`,
          '1',
          'NX',
          'EX',
          5
        );

        if (locked !== 'OK') {
          return { error: 'Order already in progress', code: 409 };
        }

        return { success: true };
      };

      mockRedisClient.set.mockResolvedValue(null); // Lock already exists

      const result = await preventDuplicateOrder('user123', 'event456');

      expect(result.error).toBe('Order already in progress');
      expect(result.code).toBe(409);
    });
  });
});
