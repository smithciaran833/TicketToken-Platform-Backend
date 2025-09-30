// TicketToken MongoDB Collections
// CMS Content Collection
// Collection: cms_content

// Content management system for static pages, articles, FAQs, and help content
// Stores website content, blog posts, help articles, and other CMS-managed content

db = db.getSiblingDB('tickettoken');

// Drop existing collection for clean setup
db.cms_content.drop();

// Create cms_content collection with validation
db.createCollection('cms_content', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['contentType', 'status', 'title', 'slug', 'createdAt', 'updatedAt'],
      properties: {
        contentType: {
          enum: ['PAGE', 'ARTICLE', 'FAQ', 'HELP', 'BLOG_POST', 'NEWS', 'GUIDE', 'POLICY', 'ANNOUNCEMENT', 'GLOSSARY'],
          description: 'Type of CMS content'
        },
        status: {
          enum: ['DRAFT', 'REVIEW', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED', 'UNPUBLISHED'],
          description: 'Content publication status'
        },
        title: {
          bsonType: 'string',
          maxLength: 200,
          description: 'Content title'
        },
        slug: {
          bsonType: 'string',
          pattern: '^[a-z0-9-]+$',
          maxLength: 200,
          description: 'URL-friendly identifier'
        },
        summary: {
          bsonType: 'string',
          maxLength: 500,
          description: 'Brief content summary'
        },
        content: {
          bsonType: 'object',
          properties: {
            body: {
              bsonType: 'string',
              description: 'Main content body (HTML/Markdown)'
            },
            excerpt: {
              bsonType: 'string',
              maxLength: 300,
              description: 'Short excerpt for listings'
            },
            featuredImage: {
              bsonType: 'string',
              description: 'Featured image URL'
            },
            sections: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  id: { bsonType: 'string' },
                  title: { bsonType: 'string' },
                  content: { bsonType: 'string' },
                  order: { bsonType: 'int' }
                }
              }
            }
          }
        },
        metadata: {
          bsonType: 'object',
          properties: {
            seo: {
              bsonType: 'object',
              properties: {
                title: { bsonType: 'string', maxLength: 70 },
                description: { bsonType: 'string', maxLength: 160 },
                keywords: {
                  bsonType: 'array',
                  items: { bsonType: 'string' }
                },
                ogImage: { bsonType: 'string' },
                canonical: { bsonType: 'string' }
              }
            },
            readTime: {
              bsonType: 'int',
              description: 'Estimated read time in minutes'
            },
            tags: {
              bsonType: 'array',
              items: { bsonType: 'string' }
            },
            category: {
              bsonType: 'string',
              description: 'Content category'
            },
            version: {
              bsonType: 'int',
              minimum: 1,
              description: 'Content version number'
            }
          }
        },
        navigation: {
          bsonType: 'object',
          properties: {
            parentId: {
              bsonType: 'string',
              description: 'Parent page ID for hierarchy'
            },
            order: {
              bsonType: 'int',
              description: 'Sort order in navigation'
            },
            breadcrumb: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  title: { bsonType: 'string' },
                  slug: { bsonType: 'string' }
                }
              }
            }
          }
        },
        publishing: {
          bsonType: 'object',
          properties: {
            publishedAt: {
              bsonType: 'date',
              description: 'Publication date'
            },
            scheduledFor: {
              bsonType: 'date',
              description: 'Scheduled publication date'
            },
            expiresAt: {
              bsonType: 'date',
              description: 'Content expiration date'
            },
            author: {
              bsonType: 'string',
              description: 'Author user ID'
            },
            editor: {
              bsonType: 'string',
              description: 'Last editor user ID'
            }
          }
        },
        visibility: {
          bsonType: 'object',
          properties: {
            isPublic: {
              bsonType: 'bool',
              description: 'Publicly accessible'
            },
            requiresAuth: {
              bsonType: 'bool',
              description: 'Requires authentication'
            },
            allowedRoles: {
              bsonType: 'array',
              items: { bsonType: 'string' },
              description: 'Roles allowed to view'
            },
            regions: {
              bsonType: 'array',
              items: { bsonType: 'string' },
              description: 'Allowed regions'
            }
          }
        },
        localization: {
          bsonType: 'object',
          properties: {
            language: {
              bsonType: 'string',
              pattern: '^[a-z]{2}(-[A-Z]{2})?$',
              description: 'Language code (e.g., en, en-US)'
            },
            isOriginal: {
              bsonType: 'bool',
              description: 'Is this the original version'
            },
            originalId: {
              bsonType: 'string',
              description: 'ID of original content'
            },
            translations: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  language: { bsonType: 'string' },
                  contentId: { bsonType: 'string' },
                  status: {
                    enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'APPROVED']
                  }
                }
              }
            }
          }
        },
        revision: {
          bsonType: 'object',
          properties: {
            history: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  version: { bsonType: 'int' },
                  editedBy: { bsonType: 'string' },
                  editedAt: { bsonType: 'date' },
                  changeNote: { bsonType: 'string' },
                  contentSnapshot: { bsonType: 'object' }
                }
              }
            },
            isDraft: {
              bsonType: 'bool',
              description: 'Is this a draft version'
            },
            publishedVersion: {
              bsonType: 'int',
              description: 'Currently published version'
            }
          }
        },
        analytics: {
          bsonType: 'object',
          properties: {
            views: {
              bsonType: 'long',
              description: 'Total page views'
            },
            uniqueVisitors: {
              bsonType: 'long',
              description: 'Unique visitors'
            },
            avgTimeOnPage: {
              bsonType: 'double',
              description: 'Average time on page in seconds'
            },
            bounceRate: {
              bsonType: 'double',
              description: 'Bounce rate percentage'
            },
            shares: {
              bsonType: 'object',
              properties: {
                facebook: { bsonType: 'long' },
                twitter: { bsonType: 'long' },
                linkedin: { bsonType: 'long' },
                email: { bsonType: 'long' }
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

print('✓ CMS content collection created with validation schema');
print('\n✓ Phase 1 complete - Basic collection structure created');

// Phase 2: Create indexes for efficient querying
print('\n=== Phase 2: Creating Indexes ===');

// Basic indexes
db.cms_content.createIndex({ slug: 1 }, { unique: true });
db.cms_content.createIndex({ contentType: 1, status: 1 });
db.cms_content.createIndex({ status: 1, 'publishing.publishedAt': -1 });
db.cms_content.createIndex({ 'metadata.tags': 1 });
db.cms_content.createIndex({ 'metadata.category': 1, status: 1 });

// Navigation and hierarchy indexes
db.cms_content.createIndex({ 'navigation.parentId': 1, 'navigation.order': 1 });
db.cms_content.createIndex({ contentType: 1, 'navigation.order': 1 });

// Publishing and scheduling indexes
db.cms_content.createIndex({ 
  status: 1, 
  'publishing.scheduledFor': 1,
  'publishing.expiresAt': 1 
});
db.cms_content.createIndex({ 'publishing.author': 1, createdAt: -1 });

// Localization indexes
db.cms_content.createIndex({ 'localization.language': 1, status: 1 });
db.cms_content.createIndex({ 'localization.originalId': 1 });

// Analytics and performance indexes
db.cms_content.createIndex({ 'analytics.views': -1, status: 1 });
db.cms_content.createIndex({ 'analytics.avgTimeOnPage': -1 });

// Text search index
db.cms_content.createIndex({
  title: 'text',
  summary: 'text',
  'content.body': 'text',
  'content.excerpt': 'text',
  'metadata.tags': 'text'
});

// Compound index for content listings
db.cms_content.createIndex({
  contentType: 1,
  status: 1,
  'publishing.publishedAt': -1,
  'metadata.category': 1
});

// Version tracking index
db.cms_content.createIndex({
  slug: 1,
  'metadata.version': -1
});

print('✓ Performance indexes created');

// Check indexes
const indexCount = db.cms_content.getIndexes().length;
print(`✓ Total indexes created: ${indexCount}`);
print('\n✓ Phase 2 complete - Indexes added');

// Phase 3: Core functions for CMS content management
print('\n=== Phase 3: Creating Core Functions ===');

// Function to get published content by slug
function getContentBySlug(slug, language = 'en') {
  return db.cms_content.findOne({
    slug: slug,
    status: 'PUBLISHED',
    $or: [
      { 'localization.language': language },
      { 'localization.language': { $exists: false } }
    ]
  });
}

// Function to get content hierarchy
function getContentHierarchy(parentId = null, contentType = null) {
  const query = {
    status: { $in: ['PUBLISHED', 'SCHEDULED'] },
    'navigation.parentId': parentId
  };
  
  if (contentType) {
    query.contentType = contentType;
  }
  
  return db.cms_content.find(query)
    .sort({ 'navigation.order': 1 })
    .toArray();
}

// Function to get related content
function getRelatedContent(contentId, limit = 5) {
  const content = db.cms_content.findOne({ _id: contentId });
  if (!content) return [];
  
  return db.cms_content.find({
    _id: { $ne: contentId },
    status: 'PUBLISHED',
    $or: [
      { 'metadata.category': content.metadata?.category },
      { 'metadata.tags': { $in: content.metadata?.tags || [] } }
    ]
  })
  .sort({ 'analytics.views': -1 })
  .limit(limit)
  .toArray();
}

// Function to get scheduled content
function getScheduledContent() {
  const now = new Date();
  
  return db.cms_content.find({
    status: 'SCHEDULED',
    'publishing.scheduledFor': { $lte: now },
    $or: [
      { 'publishing.expiresAt': { $exists: false } },
      { 'publishing.expiresAt': { $gt: now } }
    ]
  }).toArray();
}

// Function to search content
function searchContent(searchTerm, options = {}) {
  const {
    contentType = null,
    language = null,
    limit = 20,
    skip = 0
  } = options;
  
  const query = {
    $text: { $search: searchTerm },
    status: 'PUBLISHED'
  };
  
  if (contentType) {
    query.contentType = contentType;
  }
  
  if (language) {
    query['localization.language'] = language;
  }
  
  return db.cms_content.find(query)
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(limit)
    .toArray();
}

// Function to get popular content
function getPopularContent(days = 30, limit = 10) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  return db.cms_content.find({
    status: 'PUBLISHED',
    'publishing.publishedAt': { $gte: cutoff }
  })
  .sort({ 'analytics.views': -1 })
  .limit(limit)
  .toArray();
}

// Function to update content analytics
function updateContentAnalytics(slug, analytics) {
  return db.cms_content.updateOne(
    { slug: slug },
    {
      $inc: {
        'analytics.views': analytics.views || 0,
        'analytics.uniqueVisitors': analytics.uniqueVisitors || 0,
        'analytics.shares.facebook': analytics.facebookShares || 0,
        'analytics.shares.twitter': analytics.twitterShares || 0
      },
      $set: {
        'analytics.avgTimeOnPage': analytics.avgTimeOnPage,
        'analytics.bounceRate': analytics.bounceRate
      }
    }
  );
}

print('✓ CMS content management functions created');
print('\n✓ Phase 3 complete - Core functions added');

// Phase 4: Create views for CMS analytics and management
print('\n=== Phase 4: Creating Views ===');

// Drop existing views if they exist
try { db.cms_sitemap.drop(); } catch(e) {}
try { db.cms_popular_content.drop(); } catch(e) {}
try { db.cms_content_analytics.drop(); } catch(e) {}
try { db.cms_editorial_queue.drop(); } catch(e) {}

// 1. Sitemap view - for generating sitemaps
db.createView("cms_sitemap", "cms_content", [
  {
    $match: {
      status: "PUBLISHED",
      $or: [
        { "visibility.isPublic": true },
        { "visibility.isPublic": { $exists: false } },
        { "visibility": { $exists: false } }
      ]
    }
  },
  {
    $project: {
      url: { $concat: ["/", "$slug"] },
      title: 1,
      contentType: 1,
      lastModified: "$updatedAt",
      changeFrequency: {
        $switch: {
          branches: [
            { case: { $eq: ["$contentType", "NEWS"] }, then: "daily" },
            { case: { $eq: ["$contentType", "BLOG_POST"] }, then: "weekly" },
            { case: { $eq: ["$contentType", "FAQ"] }, then: "monthly" },
            { case: { $eq: ["$contentType", "PAGE"] }, then: "yearly" }
          ],
          default: "monthly"
        }
      },
      priority: {
        $switch: {
          branches: [
            { case: { $eq: ["$slug", "home"] }, then: 1.0 },
            { case: { $eq: ["$contentType", "PAGE"] }, then: 0.8 },
            { case: { $eq: ["$contentType", "BLOG_POST"] }, then: 0.6 },
            { case: { $eq: ["$contentType", "NEWS"] }, then: 0.7 }
          ],
          default: 0.5
        }
      },
      languages: "$localization.translations",
      parentUrl: {
        $cond: {
          if: { $ne: ["$navigation.parentId", null] },
          then: { $concat: ["/parent/", "$navigation.parentId"] },
          else: null
        }
      }
    }
  },
  {
    $sort: { contentType: 1, priority: -1, lastModified: -1 }
  }
]);

// 2. Popular content view
db.createView("cms_popular_content", "cms_content", [
  {
    $match: {
      status: "PUBLISHED",
      "analytics.views": { $gt: 0 }
    }
  },
  {
    $project: {
      title: 1,
      slug: 1,
      contentType: 1,
      category: "$metadata.category",
      author: "$publishing.author",
      publishedDate: "$publishing.publishedAt",
      metrics: {
        views: "$analytics.views",
        uniqueVisitors: "$analytics.uniqueVisitors",
        avgTimeOnPage: "$analytics.avgTimeOnPage",
        shares: {
          total: {
            $add: [
              { $ifNull: ["$analytics.shares.facebook", 0] },
              { $ifNull: ["$analytics.shares.twitter", 0] },
              { $ifNull: ["$analytics.shares.linkedin", 0] },
              { $ifNull: ["$analytics.shares.email", 0] }
            ]
          },
          breakdown: "$analytics.shares"
        },
        engagement: {
          $multiply: [
            { $divide: [{ $ifNull: ["$analytics.avgTimeOnPage", 0] }, 60] },
            { $subtract: [1, { $divide: [{ $ifNull: ["$analytics.bounceRate", 100] }, 100] }] }
          ]
        }
      },
      performance: {
        viewsPerDay: {
          $divide: [
            "$analytics.views",
            {
              $add: [
                1,
                {
                  $divide: [
                    { $subtract: [new Date(), "$publishing.publishedAt"] },
                    1000 * 60 * 60 * 24
                  ]
                }
              ]
            }
          ]
        }
      }
    }
  },
  {
    $sort: { "metrics.views": -1 }
  }
]);

// 3. Content analytics view
db.createView("cms_content_analytics", "cms_content", [
  {
    $match: {
      status: { $in: ["PUBLISHED", "UNPUBLISHED"] }
    }
  },
  {
    $group: {
      _id: {
        contentType: "$contentType",
        category: "$metadata.category",
        month: { $dateToString: { format: "%Y-%m", date: "$publishing.publishedAt" } }
      },
      count: { $sum: 1 },
      totalViews: { $sum: { $ifNull: ["$analytics.views", 0] } },
      avgViews: { $avg: { $ifNull: ["$analytics.views", 0] } },
      totalShares: {
        $sum: {
          $add: [
            { $ifNull: ["$analytics.shares.facebook", 0] },
            { $ifNull: ["$analytics.shares.twitter", 0] },
            { $ifNull: ["$analytics.shares.linkedin", 0] },
            { $ifNull: ["$analytics.shares.email", 0] }
          ]
        }
      },
      avgTimeOnPage: { $avg: { $ifNull: ["$analytics.avgTimeOnPage", 0] } },
      authors: { $addToSet: "$publishing.author" }
    }
  },
  {
    $project: {
      contentType: "$_id.contentType",
      category: "$_id.category",
      month: "$_id.month",
      metrics: {
        count: "$count",
        views: {
          total: "$totalViews",
          average: { $round: ["$avgViews", 0] }
        },
        shares: "$totalShares",
        avgTimeOnPage: { $round: ["$avgTimeOnPage", 1] },
        uniqueAuthors: { $size: "$authors" }
      },
      _id: 0
    }
  },
  {
    $sort: { month: -1, "metrics.views.total": -1 }
  }
]);

// 4. Editorial queue view - content needing review/action
db.createView("cms_editorial_queue", "cms_content", [
  {
    $match: {
      $or: [
        { status: "DRAFT" },
        { status: "REVIEW" },
        { status: "SCHEDULED", "publishing.scheduledFor": { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } },
        { "publishing.expiresAt": { $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }
      ]
    }
  },
  {
    $project: {
      title: 1,
      slug: 1,
      contentType: 1,
      status: 1,
      author: "$publishing.author",
      editor: "$publishing.editor",
      priority: {
        $switch: {
          branches: [
            { case: { $eq: ["$status", "REVIEW"] }, then: 1 },
            { case: { $and: [
                { $eq: ["$status", "SCHEDULED"] },
                { $lte: ["$publishing.scheduledFor", new Date(Date.now() + 24 * 60 * 60 * 1000)] }
              ]}, then: 2 },
            { case: { $lte: ["$publishing.expiresAt", new Date(Date.now() + 24 * 60 * 60 * 1000)] }, then: 3 }
          ],
          default: 4
        }
      },
      action: {
        $switch: {
          branches: [
            { case: { $eq: ["$status", "REVIEW"] }, then: "Needs Review" },
            { case: { $eq: ["$status", "DRAFT"] }, then: "Draft - Needs Completion" },
            { case: { $eq: ["$status", "SCHEDULED"] }, then: "Scheduled for Publishing" },
            { case: { $lte: ["$publishing.expiresAt", new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)] }, then: "Expiring Soon" }
          ],
          default: "No Action"
        }
      },
      dates: {
        created: "$createdAt",
        updated: "$updatedAt",
        scheduled: "$publishing.scheduledFor",
        expires: "$publishing.expiresAt"
      },
      daysUntilAction: {
        $switch: {
          branches: [
            { 
              case: { $eq: ["$status", "SCHEDULED"] }, 
              then: { 
                $divide: [
                  { $subtract: ["$publishing.scheduledFor", new Date()] },
                  1000 * 60 * 60 * 24
                ]
              }
            },
            { 
              case: { $ne: ["$publishing.expiresAt", null] }, 
              then: { 
                $divide: [
                  { $subtract: ["$publishing.expiresAt", new Date()] },
                  1000 * 60 * 60 * 24
                ]
              }
            }
          ],
          default: null
        }
      }
    }
  },
  {
    $sort: { priority: 1, daysUntilAction: 1 }
  }
]);

print('✓ CMS content views created');

// Verify views
const viewCount = db.getCollectionInfos({ type: "view" })
  .filter(v => v.name.startsWith("cms_"))
  .length;
print(`✓ Created ${viewCount} views`);

print('\n✓ Phase 4 complete - Views created');
