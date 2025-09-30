// TicketToken Platform - Payment Analytics
// Purpose: Track payment processing, revenue streams, and financial insights

// Database: tickettoken
// Collection: payment_analytics

// Phase 1: Basic payment metrics structure

// Check if collection exists
const collections = db.getCollectionNames();
if (collections.includes("payment_analytics")) {
  print("Payment analytics collection already exists - skipping creation");
} else {
  // Create the collection with validation
  db.createCollection("payment_analytics", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["timestamp", "metricType", "value"],
        properties: {
          timestamp: {
            bsonType: "date",
            description: "When the payment metric was recorded"
          },
          metricType: {
            enum: [
              "PAYMENT_PROCESSED",
              "PAYMENT_FAILED",
              "PAYMENT_REFUNDED",
              "PAYMENT_DISPUTED",
              "PAYOUT_SENT",
              "FEE_COLLECTED",
              "REVENUE_SHARE",
              "TAX_COLLECTED",
              "CHARGEBACK",
              "SETTLEMENT"
            ],
            description: "Type of payment metric"
          },
          value: {
            bsonType: "number",
            description: "Payment amount"
          },
          metadata: {
            bsonType: "object",
            description: "Additional payment context",
            properties: {
              paymentId: { bsonType: "string" },
              orderId: { bsonType: "string" },
              userId: { bsonType: "string" },
              eventId: { bsonType: "string" },
              venueId: { bsonType: "string" },
              paymentMethod: { bsonType: "string" },
              currency: { bsonType: "string" },
              processingFee: { bsonType: "number" },
              netAmount: { bsonType: "number" },
              failureReason: { bsonType: "string" }
            }
          }
        }
      }
    }
  });
  print("Payment analytics collection created successfully!");
}

// Create basic indexes
db.payment_analytics.createIndex({ timestamp: -1 });
db.payment_analytics.createIndex({ metricType: 1, timestamp: -1 });
db.payment_analytics.createIndex({ "metadata.eventId": 1, timestamp: -1 });
db.payment_analytics.createIndex({ "metadata.userId": 1, timestamp: -1 });

// TTL index - keep payment analytics for 7 years (regulatory requirement)
db.payment_analytics.createIndex({ timestamp: 1 }, { expireAfterSeconds: 220752000 });

print("Basic indexes created");

print("\n✓ Phase 1 complete - Basic payment analytics structure");

// Phase 2: Financial analysis and reporting

// Add compound indexes for complex queries
db.payment_analytics.createIndex({ "metadata.venueId": 1, metricType: 1, timestamp: -1 });
db.payment_analytics.createIndex({ "metadata.paymentMethod": 1, timestamp: -1 });
db.payment_analytics.createIndex({ metricType: 1, "metadata.currency": 1 });

print("Compound indexes created");

// Sample aggregation for daily revenue
print("\nCreating daily revenue analysis...");
db.payment_analytics.aggregate([
  {
    $match: {
      metricType: "PAYMENT_PROCESSED",
      timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: {
        date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
        currency: "$metadata.currency"
      },
      totalRevenue: { $sum: "$value" },
      transactionCount: { $sum: 1 },
      avgTransaction: { $avg: "$value" },
      totalFees: { $sum: "$metadata.processingFee" },
      netRevenue: { $sum: "$metadata.netAmount" }
    }
  },
  {
    $project: {
      date: "$_id.date",
      currency: "$_id.currency",
      totalRevenue: { $round: ["$totalRevenue", 2] },
      transactionCount: 1,
      avgTransaction: { $round: ["$avgTransaction", 2] },
      totalFees: { $round: ["$totalFees", 2] },
      netRevenue: { $round: ["$netRevenue", 2] },
      _id: 0
    }
  },
  {
    $sort: { date: -1 }
  }
]).forEach(function(daily) {
  print("Date: " + daily.date + " - Revenue: $" + daily.totalRevenue + 
        " (" + daily.transactionCount + " transactions)");
});

// Payment method analysis
print("\nPayment method breakdown:");
db.payment_analytics.aggregate([
  {
    $match: {
      metricType: "PAYMENT_PROCESSED"
    }
  },
  {
    $group: {
      _id: "$metadata.paymentMethod",
      count: { $sum: 1 },
      totalValue: { $sum: "$value" },
      avgValue: { $avg: "$value" }
    }
  },
  {
    $project: {
      paymentMethod: "$_id",
      count: 1,
      totalValue: { $round: ["$totalValue", 2] },
      avgValue: { $round: ["$avgValue", 2] },
      _id: 0
    }
  }
]).forEach(function(method) {
  print(" - " + (method.paymentMethod || "Unknown") + ": " + 
        method.count + " payments, avg $" + method.avgValue);
});

print("\n✓ Phase 2 complete - Added financial analysis capabilities");

// Phase 3: Financial reporting views and advanced analytics

// Drop existing views if they exist
try { db.payment_daily_summary.drop(); } catch(e) {}
try { db.payment_failure_analysis.drop(); } catch(e) {}
try { db.revenue_by_event.drop(); } catch(e) {}

