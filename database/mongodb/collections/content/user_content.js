// TicketToken MongoDB Collections
// User-Generated Content Collection
// Collection: user_content

// User-generated content for events, venues, and experiences
// Stores reviews, photos, videos, ratings, and social content

db = db.getSiblingDB('tickettoken');

// Drop existing collection for clean setup
db.user_content.drop();

// Create user_content collection with validation
db.createCollection('user_content', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'contentType', 'targetType', 'targetId', 'status', 'createdAt'],
      properties: {
        userId: {
          bsonType: 'string',
          description: 'User who created the content'
        },
        contentType: {
          enum: ['REVIEW', 'PHOTO', 'VIDEO', 'RATING', 'COMMENT', 'STORY', 'CHECK_IN', 'REACTION'],
          description: 'Type of user content'
        },
        targetType: {
          enum: ['EVENT', 'VENUE', 'ARTIST', 'TEAM', 'REVIEW', 'PHOTO', 'VIDEO'],
          description: 'What the content is about'
        },
        targetId: {
          bsonType: 'string',
          description: 'ID of the target (event, venue, etc.)'
        },
        parentId: {
          bsonType: 'string',
          description: 'Parent content ID for replies/comments'
        },
        status: {
          enum: ['DRAFT', 'PENDING_MODERATION', 'APPROVED', 'REJECTED', 'FLAGGED', 'HIDDEN', 'DELETED'],
          description: 'Content status'
        },
        content: {
          bsonType: 'object',
          properties: {
            title: {
              bsonType: 'string',
              maxLength: 200,
              description: 'Content title'
            },
            text: {
              bsonType: 'string',
              maxLength: 5000,
              description: 'Text content'
            },
            rating: {
              bsonType: 'object',
              properties: {
                overall: {
                  bsonType: 'number',
                  minimum: 1,
                  maximum: 5,
                  description: 'Overall rating (1-5)'
                },
                categories: {
                  bsonType: 'object',
                  properties: {
                    atmosphere: { bsonType: 'number', minimum: 1, maximum: 5 },
                    valueForMoney: { bsonType: 'number', minimum: 1, maximum: 5 },
                    facilities: { bsonType: 'number', minimum: 1, maximum: 5 },
                    location: { bsonType: 'number', minimum: 1, maximum: 5 },
                    staff: { bsonType: 'number', minimum: 1, maximum: 5 },
                    experience: { bsonType: 'number', minimum: 1, maximum: 5 }
                  }
                }
              }
            },
            media: {
              bsonType: 'object',
              properties: {
                url: {
                  bsonType: 'string',
                  description: 'Media file URL'
                },
                thumbnailUrl: {
                  bsonType: 'string',
                  description: 'Thumbnail URL'
                },
                mimeType: {
                  bsonType: 'string',
                  description: 'MIME type'
                },
                duration: {
                  bsonType: 'int',
                  description: 'Duration in seconds (for video)'
                },
                dimensions: {
                  bsonType: 'object',
                  properties: {
                    width: { bsonType: 'int' },
                    height: { bsonType: 'int' }
                  }
                },
                fileSize: {
                  bsonType: 'long',
                  description: 'File size in bytes'
                },
                caption: {
                  bsonType: 'string',
                  maxLength: 500
                },
                altText: {
                  bsonType: 'string',
                  maxLength: 200
                }
              }
            },
            checkIn: {
              bsonType: 'object',
              properties: {
                location: {
                  bsonType: 'object',
                  properties: {
                    type: {
                      enum: ['Point'],
                      description: 'GeoJSON type'
                    },
                    coordinates: {
                      bsonType: 'array',
                      minItems: 2,
                      maxItems: 2,
                      items: {
                        bsonType: 'double'
                      }
                    }
                  }
                },
                accuracy: {
                  bsonType: 'double',
                  description: 'Location accuracy in meters'
                }
              }
            },
            reactionType: {
              enum: ['LIKE', 'LOVE', 'WOW', 'HAHA', 'SAD', 'ANGRY'],
              description: 'Type of reaction'
            },
            mentions: {
              bsonType: 'array',
              items: {
                bsonType: 'string'
              },
              description: 'User IDs mentioned in content'
            },
            hashtags: {
              bsonType: 'array',
              items: {
                bsonType: 'string'
              },
              description: 'Hashtags used'
            }
          }
        },
        eventDetails: {
          bsonType: 'object',
          properties: {
            eventDate: {
              bsonType: 'date',
              description: 'Date of the event attended'
            },
            ticketType: {
              bsonType: 'string',
              description: 'Type of ticket purchased'
            },
            seatLocation: {
              bsonType: 'string',
              description: 'Seat/section information'
            },
            verified: {
              bsonType: 'bool',
              description: 'Verified attendance'
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
            device: {
              bsonType: 'object',
              properties: {
                type: { bsonType: 'string' },
                model: { bsonType: 'string' },
                os: { bsonType: 'string' }
              }
            },
            source: {
              enum: ['WEB', 'MOBILE_APP', 'API', 'IMPORT'],
              description: 'Content source'
            },
            ipAddress: {
              bsonType: 'string',
              description: 'IP address (for moderation)'
            },
            userAgent: {
              bsonType: 'string',
              description: 'User agent string'
            }
          }
        },
        engagement: {
          bsonType: 'object',
          properties: {
            likes: {
              bsonType: 'long',
              description: 'Number of likes'
            },
            dislikes: {
              bsonType: 'long',
              description: 'Number of dislikes'
            },
            shares: {
              bsonType: 'long',
              description: 'Number of shares'
            },
            views: {
              bsonType: 'long',
              description: 'Number of views'
            },
            comments: {
              bsonType: 'long',
              description: 'Number of comments'
            },
            reports: {
              bsonType: 'long',
              description: 'Number of reports'
            },
            helpful: {
              bsonType: 'long',
              description: 'Marked as helpful count'
            },
            notHelpful: {
              bsonType: 'long',
              description: 'Marked as not helpful count'
            }
          }
        },
        moderation: {
          bsonType: 'object',
          properties: {
            score: {
              bsonType: 'double',
              minimum: 0,
              maximum: 1,
              description: 'Auto-moderation score'
            },
            flags: {
              bsonType: 'array',
              items: {
                bsonType: 'string'
              },
              description: 'Moderation flags'
            },
            reviewedAt: {
              bsonType: 'date',
              description: 'When content was reviewed'
            },
            reviewedBy: {
              bsonType: 'string',
              description: 'Moderator ID'
            },
            reason: {
              bsonType: 'string',
              description: 'Moderation reason'
            },
            aiAnalysis: {
              bsonType: 'object',
              properties: {
                sentiment: {
                  enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED'],
                  description: 'Sentiment analysis result'
                },
                toxicity: {
                  bsonType: 'double',
                  minimum: 0,
                  maximum: 1
                },
                spam: {
                  bsonType: 'double',
                  minimum: 0,
                  maximum: 1
                },
                authenticity: {
                  bsonType: 'double',
                  minimum: 0,
                  maximum: 1
                }
              }
            }
          }
        },
        privacy: {
          bsonType: 'object',
          properties: {
            visibility: {
              enum: ['PUBLIC', 'FRIENDS', 'PRIVATE', 'UNLISTED'],
              description: 'Content visibility'
            },
            allowComments: {
              bsonType: 'bool',
              description: 'Whether comments are allowed'
            },
            allowSharing: {
              bsonType: 'bool',
              description: 'Whether sharing is allowed'
            }
          }
        },
        editHistory: {
          bsonType: 'array',
          items: {
            bsonType: 'object',
            properties: {
              editedAt: { bsonType: 'date' },
              editedBy: { bsonType: 'string' },
              changes: { bsonType: 'object' },
              reason: { bsonType: 'string' }
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
        publishedAt: {
          bsonType: 'date',
          description: 'When content was published'
        },
        deletedAt: {
          bsonType: 'date',
          description: 'Soft delete timestamp'
        }
      }
    }
  }
});

