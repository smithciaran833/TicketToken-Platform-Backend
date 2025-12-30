# API Integration TODO Summary

This document summarizes where mock data exists and what API calls need to replace them.

## How to Convert Mock Data to API Calls

### Current Pattern (Mock):
```typescript
const events = [
  { id: 1, name: "Summer Festival", ... },
  { id: 2, name: "Jazz Night", ... },
];

export default function EventsList() {
  return (
    <div>
      {events.map(event => <EventCard key={event.id} event={event} />)}
    </div>
  );
}
```

### Target Pattern (API):
```typescript
import { useEffect, useState } from 'react';
import { useVenue } from '@/context/VenueContext';
import api from '@/lib/api';

export default function EventsList() {
  const { currentVenueId } = useVenue();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/venues/${currentVenueId}/events`)
      .then(data => setEvents(data))
      .catch(err => setError(err))
      .finally(() => setLoading(false));
  }, [currentVenueId]);

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return (
    <div>
      {events.map(event => <EventCard key={event.id} event={event} />)}
    </div>
  );
}
```

---

## Files by Section

### Dashboard (1 file)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Dashboard.tsx | stats, recentSales, upcomingEvents | GET /venues/:id/analytics/dashboard |

### Events (19 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Events.tsx | events | GET /venues/:id/events |
| EventCalendar.tsx | events | GET /venues/:id/events/calendar |
| EventDetail.tsx | event | GET /venues/:id/events/:eventId |
| EventSales.tsx | salesData, recentOrders | GET /venues/:id/events/:eventId/sales |
| EventGuests.tsx | guests | GET /venues/:id/events/:eventId/guests |
| EventTickets.tsx | ticketTypes | GET /venues/:id/events/:eventId/tickets |
| EventReviews.tsx | reviews | GET /venues/:id/events/:eventId/reviews |
| EventSummary.tsx | summaryData | GET /venues/:id/events/:eventId/summary |
| EventAutomation.tsx | automations | GET /venues/:id/events/:eventId/automation |
| EventFAQ.tsx | faqs | GET /venues/:id/events/:eventId/faq |
| EventSettings.tsx | settings | GET /venues/:id/events/:eventId/settings |
| EventContent.tsx | content | GET /venues/:id/events/:eventId |
| EventSeating.tsx | sections | GET /venues/:id/events/:eventId/seating |
| EventAccess.tsx | accessRules | GET /venues/:id/events/:eventId/access |
| EventLogistics.tsx | logistics | GET /venues/:id/events/:eventId/logistics |
| CreateEvent.tsx | categories | GET /api/event-categories |
| EditEvent.tsx | event | GET /venues/:id/events/:eventId |
| EventPreview.tsx | event | GET /venues/:id/events/:eventId/preview |

### Tickets (15 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Tickets/index.tsx | ticketTypes | GET /venues/:id/ticket-types |
| CreateTicketType.tsx | form submit | POST /venues/:id/ticket-types |
| EditTicketType.tsx | ticketType | GET/PUT /venues/:id/ticket-types/:id |
| BundlesList.tsx | bundles | GET /venues/:id/bundles |
| CreateBundle.tsx | form submit | POST /venues/:id/bundles |
| EditBundle.tsx | bundle | GET/PUT /venues/:id/bundles/:id |
| AddOnsList.tsx | addons | GET /venues/:id/addons |
| CreateAddOn.tsx | form submit | POST /venues/:id/addons |
| EditAddOn.tsx | addon | GET/PUT /venues/:id/addons/:id |
| PromoCodesList.tsx | promoCodes | GET /venues/:id/promo-codes |
| CreatePromoCode.tsx | form submit | POST /venues/:id/promo-codes |
| EditPromoCode.tsx | promoCode | GET/PUT /venues/:id/promo-codes/:id |
| PromoCodeDetail.tsx | promoCode | GET /venues/:id/promo-codes/:id |
| BulkPromoCodes.tsx | form submit | POST /venues/:id/promo-codes/bulk |
| PromoAnalytics.tsx | analytics | GET /venues/:id/promo-codes/analytics |

### Scanning (7 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Scanning/index.tsx | events, recentScans | GET /venues/:id/events (active) |
| EventScanning.tsx | scanResult | POST /venues/:id/scan |
| ScanHistory.tsx | scans | GET /venues/:id/scan/history |
| ZoneOccupancy.tsx | zones | GET /venues/:id/zones |
| CapacityAlerts.tsx | alerts | GET /venues/:id/zones/alerts |
| BannedList.tsx | bannedList | GET /venues/:id/banned |
| ScannerSettings.tsx | settings | GET/PUT /venues/:id/scanner/settings |

### Analytics (9 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Analytics/index.tsx | stats, chartData | GET /venues/:id/analytics/dashboard |
| SalesAnalytics.tsx | salesData | GET /venues/:id/analytics/sales |
| RevenueAnalytics.tsx | revenueData | GET /venues/:id/analytics/revenue |
| AttendanceAnalytics.tsx | attendanceData | GET /venues/:id/analytics/attendance |
| Demographics.tsx | demographics | GET /venues/:id/analytics/demographics |
| GeographicAnalytics.tsx | geoData | GET /venues/:id/analytics/geographic |
| EventComparison.tsx | events | GET /venues/:id/analytics/compare |
| CustomReports.tsx | reportConfig | POST /venues/:id/reports/generate |
| SavedReports.tsx | reports | GET /venues/:id/reports |

### Financials (11 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Financials/index.tsx | stats | GET /venues/:id/financials/overview |
| RevenueDashboard.tsx | revenueData | GET /venues/:id/financials/revenue |
| TransactionsList.tsx | transactions | GET /venues/:id/transactions |
| TransactionDetail.tsx | transaction | GET /venues/:id/transactions/:id |
| PayoutsList.tsx | payouts | GET /venues/:id/payouts |
| PayoutDetail.tsx | payout | GET /venues/:id/payouts/:id |
| PayoutSettings.tsx | settings | GET/PUT /venues/:id/payouts/settings |
| RefundsList.tsx | refunds | GET /venues/:id/refunds |
| Chargebacks.tsx | chargebacks | GET /venues/:id/chargebacks |
| ChargebackResponse.tsx | chargeback | GET /venues/:id/chargebacks/:id |
| TaxDocuments.tsx | documents | GET /venues/:id/tax-documents |

### Marketing (7 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Marketing/index.tsx | stats, campaigns | GET /venues/:id/marketing/dashboard |
| AnnouncementsList.tsx | announcements | GET /venues/:id/announcements |
| CreateAnnouncement.tsx | form submit | POST /venues/:id/announcements |
| MessageTicketHolders.tsx | recipients | GET /venues/:id/events/:id/guests |
| ScheduledMessages.tsx | messages | GET /venues/:id/messages/scheduled |
| MessageHistory.tsx | messages | GET /venues/:id/messages/history |
| MessageTemplates.tsx | templates | GET /venues/:id/messages/templates |

### Resale (6 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Resale/index.tsx | settings | GET /venues/:id/resale/settings |
| PriceRules.tsx | rules | GET /venues/:id/resale/price-rules |
| RoyaltySettings.tsx | settings | GET /venues/:id/resale/royalties |
| Marketplace.tsx | listings | GET /venues/:id/resale/marketplace |
| ResaleAnalytics.tsx | analytics | GET /venues/:id/resale/analytics |
| ResalePolicies.tsx | policies | GET /venues/:id/resale/policies |

### Team (14 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Team/index.tsx | members | GET /venues/:id/team |
| StaffRoles.tsx | roles | GET /venues/:id/team/roles |
| AddStaffMember.tsx | form submit | POST /venues/:id/team |
| InviteMember.tsx | form submit | POST /venues/:id/team/invite |
| MemberDetail.tsx | member | GET /venues/:id/team/:memberId |
| EditPermissions.tsx | permissions | PUT /venues/:id/team/:id/permissions |
| StaffAssignments.tsx | assignments | GET /venues/:id/team/assignments |
| SecurityCheckpoints.tsx | checkpoints | GET /venues/:id/team/checkpoints |
| StaffCheckIn.tsx | staff | GET /venues/:id/team/checkin |
| StaffAnnouncements.tsx | announcements | GET /venues/:id/team/announcements |
| StaffOnDuty.tsx | staff | GET /venues/:id/team/onduty |
| AuditLog.tsx | logs | GET /venues/:id/team/audit |
| TransferOwnership.tsx | admins | GET /venues/:id/team?role=admin |
| TwoFactorSetup.tsx | - | POST /api/auth/2fa/enable |

### Settings (57 files)
All settings files follow pattern:
- GET /venues/:id/settings/{section} to load
- PUT /venues/:id/settings/{section} to save

### Operations (7 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Operations/index.tsx | stats | GET /venues/:id/operations/dashboard |
| IncidentsList.tsx | incidents | GET /venues/:id/incidents |
| LogIncident.tsx | form submit | POST /venues/:id/incidents |
| IncidentDetail.tsx | incident | GET /venues/:id/incidents/:id |
| EquipmentList.tsx | equipment | GET /venues/:id/equipment |
| AddEquipment.tsx | form submit | POST /venues/:id/equipment |
| EquipmentCheck.tsx | equipment | POST /venues/:id/equipment/check |

### Multi-Venue (4 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Venues/index.tsx | venues | GET /venues |
| AddVenue.tsx | form submit | POST /venues |
| CrossVenueAnalytics.tsx | analytics | GET /venues/analytics |
| CompareVenues.tsx | venues | GET /venues/compare |

### Support (27 files)
Most support files use static content or platform-level APIs:
- GET /api/support/articles
- GET /api/support/tickets
- POST /api/support/tickets
- etc.

### Account (5 files)
| File | Mock Data | API Endpoint |
|------|-----------|--------------|
| Account/index.tsx | user | GET /api/user/profile |
| EditProfile.tsx | form | GET/PUT /api/user/profile |
| ChangePassword.tsx | form submit | POST /api/auth/password/change |
| Enable2FA.tsx | - | POST /api/auth/2fa/enable |
| NotificationPreferences.tsx | prefs | GET/PUT /api/user/notifications |

---

## Priority Order for Implementation

### Phase 1: Core Read Operations
1. Authentication (login, register, me)
2. Venues list & details
3. Events list & details
4. Dashboard stats

### Phase 2: Core Write Operations
1. Create/edit events
2. Create/edit ticket types
3. Team invites

### Phase 3: Transactions
1. Ticket scanning
2. Sales & transactions
3. Refunds

### Phase 4: Everything Else
1. Analytics
2. Marketing
3. Settings
4. Support

---

## Shared Utilities Needed

1. **VenueContext** - Track current venue, provide venueId
2. **api.ts** - HTTP client with auth headers
3. **useApi hook** - Loading, error, data states
4. **Spinner component** - Loading indicator
5. **ErrorBoundary** - Error handling
