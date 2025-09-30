import * as client from 'prom-client';

// Create a Registry
export const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// HTTP metrics
export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [register]
});

// Scanning specific metrics
export const scansAllowedTotal = new client.Counter({
  name: 'scans_allowed_total',
  help: 'Total number of allowed scans',
  registers: [register]
});

export const scansDeniedTotal = new client.Counter({
  name: 'scans_denied_total',
  help: 'Total number of denied scans',
  labelNames: ['reason'],
  registers: [register]
});

export const scanLatency = new client.Histogram({
  name: 'scan_latency_seconds',
  help: 'Scan operation latency in seconds',
  registers: [register]
});

export const qrGenerationDuration = new client.Histogram({
  name: 'qr_generation_duration_seconds',
  help: 'QR code generation duration',
  registers: [register]
});
