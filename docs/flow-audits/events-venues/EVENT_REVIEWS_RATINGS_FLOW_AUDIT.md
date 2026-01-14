# EVENT REVIEWS & RATINGS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Event Reviews & Ratings |

---

## Executive Summary

**WORKING - Full review and rating system**

| Component | Status |
|-----------|--------|
| Create review | ✅ Working |
| Get reviews (paginated) | ✅ Working |
| Update review | ✅ Working |
| Delete review | ✅ Working |
| Mark helpful | ✅ Working |
| Report review | ✅ Working |
| Submit rating | ✅ Working |
| Rating summary | ✅ Working |
| User's rating | ✅ Working |
| Shared service (@tickettoken/shared) | ✅ Working |

**Bottom Line:** Full review and rating system using shared `ReviewService` and `RatingService` from `@tickettoken/shared`. Supports reviews with pros/cons, helpful votes, reporting, and category-based ratings with summaries.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/events/:eventId/reviews` | POST | Create review | ✅ Working |
| `/events/:eventId/reviews` | GET | List reviews | ✅ Working |
| `/events/:eventId/reviews/:reviewId` | GET | Get review | ✅ Working |
| `/events/:eventId/reviews/:reviewId` | PUT | Update review | ✅ Working |
| `/events/:eventId/reviews/:reviewId` | DELETE | Delete review | ✅ Working |
| `/events/:eventId/reviews/:reviewId/helpful` | POST | Mark helpful | ✅ Working |
| `/events/:eventId/reviews/:reviewId/report` | POST | Report review | ✅ Working |
| `/events/:eventId/ratings` | POST | Submit rating | ✅ Working |
| `/events/:eventId/ratings/summary` | GET | Get summary | ✅ Working |
| `/events/:eventId/ratings/me` | GET | User's rating | ✅ Working |

---

## Implementation Details

### Create Review
```typescript
createReview = async (req, reply) => {
  const { eventId } = req.params;
  const userId = req.user?.id;
  const { title, body, pros, cons, attendedDate, verifiedAttendee } = req.body;

  const review = await this.reviewService.createReview(
    userId,
    'event',
    eventId,
    { title, body, pros, cons, attendedDate, verifiedAttendee }
  );

  return reply.status(201).send({ success: true, data: review });
};
```

### Get Reviews (Paginated)
```typescript
getReviews = async (req, reply) => {
  const { eventId } = req.params;
  const { page = '1', limit = '20', sortBy = 'recent', sortOrder = 'desc' } = req.query;

  const result = await this.reviewService.getReviewsForTarget(
    'event',
    eventId,
    { page, limit, sortBy, sortOrder }
  );

  return reply.send({
    success: true,
    data: result.data,
    pagination: result.pagination
  });
};
```

### Mark Helpful
```typescript
markHelpful = async (req, reply) => {
  const { reviewId } = req.params;
  const userId = req.user?.id;

  await this.reviewService.markHelpful(reviewId, userId);
  return reply.send({ success: true, message: 'Review marked as helpful' });
};
```

### Report Review
```typescript
reportReview = async (req, reply) => {
  const { reviewId } = req.params;
  const userId = req.user?.id;
  const { reason } = req.body;

  await this.reviewService.reportReview(reviewId, userId, reason);
  return reply.send({ success: true, message: 'Review reported successfully' });
};
```

### Submit Rating
```typescript
submitRating = async (req, reply) => {
  const { eventId } = req.params;
  const userId = req.user?.id;
  const { overall, categories } = req.body;

  const rating = await this.ratingService.submitRating(
    userId,
    'event',
    eventId,
    { overall, categories }
  );

  return reply.status(201).send({ success: true, data: rating });
};
```

### Rating Summary
```typescript
getRatingSummary = async (req, reply) => {
  const { eventId } = req.params;
  const summary = await this.ratingService.getRatingSummary('event', eventId);
  return reply.send({ success: true, data: summary });
};
```

---

## Data Models

### Review
```typescript
interface Review {
  id: string;
  userId: string;
  targetType: 'event' | 'venue';
  targetId: string;
  title: string;
  body: string;
  pros?: string[];
  cons?: string[];
  attendedDate?: Date;
  verifiedAttendee?: boolean;
  helpfulCount: number;
  reportCount: number;
  status: 'published' | 'pending' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}
```

### Rating
```typescript
interface Rating {
  id: string;
  userId: string;
  targetType: 'event' | 'venue';
  targetId: string;
  overall: number;           // 1-5
  categories?: {
    [category: string]: number;  // e.g., 'venue': 4, 'value': 5
  };
  createdAt: Date;
}

interface RatingSummary {
  average: number;
  count: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  categoryAverages?: {
    [category: string]: number;
  };
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `event-service/src/routes/event-reviews.routes.ts` | Routes |
| `event-service/src/controllers/event-reviews.controller.ts` | Controller |
| `packages/shared/src/services/review.service.ts` | Shared review service |
| `packages/shared/src/services/rating.service.ts` | Shared rating service |

---

## Related Documents

- `VENUE_REVIEWS_RATINGS_FLOW_AUDIT.md` - Venue reviews (same services)
- `EVENT_CONTENT_MANAGEMENT_FLOW_AUDIT.md` - Event content
