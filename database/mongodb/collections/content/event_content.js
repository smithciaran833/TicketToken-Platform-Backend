// TicketToken MongoDB Collections
// Week 7, Day 34: Event Content Collection
// Collection: event_content

// Event content management for rich media and promotional materials
// Stores descriptions, images, videos, and marketing content for events

db = db.getSiblingDB('tickettoken');

// Drop existing collection for clean setup
db.event_content.drop();

// Create event_content collection with validation
db.createCollection('event_content', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['eventId', 'contentType', 'status', 'createdAt', 'updatedAt'],
      properties: {
        eventId: {
          bsonType: 'string',
          description: 'Reference to event ID'
        },
        contentType: {
          enum: ['DESCRIPTION', 'IMAGE', 'VIDEO', 'POSTER', 'BANNER', 'THUMBNAIL', 'GALLERY', 'PROMO_VIDEO', 'ARTIST_BIO', 'VENUE_INFO', 'FAQ', 'TERMS', 'SOCIAL_MEDIA'],
          description: 'Type of content'
        },
        status: {
          enum: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'REJECTED'],
          description: 'Content status'
        },
        title: {
          bsonType: 'string',
          description: 'Content title'
        },
        description: {
          bsonType: 'string',
          description: 'Content description or caption'
        },
        content: {
          bsonType: 'object',
          properties: {
            text: {
              bsonType: 'string',
              description: 'Text content (for descriptions, bios, etc.)'
            },
            richText: {
              bsonType: 'string',
              description: 'HTML or markdown formatted text'
            },
            url: {
              bsonType: 'string',
              description: 'URL for external content'
            },
            fileUrl: {
              bsonType: 'string',
              description: 'URL for uploaded file'
            },
            thumbnailUrl: {
              bsonType: 'string',
              description: 'Thumbnail URL for media'
            },
            mimeType: {
              bsonType: 'string',
              description: 'MIME type of the file'
            },
            fileSize: {
              bsonType: 'long',
              description: 'File size in bytes'
            },
            duration: {
              bsonType: 'int',
              description: 'Duration in seconds (for videos)'
            },
            dimensions: {
              bsonType: 'object',
              properties: {
                width: { bsonType: 'int' },
                height: { bsonType: 'int' }
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
              },
              description: 'Content tags for categorization'
            },
            seoKeywords: {
              bsonType: 'array',
              items: {
                bsonType: 'string'
              },
              description: 'SEO keywords'
            },
            altText: {
              bsonType: 'string',
              description: 'Alternative text for accessibility'
            },
            credits: {
              bsonType: 'string',
              description: 'Photo/video credits'
            },
            license: {
              bsonType: 'string',
              description: 'Content license information'
            },
            displayOrder: {
              bsonType: 'int',
              description: 'Order for display in galleries'
            },
            featured: {
              bsonType: 'bool',
              description: 'Whether content is featured'
            },
            visibility: {
              enum: ['PUBLIC', 'PRIVATE', 'TICKET_HOLDERS', 'VIP_ONLY'],
              description: 'Content visibility settings'
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
            shares: {
              bsonType: 'long',
              description: 'Number of shares'
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
          },
          description: 'Content version history'
        },
        approval: {
          bsonType: 'object',
          properties: {
            approvedBy: {
              bsonType: 'string',
              description: 'User who approved the content'
            },
            approvedAt: {
              bsonType: 'date',
              description: 'Approval timestamp'
            },
            rejectedBy: {
              bsonType: 'string',
              description: 'User who rejected the content'
            },
            rejectedAt: {
              bsonType: 'date',
              description: 'Rejection timestamp'
            },
            rejectionReason: {
              bsonType: 'string',
              description: 'Reason for rejection'
            },
            reviewNotes: {
              bsonType: 'string',
              description: 'Review notes'
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

print('✓ Event content collection created with validation schema');

// Create indexes for efficient querying
db.event_content.createIndex({ eventId: 1, contentType: 1 });
db.event_content.createIndex({ status: 1, createdAt: -1 });
db.event_content.createIndex({ contentType: 1, status: 1 });
db.event_content.createIndex({ 'metadata.tags': 1 });
db.event_content.createIndex({ 'metadata.featured': 1, status: 1 });
db.event_content.createIndex({ 'metadata.visibility': 1, status: 1 });
db.event_content.createIndex({ createdAt: -1 });
db.event_content.createIndex({ updatedAt: -1 });

// Text index for search
db.event_content.createIndex({ 
  title: 'text', 
  description: 'text', 
  'content.text': 'text',
  'metadata.tags': 'text'
});

// Compound index for content management
db.event_content.createIndex({ 
  eventId: 1, 
  contentType: 1, 
  status: 1,
  'metadata.displayOrder': 1 
});

print('✓ Performance indexes created');

// TTL index - keep archived content for 180 days
db.event_content.createIndex(
  { updatedAt: 1 },
  { 
    expireAfterSeconds: 15552000,
    partialFilterExpression: { status: 'ARCHIVED' }
  }
);

print('✓ TTL index created (180 day retention for archived content)');
print('\n✓ Phase 1 complete - Basic event content structure');

// Phase 2: Content management and analytics functions

// Function to get event content by type
function getEventContent(eventId, contentType = null) {
  const query = { eventId: eventId, status: 'PUBLISHED' };
  if (contentType) {
    query.contentType = contentType;
  }
  
  return db.event_content.find(query)
    .sort({ 'metadata.displayOrder': 1, createdAt: -1 })
    .toArray();
}

// Function to analyze content performance
function analyzeContentPerformance(eventId, days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return db.event_content.aggregate([
    {
      $match: {
        eventId: eventId,
        'usage.lastViewedAt': { $gte: cutoff }
      }
    },
    {
      $group: {
        _id: "$contentType",
        totalViews: { $sum: "$usage.views" },
        totalDownloads: { $sum: { $ifNull: ["$usage.downloads", 0] } },
        totalShares: { $sum: { $ifNull: ["$usage.shares", 0] } },
        contentCount: { $sum: 1 },
        avgViews: { $avg: "$usage.views" },
        topContent: {
          $push: {
            title: "$title",
            views: "$usage.views",
            shares: "$usage.shares"
          }
        }
      }
    },
    {
      $project: {
        contentType: "$_id",
        totalViews: 1,
        totalDownloads: 1,
        totalShares: 1,
        contentCount: 1,
        avgViews: { $round: ["$avgViews", 0] },
        engagementRate: {
          $round: [
            { $multiply: [
              { $divide: [
                { $add: ["$totalDownloads", "$totalShares"] },
                "$totalViews"
              ] },
              100
            ] },
            2
          ]
        },
        topContent: { $slice: ["$topContent", 3] },
        _id: 0
      }
    },
    {
      $sort: { totalViews: -1 }
    }
  ]).toArray();
}

// Function to manage content versions
function createContentVersion(contentId, changes, userId) {
  const content = db.event_content.findOne({ _id: contentId });
  if (!content) return null;
  
  const currentVersion = content.versions ? content.versions.length : 0;
  const newVersion = {
    versionNumber: currentVersion + 1,
    createdAt: new Date(),
    createdBy: userId,
    changeLog: changes,
    content: content.content
  };
  
  return db.event_content.updateOne(
    { _id: contentId },
    {
      $push: { versions: newVersion },
      $set: { 
        updatedAt: new Date(),
        updatedBy: userId
      }
    }
  );
}

// Function to search content
function searchContent(searchTerm, filters = {}) {
  const pipeline = [];
  
  // Text search stage
  if (searchTerm) {
    pipeline.push({
      $match: { $text: { $search: searchTerm } }
    });
  }
  
  // Apply filters
  const matchFilters = {};
  if (filters.eventId) matchFilters.eventId = filters.eventId;
  if (filters.contentType) matchFilters.contentType = filters.contentType;
  if (filters.status) matchFilters.status = filters.status;
  if (filters.language) matchFilters['metadata.language'] = filters.language;
  if (filters.visibility) matchFilters['metadata.visibility'] = filters.visibility;
  
  if (Object.keys(matchFilters).length > 0) {
    pipeline.push({ $match: matchFilters });
  }
  
  // Add text score for relevance
  if (searchTerm) {
    pipeline.push({
      $addFields: { score: { $meta: "textScore" } }
    });
    pipeline.push({
      $sort: { score: -1, 'metadata.featured': -1, createdAt: -1 }
    });
  } else {
    pipeline.push({
      $sort: { 'metadata.featured': -1, createdAt: -1 }
    });
  }
  
  return db.event_content.aggregate(pipeline).toArray();
}

// Function to get content approval queue
function getApprovalQueue() {
  return db.event_content.aggregate([
    {
      $match: {
        status: { $in: ['PENDING_REVIEW', 'DRAFT'] }
      }
    },
    {
      $lookup: {
        from: 'event_content',
        let: { eventId: '$eventId' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$eventId', '$$eventId'] },
              status: 'PUBLISHED'
            }
          },
          { $count: 'publishedCount' }
        ],
        as: 'eventInfo'
      }
    },
    {
      $project: {
        eventId: 1,
        contentType: 1,
        status: 1,
        title: 1,
        description: 1,
        createdAt: 1,
        createdBy: 1,
        daysPending: {
          $divide: [
            { $subtract: [new Date(), '$createdAt'] },
            1000 * 60 * 60 * 24
          ]
        },
        eventPublishedContent: { $arrayElemAt: ['$eventInfo.publishedCount', 0] }
      }
    },
    {
      $sort: { status: 1, daysPending: -1 }
    }
  ]).toArray();
}

// Function to update content usage stats
function updateContentUsage(contentId, action) {
  const updates = {
    lastViewedAt: new Date()
  };
  
  switch(action) {
    case 'view':
      updates.views = 1;
      break;
    case 'download':
      updates.downloads = 1;
      break;
    case 'share':
      updates.shares = 1;
      break;
  }
  
  return db.event_content.updateOne(
    { _id: contentId },
    {
      $inc: { [`usage.${Object.keys(updates)[0]}`]: updates[Object.keys(updates)[0]] },
      $set: { 'usage.lastViewedAt': new Date() }
    }
  );
}

print("✓ Content management functions created");
print("\n✓ Phase 2 complete - Content management and analytics added");

// Phase 3: Content views and publishing workflow

// Drop existing views if they exist
try { db.content_gallery.drop(); } catch(e) {}
try { db.featured_content.drop(); } catch(e) {}
try { db.content_analytics.drop(); } catch(e) {}

// 1. Content gallery view - organized content by event
db.createView("content_gallery", "event_content", [
  {
    $match: {
      status: "PUBLISHED",
      "metadata.visibility": { $in: ["PUBLIC", "TICKET_HOLDERS"] }
    }
  },
  {
    $group: {
      _id: {
        eventId: "$eventId",
        contentType: "$contentType"
      },
      items: {
        $push: {
          _id: "$_id",
          title: "$title",
          description: "$description",
          fileUrl: "$content.fileUrl",
          thumbnailUrl: "$content.thumbnailUrl",
          mimeType: "$content.mimeType",
          duration: "$content.duration",
          displayOrder: "$metadata.displayOrder",
          featured: "$metadata.featured",
          views: "$usage.views"
        }
      },
      totalItems: { $sum: 1 },
      totalViews: { $sum: "$usage.views" }
    }
  },
  {
    $project: {
      eventId: "$_id.eventId",
      contentType: "$_id.contentType",
      items: {
        $slice: [
          {
            $sortArray: {
              input: "$items",
              sortBy: { 
                featured: -1,
                displayOrder: 1,
                views: -1
              }
            }
          },
          20
        ]
      },
      totalItems: 1,
      totalViews: 1,
      _id: 0
    }
  },
  {
    $sort: { eventId: 1, contentType: 1 }
  }
]);

// 2. Featured content view - highlighted content across events
db.createView("featured_content", "event_content", [
  {
    $match: {
      status: "PUBLISHED",
      "metadata.featured": true,
      "metadata.visibility": "PUBLIC"
    }
  },
  {
    $lookup: {
      from: "events",
      localField: "eventId",
      foreignField: "_id",
      as: "eventInfo"
    }
  },
  {
    $project: {
      eventId: 1,
      contentType: 1,
      title: 1,
      description: 1,
      content: 1,
      metadata: 1,
      usage: 1,
      eventName: { $arrayElemAt: ["$eventInfo.name", 0] },
      createdAt: 1
    }
  },
  {
    $sort: { "usage.views": -1, createdAt: -1 }
  },
  {
    $limit: 50
  }
]);

// 3. Content analytics view - performance metrics
db.createView("content_analytics", "event_content", [
  {
    $match: {
      status: "PUBLISHED",
      "usage.lastViewedAt": { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: {
        week: {
          $dateToString: {
            format: "%Y-W%V",
            date: "$usage.lastViewedAt"
          }
        },
        contentType: "$contentType"
      },
      totalViews: { $sum: "$usage.views" },
      totalDownloads: { $sum: { $ifNull: ["$usage.downloads", 0] } },
      totalShares: { $sum: { $ifNull: ["$usage.shares", 0] } },
      uniqueContent: { $addToSet: "$_id" },
      avgEngagement: {
        $avg: {
          $add: [
            { $ifNull: ["$usage.downloads", 0] },
            { $ifNull: ["$usage.shares", 0] }
          ]
        }
      }
    }
  },
  {
    $project: {
      week: "$_id.week",
      contentType: "$_id.contentType",
      totalViews: 1,
      totalDownloads: 1,
      totalShares: 1,
      uniqueContentCount: { $size: "$uniqueContent" },
      avgEngagementPerItem: { $round: ["$avgEngagement", 2] },
      _id: 0
    }
  },
  {
    $sort: { week: -1, contentType: 1 }
  }
]);

print("✓ Content views created");

// Content publishing workflow functions
function approveContent(contentId, userId, notes = "") {
  return db.event_content.updateOne(
    { _id: contentId, status: { $in: ["DRAFT", "PENDING_REVIEW", "REJECTED"] } },
    {
      $set: {
        status: "APPROVED",
        "approval.approvedBy": userId,
        "approval.approvedAt": new Date(),
        "approval.reviewNotes": notes,
        updatedAt: new Date(),
        updatedBy: userId
      },
      $unset: {
        "approval.rejectedBy": "",
        "approval.rejectedAt": "",
        "approval.rejectionReason": ""
      }
    }
  );
}

function publishContent(contentId, userId) {
  return db.event_content.updateOne(
    { _id: contentId, status: "APPROVED" },
    {
      $set: {
        status: "PUBLISHED",
        updatedAt: new Date(),
        updatedBy: userId
      }
    }
  );
}

function rejectContent(contentId, userId, reason) {
  return db.event_content.updateOne(
    { _id: contentId, status: { $in: ["DRAFT", "PENDING_REVIEW"] } },
    {
      $set: {
        status: "REJECTED",
        "approval.rejectedBy": userId,
        "approval.rejectedAt": new Date(),
        "approval.rejectionReason": reason,
        updatedAt: new Date(),
        updatedBy: userId
      }
    }
  );
}

// Bulk content operations
function bulkUpdateContentStatus(contentIds, newStatus, userId) {
  return db.event_content.updateMany(
    { _id: { $in: contentIds } },
    {
      $set: {
        status: newStatus,
        updatedAt: new Date(),
        updatedBy: userId
      }
    }
  );
}

// Content recommendations based on views
function getRelatedContent(contentId, limit = 5) {
  const content = db.event_content.findOne({ _id: contentId });
  if (!content) return [];
  
  return db.event_content.aggregate([
    {
      $match: {
        _id: { $ne: contentId },
        status: "PUBLISHED",
        $or: [
          { eventId: content.eventId },
          { contentType: content.contentType },
          { "metadata.tags": { $in: content.metadata.tags || [] } }
        ]
      }
    },
    {
      $addFields: {
        relevanceScore: {
          $add: [
            { $cond: [{ $eq: ["$eventId", content.eventId] }, 3, 0] },
            { $cond: [{ $eq: ["$contentType", content.contentType] }, 2, 0] },
            {
              $size: {
                $setIntersection: [
                  { $ifNull: ["$metadata.tags", []] },
                  { $ifNull: [content.metadata.tags, []] }
                ]
              }
            }
          ]
        }
      }
    },
    {
      $sort: { relevanceScore: -1, "usage.views": -1 }
    },
    {
      $limit: limit
    }
  ]).toArray();
}

print("✓ Publishing workflow functions created");
print("\n✓ Phase 3 complete - Content views and publishing workflow added");
print("\n✓ Event content setup complete!");
