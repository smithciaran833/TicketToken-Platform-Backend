import { eventStoreService, StoredEvent, EventStoreQuery } from './event-store.service';
import { publishEvent } from '../config/rabbitmq';
import { logger, createContextLogger } from '../utils/logger';

export interface ReplayResult {
  eventsReplayed: number;
  errors: Array<{ eventId: string; error: string }>;
  startTime: Date;
  endTime: Date;
  durationMs: number;
}

/**
 * Event Replay Service
 * Replays events from the event store back to the event bus
 */
export class EventReplayService {
  private replayLogger = createContextLogger({ context: 'event-replay' });

  /**
   * Replay events matching the query
   */
  async replayEvents(query: EventStoreQuery): Promise<ReplayResult> {
    const startTime = new Date();
    const result: ReplayResult = {
      eventsReplayed: 0,
      errors: [],
      startTime,
      endTime: new Date(),
      durationMs: 0,
    };

    try {
      // Get total count first
      const totalCount = await eventStoreService.countEvents(query);
      this.replayLogger.info('Starting event replay', { query, totalCount });

      if (totalCount === 0) {
        this.replayLogger.info('No events to replay');
        return result;
      }

      // Process in batches to avoid memory issues
      const batchSize = 100;
      let offset = 0;

      while (offset < totalCount) {
        const events = await eventStoreService.queryEvents({
          ...query,
          limit: batchSize,
          offset,
        });

        if (events.length === 0) {
          break;
        }

        // Replay each event in the batch
        for (const event of events) {
          try {
            await this.replayEvent(event);
            result.eventsReplayed++;
            
            if (result.eventsReplayed % 10 === 0) {
              this.replayLogger.info(`Replayed ${result.eventsReplayed}/${totalCount} events`);
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            result.errors.push({
              eventId: event.id,
              error: errorMsg,
            });
            this.replayLogger.error('Failed to replay event', {
              eventId: event.id,
              eventType: event.eventType,
              error: errorMsg,
            });
          }
        }

        offset += batchSize;
      }

      result.endTime = new Date();
      result.durationMs = result.endTime.getTime() - startTime.getTime();

      this.replayLogger.info('Event replay completed', {
        eventsReplayed: result.eventsReplayed,
        errors: result.errors.length,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      this.replayLogger.error('Event replay failed', { error, query });
      throw error;
    }
  }

  /**
   * Replay a single stored event
   */
  private async replayEvent(event: StoredEvent): Promise<void> {
    await publishEvent(event.eventType, {
      version: event.version,
      type: event.eventType,
      payload: event.payload,
      timestamp: event.publishedAt,
      metadata: {
        ...event.metadata,
        replayed: true,
        originalEventId: event.id,
        replayedAt: new Date(),
      },
    });

    this.replayLogger.debug('Event replayed', {
      eventId: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
    });
  }

  /**
   * Replay all events for a specific order
   */
  async replayOrderEvents(orderId: string): Promise<ReplayResult> {
    return this.replayEvents({ aggregateId: orderId });
  }

  /**
   * Replay events within a time range
   */
  async replayEventsByTimeRange(
    startDate: Date,
    endDate: Date,
    tenantId?: string
  ): Promise<ReplayResult> {
    return this.replayEvents({
      startDate,
      endDate,
      tenantId,
    });
  }

  /**
   * Replay events of a specific type
   */
  async replayEventsByType(
    eventType: string,
    tenantId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<ReplayResult> {
    return this.replayEvents({
      eventType: eventType as any,
      tenantId,
      startDate,
      endDate,
    });
  }
}

export const eventReplayService = new EventReplayService();
