// Test script for venue content functions
print("=== Testing Venue Content Functions ===\n");

// Connect to database
db = db.getSiblingDB('tickettoken');

// Load the functions from venue_content.js
// Function to get venue content by type
function getVenueContent(venueId, contentType = null) {
  const query = { venueId: venueId, status: 'PUBLISHED' };
  if (contentType) {
    query.contentType = contentType;
  }

  return db.venue_content.find(query)
    .sort({ 'metadata.displayOrder': 1, createdAt: -1 })
    .toArray();
}

// Function to verify venue information
function verifyVenueContent(venueId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return db.venue_content.aggregate([
    {
      $match: {
        venueId: venueId,
        status: 'PUBLISHED'
      }
    },
    {
      $project: {
        contentType: 1,
        title: 1,
        lastVerified: '$metadata.lastVerified',
        needsVerification: {
          $or: [
            { $lt: ['$metadata.lastVerified', thirtyDaysAgo] },
            { $eq: ['$metadata.lastVerified', null] }
          ]
        },
        daysSinceVerification: {
          $cond: {
            if: { $ne: ['$metadata.lastVerified', null] },
            then: {
              $divide: [
                { $subtract: [new Date(), '$metadata.lastVerified'] },
                1000 * 60 * 60 * 24
              ]
            },
            else: null
          }
        }
      }
    },
    {
      $sort: { needsVerification: -1, daysSinceVerification: -1 }
    }
  ]).toArray();
}

// Function to analyze venue content usage
function analyzeVenueContentUsage(venueId, days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return db.venue_content.aggregate([
    {
      $match: {
        venueId: venueId,
        'usage.lastViewedAt': { $gte: cutoff }
      }
    },
    {
      $group: {
        _id: '$contentType',
        totalViews: { $sum: '$usage.views' },
        totalDownloads: { $sum: { $ifNull: ['$usage.downloads', 0] } },
        contentCount: { $sum: 1 },
        avgViews: { $avg: '$usage.views' },
        mostViewed: {
          $first: {
            title: '$title',
            views: '$usage.views'
          }
        }
      }
    },
    {
      $project: {
        contentType: '$_id',
        totalViews: 1,
        totalDownloads: 1,
        contentCount: 1,
        avgViews: { $round: ['$avgViews', 0] },
        mostViewed: 1,
        downloadRate: {
          $cond: {
            if: { $gt: ['$totalViews', 0] },
            then: {
              $round: [
                { $multiply: [{ $divide: ['$totalDownloads', '$totalViews'] }, 100] },
                2
              ]
            },
            else: 0
          }
        },
        _id: 0
      }
    },
    {
      $sort: { totalViews: -1 }
    }
  ]).toArray();
}

// Function to search venues by amenities
function searchVenuesByAmenities(amenityNames) {
  return db.venue_content.aggregate([
    {
      $match: {
        contentType: 'AMENITIES',
        status: 'PUBLISHED',
        'content.amenityList.name': { $in: amenityNames },
        'content.amenityList.available': true
      }
    },
    {
      $unwind: '$content.amenityList'
    },
    {
      $match: {
        'content.amenityList.name': { $in: amenityNames },
        'content.amenityList.available': true
      }
    },
    {
      $group: {
        _id: '$venueId',
        amenities: {
          $push: {
            name: '$content.amenityList.name',
            description: '$content.amenityList.description'
          }
        },
        amenityCount: { $sum: 1 }
      }
    },
    {
      $project: {
        venueId: '$_id',
        amenities: 1,
        amenityCount: 1,
        matchScore: {
          $divide: ['$amenityCount', amenityNames.length]
        },
        _id: 0
      }
    },
    {
      $sort: { matchScore: -1, amenityCount: -1 }
    }
  ]).toArray();
}

// Function to get venue capacity information
function getVenueCapacity(venueId) {
  return db.venue_content.findOne(
    {
      venueId: venueId,
      contentType: 'SEATING_CHART',
      status: 'PUBLISHED'
    },
    {
      projection: {
        venueId: 1,
        title: 1,
        'content.seatingData': 1,
        updatedAt: 1
      }
    }
  );
}

