// TicketToken Platform - Business Intelligence
// Purpose: Aggregate business metrics for executive dashboards and strategic insights

// Database: tickettoken
// Collection: business_intelligence

// Phase 1: Basic business metrics structure

// Check if collection exists
const collections = db.getCollectionNames();
if (collections.includes("business_intelligence")) {
  print("Business intelligence collection already exists - skipping creation");
} else {
  // Create the collection with validation
  db.createCollection("business_intelligence", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["timestamp", "metricCategory", "metricName", "value"],
        properties: {
          timestamp: {
            bsonType: "date",
            description: "When the metric was calculated"
          },
          metricCategory: {
            enum: [
              "REVENUE",
              "OPERATIONS",
              "CUSTOMER",
              "MARKET",
              "PLATFORM",
              "FORECAST"
            ],
            description: "Category of business metric"
          },
          metricName: {
            bsonType: "string",
            description: "Specific metric name"
          },
          value: {
            bsonType: ["number", "object"],
            description: "Metric value (numeric or complex)"
          },
          metadata: {
            bsonType: "object",
            description: "Additional metric context",
            properties: {
              period: { bsonType: "string" },
              comparison: { bsonType: "string" },
              trend: { bsonType: "string" },
              confidence: { bsonType: "number" },
              dataPoints: { bsonType: "number" },
              breakdown: { bsonType: "object" }
            }
          }
        }
      }
    }
  });
  print("Business intelligence collection created successfully!");
}

// Create basic indexes
db.business_intelligence.createIndex({ timestamp: -1 });
db.business_intelligence.createIndex({ metricCategory: 1, timestamp: -1 });
db.business_intelligence.createIndex({ metricName: 1, timestamp: -1 });
db.business_intelligence.createIndex({ metricCategory: 1, metricName: 1, timestamp: -1 });

// TTL index - keep business intelligence for 5 years
db.business_intelligence.createIndex({ timestamp: 1 }, { expireAfterSeconds: 157680000 });

print("Basic indexes created");

print("\n✓ Phase 1 complete - Basic business intelligence structure");

// Phase 2: KPI calculations and executive dashboards

// Add compound indexes for dashboard queries
db.business_intelligence.createIndex({ "metadata.period": 1, metricCategory: 1 });
db.business_intelligence.createIndex({ metricName: 1, "metadata.period": 1 });

print("Compound indexes created");

// Sample KPI aggregation
print("\nCreating KPI dashboard aggregation...");
db.business_intelligence.aggregate([
  {
    $match: {
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: "$metricCategory",
      metrics: {
        $push: {
          name: "$metricName",
          value: "$value",
          trend: "$metadata.trend"
        }
      },
      count: { $sum: 1 }
    }
  },
  {
    $project: {
      category: "$_id",
      metricCount: "$count",
      latestMetrics: { $slice: ["$metrics", -3] },
      _id: 0
    }
  },
  {
    $sort: { category: 1 }
  }
]).forEach(function(category) {
  print("Category: " + category.category);
  category.latestMetrics.forEach(function(metric) {
    print("  - " + metric.name + ": " + 
          (typeof metric.value === "object" ? JSON.stringify(metric.value) : metric.value) +
          (metric.trend ? " (" + metric.trend + ")" : ""));
  });
});

// Calculate business health score
print("\nCalculating business health score...");
const healthMetrics = db.business_intelligence.aggregate([
  {
    $match: {
      metricName: { $in: ["daily_revenue", "active_users", "platform_health"] },
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: "$metricName",
      latestValue: { $last: "$value" },
      trend: { $last: "$metadata.trend" }
    }
  }
]).toArray();

let healthScore = 0;
healthMetrics.forEach(function(metric) {
  if(metric._id === "daily_revenue" && metric.latestValue > 100000) healthScore += 33;
  if(metric._id === "active_users" && metric.latestValue > 10000) healthScore += 33;
  if(metric._id === "platform_health" && metric.latestValue.uptime > 99) healthScore += 34;
});

print("Business Health Score: " + healthScore + "/100");

print("\n✓ Phase 2 complete - Added KPI dashboard capabilities");

// Phase 3: Executive dashboards and strategic analytics views

// Drop existing views if they exist
try { db.executive_dashboard.drop(); } catch(e) {}
try { db.revenue_insights.drop(); } catch(e) {}
try { db.operational_metrics.drop(); } catch(e) {}

