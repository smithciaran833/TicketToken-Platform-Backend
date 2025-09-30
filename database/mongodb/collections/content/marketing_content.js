// TicketToken MongoDB Collections
// Marketing Content Collection
// Collection: marketing_content

// Marketing materials, campaigns, and promotional content
// Stores ads, banners, email templates, social media content, and campaigns

db = db.getSiblingDB('tickettoken');

// Drop existing collection for clean setup
db.marketing_content.drop();

// Create marketing_content collection with validation
db.createCollection('marketing_content', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['contentType', 'status', 'title', 'createdAt', 'updatedAt'],
      properties: {
        contentType: {
          enum: ['BANNER', 'EMAIL_TEMPLATE', 'SOCIAL_POST', 'ADVERTISEMENT', 'LANDING_PAGE', 'NEWSLETTER', 'PUSH_NOTIFICATION', 'SMS_TEMPLATE', 'VIDEO_AD', 'INFOGRAPHIC'],
          description: 'Type of marketing content'
        },
        campaignId: {
          bsonType: 'string',
          description: 'Associated campaign ID'
        },
        status: {
          enum: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'],
          description: 'Content status'
        },
        title: {
          bsonType: 'string',
          maxLength: 200,
          description: 'Content title'
        },
        description: {
          bsonType: 'string',
          maxLength: 500,
          description: 'Content description'
        },
        content: {
          bsonType: 'object',
          properties: {
            headline: {
              bsonType: 'string',
              maxLength: 100,
              description: 'Main headline'
            },
            subheadline: {
              bsonType: 'string',
              maxLength: 200,
              description: 'Secondary headline'
            },
            body: {
              bsonType: 'string',
              description: 'Main content body'
            },
            cta: {
              bsonType: 'object',
              properties: {
                text: { bsonType: 'string' },
                url: { bsonType: 'string' },
                type: {
                  enum: ['BUTTON', 'LINK', 'BANNER'],
                  description: 'Call-to-action type'
                }
              }
            },
            media: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  type: {
                    enum: ['IMAGE', 'VIDEO', 'GIF', 'AUDIO'],
                    description: 'Media type'
                  },
                  url: { bsonType: 'string' },
                  thumbnailUrl: { bsonType: 'string' },
                  altText: { bsonType: 'string' },
                  dimensions: {
                    bsonType: 'object',
                    properties: {
                      width: { bsonType: 'int' },
                      height: { bsonType: 'int' }
                    }
                  },
                  fileSize: { bsonType: 'long' },
                  duration: { bsonType: 'int' }
                }
              }
            },
            template: {
              bsonType: 'object',
              properties: {
                name: { bsonType: 'string' },
                version: { bsonType: 'string' },
                variables: {
                  bsonType: 'object',
                  description: 'Template variables'
                }
              }
            },
            socialData: {
              bsonType: 'object',
              properties: {
                platforms: {
                  bsonType: 'array',
                  items: {
                    enum: ['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'LINKEDIN', 'TIKTOK', 'YOUTUBE']
                  }
                },
                hashtags: {
                  bsonType: 'array',
                  items: { bsonType: 'string' }
                },
                mentions: {
                  bsonType: 'array',
                  items: { bsonType: 'string' }
                }
              }
            }
          }
        },
        targeting: {
          bsonType: 'object',
          properties: {
            audience: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  type: {
                    enum: ['DEMOGRAPHIC', 'GEOGRAPHIC', 'BEHAVIORAL', 'INTEREST', 'CUSTOM'],
                    description: 'Audience type'
                  },
                  criteria: { bsonType: 'object' }
                }
              }
            },
            segments: {
              bsonType: 'array',
              items: { bsonType: 'string' },
              description: 'Target segment IDs'
            },
            locations: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  type: {
                    enum: ['COUNTRY', 'STATE', 'CITY', 'RADIUS'],
                    description: 'Location type'
                  },
                  value: { bsonType: 'string' },
                  radius: { bsonType: 'number' }
                }
              }
            },
            devices: {
              bsonType: 'array',
              items: {
                enum: ['DESKTOP', 'MOBILE', 'TABLET', 'TV']
              }
            }
          }
        },
        scheduling: {
          bsonType: 'object',
          properties: {
            startDate: {
              bsonType: 'date',
              description: 'Campaign start date'
            },
            endDate: {
              bsonType: 'date',
              description: 'Campaign end date'
            },
            timezone: {
              bsonType: 'string',
              description: 'Timezone for scheduling'
            },
            schedule: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  dayOfWeek: { bsonType: 'int', minimum: 0, maximum: 6 },
                  startTime: { bsonType: 'string' },
                  endTime: { bsonType: 'string' }
                }
              }
            }
          }
        },
        performance: {
          bsonType: 'object',
          properties: {
            impressions: { bsonType: 'long' },
            clicks: { bsonType: 'long' },
            conversions: { bsonType: 'long' },
            engagement: {
              bsonType: 'object',
              properties: {
                likes: { bsonType: 'long' },
                shares: { bsonType: 'long' },
                comments: { bsonType: 'long' },
                saves: { bsonType: 'long' }
              }
            },
            reach: { bsonType: 'long' },
            ctr: { bsonType: 'double' },
            conversionRate: { bsonType: 'double' },
            roi: { bsonType: 'double' },
            cost: {
              bsonType: 'object',
              properties: {
                total: { bsonType: 'double' },
                perImpression: { bsonType: 'double' },
                perClick: { bsonType: 'double' },
                perConversion: { bsonType: 'double' }
              }
            }
          }
        },
        metadata: {
          bsonType: 'object',
          properties: {
            tags: {
              bsonType: 'array',
              items: { bsonType: 'string' }
            },
            language: {
              bsonType: 'string',
              description: 'Content language (ISO 639-1)'
            },
            version: {
              bsonType: 'int',
              description: 'Content version number'
            },
            abTest: {
              bsonType: 'object',
              properties: {
                variant: { bsonType: 'string' },
                testId: { bsonType: 'string' },
                weight: { bsonType: 'double' }
              }
            }
          }
        },
        approval: {
          bsonType: 'object',
          properties: {
            requiredBy: {
              bsonType: 'array',
              items: { bsonType: 'string' },
              description: 'User IDs who need to approve'
            },
            approvedBy: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  userId: { bsonType: 'string' },
                  approvedAt: { bsonType: 'date' },
                  comments: { bsonType: 'string' }
                }
              }
            },
            rejectedBy: {
              bsonType: 'object',
              properties: {
                userId: { bsonType: 'string' },
                rejectedAt: { bsonType: 'date' },
                reason: { bsonType: 'string' }
              }
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
          description: 'Publication timestamp'
        },
        createdBy: {
          bsonType: 'string',
          description: 'Creator user ID'
        },
        updatedBy: {
          bsonType: 'string',
          description: 'Last updater user ID'
        }
      }
    }
  }
});

