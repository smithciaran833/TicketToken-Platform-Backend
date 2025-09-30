// TicketToken MongoDB Collections
// Week 7, Day 34: Venue Content Collection
// Collection: venue_content

// Venue content management for facility information and media
// Stores floor plans, seating charts, amenities, photos, and venue details

db = db.getSiblingDB('tickettoken');

// Drop existing collection for clean setup
db.venue_content.drop();

// Create venue_content collection with validation
db.createCollection('venue_content', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['venueId', 'contentType', 'status', 'createdAt', 'updatedAt'],
      properties: {
        venueId: {
          bsonType: 'string',
          description: 'Reference to venue ID'
        },
        contentType: {
          enum: ['DESCRIPTION', 'FLOOR_PLAN', 'SEATING_CHART', 'PHOTO', 'VIRTUAL_TOUR', 'AMENITIES', 'PARKING_MAP', 'ACCESSIBILITY', 'RULES', 'DIRECTIONS', 'CONTACT', 'HISTORY', 'TECHNICAL_SPECS'],
          description: 'Type of venue content'
        },
        status: {
          enum: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED'],
          description: 'Content status'
        },
        title: {
          bsonType: 'string',
          description: 'Content title'
        },
        description: {
          bsonType: 'string',
          description: 'Content description'
        },
        content: {
          bsonType: 'object',
          properties: {
            text: {
              bsonType: 'string',
              description: 'Text content'
            },
            richText: {
              bsonType: 'string',
              description: 'HTML or markdown formatted text'
            },
            fileUrl: {
              bsonType: 'string',
              description: 'URL for uploaded file'
            },
            thumbnailUrl: {
              bsonType: 'string',
              description: 'Thumbnail URL'
            },
            mimeType: {
              bsonType: 'string',
              description: 'MIME type of the file'
            },
            fileSize: {
              bsonType: 'long',
              description: 'File size in bytes'
            },
            dimensions: {
              bsonType: 'object',
              properties: {
                width: { bsonType: 'int' },
                height: { bsonType: 'int' }
              }
            },
            amenityList: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  name: { bsonType: 'string' },
                  description: { bsonType: 'string' },
                  icon: { bsonType: 'string' },
                  available: { bsonType: 'bool' }
                }
              }
            },
            seatingData: {
              bsonType: 'object',
              properties: {
                totalCapacity: { bsonType: 'int' },
                sections: {
                  bsonType: 'array',
                  items: {
                    bsonType: 'object',
                    properties: {
                      sectionId: { bsonType: 'string' },
                      name: { bsonType: 'string' },
                      capacity: { bsonType: 'int' },
                      rows: { bsonType: 'int' },
                      seatsPerRow: { bsonType: 'int' }
                    }
                  }
                },
                accessibleSeats: { bsonType: 'int' },
                vipSeats: { bsonType: 'int' }
              }
            },
            tourData: {
              bsonType: 'object',
              properties: {
                tourUrl: { bsonType: 'string' },
                provider: { bsonType: 'string' },
                embedCode: { bsonType: 'string' }
              }
            },
            contactInfo: {
              bsonType: 'object',
              properties: {
                phone: { bsonType: 'string' },
                email: { bsonType: 'string' },
                website: { bsonType: 'string' },
                address: {
                  bsonType: 'object',
                  properties: {
                    street: { bsonType: 'string' },
                    city: { bsonType: 'string' },
                    state: { bsonType: 'string' },
                    zipCode: { bsonType: 'string' },
                    country: { bsonType: 'string' }
                  }
                }
              }
            }
          }
        },
        metadata: {
          bsonType: 'object',
          properties: {
            language: {
              bsonType: 'string',
              description: 'Content language (ISO 639-1)'
            },
            tags: {
              bsonType: 'array',
              items: {
                bsonType: 'string'
              }
            },
            displayOrder: {
              bsonType: 'int',
              description: 'Order for display'
            },
            featured: {
              bsonType: 'bool',
              description: 'Whether content is featured'
            },
            season: {
              bsonType: 'string',
              description: 'Season or time period (if applicable)'
            },
            lastVerified: {
              bsonType: 'date',
              description: 'Last verification date'
            },
            expiresAt: {
              bsonType: 'date',
              description: 'Content expiration date'
            }
          }
        },
        usage: {
          bsonType: 'object',
          properties: {
            views: {
              bsonType: 'long',
              description: 'Number of views'
            },
            downloads: {
              bsonType: 'long',
              description: 'Number of downloads'
            },
            lastViewedAt: {
              bsonType: 'date',
              description: 'Last time content was viewed'
            }
          }
        },
        versions: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            properties: {
              versionNumber: { bsonType: 'int' },
              createdAt: { bsonType: 'date' },
              createdBy: { bsonType: 'string' },
              changeLog: { bsonType: 'string' },
              content: { bsonType: 'object' }
            }
          }
        },
        createdAt: {
          bsonType: 'date',
          description: 'Creation timestamp'
        },
        updatedAt: {
          bsonType: 'date',
          description: 'Last update timestamp'
        },
        createdBy: {
          bsonType: 'string',
          description: 'User who created the content'
        },
        updatedBy: {
          bsonType: 'string',
          description: 'User who last updated the content'
        }
      }
    }
  }
});

