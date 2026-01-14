# NOTIFICATION TEMPLATES FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Notification Templates |

---

## Executive Summary

**WORKING - Full template management with Handlebars**

| Component | Status |
|-----------|--------|
| Create template | ✅ Working |
| List templates | ✅ Working |
| Get template by ID | ✅ Working |
| Update template | ✅ Working |
| Delete template | ✅ Working |
| Preview template | ✅ Working |
| Version history | ✅ Working |
| Usage stats | ✅ Working |
| Template rendering (Handlebars) | ✅ Working |
| Template caching (Redis) | ✅ Working |
| Custom helpers | ✅ Working |

**Bottom Line:** Full template management system using Handlebars for rendering. Supports versioning, preview with sample data, usage statistics, and caching in Redis.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/templates` | POST | Create template | ✅ Working |
| `/templates` | GET | List templates | ✅ Working |
| `/templates/:id` | GET | Get template | ✅ Working |
| `/templates/:id` | PUT | Update template | ✅ Working |
| `/templates/:id` | DELETE | Delete template | ✅ Working |
| `/templates/:id/preview` | POST | Preview with data | ✅ Working |
| `/templates/:id/versions` | GET | Version history | ✅ Working |
| `/templates/:id/stats` | GET | Usage stats | ✅ Working |

---

## Template Features

### Handlebars Helpers
```typescript
// Date formatting
Handlebars.registerHelper('formatDate', (date: Date) => {
  return new Date(date).toLocaleDateString();
});

// Time formatting
Handlebars.registerHelper('formatTime', (date: Date) => {
  return new Date(date).toLocaleTimeString();
});

// Currency formatting
Handlebars.registerHelper('formatCurrency', (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount / 100);
});

// Comparison helpers
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('ne', (a, b) => a !== b);
Handlebars.registerHelper('gt', (a, b) => a > b);
Handlebars.registerHelper('gte', (a, b) => a >= b);
Handlebars.registerHelper('lt', (a, b) => a < b);
Handlebars.registerHelper('lte', (a, b) => a <= b);
```

### Template Rendering
```typescript
async renderTemplate(template: NotificationTemplate, data: Record<string, any>) {
  const content = this.compiledTemplates.get(contentKey)!(data);
  const htmlContent = this.compiledTemplates.get(htmlKey)!(data);
  const subject = this.compiledTemplates.get(subjectKey)!(data);

  return { subject, content, htmlContent };
}
```

### Template Caching
```typescript
async getTemplate(name: string, channel: NotificationChannel, venueId?: string) {
  const cacheKey = `template:${venueId || 'default'}:${channel}:${name}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Query DB, cache result
  await redis.setex(cacheKey, env.TEMPLATE_CACHE_TTL, JSON.stringify(template));
  return template;
}
```

---

## Template Model
```typescript
interface NotificationTemplate {
  id: string;
  venueId?: string;           // null = default/system template
  name: string;
  channel: 'email' | 'sms' | 'push' | 'webhook';
  type: 'transactional' | 'marketing' | 'system';
  category?: string;
  language: string;
  subject?: string;           // For email
  content: string;            // Plain text
  htmlContent?: string;       // HTML version
  version: number;
  isActive: boolean;
  status: 'draft' | 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Template Inheritance

1. First check for venue-specific template
2. Fall back to default/system template
```typescript
// Check venue-specific first
template = await db('notification_templates')
  .where('venue_id', venueId)
  .where('name', name)
  .where('channel', channel)
  .first();

// Fall back to default
if (!template) {
  template = await db('notification_templates')
    .whereNull('venue_id')
    .where('name', name)
    .where('channel', channel)
    .first();
}
```

---

## Example Template
```handlebars
Subject: Your tickets for {{eventName}}

Hi {{customerName}},

Thank you for your purchase! Here are your tickets:

{{#each tickets}}
- {{this.ticketType}}: {{formatCurrency this.price}}
{{/each}}

Total: {{formatCurrency totalAmount}}

Event Details:
📅 {{formatDate eventDate}} at {{formatTime eventDate}}
📍 {{venueName}}

{{#if hasParking}}
🚗 Parking included
{{/if}}

See you there!
```

---

## Files Involved

| File | Purpose |
|------|---------|
| `notification-service/src/routes/template.routes.ts` | Routes |
| `notification-service/src/services/template.service.ts` | Implementation |

---

## Related Documents

- `MARKETING_CAMPAIGNS_FLOW_AUDIT.md` - Campaign usage
- `NOTIFICATION_FLOW_AUDIT.md` - Sending notifications
