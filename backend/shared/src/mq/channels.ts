// Redis pub/sub channels for real-time events
export const CHANNELS = {
  // Cache invalidation
  CACHE_INVALIDATE: 'cache:invalidate',
  
  // Real-time updates
  TICKET_SOLD: 'ticket:sold',
  TICKET_VALIDATED: 'ticket:validated',
  
  // Service events
  VENUE_UPDATED: 'venue:updated',
  EVENT_PUBLISHED: 'event:published',
  EVENT_CANCELLED: 'event:cancelled',
  
  // System events
  SERVICE_HEALTH: 'service:health',
  METRICS_UPDATE: 'metrics:update'
} as const;