print('✓ Venue content collection created with validation schema');

// Create indexes for efficient querying
db.venue_content.createIndex({ venueId: 1, contentType: 1 });
db.venue_content.createIndex({ status: 1, createdAt: -1 });
db.venue_content.createIndex({ contentType: 1, status: 1 });
db.venue_content.createIndex({ 'metadata.tags': 1 });
db.venue_content.createIndex({ 'metadata.featured': 1, status: 1 });
db.venue_content.createIndex({ 'metadata.lastVerified': 1 });
db.venue_content.createIndex({ 'metadata.expiresAt': 1 });

// Text index for search
db.venue_content.createIndex({ 
  title: 'text', 
  description: 'text', 
  'content.text': 'text',
  'metadata.tags': 'text'
});

// Compound index for content management
db.venue_content.createIndex({ 
  venueId: 1, 
  contentType: 1, 
  status: 1,
  'metadata.displayOrder': 1 
});

print('✓ Performance indexes created');

// TTL index - remove expired content after 30 days
db.venue_content.createIndex(
  { 'metadata.expiresAt': 1 },
  { 
    expireAfterSeconds: 2592000 // 30 days after expiration
  }
);

print('✓ TTL index created (30 days after expiration)');
print('\n✓ Phase 1 complete - Basic venue content structure');

// Phase 2: Venue content management and analytics functions

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

// Function to update content verification
function updateContentVerification(contentId, verifiedBy) {
  return db.venue_content.updateOne(
    { _id: contentId },
    {
      $set: {
        'metadata.lastVerified': new Date(),
        updatedAt: new Date(),
        updatedBy: verifiedBy
      }
    }
  );
}

