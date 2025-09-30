export interface EventSecurityConfig {
  maxAdvanceDays: number;
  minAdvanceHours: number;
  maxTicketsPerOrder: number;
  maxTicketsPerCustomer: number;
}

export class EventSecurityValidator {
  private config: EventSecurityConfig;

  constructor() {
    this.config = {
      maxAdvanceDays: 365,
      minAdvanceHours: 2,
      maxTicketsPerOrder: 10,
      maxTicketsPerCustomer: 50
    };
  }

  async validateTicketPurchase(
    _customerId: string,
    _eventId: string,
    quantity: number,
    existingTicketCount: number
  ): Promise<void> {
    if (quantity > this.config.maxTicketsPerOrder) {
      throw new Error(`Cannot purchase more than ${this.config.maxTicketsPerOrder} tickets per order`);
    }

    if (existingTicketCount + quantity > this.config.maxTicketsPerCustomer) {
      throw new Error(`Cannot purchase more than ${this.config.maxTicketsPerCustomer} tickets per event`);
    }
  }

  async validateEventDate(eventDate: Date): Promise<void> {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + this.config.maxAdvanceDays);
    
    const minDate = new Date();
    minDate.setHours(minDate.getHours() + this.config.minAdvanceHours);

    if (eventDate < minDate) {
      throw new Error(`Event must be scheduled at least ${this.config.minAdvanceHours} hours in advance`);
    }

    if (eventDate > maxDate) {
      throw new Error(`Event cannot be scheduled more than ${this.config.maxAdvanceDays} days in advance`);
    }
  }

  async validateEventModification(eventId: string, data: any): Promise<void> {
    if (!eventId) {
      throw new Error('Event ID is required for modification');
    }
    
    // Add more validation logic as needed
    if (data.date) {
      await this.validateEventDate(new Date(data.date));
    }
  }

  async validateEventDeletion(eventId: string): Promise<void> {
    if (!eventId) {
      throw new Error('Event ID is required for deletion');
    }
    
    // Add logic to check if event can be deleted (e.g., no tickets sold)
  }

  async validateVenueCapacity(requestedCapacity: number, venueCapacity: number): Promise<void> {
    if (requestedCapacity > venueCapacity) {
      throw new Error(`Event capacity (${requestedCapacity}) cannot exceed venue capacity (${venueCapacity})`);
    }
  }
}