print('✓ User content collection created with validation schema');
print('\n✓ Phase 1 complete - Basic collection structure created');

// Phase 2: Create indexes for efficient querying
print('\n=== Phase 2: Creating Indexes ===');

// User content indexes
db.user_content.createIndex({ userId: 1, createdAt: -1 });
db.user_content.createIndex({ targetType: 1, targetId: 1, status: 1, createdAt: -1 });
db.user_content.createIndex({ contentType: 1, status: 1, createdAt: -1 });
db.user_content.createIndex({ parentId: 1, createdAt: 1 });
db.user_content.createIndex({ status: 1, 'moderation.score': 1 });
db.user_content.createIndex({ 'content.hashtags': 1 });
db.user_content.createIndex({ 'content.mentions': 1 });
db.user_content.createIndex({ 'eventDetails.eventDate': 1 });
db.user_content.createIndex({ 'engagement.likes': -1, status: 1 });

// Geospatial index for check-ins
db.user_content.createIndex({ 'content.checkIn.location': '2dsphere' });

// Text index for search
db.user_content.createIndex({
  'content.title': 'text',
  'content.text': 'text',
  'content.media.caption': 'text'
});

// Compound index for moderation queue
db.user_content.createIndex({
  status: 1,
  'moderation.reviewedAt': 1,
  'moderation.score': -1
});

