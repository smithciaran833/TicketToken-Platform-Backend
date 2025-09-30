// TicketToken Platform - Marketplace Analytics
// Purpose: Track secondary market dynamics, pricing trends, and trading patterns

// Database: tickettoken
// Collection: marketplace_analytics

// Phase 1: Basic marketplace metrics structure

// Check if collection exists
const collections = db.getCollectionNames();
if (collections.includes("marketplace_analytics")) {
  print("Marketplace analytics collection already exists - skipping creation");
} else {
  // Create the collection with validation
  db.createCollection("marketplace_analytics", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["timestamp", "metricType", "value"],
        properties: {
          timestamp: {
            bsonType: "date",
            description: "When the metric was recorded"
          },
          metricType: {
            enum: [
              "LISTING_CREATED",
              "LISTING_UPDATED",
              "LISTING_SOLD",
              "LISTING_CANCELLED",
              "OFFER_MADE",
              "OFFER_ACCEPTED",
              "OFFER_REJECTED",
              "PRICE_ALERT",
              "MARKET_TREND",
              "LIQUIDITY_SCORE"
            ],
            description: "Type of marketplace metric"
          },
          value: {
            bsonType: "number",
            description: "Metric value (price, count, score)"
          },
          metadata: {
            bsonType: "object",
            description: "Additional marketplace context",
            properties: {
              listingId: { bsonType: "string" },
              ticketId: { bsonType: "string" },
              eventId: { bsonType: "string" },
              sellerId: { bsonType: "string" },
              buyerId: { bsonType: "string" },
              originalPrice: { bsonType: "number" },
              listingPrice: { bsonType: "number" },
              soldPrice: { bsonType: "number" },
              ticketType: { bsonType: "string" },
              daysUntilEvent: { bsonType: "number" },
              priceChange: { bsonType: "number" }
            }
          }
        }
      }
    }
  });
  print("Marketplace analytics collection created successfully!");
}

// Create basic indexes
db.marketplace_analytics.createIndex({ timestamp: -1 });
db.marketplace_analytics.createIndex({ metricType: 1, timestamp: -1 });
db.marketplace_analytics.createIndex({ "metadata.eventId": 1, timestamp: -1 });
db.marketplace_analytics.createIndex({ "metadata.sellerId": 1, timestamp: -1 });

// TTL index - keep marketplace analytics for 2 years
db.marketplace_analytics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

print("Basic indexes created");

print("\n✓ Phase 1 complete - Basic marketplace analytics structure");

// Phase 2: Market analysis and pricing trends

// Add compound indexes for complex queries
db.marketplace_analytics.createIndex({ "metadata.eventId": 1, metricType: 1, timestamp: -1 });
db.marketplace_analytics.createIndex({ "metadata.ticketType": 1, "metadata.daysUntilEvent": 1 });
db.marketplace_analytics.createIndex({ metricType: 1, "metadata.priceChange": 1 });

print("Compound indexes created");

// Sample aggregation for market activity
print("\nCreating market activity analysis...");
db.marketplace_analytics.aggregate([
  {
    $match: {
      timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
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
      activity: "$_id",
      count: 1,
      totalValue: { $round: ["$totalValue", 2] },
      avgValue: { $round: ["$avgValue", 2] },
      _id: 0
    }
  },
  {
    $sort: { count: -1 }
  }
]).forEach(function(activity) {
  print(" - " + activity.activity + ": " + activity.count + 
        " events, avg value $" + activity.avgValue);
});

print("\n✓ Phase 2 complete - Added market analysis capabilities");

// Phase 3: Market intelligence views and trading insights

// Drop existing views if they exist
try { db.marketplace_liquidity.drop(); } catch(e) {}
try { db.price_trends.drop(); } catch(e) {}
try { db.seller_performance.drop(); } catch(e) {}

// 1. Marketplace liquidity view
db.createView("marketplace_liquidity", "marketplace_analytics", [
  {
    $group: {
      _id: {
        eventId: "$metadata.eventId",
        ticketType: "$metadata.ticketType"
      },
      listings: {
        $sum: { $cond: [{ $eq: ["$metricType", "LISTING_CREATED"] }, 1, 0] }
      },
      sold: {
        $sum: { $cond: [{ $eq: ["$metricType", "LISTING_SOLD"] }, 1, 0] }
      },
      offers: {
        $sum: { $cond: [{ $eq: ["$metricType", "OFFER_MADE"] }, 1, 0] }
      },
      avgListingPrice: {
        $avg: {
          $cond: [{ $eq: ["$metricType", "LISTING_CREATED"] }, "$value", null]
        }
      },
      avgSoldPrice: {
        $avg: {
          $cond: [{ $eq: ["$metricType", "LISTING_SOLD"] }, "$value", null]
        }
      }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      ticketType: "$_id.ticketType",
      listings: 1,
      sold: 1,
      offers: 1,
      liquidityScore: {
        $round: [
          {
            $multiply: [
              { $divide: [{ $add: ["$sold", "$offers"] }, { $max: ["$listings", 1] }] },
              100
            ]
          },
          2
        ]
      },
      avgListingPrice: { $round: ["$avgListingPrice", 2] },
      avgSoldPrice: { $round: ["$avgSoldPrice", 2] },
      priceGap: {
        $round: [
          { $subtract: ["$avgListingPrice", "$avgSoldPrice"] },
          2
        ]
      },
      _id: 0
    }
  }
]);

