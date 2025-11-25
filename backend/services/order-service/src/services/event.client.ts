import axios from 'axios';
import { logger } from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuit-breaker';

const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL || 'http://tickettoken-event:3003';

export class EventClient {
  private getEventBreaker;

  constructor() {
    this.getEventBreaker = createCircuitBreaker(
      this._getEvent.bind(this),
      { name: 'event-service-get-event', timeout: 3000 }
    );
  }

  private async _getEvent(eventId: string): Promise<any> {
    const response = await axios.get(`${EVENT_SERVICE_URL}/api/v1/events/${eventId}`);
    return response.data;
  }

  async getEvent(eventId: string): Promise<any> {
    try {
      return await this.getEventBreaker.fire(eventId);
    } catch (error) {
      logger.error('Error fetching event', { error, eventId });
      throw error;
    }
  }
}
