// TicketToken Platform - Ticket Analytics
// Purpose: Track ticket sales, transfers, usage patterns, and market dynamics

// Database: tickettoken
// Collection: ticket_analytics

// Phase 1: Basic ticket metrics structure

// Check if collection exists
const collections = db.getCollectionNames();
if (collections.includes("ticket_analytics")) {
  print("Ticket analytics collection already exists - skipping creation");
} else {
  // Create the collection with validation
  db.createCollection("ticket_analytics", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["eventId", "timestamp", "metricType", "value"],
        properties: {
          eventId: {
            bsonType: "string",
            description: "Event ID from PostgreSQL"
          },
          ticketId: {
            bsonType: "string",
            description: "Individual ticket ID (optional)"
          },
          timestamp: {
            bsonType: "date",
            description: "When the metric was recorded"
          },
          metricType: {
            enum: [
              "TICKET_CREATED",
              "TICKET_SOLD",
              "TICKET_TRANSFERRED",
              "TICKET_SCANNED",
              "TICKET_CANCELLED",
              "PRICE_CHANGE",
              "RESALE_LISTED",
              "RESALE_SOLD",
              "RESALE_CANCELLED",
              "SCAN_ATTEMPTED",
              "SCAN_FAILED"
            ],
            description: "Type of ticket metric"
          },
          value: {
            bsonType: "number",
            description: "Numeric value (price, count, etc.)"
          },
          metadata: {
            bsonType: "object",
            description: "Additional metric context",
            properties: {
              ticketType: { bsonType: "string" },
              section: { bsonType: "string" },
              row: { bsonType: "string" },
              seat: { bsonType: "string" },
              originalPrice: { bsonType: "number" },
              resalePrice: { bsonType: "number" },
              userId: { bsonType: "string" },
              scanGate: { bsonType: "string" },
              failureReason: { bsonType: "string" }
            }
          }
        }
      }
    }
  });
  print("Ticket analytics collection created successfully!");
}

// Create basic indexes
db.ticket_analytics.createIndex({ eventId: 1, timestamp: -1 });
db.ticket_analytics.createIndex({ metricType: 1, timestamp: -1 });
db.ticket_analytics.createIndex({ ticketId: 1, timestamp: -1 });
db.ticket_analytics.createIndex({ timestamp: -1 });

// TTL index - keep ticket analytics for 2 years
db.ticket_analytics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

print("Basic indexes created");

print("\n✓ Phase 1 complete - Basic ticket analytics structure");

// Phase 2: Advanced indexes and market analysis

// Add compound indexes for complex queries
db.ticket_analytics.createIndex({ eventId: 1, metricType: 1, timestamp: -1 });
db.ticket_analytics.createIndex({ "metadata.ticketType": 1, metricType: 1 });
db.ticket_analytics.createIndex({ "metadata.userId": 1, eventId: 1 });
db.ticket_analytics.createIndex({ eventId: 1, "metadata.section": 1 });

print("Compound indexes created");

// Sample aggregation for ticket sales analysis
print("\nCreating ticket sales analysis...");
db.ticket_analytics.aggregate([
  {
    $match: {
      metricType: { $in: ["TICKET_SOLD", "RESALE_SOLD"] },
      timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: {
        eventId: "$eventId",
        ticketType: "$metadata.ticketType",
        saleType: {
          $cond: [{ $eq: ["$metricType", "TICKET_SOLD"] }, "Primary", "Resale"]
        }
      },
      totalSales: { $sum: 1 },
      totalRevenue: { $sum: "$value" },
      avgPrice: { $avg: "$value" },
      maxPrice: { $max: "$value" },
      minPrice: { $min: "$value" }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      ticketType: "$_id.ticketType",
      saleType: "$_id.saleType",
      totalSales: 1,
      totalRevenue: { $round: ["$totalRevenue", 2] },
      avgPrice: { $round: ["$avgPrice", 2] },
      priceRange: {
        min: { $round: ["$minPrice", 2] },
        max: { $round: ["$maxPrice", 2] }
      },
      _id: 0
    }
  },
  {
    $sort: { eventId: 1, totalRevenue: -1 }
  }
]).forEach(function(sales) {
  print("Event " + sales.eventId + " - " + (sales.ticketType || "All") + " (" + sales.saleType + "): " + 
        sales.totalSales + " tickets, $" + sales.avgPrice + " avg");
});

print("\n✓ Phase 2 complete - Added market analysis capabilities");

// Phase 3: Analytics views and comprehensive reporting

// Drop existing views if they exist
try { db.ticket_sales_summary.drop(); } catch(e) {}
try { db.ticket_transfer_patterns.drop(); } catch(e) {}
try { db.resale_market_analysis.drop(); } catch(e) {}