// Function to bulk update venue content status
function bulkUpdateVenueContentStatus(venueId, fromStatus, toStatus, userId) {
  return db.venue_content.updateMany(
    {
      venueId: venueId,
      status: fromStatus
    },
    {
      $set: {
        status: toStatus,
        updatedAt: new Date(),
        updatedBy: userId
      }
    }
  );
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

print("✓ Venue content management functions created");
print("\n✓ Phase 2 complete - Venue content management and analytics added");

// Phase 3: Venue content views and capacity management

// Drop existing views if they exist
try { db.venue_gallery.drop(); } catch(e) {}
try { db.venue_capacity.drop(); } catch(e) {}
try { db.venue_verification.drop(); } catch(e) {}

// 1. Venue gallery view - photos and media organized by venue
db.createView("venue_gallery", "venue_content", [
  {
    $match: {
      status: "PUBLISHED",
      contentType: { $in: ["PHOTO", "VIRTUAL_TOUR", "FLOOR_PLAN"] }
    }
  },
  {
    $group: {
      _id: {
        venueId: "$venueId",
        contentType: "$contentType"
      },
      media: {
        $push: {
          _id: "$_id",
          title: "$title",
          description: "$description",
          fileUrl: "$content.fileUrl",
          thumbnailUrl: "$content.thumbnailUrl",
          mimeType: "$content.mimeType",
          tourUrl: "$content.tourData.tourUrl",
          featured: "$metadata.featured",
          displayOrder: "$metadata.displayOrder",
          views: "$usage.views"
        }
      },
      totalItems: { $sum: 1 },
      totalViews: { $sum: "$usage.views" }
    }
  },
  {
    $project: {
      venueId: "$_id.venueId",
      contentType: "$_id.contentType",
      media: {
        $slice: [
          {
            $sortArray: {
              input: "$media",
              sortBy: { 
                featured: -1,
                displayOrder: 1,
                views: -1
              }
            }
          },
          50
        ]
      },
      totalItems: 1,
      totalViews: 1,
      _id: 0
    }
  },
  {
    $sort: { venueId: 1, contentType: 1 }
  }
]);

// 2. Venue capacity view - seating and capacity information
db.createView("venue_capacity", "venue_content", [
  {
    $match: {
      contentType: "SEATING_CHART",
      status: "PUBLISHED"
    }
  },
  {
    $project: {
      venueId: 1,
      title: 1,
      totalCapacity: "$content.seatingData.totalCapacity",
      sections: "$content.seatingData.sections",
      accessibleSeats: "$content.seatingData.accessibleSeats",
      vipSeats: "$content.seatingData.vipSeats",
      sectionCount: { $size: { $ifNull: ["$content.seatingData.sections", []] } },
      lastUpdated: "$updatedAt"
    }
  },
  {
    $sort: { venueId: 1 }
  }
]);

// 3. Venue verification view - content requiring verification
db.createView("venue_verification", "venue_content", [
  {
    $match: {
      status: "PUBLISHED"
    }
  },
  {
    $project: {
      venueId: 1,
      contentType: 1,
      title: 1,
      lastVerified: "$metadata.lastVerified",
      updatedAt: 1,
      daysSinceVerification: {
        $cond: {
          if: { $ne: ["$metadata.lastVerified", null] },
          then: {
            $divide: [
              { $subtract: [new Date(), "$metadata.lastVerified"] },
              1000 * 60 * 60 * 24
            ]
          },
          else: 999
        }
      },
      verificationStatus: {
        $switch: {
          branches: [
            { case: { $eq: ["$metadata.lastVerified", null] }, then: "NEVER_VERIFIED" },
            { 
              case: { 
                $gt: [
                  { $divide: [
                    { $subtract: [new Date(), "$metadata.lastVerified"] },
                    1000 * 60 * 60 * 24
                  ]},
                  90
                ]
              }, 
              then: "OVERDUE" 
            },
            { 
              case: { 
                $gt: [
                  { $divide: [
                    { $subtract: [new Date(), "$metadata.lastVerified"] },
                    1000 * 60 * 60 * 24
                  ]},
                  30
                ]
              }, 
              then: "DUE_SOON" 
            }
          ],
          default: "CURRENT"
        }
      }
    }
  },
  {
    $match: {
      verificationStatus: { $ne: "CURRENT" }
    }
  },
  {
    $sort: { verificationStatus: 1, daysSinceVerification: -1 }
  }
]);

print("✓ Venue content views created");

// Helper functions for venue management
function archiveVenueContent(venueId, userId) {
  return db.venue_content.updateMany(
    {
      venueId: venueId,
      status: "PUBLISHED"
    },
    {
      $set: {
        status: "ARCHIVED",
        "metadata.expiresAt": new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        updatedBy: userId
      }
    }
  );
}

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

print("✓ Venue management functions created");
print("\n✓ Phase 3 complete - Venue content views and capacity management added");
print("\n✓ Venue content setup complete!");
