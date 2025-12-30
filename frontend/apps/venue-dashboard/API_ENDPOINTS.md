# API Endpoints Reference

This document lists all API endpoints needed to connect the frontend to a backend.

## Authentication
```
POST   /api/auth/login                     - Login
POST   /api/auth/register                  - Register  
POST   /api/auth/logout                    - Logout
GET    /api/auth/me                        - Get current user
POST   /api/auth/password/change           - Change password
POST   /api/auth/2fa/enable                - Enable 2FA
POST   /api/auth/2fa/verify                - Verify 2FA code
POST   /api/auth/2fa/disable               - Disable 2FA
```

## User Account
```
GET    /api/user/profile                   - Get user profile
PUT    /api/user/profile                   - Update user profile
GET    /api/user/notifications             - Get notification preferences
PUT    /api/user/notifications             - Update notification preferences
```

## Venues (Multi-Venue)
```
GET    /api/venues                         - List user's venues
POST   /api/venues                         - Create venue
GET    /api/venues/:venueId                - Get venue details
PUT    /api/venues/:venueId                - Update venue
DELETE /api/venues/:venueId                - Delete venue
GET    /api/venues/analytics               - Cross-venue analytics
GET    /api/venues/compare                 - Compare venues
```

## Events
```
GET    /api/venues/:venueId/events                    - List events
POST   /api/venues/:venueId/events                    - Create event
GET    /api/venues/:venueId/events/:eventId           - Get event details
PUT    /api/venues/:venueId/events/:eventId           - Update event
DELETE /api/venues/:venueId/events/:eventId           - Delete event
GET    /api/venues/:venueId/events/:eventId/summary   - Event summary stats
GET    /api/venues/:venueId/events/:eventId/sales     - Event sales data
GET    /api/venues/:venueId/events/:eventId/guests    - Guest list
GET    /api/venues/:venueId/events/:eventId/reviews   - Event reviews
GET    /api/venues/:venueId/events/:eventId/faq       - Event FAQ
PUT    /api/venues/:venueId/events/:eventId/faq       - Update FAQ
GET    /api/venues/:venueId/events/:eventId/automation - Automation rules
PUT    /api/venues/:venueId/events/:eventId/automation - Update automation
GET    /api/venues/:venueId/events/calendar           - Calendar view data
```

## Tickets
```
GET    /api/venues/:venueId/ticket-types              - List ticket types
POST   /api/venues/:venueId/ticket-types              - Create ticket type
GET    /api/venues/:venueId/ticket-types/:id          - Get ticket type
PUT    /api/venues/:venueId/ticket-types/:id          - Update ticket type
DELETE /api/venues/:venueId/ticket-types/:id          - Delete ticket type

GET    /api/venues/:venueId/bundles                   - List bundles
POST   /api/venues/:venueId/bundles                   - Create bundle
PUT    /api/venues/:venueId/bundles/:id               - Update bundle
DELETE /api/venues/:venueId/bundles/:id               - Delete bundle

GET    /api/venues/:venueId/addons                    - List add-ons
POST   /api/venues/:venueId/addons                    - Create add-on
PUT    /api/venues/:venueId/addons/:id                - Update add-on
DELETE /api/venues/:venueId/addons/:id                - Delete add-on

GET    /api/venues/:venueId/promo-codes               - List promo codes
POST   /api/venues/:venueId/promo-codes               - Create promo code
POST   /api/venues/:venueId/promo-codes/bulk          - Bulk create promo codes
GET    /api/venues/:venueId/promo-codes/:id           - Get promo code
PUT    /api/venues/:venueId/promo-codes/:id           - Update promo code
DELETE /api/venues/:venueId/promo-codes/:id           - Delete promo code
GET    /api/venues/:venueId/promo-codes/analytics     - Promo analytics
```