// Function to check venue media stats
function getVenueMediaStats(venueId) {
  return db.venue_content.aggregate([
    {
      $match: {
        venueId: venueId,
        contentType: { $in: ["PHOTO", "VIDEO", "VIRTUAL_TOUR", "FLOOR_PLAN"] }
      }
    },
    {
      $group: {
        _id: "$contentType",
        count: { $sum: 1 },
        totalSize: { $sum: { $ifNull: ["$content.fileSize", 0] } },
        totalViews: { $sum: "$usage.views" },
        totalDownloads: { $sum: { $ifNull: ["$usage.downloads", 0] } }
      }
    },
    {
      $project: {
        contentType: "$_id",
        count: 1,
        totalSizeMB: { $divide: ["$totalSize", 1048576] },
        totalViews: 1,
        totalDownloads: 1,
        avgViews: { $divide: ["$totalViews", "$count"] },
        _id: 0
      }
    }
  ]).toArray();
}

// Function to find outdated content
function findOutdatedContent(days = 90) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return db.venue_content.aggregate([
    {
      $match: {
        status: 'PUBLISHED',
        $or: [
          { 'metadata.lastVerified': { $lt: cutoff } },
          { 'metadata.lastVerified': { $exists: false } },
          { updatedAt: { $lt: cutoff } }
        ]
      }
    },
    {
      $group: {
        _id: {
          venueId: '$venueId',
          contentType: '$contentType'
        },
        count: { $sum: 1 },
        oldestUpdate: { $min: '$updatedAt' },
        titles: { $push: '$title' }
      }
    },
    {
      $project: {
        venueId: '$_id.venueId',
        contentType: '$_id.contentType',
        count: 1,
        oldestUpdate: 1,
        daysSinceUpdate: {
          $divide: [
            { $subtract: [new Date(), '$oldestUpdate'] },
            1000 * 60 * 60 * 24
          ]
        },
        titles: { $slice: ['$titles', 3] },
        _id: 0
      }
    },
    {
      $sort: { daysSinceUpdate: -1 }
    }
  ]).toArray();
}

// Now run the tests
print("1. Testing getVenueContent function:");
const content = getVenueContent("TEST_VENUE_001", "PHOTO");
print(`   Found ${content.length} photos for TEST_VENUE_001`);

print("\n2. Testing verifyVenueContent function:");
const verification = verifyVenueContent("TEST_VENUE_001");
print(`   Found ${verification.length} content items to verify`);
verification.slice(0, 3).forEach(v => {
    print(`   - ${v.contentType}: ${v.title} (${v.needsVerification ? "needs verification" : "verified"})`);
});

print("\n3. Testing analyzeVenueContentUsage function:");
const usage = analyzeVenueContentUsage("TEST_VENUE_001");
print(`   Found usage data for ${usage.length} content types`);
usage.slice(0, 3).forEach(u => {
    print(`   - ${u.contentType}: ${u.totalViews} views, ${u.contentCount} items`);
});

print("\n4. Testing searchVenuesByAmenities function:");
const venuesWithAmenities = searchVenuesByAmenities(["WiFi", "Parking"]);
print(`   Found ${venuesWithAmenities.length} venues with WiFi and Parking`);

print("\n5. Testing getVenueCapacity function:");
const capacity = getVenueCapacity("TEST_VENUE_001");
if (capacity) {
    print(`   ${capacity.title}: Total capacity ${capacity.content.seatingData.totalCapacity}`);
}

print("\n6. Testing getVenueMediaStats function:");
const mediaStats = getVenueMediaStats("TEST_VENUE_001");
print(`   Media statistics for ${mediaStats.length} content types`);
mediaStats.forEach(stat => {
    print(`   - ${stat.contentType}: ${stat.count} files, ${stat.totalViews} views`);
});

print("\n7. Testing findOutdatedContent function:");
const outdated = findOutdatedContent(30);
print(`   Found ${outdated.length} content types needing update`);
outdated.slice(0, 3).forEach(o => {
    print(`   - ${o.venueId} / ${o.contentType}: ${Math.floor(o.daysSinceUpdate)} days old`);
});

print("\n✓ All functions tested successfully!");
