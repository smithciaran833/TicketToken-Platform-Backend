# Event Service

Event management service for the TicketToken platform.

## Features

- Event creation and management
- Ticket type configuration
- Dynamic pricing rules
- Capacity management
- Venue integration

## Setup

1. Install dependencies: npm install
2. Set up environment variables: cp .env.example .env
3. Run database migrations: npm run migrate
4. Start the service: npm run dev

## API Endpoints

### Events
- POST /events - Create event
- GET /events/:id - Get event details
- PUT /events/:id - Update event
- DELETE /events/:id - Delete event
- GET /venues/:venueId/events - List venue events

### Ticket Types
- GET /events/:id/ticket-types - List ticket types
- POST /events/:id/ticket-types - Create ticket type
- PUT /events/:id/ticket-types/:typeId - Update ticket type

### Pricing
- GET /events/:id/pricing-rules - Get pricing rules
- POST /events/:id/pricing-rules - Create pricing rule
- GET /events/:id/pricing - Calculate current pricing

### Capacity
- GET /events/:id/capacity - Get capacity info
- PUT /events/:id/capacity - Update capacity

## Port

The service runs on port 3003 by default.