## Scanning
```
POST   /api/venues/:venueId/scan                      - Scan a ticket
GET    /api/venues/:venueId/scan/history              - Scan history
GET    /api/venues/:venueId/scan/live/:eventId        - Live attendance for event
GET    /api/venues/:venueId/zones                     - Zone occupancy
GET    /api/venues/:venueId/zones/alerts              - Capacity alerts
GET    /api/venues/:venueId/banned                    - Banned list
POST   /api/venues/:venueId/banned                    - Add to banned list
DELETE /api/venues/:venueId/banned/:id                - Remove from banned list
GET    /api/venues/:venueId/scanner/settings          - Scanner settings
PUT    /api/venues/:venueId/scanner/settings          - Update scanner settings
```

## Analytics
```
GET    /api/venues/:venueId/analytics/dashboard       - Dashboard overview
GET    /api/venues/:venueId/analytics/sales           - Sales analytics
GET    /api/venues/:venueId/analytics/revenue         - Revenue analytics
GET    /api/venues/:venueId/analytics/attendance      - Attendance analytics
GET    /api/venues/:venueId/analytics/demographics    - Demographics data
GET    /api/venues/:venueId/analytics/geographic      - Geographic data
GET    /api/venues/:venueId/analytics/compare         - Event comparison

GET    /api/venues/:venueId/reports                   - List saved reports
POST   /api/venues/:venueId/reports                   - Create/save report
GET    /api/venues/:venueId/reports/:id               - Get report
DELETE /api/venues/:venueId/reports/:id               - Delete report
POST   /api/venues/:venueId/reports/generate          - Generate custom report
```

## Financials
```
GET    /api/venues/:venueId/financials/overview       - Financial overview
GET    /api/venues/:venueId/financials/revenue        - Revenue dashboard
GET    /api/venues/:venueId/transactions              - List transactions
GET    /api/venues/:venueId/transactions/:id          - Transaction detail
GET    /api/venues/:venueId/payouts                   - List payouts
GET    /api/venues/:venueId/payouts/:id               - Payout detail
GET    /api/venues/:venueId/payouts/settings          - Payout settings
PUT    /api/venues/:venueId/payouts/settings          - Update payout settings
GET    /api/venues/:venueId/refunds                   - List refunds
POST   /api/venues/:venueId/refunds                   - Process refund
GET    /api/venues/:venueId/chargebacks               - List chargebacks
GET    /api/venues/:venueId/chargebacks/:id           - Chargeback detail
POST   /api/venues/:venueId/chargebacks/:id/respond   - Respond to chargeback
GET    /api/venues/:venueId/tax-documents             - Tax documents
```

## Marketing
```
GET    /api/venues/:venueId/marketing/dashboard       - Marketing overview
GET    /api/venues/:venueId/announcements             - List announcements
POST   /api/venues/:venueId/announcements             - Create announcement
PUT    /api/venues/:venueId/announcements/:id         - Update announcement
DELETE /api/venues/:venueId/announcements/:id         - Delete announcement
POST   /api/venues/:venueId/messages/send             - Send message to ticket holders
GET    /api/venues/:venueId/messages/scheduled        - Scheduled messages
GET    /api/venues/:venueId/messages/history          - Message history
GET    /api/venues/:venueId/messages/templates        - Message templates
POST   /api/venues/:venueId/messages/templates        - Create template
PUT    /api/venues/:venueId/messages/templates/:id    - Update template
DELETE /api/venues/:venueId/messages/templates/:id    - Delete template
```

## Resale
```
GET    /api/venues/:venueId/resale/settings           - Resale settings
PUT    /api/venues/:venueId/resale/settings           - Update resale settings
GET    /api/venues/:venueId/resale/price-rules        - Price rules
PUT    /api/venues/:venueId/resale/price-rules        - Update price rules
GET    /api/venues/:venueId/resale/royalties          - Royalty settings
PUT    /api/venues/:venueId/resale/royalties          - Update royalties
GET    /api/venues/:venueId/resale/marketplace        - Marketplace listings
GET    /api/venues/:venueId/resale/analytics          - Resale analytics
GET    /api/venues/:venueId/resale/policies           - Resale policies
PUT    /api/venues/:venueId/resale/policies           - Update policies
```

