# VENUE REVIEWS & RATINGS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Venue Reviews & Ratings |

---

## Executive Summary

**WORKING - Full review and rating system (same as events)**

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

**Bottom Line:** Same review/rating system as events, using shared `ReviewService` and `RatingService` from `@tickettoken/shared` with `targetType: 'venue'`.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/:venueId/reviews` | POST | Create review | ✅ Working |
| `/:venueId/reviews` | GET | List reviews | ✅ Working |
| `/:venueId/reviews/:reviewId` | GET | Get review | ✅ Working |
| `/:venueId/reviews/:reviewId` | PUT | Update review | ✅ Working |
| `/:venueId/reviews/:reviewId` | DELETE | Delete review | ✅ Working |
| `/:venueId/reviews/:reviewId/helpful` | POST | Mark helpful | ✅ Working |
| `/:venueId/reviews/:reviewId/report` | POST | Report review | ✅ Working |
| `/:venueId/ratings` | POST | Submit rating | ✅ Working |
| `/:venueId/ratings/summary` | GET | Get summary | ✅ Working |
| `/:venueId/ratings/me` | GET | User's rating | ✅ Working |

---

## Implementation

Uses same shared services as event reviews:
```typescript
export class VenueReviewsController {
  constructor(redis: Redis) {
    this.reviewService = new ReviewService(redis);
    this.ratingService = new RatingService(redis);
  }

  createReview = async (req, reply) => {
    const review = await this.reviewService.createReview(
      userId,
      'venue',        // targetType = 'venue'
      venueId,
      { title, body, pros, cons }
    );
  };
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `venue-service/src/routes/venue-reviews.routes.ts` | Routes |
| `venue-service/src/controllers/venue-reviews.controller.ts` | Controller |
| `packages/shared/src/services/review.service.ts` | Shared service |
| `packages/shared/src/services/rating.service.ts` | Shared service |

---

## Related Documents

- `EVENT_REVIEWS_RATINGS_FLOW_AUDIT.md` - Event reviews (same system)