// 1. Executive dashboard view
db.createView("executive_dashboard", "business_intelligence", [
  {
    $match: {
      timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $sort: { metricName: 1, timestamp: -1 }
  },
  {
    $group: {
      _id: {
        category: "$metricCategory",
        metric: "$metricName"
      },
      currentValue: { $first: "$value" },
      previousValue: { $last: "$value" },
      trend: { $first: "$metadata.trend" },
      dataPoints: { $sum: 1 },
      avgValue: { $avg: { $cond: [{ $isNumber: "$value" }, "$value", null] } }
    }
  },
  {
    $project: {
      category: "$_id.category",
      metric: "$_id.metric",
      currentValue: 1,
      previousValue: 1,
      trend: 1,
      dataPoints: 1,
      avgValue: { $round: ["$avgValue", 2] },
      changePercent: {
        $cond: [
          { $and: [
            { $isNumber: "$currentValue" },
            { $isNumber: "$previousValue" },
            { $ne: ["$previousValue", 0] }
          ]},
          {
            $round: [
              {
                $multiply: [
                  { $divide: [
                    { $subtract: ["$currentValue", "$previousValue"] },
                    "$previousValue"
                  ]},
                  100
                ]
              },
              2
            ]
          },
          null
        ]
      },
      _id: 0
    }
  },
  {
    $sort: { category: 1, metric: 1 }
  }
]);

// 2. Revenue insights view
db.createView("revenue_insights", "business_intelligence", [
  {
    $match: {
      metricCategory: "REVENUE"
    }
  },
  {
    $group: {
      _id: {
        period: "$metadata.period",
        metric: "$metricName"
      },
      value: { $first: "$value" },
      breakdown: { $first: "$metadata.breakdown" },
      timestamp: { $first: "$timestamp" }
    }
  },
  {
    $group: {
      _id: "$_id.period",
      totalRevenue: {
        $sum: {
          $cond: [{ $eq: ["$_id.metric", "daily_revenue"] }, "$value", 0]
        }
      },
      metrics: {
        $push: {
          metric: "$_id.metric",
          value: "$value",
          breakdown: "$breakdown"
        }
      },
      date: { $first: "$timestamp" }
    }
  },
  {
    $project: {
      period: "$_id",
      date: 1,
      totalRevenue: { $round: ["$totalRevenue", 2] },
      breakdown: { $first: "$metrics.breakdown" },
      metrics: 1,
      _id: 0
    }
  },
  {
    $sort: { date: -1 }
  }
]);

// 3. Operational metrics view
db.createView("operational_metrics", "business_intelligence", [
  {
    $match: {
      metricCategory: { $in: ["OPERATIONS", "PLATFORM"] },
      timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: {
        week: { $week: "$timestamp" },
        year: { $year: "$timestamp" },
        metric: "$metricName"
      },
      values: { $push: "$value" },
      count: { $sum: 1 }
    }
  },
  {
    $project: {
      week: "$_id.week",
      year: "$_id.year",
      metric: "$_id.metric",
      avgValue: { 
        $avg: {
          $map: {
            input: "$values",
            in: { $cond: [{ $isNumber: "$$this" }, "$$this", null] }
          }
        }
      },
      dataPoints: "$count",
      _id: 0
    }
  },
  {
    $sort: { year: -1, week: -1, metric: 1 }
  }
]);

print("Executive views created: executive_dashboard, revenue_insights, operational_metrics");

// Helper function for strategic insights
function getStrategicInsights(days = 30) {
  return db.business_intelligence.aggregate([
    {
      $match: {
        timestamp: { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
      }
    },
    {
      $group: {
        _id: "$metricCategory",
        metrics: {
          $push: {
            name: "$metricName",
            value: "$value",
            timestamp: "$timestamp"
          }
        }
      }
    },
    {
      $project: {
        category: "$_id",
        metricCount: { $size: "$metrics" },
        latestMetrics: { $slice: ["$metrics", -5] },
        _id: 0
      }
    }
  ]).toArray();
}

// Note: getStrategicInsights function is available for use in application code
// Usage: getStrategicInsights(days)

print("\n✓ Phase 3 complete - Executive dashboards and strategic analytics created");
print("\n✓ Business intelligence setup complete!");
