# MARKETING CAMPAIGNS FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | Marketing Campaigns |

---

## Executive Summary

**WORKING - Comprehensive marketing automation system**

| Component | Status |
|-----------|--------|
| Campaign CRUD | ✅ Working |
| Send campaign | ✅ Working |
| Campaign stats | ✅ Working |
| Audience segments | ✅ Working |
| Segment refresh | ✅ Working |
| Automation triggers | ✅ Working |
| Abandoned cart tracking | ✅ Working |
| Abandoned cart recovery | ✅ Working |
| A/B testing | ✅ Working |
| A/B test winner | ✅ Working |

**Bottom Line:** Full marketing automation platform with campaign management, audience segmentation, automation triggers, abandoned cart recovery, and A/B testing. Production-ready implementation.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/campaigns` | POST | Create campaign | ✅ Working |
| `/campaigns/:id/send` | POST | Send campaign | ✅ Working |
| `/campaigns/:id/stats` | GET | Get stats | ✅ Working |
| `/campaigns/segments` | POST | Create segment | ✅ Working |
| `/campaigns/segments/:id/refresh` | POST | Refresh count | ✅ Working |
| `/campaigns/triggers` | POST | Create trigger | ✅ Working |
| `/campaigns/abandoned-carts` | POST | Track cart | ✅ Working |
| `/campaigns/ab-tests` | POST | Create A/B test | ✅ Working |
| `/campaigns/ab-tests/:id/start` | POST | Start test | ✅ Working |
| `/campaigns/ab-tests/:id/determine-winner` | POST | Get winner | ✅ Working |

---

## Campaign Management

### Create Campaign
```typescript
async createCampaign(campaign: {
  venueId: string;
  name: string;
  templateId: string;
  segmentId?: string;
  audienceFilter?: any;
  scheduledFor?: Date;
  type?: 'transactional' | 'marketing' | 'system';
  channel?: 'email' | 'sms' | 'push' | 'webhook';
}) {
  await db('notification_campaigns').insert({
    venue_id: campaign.venueId,
    name: campaign.name,
    template_id: campaign.templateId,
    segment_id: campaign.segmentId,
    status: campaign.scheduledFor ? 'scheduled' : 'draft',
    ...
  });
}
```

### Send Campaign
```typescript
async sendCampaign(campaignId: string) {
  // Update status to 'sending'
  // Get audience from segment or filter
  const audience = await this.getAudience(campaign);
  
  // Send to each recipient
  for (const recipient of audience) {
    await notificationService.send({
      venueId: campaign.venue_id,
      recipientId: recipient.id,
      channel: campaign.channel,
      template: campaign.template_name,
      data: { campaignId, ...recipient }
    });
  }
  
  // Update stats
  await db('notification_campaigns').update({
    status: 'completed',
    stats_total: audience.length,
    stats_sent: sent,
    stats_failed: failed
  });
}
```

### Campaign Stats
```typescript
{
  total: 1000,
  sent: 950,
  delivered: 920,
  failed: 50,
  opened: 450,
  clicked: 120,
  converted: 25,
  unsubscribed: 5,
  openRate: '47.37%',
  clickRate: '12.63%',
  conversionRate: '2.63%'
}
```

---

## Audience Segmentation

### Create Segment
```typescript
async createSegment(segment: {
  venueId: string;
  name: string;
  filterCriteria: any;
  isDynamic?: boolean;
}) {
  const memberCount = await this.calculateSegmentSize(venueId, filterCriteria);
  
  await db('audience_segments').insert({
    venue_id: segment.venueId,
    name: segment.name,
    filter_criteria: JSON.stringify(segment.filterCriteria),
    member_count: memberCount,
    is_dynamic: segment.isDynamic
  });
}
```

### Filter Criteria
```typescript
{
  hasTickets: true,
  hasPurchasedInLast30Days: true,
  totalSpentGreaterThan: 100,
  emailEnabled: true
}
```

---

## Automation Triggers
```typescript
async createAutomationTrigger(trigger: {
  venueId: string;
  name: string;
  triggerType: string;        // 'abandoned_cart', 'post_purchase', etc.
  templateId: string;
  triggerConditions: any;
  delayMinutes?: number;      // Delay before sending
})

// Trigger types:
// - abandoned_cart
// - post_purchase
// - ticket_reminder
// - review_request
```

---

## Abandoned Cart Recovery

### Track Cart
```typescript
async trackAbandonedCart(cartData: {
  userId: string;
  venueId: string;
  eventId: string;
  cartItems: any[];
  totalAmountCents: number;
})
```

### Process Recovery
```typescript
async processAbandonedCarts() {
  // Find carts abandoned > 1 hour ago
  const abandonedCarts = await db('abandoned_carts')
    .where('recovery_email_sent', false)
    .where('abandoned_at', '<', new Date(Date.now() - 60 * 60 * 1000));
  
  for (const cart of abandonedCarts) {
    await this.processAutomationTrigger('abandoned_cart', { ... });
    await db('abandoned_carts').update({ recovery_email_sent: true });
  }
}
```

---

## A/B Testing

### Create Test
```typescript
async createABTest(test: {
  venueId: string;
  name: string;
  testType: string;
  variantCount: number;
  sampleSizePerVariant: number;
  winningMetric: string;       // 'open_rate', 'click_rate', 'conversion_rate'
  variants: Array<{
    name: string;
    templateId?: string;
    variantData: any;
  }>;
})
```

### Determine Winner
```typescript
async determineABTestWinner(testId: string) {
  const variants = await db('ab_test_variants')
    .where('ab_test_id', testId)
    .orderBy(test.winning_metric, 'desc');
  
  const winner = variants[0];
  
  await db('ab_tests').update({
    winner_variant_id: winner.id,
    status: 'completed'
  });
  
  return winner;
}
```

---

## Database Tables

- `notification_campaigns` - Campaign definitions
- `audience_segments` - Segment definitions
- `email_automation_triggers` - Automation rules
- `abandoned_carts` - Cart tracking
- `ab_tests` - A/B test definitions
- `ab_test_variants` - Test variants with stats

---

## Files Involved

| File | Purpose |
|------|---------|
| `notification-service/src/routes/campaign.routes.ts` | Routes |
| `notification-service/src/services/campaign.service.ts` | Full implementation |

---

## Related Documents

- `NOTIFICATION_TEMPLATES_FLOW_AUDIT.md` - Email templates
- `NOTIFICATION_FLOW_AUDIT.md` - Sending notifications
- `CONSENT_MANAGEMENT_FLOW_AUDIT.md` - Marketing consent
