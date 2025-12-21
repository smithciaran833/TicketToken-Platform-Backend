# MongoDB Content Implementation Plan

## Executive Summary

### Current State
- **Coverage:** ~14% implemented
- **What exists:** 8 collections in analytics-service and blockchain-indexer (raw_analytics, user_behavior, campaigns, blockchain transactions, NFT metadata, etc.)
- **What's missing:** All 6 content collections that make the platform look professional

### What Competitors Have That You Don't
- **Ticketmaster/AXS:** Venue seating charts, interactive seat maps, "view from seat" photos, venue amenity filters, artist galleries, user reviews
- **Eventbrite:** Event cover images, multiple image galleries, organizer profiles, attendee reviews
- **SeatGeek:** Venue photos, section-by-section imagery, deal scores based on user data

### Desired State
Full content management for:
1. Venue content (seating charts, floor plans, photos, amenities)
2. Event content (images, videos, artist bios, galleries)
3. User content (reviews, ratings, photos)
4. Marketing content (campaigns, A/B testing, banners)

### Architecture Decision
**No new content-service.** Distribute content across existing services based on domain boundaries:

| Content Collection | Service | Reasoning |
|-------------------|---------|-----------|
| venue_content | venue-service | Venues own their content |
| event_content | event-service | Events own their content |
| user_content (reviews/ratings) | Shared library | Used by venue-service + event-service |
| marketing_content | notification-service | Already handles campaigns |

### Effort Estimate
- **Phase 0 - Workspace setup:** (Done in Redis plan)
- **Phase 1 - Shared libraries:** 3-4 days
- **Phase 2 - venue-service:** 3-4 days
- **Phase 3 - event-service:** 3-4 days
- **Phase 4 - notification-service:** 2-3 days
- **Phase 5 - search-service sync:** 2-3 days
- **Phase 6 - Authentication:** 2 days
- **Total:** 15-20 days

### Dependencies
- **Requires:** Redis Implementation Plan (Phase 0 workspace setup)
- **Enables:** Elasticsearch Implementation Plan (content enrichment)

---

## Part 1: Shared MongoDB Library

Create reusable MongoDB utilities at `backend/shared/mongodb/`

### Files to Create
```
backend/shared/mongodb/
├── src/
│   ├── index.ts
│   ├── connection.ts
│   ├── operations.ts
│   ├── schema-validator.ts
│   ├── indexes.ts
│   └── types.ts
├── package.json
├── tsconfig.json
└── README.md
```

#### 1.1 `backend/shared/mongodb/package.json`
```json
{
  "name": "@shared/mongodb",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "mongoose": "^8.0.0",
    "mongodb": "^6.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

#### 1.2 `backend/shared/mongodb/src/connection.ts`
```
Purpose: Centralized connection management

Features:
- Connection factory with retry logic
- Connection pooling configuration
- Health check utilities
- Graceful shutdown handling
- Multi-database support

Exports:
- createMongoClient(uri, options): MongoClient
- createMongooseConnection(uri, options): Connection
- healthCheck(client): Promise<boolean>
- gracefulShutdown(client): Promise<void>

Config:
- MONGODB_URI
- MONGODB_DATABASE (default: tickettoken_content)
- MONGODB_POOL_SIZE (default: 10)
- MONGODB_RETRY_WRITES (default: true)
```

#### 1.3 `backend/shared/mongodb/src/operations.ts`
```
Purpose: Common CRUD and aggregation operations

Operations:
- insertOne(collection, doc, options)
- insertMany(collection, docs, options)
- findOne(collection, filter, options)
- findMany(collection, filter, options) with pagination
- updateOne(collection, filter, update, options)
- updateMany(collection, filter, update, options)
- deleteOne(collection, filter, options)
- deleteMany(collection, filter, options)
- aggregate(collection, pipeline, options)
- bulkWrite(collection, operations, options)
- withTransaction(callback) - transaction helper
```

#### 1.4 `backend/shared/mongodb/src/schema-validator.ts`
```
Purpose: JSON Schema validation helpers

Features:
- buildSchema(definition) - creates MongoDB JSON schema
- validateDocument(doc, schema) - validates before insert
- addCollectionValidation(db, collection, schema, options)
- Common validators:
  - email
  - url
  - enum
  - dateRange
  - objectId
  - nested objects
```

#### 1.5 `backend/shared/mongodb/src/indexes.ts`
```
Purpose: Index management utilities

