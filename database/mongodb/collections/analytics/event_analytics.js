// TicketToken Platform - Event Analytics
// Purpose: Track event performance, ticket sales, and attendance patterns

// Database: tickettoken
// Collection: event_analytics

// Phase 1: Basic event analytics structure

// Check if collection exists
const collections = db.getCollectionNames();
if (collections.includes("event_analytics")) {
  print("Event analytics collection already exists - skipping creation");
} else {
  // Create the collection with validation
  db.createCollection("event_analytics", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["eventId", "timestamp", "metricType", "value"],
        properties: {
          eventId: {
            bsonType: "string",
            description: "Event ID from PostgreSQL"
          },
          timestamp: {
            bsonType: "date",
            description: "When the metric was recorded"
          },
          metricType: {
            enum: [
              "TICKET_SOLD",
              "TICKET_VIEWED",
              "TICKET_SCANNED",
              "REVENUE",
              "ATTENDANCE",
              "CAPACITY_UPDATE",
              "PRICE_CHANGE",
              "RESALE_LISTING",
              "RESALE_SOLD"
            ],
            description: "Type of metric being tracked"
          },
          value: {
            bsonType: "number",
            description: "Numeric value of the metric"
          },
          metadata: {
            bsonType: "object",
            description: "Additional metric details",
            properties: {
              ticketType: { bsonType: "string" },
              section: { bsonType: "string" },
              pricePoint: { bsonType: "number" },
              quantity: { bsonType: "number" },
              userId: { bsonType: "string" },
              scanTime: { bsonType: "date" },
              gate: { bsonType: "string" }
            }
          }
        }
      }
    }
  });
  print("Event analytics collection created successfully!");
}

// Create basic indexes
db.event_analytics.createIndex({ eventId: 1, timestamp: -1 });
db.event_analytics.createIndex({ metricType: 1, timestamp: -1 });
db.event_analytics.createIndex({ timestamp: -1 });

// TTL index - keep event analytics for 2 years
db.event_analytics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

print("Basic indexes created");

print("\n✓ Phase 1 complete - Basic event analytics structure");

// Phase 2: Additional fields and compound indexes

// Add compound indexes for common queries
db.event_analytics.createIndex({ eventId: 1, metricType: 1, timestamp: -1 });
db.event_analytics.createIndex({ "metadata.ticketType": 1, timestamp: -1 });
db.event_analytics.createIndex({ "metadata.userId": 1, timestamp: -1 });

print("Compound indexes created");

// Create aggregation pipelines for common analytics

// 1. Real-time sales dashboard
print("\nCreating real-time sales aggregation...");
db.event_analytics.aggregate([
  {
    $match: {
      metricType: { $in: ["TICKET_SOLD", "REVENUE"] },
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: {
        eventId: "$eventId",
        metricType: "$metricType"
      },
      totalValue: { $sum: "$value" },
      count: { $sum: 1 }
    }
  },
  {
    $group: {
      _id: "$_id.eventId",
      ticketsSold: {
        $sum: {
          $cond: [{ $eq: ["$_id.metricType", "TICKET_SOLD"] }, "$totalValue", 0]
        }
      },
      revenue: {
        $sum: {
          $cond: [{ $eq: ["$_id.metricType", "REVENUE"] }, "$totalValue", 0]
        }
      }
    }
  },
  {
    $project: {
      eventId: "$_id",
      ticketsSold: 1,
      revenue: 1,
      _id: 0
    }
  }
]).forEach(function(event) {
  print("Event " + event.eventId + ": " + event.ticketsSold + " tickets, $" + event.revenue);
});

print("\n✓ Phase 2 complete - Added compound indexes and aggregations");

// Phase 3: Analytics views and advanced features

// Drop existing views if they exist
try { db.event_sales_summary.drop(); } catch(e) {}
try { db.event_attendance_tracking.drop(); } catch(e) {}
try { db.ticket_velocity.drop(); } catch(e) {}

// 1. Event sales summary view
db.createView("event_sales_summary", "event_analytics", [
  {
    $match: {
      metricType: { $in: ["TICKET_SOLD", "REVENUE", "RESALE_SOLD"] }
    }
  },
  {
    $group: {
      _id: {
        eventId: "$eventId",
        date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
      },
      ticketsSold: {
        $sum: {
          $cond: [{ $eq: ["$metricType", "TICKET_SOLD"] }, "$value", 0]
        }
      },
      primaryRevenue: {
        $sum: {
          $cond: [{ $eq: ["$metricType", "REVENUE"] }, "$value", 0]
        }
      },
      resaleRevenue: {
        $sum: {
          $cond: [{ $eq: ["$metricType", "RESALE_SOLD"] }, "$value", 0]
        }
      },
      transactions: { $sum: 1 }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      date: "$_id.date",
      ticketsSold: 1,
      primaryRevenue: 1,
      resaleRevenue: 1,
      totalRevenue: { $add: ["$primaryRevenue", "$resaleRevenue"] },
      transactions: 1,
      _id: 0
    }
  },
  {
    $sort: { date: -1 }
  }
]);

// 2. Event attendance tracking view
db.createView("event_attendance_tracking", "event_analytics", [
  {
    $match: {
      metricType: "TICKET_SCANNED"
    }
  },
  {
    $group: {
      _id: {
        eventId: "$eventId",
        gate: "$metadata.gate",
        hour: { $hour: "$timestamp" }
      },
      scannedCount: { $sum: "$value" },
      lastScanTime: { $max: "$timestamp" }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      gate: "$_id.gate",
      hour: "$_id.hour",
      scannedCount: 1,
      lastScanTime: 1,
      _id: 0
    }
  }
]);

// 3. Ticket sales velocity view
db.createView("ticket_velocity", "event_analytics", [
  {
    $match: {
      metricType: "TICKET_SOLD",
      timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
    }
  },
  {
    $group: {
      _id: {
        eventId: "$eventId",
        dayOfWeek: { $dayOfWeek: "$timestamp" },
        hour: { $hour: "$timestamp" }
      },
      salesCount: { $sum: "$value" },
      avgPrice: { $avg: "$metadata.pricePoint" }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      dayOfWeek: "$_id.dayOfWeek",
      hour: "$_id.hour",
      salesCount: 1,
      avgPrice: { $round: ["$avgPrice", 2] },
      _id: 0
    }
  },
  {
    $sort: { eventId: 1, dayOfWeek: 1, hour: 1 }
  }
]);

print("Analytics views created: event_sales_summary, event_attendance_tracking, ticket_velocity");

// Helper functions for analytics
function getEventMetrics(eventId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return db.event_analytics.aggregate([
    {
      $match: {
        eventId: eventId,
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: "$metricType",
        total: { $sum: "$value" },
        count: { $sum: 1 },
        avgValue: { $avg: "$value" }
      }
    },
    {
      $project: {
        metricType: "$_id",
        total: 1,
        count: 1,
        avgValue: { $round: ["$avgValue", 2] },
        _id: 0
      }
    }
  ]).toArray();
}

// Save function to system.js

print("\n✓ Phase 3 complete - Analytics views and functions created");
print("\n✓ Event analytics setup complete!");

// Note: getEventMetrics function is available for use in application code
// Usage: getEventMetrics(eventId, days)