## Team
```
GET    /api/venues/:venueId/team                      - List team members
POST   /api/venues/:venueId/team/invite               - Invite member
GET    /api/venues/:venueId/team/:id                  - Get member details
PUT    /api/venues/:venueId/team/:id                  - Update member
DELETE /api/venues/:venueId/team/:id                  - Remove member
PUT    /api/venues/:venueId/team/:id/permissions      - Update permissions
GET    /api/venues/:venueId/team/roles                - List roles
POST   /api/venues/:venueId/team/roles                - Create role
PUT    /api/venues/:venueId/team/roles/:id            - Update role
GET    /api/venues/:venueId/team/assignments          - Staff assignments
PUT    /api/venues/:venueId/team/assignments          - Update assignments
GET    /api/venues/:venueId/team/checkpoints          - Security checkpoints
GET    /api/venues/:venueId/team/checkin              - Staff check-in status
POST   /api/venues/:venueId/team/checkin              - Check in staff
GET    /api/venues/:venueId/team/announcements        - Team announcements
POST   /api/venues/:venueId/team/announcements        - Create announcement
GET    /api/venues/:venueId/team/onduty               - Staff on duty
GET    /api/venues/:venueId/team/audit                - Audit log
POST   /api/venues/:venueId/ownership/transfer        - Transfer ownership
```

## Settings - Venue Profile
```
GET    /api/venues/:venueId/settings                  - All settings
GET    /api/venues/:venueId/settings/profile          - Venue profile
PUT    /api/venues/:venueId/settings/profile          - Update profile
GET    /api/venues/:venueId/settings/media            - Media/images
POST   /api/venues/:venueId/settings/media            - Upload media
DELETE /api/venues/:venueId/settings/media/:id        - Delete media
GET    /api/venues/:venueId/settings/social           - Social links
PUT    /api/venues/:venueId/settings/social           - Update social links
GET    /api/venues/:venueId/settings/hours            - Operating hours
PUT    /api/venues/:venueId/settings/hours            - Update hours
```

## Settings - Location & Access
```
GET    /api/venues/:venueId/settings/location         - Location details
PUT    /api/venues/:venueId/settings/location         - Update location
GET    /api/venues/:venueId/settings/parking          - Parking info
PUT    /api/venues/:venueId/settings/parking          - Update parking
GET    /api/venues/:venueId/settings/transit          - Transit info
PUT    /api/venues/:venueId/settings/transit          - Update transit
GET    /api/venues/:venueId/settings/loadin           - Load-in info
PUT    /api/venues/:venueId/settings/loadin           - Update load-in
GET    /api/venues/:venueId/settings/entry-points     - Entry points
PUT    /api/venues/:venueId/settings/entry-points     - Update entry points
GET    /api/venues/:venueId/settings/exit-points      - Exit points
PUT    /api/venues/:venueId/settings/exit-points      - Update exit points
GET    /api/venues/:venueId/settings/reentry          - Re-entry policy
PUT    /api/venues/:venueId/settings/reentry          - Update re-entry
```

## Settings - Capacity & Seating
```
GET    /api/venues/:venueId/settings/capacity         - Capacity settings
PUT    /api/venues/:venueId/settings/capacity         - Update capacity
GET    /api/venues/:venueId/settings/seating/configs  - Seating configs
POST   /api/venues/:venueId/settings/seating/configs  - Create config
PUT    /api/venues/:venueId/settings/seating/configs/:id - Update config
GET    /api/venues/:venueId/settings/seating/sections - Sections
PUT    /api/venues/:venueId/settings/seating/sections - Update sections
GET    /api/venues/:venueId/settings/seating/accessibility - Accessibility
PUT    /api/venues/:venueId/settings/seating/accessibility - Update accessibility
```