print('✓ Performance indexes created');

// Check indexes
const indexCount = db.user_content.getIndexes().length;
print(`✓ Total indexes created: ${indexCount}`);
print('\n✓ Phase 2 complete - Indexes added');

// Phase 3: Core functions for user content management
print('\n=== Phase 3: Creating Core Functions ===');

// Function to get user reviews for a target
function getUserReviews(targetType, targetId, options = {}) {
  const { 
    status = 'APPROVED',
    sortBy = 'helpful',
    limit = 20,
    skip = 0
  } = options;

  let sort = {};
  switch(sortBy) {
    case 'helpful':
      sort = { 'engagement.helpful': -1, createdAt: -1 };
      break;
    case 'recent':
      sort = { createdAt: -1 };
      break;
    case 'rating':
      sort = { 'content.rating.overall': -1, createdAt: -1 };
      break;
    default:
      sort = { createdAt: -1 };
  }

  return db.user_content.find({
    targetType: targetType,
    targetId: targetId,
    contentType: 'REVIEW',
    status: status
  })
  .sort(sort)
  .skip(skip)
  .limit(limit)
  .toArray();
}

// Function to calculate content statistics
function getContentStatistics(targetType, targetId) {
  return db.user_content.aggregate([
    {
      $match: {
        targetType: targetType,
        targetId: targetId,
        status: 'APPROVED'
      }
    },
    {
      $group: {
        _id: '$contentType',
        count: { $sum: 1 },
        avgRating: { 
          $avg: { 
            $cond: [
              { $ne: ['$content.rating.overall', null] },
              '$content.rating.overall',
              null
            ]
          }
        },
        totalEngagement: {
          $sum: {
            $add: [
              { $ifNull: ['$engagement.likes', 0] },
              { $ifNull: ['$engagement.shares', 0] },
              { $ifNull: ['$engagement.comments', 0] }
            ]
          }
        }
      }
    },
    {
      $project: {
        contentType: '$_id',
        count: 1,
        avgRating: { $round: ['$avgRating', 2] },
        totalEngagement: 1,
        _id: 0
      }
    }
  ]).toArray();
}

// Function to get trending content
function getTrendingContent(contentType = null, hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  const match = {
    status: 'APPROVED',
    createdAt: { $gte: cutoff }
  };
  
  if (contentType) {
    match.contentType = contentType;
  }

  return db.user_content.aggregate([
    { $match: match },
    {
      $addFields: {
        engagementScore: {
          $add: [
            { $multiply: ['$engagement.likes', 1] },
            { $multiply: ['$engagement.shares', 3] },
            { $multiply: ['$engagement.comments', 2] },
            { $multiply: ['$engagement.views', 0.01] }
          ]
        }
      }
    },
    { $sort: { engagementScore: -1 } },
    { $limit: 50 }
  ]).toArray();
}

// Function to moderate content
function moderateContent(contentId, action, moderatorId, reason = null) {
  const updates = {
    'moderation.reviewedAt': new Date(),
    'moderation.reviewedBy': moderatorId,
    updatedAt: new Date()
  };

  switch(action) {
    case 'approve':
      updates.status = 'APPROVED';
      updates.publishedAt = new Date();
      break;
    case 'reject':
      updates.status = 'REJECTED';
      updates['moderation.reason'] = reason;
      break;
    case 'flag':
      updates.status = 'FLAGGED';
      updates['moderation.reason'] = reason;
      break;
    case 'hide':
      updates.status = 'HIDDEN';
      updates['moderation.reason'] = reason;
      break;
  }

  return db.user_content.updateOne(
    { _id: contentId },
    { $set: updates }
  );
}

