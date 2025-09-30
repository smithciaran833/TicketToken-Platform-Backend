// TicketToken Platform - Customer Insights
// Purpose: Analyze customer behavior, preferences, and lifetime value

// Database: tickettoken
// Collection: customer_insights

// Phase 1: Basic customer metrics structure

// Check if collection exists
const collections = db.getCollectionNames();
if (collections.includes("customer_insights")) {
  print("Customer insights collection already exists - skipping creation");
} else {
  // Create the collection with validation
  db.createCollection("customer_insights", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["userId", "timestamp", "insightType", "value"],
        properties: {
          userId: {
            bsonType: "string",
            description: "User ID from PostgreSQL"
          },
          timestamp: {
            bsonType: "date",
            description: "When the insight was recorded"
          },
          insightType: {
            enum: [
              "LIFETIME_VALUE",
              "PURCHASE_FREQUENCY",
              "AVERAGE_ORDER_VALUE",
              "CHURN_RISK",
              "ENGAGEMENT_SCORE",
              "LOYALTY_TIER",
              "PREFERENCE_UPDATE",
              "SEGMENT_CHANGE",
              "SATISFACTION_SCORE",
              "REFERRAL_VALUE"
            ],
            description: "Type of customer insight"
          },
          value: {
            bsonType: ["number", "string"],
            description: "Insight value (numeric or categorical)"
          },
          metadata: {
            bsonType: "object",
            description: "Additional insight context",
            properties: {
              previousValue: { bsonType: ["number", "string"] },
              changePercentage: { bsonType: "number" },
              segmentName: { bsonType: "string" },
              preferredCategories: { bsonType: "array" },
              lastPurchaseDate: { bsonType: "date" },
              totalPurchases: { bsonType: "number" },
              totalSpent: { bsonType: "number" },
              eventsAttended: { bsonType: "number" },
              referralsMade: { bsonType: "number" }
            }
          }
        }
      }
    }
  });
  print("Customer insights collection created successfully!");
}

// Create basic indexes
db.customer_insights.createIndex({ userId: 1, timestamp: -1 });
db.customer_insights.createIndex({ insightType: 1, timestamp: -1 });
db.customer_insights.createIndex({ timestamp: -1 });
db.customer_insights.createIndex({ userId: 1, insightType: 1, timestamp: -1 });

// TTL index - keep customer insights for 2 years
db.customer_insights.createIndex({ timestamp: 1 }, { expireAfterSeconds: 63072000 });

print("Basic indexes created");

print("\n✓ Phase 1 complete - Basic customer insights structure");

// Phase 2: Customer segmentation and behavioral analysis

// Add compound indexes for segmentation queries
db.customer_insights.createIndex({ "metadata.segmentName": 1, timestamp: -1 });
db.customer_insights.createIndex({ value: 1, insightType: 1 });
db.customer_insights.createIndex({ "metadata.totalSpent": -1 });

print("Compound indexes created");

// Sample aggregation for customer segments
print("\nCreating customer segment analysis...");
db.customer_insights.aggregate([
  {
    $match: {
      insightType: { $in: ["LIFETIME_VALUE", "ENGAGEMENT_SCORE", "CHURN_RISK"] },
      timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: {
        userId: "$userId",
        insightType: "$insightType"
      },
      latestValue: { $last: "$value" },
      latestTimestamp: { $last: "$timestamp" },
      metadata: { $last: "$metadata" }
    }
  },
  {
    $group: {
      _id: "$_id.userId",
      insights: {
        $push: {
          type: "$_id.insightType",
          value: "$latestValue",
          timestamp: "$latestTimestamp",
          metadata: "$metadata"
        }
      }
    }
  },
  {
    $project: {
      userId: "$_id",
      insights: 1,
      _id: 0
    }
  },
  {
    $limit: 5
  }
]).forEach(function(customer) {
  print("Customer " + customer.userId + ":");
  customer.insights.forEach(function(insight) {
    print("  - " + insight.type + ": " + insight.value);
  });
});

print("\n✓ Phase 2 complete - Added customer segmentation capabilities");

// Phase 3: Customer intelligence views and predictive analytics

// Drop existing views if they exist
try { db.customer_segments.drop(); } catch(e) {}
try { db.customer_lifetime_value.drop(); } catch(e) {}
try { db.churn_analysis.drop(); } catch(e) {}

