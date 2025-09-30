# Venue Service

## Overview
The Venue Service manages all venue-related operations for the TicketToken platform.

## Features
- Venue CRUD operations
- Venue search and discovery
- Staff management
- Layout and seating configuration
- Third-party integrations (POS systems)
- Compliance management
- Venue analytics

## API Endpoints
- `GET /venues` - List venues (with search)
- `POST /venues` - Create venue
- `GET /venues/:id` - Get venue details
- `PUT /venues/:id` - Update venue
- `DELETE /venues/:id` - Delete venue
- `GET /venues/:id/check-access` - Check user access
- `GET /venues/:id/analytics` - Get venue analytics
- `POST /venues/:id/integrations` - Add integration
- `GET /venues/:id/compliance` - Get compliance status

## Environment Variables
See `.env.example` for required configuration.

## Development
```bash
npm install
npm run dev
```

## Testing
```bash
npm test
```
