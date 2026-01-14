import { InfluxDB, WriteApi } from '@influxdata/influxdb-client';

// Use INFLUXDB_ prefix to match config/index.ts configuration
const url = process.env.INFLUXDB_URL || 'http://localhost:8086';
const token = process.env.INFLUXDB_TOKEN || 'your-influx-token';
const org = process.env.INFLUXDB_ORG || 'tickettoken';
const bucket = process.env.INFLUXDB_BUCKET || 'analytics';

export const influxDB = new InfluxDB({ url, token });

export function getWriteApi(): WriteApi {
  return influxDB.getWriteApi(org, bucket, 'ns');
}

export function getQueryApi() {
  return influxDB.getQueryApi(org);
}