## Settings - VIP
```
GET    /api/venues/:venueId/settings/vip/areas        - VIP areas
PUT    /api/venues/:venueId/settings/vip/areas        - Update VIP areas
GET    /api/venues/:venueId/settings/vip/access       - VIP access rules
PUT    /api/venues/:venueId/settings/vip/access       - Update access rules
GET    /api/venues/:venueId/settings/vip/amenities    - VIP amenities
PUT    /api/venues/:venueId/settings/vip/amenities    - Update amenities
GET    /api/venues/:venueId/settings/vip/guestlists   - Guest lists
POST   /api/venues/:venueId/settings/vip/guestlists   - Create guest list
GET    /api/venues/:venueId/settings/vip/willcall     - Will call
POST   /api/venues/:venueId/settings/vip/willcall     - Add to will call
GET    /api/venues/:venueId/settings/vip/id-verify    - ID verification settings
PUT    /api/venues/:venueId/settings/vip/id-verify    - Update ID verification
```

## Settings - Legal & Compliance
```
GET    /api/venues/:venueId/settings/legal/tax        - Tax info
PUT    /api/venues/:venueId/settings/legal/tax        - Update tax info
GET    /api/venues/:venueId/settings/legal/insurance  - Insurance docs
POST   /api/venues/:venueId/settings/legal/insurance  - Upload insurance
GET    /api/venues/:venueId/settings/legal/liquor     - Liquor license
POST   /api/venues/:venueId/settings/legal/liquor     - Upload license
GET    /api/venues/:venueId/settings/legal/payouts    - Payout legal info
PUT    /api/venues/:venueId/settings/legal/payouts    - Update payout info
GET    /api/venues/:venueId/settings/legal/verification - Verification status
POST   /api/venues/:venueId/settings/legal/verification - Submit verification
```

## Settings - Branding
```
GET    /api/venues/:venueId/settings/branding/logo    - Logo settings
POST   /api/venues/:venueId/settings/branding/logo    - Upload logo
GET    /api/venues/:venueId/settings/branding/tickets - Ticket branding
PUT    /api/venues/:venueId/settings/branding/tickets - Update ticket branding
GET    /api/venues/:venueId/settings/branding/email   - Email branding
PUT    /api/venues/:venueId/settings/branding/email   - Update email branding
GET    /api/venues/:venueId/settings/branding/domain  - Custom domain
PUT    /api/venues/:venueId/settings/branding/domain  - Update domain
```

## Settings - Communication
```
GET    /api/venues/:venueId/settings/email-templates  - Email templates
POST   /api/venues/:venueId/settings/email-templates  - Create template
PUT    /api/venues/:venueId/settings/email-templates/:id - Update template
GET    /api/venues/:venueId/settings/sms-templates    - SMS templates
POST   /api/venues/:venueId/settings/sms-templates    - Create template
PUT    /api/venues/:venueId/settings/sms-templates/:id - Update template
GET    /api/venues/:venueId/settings/notifications    - Notification settings
PUT    /api/venues/:venueId/settings/notifications    - Update notifications
```

## Settings - Policies
```
GET    /api/venues/:venueId/settings/policies/refund  - Refund policy
PUT    /api/venues/:venueId/settings/policies/refund  - Update refund policy
GET    /api/venues/:venueId/settings/policies/age     - Age restrictions
PUT    /api/venues/:venueId/settings/policies/age     - Update age policy
GET    /api/venues/:venueId/settings/policies/bags    - Bag policy
PUT    /api/venues/:venueId/settings/policies/bags    - Update bag policy
GET    /api/venues/:venueId/settings/policies/custom  - Custom policies
POST   /api/venues/:venueId/settings/policies/custom  - Create custom policy
PUT    /api/venues/:venueId/settings/policies/custom/:id - Update policy
DELETE /api/venues/:venueId/settings/policies/custom/:id - Delete policy
```

