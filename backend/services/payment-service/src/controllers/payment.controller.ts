import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { PaymentProcessorService, FeeCalculatorService } from '../services/core';
import { NFTQueueService, GasEstimatorService } from '../services/blockchain';
import { ScalperDetectorService, VelocityCheckerService } from '../services/fraud';
import { WaitingRoomService, BotDetectorService } from '../services/high-demand';
import { PaymentRequest, FraudDecision } from '../types';
import Stripe from 'stripe';
import { config } from '../config';
import { db } from '../config/database';

export class PaymentController {
  private paymentProcessor: PaymentProcessorService;
  private feeCalculator: FeeCalculatorService;
  private nftQueue: NFTQueueService;
  private gasEstimator: GasEstimatorService;
  private scalperDetector: ScalperDetectorService;
  private velocityChecker: VelocityCheckerService;
  private waitingRoom: WaitingRoomService;
  private botDetector: BotDetectorService;
  private stripe: Stripe;
  private log = logger.child({ component: 'PaymentController' });

  constructor() {
    // Initialize Stripe
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16'
    });

    // Pass stripe and db to PaymentProcessorService
    this.paymentProcessor = new PaymentProcessorService(this.stripe, db);
    this.feeCalculator = new FeeCalculatorService();
    this.nftQueue = new NFTQueueService();
    this.gasEstimator = new GasEstimatorService();
    this.scalperDetector = new ScalperDetectorService();
    this.velocityChecker = new VelocityCheckerService();
    this.waitingRoom = new WaitingRoomService();
    this.botDetector = new BotDetectorService();
  }

  async processPayment(request: FastifyRequest, reply: FastifyReply) {
    this.log.info("Processing payment request");

    const paymentRequest: PaymentRequest = request.body as PaymentRequest;
    const user = (request as any).user;

    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const userId = user.id;
    const sessionId = request.id; // Fastify request ID

    // 1. Check waiting room status
    this.log.info('Checking waiting room status', { eventId: paymentRequest.eventId });

    const queueStats = await this.waitingRoom.getQueueStats(paymentRequest.eventId);
    const hasActiveWaitingRoom = queueStats.totalInQueue > 0 || queueStats.activeUsers > 0;

    if (hasActiveWaitingRoom) {
      const accessToken = request.headers['x-access-token'] as string;

      if (!accessToken) {
        return reply.status(403).send({
          error: 'This is a high-demand event. Queue token required.',
          code: 'QUEUE_TOKEN_REQUIRED',
          waitingRoomActive: true
        });
      }

      const tokenValid = await this.waitingRoom.validateAccessToken(accessToken);

      if (!tokenValid.valid) {
        return reply.status(403).send({
          error: 'Invalid or expired queue token',
          code: 'INVALID_ACCESS_TOKEN'
        });
      }

      if (tokenValid.eventId !== paymentRequest.eventId) {
        return reply.status(403).send({
          error: 'Queue token is for a different event',
          code: 'TOKEN_EVENT_MISMATCH'
        });
      }
    }

    // 2. Bot detection
    this.log.info('Starting bot detection', { userId, sessionId });
    const botCheck = await this.botDetector.detectBot({
      userId,
      sessionId,
      userAgent: request.headers['user-agent'] || '',
      actions: (paymentRequest as any).sessionData?.actions || [],
      browserFeatures: (paymentRequest as any).sessionData?.browserFeatures || {}
    });

    if (botCheck.isBot) {
      return reply.status(403).send({
        error: 'Automated behavior detected',
        code: 'BOT_DETECTED',
        recommendation: botCheck.recommendation
      });
    }

    // 3. Fraud checks
    this.log.info('Starting fraud checks', { userId });
    const fraudCheck = await this.scalperDetector.detectScalper(
      userId,
      {
        ipAddress: request.ip || '',
        ...paymentRequest
      },
      (paymentRequest as any).deviceFingerprint
    );

    if (fraudCheck.decision === FraudDecision.DECLINE) {
      return reply.status(403).send({
        error: 'Payment declined due to security reasons',
        code: 'FRAUD_DETECTED',
        decision: fraudCheck.decision
      });
    }

    // 4. Velocity checks
    this.log.info('Starting velocity checks', { userId, eventId: paymentRequest.eventId });
    const velocityCheck = await this.velocityChecker.checkVelocity(
      userId,
      paymentRequest.eventId,
      request.ip || '',
      paymentRequest.paymentMethod.token || 'unknown'
    );

    if (!velocityCheck.allowed) {
      return reply.status(429).send({
        error: velocityCheck.reason,
        code: 'RATE_LIMIT_EXCEEDED',
        limits: velocityCheck.limits
      });
    }

    // 5. Calculate fees
    this.log.info('Calculating fees');
    const totalAmount = paymentRequest.tickets.reduce(
      (sum, t) => sum + (t.price * t.quantity),
      0
    );
    const ticketCount = paymentRequest.tickets.reduce(
      (sum, t) => sum + t.quantity,
      0
    );

    const fees = await this.feeCalculator.calculateDynamicFees(
      paymentRequest.venueId,
      totalAmount,
      ticketCount
    );

    // 6. Process payment - FIX: Match the expected interface
    // Create a mock order ID (in production, this would come from order-service)
    const orderId = `order_${Date.now()}`;
    const amountCents = Math.round(totalAmount * 100); // Convert to cents

    this.log.info('Processing payment', { amountCents, userId });

    const transaction = await this.paymentProcessor.processPayment({
      userId,
      orderId,
      amountCents,
      currency: 'USD',
      idempotencyKey: request.headers['idempotency-key'] as string || `${userId}_${Date.now()}`,
      tenantId: (user as any).tenantId
    });

    // 7. Queue NFT minting
    if (transaction.status === 'completed' || transaction.status === 'succeeded') {
      const mintJobId = await this.nftQueue.queueMinting({
        paymentId: transaction.transactionId,
        ticketIds: paymentRequest.tickets.map(t => t.ticketTypeId),
        venueId: paymentRequest.venueId,
        eventId: paymentRequest.eventId,
        blockchain: 'solana',
        priority: 'standard'
      });

      (transaction as any).metadata = { mintJobId };
    }

    // 8. Record velocity
    await this.velocityChecker.recordPurchase(
      userId,
      paymentRequest.eventId,
      request.ip || '',
      paymentRequest.paymentMethod.token || 'unknown'
    );

    return reply.status(200).send({
      success: true,
      transaction,
      fees: fees.breakdown,
      nftStatus: (transaction as any).metadata?.mintJobId ? 'queued' : 'pending'
    });
  }

  async calculateFees(request: FastifyRequest, reply: FastifyReply) {
    const { venueId, amount, ticketCount } = request.body as any;

    const fees = await this.feeCalculator.calculateDynamicFees(
      venueId,
      amount,
      ticketCount
    );

    const gasEstimates = await this.gasEstimator.getBestBlockchain(ticketCount);

    return reply.send({
      fees: fees.breakdown,
      gasEstimates: gasEstimates.estimates,
      recommendedBlockchain: gasEstimates.recommended,
      total: fees.total
    });
  }

  async getTransactionStatus(request: FastifyRequest, reply: FastifyReply) {
    const { transactionId } = request.params as any;
    const user = (request as any).user;

    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const transaction = { userId: user.id, metadata: {} as any }; // Temporary mock

    if (!transaction) {
      return reply.status(404).send({
        error: 'Transaction not found'
      });
    }

    if (transaction.userId !== user.id && !user.isAdmin) {
      return reply.status(403).send({
        error: 'Access denied'
      });
    }

    let nftStatus = null;
    if (transaction.metadata?.mintJobId) {
      nftStatus = await this.nftQueue.getJobStatus(transaction.metadata.mintJobId);
    }

    return reply.send({
      transaction,
      nftStatus
    });
  }

  async refundTransaction(request: FastifyRequest, reply: FastifyReply) {
    const { transactionId } = request.params as any;
    const { amount, reason } = request.body as any;

    const refund = {
      id: `refund_${transactionId}`,
      amount,
      reason,
      status: 'pending'
    };

    return reply.send({
      success: true,
      refund
    });
  }
}
