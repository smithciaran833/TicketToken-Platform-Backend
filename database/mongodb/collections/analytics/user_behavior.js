// TicketToken Platform - User Behavior Analytics
// Purpose: Track and analyze user behavior for insights and personalization

// Database: tickettoken
// Collection: user_behavior

// Check if collection exists
const collections = db.getCollectionNames();
if (collections.includes("user_behavior")) {
  print("User behavior collection already exists - skipping creation");
} else {
  // Create the collection with validation
  db.createCollection("user_behavior", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["userId", "timestamp", "action", "sessionId"],
        properties: {
          userId: {
            bsonType: "string",
            description: "User ID from PostgreSQL"
          },
          sessionId: {
            bsonType: "string",
            description: "Session ID for tracking user journey"
          },
          timestamp: {
            bsonType: "date",
            description: "When the action occurred"
          },
          action: {
            enum: [
              "PAGE_VIEW",
              "EVENT_VIEW",
              "TICKET_SEARCH",
              "ADD_TO_CART",
              "REMOVE_FROM_CART",
              "CHECKOUT_START",
              "CHECKOUT_COMPLETE",
              "CHECKOUT_ABANDON",
              "TICKET_TRANSFER",
              "LISTING_CREATE",
              "LISTING_VIEW",
              "SOCIAL_SHARE",
              "FILTER_APPLY",
              "SORT_CHANGE"
            ],
            description: "Type of action performed"
          },
          actionDetails: {
            bsonType: "object",
            description: "Additional details about the action",
            properties: {
              eventId: { bsonType: "string" },
              eventName: { bsonType: "string" },
              venueId: { bsonType: "string" },
              venueName: { bsonType: "string" },
              ticketId: { bsonType: "string" },
              ticketType: { bsonType: "string" },
              price: { bsonType: "number" },
              quantity: { bsonType: "number" },
              searchQuery: { bsonType: "string" },
              filters: { bsonType: "object" },
              sortBy: { bsonType: "string" },
              pageUrl: { bsonType: "string" },
              referrer: { bsonType: "string" },
              duration: { bsonType: "number" }
            }
          },
          device: {
            bsonType: "object",
            description: "Device information",
            properties: {
              type: { enum: ["desktop", "mobile", "tablet"] },
              browser: { bsonType: "string" },
              os: { bsonType: "string" },
              viewport: {
                bsonType: "object",
                properties: {
                  width: { bsonType: "number" },
                  height: { bsonType: "number" }
                }
              }
            }
          },
          location: {
            bsonType: "object",
            description: "User location data",
            properties: {
              country: { bsonType: "string" },
              region: { bsonType: "string" },
              city: { bsonType: "string" }
            }
          },
          performance: {
            bsonType: "object",
            description: "Performance metrics",
            properties: {
              pageLoadTime: { bsonType: "number" },
              apiResponseTime: { bsonType: "number" }
            }
          }
        }
      }
    }
  });
  print("User behavior collection created successfully!");
}

// Create indexes for efficient querying
db.user_behavior.createIndex({ userId: 1, timestamp: -1 });
db.user_behavior.createIndex({ sessionId: 1, timestamp: 1 });
db.user_behavior.createIndex({ action: 1, timestamp: -1 });
db.user_behavior.createIndex({ "actionDetails.eventId": 1, action: 1 });
db.user_behavior.createIndex({ timestamp: -1 });

// TTL index to automatically remove old data after 90 days
db.user_behavior.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

print("Indexes created:");
db.user_behavior.getIndexes().forEach(function(index) {
  print(" - " + JSON.stringify(index.key));
});

// Drop and recreate views to ensure they're up to date
try {
  db.user_journeys.drop();
} catch(e) {}

try {
  db.conversion_funnel.drop();
} catch(e) {}

// 1. User journey view - shows user's path through the site
db.createView("user_journeys", "user_behavior", [
  {
    $match: {
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  },
  {
    $sort: { userId: 1, timestamp: 1 }
  },
  {
    $group: {
      _id: {
        userId: "$userId",
        sessionId: "$sessionId"
      },
      journey: {
        $push: {
          action: "$action",
          timestamp: "$timestamp",
          details: "$actionDetails"
        }
      },
      startTime: { $first: "$timestamp" },
      endTime: { $last: "$timestamp" },
      actionCount: { $sum: 1 }
    }
  },
  {
    $project: {
      userId: "$_id.userId",
      sessionId: "$_id.sessionId",
      journey: 1,
      sessionDuration: {
        $divide: [
          { $subtract: ["$endTime", "$startTime"] },
          1000
        ]
      },
      actionCount: 1,
      _id: 0
    }
  }
]);

// 2. Conversion funnel view
db.createView("conversion_funnel", "user_behavior", [
  {
    $match: {
      action: {
        $in: ["EVENT_VIEW", "ADD_TO_CART", "CHECKOUT_START", "CHECKOUT_COMPLETE"]
      }
    }
  },
  {
    $group: {
      _id: {
        userId: "$userId",
        eventId: "$actionDetails.eventId"
      },
      steps: {
        $addToSet: "$action"
      }
    }
  },
  {
    $project: {
      userId: "$_id.userId",
      eventId: "$_id.eventId",
      viewedEvent: {
        $in: ["EVENT_VIEW", "$steps"]
      },
      addedToCart: {
        $in: ["ADD_TO_CART", "$steps"]
      },
      startedCheckout: {
        $in: ["CHECKOUT_START", "$steps"]
      },
      completedCheckout: {
        $in: ["CHECKOUT_COMPLETE", "$steps"]
      },
      _id: 0
    }
  }
]);

print("Analytics views created: user_journeys, conversion_funnel");

// Sample aggregation pipeline for popular events
print("\nSample aggregation - Most viewed events today:");
db.user_behavior.aggregate([
  {
    $match: {
      action: "EVENT_VIEW",
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: "$actionDetails.eventId",
      eventName: { $first: "$actionDetails.eventName" },
      viewCount: { $sum: 1 },
      uniqueUsers: { $addToSet: "$userId" }
    }
  },
  {
    $project: {
      eventId: "$_id",
      eventName: 1,
      viewCount: 1,
      uniqueUserCount: { $size: "$uniqueUsers" },
      _id: 0
    }
  },
  {
    $sort: { viewCount: -1 }
  },
  {
    $limit: 5
  }
]).forEach(function(event) {
  print(" - " + (event.eventName || event.eventId) + ": " + event.viewCount + " views");
});

print("\n✓ User behavior analytics setup complete!");
