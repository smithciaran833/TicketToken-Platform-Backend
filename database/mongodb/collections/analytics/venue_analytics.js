// TicketToken Platform - Venue Analytics
// Purpose: Track venue performance, capacity utilization, and revenue metrics

// Database: tickettoken
// Collection: venue_analytics

// Phase 1: Basic venue metrics structure

// Check if collection exists
const collections = db.getCollectionNames();
if (collections.includes("venue_analytics")) {
  print("Venue analytics collection already exists - skipping creation");
} else {
  // Create the collection with validation
  db.createCollection("venue_analytics", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["venueId", "timestamp", "metricType", "value"],
        properties: {
          venueId: {
            bsonType: "string",
            description: "Venue ID from PostgreSQL"
          },
          timestamp: {
            bsonType: "date",
            description: "When the metric was recorded"
          },
          metricType: {
            enum: [
              "CAPACITY_UTILIZATION",
              "REVENUE_GENERATED",
              "EVENTS_HOSTED",
              "TICKETS_SOLD",
              "AVERAGE_TICKET_PRICE",
              "OCCUPANCY_RATE",
              "CANCELLATION_RATE",
              "CUSTOMER_SATISFACTION",
              "STAFF_EFFICIENCY",
              "MAINTENANCE_COST"
            ],
            description: "Type of venue metric"
          },
          value: {
            bsonType: "number",
            description: "Numeric value of the metric"
          },
          metadata: {
            bsonType: "object",
            description: "Additional metric context",
            properties: {
              eventId: { bsonType: "string" },
              eventType: { bsonType: "string" },
              section: { bsonType: "string" },
              period: { bsonType: "string" },
              comparison: { bsonType: "string" }
            }
          }
        }
      }
    }
  });
  print("Venue analytics collection created successfully!");
}

// Create basic indexes
db.venue_analytics.createIndex({ venueId: 1, timestamp: -1 });
db.venue_analytics.createIndex({ metricType: 1, timestamp: -1 });
db.venue_analytics.createIndex({ timestamp: -1 });

// TTL index - keep venue analytics for 3 years
db.venue_analytics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 94608000 });

print("Basic indexes created");

print("\n✓ Phase 1 complete - Basic venue analytics structure");

// Phase 2: Advanced indexes and aggregation pipelines

// Add compound indexes for complex queries
db.venue_analytics.createIndex({ venueId: 1, metricType: 1, timestamp: -1 });
db.venue_analytics.createIndex({ "metadata.eventId": 1, metricType: 1 });
db.venue_analytics.createIndex({ "metadata.period": 1, venueId: 1 });

print("Compound indexes created");

// Sample aggregation for venue performance dashboard
print("\nCreating venue performance aggregation...");
db.venue_analytics.aggregate([
  {
    $match: {
      timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: {
        venueId: "$venueId",
        metricType: "$metricType"
      },
      avgValue: { $avg: "$value" },
      maxValue: { $max: "$value" },
      minValue: { $min: "$value" },
      count: { $sum: 1 }
    }
  },
  {
    $group: {
      _id: "$_id.venueId",
      metrics: {
        $push: {
          type: "$_id.metricType",
          avg: { $round: ["$avgValue", 2] },
          max: "$maxValue",
          min: "$minValue",
          count: "$count"
        }
      }
    }
  },
  {
    $project: {
      venueId: "$_id",
      metrics: 1,
      _id: 0
    }
  }
]).forEach(function(venue) {
  print("Venue " + venue.venueId + " metrics summary:");
  venue.metrics.forEach(function(m) {
    print("  - " + m.type + ": avg=" + m.avg);
  });
});

print("\n✓ Phase 2 complete - Added aggregations and compound indexes");

// Phase 3: Analytics views and reporting functions

// Drop existing views if they exist
try { db.venue_performance_summary.drop(); } catch(e) {}
try { db.venue_revenue_trends.drop(); } catch(e) {}
try { db.venue_utilization_report.drop(); } catch(e) {}