Features:
- ensureIndexes(collection, indexes) - idempotent creation
- createTTLIndex(collection, field, expireAfterSeconds)
- createCompoundIndex(collection, fields, options)
- createTextIndex(collection, fields, options)
- create2dsphereIndex(collection, field)
- dropIndex(collection, indexName)
- listIndexes(collection)
```

#### 1.6 `backend/shared/mongodb/src/types.ts`
```typescript
export interface ContentDocument {
  _id: ObjectId;
  status: 'draft' | 'published' | 'archived';
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

export interface VenueContent extends ContentDocument {
  venueId: ObjectId;
  contentType: VenueContentType;
  content: VenueContentData;
  displayOrder: number;
  featured: boolean;
}

export interface EventContent extends ContentDocument {
  eventId: ObjectId;
  contentType: EventContentType;
  content: EventContentData;
  displayOrder: number;
  featured: boolean;
}

export interface UserContent extends ContentDocument {
  userId: ObjectId;
  targetType: 'event' | 'venue' | 'performer' | 'ticket';
  targetId: ObjectId;
  contentType: UserContentType;
  content: UserContentData;
  engagement: EngagementMetrics;
  moderation: ModerationData;
}

export interface MarketingContent extends ContentDocument {
  campaignId: ObjectId;
  contentType: MarketingContentType;
  targeting: TargetingConfig;
  scheduling: SchedulingConfig;
  content: MarketingContentData;
  abTest: ABTestConfig;
  performance: PerformanceMetrics;
}

// ... additional type definitions
```

---

## Part 2: Shared Reviews Library

Create shared review/rating module at `backend/shared/content-reviews/`

### Files to Create
```
backend/shared/content-reviews/
├── src/
│   ├── index.ts
│   ├── models/
│   │   └── user-content.model.ts
│   ├── services/
│   │   ├── review.service.ts
│   │   ├── rating.service.ts
│   │   └── moderation.service.ts
│   └── types/
│       └── index.ts
├── package.json
└── tsconfig.json
```

#### 2.1 `backend/shared/content-reviews/package.json`
```json
{
  "name": "@shared/content-reviews",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "@shared/mongodb": "workspace:*",
    "mongoose": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "jest": "^29.0.0"
  }
}
```

#### 2.2 `user-content.model.ts` Schema
```typescript
const userContentSchema = new Schema({
  userId: { type: ObjectId, required: true, index: true },
  targetType: { 
    type: String, 
    enum: ['event', 'venue', 'performer', 'ticket'],
    required: true 
  },
  targetId: { type: ObjectId, required: true },
  contentType: { 
    type: String,
    enum: ['REVIEW', 'RATING', 'PHOTO', 'VIDEO', 'COMMENT', 'CHECK_IN', 'TIP'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'flagged', 'removed'],
    default: 'pending'
  },
  
  content: {
    review: {
      title: String,
      body: String,
      pros: [String],
      cons: [String],
      recommendsTo: [String],
      attendedDate: Date,
      verifiedAttendee: { type: Boolean, default: false }
    },
    
    rating: {
      overall: { type: Number, min: 1, max: 5 },
      categories: {
        value: { type: Number, min: 1, max: 5 },
        atmosphere: { type: Number, min: 1, max: 5 },
        sound: { type: Number, min: 1, max: 5 },
        sightlines: { type: Number, min: 1, max: 5 },
        service: { type: Number, min: 1, max: 5 },
        cleanliness: { type: Number, min: 1, max: 5 },
        accessibility: { type: Number, min: 1, max: 5 },
        parking: { type: Number, min: 1, max: 5 },
        foodAndDrink: { type: Number, min: 1, max: 5 }
      }
    },
    
    media: {
      url: String,
      thumbnailUrl: String,
      caption: String,
      takenAt: Date,
      location: {
        section: String,
        row: String,
        seat: String
      },
      tags: [String]
    },
    
    tip: {
      category: {
        type: String,
        enum: ['parking', 'food', 'seating', 'arrival', 'accessibility', 'other']
      },
      title: String,
      body: String
    }
  },
  
  engagement: {
    helpfulCount: { type: Number, default: 0 },
    notHelpfulCount: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 }
  },
  
  moderation: {
    autoScore: Number,
    manualReview: { type: Boolean, default: false },
    reviewedBy: String,
    reviewedAt: Date,
    rejectionReason: String,
    flags: [{
      type: {
        type: String,
        enum: ['spam', 'offensive', 'fake', 'irrelevant', 'copyright']
      },
      reportedBy: String,
      reportedAt: Date
    }]
  }
}, {
  timestamps: true
});