print('✓ Marketing content collection created with validation schema');
print('\n✓ Phase 1 complete - Basic collection structure created');

// Phase 2: Create indexes for efficient querying
print('\n=== Phase 2: Creating Indexes ===');

// Basic indexes
db.marketing_content.createIndex({ campaignId: 1, status: 1 });
db.marketing_content.createIndex({ contentType: 1, status: 1, createdAt: -1 });
db.marketing_content.createIndex({ status: 1, 'scheduling.startDate': 1 });
db.marketing_content.createIndex({ 'metadata.tags': 1 });
db.marketing_content.createIndex({ createdBy: 1, createdAt: -1 });

// Performance tracking indexes
db.marketing_content.createIndex({ 'performance.impressions': -1 });
db.marketing_content.createIndex({ 'performance.ctr': -1, status: 1 });
db.marketing_content.createIndex({ 'performance.conversionRate': -1, status: 1 });

// Scheduling indexes
db.marketing_content.createIndex({ 
  status: 1, 
  'scheduling.startDate': 1, 
  'scheduling.endDate': 1 
});

// Targeting indexes
db.marketing_content.createIndex({ 'targeting.segments': 1 });
db.marketing_content.createIndex({ 'targeting.locations.value': 1 });

// Approval workflow index
db.marketing_content.createIndex({ 
  status: 1, 
  'approval.requiredBy': 1,
  createdAt: -1 
});

// Text search index
db.marketing_content.createIndex({
  title: 'text',
  description: 'text',
  'content.headline': 'text',
  'content.subheadline': 'text',
  'content.body': 'text'
});

// A/B testing index
db.marketing_content.createIndex({ 
  'metadata.abTest.testId': 1, 
  'metadata.abTest.variant': 1 
});

print('✓ Performance indexes created');

