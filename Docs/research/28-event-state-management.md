# Event State Management in Ticketing Systems
## Standards, Best Practices, and Audit Checklist

**Version:** 1.0  
**Date:** December 2025  
**Purpose:** Security research and audit guide for event lifecycle state management

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
   - Event Lifecycle States
   - State Transition Rules
   - Valid Operations per State
   - Handling Event Modifications After Ticket Sales
   - Event Cancellation Procedures
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Sources](#4-sources)

---

## 1. Standards & Best Practices

### 1.1 Event Lifecycle States

An event in a ticketing system progresses through multiple states during its lifecycle. Based on industry practices from major ticketing platforms, the following states should be supported:

#### Standard Event States

| State | Description | Tickets Sellable | Publicly Visible | Editable |
|-------|-------------|------------------|------------------|----------|
| **DRAFT** | Event created but not published | No | No | Full |
| **SCHEDULED** | Published, awaiting on-sale date | No | Yes (preview) | Limited |
| **ON_SALE** | Active ticket sales period | Yes | Yes | Restricted |
| **SALES_ENDED** | Sales closed, event not started | No | Yes | Restricted |
| **STARTED** | Event is currently in progress | No (or limited) | Yes | Minimal |
| **ENDED** | Event has concluded | No | Archive | Minimal |
| **POSTPONED** | Event delayed, date TBD | No | Yes | Limited |
| **RESCHEDULED** | Event moved to new date | Depends on policy | Yes | Limited |
| **CANCELLED** | Event will not occur | No | Yes | Minimal |
| **SUSPENDED** | Temporarily halted (TBD status) | No | Yes | Limited |

#### State Definitions from Industry Sources

**Eventbrite Event Statuses:**
The Eventbrite API distinguishes between event status ("draft", "live", "started", "ended", "completed") and event sales status (including "sales_ended" with message codes like "event_cancelled").

The event's status can be "live", while the event's sales status is "sales_ended" with "message_code": "event_cancelled". Both statuses are important to understanding the event's position.

Source: https://groups.google.com/g/eventbrite-api/c/HKSxB9vYCNA

**Ticketmaster/AXS Event Statuses:**
Major ticketing platforms recognize distinct states for event changes:

If an event has been postponed, it means the Event Organizer is still working to determine whether the event will be rescheduled or canceled. Your tickets are still valid and no further action is required.

Source: https://help.ticketmaster.com/hc/en-us/articles/9784866185745-What-happens-if-my-event-is-postponed

If your event is suspended, the team/league/artist/venue has suspended the event for the time being and will decide at a future point if the event will be postponed, cancelled, or still occur at the original date and time.

Source: https://www.axs.com/fan-update

#### State Transition Diagram

```
                                    ┌─────────────┐
                                    │   DRAFT     │
                                    └──────┬──────┘
                                           │ publish()
                                           ▼
                                    ┌─────────────┐
                              ┌─────│  SCHEDULED  │─────┐
                              │     └──────┬──────┘     │
                              │            │            │
                         cancel()    startSales()   postpone()
                              │            │            │
                              ▼            ▼            ▼
                       ┌──────────┐ ┌─────────────┐ ┌───────────┐
                       │CANCELLED │ │   ON_SALE   │ │ POSTPONED │
                       └──────────┘ └──────┬──────┘ └─────┬─────┘
                              ▲            │              │
                              │     ┌──────┴──────┐       │
                              │     │             │       │
                         cancel() endSales()  cancel()  reschedule()
                              │     │             │       │
                              │     ▼             │       ▼
                              │ ┌─────────────┐   │  ┌────────────┐
                              ├─│SALES_ENDED  │◄──┘  │RESCHEDULED │
                              │ └──────┬──────┘      └─────┬──────┘
                              │        │                   │
                              │   startEvent()        (returns to
                              │        │               ON_SALE or
                              │        ▼              SCHEDULED)
                              │ ┌─────────────┐
                              ├─│   STARTED   │
                              │ └──────┬──────┘
                              │        │
                              │    endEvent()
                              │        │
                              │        ▼
                              │ ┌─────────────┐
                              └─│    ENDED    │
                                └─────────────┘
```

#### State Properties Matrix

| State | Can Sell | Can Refund | Can Reschedule | Can Cancel | Tickets Valid |
|-------|----------|------------|----------------|------------|---------------|
| DRAFT | ❌ | N/A | N/A | ✅ (delete) | N/A |
| SCHEDULED | ❌ | N/A | ✅ | ✅ | N/A |
| ON_SALE | ✅ | ✅ | ✅ | ✅ | ✅ |
| SALES_ENDED | ❌ | ✅ | ✅ | ✅ | ✅ |
| STARTED | ❌ | Conditional | ❌ | ✅ | ✅ |
| ENDED | ❌ | ❌ | ❌ | ❌ | Expired |
| POSTPONED | ❌ | ✅ | ✅ | ✅ | ✅ |
| RESCHEDULED | Depends | ✅ | ✅ | ✅ | ✅ |
| CANCELLED | ❌ | Auto | ❌ | N/A | ❌ |

---

### 1.2 State Transition Rules

State transitions must be explicitly defined and enforced. Based on industry workflow patterns:

#### Valid Transitions Table

| From State | Valid Transitions | Trigger |
|------------|-------------------|---------|
| DRAFT | SCHEDULED, CANCELLED | publish(), delete() |
| SCHEDULED | ON_SALE, POSTPONED, CANCELLED | salesStart(), postpone(), cancel() |
| ON_SALE | SALES_ENDED, POSTPONED, CANCELLED | salesEnd(), postpone(), cancel() |
| SALES_ENDED | STARTED, POSTPONED, CANCELLED | eventStart(), postpone(), cancel() |
| STARTED | ENDED, CANCELLED | eventEnd(), cancel() |
| ENDED | (terminal) | None |
| POSTPONED | RESCHEDULED, CANCELLED | reschedule(), cancel() |
| RESCHEDULED | ON_SALE, SCHEDULED | salesStart(), setFutureDate() |
| CANCELLED | (terminal) | None |

#### Transition Guards

Each transition should have guard conditions that must be satisfied:

```typescript
interface TransitionGuard {
  from: EventState;
  to: EventState;
  conditions: GuardCondition[];
}

const transitionGuards: TransitionGuard[] = [
  {
    from: 'DRAFT',
    to: 'SCHEDULED',
    conditions: [
      'hasRequiredFields',      // Event has name, date, venue
      'hasAtLeastOneTicketType', // At least one ticket type defined
      'eventDateInFuture',      // Event date is in the future
      'venueCapacitySet',       // Venue capacity is defined
    ]
  },
  {
    from: 'SCHEDULED',
    to: 'ON_SALE',
    conditions: [
      'salesStartDateReached',  // Current time >= sales start date
      'eventDateInFuture',      // Event hasn't already occurred
      'ticketsAvailable',       // Tickets exist and have capacity
    ]
  },
  {
    from: 'ON_SALE',
    to: 'SALES_ENDED',
    conditions: [
      'salesEndDateReached',    // Current time >= sales end date
      // OR
      'manualSalesClose',       // Organizer manually closed sales
      // OR
      'soldOut',                // All tickets sold
    ]
  },
  {
    from: 'SALES_ENDED',
    to: 'STARTED',
    conditions: [
      'eventStartTimeReached',  // Current time >= event start time
      'notCancelled',           // Event not in cancelled state
    ]
  },
  {
    from: 'STARTED',
    to: 'ENDED',
    conditions: [
      'eventEndTimeReached',    // Current time >= event end time
      // OR
      'manualEventEnd',         // Organizer marked event as ended
    ]
  },
  {
    from: 'ON_SALE',
    to: 'CANCELLED',
    conditions: [
      'organizerAuthorized',    // User has cancel permission
      'cancellationReasonProvided', // Reason documented
    ]
  },
];
```

#### Automatic vs Manual Transitions

**Automatic Transitions (Time-Based):**
- SCHEDULED → ON_SALE (when sales start time reached)
- ON_SALE → SALES_ENDED (when sales end time reached)
- SALES_ENDED → STARTED (when event start time reached)
- STARTED → ENDED (when event end time reached)

Set the date/time of the event and set the date/time when the system will start and end the ticket sales. Note that all times are based on the venue's local time-zone. At this exact time (based on venues local time-zone) ticket sales will end.

Source: https://www.ticketor.com/how-to/Learn-everything-about-selling-tickets-online-setting-up-a-box-office-and-your-Ticketor-site?section=All

**Manual Transitions (User-Initiated):**
- DRAFT → SCHEDULED (publish action)
- Any → CANCELLED (cancel action)
- Any → POSTPONED (postpone action)
- POSTPONED → RESCHEDULED (reschedule action)

The status of your event can be changed to tickets at the door, sold out, cancelled, or postponed. Changing your event status will pause ticket sales.

Source: https://www.eventbrite.com/help/en-us/articles/125543/how-to-manage-your-event-status/

---

### 1.3 Valid Operations per State

Each event state permits or restricts specific operations. Below is a comprehensive matrix:

#### DRAFT State Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| Edit event name | ✅ | Full editing allowed |
| Edit event date/time | ✅ | No restrictions |
| Edit venue | ✅ | No restrictions |
| Edit ticket types | ✅ | Create, modify, delete |
| Edit pricing | ✅ | No restrictions |
| Publish event | ✅ | Requires validation |
| Delete event | ✅ | Permanent deletion |
| Sell tickets | ❌ | Not published |
| Process refunds | N/A | No sales exist |

#### SCHEDULED State Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| Edit event name | ✅ | Limited impact |
| Edit event date/time | ✅ | Updates sales window |
| Edit venue | ✅ | Update venue info |
| Edit ticket types | ✅ | Add/modify before sales |
| Edit pricing | ✅ | Before sales start |
| Start sales early | ✅ | Manual override |
| Postpone | ✅ | Transitions to POSTPONED |
| Cancel | ✅ | No refunds needed (no sales) |
| Sell tickets | ❌ | Sales period not started |

#### ON_SALE State Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| Edit event name | ⚠️ | Requires notification |
| Edit event date/time | ⚠️ | Major change - see 1.4 |
| Edit venue | ⚠️ | Major change - refund eligible |
| Add ticket types | ✅ | Can add new tiers |
| Modify ticket prices | ⚠️ | Only for unsold tickets |
| Delete ticket types | ❌ | If tickets sold |
| End sales early | ✅ | Manual override |
| Postpone | ✅ | Pauses sales |
| Cancel | ✅ | Triggers refunds |
| Sell tickets | ✅ | Primary function |
| Process refunds | ✅ | Per refund policy |

After you have published the event, you cannot make changes to the event date and time.

Source: https://help-organizer.peatix.com/en/support/solutions/articles/44001821794-can-i-edit-my-event-after-publishing-

#### SALES_ENDED State Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| Edit event name | ⚠️ | Notification required |
| Edit event date/time | ⚠️ | Rescheduling only |
| Edit venue | ⚠️ | Major change |
| Modify ticket types | ❌ | Sales closed |
| Reopen sales | ✅ | Returns to ON_SALE |
| Postpone | ✅ | Date uncertain |
| Cancel | ✅ | Triggers refunds |
| Sell tickets | ❌ | Sales period ended |
| Process refunds | ✅ | Per policy |

#### STARTED State Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| Edit event details | ❌ | Event in progress |
| Cancel | ⚠️ | Partial refunds may apply |
| End event early | ✅ | Force end |
| Sell tickets | ❌ | Event already started |
| Process refunds | ⚠️ | Complex - partial attendance |
| Allow resale/transfer | ❌ | Event in progress |

#### ENDED State Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| Edit event details | ❌ | Historical record |
| Process refunds | ❌ | Event completed |
| Generate reports | ✅ | Analytics available |
| Archive event | ✅ | Move to archive |

#### CANCELLED State Operations

| Operation | Allowed | Notes |
|-----------|---------|-------|
| Edit event details | ❌ | Terminal state |
| Process refunds | ✅ | Automatic/manual |
| Communicate cancellation | ✅ | Required action |
| Archive event | ✅ | After refunds complete |

---

### 1.4 Handling Event Modifications After Ticket Sales

Once tickets are sold, event modifications become sensitive operations with legal and customer service implications.

#### Modification Severity Levels

**Minor Modifications (No Refund Required):**
- Spelling corrections
- Additional event details
- Parking information updates
- Added amenities

**Moderate Modifications (Notification Required):**
- Venue name change (same location)
- Start time adjustment (< 2 hours)
- Added opening acts
- Seating chart minor adjustments

**Major Modifications (Refund Eligible):**
- Venue change (different location)
- Event date change (rescheduling)
- Significant time change (> 2 hours)
- Headliner/performer change
- Event format change (indoor to outdoor)

If an Event is changed significantly (change in the date, time, venue of the Event or its programming) while Tickets have been sold or are still on sale, the Organiser shall inform the platform without delay. The significant change of an Event is considered, in the context of the current texts, as a cancellation of the Event.

Source: https://support.weezevent.com/en/legal-obligations-cancellation-modification

#### Modification Workflow

```typescript
interface EventModification {
  eventId: string;
  modifiedFields: ModifiedField[];
  modifiedAt: Date;
  modifiedBy: string;
  severityLevel: 'MINOR' | 'MODERATE' | 'MAJOR';
  requiresNotification: boolean;
  refundEligible: boolean;
  notificationSent: boolean;
  refundWindowDays: number;
}

const handleEventModification = async (
  eventId: string,
  changes: EventChanges,
  modifierUserId: string
): Promise<ModificationResult> => {
  // 1. Determine modification severity
  const severity = calculateSeverity(changes);
  
  // 2. Check if tickets have been sold
  const ticketsSold = await getTicketsSoldCount(eventId);
  
  if (ticketsSold > 0 && severity === 'MAJOR') {
    // 3. Pause ticket sales during major modification
    await pauseTicketSales(eventId);
    
    // 4. Create modification record
    const modification = await createModificationRecord({
      eventId,
      modifiedFields: getModifiedFields(changes),
      modifiedAt: new Date(),
      modifiedBy: modifierUserId,
      severityLevel: severity,
      requiresNotification: true,
      refundEligible: true,
      refundWindowDays: 14,
    });
    
    // 5. Notify all ticket holders
    await notifyTicketHolders(eventId, modification);
    
    // 6. Open refund window
    await openRefundWindow(eventId, modification.refundWindowDays);
    
    // 7. Apply changes
    await applyEventChanges(eventId, changes);
    
    // 8. Resume ticket sales (if not cancelled)
    await resumeTicketSales(eventId);
    
    return { success: true, modification };
  }
  
  // For minor/moderate changes without tickets sold
  await applyEventChanges(eventId, changes);
  
  if (ticketsSold > 0) {
    await notifyTicketHolders(eventId, { changes, severity });
  }
  
  return { success: true };
};
```

#### Rescheduling Best Practices

If an event is rescheduled or moved, your tickets (including any upgrades or add-ons, such as parking) are still valid for the new date — you won't need to do anything else.

Source: https://help.ticketmaster.com/hc/en-us/articles/9784889055889-What-happens-if-my-event-is-rescheduled-or-moved

When rescheduling events:
1. Tickets automatically transfer to new date
2. Refund option should be offered
3. Transfer/resale options should be enabled for those who can't attend

If your event was rescheduled, your tickets will still be good for the new date. Simply arrive at the venue at the new date and time. You'll have the option to request a refund if your order qualifies.

Source: https://support.axs.com/hc/en-us/articles/360012528900-My-event-was-rescheduled-What-do-I-do

---

### 1.5 Event Cancellation Procedures

Event cancellation requires a structured workflow to ensure proper handling of refunds, communications, and record-keeping.

#### Cancellation Workflow Steps

**Step 1: Halt Ticket Sales Immediately**

Stop selling tickets immediately to prevent confusion and avoid creating expectations that can't be met. Update your event website and ticketing platform to reflect the cancellation.

Source: https://eventify.io/blog/event-cancellation

**Step 2: Update Event Status**

```typescript
const cancelEvent = async (
  eventId: string,
  cancellationReason: string,
  cancelledBy: string
): Promise<CancellationResult> => {
  // 1. Validate event can be cancelled
  const event = await getEvent(eventId);
  if (event.status === 'ENDED' || event.status === 'CANCELLED') {
    throw new Error('Event cannot be cancelled in current state');
  }
  
  // 2. Immediately stop ticket sales
  await updateEventStatus(eventId, 'SALES_PAUSED');
  
  // 3. Create cancellation record
  const cancellation = await createCancellationRecord({
    eventId,
    reason: cancellationReason,
    cancelledBy,
    cancelledAt: new Date(),
    ticketsToRefund: await getActiveTicketCount(eventId),
    estimatedRefundAmount: await calculateTotalRefundAmount(eventId),
  });
  
  // 4. Update event status to CANCELLED
  await updateEventStatus(eventId, 'CANCELLED');
  
  // 5. Trigger automatic refund process
  await initiateAutomaticRefunds(eventId);
  
  // 6. Notify all ticket holders
  await sendCancellationNotifications(eventId, cancellationReason);
  
  // 7. Update public event page
  await updatePublicEventPage(eventId, 'CANCELLED');
  
  // 8. Log to audit trail
  await logAuditEvent({
    action: 'EVENT_CANCELLED',
    eventId,
    actor: cancelledBy,
    reason: cancellationReason,
    timestamp: new Date(),
  });
  
  return cancellation;
};
```

**Step 3: Process Refunds**

If an event is canceled, no action is required to obtain a refund. It will be processed to the original method of payment used at time of purchase as soon as funds are received from the Event Organizer. It should appear on your account within 14-21 days.

Source: https://help.ticketmaster.com/hc/en-us/articles/9784845658641-What-happens-if-my-event-is-canceled

Best practice: make full refunds for cancellations automatic. Don't force attendees to chase you. Announce the cancellation and tell them when to expect their money back.

Source: https://loopyah.com/blog/planning/event-refund-policy

**Step 4: Communicate Clearly**

When cancelling an event, make sure to communicate quickly and clearly with participants. Explain the reasons for the cancellation, present the available refund options, and provide instructions on how to proceed.

Source: https://imagina.com/en/blog/article/refund-ticket-event/

#### Cancellation Communication Checklist

- [ ] Notify ticket holders via email immediately
- [ ] Update event page to show cancelled status
- [ ] Post on social media channels
- [ ] Explain reason for cancellation
- [ ] Detail refund process and timeline
- [ ] Provide customer support contact information
- [ ] Consider offering future event credits/discounts

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Selling Tickets for Unpublished Events

**Problem:** Tickets sold for events that haven't been properly reviewed, approved, or made public.

**Causes:**
- No publish gate before sales enabled
- Direct API access bypassing UI controls
- Missing state validation on ticket creation
- Event marked "active" without required fields

**Consequences:**
- Tickets sold for incomplete events
- Customer confusion from missing event details
- Legal liability from unconfirmed dates/venues
- Financial loss from premature commitments

**Correct Approach:**
```typescript
const createTicketOrder = async (
  eventId: string,
  ticketRequest: TicketRequest
): Promise<Order> => {
  // CRITICAL: Validate event state before any sale
  const event = await getEvent(eventId);
  
  // Event must be in sellable state
  const sellableStates = ['ON_SALE'];
  if (!sellableStates.includes(event.status)) {
    throw new Error(`Cannot sell tickets. Event status is ${event.status}`);
  }
  
  // Event must be published (visible to public)
  if (!event.isPublished) {
    throw new Error('Cannot sell tickets for unpublished event');
  }
  
  // Event date must be in the future
  if (new Date(event.startDate) <= new Date()) {
    throw new Error('Cannot sell tickets for past event');
  }
  
  // Sales window must be active
  const now = new Date();
  if (now < new Date(event.salesStartDate) || now > new Date(event.salesEndDate)) {
    throw new Error('Sales are not currently open for this event');
  }
  
  // Proceed with ticket creation
  return processTicketOrder(eventId, ticketRequest);
};
```

---

### 2.2 Modifying Event Details After Sales

**Problem:** Critical event details changed after tickets sold without proper notification or refund options.

**Causes:**
- No field-level change tracking
- Missing modification severity assessment
- No notification workflow triggered
- UI allows unrestricted editing

**Consequences:**
- Attendees arrive at wrong venue/time
- Legal liability for contract breach
- Chargebacks and disputes
- Reputation damage

The rules for issuing tickets being very strict, changing a show, and more specifically a mandatory mention on the ticket (such as change of artist, cancellation or postponement, change of venue), has important consequences on the validity of the ticket.

Source: https://support.weezevent.com/en/legal-obligations-cancellation-modification

**Correct Approach:**
```typescript
const updateEvent = async (
  eventId: string,
  updates: Partial<Event>,
  userId: string
): Promise<UpdateResult> => {
  const event = await getEvent(eventId);
  const ticketsSold = await getTicketsSoldCount(eventId);
  
  // Define protected fields after ticket sales
  const protectedFields = [
    'startDate',
    'endDate',
    'venue',
    'venueName',
    'venueAddress',
    'primaryPerformer',
    'eventFormat',
  ];
  
  // Check if protected fields are being modified
  const modifiedProtectedFields = protectedFields.filter(
    field => updates[field] !== undefined && updates[field] !== event[field]
  );
  
  if (ticketsSold > 0 && modifiedProtectedFields.length > 0) {
    // Require confirmation and trigger notification workflow
    return {
      requiresConfirmation: true,
      modifiedProtectedFields,
      ticketsAffected: ticketsSold,
      actions: [
        'Notification will be sent to all ticket holders',
        'Refund window will be opened',
        'Sales will be paused during modification',
      ],
    };
  }
  
  // Log all changes for audit trail
  await logEventModification(eventId, event, updates, userId);
  
  // Apply updates
  return applyEventUpdates(eventId, updates);
};
```

---

### 2.3 No Enforcement of Event Timing

**Problem:** System doesn't automatically enforce sales windows or event timing, allowing manual overrides that create inconsistencies.

**Causes:**
- Time-based transitions not automated
- Server time not synchronized
- Timezone handling errors
- Missing scheduled job for state transitions

**Consequences:**
- Tickets sold after event started
- Tickets sold after event ended
- Sales open before announced time
- Check-in available for future events

NOTE: Closing your ticket sales prior to your event is not recommended unless absolutely necessary. To maximize your revenue and make best use of your event capacity, it is best to be set up for on site sales.

Source: https://help.eventive.org/en/articles/4068768-close-ticket-sales-prior-to-event-start

It is recommended to set the sales end date to a couple hours after the start of the event so that last-minute buyers can still buy tickets and attend the event, even after it is started.

Source: https://www.ticketor.com/how-to/Learn-everything-about-selling-tickets-online-setting-up-a-box-office-and-your-Ticketor-site?section=All

**Correct Approach:**
```typescript
// Scheduled job for automatic state transitions
const processEventStateTransitions = async (): Promise<void> => {
  const now = new Date();
  
  // SCHEDULED → ON_SALE
  const eventsToStartSales = await findEvents({
    status: 'SCHEDULED',
    salesStartDate: { $lte: now },
    startDate: { $gt: now }, // Event hasn't started yet
  });
  
  for (const event of eventsToStartSales) {
    await transitionEventState(event.id, 'ON_SALE');
    await logStateTransition(event.id, 'SCHEDULED', 'ON_SALE', 'AUTOMATIC');
  }
  
  // ON_SALE → SALES_ENDED (based on sales end date)
  const eventsToEndSales = await findEvents({
    status: 'ON_SALE',
    salesEndDate: { $lte: now },
  });
  
  for (const event of eventsToEndSales) {
    await transitionEventState(event.id, 'SALES_ENDED');
    await logStateTransition(event.id, 'ON_SALE', 'SALES_ENDED', 'AUTOMATIC');
  }
  
  // SALES_ENDED → STARTED (based on event start time)
  const eventsToStart = await findEvents({
    status: 'SALES_ENDED',
    startDate: { $lte: now },
    endDate: { $gt: now },
  });
  
  for (const event of eventsToStart) {
    await transitionEventState(event.id, 'STARTED');
    await logStateTransition(event.id, 'SALES_ENDED', 'STARTED', 'AUTOMATIC');
  }
  
  // STARTED → ENDED (based on event end time)
  const eventsToEnd = await findEvents({
    status: 'STARTED',
    endDate: { $lte: now },
  });
  
  for (const event of eventsToEnd) {
    await transitionEventState(event.id, 'ENDED');
    await logStateTransition(event.id, 'STARTED', 'ENDED', 'AUTOMATIC');
  }
};

// Run every minute
setInterval(processEventStateTransitions, 60000);
```

---

### 2.4 Missing Cancellation Workflow

**Problem:** Event cancellation is a simple status change without proper refund processing, notification, or cleanup.

**Causes:**
- Cancellation treated as simple field update
- No automated refund trigger
- No notification workflow
- No audit trail for cancellation

**Consequences:**
- Tickets remain "valid" after cancellation
- Refunds not processed automatically
- Attendees not notified
- Financial reconciliation issues

If your event is cancelled, we'll automatically refund the credit card used for purchase (usually within 30 business days of the cancellation announcement).

Source: https://www.axs.com/fan-update

**Correct Approach:**
```typescript
interface CancellationWorkflow {
  steps: CancellationStep[];
  currentStep: number;
  completedSteps: CompletedStep[];
}

const executeCancellationWorkflow = async (
  eventId: string,
  reason: string,
  initiatedBy: string
): Promise<CancellationWorkflow> => {
  const workflow: CancellationWorkflow = {
    steps: [
      { name: 'PAUSE_SALES', status: 'PENDING' },
      { name: 'UPDATE_STATUS', status: 'PENDING' },
      { name: 'INVALIDATE_TICKETS', status: 'PENDING' },
      { name: 'INITIATE_REFUNDS', status: 'PENDING' },
      { name: 'NOTIFY_ATTENDEES', status: 'PENDING' },
      { name: 'UPDATE_PUBLIC_PAGE', status: 'PENDING' },
      { name: 'CANCEL_RESALE_LISTINGS', status: 'PENDING' },
      { name: 'NOTIFY_VENDORS', status: 'PENDING' },
      { name: 'GENERATE_REPORT', status: 'PENDING' },
    ],
    currentStep: 0,
    completedSteps: [],
  };
  
  // Execute each step in order
  for (const step of workflow.steps) {
    try {
      await executeStep(eventId, step, reason);
      workflow.completedSteps.push({
        name: step.name,
        completedAt: new Date(),
        status: 'SUCCESS',
      });
    } catch (error) {
      workflow.completedSteps.push({
        name: step.name,
        completedAt: new Date(),
        status: 'FAILED',
        error: error.message,
      });
      // Alert admin for manual intervention
      await alertCancellationFailure(eventId, step, error);
    }
    workflow.currentStep++;
  }
  
  return workflow;
};
```

---

### 2.5 Resale Allowed After Event Start

**Problem:** Ticket resale/transfer continues to be allowed after the event has already started or ended.

**Causes:**
- Resale marketplace not integrated with event state
- No automatic resale cutoff
- Third-party resale platforms not notified
- Transfer function doesn't check event timing

**Consequences:**
- Buyers purchase tickets for events already occurring
- Fraud potential (selling ticket after using it)
- Customer disputes and chargebacks
- Platform liability

Instant delivery gives scalpers a headstart on reselling tickets, often at a markup.

Source: https://creators.tixr.com/post/9-ways-to-protect-your-event-from-ticket-scalpers-fight-fraud

**Correct Approach:**
```typescript
const validateResaleEligibility = async (
  ticketId: string
): Promise<ResaleEligibility> => {
  const ticket = await getTicket(ticketId);
  const event = await getEvent(ticket.eventId);
  
  // Check event state
  const nonResaleStates = ['STARTED', 'ENDED', 'CANCELLED'];
  if (nonResaleStates.includes(event.status)) {
    return {
      eligible: false,
      reason: `Resale not allowed. Event is ${event.status}`,
    };
  }
  
  // Check if ticket was already scanned/used
  if (ticket.status === 'USED' || ticket.status === 'CHECKED_IN') {
    return {
      eligible: false,
      reason: 'Ticket has already been used',
    };
  }
  
  // Check resale cutoff time (typically 24 hours before event)
  const resaleCutoffHours = event.resaleCutoffHours || 24;
  const cutoffTime = new Date(event.startDate);
  cutoffTime.setHours(cutoffTime.getHours() - resaleCutoffHours);
  
  if (new Date() >= cutoffTime) {
    return {
      eligible: false,
      reason: `Resale closes ${resaleCutoffHours} hours before event start`,
    };
  }
  
  // Check event-specific resale rules
  if (!event.resaleEnabled) {
    return {
      eligible: false,
      reason: 'Resale is disabled for this event',
    };
  }
  
  return { eligible: true };
};

// Hook into state transitions to disable resale
const onEventStateChange = async (
  eventId: string,
  newState: EventState
): Promise<void> => {
  if (newState === 'STARTED' || newState === 'CANCELLED') {
    // Immediately cancel all active resale listings
    await cancelAllResaleListings(eventId);
    
    // Notify resale marketplace to block new listings
    await notifyResaleMarketplace(eventId, 'DISABLE_RESALE');
  }
};
```

---

## 3. Audit Checklist

### 3.1 Event States Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| ES-01 | All event states are explicitly defined in code/schema | CRITICAL | Code review |
| ES-02 | DRAFT state exists as initial state | HIGH | Schema inspection |
| ES-03 | CANCELLED state exists as terminal state | CRITICAL | Schema inspection |
| ES-04 | ENDED state exists as terminal state | CRITICAL | Schema inspection |
| ES-05 | POSTPONED state is separate from CANCELLED | HIGH | Schema inspection |
| ES-06 | RESCHEDULED state tracks new date separately | HIGH | Schema inspection |
| ES-07 | Sales status is tracked separately from event status | HIGH | Schema inspection |
| ES-08 | State enum prevents invalid/undefined states | HIGH | Type checking |
| ES-09 | State is stored with timestamp of last change | MEDIUM | Schema inspection |
| ES-10 | State history/audit trail is maintained | HIGH | Database review |

**Verification Commands:**
```bash
# Find all event state definitions
grep -rn "EventStatus\|EventState\|event.*status" --include="*.ts" --include="*.sol"

# Check for enum completeness
grep -rn "enum.*Event" --include="*.ts" -A 20

# Find state update functions
grep -rn "updateStatus\|setState\|transition" --include="*.ts" | grep -i event
```

---

### 3.2 State Transitions Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| TR-01 | All valid transitions are explicitly defined | CRITICAL | Code review |
| TR-02 | Invalid transitions throw errors/are rejected | CRITICAL | Unit test |
| TR-03 | DRAFT can only transition to SCHEDULED or deleted | HIGH | Unit test |
| TR-04 | ENDED cannot transition to any other state | CRITICAL | Unit test |
| TR-05 | CANCELLED cannot transition to any other state | CRITICAL | Unit test |
| TR-06 | ON_SALE → STARTED requires SALES_ENDED intermediate | HIGH | Unit test |
| TR-07 | Automatic transitions occur at correct times | HIGH | Integration test |
| TR-08 | Manual transitions require authorization | HIGH | Permission test |
| TR-09 | Transition timestamps are recorded | MEDIUM | Audit log review |
| TR-10 | Transition reasons are captured for manual actions | MEDIUM | Schema review |

**Verification Commands:**
```bash
# Find transition validation logic
grep -rn "canTransition\|isValidTransition\|VALID_TRANSITIONS" --include="*.ts"

# Check for state machine implementation
grep -rn "stateMachine\|workflow\|transition" --include="*.ts" | grep -i event

# Find automatic transition schedulers
grep -rn "cron\|schedule\|interval" --include="*.ts" | grep -i "event\|state"
```

---

### 3.3 Operations per State Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| OP-01 | Ticket sales blocked in DRAFT state | CRITICAL | Integration test |
| OP-02 | Ticket sales blocked in CANCELLED state | CRITICAL | Integration test |
| OP-03 | Ticket sales blocked in ENDED state | CRITICAL | Integration test |
| OP-04 | Ticket sales require ON_SALE state | CRITICAL | Unit test |
| OP-05 | Event editing restricted after sales start | HIGH | Integration test |
| OP-06 | Protected fields require confirmation to modify | HIGH | UI/API test |
| OP-07 | Refunds blocked for ENDED events | HIGH | Integration test |
| OP-08 | Resale blocked for STARTED events | HIGH | Integration test |
| OP-09 | Check-in only allowed for STARTED/SALES_ENDED events | HIGH | Integration test |
| OP-10 | Deletion blocked after ticket sales | CRITICAL | Integration test |

**Verification Commands:**
```bash
# Find ticket sale validation
grep -rn "createOrder\|sellTicket\|purchaseTicket" --include="*.ts" -A 20 | grep -i "status\|state"

# Check for operation guards
grep -rn "canEdit\|canSell\|canRefund\|canResale" --include="*.ts"

# Find protected field definitions
grep -rn "protected\|restricted\|locked" --include="*.ts" | grep -i "field\|property"
```

---

### 3.4 Event Modification Controls

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| MD-01 | Date/time changes after sales trigger notification | HIGH | Integration test |
| MD-02 | Venue changes after sales trigger notification | HIGH | Integration test |
| MD-03 | Major modifications open refund window | HIGH | Integration test |
| MD-04 | Modification audit trail exists | HIGH | Database review |
| MD-05 | Modification requires authorization | HIGH | Permission test |
| MD-06 | Protected fields identified and enforced | HIGH | Code review |
| MD-07 | Ticket holders notified of changes | HIGH | Notification test |
| MD-08 | Original event data preserved for reference | MEDIUM | Schema review |
| MD-09 | Modification severity auto-calculated | MEDIUM | Unit test |
| MD-10 | Sales paused during major modifications | HIGH | Integration test |

**Verification Commands:**
```bash
# Find modification tracking
grep -rn "modif\|change.*track\|audit" --include="*.ts" | grep -i event

# Check for notification triggers
grep -rn "notify\|email\|alert" --include="*.ts" | grep -i "change\|modif\|update"

# Find field protection logic
grep -rn "protected.*field\|restrict.*edit\|lock.*change" --include="*.ts"
```

---

### 3.5 Cancellation Workflow Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| CN-01 | Cancellation stops ticket sales immediately | CRITICAL | Integration test |
| CN-02 | Cancellation triggers automatic refunds | CRITICAL | Integration test |
| CN-03 | All ticket holders notified of cancellation | HIGH | Notification test |
| CN-04 | Cancellation reason is required and stored | HIGH | Schema review |
| CN-05 | Cancellation timestamp recorded | HIGH | Schema review |
| CN-06 | Cancelled event page shows cancellation notice | HIGH | UI test |
| CN-07 | Tickets invalidated upon cancellation | CRITICAL | Integration test |
| CN-08 | Resale listings cancelled | HIGH | Integration test |
| CN-09 | Cancellation report generated | MEDIUM | Feature test |
| CN-10 | Refund timeline communicated to attendees | HIGH | Communication test |

**Verification Commands:**
```bash
# Find cancellation workflow
grep -rn "cancel.*event\|event.*cancel" --include="*.ts" -A 30

# Check for refund triggers
grep -rn "refund\|reimburse" --include="*.ts" | grep -i cancel

# Find notification logic
grep -rn "notif\|email\|commun" --include="*.ts" | grep -i cancel
```

---

### 3.6 Timing Enforcement Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| TM-01 | Sales start time enforced automatically | HIGH | Integration test |
| TM-02 | Sales end time enforced automatically | HIGH | Integration test |
| TM-03 | Event start triggers state change | HIGH | Integration test |
| TM-04 | Event end triggers state change | HIGH | Integration test |
| TM-05 | Timezone handling is consistent | HIGH | Unit test |
| TM-06 | Server time synchronized (NTP) | MEDIUM | Infrastructure check |
| TM-07 | Scheduled jobs run reliably | HIGH | Job monitoring |
| TM-08 | Manual override requires authorization | HIGH | Permission test |
| TM-09 | Time-based validation on all ticket operations | CRITICAL | Code review |
| TM-10 | Resale cutoff time enforced | HIGH | Integration test |

**Verification Commands:**
```bash
# Find time validation
grep -rn "Date\|time\|now\(\)" --include="*.ts" | grep -i "event\|ticket\|sale"

# Check for scheduled jobs
grep -rn "cron\|schedule\|setInterval\|setTimeout" --include="*.ts"

# Find timezone handling
grep -rn "timezone\|tz\|UTC\|local" --include="*.ts"
```

---

### 3.7 Resale Control Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| RS-01 | Resale disabled for STARTED events | CRITICAL | Integration test |
| RS-02 | Resale disabled for ENDED events | CRITICAL | Integration test |
| RS-03 | Resale disabled for CANCELLED events | CRITICAL | Integration test |
| RS-04 | Resale cutoff time enforced | HIGH | Integration test |
| RS-05 | Used tickets cannot be listed for resale | CRITICAL | Integration test |
| RS-06 | Resale listings cancelled on event cancellation | HIGH | Integration test |
| RS-07 | Resale listings cancelled on event start | HIGH | Integration test |
| RS-08 | Transfer blocked after event start | HIGH | Integration test |
| RS-09 | Resale marketplace notified of state changes | HIGH | Integration test |
| RS-10 | Price caps enforced on resale (if applicable) | MEDIUM | Integration test |

**Verification Commands:**
```bash
# Find resale validation
grep -rn "resale\|resell\|secondary" --include="*.ts" | grep -i "valid\|check\|allow"

# Check for event state in resale logic
grep -rn "resale\|transfer" --include="*.ts" -B 5 -A 5 | grep -i "status\|state"

# Find cutoff logic
grep -rn "cutoff\|deadline\|freeze" --include="*.ts" | grep -i resale
```

---

### 3.8 Audit Trail Verification

| ID | Check | Severity | Verification Method |
|----|-------|----------|---------------------|
| AU-01 | All state changes logged | CRITICAL | Code review |
| AU-02 | State change actor recorded | HIGH | Schema review |
| AU-03 | State change timestamp recorded | HIGH | Schema review |
| AU-04 | State change reason recorded (for manual) | HIGH | Schema review |
| AU-05 | Event modifications logged | HIGH | Code review |
| AU-06 | Cancellation details logged | HIGH | Code review |
| AU-07 | Audit log is immutable | HIGH | Storage configuration |
| AU-08 | Audit log searchable/filterable | MEDIUM | Feature test |
| AU-09 | Audit log retention meets compliance | MEDIUM | Policy review |
| AU-10 | Audit log includes previous/new state values | MEDIUM | Schema review |

**Verification Commands:**
```bash
# Find audit logging
grep -rn "audit\|log.*change\|track" --include="*.ts" | grep -i event

# Check for state in audit entries
grep -rn "AuditLog\|EventLog\|ChangeLog" --include="*.ts" -A 20

# Find immutable storage patterns
grep -rn "append\|immutable\|readonly" --include="*.ts" | grep -i log
```

---

## 4. Sources

### Major Ticketing Platform Documentation

- **Eventbrite Event Status API:** https://groups.google.com/g/eventbrite-api/c/HKSxB9vYCNA
- **Eventbrite Change Event Status:** https://www.eventbrite.com/help/en-us/articles/125543/how-to-manage-your-event-status/
- **Eventbrite Unpublish/Delete Events:** https://www.eventbrite.com/help/en-us/articles/172435/how-to-delete-an-event/
- **Ticketmaster Event Postponed:** https://help.ticketmaster.com/hc/en-us/articles/9784866185745-What-happens-if-my-event-is-postponed
- **Ticketmaster Event Cancelled:** https://help.ticketmaster.com/hc/en-us/articles/9784845658641-What-happens-if-my-event-is-canceled
- **Ticketmaster Event Rescheduled:** https://help.ticketmaster.com/hc/en-us/articles/9784889055889-What-happens-if-my-event-is-rescheduled-or-moved
- **Ticketmaster Event Status Check:** https://help.ticketmaster.com/hc/en-us/articles/9756148148625-How-do-I-check-if-my-event-has-been-canceled-postponed-rescheduled-or-moved
- **Ticketmaster Refund Information:** https://blog.ticketmaster.com/refund-credit-canceled-postponed-rescheduled-events/
- **Ticketmaster Resale:** https://business.ticketmaster.com/ticketmaster-resale-secure-solution/
- **AXS Fan Update (Event Status):** https://www.axs.com/fan-update
- **AXS Rescheduled Events:** https://support.axs.com/hc/en-us/articles/360012528900-My-event-was-rescheduled-What-do-I-do
- **AXS Postponed Events:** https://support.axs.com/hc/en-us/articles/360031256894-My-event-was-postponed-What-can-I-do

### Event Modification & Legal Obligations

- **Weezevent Legal Obligations:** https://support.weezevent.com/en/legal-obligations-cancellation-modification
- **Skiddle Venue Change Refunds:** https://help.skiddle.com/en/articles/5324001-the-event-has-changed-venue-can-i-have-a-refund
- **Peatix Event Editing:** https://help-organizer.peatix.com/en/support/solutions/articles/44001821794-can-i-edit-my-event-after-publishing-

### Cancellation & Refund Best Practices

- **Imagina Refund Best Practices:** https://imagina.com/en/blog/article/refund-ticket-event/
- **Loopyah Event Refund Policy Guide:** https://loopyah.com/blog/planning/event-refund-policy
- **Eventcube Event Cancellation Guide:** https://www.eventcube.io/blog/event-cancellation-guide
- **Eventify Event Cancellation:** https://eventify.io/blog/event-cancellation
- **ClearEvent Refund Policy:** https://help.clearevent.com/en/articles/1002005-setting-a-refund-policy
- **Yapsody When to Offer Refunds:** https://www.yapsody.com/ticketing/blog/when-and-why-you-should-offer-event-ticket-refunds/
- **Events Calendar Refunds:** https://theeventscalendar.com/knowledgebase/how-to-refund-or-cancel-a-tickets-order/

### Sales Timing & Cutoff

- **Peatix Ticket Sales Period:** https://help-organizer.peatix.com/en/support/solutions/articles/44001821718-how-to-set-the-ticket-sales-period
- **Eventive Close Sales Before Event:** https://help.eventive.org/en/articles/4068768-close-ticket-sales-prior-to-event-start
- **TicketSpice Sales Windows:** https://help.ticketspice.com/en/articles/9022755-create-sales-windows-and-sales-cut-off-times
- **TicketSpice Auto Start/Stop Sales:** https://help.ticketspice.com/en/articles/7828555-automatically-start-and-stop-ticket-sales-and-change-your-event-start-and-end-date
- **Ticketor Event Setup Guide:** https://www.ticketor.com/how-to/Learn-everything-about-selling-tickets-online-setting-up-a-box-office-and-your-Ticketor-site?section=All

### Resale & Secondary Market

- **Bauer Entertainment Secondary Market Guide:** https://www.bauerentertainmentmarketing.com/promoters-guide-secondary-tickets
- **Tixr Fraud Prevention:** https://creators.tixr.com/post/9-ways-to-protect-your-event-from-ticket-scalpers-fight-fraud
- **Softjourn Ticketing Fraud Prevention:** https://softjourn.com/insights/prevent-ticketing-fraud
- **Wikipedia Ticket Resale:** https://en.wikipedia.org/wiki/Ticket_resale
- **GAO Event Ticket Sales Report:** https://www.gao.gov/assets/gao-18-347.pdf

### State Machine & Workflow Patterns

- **Symfony Workflow Documentation:** https://symfony.com/doc/current/workflow.html
- **Symfony State Machine Documentation:** https://symfony.com/doc/current/workflow/workflow-and-state-machine.html
- **Microsoft .NET State Machine Workflows:** https://learn.microsoft.com/en-us/dotnet/framework/windows-workflow-foundation/state-machine-workflows
- **Microsoft Power Automate State Machines:** https://learn.microsoft.com/en-us/archive/technet-wiki/54491.power-automate-state-machine-workflows
- **Workflow Engine vs State Machine:** https://workflowengine.io/blog/workflow-engine-vs-state-machine/

---

## Appendix: Quick Reference

### Event State Summary
```
DRAFT → SCHEDULED → ON_SALE → SALES_ENDED → STARTED → ENDED
                 ↘                    ↗
                  → POSTPONED → RESCHEDULED
                        ↓
                   CANCELLED (terminal)
```

### Critical Validations for Ticket Sales
```typescript
// Always check before selling a ticket
const canSellTicket = (event: Event): boolean => {
  return (
    event.status === 'ON_SALE' &&
    event.isPublished === true &&
    new Date() >= new Date(event.salesStartDate) &&
    new Date() <= new Date(event.salesEndDate) &&
    new Date(event.startDate) > new Date()
  );
};
```

### Critical Validations for Resale
```typescript
// Always check before allowing resale
const canResellTicket = (event: Event, ticket: Ticket): boolean => {
  const nonResaleStates = ['STARTED', 'ENDED', 'CANCELLED'];
  const cutoffTime = new Date(event.startDate);
  cutoffTime.setHours(cutoffTime.getHours() - 24);
  
  return (
    !nonResaleStates.includes(event.status) &&
    ticket.status !== 'USED' &&
    ticket.status !== 'CHECKED_IN' &&
    new Date() < cutoffTime &&
    event.resaleEnabled === true
  );
};
```

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**Maintained By:** TicketToken Security Team