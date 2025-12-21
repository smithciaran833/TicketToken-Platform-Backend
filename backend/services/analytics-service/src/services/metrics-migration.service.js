"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsMigrationService = void 0;
const mongodb_1 = require("mongodb");
const influxdb_metrics_service_1 = require("./influxdb-metrics.service");
class MetricsMigrationService {
    influxService;
    mongoClient;
    constructor() {
        this.influxService = new influxdb_metrics_service_1.InfluxDBMetricsService();
        this.mongoClient = new mongodb_1.MongoClient(process.env.MONGODB_URL || 'mongodb://localhost:27017');
    }
    async recordMetric(data) {
        try {
            if (data.type === 'user_action') {
                await this.influxService.recordUserAction(data.payload);
            }
            else if (data.type === 'event_metric') {
                await this.influxService.recordEventMetrics(data.payload);
            }
            else if (data.type === 'sales_velocity') {
                await this.influxService.recordSalesVelocity(data.payload);
            }
        }
        catch (error) {
            console.error('InfluxDB write failed:', error);
        }
        try {
            await this.mongoClient.connect();
            const db = this.mongoClient.db('analytics');
            const collection = db.collection(data.type === 'user_action' ? 'user_behavior' : 'event_analytics');
            await collection.insertOne({
                ...data.payload,
                timestamp: new Date(),
                migrated_to_influx: true,
            });
        }
        catch (error) {
            console.error('MongoDB write failed:', error);
        }
        finally {
            await this.mongoClient.close();
        }
    }
    async migrateHistoricalData(startDate, endDate) {
        await this.mongoClient.connect();
        const db = this.mongoClient.db('analytics');
        console.log('Migrating user_behavior...');
        const userBehavior = db.collection('user_behavior');
        const userActions = await userBehavior.find({
            timestamp: { $gte: startDate, $lte: endDate },
        }).toArray();
        let migratedCount = 0;
        for (const action of userActions) {
            await this.influxService.recordUserAction({
                userId: action.user_id,
                action: action.action,
                eventId: action.event_id,
                venueId: action.venue_id,
                durationMs: action.duration_ms,
            });
            migratedCount++;
            if (migratedCount % 1000 === 0) {
                console.log(`Migrated ${migratedCount}/${userActions.length} user actions`);
                await this.influxService.flush();
            }
        }
        await this.influxService.flush();
        console.log(`✅ Migrated ${userActions.length} user actions`);
        console.log('Migrating event_analytics...');
        const eventAnalytics = db.collection('event_analytics');
        const events = await eventAnalytics.find({
            timestamp: { $gte: startDate, $lte: endDate },
        }).toArray();
        migratedCount = 0;
        for (const event of events) {
            if (event.metric_type === 'sales' || event.tickets_sold !== undefined) {
                await this.influxService.recordEventMetrics({
                    eventId: event.event_id,
                    venueId: event.venue_id,
                    ticketsSold: event.tickets_sold || 0,
                    revenueCents: event.revenue_cents || 0,
                    capacity: event.capacity || 0,
                });
                migratedCount++;
                if (migratedCount % 1000 === 0) {
                    console.log(`Migrated ${migratedCount}/${events.length} event metrics`);
                    await this.influxService.flush();
                }
            }
        }
        await this.influxService.flush();
        console.log(`✅ Migrated ${events.length} event metrics`);
        await this.mongoClient.close();
        console.log('🎉 Migration complete!');
    }
    async validateMigration(eventId, date) {
        await this.mongoClient.connect();
        const db = this.mongoClient.db('analytics');
        const collection = db.collection('event_analytics');
        const mongoCount = await collection.countDocuments({
            event_id: eventId,
            timestamp: {
                $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
                $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
            },
        });
        const influxData = await this.influxService.getEventSalesTimeSeries(eventId, 24);
        await this.mongoClient.close();
        return {
            mongodb_count: mongoCount,
            influxdb_count: influxData.length,
            match: mongoCount === influxData.length,
            date: date.toISOString().split('T')[0],
        };
    }
}
exports.MetricsMigrationService = MetricsMigrationService;
//# sourceMappingURL=metrics-migration.service.js.map