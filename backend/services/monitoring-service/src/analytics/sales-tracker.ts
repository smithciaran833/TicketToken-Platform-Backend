import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { pgPool } from '../utils/database';
import { kafkaProducer } from '../streaming/kafka-producer';
import { logger } from '../utils/logger';
import * as tf from '@tensorflow/tfjs-node';
import { EventEmitter } from 'events';
import { eventServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

interface SalesVelocity {
  eventId: string;
  ticketsSold: number;
  velocity: number; // tickets per minute
  accelerationRate: number;
  predictedSelloutTime?: Date;
  currentCapacity: number;
  remainingTickets: number;
}

/**
 * Helper to create request context for service calls
 * Sales tracker operates as a system service
 */
function createSystemContext(): RequestContext {
  return {
    tenantId: 'system',
    traceId: `sales-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

export class EventSalesTracker extends EventEmitter {
  private salesModel: tf.LayersModel | null = null;
  private velocityCache = new Map<string, SalesVelocity[]>();
  private influxClient: InfluxDB;
  private writeApi: any;
  private isInitialized = false;

  constructor() {
    super();
    this.influxClient = new InfluxDB({
      url: process.env.INFLUXDB_URL || 'http://influxdb:8086',
      token: process.env.INFLUXDB_TOKEN || 'admin-token',
    });
    this.writeApi = this.influxClient.getWriteApi('tickettoken', 'metrics');
    this.initializeModel().catch(err => {
      logger.warn('Sales tracker initialization deferred - required tables may not exist yet:', err.message);
    });
  }

  private async initializeModel() {
    try {
      // Build LSTM model for sales prediction
      this.salesModel = tf.sequential({
        layers: [
          tf.layers.lstm({
            units: 128,
            returnSequences: true,
            inputShape: [10, 5], // 10 time steps, 5 features
          }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.lstm({ units: 64, returnSequences: false }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({ units: 32, activation: 'relu' }),
          tf.layers.dense({ units: 1, activation: 'linear' }), // Predict minutes to sellout
        ],
      });

      this.salesModel.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError',
        metrics: ['mae'],
      });

      // Load historical data for training
      await this.trainModel();
      this.isInitialized = true;
      this.startTracking();
      logger.info('📈 Sales prediction model initialized');
    } catch (error: any) {
      logger.warn('Sales model initialization skipped:', error.message);
    }
  }

  /**
   * NOTE: This method queries ticket_transactions which is owned by payment-service.
   * This is an acceptable read-replica pattern for ML training as per Phase 5 plan.
   * A paymentServiceClient.getTransactionHistory() could be added for full refactoring.
   */
  private async trainModel() {
    try {
      const historicalData = await pgPool.query(`
        SELECT
          event_id,
          DATE_TRUNC('minute', created_at) as minute,
          SUM(quantity) as tickets_sold,
          AVG(amount) as avg_price,
          MAX(created_at) - MIN(created_at) as time_span
        FROM ticket_transactions
        WHERE created_at > NOW() - INTERVAL '30 days'
          AND transaction_type = 'purchase'
          AND status = 'completed'
        GROUP BY event_id, minute
        ORDER BY event_id, minute
      `);

      if (historicalData.rows.length > 100) {
        // Prepare training data
        const features: number[][][] = [];
        const labels: number[] = [];

        // Process data into sequences
        const eventGroups = this.groupByEvent(historicalData.rows);

        for (const [eventId, sales] of Object.entries(eventGroups)) {
          const sequences = this.createSequences(sales as any[]);
          features.push(...sequences.features);
          labels.push(...sequences.labels);
        }

        if (features.length > 0) {
          const xs = tf.tensor3d(features);
          const ys = tf.tensor1d(labels);

          await this.salesModel!.fit(xs, ys, {
            epochs: 50,
            batchSize: 32,
            validationSplit: 0.2,
            callbacks: {
              onEpochEnd: (epoch, logs) => {
                if (epoch % 10 === 0) {
                  logger.debug(`Sales model training - Epoch ${epoch}: loss = ${logs?.loss}`);
                }
              },
            },
          });

          xs.dispose();
          ys.dispose();
        }
      }
    } catch (error: any) {
      logger.warn('Sales model training skipped - tables may not exist yet:', error.message);
      throw error; // Re-throw to prevent initialization
    }
  }

  private groupByEvent(rows: any[]): Record<string, any[]> {
    return rows.reduce((acc, row) => {
      if (!acc[row.event_id]) acc[row.event_id] = [];
      acc[row.event_id].push(row);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private createSequences(sales: any[]) {
    const features: number[][][] = [];
    const labels: number[] = [];
    const sequenceLength = 10;

    for (let i = sequenceLength; i < sales.length; i++) {
      const sequence = sales.slice(i - sequenceLength, i).map(s => [
        s.tickets_sold,
        s.avg_price,
        i / sales.length, // Progress through sale
        new Date(s.minute).getHours(), // Hour of day
        new Date(s.minute).getDay(), // Day of week
      ]);

      features.push(sequence);

      // Label is time to sellout (in minutes)
      const remainingTickets = sales[sales.length - 1].tickets_sold - sales[i].tickets_sold;
      const currentVelocity = sales[i].tickets_sold / (i + 1);
      labels.push(remainingTickets / Math.max(currentVelocity, 0.1));
    }

    return { features, labels };
  }

  async trackSale(eventId: string, ticketData: any) {
    if (!this.isInitialized) {
      logger.warn('Sales tracker not initialized - skipping tracking');
      return null;
    }

    try {
      // Calculate current velocity
      const velocity = await this.calculateVelocity(eventId);

      // Predict sellout time
      const prediction = await this.predictSellout(eventId, velocity);

      // Stream to Kafka
      await kafkaProducer.sendMetric({
        metric_name: 'event.sales.velocity',
        value: velocity.velocity,
        tags: {
          event_id: eventId,
          remaining_tickets: velocity.remainingTickets,
          predicted_sellout: prediction?.toISOString(),
        },
      });

      // Store in InfluxDB
      const point = new Point('event_sales')
        .tag('event_id', eventId)
        .floatField('velocity', velocity.velocity)
        .floatField('acceleration', velocity.accelerationRate)
        .intField('tickets_sold', velocity.ticketsSold)
        .intField('remaining', velocity.remainingTickets)
        .timestamp(new Date());

      this.writeApi.writePoint(point);

      // Emit alerts for high velocity
      if (velocity.velocity > 10) { // More than 10 tickets per minute
        this.emit('high-velocity', {
          eventId,
          velocity: velocity.velocity,
          predictedSellout: prediction,
        });

        // Send alert to Kafka
        await kafkaProducer.sendAlert({
          title: `High Sales Velocity: ${eventId}`,
          severity: 'warning',
          message: `Selling ${velocity.velocity.toFixed(1)} tickets/min. Predicted sellout: ${prediction?.toLocaleString()}`,
          data: velocity,
        });
      }

      // Check if sellout is imminent
      if (prediction && prediction.getTime() - Date.now() < 3600000) { // Less than 1 hour
        this.emit('sellout-imminent', {
          eventId,
          predictedTime: prediction,
          remainingTickets: velocity.remainingTickets,
        });

        await kafkaProducer.sendAlert({
          title: `Sellout Imminent: ${eventId}`,
          severity: 'critical',
          message: `Event will sell out in ${Math.round((prediction.getTime() - Date.now()) / 60000)} minutes`,
          data: velocity,
        });
      }

      return { velocity, prediction };
    } catch (error) {
      logger.error('Error tracking sale:', error);
      return null;
    }
  }

  /**
   * NOTE: This method queries ticket_transactions and events for real-time velocity.
   * This is an acceptable read-replica pattern for monitoring as per Phase 5 plan.
   * The complex time-series aggregation is best handled at the database level.
   */
  private async calculateVelocity(eventId: string): Promise<SalesVelocity> {
    const result = await pgPool.query(`
      WITH sales_data AS (
        SELECT
          SUM(quantity) as total_sold,
          SUM(quantity) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute') as last_minute,
          SUM(quantity) FILTER (WHERE created_at > NOW() - INTERVAL '5 minutes') as last_5_minutes,
          SUM(quantity) FILTER (WHERE created_at > NOW() - INTERVAL '10 minutes') as last_10_minutes,
          MIN(created_at) as first_sale,
          MAX(created_at) as last_sale
        FROM ticket_transactions
        WHERE event_id = $1
          AND transaction_type = 'purchase'
          AND status = 'completed'
      ),
      event_data AS (
        SELECT total_tickets, tickets_sold
        FROM events
        WHERE id = $1
      )
      SELECT
        s.*,
        e.total_tickets,
        e.total_tickets - e.tickets_sold as remaining_tickets
      FROM sales_data s, event_data e
    `, [eventId]);

    const data = result.rows[0];
    const velocity = data.last_minute || 0;
    const velocity5Min = (data.last_5_minutes || 0) / 5;
    const velocity10Min = (data.last_10_minutes || 0) / 10;

    // Calculate acceleration
    const accelerationRate = velocity - velocity10Min;

    return {
      eventId,
      ticketsSold: data.total_sold || 0,
      velocity,
      accelerationRate,
      currentCapacity: data.total_tickets || 0,
      remainingTickets: data.remaining_tickets || 0,
    };
  }

  /**
   * NOTE: This method queries ticket_transactions for ML prediction.
   * This is an acceptable read-replica pattern for analytics as per Phase 5 plan.
   */
  private async predictSellout(eventId: string, velocity: SalesVelocity): Promise<Date | null> {
    if (!this.salesModel || velocity.remainingTickets <= 0) return null;

    try {
      // Get recent sales pattern
      const recentSales = await pgPool.query(`
        SELECT
          DATE_TRUNC('minute', created_at) as minute,
          SUM(quantity) as tickets_sold,
          AVG(amount) as avg_price
        FROM ticket_transactions
        WHERE event_id = $1
          AND created_at > NOW() - INTERVAL '10 minutes'
          AND transaction_type = 'purchase'
          AND status = 'completed'
        GROUP BY minute
        ORDER BY minute DESC
        LIMIT 10
      `, [eventId]);

      if (recentSales.rows.length < 5) {
        // Simple linear prediction if not enough data
        if (velocity.velocity > 0) {
          const minutesToSellout = velocity.remainingTickets / velocity.velocity;
          return new Date(Date.now() + minutesToSellout * 60000);
        }
        return null;
      }

      // Prepare input for the model
      const input = recentSales.rows.reverse().map(row => [
        row.tickets_sold,
        row.avg_price,
        velocity.ticketsSold / velocity.currentCapacity,
        new Date(row.minute).getHours(),
        new Date(row.minute).getDay(),
      ]);

      // Pad if needed
      while (input.length < 10) {
        input.unshift([0, 0, 0, 0, 0]);
      }

      const prediction = this.salesModel.predict(tf.tensor3d([input])) as tf.Tensor;
      const minutesToSellout = (await prediction.data())[0];

      prediction.dispose();

      if (minutesToSellout > 0 && minutesToSellout < 10000) {
        return new Date(Date.now() + minutesToSellout * 60000);
      }
    } catch (error) {
      logger.error('Error predicting sellout:', error);
    }

    return null;
  }

  /**
   * REFACTORED: Get active events via event-service client
   * Previously did direct DB query: SELECT id, name FROM events WHERE sale_start < NOW()...
   */
  private startTracking() {
    // Real-time tracking every 30 seconds
    setInterval(async () => {
      if (!this.isInitialized) return;
      const ctx = createSystemContext();

      try {
        // REFACTORED: Use eventServiceClient instead of direct DB query
        const activeEventsResponse = await eventServiceClient.getActiveEvents(ctx);

        for (const event of activeEventsResponse.events) {
          const velocity = await this.calculateVelocity(event.id);
          const prediction = await this.predictSellout(event.id, velocity);

          // Cache for quick access
          if (!this.velocityCache.has(event.id)) {
            this.velocityCache.set(event.id, []);
          }

          const cache = this.velocityCache.get(event.id)!;
          cache.push({ ...velocity, predictedSelloutTime: prediction || undefined });

          // Keep only last 20 data points
          if (cache.length > 20) cache.shift();

          logger.debug(`Event ${event.name}: ${velocity.velocity.toFixed(1)} tickets/min, ${velocity.remainingTickets} remaining`);
        }
      } catch (error) {
        logger.error('Error in sales tracking loop:', error);
      }
    }, 30000);

    logger.info('📊 Event sales tracking started');
  }

  async getEventMetrics(eventId: string) {
    if (!this.isInitialized) {
      return { error: 'Sales tracker not initialized' };
    }

    const velocity = await this.calculateVelocity(eventId);
    const prediction = await this.predictSellout(eventId, velocity);
    const cache = this.velocityCache.get(eventId) || [];

    return {
      current: velocity,
      prediction,
      history: cache,
      trend: this.calculateTrend(cache),
    };
  }

  private calculateTrend(history: SalesVelocity[]): 'accelerating' | 'steady' | 'decelerating' | 'unknown' {
    if (history.length < 3) return 'unknown';

    const recent = history.slice(-3);
    const avgAcceleration = recent.reduce((sum, v) => sum + v.accelerationRate, 0) / recent.length;

    if (avgAcceleration > 0.5) return 'accelerating';
    if (avgAcceleration < -0.5) return 'decelerating';
    return 'steady';
  }
}

export const salesTracker = new EventSalesTracker();