// Check indexes
const indexCount = db.marketing_content.getIndexes().length;
print(`✓ Total indexes created: ${indexCount}`);
print('\n✓ Phase 2 complete - Indexes added');

// Phase 3: Core functions for marketing content management
print('\n=== Phase 3: Creating Core Functions ===');

// Function to get active campaigns
function getActiveCampaigns(options = {}) {
  const {
    contentType = null,
    limit = 20,
    skip = 0
  } = options;

  const query = {
    status: 'ACTIVE',
    $or: [
      { 'scheduling.endDate': { $exists: false } },
      { 'scheduling.endDate': { $gte: new Date() } }
    ]
  };

  if (contentType) {
    query.contentType = contentType;
  }

  return db.marketing_content.find(query)
    .sort({ 'performance.impressions': -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

// Function to get scheduled content
function getScheduledContent(days = 7) {
  const startDate = new Date();
  const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return db.marketing_content.find({
    status: 'SCHEDULED',
    'scheduling.startDate': {
      $gte: startDate,
      $lte: endDate
    }
  })
  .sort({ 'scheduling.startDate': 1 })
  .toArray();
}

// Function to calculate campaign performance
function getCampaignPerformance(campaignId) {
  return db.marketing_content.aggregate([
    {
      $match: {
        campaignId: campaignId
      }
    },
    {
      $group: {
        _id: '$contentType',
        count: { $sum: 1 },
        totalImpressions: { $sum: '$performance.impressions' },
        totalClicks: { $sum: '$performance.clicks' },
        totalConversions: { $sum: '$performance.conversions' },
        totalCost: { $sum: '$performance.cost.total' },
        avgCTR: { $avg: '$performance.ctr' },
        avgConversionRate: { $avg: '$performance.conversionRate' }
      }
    },
    {
      $project: {
        contentType: '$_id',
        metrics: {
          count: '$count',
          impressions: '$totalImpressions',
          clicks: '$totalClicks',
          conversions: '$totalConversions',
          cost: { $round: ['$totalCost', 2] },
          ctr: { $round: [{ $multiply: ['$avgCTR', 100] }, 2] },
          conversionRate: { $round: [{ $multiply: ['$avgConversionRate', 100] }, 2] },
          cpc: {
            $round: [
              {
                $cond: [
                  { $gt: ['$totalClicks', 0] },
                  { $divide: ['$totalCost', '$totalClicks'] },
                  0
                ]
              },
              2
            ]
          }
        },
        _id: 0
      }
    }
  ]).toArray();
}

// Function to get content requiring approval
function getPendingApprovals(userId = null) {
  const query = {
    status: 'PENDING_APPROVAL'
  };

  if (userId) {
    query['approval.requiredBy'] = userId;
    query['approval.approvedBy.userId'] = { $ne: userId };
  }

  return db.marketing_content.find(query)
    .sort({ createdAt: 1 })
    .toArray();
}

// Function to approve content
function approveContent(contentId, userId, comments = null) {
  return db.marketing_content.updateOne(
    { 
      _id: contentId,
      status: 'PENDING_APPROVAL'
    },
    {
      $push: {
        'approval.approvedBy': {
          userId: userId,
          approvedAt: new Date(),
          comments: comments
        }
      },
      $set: {
        updatedAt: new Date(),
        updatedBy: userId
      }
    }
  );
}

// Function to update content status
function updateContentStatus(contentId, newStatus, userId) {
  const updates = {
    status: newStatus,
    updatedAt: new Date(),
    updatedBy: userId
  };

  if (newStatus === 'ACTIVE') {
    updates.publishedAt = new Date();
  }

  return db.marketing_content.updateOne(
    { _id: contentId },
    { $set: updates }
  );
}

// Function to get A/B test results
function getABTestResults(testId) {
  return db.marketing_content.aggregate([
    {
      $match: {
        'metadata.abTest.testId': testId
      }
    },
    {
      $group: {
        _id: '$metadata.abTest.variant',
        count: { $sum: 1 },
        impressions: { $sum: '$performance.impressions' },
        clicks: { $sum: '$performance.clicks' },
        conversions: { $sum: '$performance.conversions' },
        totalCost: { $sum: '$performance.cost.total' }
      }
    },
    {
      $project: {
        variant: '$_id',
        count: 1,
        impressions: 1,
        clicks: 1,
        conversions: 1,
        cost: '$totalCost',
        ctr: {
          $cond: [
            { $gt: ['$impressions', 0] },
            { $round: [{ $multiply: [{ $divide: ['$clicks', '$impressions'] }, 100] }, 2] },
            0
          ]
        },
        conversionRate: {
          $cond: [
            { $gt: ['$clicks', 0] },
            { $round: [{ $multiply: [{ $divide: ['$conversions', '$clicks'] }, 100] }, 2] },
            0
          ]
        },
        _id: 0
      }
    },
    {
      $sort: { conversionRate: -1 }
    }
  ]).toArray();
}

// Function to search marketing content
function searchMarketingContent(searchTerm, options = {}) {
  const {
    contentType = null,
    status = null,
    limit = 20
  } = options;

  const query = {
    $text: { $search: searchTerm }
  };

  if (contentType) query.contentType = contentType;
  if (status) query.status = status;

  return db.marketing_content.find(
    query,
    { score: { $meta: "textScore" } }
  )
  .sort({ score: { $meta: "textScore" } })
  .limit(limit)
  .toArray();
}

print("✓ Marketing content management functions created");
print('\n✓ Phase 3 complete - Core functions added');

// Phase 4: Create views for marketing analytics and management
print('\n=== Phase 4: Creating Views ===');

// Drop existing views if they exist
try { db.campaign_overview.drop(); } catch(e) {}
try { db.content_performance.drop(); } catch(e) {}
try { db.approval_queue.drop(); } catch(e) {}
try { db.ab_test_results.drop(); } catch(e) {}

// 1. Campaign overview view
db.createView("campaign_overview", "marketing_content", [
  {
    $group: {
      _id: {
        campaignId: "$campaignId",
        status: "$status"
      },
      count: { $sum: 1 },
      totalImpressions: { $sum: { $ifNull: ["$performance.impressions", 0] } },
      totalClicks: { $sum: { $ifNull: ["$performance.clicks", 0] } },
      totalCost: { $sum: { $ifNull: ["$performance.cost.total", 0] } },
      contentTypes: { $addToSet: "$contentType" }
    }
  },
  {
    $group: {
      _id: "$_id.campaignId",
      statusBreakdown: {
        $push: {
          status: "$_id.status",
          count: "$count"
        }
      },
      totalContent: { $sum: "$count" },
      totalImpressions: { $sum: "$totalImpressions" },
      totalClicks: { $sum: "$totalClicks" },
      totalCost: { $sum: "$totalCost" },
      contentTypes: { $addToSet: "$contentTypes" }
    }
  },
  {
    $project: {
      campaignId: "$_id",
      totalContent: 1,
      statusBreakdown: 1,
      performance: {
        impressions: "$totalImpressions",
        clicks: "$totalClicks",
        cost: { $round: ["$totalCost", 2] },
        ctr: {
          $cond: [
            { $gt: ["$totalImpressions", 0] },
            { $round: [{ $multiply: [{ $divide: ["$totalClicks", "$totalImpressions"] }, 100] }, 2] },
            0
          ]
        }
      },
      contentTypes: {
        $reduce: {
          input: "$contentTypes",
          initialValue: [],
          in: { $setUnion: ["$$value", "$$this"] }
        }
      },
      _id: 0
    }
  },
  {
    $sort: { "performance.impressions": -1 }
  }
]);

// 2. Content performance view
db.createView("content_performance", "marketing_content", [
  {
    $match: {
      status: "ACTIVE",
      "performance.impressions": { $gt: 0 }
    }
  },
  {
    $project: {
      contentType: 1,
      title: 1,
      campaignId: 1,
      impressions: "$performance.impressions",
      clicks: "$performance.clicks",
      conversions: "$performance.conversions",
      cost: "$performance.cost.total",
      ctr: {
        $multiply: [{ $ifNull: ["$performance.ctr", 0] }, 100]
      },
      conversionRate: {
        $multiply: [{ $ifNull: ["$performance.conversionRate", 0] }, 100]
      },
      costPerClick: {
        $cond: [
          { $and: [
            { $gt: ["$performance.clicks", 0] },
            { $gt: ["$performance.cost.total", 0] }
          ]},
          { $divide: ["$performance.cost.total", "$performance.clicks"] },
          0
        ]
      },
      roi: {
        $cond: [
          { $gt: ["$performance.cost.total", 0] },
          {
            $multiply: [
              {
                $divide: [
                  {
                    $subtract: [
                      { $multiply: [{ $ifNull: ["$performance.conversions", 0] }, 50] }, // Assuming $50 value per conversion
                      "$performance.cost.total"
                    ]
                  },
                  "$performance.cost.total"
                ]
              },
              100
            ]
          },
          0
        ]
      },
      lastUpdated: "$updatedAt"
    }
  },
  {
    $sort: { roi: -1, impressions: -1 }
  }
]);

// 3. Approval queue view
db.createView("approval_queue", "marketing_content", [
  {
    $match: {
      status: "PENDING_APPROVAL"
    }
  },
  {
    $lookup: {
      from: "marketing_content",
      let: { campaignId: "$campaignId" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$campaignId", "$$campaignId"] },
                { $eq: ["$status", "ACTIVE"] }
              ]
            }
          }
        },
        { $count: "activeCount" }
      ],
      as: "campaignInfo"
    }
  },
  {
    $project: {
      title: 1,
      contentType: 1,
      campaignId: 1,
      createdBy: 1,
      createdAt: 1,
      daysPending: {
        $divide: [
          { $subtract: [new Date(), "$createdAt"] },
          1000 * 60 * 60 * 24
        ]
      },
      requiredApprovers: "$approval.requiredBy",
      approvedBy: {
        $map: {
          input: { $ifNull: ["$approval.approvedBy", []] },
          as: "approver",
          in: "$$approver.userId"
        }
      },
      pendingApprovers: {
        $setDifference: [
          "$approval.requiredBy",
          {
            $map: {
              input: { $ifNull: ["$approval.approvedBy", []] },
              as: "approver",
              in: "$$approver.userId"
            }
          }
        ]
      },
      campaignActiveContent: {
        $ifNull: [{ $arrayElemAt: ["$campaignInfo.activeCount", 0] }, 0]
      }
    }
  },
  {
    $sort: { daysPending: -1 }
  }
]);