// 1. Customer segments view
db.createView("customer_segments", "customer_insights", [
  {
    $match: {
      insightType: "LOYALTY_TIER",
      timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $sort: { userId: 1, timestamp: -1 }
  },
  {
    $group: {
      _id: "$userId",
      currentTier: { $first: "$value" },
      segmentName: { $first: "$metadata.segmentName" },
      totalSpent: { $first: "$metadata.totalSpent" },
      lastUpdated: { $first: "$timestamp" }
    }
  },
  {
    $group: {
      _id: "$currentTier",
      customerCount: { $sum: 1 },
      totalRevenue: { $sum: "$totalSpent" },
      avgCustomerValue: { $avg: "$totalSpent" },
      customers: { $push: "$_id" }
    }
  },
  {
    $project: {
      tier: "$_id",
      customerCount: 1,
      totalRevenue: { $round: ["$totalRevenue", 2] },
      avgCustomerValue: { $round: ["$avgCustomerValue", 2] },
      topCustomers: { $slice: ["$customers", 5] },
      _id: 0
    }
  },
  {
    $sort: { avgCustomerValue: -1 }
  }
]);

// 2. Customer lifetime value analysis view
db.createView("customer_lifetime_value", "customer_insights", [
  {
    $match: {
      insightType: { $in: ["LIFETIME_VALUE", "PURCHASE_FREQUENCY", "AVERAGE_ORDER_VALUE"] }
    }
  },
  {
    $sort: { userId: 1, insightType: 1, timestamp: -1 }
  },
  {
    $group: {
      _id: {
        userId: "$userId",
        insightType: "$insightType"
      },
      currentValue: { $first: "$value" },
      metadata: { $first: "$metadata" },
      lastUpdated: { $first: "$timestamp" }
    }
  },
  {
    $group: {
      _id: "$_id.userId",
      metrics: {
        $push: {
          type: "$_id.insightType",
          value: "$currentValue",
          metadata: "$metadata"
        }
      }
    }
  },
  {
    $project: {
      userId: "$_id",
      lifetimeValue: {
        $arrayElemAt: [
          {
            $map: {
              input: {
                $filter: {
                  input: "$metrics",
                  cond: { $eq: ["$$this.type", "LIFETIME_VALUE"] }
                }
              },
              in: "$$this.value"
            }
          },
          0
        ]
      },
      purchaseFrequency: {
        $arrayElemAt: [
          {
            $map: {
              input: {
                $filter: {
                  input: "$metrics",
                  cond: { $eq: ["$$this.type", "PURCHASE_FREQUENCY"] }
                }
              },
              in: "$$this.value"
            }
          },
          0
        ]
      },
      avgOrderValue: {
        $arrayElemAt: [
          {
            $map: {
              input: {
                $filter: {
                  input: "$metrics",
                  cond: { $eq: ["$$this.type", "AVERAGE_ORDER_VALUE"] }
                }
              },
              in: "$$this.value"
            }
          },
          0
        ]
      },
      _id: 0
    }
  },
  {
    $sort: { lifetimeValue: -1 }
  }
]);

// 3. Churn risk analysis view
db.createView("churn_analysis", "customer_insights", [
  {
    $match: {
      insightType: { $in: ["CHURN_RISK", "ENGAGEMENT_SCORE"] },
      timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $sort: { userId: 1, insightType: 1, timestamp: -1 }
  },
  {
    $group: {
      _id: {
        userId: "$userId",
        insightType: "$insightType"
      },
      currentValue: { $first: "$value" },
      metadata: { $first: "$metadata" }
    }
  },
  {
    $group: {
      _id: "$_id.userId",
      churnRisk: {
        $max: {
          $cond: [
            { $eq: ["$_id.insightType", "CHURN_RISK"] },
            "$currentValue",
            null
          ]
        }
      },
      engagementScore: {
        $max: {
          $cond: [
            { $eq: ["$_id.insightType", "ENGAGEMENT_SCORE"] },
            "$currentValue",
            null
          ]
        }
      },
      lastPurchase: {
        $max: {
          $cond: [
            { $eq: ["$_id.insightType", "CHURN_RISK"] },
            "$metadata.lastPurchaseDate",
            null
          ]
        }
      }
    }
  },
  {
    $project: {
      userId: "$_id",
      churnRisk: { $ifNull: ["$churnRisk", "unknown"] },
      engagementScore: { $ifNull: ["$engagementScore", 0] },
      daysSinceLastPurchase: {
        $cond: [
          { $ne: ["$lastPurchase", null] },
          {
            $floor: {
              $divide: [
                { $subtract: [new Date(), "$lastPurchase"] },
                1000 * 60 * 60 * 24
              ]
            }
          },
          null
        ]
      },
      _id: 0
    }
  },
  {
    $sort: { churnRisk: -1, engagementScore: 1 }
  }
]);

print("Customer intelligence views created: customer_segments, customer_lifetime_value, churn_analysis");

// Helper function for customer insights
function getCustomerProfile(userId) {
  return db.customer_insights.aggregate([
    {
      $match: { userId: userId }
    },
    {
      $sort: { insightType: 1, timestamp: -1 }
    },
    {
      $group: {
        _id: "$insightType",
        currentValue: { $first: "$value" },
        previousValue: { $first: "$metadata.previousValue" },
        lastUpdated: { $first: "$timestamp" },
        metadata: { $first: "$metadata" }
      }
    },
    {
      $project: {
        insightType: "$_id",
        currentValue: 1,
        previousValue: 1,
        lastUpdated: 1,
        trend: {
          $cond: [
            { $and: [
              { $ne: ["$previousValue", null] },
              { $isNumber: "$currentValue" },
              { $isNumber: "$previousValue" }
            ]},
            {
              $cond: [
                { $gt: ["$currentValue", "$previousValue"] },
                "increasing",
                {
                  $cond: [
                    { $lt: ["$currentValue", "$previousValue"] },
                    "decreasing",
                    "stable"
                  ]
                }
              ]
            },
            null
          ]
        },
        _id: 0
      }
    }
  ]).toArray();
}

// Note: getCustomerProfile function is available for use in application code
// Usage: getCustomerProfile(userId)

print("\n✓ Phase 3 complete - Customer intelligence views created");
print("\n✓ Customer insights setup complete!");