// 2. Price trends view
db.createView("price_trends", "marketplace_analytics", [
  {
    $match: {
      metricType: { $in: ["LISTING_CREATED", "LISTING_SOLD"] }
    }
  },
  {
    $group: {
      _id: {
        eventId: "$metadata.eventId",
        date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
        ticketType: "$metadata.ticketType"
      },
      avgListPrice: {
        $avg: {
          $cond: [{ $eq: ["$metricType", "LISTING_CREATED"] }, "$value", null]
        }
      },
      avgSoldPrice: {
        $avg: {
          $cond: [{ $eq: ["$metricType", "LISTING_SOLD"] }, "$value", null]
        }
      },
      volume: { $sum: 1 },
      priceChanges: { $avg: "$metadata.priceChange" }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      date: "$_id.date",
      ticketType: "$_id.ticketType",
      avgListPrice: { $round: ["$avgListPrice", 2] },
      avgSoldPrice: { $round: ["$avgSoldPrice", 2] },
      volume: 1,
      avgPriceChange: { $round: ["$priceChanges", 2] },
      _id: 0
    }
  },
  {
    $sort: { eventId: 1, date: -1 }
  }
]);

// 3. Seller performance view
db.createView("seller_performance", "marketplace_analytics", [
  {
    $match: {
      "metadata.sellerId": { $exists: true }
    }
  },
  {
    $group: {
      _id: "$metadata.sellerId",
      totalListings: {
        $sum: { $cond: [{ $eq: ["$metricType", "LISTING_CREATED"] }, 1, 0] }
      },
      totalSold: {
        $sum: { $cond: [{ $eq: ["$metricType", "LISTING_SOLD"] }, 1, 0] }
      },
      totalRevenue: {
        $sum: {
          $cond: [{ $eq: ["$metricType", "LISTING_SOLD"] }, "$value", 0]
        }
      },
      avgListingPrice: {
        $avg: {
          $cond: [{ $eq: ["$metricType", "LISTING_CREATED"] }, "$value", null]
        }
      },
      avgSoldPrice: {
        $avg: {
          $cond: [{ $eq: ["$metricType", "LISTING_SOLD"] }, "$metadata.soldPrice", null]
        }
      }
    }
  },
  {
    $project: {
      sellerId: "$_id",
      totalListings: 1,
      totalSold: 1,
      totalRevenue: { $round: ["$totalRevenue", 2] },
      conversionRate: {
        $cond: [
          { $gt: ["$totalListings", 0] },
          { $round: [{ $multiply: [{ $divide: ["$totalSold", "$totalListings"] }, 100] }, 2] },
          0
        ]
      },
      avgListingPrice: { $round: ["$avgListingPrice", 2] },
      avgSoldPrice: { $round: ["$avgSoldPrice", 2] },
      _id: 0
    }
  },
  {
    $sort: { totalRevenue: -1 }
  }
]);

print("Market intelligence views created: marketplace_liquidity, price_trends, seller_performance");

// Helper function for market analysis
function getMarketInsights(eventId, days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return db.marketplace_analytics.aggregate([
    {
      $match: {
        "metadata.eventId": eventId,
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalListings: {
          $sum: { $cond: [{ $eq: ["$metricType", "LISTING_CREATED"] }, 1, 0] }
        },
        totalSold: {
          $sum: { $cond: [{ $eq: ["$metricType", "LISTING_SOLD"] }, 1, 0] }
        },
        avgListPrice: {
          $avg: {
            $cond: [{ $eq: ["$metricType", "LISTING_CREATED"] }, "$value", null]
          }
        },
        avgSoldPrice: {
          $avg: {
            $cond: [{ $eq: ["$metricType", "LISTING_SOLD"] }, "$value", null]
          }
        },
        priceRange: {
          $push: {
            $cond: [
              { $eq: ["$metricType", "LISTING_CREATED"] },
              "$value",
              null
            ]
          }
        }
      }
    },
    {
      $project: {
        totalListings: 1,
        totalSold: 1,
        avgListPrice: { $round: ["$avgListPrice", 2] },
        avgSoldPrice: { $round: ["$avgSoldPrice", 2] },
        conversionRate: {
          $round: [
            { $multiply: [{ $divide: ["$totalSold", { $max: ["$totalListings", 1] }] }, 100] },
            2
          ]
        },
        _id: 0
      }
    }
  ]).toArray();
}

// Note: getMarketInsights function is available for use in application code
// Usage: getMarketInsights(eventId, days)

print("\n✓ Phase 3 complete - Market intelligence views created");
print("\n✓ Marketplace analytics setup complete!");