// Indexes
userContentSchema.index({ targetType: 1, targetId: 1, status: 1, contentType: 1 });
userContentSchema.index({ targetType: 1, targetId: 1, 'content.rating.overall': -1 });
userContentSchema.index({ userId: 1, createdAt: -1 });
userContentSchema.index({ status: 1, createdAt: 1 });
userContentSchema.index({ 'moderation.autoScore': 1, status: 1 });
userContentSchema.index({ targetType: 1, targetId: 1, 'engagement.helpfulCount': -1 });
```

#### 2.3 `review.service.ts`
```typescript
export class ReviewService {
  constructor(private db: Db, private redis: Redis) {}

  async createReview(userId: string, targetType: string, targetId: string, data: ReviewData): Promise<Review>
  async updateReview(reviewId: string, userId: string, data: Partial<ReviewData>): Promise<Review>
  async deleteReview(reviewId: string, userId: string): Promise<boolean>
  async getReviewsForTarget(targetType: string, targetId: string, options: QueryOptions): Promise<PaginatedResult<Review>>
  async getUserReviews(userId: string, options: QueryOptions): Promise<PaginatedResult<Review>>
  async markHelpful(reviewId: string, userId: string): Promise<void>
  async markNotHelpful(reviewId: string, userId: string): Promise<void>
  async reportReview(reviewId: string, userId: string, reason: string): Promise<void>
  
  // Cache integration with Redis
  private async cacheReviews(targetType: string, targetId: string, reviews: Review[]): Promise<void>
  private async getCachedReviews(targetType: string, targetId: string): Promise<Review[] | null>
  private async invalidateCache(targetType: string, targetId: string): Promise<void>
}
```

#### 2.4 `rating.service.ts`
```typescript
export class RatingService {
  constructor(private db: Db, private redis: Redis) {}

  async submitRating(userId: string, targetType: string, targetId: string, data: RatingData): Promise<Rating>
  async updateRating(ratingId: string, userId: string, data: Partial<RatingData>): Promise<Rating>
  async getRatingSummary(targetType: string, targetId: string): Promise<RatingSummary>
  async getCategoryRatings(targetType: string, targetId: string): Promise<CategoryRatings>
  async getUserRating(userId: string, targetType: string, targetId: string): Promise<Rating | null>
  
  // Aggregation
  async recalculateSummary(targetType: string, targetId: string): Promise<RatingSummary>
  
  // Cache integration
  private async cacheSummary(targetType: string, targetId: string, summary: RatingSummary): Promise<void>
  private async getCachedSummary(targetType: string, targetId: string): Promise<RatingSummary | null>
}
```

#### 2.5 `moderation.service.ts`
```typescript
export class ModerationService {
  constructor(private db: Db) {}

  async getPendingQueue(options: QueryOptions): Promise<PaginatedResult<UserContent>>
  async approveContent(contentId: string, moderatorId: string): Promise<void>
  async rejectContent(contentId: string, moderatorId: string, reason: string): Promise<void>
  async flagContent(contentId: string, flagType: FlagType, reporterId: string): Promise<void>
  async autoModerate(content: UserContent): Promise<{ score: number, action: 'approve' | 'review' | 'reject' }>
  async bulkModerate(contentIds: string[], action: 'approve' | 'reject', moderatorId: string): Promise<BulkResult>
  async getContentStats(): Promise<ModerationStats>
}
```

---

## Part 3: venue-service Integration

### Files to Create
```
backend/services/venue-service/src/
├── config/
│   └── mongodb.ts
├── models/mongodb/
│   └── venue-content.model.ts
├── services/
│   └── venue-content.service.ts
├── controllers/
│   ├── venue-content.controller.ts
│   └── venue-reviews.controller.ts
└── routes/
    ├── venue-content.routes.ts
    └── venue-reviews.routes.ts
