// TicketToken MongoDB Collections
// Notification Content Collection
// Collection: notification_content

// Notification templates and content for multi-channel communications
// Stores email, push, SMS, and in-app notification templates

db = db.getSiblingDB('tickettoken');

// Drop existing collection for clean setup
db.notification_content.drop();

// Create notification_content collection with validation
db.createCollection('notification_content', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['templateType', 'channel', 'eventType', 'status', 'name', 'createdAt', 'updatedAt'],
      properties: {
        templateType: {
          enum: ['TRANSACTIONAL', 'MARKETING', 'SYSTEM', 'REMINDER', 'ALERT'],
          description: 'Type of notification template'
        },
        channel: {
          enum: ['EMAIL', 'PUSH', 'SMS', 'IN_APP', 'WEBHOOK'],
          description: 'Notification delivery channel'
        },
        eventType: {
          bsonType: 'string',
          description: 'Event that triggers this notification (e.g., TICKET_PURCHASED, EVENT_REMINDER)'
        },
        status: {
          enum: ['DRAFT', 'ACTIVE', 'INACTIVE', 'TESTING', 'ARCHIVED'],
          description: 'Template status'
        },
        name: {
          bsonType: 'string',
          maxLength: 200,
          description: 'Template name'
        },
        description: {
          bsonType: 'string',
          maxLength: 500,
          description: 'Template description'
        },
        content: {
          bsonType: 'object',
          properties: {
            subject: {
              bsonType: 'string',
              maxLength: 200,
              description: 'Email subject or notification title'
            },
            preheader: {
              bsonType: 'string',
              maxLength: 150,
              description: 'Email preheader text'
            },
            body: {
              bsonType: 'string',
              description: 'Main content body (HTML for email, text for others)'
            },
            plainText: {
              bsonType: 'string',
              description: 'Plain text version'
            },
            shortMessage: {
              bsonType: 'string',
              maxLength: 160,
              description: 'Short version for SMS or push'
            },
            variables: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  name: { bsonType: 'string' },
                  description: { bsonType: 'string' },
                  required: { bsonType: 'bool' },
                  defaultValue: { bsonType: 'string' },
                  exampleValue: { bsonType: 'string' }
                }
              },
              description: 'Template variables'
            },
            actions: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  type: {
                    enum: ['PRIMARY', 'SECONDARY', 'LINK'],
                    description: 'Action type'
                  },
                  label: { bsonType: 'string' },
                  url: { bsonType: 'string' },
                  deepLink: { bsonType: 'string' }
                }
              }
            },
            media: {
              bsonType: 'object',
              properties: {
                headerImage: { bsonType: 'string' },
                logoUrl: { bsonType: 'string' },
                iconUrl: { bsonType: 'string' },
                backgroundColor: { bsonType: 'string' },
                textColor: { bsonType: 'string' }
              }
            }
          }
        },
        settings: {
          bsonType: 'object',
          properties: {
            priority: {
              enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
              description: 'Notification priority'
            },
            ttl: {
              bsonType: 'int',
              description: 'Time to live in seconds'
            },
            sound: {
              bsonType: 'string',
              description: 'Notification sound'
            },
            badge: {
              bsonType: 'bool',
              description: 'Show badge'
            },
            category: {
              bsonType: 'string',
              description: 'Notification category'
            },
            grouping: {
              bsonType: 'string',
              description: 'Notification grouping key'
            }
          }
        },
        targeting: {
          bsonType: 'object',
          properties: {
            userSegments: {
              bsonType: 'array',
              items: { bsonType: 'string' },
              description: 'Target user segments'
            },
            preferences: {
              bsonType: 'array',
              items: { bsonType: 'string' },
              description: 'Required user preferences'
            },
            languages: {
              bsonType: 'array',
              items: { bsonType: 'string' },
              description: 'Supported languages'
            },
            platforms: {
              bsonType: 'array',
              items: {
                enum: ['IOS', 'ANDROID', 'WEB', 'ALL']
              }
            }
          }
        },
        scheduling: {
          bsonType: 'object',
          properties: {
            sendTime: {
              enum: ['IMMEDIATE', 'SCHEDULED', 'OPTIMIZED', 'TRIGGER_BASED'],
              description: 'When to send'
            },
            delay: {
              bsonType: 'int',
              description: 'Delay in minutes after trigger'
            },
            timezone: {
              bsonType: 'string',
              description: 'Timezone handling'
            },
            quietHours: {
              bsonType: 'object',
              properties: {
                enabled: { bsonType: 'bool' },
                startTime: { bsonType: 'string' },
                endTime: { bsonType: 'string' }
              }
            },
            expiryTime: {
              bsonType: 'date',
              description: 'Template expiry date'
            }
          }
        },
        personalization: {
          bsonType: 'object',
          properties: {
            enableDynamicContent: {
              bsonType: 'bool',
              description: 'Enable dynamic content'
            },
            fallbackLanguage: {
              bsonType: 'string',
              description: 'Fallback language code'
            },
            mergeFields: {
              bsonType: 'object',
              description: 'Merge field mappings'
            }
          }
        },
        compliance: {
          bsonType: 'object',
          properties: {
            includeUnsubscribe: {
              bsonType: 'bool',
              description: 'Include unsubscribe link'
            },
            consentRequired: {
              bsonType: 'bool',
              description: 'Requires user consent'
            },
            dataRetention: {
              bsonType: 'int',
              description: 'Data retention days'
            },
            gdprCompliant: {
              bsonType: 'bool',
              description: 'GDPR compliant'
            }
          }
        },
        testing: {
          bsonType: 'object',
          properties: {
            testGroups: {
              bsonType: 'array',
              items: { bsonType: 'string' },
              description: 'Test group emails/phones'
            },
            lastTested: {
              bsonType: 'date',
              description: 'Last test date'
            },
            testResults: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  testedAt: { bsonType: 'date' },
                  testedBy: { bsonType: 'string' },
                  channel: { bsonType: 'string' },
                  success: { bsonType: 'bool' },
                  notes: { bsonType: 'string' }
                }
              }
            }
          }
        },
        metadata: {
          bsonType: 'object',
          properties: {
            version: {
              bsonType: 'int',
              description: 'Template version'
            },
            tags: {
              bsonType: 'array',
              items: { bsonType: 'string' }
            },
            category: {
              bsonType: 'string',
              description: 'Template category'
            },
            internalNotes: {
              bsonType: 'string',
              description: 'Internal documentation'
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

print('✓ Notification content collection created with validation schema');
print('\n✓ Phase 1 complete - Basic collection structure created');

// Phase 2: Create indexes for efficient querying
print('\n=== Phase 2: Creating Indexes ===');

// Basic indexes
db.notification_content.createIndex({ eventType: 1, channel: 1, status: 1 });
db.notification_content.createIndex({ templateType: 1, status: 1 });
db.notification_content.createIndex({ channel: 1, status: 1, createdAt: -1 });
db.notification_content.createIndex({ 'metadata.tags': 1 });
db.notification_content.createIndex({ createdBy: 1, createdAt: -1 });

// Status and scheduling indexes
db.notification_content.createIndex({ status: 1, 'scheduling.expiryTime': 1 });
db.notification_content.createIndex({ 'targeting.userSegments': 1 });
db.notification_content.createIndex({ 'targeting.languages': 1 });

// Testing indexes
db.notification_content.createIndex({ status: 1, 'testing.lastTested': 1 });

// Compound index for template lookup
db.notification_content.createIndex({
  eventType: 1,
  channel: 1,
  status: 1,
  'targeting.languages': 1
});

// Text search index
db.notification_content.createIndex({
  name: 'text',
  description: 'text',
  'content.subject': 'text',
  'content.body': 'text',
  'metadata.tags': 'text'
});

// Version tracking index
db.notification_content.createIndex({ 
  eventType: 1, 
  channel: 1, 
  'metadata.version': -1 
});

print('✓ Performance indexes created');

// Check indexes
const indexCount = db.notification_content.getIndexes().length;
print(`✓ Total indexes created: ${indexCount}`);
print('\n✓ Phase 2 complete - Indexes added');

// Phase 3: Core functions for notification content management
print('\n=== Phase 3: Creating Core Functions ===');

// Function to get active template for an event
function getNotificationTemplate(eventType, channel, language = 'en') {
  const query = {
    eventType: eventType,
    channel: channel,
    status: 'ACTIVE',
    $or: [
      { 'targeting.languages': language },
      { 'targeting.languages': { $size: 0 } },
      { 'targeting.languages': { $exists: false } }
    ]
  };

  // Get the latest version
  return db.notification_content.findOne(
    query,
    { sort: { 'metadata.version': -1 } }
  );
}

// Function to get all templates for an event
function getEventTemplates(eventType) {
  return db.notification_content.find({
    eventType: eventType,
    status: { $in: ['ACTIVE', 'TESTING'] }
  })
  .sort({ channel: 1, 'metadata.version': -1 })
  .toArray();
}

// Function to get templates by channel
function getChannelTemplates(channel, options = {}) {
  const {
    templateType = null,
    status = 'ACTIVE',
    limit = 50,
    skip = 0
  } = options;

  const query = {
    channel: channel,
    status: status
  };

  if (templateType) {
    query.templateType = templateType;
  }

  return db.notification_content.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
}

// Function to validate template variables
function validateTemplateVariables(templateId, providedVariables) {
  const template = db.notification_content.findOne({ _id: templateId });
  if (!template) return { valid: false, error: 'Template not found' };

  const requiredVars = template.content.variables
    ?.filter(v => v.required)
    ?.map(v => v.name) || [];

  const missing = requiredVars.filter(v => !providedVariables.hasOwnProperty(v));

  return {
    valid: missing.length === 0,
    missing: missing,
    template: template.name
  };
}

// Function to test notification template
function testNotificationTemplate(templateId, testData, testGroup) {
  const result = {
    testedAt: new Date(),
    testedBy: testData.userId || 'system',
    channel: testData.channel,
    success: true,
    notes: testData.notes || 'Test sent successfully'
  };

  return db.notification_content.updateOne(
    { _id: templateId },
    {
      $set: {
        'testing.lastTested': new Date(),
        updatedAt: new Date()
      },
      $push: {
        'testing.testResults': {
          $each: [result],
          $slice: -10 // Keep only last 10 test results
        }
      },
      $addToSet: {
        'testing.testGroups': { $each: testGroup }
      }
    }
  );
}

// Function to clone template
function cloneTemplate(templateId, newName, userId) {
  const original = db.notification_content.findOne({ _id: templateId });
  if (!original) return null;

  delete original._id;
  const clone = {
    ...original,
    name: newName,
    status: 'DRAFT',
    metadata: {
      ...original.metadata,
      version: 1,
      clonedFrom: templateId
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: userId,
    updatedBy: userId
  };

  const result = db.notification_content.insertOne(clone);
  return result.insertedId;
}

// Function to get template usage statistics
function getTemplateUsageStats(days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  return db.notification_content.aggregate([
    {
      $match: {
        status: 'ACTIVE',
        createdAt: { $gte: cutoff }
      }
    },
    {
      $group: {
        _id: {
          templateType: '$templateType',
          channel: '$channel'
        },
        count: { $sum: 1 },
        eventTypes: { $addToSet: '$eventType' }
      }
    },
    {
      $project: {
        templateType: '$_id.templateType',
        channel: '$_id.channel',
        count: 1,
        uniqueEvents: { $size: '$eventTypes' },
        _id: 0
      }
    },
    {
      $sort: { count: -1 }
    }
  ]).toArray();
}

// Function to find expiring templates
function getExpiringTemplates(days = 7) {
  const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  return db.notification_content.find({
    status: 'ACTIVE',
    'scheduling.expiryTime': {
      $lte: future,
      $gte: new Date()
    }
  })
  .sort({ 'scheduling.expiryTime': 1 })
  .toArray();
}

// Function to update template status
function updateTemplateStatus(templateId, newStatus, userId) {
  const validTransitions = {
    'DRAFT': ['TESTING', 'ACTIVE'],
    'TESTING': ['ACTIVE', 'DRAFT'],
    'ACTIVE': ['INACTIVE', 'ARCHIVED'],
    'INACTIVE': ['ACTIVE', 'ARCHIVED'],
    'ARCHIVED': []
  };

  const template = db.notification_content.findOne({ _id: templateId });
  if (!template) return { success: false, error: 'Template not found' };

  const currentStatus = template.status;
  if (!validTransitions[currentStatus]?.includes(newStatus)) {
    return { 
      success: false, 
      error: `Cannot transition from ${currentStatus} to ${newStatus}` 
    };
  }

  const result = db.notification_content.updateOne(
    { _id: templateId },
    {
      $set: {
        status: newStatus,
        updatedAt: new Date(),
        updatedBy: userId
      }
    }
  );

  return { success: true, result: result };
}

print("✓ Notification content management functions created");
print('\n✓ Phase 3 complete - Core functions added');

// Phase 4: Create views for notification management and analytics
print('\n=== Phase 4: Creating Views ===');

// Drop existing views if they exist
try { db.notification_templates.drop(); } catch(e) {}
try { db.notification_events.drop(); } catch(e) {}
try { db.notification_testing.drop(); } catch(e) {}
try { db.notification_compliance.drop(); } catch(e) {}

// 1. Notification templates view - organized by event and channel
db.createView("notification_templates", "notification_content", [
  {
    $match: {
      status: { $in: ["ACTIVE", "TESTING"] }
    }
  },
  {
    $group: {
      _id: {
        eventType: "$eventType",
        templateType: "$templateType"
      },
      channels: {
        $push: {
          channel: "$channel",
          name: "$name",
          status: "$status",
          version: "$metadata.version",
          languages: "$targeting.languages",
          priority: "$settings.priority"
        }
      },
      totalChannels: { $sum: 1 }
    }
  },
  {
    $project: {
      eventType: "$_id.eventType",
      templateType: "$_id.templateType",
      channels: 1,
      totalChannels: 1,
      _id: 0,
      coverage: {
        hasEmail: {
          $size: {
            $filter: {
              input: "$channels",
              cond: { $eq: ["$$this.channel", "EMAIL"] }
            }
          }
        },
        hasPush: {
          $size: {
            $filter: {
              input: "$channels",
              cond: { $eq: ["$$this.channel", "PUSH"] }
            }
          }
        },
        hasSMS: {
          $size: {
            $filter: {
              input: "$channels",
              cond: { $eq: ["$$this.channel", "SMS"] }
            }
          }
        }
      }
    }
  },
  {
    $sort: { eventType: 1, templateType: 1 }
  }
]);

// 2. Notification events view - all unique event types with template counts
db.createView("notification_events", "notification_content", [
  {
    $group: {
      _id: "$eventType",
      templates: {
        $push: {
          channel: "$channel",
          status: "$status",
          templateType: "$templateType",
          name: "$name"
        }
      },
      activeCount: {
        $sum: {
          $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0]
        }
      },
      testingCount: {
        $sum: {
          $cond: [{ $eq: ["$status", "TESTING"] }, 1, 0]
        }
      },
      channels: { $addToSet: "$channel" }
    }
  },
  {
    $project: {
      eventType: "$_id",
      templateCount: { $size: "$templates" },
      activeCount: 1,
      testingCount: 1,
      channels: 1,
      channelCoverage: { $size: "$channels" },
      templates: {
        $slice: ["$templates", 5] // Show first 5 templates
      },
      _id: 0
    }
  },
  {
    $sort: { activeCount: -1, eventType: 1 }
  }
]);

// 3. Notification testing view - templates in testing or recently tested
db.createView("notification_testing", "notification_content", [
  {
    $match: {
      $or: [
        { status: "TESTING" },
        { "testing.lastTested": { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
      ]
    }
  },
  {
    $project: {
      name: 1,
      eventType: 1,
      channel: 1,
      status: 1,
      lastTested: "$testing.lastTested",
      testResultCount: { $size: { $ifNull: ["$testing.testResults", []] } },
      testGroups: { $size: { $ifNull: ["$testing.testGroups", []] } },
      daysSinceTest: {
        $cond: {
          if: { $ne: ["$testing.lastTested", null] },
          then: {
            $divide: [
              { $subtract: [new Date(), "$testing.lastTested"] },
              1000 * 60 * 60 * 24
            ]
          },
          else: null
        }
      },
      recentTestResults: {
        $slice: [{ $ifNull: ["$testing.testResults", []] }, -3]
      }
    }
  },
  {
    $sort: { status: 1, lastTested: -1 }
  }
]);

// 4. Notification compliance view - templates requiring compliance review
db.createView("notification_compliance", "notification_content", [
  {
    $match: {
      templateType: "MARKETING",
      status: { $in: ["ACTIVE", "TESTING"] }
    }
  },
  {
    $project: {
      name: 1,
      eventType: 1,
      channel: 1,
      status: 1,
      complianceFlags: {
        includeUnsubscribe: "$compliance.includeUnsubscribe",
        consentRequired: "$compliance.consentRequired",
        gdprCompliant: "$compliance.gdprCompliant",
        dataRetention: "$compliance.dataRetention"
      },
      targetingInfo: {
        languages: "$targeting.languages",
        userSegments: "$targeting.userSegments"
      },
      isCompliant: {
        $and: [
          { $eq: ["$compliance.includeUnsubscribe", true] },
          { $ne: ["$compliance.gdprCompliant", false] }
        ]
      },
      lastUpdated: "$updatedAt"
    }
  },
  {
    $sort: { isCompliant: 1, lastUpdated: -1 }
  }
]);

print("✓ Notification content views created");

// Check views
const viewCount = db.getCollectionNames().filter(name => 
  ["notification_templates", "notification_events", "notification_testing", "notification_compliance"].includes(name)
).length;
print(`✓ Created ${viewCount} views`);

print('\n✓ Phase 4 complete - Views created');
