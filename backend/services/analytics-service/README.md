# Analytics Service

The Analytics Service provides comprehensive real-time and historical analytics for the TicketToken platform.

## Features

Real-time Analytics: Live sales, revenue, and attendance tracking
Customer Intelligence: Privacy-safe customer profiling and segmentation
Marketing Attribution: Campaign ROI tracking and attribution
Predictive Analytics: ML-based demand forecasting and pricing optimization
Custom Dashboards: Configurable widgets and dashboard layouts
Data Exports: CSV, Excel, and PDF report generation
Alert System: Threshold-based alerts for key metrics

## Architecture

Event-driven processing using RabbitMQ
Real-time metrics cached in Redis
Historical data aggregated in PostgreSQL
Raw analytics data stored in MongoDB
WebSocket support for live dashboard updates
ML models for predictive analytics

## Setup

1. Install dependencies:
npm install

2. Copy environment variables:
cp .env.example .env

3. Run database migrations:
npm run migrate

4. Start the service:
npm run dev

## API Endpoints

Real-time Metrics:
GET /api/v1/analytics/real-time/sales - Live sales counter
GET /api/v1/analytics/real-time/revenue - Live revenue counter
GET /api/v1/analytics/real-time/attendance - Current scanned in
GET /api/v1/analytics/real-time/capacity - Tickets remaining
WS /api/v1/analytics/real-time/stream - WebSocket for live updates

Historical Insights:
GET /api/v1/analytics/insights/overview - Venue overview stats
GET /api/v1/analytics/insights/sales-trend - Sales over time
GET /api/v1/analytics/insights/demographics - Customer demographics

Customer Intelligence:
GET /api/v1/analytics/customers - Customer list (hashed)
GET /api/v1/analytics/customers/segments - Customer segments
GET /api/v1/analytics/customers/vip - VIP customers

## Testing

Run all tests:
npm test

Run with coverage:
npm run test:coverage

Run in watch mode:
npm run test:watch

## Environment Variables

See .env.example for required configuration.

## Privacy and Security

Customer data is one-way hashed with daily salt rotation
No PII is stored in analytics tables
Row-level security ensures venue data isolation
All data access is audited

## Monitoring

Prometheus metrics exposed on port 9090
Health check endpoint: /health
WebSocket status: /ws-health
