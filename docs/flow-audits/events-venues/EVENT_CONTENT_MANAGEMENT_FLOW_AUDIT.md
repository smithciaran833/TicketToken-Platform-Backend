# EVENT CONTENT MANAGEMENT FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Event Content Management |

---

## Executive Summary

**WORKING - Full content management system**

| Component | Status |
|-----------|--------|
| Create content | ✅ Working |
| Get event content | ✅ Working |
| Update content | ✅ Working |
| Delete content | ✅ Working |
| Publish content | ✅ Working |
| Archive content | ✅ Working |
| Get gallery | ✅ Working |
| Get lineup | ✅ Working |
| Get schedule | ✅ Working |
| Get performers | ✅ Working |

**Bottom Line:** Full content management for events including gallery images, lineup, schedule, and performer information. Supports content lifecycle (draft → published → archived).

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/events/:eventId/content` | POST | Create content | ✅ Working |
| `/events/:eventId/content` | GET | List content | ✅ Working |
| `/events/:eventId/content/:contentId` | GET | Get content | ✅ Working |
| `/events/:eventId/content/:contentId` | PUT | Update content | ✅ Working |
| `/events/:eventId/content/:contentId` | DELETE | Delete content | ✅ Working |
| `/events/:eventId/content/:contentId/publish` | POST | Publish | ✅ Working |
| `/events/:eventId/content/:contentId/archive` | POST | Archive | ✅ Working |
| `/events/:eventId/gallery` | GET | Get gallery | ✅ Working |
| `/events/:eventId/lineup` | GET | Get lineup | ✅ Working |
| `/events/:eventId/schedule` | GET | Get schedule | ✅ Working |
| `/events/:eventId/performers` | GET | Get performers | ✅ Working |

---

## Content Types

| Type | Description |
|------|-------------|
| `gallery` | Event images/photos |
| `lineup` | Artist/performer lineup |
| `schedule` | Event schedule/timetable |
| `performers` | Performer profiles |
| `description` | Event description |
| `faq` | Frequently asked questions |

---

## Implementation Details

### Create Content
```typescript
createContent = async (req, reply) => {
  const { eventId } = req.params;
  const { contentType, content, displayOrder, featured } = req.body;
  const userId = req.user?.id || 'system';

  const result = await this.contentService.createContent({
    eventId,
    contentType,
    content,
    createdBy: userId,
    displayOrder,
    featured,
  });

  return reply.status(201).send({ success: true, data: result });
};
```

### Publish Content
```typescript
publishContent = async (req, reply) => {
  const { contentId } = req.params;
  const userId = req.user?.id || 'system';

  const result = await this.contentService.publishContent(contentId, userId);
  return reply.send({ success: true, data: result });
};
```

### Get Gallery
```typescript
getGallery = async (req, reply) => {
  const { eventId } = req.params;
  const gallery = await this.contentService.getGallery(eventId);
  return reply.send({ success: true, data: gallery });
};
```

### Get Lineup
```typescript
getLineup = async (req, reply) => {
  const { eventId } = req.params;
  const lineup = await this.contentService.getLineup(eventId);
  return reply.send({ success: true, data: lineup });
};
```

---

## Content Lifecycle
```
Draft → Published → Archived
  │         │          │
  │         ▼          │
  │    [Visible]       │
  │                    │
  └────────────────────┘
       (can restore)
```

---

## Data Model
```typescript
interface EventContent {
  id: string;
  eventId: string;
  contentType: 'gallery' | 'lineup' | 'schedule' | 'performers' | 'description' | 'faq';
  content: any;           // JSON content based on type
  displayOrder: number;
  featured: boolean;
  primaryImage?: string;
  status: 'draft' | 'published' | 'archived';
  createdBy: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `event-service/src/routes/event-content.routes.ts` | Routes |
| `event-service/src/controllers/event-content.controller.ts` | Controller |
| `event-service/src/services/event-content.service.ts` | Service |

---

## Related Documents

- `EVENT_CRUD_FLOW_AUDIT.md` - Event management
- `VENUE_CONTENT_FLOW_AUDIT.md` - Venue content
- `FILE_UPLOAD_MEDIA_FLOW_AUDIT.md` - Media uploads