// Function to get user content summary
function getUserContentSummary(userId, days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return db.user_content.aggregate([
    {
      $match: {
        userId: userId,
        createdAt: { $gte: cutoff },
        status: { $in: ['APPROVED', 'PENDING_MODERATION'] }
      }
    },
    {
      $group: {
        _id: {
          contentType: '$contentType',
          status: '$status'
        },
        count: { $sum: 1 },
        totalLikes: { $sum: '$engagement.likes' },
        totalViews: { $sum: '$engagement.views' },
        avgRating: { 
          $avg: '$content.rating.overall' 
        }
      }
    },
    {
      $group: {
        _id: '$_id.contentType',
        total: { $sum: '$count' },
        approved: {
          $sum: {
            $cond: [{ $eq: ['$_id.status', 'APPROVED'] }, '$count', 0]
          }
        },
        pending: {
          $sum: {
            $cond: [{ $eq: ['$_id.status', 'PENDING_MODERATION'] }, '$count', 0]
          }
        },
        totalLikes: { $sum: '$totalLikes' },
        totalViews: { $sum: '$totalViews' },
        avgRating: { $avg: '$avgRating' }
      }
    },
    {
      $project: {
        contentType: '$_id',
        stats: {
          total: '$total',
          approved: '$approved',
          pending: '$pending',
          totalLikes: '$totalLikes',
          totalViews: '$totalViews',
          avgRating: { $round: ['$avgRating', 2] }
        },
        _id: 0
      }
    }
  ]).toArray();
}

// Function to report content
function reportContent(contentId, reporterId, reason, details = null) {
  return db.user_content.updateOne(
    { _id: contentId },
    {
      $inc: { 'engagement.reports': 1 },
      $push: {
        'moderation.flags': {
          reporterId: reporterId,
          reason: reason,
          details: details,
          reportedAt: new Date()
        }
      },
      $set: {
        updatedAt: new Date()
      }
    }
  );
}

// Function to get similar content
function getSimilarContent(contentId, limit = 10) {
  const content = db.user_content.findOne({ _id: contentId });
  if (!content) return [];

  return db.user_content.find({
    _id: { $ne: contentId },
    targetType: content.targetType,
    targetId: content.targetId,
    contentType: content.contentType,
    status: 'APPROVED'
  })
  .sort({ 'engagement.likes': -1 })
  .limit(limit)
  .toArray();
}

print("✓ User content management functions created");
print('\n✓ Phase 3 complete - Core functions added');

// Phase 4: Create views for content discovery and moderation
print('\n=== Phase 4: Creating Views ===');

// Drop existing views if they exist
try { db.user_reviews.drop(); } catch(e) {}
try { db.user_media.drop(); } catch(e) {}
try { db.moderation_queue.drop(); } catch(e) {}
try { db.content_engagement.drop(); } catch(e) {}

// 1. User reviews view - aggregated review data
db.createView("user_reviews", "user_content", [
  {
    $match: {
      contentType: "REVIEW",
      status: "APPROVED"
    }
  },
  {
    $lookup: {
      from: "user_content",
      let: { reviewId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$parentId", { $toString: "$$reviewId" }] },
                { $eq: ["$contentType", "COMMENT"] },
                { $eq: ["$status", "APPROVED"] }
              ]
            }
          }
        },
        { $limit: 5 },
        { $sort: { createdAt: -1 } }
      ],
      as: "recentComments"
    }
  },
  {
    $project: {
      userId: 1,
      targetType: 1,
      targetId: 1,
      title: "$content.title",
      text: "$content.text",
      rating: "$content.rating",
      eventDate: "$eventDetails.eventDate",
      verifiedPurchase: "$eventDetails.verified",
      engagement: 1,
      recentComments: {
        $map: {
          input: "$recentComments",
          as: "comment",
          in: {
            userId: "$$comment.userId",
            text: "$$comment.content.text",
            createdAt: "$$comment.createdAt"
          }
        }
      },
      helpfulness: {
        $cond: {
          if: { $gt: [{ $add: ["$engagement.helpful", "$engagement.notHelpful"] }, 0] },
          then: {
            $divide: ["$engagement.helpful", { $add: ["$engagement.helpful", "$engagement.notHelpful"] }]
          },
          else: 0
        }
      },
      createdAt: 1,
      updatedAt: 1
    }
  },
  {
    $sort: { helpfulness: -1, createdAt: -1 }
  }
]);

