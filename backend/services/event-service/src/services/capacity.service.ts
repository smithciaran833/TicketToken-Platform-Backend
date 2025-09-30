import { Knex } from 'knex';
import Redis from 'ioredis';
import { pino } from 'pino';

const logger = pino({ name: 'capacity-service' });

interface CapacityInfo {
  total: number;
  sold: number;
  available: number;
  reserved: number;
}

export class CapacityService {
  constructor(
    private db: Knex,
    private redis: Redis
  ) {}

  async getEventCapacity(eventId: string): Promise<CapacityInfo> {
    // Check cache first
    const cached = await this.redis.get(`capacity:${eventId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get event capacity
    const event = await this.db('events')
      .where({ id: eventId })
      .first();

    if (!event) {
      throw new Error('Event not found');
    }

    // Count tickets by status
    const ticketCounts = await this.db('tickets')
      .select('status')
      .count('* as count')
      .where({ event_id: eventId })
      .groupBy('status');

    const counts = ticketCounts.reduce((acc: any, row: any) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, { sold: 0, reserved: 0 });

    const capacity: CapacityInfo = {
      total: event.capacity,
      sold: counts.sold || 0,
      reserved: counts.reserved || 0,
      available: event.capacity - (counts.sold || 0) - (counts.reserved || 0)
    };

    // Cache for 1 minute
    await this.redis.setex(`capacity:${eventId}`, 60, JSON.stringify(capacity));
    
    return capacity;
  }

  async updateCapacity(eventId: string, newCapacity: number): Promise<void> {
    const currentCapacity = await this.getEventCapacity(eventId);
    
    if (newCapacity < currentCapacity.sold + currentCapacity.reserved) {
      throw new Error('Cannot reduce capacity below sold/reserved tickets');
    }

    await this.db('events')
      .where({ id: eventId })
      .update({ 
        capacity: newCapacity,
        updated_at: new Date()
      });

    await this.redis.del(`capacity:${eventId}`);
    logger.info({ eventId, newCapacity }, 'Event capacity updated');
  }

  async checkAvailability(eventId: string, quantity: number): Promise<boolean> {
    const capacity = await this.getEventCapacity(eventId);
    return capacity.available >= quantity;
  }
}
