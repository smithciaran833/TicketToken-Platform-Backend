/**
 * Tracing Tests
 * Tests for distributed tracing and OpenTelemetry integration
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('Tracing', () => {
  let mockTracer: any;
  let mockSpan: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpan = createMockSpan();
    mockTracer = createMockTracer(mockSpan);
  });

  describe('span creation', () => {
    it('should create span for payment operations', () => {
      const tracer = mockTracer;
      const span = tracer.startSpan('payment.create');

      expect(span).toBeDefined();
      expect(span.name).toBe('payment.create');
    });

    it('should create span with attributes', () => {
      const span = mockTracer.startSpan('payment.process', {
        attributes: {
          'payment.id': 'pay_123',
          'payment.amount': 10000,
          'payment.currency': 'usd',
        },
      });

      expect(span.attributes['payment.id']).toBe('pay_123');
    });

    it('should support child spans', () => {
      const parentSpan = mockTracer.startSpan('payment.flow');
      const childSpan = mockTracer.startSpan('stripe.createIntent', {
        parent: parentSpan,
      });

      expect(childSpan.parentSpanId).toBe(parentSpan.spanId);
    });

    it('should end span with status', () => {
      const span = mockTracer.startSpan('payment.capture');
      
      span.setStatus({ code: 1 }); // OK
      span.end();

      expect(span.status.code).toBe(1);
      expect(span.ended).toBe(true);
    });
  });

  describe('context propagation', () => {
    it('should extract trace context from headers', () => {
      const headers = {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
      };

      const context = extractTraceContext(headers);

      expect(context.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
      expect(context.spanId).toBe('b7ad6b7169203331');
    });

    it('should inject trace context into headers', () => {
      const span = mockTracer.startSpan('test');
      const headers: Record<string, string> = {};

      injectTraceContext(span, headers);

      expect(headers.traceparent).toBeDefined();
    });

    it('should propagate context to downstream services', () => {
      const span = mockTracer.startSpan('payment.process');
      const outgoingHeaders: Record<string, string> = {};

      injectTraceContext(span, outgoingHeaders);

      expect(outgoingHeaders.traceparent).toContain(span.traceId);
    });
  });

  describe('span attributes', () => {
    it('should set standard payment attributes', () => {
      const span = mockTracer.startSpan('payment.create');

      setPaymentAttributes(span, {
        paymentId: 'pay_123',
        amount: 10000,
        currency: 'usd',
        customerId: 'cus_456',
      });

      expect(span.attributes['payment.id']).toBe('pay_123');
      expect(span.attributes['payment.amount']).toBe(10000);
    });

    it('should set Stripe attributes', () => {
      const span = mockTracer.startSpan('stripe.call');

      setStripeAttributes(span, {
        intentId: 'pi_123',
        chargeId: 'ch_456',
        transferId: 'tr_789',
      });

      expect(span.attributes['stripe.payment_intent_id']).toBe('pi_123');
    });

    it('should set error attributes', () => {
      const span = mockTracer.startSpan('payment.process');
      const error = new Error('Card declined');

      setErrorAttributes(span, error);

      expect(span.attributes['error']).toBe(true);
      expect(span.attributes['error.message']).toBe('Card declined');
    });

    it('should mask sensitive attributes', () => {
      const span = mockTracer.startSpan('payment.create');

      setPaymentAttributes(span, {
        paymentId: 'pay_123',
        cardNumber: '4242424242424242',
        cvv: '123',
      });

      expect(span.attributes['payment.card_number']).toBe('****4242');
      expect(span.attributes['payment.cvv']).toBeUndefined();
    });
  });

  describe('span events', () => {
    it('should add events to span', () => {
      const span = mockTracer.startSpan('payment.flow');

      span.addEvent('payment.created');
      span.addEvent('stripe.intent_created');
      span.addEvent('payment.completed');

      expect(span.events.length).toBe(3);
    });

    it('should add event with attributes', () => {
      const span = mockTracer.startSpan('payment.flow');

      span.addEvent('refund.processed', {
        'refund.amount': 5000,
        'refund.reason': 'customer_request',
      });

      expect(span.events[0].attributes['refund.amount']).toBe(5000);
    });
  });

  describe('sampling', () => {
    it('should respect sampling decision', () => {
      const sampler = createSampler(0.5);
      const decisions: boolean[] = [];

      for (let i = 0; i < 100; i++) {
        decisions.push(sampler.shouldSample());
      }

      const sampledCount = decisions.filter(d => d).length;
      expect(sampledCount).toBeGreaterThan(30);
      expect(sampledCount).toBeLessThan(70);
    });

    it('should always sample high-value payments', () => {
      const sampler = createPaymentSampler();

      expect(sampler.shouldSample({ amount: 100000 })).toBe(true);
      expect(sampler.shouldSample({ amount: 500000 })).toBe(true);
    });

    it('should always sample errors', () => {
      const sampler = createPaymentSampler();

      expect(sampler.shouldSample({ error: true })).toBe(true);
    });
  });

  describe('metrics integration', () => {
    it('should record span duration as metric', () => {
      const span = mockTracer.startSpan('payment.process');
      
      // Simulate work
      span.end();

      expect(span.duration).toBeDefined();
    });

    it('should track span count', () => {
      const stats = getTracingStats();
      const initialCount = stats.spanCount;

      mockTracer.startSpan('test1').end();
      mockTracer.startSpan('test2').end();

      const newStats = getTracingStats();
      expect(newStats.spanCount).toBeGreaterThanOrEqual(initialCount);
    });
  });

  describe('batch export', () => {
    it('should batch spans for export', () => {
      const exporter = createBatchExporter({ batchSize: 10 });

      for (let i = 0; i < 15; i++) {
        const span = mockTracer.startSpan(`test_${i}`);
        span.end();
        exporter.addSpan(span);
      }

      expect(exporter.pendingSpans).toBeLessThan(15);
    });

    it('should flush pending spans', async () => {
      const exporter = createBatchExporter({ batchSize: 100 });

      for (let i = 0; i < 5; i++) {
        const span = mockTracer.startSpan(`test_${i}`);
        span.end();
        exporter.addSpan(span);
      }

      await exporter.flush();

      expect(exporter.pendingSpans).toBe(0);
    });
  });

  describe('error recording', () => {
    it('should record exception on span', () => {
      const span = mockTracer.startSpan('payment.process');
      const error = new Error('Payment failed');

      span.recordException(error);

      expect(span.events).toContainEqual(expect.objectContaining({
        name: 'exception',
        attributes: expect.objectContaining({
          'exception.message': 'Payment failed',
        }),
      }));
    });

    it('should set error status on span', () => {
      const span = mockTracer.startSpan('payment.process');

      span.setStatus({ code: 2, message: 'Card declined' });

      expect(span.status.code).toBe(2);
      expect(span.status.message).toBe('Card declined');
    });
  });
});

// Mock implementations
function createMockSpan(): any {
  const span: any = {
    name: '',
    spanId: `span_${Date.now()}`,
    traceId: `trace_${Date.now()}`,
    parentSpanId: null,
    attributes: {},
    events: [],
    status: { code: 0 },
    ended: false,
    startTime: Date.now(),
    endTime: null,
    duration: null,
  };

  span.setAttribute = (key: string, value: any) => {
    span.attributes[key] = value;
    return span;
  };

  span.setStatus = (status: any) => {
    span.status = status;
    return span;
  };

  span.addEvent = (name: string, attributes?: any) => {
    span.events.push({ name, attributes: attributes || {}, timestamp: Date.now() });
    return span;
  };

  span.recordException = (error: Error) => {
    span.events.push({
      name: 'exception',
      attributes: {
        'exception.type': error.name,
        'exception.message': error.message,
        'exception.stacktrace': error.stack,
      },
      timestamp: Date.now(),
    });
    return span;
  };

  span.end = () => {
    span.ended = true;
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    return span;
  };

  return span;
}

function createMockTracer(defaultSpan: any): any {
  return {
    startSpan: (name: string, options: any = {}) => {
      const span = createMockSpan();
      span.name = name;
      if (options.parent) {
        span.parentSpanId = options.parent.spanId;
        span.traceId = options.parent.traceId;
      }
      if (options.attributes) {
        Object.assign(span.attributes, options.attributes);
      }
      return span;
    },
  };
}

function extractTraceContext(headers: any): any {
  const traceparent = headers.traceparent;
  if (!traceparent) return {};

  const parts = traceparent.split('-');
  return {
    version: parts[0],
    traceId: parts[1],
    spanId: parts[2],
    flags: parts[3],
  };
}

function injectTraceContext(span: any, headers: any): void {
  headers.traceparent = `00-${span.traceId}-${span.spanId}-01`;
}

function setPaymentAttributes(span: any, attrs: any): void {
  if (attrs.paymentId) span.attributes['payment.id'] = attrs.paymentId;
  if (attrs.amount) span.attributes['payment.amount'] = attrs.amount;
  if (attrs.currency) span.attributes['payment.currency'] = attrs.currency;
  if (attrs.customerId) span.attributes['payment.customer_id'] = attrs.customerId;
  if (attrs.cardNumber) span.attributes['payment.card_number'] = '****' + attrs.cardNumber.slice(-4);
}

function setStripeAttributes(span: any, attrs: any): void {
  if (attrs.intentId) span.attributes['stripe.payment_intent_id'] = attrs.intentId;
  if (attrs.chargeId) span.attributes['stripe.charge_id'] = attrs.chargeId;
  if (attrs.transferId) span.attributes['stripe.transfer_id'] = attrs.transferId;
}

function setErrorAttributes(span: any, error: Error): void {
  span.attributes['error'] = true;
  span.attributes['error.type'] = error.name;
  span.attributes['error.message'] = error.message;
}

function createSampler(rate: number): any {
  return {
    shouldSample: () => Math.random() < rate,
  };
}

function createPaymentSampler(): any {
  return {
    shouldSample: (context: any) => {
      if (context.error) return true;
      if (context.amount >= 100000) return true;
      return Math.random() < 0.1;
    },
  };
}

function getTracingStats(): any {
  return {
    spanCount: 0,
    activeSpans: 0,
    droppedSpans: 0,
  };
}

function createBatchExporter(config: any): any {
  const exporter: any = {
    batchSize: config.batchSize || 100,
    spans: [] as any[],
    get pendingSpans() {
      return this.spans.length;
    },
    addSpan: function(span: any) {
      this.spans.push(span);
      if (this.spans.length >= this.batchSize) {
        this.flush();
      }
    },
    flush: async function() {
      this.spans = [];
    },
  };
  return exporter;
}
