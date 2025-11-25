import * as promClient from 'prom-client';

export const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

export const Counter = promClient.Counter;
export const Histogram = promClient.Histogram;
export const Gauge = promClient.Gauge;
