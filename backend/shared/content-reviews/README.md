# @shared/content-reviews

Shared library for user-generated content management including reviews, ratings, photos, and tips. Used by both `venue-service` and `event-service`.

## Features

- **Reviews** - User written reviews with pros/cons, recommendations, verified attendee badges
- **Ratings** - Star ratings (1-5) with category-specific breakdowns
- **Photos & Media** - User-uploaded photos with location tagging
- **Tips** - Quick tips about parking, food, seating, etc.
- **Moderation** - Automated and manual content moderation with flagging
- **Redis Caching** - Built-in caching for reviews and rating summaries
- **Engagement Tracking** - Helpful/not helpful votes, reports, shares

## Installation

```bash
npm install @shared/content-reviews
```

## Usage

### Review Service

```typescript
import { ReviewService } from '@shared/content-reviews';

const reviewService = new ReviewService(redisClient);

// Create a review
const review = await reviewService.createReview(
  userId,
  'venue', // or 'event', 'performer', 'ticket'
  targetId,
  {
    title: 'Amazing venue!',
    body: 'Had a great experience...',
    pros: ['Great sound', 'Comfortable seating'],
    cons: ['Expensive parking'],
    attendedDate: new Date(),
    verifiedAttendee: true,
  }
);

// Get reviews for a target
const reviews = await reviewService.getReviewsForTarget('venue', venueId, {
  page: 1,
  limit: 20,
  sortBy: 'helpful',
  sortOrder: 'desc',
});

// Mark review as helpful
await reviewService.markHelpful(reviewId, userId);

// Report a review
await reviewService.reportReview(reviewId, userId, 'spam');
```

### Rating Service

```typescript
import { RatingService } from '@shared/content-reviews';

const ratingService = new RatingService(redisClient);

// Submit a rating
const rating = await ratingService.submitRating(
  userId,
  'venue',
  venueId,
  {
    overall: 4.5,
    categories: {
      atmosphere: 5,
      sound: 4,
      sightlines: 4,
      service: 5,
      cleanliness: 4,
      parking: 3,
    },
  }
);

// Get rating summary (cached)
const summary = await ratingService.getRatingSummary('venue', venueId);
// {
//   averageRating: 4.3,
//   totalRatings: 152,
//   ratingDistribution: { 5: 80, 4: 50, 3: 15, 2: 5, 1: 2 },
//   categoryAverages: { atmosphere: 4.5, sound: 4.2, ... },
//   lastUpdated: Date
// }

// Get user's rating
const userRating = await ratingService.getUserRating(userId, 'venue', venueId);
```

### Moderation Service

```typescript
import { ModerationService } from '@shared/content-reviews';

const moderationService = new ModerationService();

// Get pending moderation queue
const pending = await moderationService.getPendingQueue({ page: 1, limit: 20 });

// Get flagged content
const flagged = await moderationService.getFlaggedQueue({ page: 1, limit: 20 });

// Approve content
await moderationService.approveContent(contentId, moderatorId);

// Reject content
await moderationService.rejectContent(contentId, moderatorId, 'Spam content');

// Bulk moderate
const result = await moderationService.bulkModerate(
  [contentId1, contentId2, contentId3],
  'approve',
  moderatorId
);

// Get moderation stats
const stats = await moderationService.getContentStats();
// {
//   pending: 15,
//   approved: 1250,
//   rejected: 45,
//   flagged: 8,
//   removed: 12,
//   averageAutoScore: 82.5,
//   requiresManualReview: 10
// }
```

### Direct Model Usage

```typescript
import { UserContentModel } from '@shared/content-reviews';

// Find reviews for a venue
const reviews = await UserContentModel.find({
  targetType: 'venue',
  targetId: venueId,
  contentType: 'REVIEW',
  status: 'approved',
})
  .sort({ createdAt: -1 })
  .limit(20);

// Get rating statistics
const stats = await UserContentModel.getRatingStats('venue', venueId);

// Ensure indexes
import { ensureIndexes } from '@shared/content-reviews';
await ensureIndexes();
```

## Content Types

- `REVIEW` - Text review with pros/cons
- `RATING` - Numeric rating (1-5 stars)
- `PHOTO` - User-uploaded photo
- `VIDEO` - User-uploaded video
- `COMMENT` - Comment on another piece of content
- `CHECK_IN` - User check-in at venue/event
- `TIP` - Quick tip or advice

## Content Status

- `pending` - Awaiting moderation
- `approved` - Approved and visible
- `rejected` - Rejected by moderator
- `flagged` - Flagged for manual review
- `removed` - Removed by moderator or user

## Auto-Moderation

Content is automatically scored (0-100) on creation:

- **80-100**: Auto-approved
- **50-79**: Requires manual review
- **0-49**: Auto-rejected

Scoring factors:
- Spam keywords detection
- Excessive capitalization
- Content length validation
- URL detection

## Redis Caching

The library integrates with Redis for high-performance caching:

- **Reviews**: Cached by target, page, sort order (1 hour TTL)
- **Rating Summaries**: Cached by target (1 hour TTL)
- **Helpful Votes**: Tracked per user to prevent duplicate votes (1 year TTL)

Cache is automatically invalidated when content is created, updated, or moderated.

## Database Indexes

Optimized indexes for common query patterns:

```typescript
{ targetType: 1, targetId: 1, status: 1, contentType: 1 }
{ targetType: 1, targetId: 1, 'content.rating.overall': -1 }
{ userId: 1, createdAt: -1 }
{ status: 1, createdAt: 1 }
{ 'moderation.autoScore': 1, status: 1 }
{ targetType: 1, targetId: 1, 'engagement.helpfulCount': -1 }
```

## TypeScript Support

Fully typed with comprehensive TypeScript definitions:

```typescript
import type {
  UserContent,
  ReviewData,
  RatingData,
  RatingSummary,
  PaginatedResult,
  ModerationStats,
} from '@shared/content-reviews';
```

## Dependencies

- `mongoose` - MongoDB ODM
- `@shared/mongodb` - Shared MongoDB utilities
- `@tickettoken/shared` - Shared Redis utilities

## License

MIT
