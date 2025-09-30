// Test script for user content functions
print("=== Testing User Content Functions ===\n");

// Connect to database
db = db.getSiblingDB('tickettoken');

// Create test data
print("Creating test data...");

const testUsers = ["USER_001", "USER_002", "USER_003", "USER_004", "USER_005"];
const testEvents = ["EVENT_001", "EVENT_002", "EVENT_003"];
const testVenues = ["VENUE_001", "VENUE_002"];

let insertedCount = 0;

// Create reviews
testUsers.forEach((userId, userIdx) => {
  testEvents.forEach((eventId, eventIdx) => {
    if (Math.random() > 0.3) { // 70% chance of review
      db.user_content.insertOne({
        userId: userId,
        contentType: "REVIEW",
        targetType: "EVENT",
        targetId: eventId,
        status: userIdx === 0 ? "PENDING_MODERATION" : "APPROVED",
        content: {
          title: `Great event at ${eventId}!`,
          text: `Had an amazing time at this event. The atmosphere was incredible and the performance was outstanding.`,
          rating: {
            overall: 3 + Math.floor(Math.random() * 3), // 3-5 rating
            categories: {
              atmosphere: 4 + Math.floor(Math.random() * 2),
              valueForMoney: 3 + Math.floor(Math.random() * 3),
              experience: 4 + Math.floor(Math.random() * 2)
            }
          }
        },
        eventDetails: {
          eventDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          ticketType: "General Admission",
          verified: true
        },
        engagement: {
          likes: NumberLong(Math.floor(Math.random() * 100).toString()),
          views: NumberLong(Math.floor(Math.random() * 500).toString()),
          helpful: NumberLong(Math.floor(Math.random() * 50).toString()),
          notHelpful: NumberLong(Math.floor(Math.random() * 10).toString())
        },
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
      });
      insertedCount++;
    }
  });
  
  // Create photos
  if (Math.random() > 0.4) { // 60% chance of photo
    db.user_content.insertOne({
      userId: userId,
      contentType: "PHOTO",
      targetType: "EVENT",
      targetId: testEvents[Math.floor(Math.random() * testEvents.length)],
      status: "APPROVED",
      content: {
        media: {
          url: `/uploads/photos/${userId}_event_photo.jpg`,
          thumbnailUrl: `/uploads/photos/${userId}_event_thumb.jpg`,
          mimeType: "image/jpeg",
          caption: "Amazing night at the show!",
          dimensions: {
            width: 1920,
            height: 1080
          },
          fileSize: NumberLong("2048000")
        },
        hashtags: ["#livemusic", "#concert", "#nightout"]
      },
      engagement: {
        likes: NumberLong(Math.floor(Math.random() * 200).toString()),
        shares: NumberLong(Math.floor(Math.random() * 50).toString()),
        views: NumberLong(Math.floor(Math.random() * 1000).toString())
      },
      createdAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
      updatedAt: new Date()
    });
    insertedCount++;
  }
});

print(`✓ Created ${insertedCount} test documents\n`);

// Load the functions
load("database/mongodb/collections/content/user_content.js");

// Test the functions
print("1. Testing getUserReviews function:");
const reviews = getUserReviews("EVENT", "EVENT_001", { limit: 5 });
print(`   Found ${reviews.length} reviews for EVENT_001`);
if (reviews.length > 0) {
  print(`   First review rating: ${reviews[0].content?.rating?.overall || 'N/A'}`);
}

print("\n2. Testing getContentStatistics function:");
const stats = getContentStatistics("EVENT", "EVENT_001");
print(`   Content statistics for EVENT_001:`);
stats.forEach(stat => {
  print(`   - ${stat.contentType}: ${stat.count} items, avg rating: ${stat.avgRating || 'N/A'}`);
});

print("\n3. Testing getTrendingContent function:");
const trending = getTrendingContent(null, 24);
print(`   Found ${trending.length} trending items in last 24 hours`);

print("\n4. Testing getUserContentSummary function:");
const userSummary = getUserContentSummary("USER_001", 30);
print(`   User content summary for USER_001:`);
userSummary.forEach(summary => {
  print(`   - ${summary.contentType}: ${summary.stats.total} total (${summary.stats.approved} approved)`);
});

print("\n✓ All functions tested successfully!");

// Clean up
print("\nCleaning up test data...");
db.user_content.deleteMany({ userId: { $in: testUsers } });
print("✓ Test data cleaned up");