// 1. Venue performance summary view
db.createView("venue_performance_summary", "venue_analytics", [
  {
    $group: {
      _id: {
        venueId: "$venueId",
        metricType: "$metricType",
        period: { $dateToString: { format: "%Y-%m", date: "$timestamp" } }
      },
      avgValue: { $avg: "$value" },
      maxValue: { $max: "$value" },
      minValue: { $min: "$value" },
      dataPoints: { $sum: 1 }
    }
  },
  {
    $project: {
      venueId: "$_id.venueId",
      metricType: "$_id.metricType",
      period: "$_id.period",
      avgValue: { $round: ["$avgValue", 2] },
      maxValue: { $round: ["$maxValue", 2] },
      minValue: { $round: ["$minValue", 2] },
      dataPoints: 1,
      _id: 0
    }
  },
  {
    $sort: { venueId: 1, period: -1, metricType: 1 }
  }
]);

// 2. Venue revenue trends view
db.createView("venue_revenue_trends", "venue_analytics", [
  {
    $match: {
      metricType: "REVENUE_GENERATED"
    }
  },
  {
    $group: {
      _id: {
        venueId: "$venueId",
        week: { $week: "$timestamp" },
        year: { $year: "$timestamp" }
      },
      totalRevenue: { $sum: "$value" },
      avgRevenue: { $avg: "$value" },
      eventCount: { $sum: 1 }
    }
  },
  {
    $project: {
      venueId: "$_id.venueId",
      week: "$_id.week",
      year: "$_id.year",
      totalRevenue: { $round: ["$totalRevenue", 2] },
      avgRevenue: { $round: ["$avgRevenue", 2] },
      eventCount: 1,
      _id: 0
    }
  },
  {
    $sort: { year: -1, week: -1 }
  }
]);

// 3. Venue utilization report view
db.createView("venue_utilization_report", "venue_analytics", [
  {
    $match: {
      metricType: { $in: ["CAPACITY_UTILIZATION", "OCCUPANCY_RATE"] }
    }
  },
  {
    $group: {
      _id: {
        venueId: "$venueId",
        metricType: "$metricType",
        dayOfWeek: { $dayOfWeek: "$timestamp" }
      },
      avgUtilization: { $avg: "$value" },
      peakUtilization: { $max: "$value" },
      samples: { $sum: 1 }
    }
  },
  {
    $project: {
      venueId: "$_id.venueId",
      metricType: "$_id.metricType",
      dayOfWeek: "$_id.dayOfWeek",
      avgUtilization: { $round: ["$avgUtilization", 1] },
      peakUtilization: { $round: ["$peakUtilization", 1] },
      samples: 1,
      dayName: {
        $switch: {
          branches: [
            { case: { $eq: ["$_id.dayOfWeek", 1] }, then: "Sunday" },
            { case: { $eq: ["$_id.dayOfWeek", 2] }, then: "Monday" },
            { case: { $eq: ["$_id.dayOfWeek", 3] }, then: "Tuesday" },
            { case: { $eq: ["$_id.dayOfWeek", 4] }, then: "Wednesday" },
            { case: { $eq: ["$_id.dayOfWeek", 5] }, then: "Thursday" },
            { case: { $eq: ["$_id.dayOfWeek", 6] }, then: "Friday" },
            { case: { $eq: ["$_id.dayOfWeek", 7] }, then: "Saturday" }
          ]
        }
      },
      _id: 0
    }
  },
  {
    $sort: { venueId: 1, dayOfWeek: 1 }
  }
]);

print("Analytics views created: venue_performance_summary, venue_revenue_trends, venue_utilization_report");

// Helper function for venue analytics
function getVenuePerformance(venueId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return db.venue_analytics.aggregate([
    {
      $match: {
        venueId: venueId,
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: "$metricType",
        currentValue: { $last: "$value" },
        avgValue: { $avg: "$value" },
        trend: {
          $push: {
            date: "$timestamp",
            value: "$value"
          }
        }
      }
    },
    {
      $project: {
        metric: "$_id",
        currentValue: { $round: ["$currentValue", 2] },
        avgValue: { $round: ["$avgValue", 2] },
        dataPoints: { $size: "$trend" },
        _id: 0
      }
    }
  ]).toArray();
}

// Note: getVenuePerformance function is available for use in application code
// Usage: getVenuePerformance(venueId, days)

print("\n✓ Phase 3 complete - Analytics views and functions created");
print("\n✓ Venue analytics setup complete!");