## Settings - Safety
```
GET    /api/venues/:venueId/settings/safety/emergency - Emergency contacts
PUT    /api/venues/:venueId/settings/safety/emergency - Update contacts
GET    /api/venues/:venueId/settings/safety/evacuation - Evacuation plan
PUT    /api/venues/:venueId/settings/safety/evacuation - Update plan
GET    /api/venues/:venueId/settings/safety/protocols - Safety protocols
PUT    /api/venues/:venueId/settings/safety/protocols - Update protocols
GET    /api/venues/:venueId/settings/safety/medical   - Medical info
PUT    /api/venues/:venueId/settings/safety/medical   - Update medical
```

## Operations
```
GET    /api/venues/:venueId/operations/dashboard      - Operations overview
GET    /api/venues/:venueId/incidents                 - List incidents
POST   /api/venues/:venueId/incidents                 - Log incident
GET    /api/venues/:venueId/incidents/:id             - Incident detail
PUT    /api/venues/:venueId/incidents/:id             - Update incident
GET    /api/venues/:venueId/equipment                 - List equipment
POST   /api/venues/:venueId/equipment                 - Add equipment
PUT    /api/venues/:venueId/equipment/:id             - Update equipment
DELETE /api/venues/:venueId/equipment/:id             - Delete equipment
POST   /api/venues/:venueId/equipment/check           - Equipment check
```

## Support (Platform-level, not venue-scoped)
```
GET    /api/support/articles                          - Help articles
GET    /api/support/articles/:id                      - Article detail
GET    /api/support/articles/search?q=               - Search articles
GET    /api/support/tutorials                         - Tutorial videos
GET    /api/support/announcements                     - Platform announcements
GET    /api/support/status                            - Platform status
POST   /api/support/tickets                           - Create support ticket
GET    /api/support/tickets                           - List user's tickets
GET    /api/support/tickets/:id                       - Ticket detail
POST   /api/support/tickets/:id/reply                 - Reply to ticket
POST   /api/support/bug-report                        - Submit bug report
POST   /api/support/feature-request                   - Submit feature request
GET    /api/support/features                          - List feature requests
POST   /api/support/features/:id/vote                 - Vote on feature
GET    /api/support/training                          - Training sessions
POST   /api/support/training/:id/enroll               - Enroll in session
GET    /api/support/account-manager                   - Account manager info
POST   /api/support/account-manager/request           - Request account manager
```

---

## Data Models (Key entities)

### Venue
```typescript
interface Venue {
  id: string;
  name: string;
  description: string;
  location: {
    address: string;
    city: string;
    state: string;
    zip: string;
    coordinates: { lat: number; lng: number };
  };
  capacity: number;
  type: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}
```

### Event
```typescript
interface Event {
  id: string;
  venueId: string;
  name: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  ticketsSold: number;
  capacity: number;
  revenue: number;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}
```

### TicketType
```typescript
interface TicketType {
  id: string;
  venueId: string;
  eventId?: string;
  name: string;
  description: string;
  price: number;
  quantity: number;
  sold: number;
  status: 'active' | 'inactive';
  saleStart: string;
  saleEnd: string;
}
```

### Transaction
```typescript
interface Transaction {
  id: string;
  venueId: string;
  eventId: string;
  type: 'sale' | 'refund' | 'chargeback';
  amount: number;
  status: 'completed' | 'pending' | 'failed';
  customerEmail: string;
  customerName: string;
  ticketCount: number;
  createdAt: string;
}
```

### TeamMember
```typescript
interface TeamMember {
  id: string;
  venueId: string;
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'manager' | 'staff' | 'scanner';
  permissions: string[];
  status: 'active' | 'invited' | 'inactive';
  createdAt: string;
}
```

---

## Notes for Backend Implementation

1. **Authentication**: Use JWT tokens with refresh token rotation
2. **Authorization**: Check venue membership on every venue-scoped request
3. **Pagination**: Use cursor-based pagination for lists (limit, cursor params)
4. **Filtering**: Support query params for filtering (status, date range, etc.)
5. **Real-time**: Consider WebSockets for live scanning, attendance, notifications
6. **File uploads**: Use presigned URLs for S3/cloud storage uploads
7. **Webhooks**: Stripe webhooks for payment events