// 4. A/B test results view
db.createView("ab_test_results", "marketing_content", [
  {
    $match: {
      "metadata.abTest.testId": { $exists: true },
      status: { $in: ["ACTIVE", "COMPLETED"] }
    }
  },
  {
    $group: {
      _id: {
        testId: "$metadata.abTest.testId",
        variant: "$metadata.abTest.variant"
      },
      contentCount: { $sum: 1 },
      impressions: { $sum: { $ifNull: ["$performance.impressions", 0] } },
      clicks: { $sum: { $ifNull: ["$performance.clicks", 0] } },
      conversions: { $sum: { $ifNull: ["$performance.conversions", 0] } },
      totalCost: { $sum: { $ifNull: ["$performance.cost.total", 0] } },
      titles: { $push: "$title" }
    }
  },
  {
    $group: {
      _id: "$_id.testId",
      variants: {
        $push: {
          variant: "$_id.variant",
          metrics: {
            contentCount: "$contentCount",
            impressions: "$impressions",
            clicks: "$clicks",
            conversions: "$conversions",
            cost: "$totalCost",
            ctr: {
              $cond: [
                { $gt: ["$impressions", 0] },
                { $round: [{ $multiply: [{ $divide: ["$clicks", "$impressions"] }, 100] }, 2] },
                0
              ]
            },
            conversionRate: {
              $cond: [
                { $gt: ["$clicks", 0] },
                { $round: [{ $multiply: [{ $divide: ["$conversions", "$clicks"] }, 100] }, 2] },
                0
              ]
            }
          },
          titles: "$titles"
        }
      },
      totalImpressions: { $sum: "$impressions" },
      totalConversions: { $sum: "$conversions" }
    }
  },
  {
    $project: {
      testId: "$_id",
      variants: 1,
      summary: {
        totalImpressions: "$totalImpressions",
        totalConversions: "$totalConversions",
        variantCount: { $size: "$variants" }
      },
      winner: {
        $arrayElemAt: [
          {
            $filter: {
              input: "$variants",
              cond: {
                $eq: [
                  "$$this.metrics.conversionRate",
                  { $max: "$variants.metrics.conversionRate" }
                ]
              }
            }
          },
          0
        ]
      },
      _id: 0
    }
  }
]);

print("✓ Marketing content views created");

// Check views
const viewCount = db.getCollectionNames().filter(name => 
  ["campaign_overview", "content_performance", "approval_queue", "ab_test_results"].includes(name)
).length;
print(`✓ Created ${viewCount} views`);

print('\n✓ Phase 4 complete - Views created');