// 1. Daily payment summary view
db.createView("payment_daily_summary", "payment_analytics", [
  {
    $group: {
      _id: {
        date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
        metricType: "$metricType",
        currency: "$metadata.currency"
      },
      count: { $sum: 1 },
      totalValue: { $sum: "$value" },
      avgValue: { $avg: "$value" }
    }
  },
  {
    $group: {
      _id: {
        date: "$_id.date",
        currency: "$_id.currency"
      },
      processed: {
        $sum: {
          $cond: [{ $eq: ["$_id.metricType", "PAYMENT_PROCESSED"] }, "$count", 0]
        }
      },
      failed: {
        $sum: {
          $cond: [{ $eq: ["$_id.metricType", "PAYMENT_FAILED"] }, "$count", 0]
        }
      },
      refunded: {
        $sum: {
          $cond: [{ $eq: ["$_id.metricType", "PAYMENT_REFUNDED"] }, "$count", 0]
        }
      },
      revenue: {
        $sum: {
          $cond: [{ $eq: ["$_id.metricType", "PAYMENT_PROCESSED"] }, "$totalValue", 0]
        }
      },
      fees: {
        $sum: {
          $cond: [{ $eq: ["$_id.metricType", "FEE_COLLECTED"] }, "$totalValue", 0]
        }
      }
    }
  },
  {
    $project: {
      date: "$_id.date",
      currency: "$_id.currency",
      processed: 1,
      failed: 1,
      refunded: 1,
      revenue: { $round: ["$revenue", 2] },
      fees: { $round: ["$fees", 2] },
      netRevenue: { $round: [{ $subtract: ["$revenue", "$fees"] }, 2] },
      successRate: {
        $round: [
          {
            $multiply: [
              { $divide: ["$processed", { $add: ["$processed", "$failed"] }] },
              100
            ]
          },
          2
        ]
      },
      _id: 0
    }
  },
  {
    $sort: { date: -1, currency: 1 }
  }
]);

// 2. Payment failure analysis view
db.createView("payment_failure_analysis", "payment_analytics", [
  {
    $match: {
      metricType: "PAYMENT_FAILED"
    }
  },
  {
    $group: {
      _id: {
        reason: "$metadata.failureReason",
        paymentMethod: "$metadata.paymentMethod",
        date: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } }
      },
      failureCount: { $sum: 1 },
      totalValue: { $sum: "$value" }
    }
  },
  {
    $project: {
      date: "$_id.date",
      reason: "$_id.reason",
      paymentMethod: "$_id.paymentMethod",
      failureCount: 1,
      totalValue: { $round: ["$totalValue", 2] },
      _id: 0
    }
  },
  {
    $sort: { date: -1, failureCount: -1 }
  }
]);

// 3. Revenue by event view
db.createView("revenue_by_event", "payment_analytics", [
  {
    $match: {
      metricType: "PAYMENT_PROCESSED",
      "metadata.eventId": { $exists: true }
    }
  },
  {
    $group: {
      _id: {
        eventId: "$metadata.eventId",
        currency: "$metadata.currency"
      },
      totalRevenue: { $sum: "$value" },
      totalFees: { $sum: "$metadata.processingFee" },
      transactionCount: { $sum: 1 },
      uniqueUsers: { $addToSet: "$metadata.userId" },
      paymentMethods: { $addToSet: "$metadata.paymentMethod" }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      currency: "$_id.currency",
      totalRevenue: { $round: ["$totalRevenue", 2] },
      totalFees: { $round: ["$totalFees", 2] },
      netRevenue: { $round: [{ $subtract: ["$totalRevenue", "$totalFees"] }, 2] },
      transactionCount: 1,
      uniqueUserCount: { $size: "$uniqueUsers" },
      paymentMethodCount: { $size: "$paymentMethods" },
      avgTransactionValue: {
        $round: [{ $divide: ["$totalRevenue", "$transactionCount"] }, 2]
      },
      _id: 0
    }
  },
  {
    $sort: { totalRevenue: -1 }
  }
]);

print("Financial views created: payment_daily_summary, payment_failure_analysis, revenue_by_event");

// Helper function for payment analytics
function getPaymentHealth(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return db.payment_analytics.aggregate([
    {
      $match: {
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: "$metricType",
        count: { $sum: 1 },
        totalValue: { $sum: "$value" }
      }
    },
    {
      $group: {
        _id: null,
        metrics: {
          $push: {
            type: "$_id",
            count: "$count",
            value: "$totalValue"
          }
        },
        totalProcessed: {
          $sum: {
            $cond: [{ $eq: ["$_id", "PAYMENT_PROCESSED"] }, "$count", 0]
          }
        },
        totalFailed: {
          $sum: {
            $cond: [{ $eq: ["$_id", "PAYMENT_FAILED"] }, "$count", 0]
          }
        }
      }
    },
    {
      $project: {
        metrics: 1,
        successRate: {
          $round: [
            {
              $multiply: [
                { $divide: ["$totalProcessed", { $add: ["$totalProcessed", "$totalFailed"] }] },
                100
              ]
            },
            2
          ]
        },
        _id: 0
      }
    }
  ]).toArray();
}

// Note: getPaymentHealth function is available for use in application code
// Usage: getPaymentHealth(days)

print("\n✓ Phase 3 complete - Financial reporting views created");
print("\n✓ Payment analytics setup complete!");
