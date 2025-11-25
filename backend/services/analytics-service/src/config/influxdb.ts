import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';

const url = process.env.INFLUX_URL || 'http://localhost:8086';
const token = process.env.INFLUX_TOKEN || 'your-influx-token';
const org = process.env.INFLUX_ORG || 'tickettoken';
const bucket = process.env.INFLUX_BUCKET || 'analytics';

export const influxDB = new InfluxDB({ url, token });

export function getWriteApi(): WriteApi {
  return influxDB.getWriteApi(org, bucket, 'ns');
}

export function getQueryApi() {
  return influxDB.getQueryApi(org);
}