// 2. User media view - photos and videos
db.createView("user_media", "user_content", [
  {
    $match: {
      contentType: { $in: ["PHOTO", "VIDEO"] },
      status: "APPROVED"
    }
  },
  {
    $project: {
      userId: 1,
      targetType: 1,
      targetId: 1,
      contentType: 1,
      mediaUrl: "$content.media.url",
      thumbnailUrl: "$content.media.thumbnailUrl",
      caption: "$content.media.caption",
      dimensions: "$content.media.dimensions",
      duration: "$content.media.duration",
      eventDate: "$eventDetails.eventDate",
      hashtags: "$content.hashtags",
      engagement: {
        likes: "$engagement.likes",
        shares: "$engagement.shares",
        views: "$engagement.views"
      },
      engagementRate: {
        $cond: {
          if: { $gt: ["$engagement.views", 0] },
          then: {
            $divide: [
              { $add: ["$engagement.likes", "$engagement.shares"] },
              "$engagement.views"
            ]
          },
          else: 0
        }
      },
      createdAt: 1
    }
  },
  {
    $sort: { engagementRate: -1, createdAt: -1 }
  }
]);

// 3. Moderation queue view
db.createView("moderation_queue", "user_content", [
  {
    $match: {
      $or: [
        { status: "PENDING_MODERATION" },
        { status: "FLAGGED" },
        { "engagement.reports": { $gt: 0 } }
      ]
    }
  },
  {
    $addFields: {
      priority: {
        $add: [
          { $multiply: ["$engagement.reports", 10] },
          { $multiply: ["$moderation.score", 100] },
          {
            $cond: [
              { $eq: ["$status", "FLAGGED"] },
              50,
              0
            ]
          }
        ]
      },
      waitTime: {
        $divide: [
          { $subtract: [new Date(), "$createdAt"] },
          1000 * 60 * 60
        ]
      }
    }
  },
  {
    $project: {
      userId: 1,
      contentType: 1,
      targetType: 1,
      targetId: 1,
      status: 1,
      content: 1,
      moderation: 1,
      engagement: {
        reports: "$engagement.reports",
        views: "$engagement.views"
      },
      priority: 1,
      waitTimeHours: { $round: ["$waitTime", 0] },
      createdAt: 1
    }
  },
  {
    $sort: { priority: -1, createdAt: 1 }
  }
]);

// 4. Content engagement view
db.createView("content_engagement", "user_content", [
  {
    $match: {
      status: "APPROVED",
      createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }
  },
  {
    $group: {
      _id: {
        targetType: "$targetType",
        targetId: "$targetId"
      },
      totalContent: { $sum: 1 },
      totalEngagement: {
        $sum: {
          $add: [
            "$engagement.likes",
            "$engagement.shares",
            "$engagement.comments",
            { $multiply: ["$engagement.views", 0.1] }
          ]
        }
      },
      avgRating: { $avg: "$content.rating.overall" },
      contentTypes: { $addToSet: "$contentType" },
      lastActivity: { $max: "$createdAt" }
    }
  },
  {
    $project: {
      targetType: "$_id.targetType",
      targetId: "$_id.targetId",
      metrics: {
        totalContent: "$totalContent",
        totalEngagement: { $round: ["$totalEngagement", 0] },
        avgRating: { $round: ["$avgRating", 2] },
        engagementPerContent: {
          $round: [
            { $divide: ["$totalEngagement", "$totalContent"] },
            2
          ]
        }
      },
      contentTypes: 1,
      lastActivity: 1,
      _id: 0
    }
  },
  {
    $sort: { "metrics.totalEngagement": -1 }
  }
]);

print("✓ User content views created");

// Check views
const views = db.getCollectionInfos({ type: "view" }).filter(v => 
  ["user_reviews", "user_media", "moderation_queue", "content_engagement"].includes(v.name)
);
print(`✓ Created ${views.length} views`);

print('\n✓ Phase 4 complete - Views created');
