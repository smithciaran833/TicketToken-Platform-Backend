"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.influxDB = void 0;
exports.getWriteApi = getWriteApi;
exports.getQueryApi = getQueryApi;
const influxdb_client_1 = require("@influxdata/influxdb-client");
const url = process.env.INFLUX_URL || 'http://localhost:8086';
const token = process.env.INFLUX_TOKEN || 'your-influx-token';
const org = process.env.INFLUX_ORG || 'tickettoken';
const bucket = process.env.INFLUX_BUCKET || 'analytics';
exports.influxDB = new influxdb_client_1.InfluxDB({ url, token });
function getWriteApi() {
    return exports.influxDB.getWriteApi(org, bucket, 'ns');
}
function getQueryApi() {
    return exports.influxDB.getQueryApi(org);
}
//# sourceMappingURL=influxdb.js.map