// 1. Ticket sales summary view
db.createView("ticket_sales_summary", "ticket_analytics", [
  {
    $match: {
      metricType: { $in: ["TICKET_SOLD", "RESALE_SOLD"] }
    }
  },
  {
    $group: {
      _id: {
        eventId: "$eventId",
        ticketType: "$metadata.ticketType",
        date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
      },
      primarySales: {
        $sum: { $cond: [{ $eq: ["$metricType", "TICKET_SOLD"] }, 1, 0] }
      },
      resaleSales: {
        $sum: { $cond: [{ $eq: ["$metricType", "RESALE_SOLD"] }, 1, 0] }
      },
      totalRevenue: { $sum: "$value" },
      avgPrice: { $avg: "$value" }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      ticketType: "$_id.ticketType",
      date: "$_id.date",
      primarySales: 1,
      resaleSales: 1,
      totalSales: { $add: ["$primarySales", "$resaleSales"] },
      totalRevenue: { $round: ["$totalRevenue", 2] },
      avgPrice: { $round: ["$avgPrice", 2] },
      _id: 0
    }
  },
  {
    $sort: { date: -1, totalRevenue: -1 }
  }
]);

// 2. Ticket transfer patterns view
db.createView("ticket_transfer_patterns", "ticket_analytics", [
  {
    $match: {
      metricType: "TICKET_TRANSFERRED"
    }
  },
  {
    $group: {
      _id: {
        eventId: "$eventId",
        hour: { $hour: "$timestamp" },
        dayOfWeek: { $dayOfWeek: "$timestamp" }
      },
      transferCount: { $sum: "$value" },
      uniqueTickets: { $addToSet: "$ticketId" }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      hour: "$_id.hour",
      dayOfWeek: "$_id.dayOfWeek",
      transferCount: 1,
      uniqueTicketCount: { $size: "$uniqueTickets" },
      _id: 0
    }
  }
]);

// 3. Resale market analysis view
db.createView("resale_market_analysis", "ticket_analytics", [
  {
    $match: {
      metricType: { $in: ["RESALE_LISTED", "RESALE_SOLD", "RESALE_CANCELLED"] }
    }
  },
  {
    $group: {
      _id: {
        eventId: "$eventId",
        ticketType: "$metadata.ticketType"
      },
      listed: {
        $sum: { $cond: [{ $eq: ["$metricType", "RESALE_LISTED"] }, 1, 0] }
      },
      sold: {
        $sum: { $cond: [{ $eq: ["$metricType", "RESALE_SOLD"] }, 1, 0] }
      },
      cancelled: {
        $sum: { $cond: [{ $eq: ["$metricType", "RESALE_CANCELLED"] }, 1, 0] }
      },
      avgListPrice: {
        $avg: {
          $cond: [{ $eq: ["$metricType", "RESALE_LISTED"] }, "$value", null]
        }
      },
      avgSoldPrice: {
        $avg: {
          $cond: [{ $eq: ["$metricType", "RESALE_SOLD"] }, "$value", null]
        }
      },
      avgMarkup: {
        $avg: {
          $cond: [
            { $eq: ["$metricType", "RESALE_LISTED"] },
            { $subtract: ["$value", "$metadata.originalPrice"] },
            null
          ]
        }
      }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      ticketType: "$_id.ticketType",
      listed: 1,
      sold: 1,
      cancelled: 1,
      conversionRate: {
        $cond: [
          { $gt: ["$listed", 0] },
          { $round: [{ $multiply: [{ $divide: ["$sold", "$listed"] }, 100] }, 2] },
          0
        ]
      },
      avgListPrice: { $round: ["$avgListPrice", 2] },
      avgSoldPrice: { $round: ["$avgSoldPrice", 2] },
      avgMarkup: { $round: ["$avgMarkup", 2] },
      _id: 0
    }
  }
]);

print("Analytics views created: ticket_sales_summary, ticket_transfer_patterns, resale_market_analysis");

// Helper function for ticket analytics
function getTicketMetrics(eventId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return db.ticket_analytics.aggregate([
    {
      $match: {
        eventId: eventId,
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: "$metricType",
        count: { $sum: 1 },
        totalValue: { $sum: "$value" },
        avgValue: { $avg: "$value" }
      }
    },
    {
      $project: {
        metric: "$_id",
        count: 1,
        totalValue: { $round: ["$totalValue", 2] },
        avgValue: { $round: ["$avgValue", 2] },
        _id: 0
      }
    },
    {
      $sort: { count: -1 }
    }
  ]).toArray();
}

// Note: getTicketMetrics function is available for use in application code
// Usage: getTicketMetrics(eventId, days)

print("\n✓ Phase 3 complete - Analytics views and functions created");
print("\n✓ Ticket analytics setup complete!");