```

### Files to Modify
- `src/config/dependencies.ts` - Add MongoDB connection
- `src/index.ts` - Register new routes
- `package.json` - Add dependencies

### 3.1 `venue-content.model.ts` Schema
```typescript
const venueContentSchema = new Schema({
  venueId: { type: ObjectId, required: true, index: true },
  contentType: {
    type: String,
    enum: [
      'FLOOR_PLAN', 'SEATING_CHART', 'PHOTO', 'VIDEO', 'VIRTUAL_TOUR',
      'AMENITIES', 'DIRECTIONS', 'PARKING_INFO', 'ACCESSIBILITY_INFO',
      'POLICIES', 'FAQ'
    ],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  
  content: {
    // For SEATING_CHART
    sections: [{
      sectionId: String,
      name: String,
      capacity: Number,
      type: { type: String, enum: ['seated', 'standing', 'vip', 'accessible'] },
      coordinates: {
        x: Number, y: Number, width: Number, height: Number
      },
      rows: [{
        rowId: String,
        name: String,
        seats: [{
          seatId: String,
          number: String,
          type: { type: String, enum: ['standard', 'accessible', 'restricted_view', 'premium'] },
          coordinates: { x: Number, y: Number }
        }]
      }]
    }],
    
    // For PHOTO/VIDEO
    media: {
      url: String,
      thumbnailUrl: String,
      type: { type: String, enum: ['exterior', 'interior', 'stage', 'seating', 'amenity', 'view_from_seat'] },
      caption: String,
      altText: String,
      dimensions: { width: Number, height: Number },
      sectionId: String,
      rowId: String
    },
    
    // For AMENITIES
    amenities: [{
      type: { type: String, enum: ['parking', 'food', 'bar', 'wifi', 'atm', 'restrooms', 'coat_check', 'vip_lounge', 'smoking_area'] },
      name: String,
      description: String,
      location: String,
      hours: String,
      pricing: String
    }],
    
    // For ACCESSIBILITY_INFO
    accessibility: [{
      type: { type: String, enum: ['wheelchair', 'hearing_assistance', 'visual_assistance', 'service_animals', 'elevator', 'accessible_parking', 'accessible_restrooms'] },
      description: String,
      location: String,
      contactInfo: String
    }],
    
    // For PARKING_INFO
    parking: [{
      type: { type: String, enum: ['onsite', 'nearby', 'street', 'valet'] },
      name: String,
      address: String,
      capacity: Number,
      pricing: String,
      hours: String,
      distance: String,
      coordinates: { lat: Number, lng: Number }
    }],
    
    // For POLICIES
    policies: {
      ageRestrictions: String,
      bagPolicy: String,
      cameraPolicy: String,
      reentryPolicy: String,
      smokingPolicy: String,
      alcoholPolicy: String
    },
    
    // For DIRECTIONS
    directions: {
      byTransit: String,
      byCar: String,
      byFoot: String,
      landmarks: String
    }
  },
  
  displayOrder: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  primaryImage: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  previousVersionId: ObjectId,
  
  publishedAt: Date,
  archivedAt: Date,
  createdBy: String,
  updatedBy: String
}, {
  timestamps: true
});

// Indexes
venueContentSchema.index({ venueId: 1, contentType: 1, status: 1 });
venueContentSchema.index({ venueId: 1, status: 1, displayOrder: 1 });
venueContentSchema.index({ contentType: 1, status: 1 });
venueContentSchema.index({ venueId: 1, 'content.media.type': 1 });
venueContentSchema.index({ featured: 1, status: 1 });
venueContentSchema.index({ archivedAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 day TTL
```

### 3.2 New API Endpoints

**Venue Content:**
```
GET    /api/v1/venues/:venueId/content
GET    /api/v1/venues/:venueId/content/:contentType
POST   /api/v1/venues/:venueId/content
PUT    /api/v1/venues/:venueId/content/:contentId
DELETE /api/v1/venues/:venueId/content/:contentId
GET    /api/v1/venues/:venueId/seating-chart
PUT    /api/v1/venues/:venueId/seating-chart
GET    /api/v1/venues/:venueId/photos
GET    /api/v1/venues/:venueId/amenities
GET    /api/v1/venues/:venueId/accessibility
```

**Venue Reviews (using shared library):**
```
GET    /api/v1/venues/:venueId/reviews
GET    /api/v1/venues/:venueId/ratings/summary
POST   /api/v1/venues/:venueId/reviews
PUT    /api/v1/venues/:venueId/reviews/:reviewId
DELETE /api/v1/venues/:venueId/reviews/:reviewId
POST   /api/v1/venues/:venueId/reviews/:reviewId/helpful
POST   /api/v1/venues/:venueId/reviews/:reviewId/report
```

### 3.3 Authentication & Authorization

All new endpoints require authentication. Permission levels:

| Endpoint | Permission |
|----------|------------|
| GET content | Public (published) or venue_admin (all) |
| POST content | venue_admin, venue_staff |
| PUT content | venue_admin, venue_staff |
| DELETE content | venue_admin |
| GET reviews | Public |
| POST reviews | authenticated_user |
| PUT reviews | review_owner |
| DELETE reviews | review_owner, moderator, admin |
| POST helpful/report | authenticated_user |

---

## Part 4: event-service Integration

### Files to Create
```
backend/services/event-service/src/
├── config/
│   └── mongodb.ts
├── models/mongodb/
│   └── event-content.model.ts
├── services/
│   └── event-content.service.ts
├── controllers/
│   ├── event-content.controller.ts
│   └── event-reviews.controller.ts
└── routes/
    ├── event-content.routes.ts
    └── event-reviews.routes.ts
```

### Files to Modify
- `src/config/dependencies.ts` - Add MongoDB connection
- `src/index.ts` - Register new routes
- `package.json` - Add dependencies

### 4.1 `event-content.model.ts` Schema
```typescript
const eventContentSchema = new Schema({
  eventId: { type: ObjectId, required: true, index: true },
  contentType: {
    type: String,
    enum: [
      'DESCRIPTION', 'COVER_IMAGE', 'GALLERY', 'VIDEO', 'TRAILER',
      'PERFORMER_BIO', 'LINEUP', 'SCHEDULE', 'FAQ', 'SPONSOR', 'PROMOTIONAL'
    ],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  
  content: {
    // For DESCRIPTION
    description: {
      short: { type: String, maxlength: 160 },
      full: String,
      highlights: [String],
      ageRestriction: String,
      language: String
    },
    
    // For COVER_IMAGE / GALLERY
    media: {
      url: String,
      thumbnailUrl: String,
      type: { type: String, enum: ['cover', 'gallery', 'poster', 'banner', 'social'] },
      caption: String,
      altText: String,
      dimensions: { width: Number, height: Number },
      focalPoint: { x: Number, y: Number },
      credit: String
    },
    
    // For VIDEO / TRAILER
    video: {
      url: String,
      platform: { type: String, enum: ['youtube', 'vimeo', 'hosted', 'tiktok'] },
      embedCode: String,
      thumbnailUrl: String,
      duration: Number,
      caption: String
    },
    
    // For PERFORMER_BIO
    performer: {
      performerId: String,
      name: String,
      role: { type: String, enum: ['headliner', 'support', 'opener', 'special_guest', 'dj', 'host'] },
      bio: String,
      photoUrl: String,
      socialLinks: {
        website: String,
        instagram: String,
        twitter: String,
        spotify: String,
        youtube: String
      },
      genres: [String],
      setTime: Date,
      setDuration: Number
    },
    
    // For LINEUP
    lineup: [{
      performerId: String,
      name: String,
      role: String,
      order: Number,
      day: Date,
      stage: String,
      setTime: Date,
      setDuration: Number
    }],
    
    // For SCHEDULE
    schedule: [{
      time: Date,
      title: String,
      description: String,
      location: String,
      type: { type: String, enum: ['doors', 'performance', 'intermission', 'meet_greet', 'vip', 'other'] }
    }],
    
    // For SPONSOR
    sponsor: {
      name: String,
      level: { type: String, enum: ['presenting', 'platinum', 'gold', 'silver', 'partner'] },
      logoUrl: String,
      websiteUrl: String,
      description: String
    },
    
    // For PROMOTIONAL
    promotional: {
      headline: String,
      subheadline: String,
      ctaText: String,
      ctaUrl: String,
      promoCode: String,
      validUntil: Date
    }
  },
  
  displayOrder: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  version: { type: Number, default: 1 },
  previousVersionId: ObjectId,
  
  publishedAt: Date,
  expiresAt: Date,
  createdBy: String,
  updatedBy: String
}, {
  timestamps: true
});

// Indexes
eventContentSchema.index({ eventId: 1, contentType: 1, status: 1 });
eventContentSchema.index({ eventId: 1, status: 1, displayOrder: 1 });
eventContentSchema.index({ contentType: 1, status: 1 });
eventContentSchema.index({ 'content.performer.performerId': 1 });
eventContentSchema.index({ 'content.lineup.performerId': 1 });
eventContentSchema.index({ featured: 1, status: 1 });
eventContentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL on expiresAt
```

### 4.2 New API Endpoints

**Event Content:**
```
GET    /api/v1/events/:eventId/content
GET    /api/v1/events/:eventId/content/:contentType
POST   /api/v1/events/:eventId/content
PUT    /api/v1/events/:eventId/content/:contentId
DELETE /api/v1/events/:eventId/content/:contentId
GET    /api/v1/events/:eventId/gallery
GET    /api/v1/events/:eventId/lineup
GET    /api/v1/events/:eventId/schedule
GET    /api/v1/events/:eventId/performers
```

**Event Reviews (using shared library):**
```
GET    /api/v1/events/:eventId/reviews
GET    /api/v1/events/:eventId/ratings/summary
POST   /api/v1/events/:eventId/reviews
PUT    /api/v1/events/:eventId/reviews/:reviewId
DELETE /api/v1/events/:eventId/reviews/:reviewId
POST   /api/v1/events/:eventId/reviews/:reviewId/helpful
POST   /api/v1/events/:eventId/reviews/:reviewId/report
```

### 4.3 Authentication & Authorization

Same permission model as venue-service:

| Endpoint | Permission |
|----------|------------|
| GET content | Public (published) or event_admin (all) |
| POST content | event_admin, venue_admin |
| PUT content | event_admin, venue_admin |
| DELETE content | event_admin |
| GET reviews | Public |
| POST reviews | authenticated_user (verified attendee preferred) |
| PUT reviews | review_owner |
| DELETE reviews | review_owner, moderator, admin |

---

## Part 5: notification-service Integration

### Files to Create
```
backend/services/notification-service/src/
├── config/
│   └── mongodb.ts
├── models/mongodb/
│   └── marketing-content.model.ts
├── services/
│   └── marketing.service.ts
├── controllers/
│   └── marketing.controller.ts
└── routes/
    └── marketing.routes.ts
```

### Files to Modify
- `src/config/dependencies.ts` - Add MongoDB connection
- `src/index.ts` - Register new routes
- `package.json` - Add dependencies

### 5.1 `marketing-content.model.ts` Schema
```typescript
const marketingContentSchema = new Schema({
  campaignId: { type: ObjectId, required: true, index: true },
  contentType: {
    type: String,
    enum: ['BANNER', 'EMAIL_TEMPLATE', 'PUSH_TEMPLATE', 'SOCIAL_POST', 'LANDING_PAGE', 'POPUP', 'ADVERTISEMENT'],
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'paused', 'completed', 'archived'],
    default: 'draft'
  },
  
  targeting: {
    audiences: [String],
    locations: [String],
    devices: { type: String, enum: ['all', 'mobile', 'desktop'], default: 'all' },
    platforms: { type: String, enum: ['all', 'ios', 'android', 'web'], default: 'all' },
    languages: [String]
  },
  
  scheduling: {
    startDate: Date,
    endDate: Date,
    timezone: String,
    dayParting: [{
      dayOfWeek: Number,
      startHour: Number,
      endHour: Number
    }]
  },
  
  content: {
    creative: {
      headline: String,
      subheadline: String,
      body: String,
      ctaText: String,
      ctaUrl: String,
      imageUrl: String,
      mobileImageUrl: String,
      backgroundColor: String,
      textColor: String
    },
    
    email: {
      subject: String,
      preheader: String,
      htmlBody: String,
      textBody: String,
      fromName: String,
      replyTo: String
    },
    
    push: {
      title: String,
      body: String,
      imageUrl: String,
      deepLink: String,
      actionButtons: [{
        text: String,
        action: String
      }]
    },
    
    social: {
      platform: { type: String, enum: ['facebook', 'instagram', 'twitter', 'tiktok'] },
      text: String,
      mediaUrls: [String],
      hashtags: [String],
      mentions: [String]
    }
  },
  
  abTest: {
    enabled: { type: Boolean, default: false },
    testName: String,
    variants: [{
      variantId: String,
      name: String,
      weight: Number,
      content: Schema.Types.Mixed
    }],
    winningVariant: String,
    testEndDate: Date
  },
  
  performance: {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    ctr: Number,
    conversionRate: Number,
    costPerClick: Number,
    costPerConversion: Number,
    roas: Number
  },
  
  budget: {
    total: Number,
    spent: { type: Number, default: 0 },
    daily: Number
  },
  
  publishedAt: Date,
  createdBy: String,
  updatedBy: String
}, {
  timestamps: true
});

// Indexes
marketingContentSchema.index({ campaignId: 1, contentType: 1 });
marketingContentSchema.index({ status: 1, 'scheduling.startDate': 1 });
marketingContentSchema.index({ 'targeting.audiences': 1, status: 1 });
marketingContentSchema.index({ 'abTest.enabled': 1, status: 1 });
marketingContentSchema.index({ 'performance.conversions': -1 });
```

### 5.2 New API Endpoints
```
GET    /api/v1/marketing/campaigns
GET    /api/v1/marketing/campaigns/:campaignId
POST   /api/v1/marketing/campaigns
PUT    /api/v1/marketing/campaigns/:campaignId
DELETE /api/v1/marketing/campaigns/:campaignId
GET    /api/v1/marketing/campaigns/:campaignId/content
POST   /api/v1/marketing/campaigns/:campaignId/content
PUT    /api/v1/marketing/campaigns/:campaignId/content/:contentId
GET    /api/v1/marketing/ab-tests
GET    /api/v1/marketing/ab-tests/:testId/results
POST   /api/v1/marketing/ab-tests/:testId/winner
```

### 5.3 Authentication & Authorization

| Endpoint | Permission |
|----------|------------|
| GET campaigns | marketing_admin, venue_admin |
| POST campaigns | marketing_admin |
| PUT campaigns | marketing_admin |
| DELETE campaigns | marketing_admin |
| A/B test endpoints | marketing_admin |

---

## Part 6: search-service Integration

### Files to Create/Modify
```
backend/services/search-service/src/
├── config/
│   └── mongodb.ts                    # NEW
├── services/
│   └── content-sync.service.ts       # NEW - Syncs MongoDB to ES
└── scripts/
    └── sync-content.ts               # NEW - Initial bulk sync
```

### Modify
- `src/services/sync.service.ts` - Add content enrichment calls
- `package.json` - Add @shared/mongodb dependency

### 6.1 `content-sync.service.ts`

**Purpose:** Sync MongoDB content to Elasticsearch for enriched search
```typescript
export class ContentSyncService {
  constructor(
    private mongoDb: Db,
    private esClient: Client,
    private redis: Redis
  ) {}

  // Sync venue content to ES venues index
  async syncVenueContent(venueId: string): Promise<void> {
    const content = await this.mongoDb.collection('venue_content')
      .find({ venueId, status: 'published' })
      .toArray();
    
    const ratings = await this.getRatingSummary('venue', venueId);
    
    await this.esClient.update({
      index: 'venues',
      id: venueId,
      body: {
        doc: {
          amenities: this.extractAmenities(content),
          accessibilityFeatures: this.extractAccessibility(content),
          images: this.extractImages(content),
          ratings: ratings
        }
      }
    });
  }

  // Sync event content to ES events index
  async syncEventContent(eventId: string): Promise<void> {
    const content = await this.mongoDb.collection('event_content')
      .find({ eventId, status: 'published' })
      .toArray();
    
    const ratings = await this.getRatingSummary('event', eventId);
    
    await this.esClient.update({
      index: 'events',
      id: eventId,
      body: {
        doc: {
          performers: this.extractPerformers(content),
          images: this.extractImages(content),
          lineup: this.extractLineup(content),
          ratings: ratings
        }
      }
    });
  }

  // Sync ratings when reviews approved
  async syncRatings(targetType: string, targetId: string): Promise<void> {
    const ratings = await this.getRatingSummary(targetType, targetId);
    
    await this.esClient.update({
      index: targetType === 'venue' ? 'venues' : 'events',
      id: targetId,
      body: {
        doc: { ratings }
      }
    });
  }
}
```

### 6.2 Sync Triggers

**Event-driven approach (recommended):**

When content is published in venue-service or event-service:
```typescript
// In venue-content.service.ts after publish
await this.kafkaProducer.send({
  topic: 'content.published',
  messages: [{
    key: venueId,
    value: JSON.stringify({ 
      type: 'venue_content', 
      venueId, 
      contentId,
      action: 'publish'
    })
  }]
});
```

search-service consumes and syncs:
```typescript
// In search-service
kafkaConsumer.subscribe({ topic: 'content.published' });

kafkaConsumer.on('message', async (message) => {
  const { type, venueId, eventId } = JSON.parse(message.value);
  
  if (type === 'venue_content') {
    await contentSyncService.syncVenueContent(venueId);
  } else if (type === 'event_content') {
    await contentSyncService.syncEventContent(eventId);
  }
});
```

---

## Part 7: Implementation Order

### Phase 1: Shared Libraries (Days 1-4)
1. Create `backend/shared/mongodb/`
   - connection.ts
   - operations.ts
   - schema-validator.ts
   - indexes.ts
   - types.ts
   - index.ts
   - package.json
2. Create `backend/shared/content-reviews/`
   - models/user-content.model.ts
   - services/review.service.ts
   - services/rating.service.ts
   - services/moderation.service.ts
   - types/index.ts
   - index.ts
   - package.json
3. Unit tests for shared libraries
4. Test Redis integration in review/rating services

### Phase 2: venue-service (Days 5-8)
1. Add MongoDB config
2. Create venue-content model
3. Create venue-content service
4. Create venue-content controller and routes
5. Integrate shared reviews library
6. Create venue-reviews controller and routes
7. Add authentication middleware
8. Test all endpoints

### Phase 3: event-service (Days 9-12)
1. Add MongoDB config
2. Create event-content model
3. Create event-content service
4. Create event-content controller and routes
5. Integrate shared reviews library
6. Create event-reviews controller and routes
7. Add authentication middleware
8. Test all endpoints

### Phase 4: notification-service (Days 13-15)
1. Add MongoDB config
2. Create marketing-content model
3. Create marketing service
4. Create marketing controller and routes
5. Add authentication middleware
6. Test A/B testing functionality

### Phase 5: search-service Sync (Days 16-18)
1. Add MongoDB connection
2. Create content-sync service
3. Update sync.service.ts with content enrichment calls
4. Set up Kafka consumers for content events
5. Create sync-content script for initial bulk sync
6. Test enriched search results

### Phase 6: Authentication & Testing (Days 19-20)
1. Verify all endpoints have proper auth
2. Integration testing across services
3. Load testing content APIs
4. Documentation updates

---

## Part 8: Complete File Checklist

### Shared Libraries
- [ ] `backend/shared/mongodb/package.json`
- [ ] `backend/shared/mongodb/tsconfig.json`
- [ ] `backend/shared/mongodb/src/index.ts`
- [ ] `backend/shared/mongodb/src/connection.ts`
- [ ] `backend/shared/mongodb/src/operations.ts`
- [ ] `backend/shared/mongodb/src/schema-validator.ts`
- [ ] `backend/shared/mongodb/src/indexes.ts`
- [ ] `backend/shared/mongodb/src/types.ts`
- [ ] `backend/shared/content-reviews/package.json`
- [ ] `backend/shared/content-reviews/tsconfig.json`
- [ ] `backend/shared/content-reviews/src/index.ts`
- [ ] `backend/shared/content-reviews/src/models/user-content.model.ts`
- [ ] `backend/shared/content-reviews/src/services/review.service.ts`
- [ ] `backend/shared/content-reviews/src/services/rating.service.ts`
- [ ] `backend/shared/content-reviews/src/services/moderation.service.ts`
- [ ] `backend/shared/content-reviews/src/types/index.ts`

### venue-service
- [ ] Create: `src/config/mongodb.ts`
- [ ] Create: `src/models/mongodb/venue-content.model.ts`
- [ ] Create: `src/services/venue-content.service.ts`
- [ ] Create: `src/controllers/venue-content.controller.ts`
- [ ] Create: `src/controllers/venue-reviews.controller.ts`
- [ ] Create: `src/routes/venue-content.routes.ts`
- [ ] Create: `src/routes/venue-reviews.routes.ts`
- [ ] Modify: `src/config/dependencies.ts`
- [ ] Modify: `src/index.ts`
- [ ] Modify: `package.json`

### event-service
- [ ] Create: `src/config/mongodb.ts`
- [ ] Create: `src/models/mongodb/event-content.model.ts`
- [ ] Create: `src/services/event-content.service.ts`
- [ ] Create: `src/controllers/event-content.controller.ts`
- [ ] Create: `src/controllers/event-reviews.controller.ts`
- [ ] Create: `src/routes/event-content.routes.ts`
- [ ] Create: `src/routes/event-reviews.routes.ts`
- [ ] Modify: `src/config/dependencies.ts`
- [ ] Modify: `src/index.ts`
- [ ] Modify: `package.json`

### notification-service
- [ ] Create: `src/config/mongodb.ts`
- [ ] Create: `src/models/mongodb/marketing-content.model.ts`
- [ ] Create: `src/services/marketing.service.ts`
- [ ] Create: `src/controllers/marketing.controller.ts`
- [ ] Create: `src/routes/marketing.routes.ts`
- [ ] Modify: `src/config/dependencies.ts`
- [ ] Modify: `src/index.ts`
- [ ] Modify: `package.json`

### search-service
- [ ] Create: `src/config/mongodb.ts`
- [ ] Create: `src/services/content-sync.service.ts`
- [ ] Create: `src/scripts/sync-content.ts`
- [ ] Modify: `src/services/sync.service.ts` (add content enrichment calls)
- [ ] Modify: `package.json`

---

## Summary

| Category | Files to Create | Files to Modify |
|----------|----------------|-----------------|
| Shared Libraries | 16 | 0 |
| venue-service | 7 | 3 |
| event-service | 7 | 3 |
| notification-service | 5 | 3 |
| search-service | 3 | 2 |
| **TOTAL** | **38** | **11** |

**Total files to touch: 49**
**Estimated time: 15-20 days**

---

## Dependencies

**Requires:**
- Redis Implementation Plan (Phase 0 workspace setup, caching for reviews)

**Enables:**
- Elasticsearch Implementation Plan (content enrichment for search)

**Recommended order:**
1. Redis Implementation Plan (12-15 days)
2. MongoDB Implementation Plan (15-20 days)
3. Elasticsearch Implementation Plan (13-16 days)
