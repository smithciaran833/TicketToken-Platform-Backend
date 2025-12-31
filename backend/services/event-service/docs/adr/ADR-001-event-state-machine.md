# ADR-001: Event State Machine

## Status

**Accepted** - December 31, 2024

## Context

Events in the TicketToken platform go through various lifecycle stages from creation to completion or cancellation. We needed a robust way to:

1. Define valid event states
2. Control which state transitions are allowed
3. Automatically trigger transitions based on time
4. Protect data integrity by preventing invalid operations based on state
5. Handle complex cancellation workflows

Previously, state management was scattered across controllers and services, leading to:
- Inconsistent state validation
- Risk of invalid transitions
- Difficulty tracking state history
- No automatic time-based transitions

## Decision

Implement a **finite state machine (FSM)** pattern for event lifecycle management.

### State Definitions

```
DRAFT → SCHEDULED → PUBLISHED → ON_SALE → SOLD_OUT → IN_PROGRESS → COMPLETED
                                    ↓
                                CANCELLED (from most states)
```

**States:**
- `DRAFT`: Initial state, event is being configured
- `SCHEDULED`: Event details finalized, awaiting publication
- `PUBLISHED`: Event visible but tickets not yet on sale
- `ON_SALE`: Tickets available for purchase
- `SOLD_OUT`: All tickets sold
- `IN_PROGRESS`: Event is currently happening
- `COMPLETED`: Event has ended
- `CANCELLED`: Event cancelled (terminal state)

### Implementation

1. **State Machine Class** (`src/services/event-state-machine.ts`)
   - Defines valid transitions as a graph
   - `canTransition(from, to)`: Check if transition is valid
   - `transition(event, targetState, context)`: Execute transition with validation
   - Emits events for each transition for audit logging

2. **Automatic Transitions** (`src/jobs/event-transitions.job.ts`)
   - Bull queue processes time-based transitions
   - Runs every minute to check for:
     - `sales_start_at` → transition to `ON_SALE`
     - `sales_end_at` → transition to appropriate state
     - `starts_at` → transition to `IN_PROGRESS`
     - `ends_at` → transition to `COMPLETED`

3. **State-Based Validation**
   - Updates blocked when event is `IN_PROGRESS` or `COMPLETED`
   - Ticket sales only allowed in `ON_SALE` or `SOLD_OUT` states
   - Cancellation blocked once event is `IN_PROGRESS`

4. **Protected Fields**
   - Certain fields require confirmation when changed after tickets sold:
     - `starts_at`, `ends_at`, `venue_id`
   - Implemented via `confirmation_required` flag

## Consequences

### Positive

- **Predictable behavior**: Clear rules for what actions are valid in each state
- **Data integrity**: Impossible to sell tickets for a cancelled event
- **Auditability**: State transitions are logged with timestamp and actor
- **Automation**: Time-based transitions happen automatically
- **Extensibility**: Easy to add new states or transitions
- **Testability**: State machine logic is isolated and unit-testable

### Negative

- **Complexity**: More code to maintain than ad-hoc checks
- **Migration**: Existing events need state backfill
- **Learning curve**: Developers must understand FSM pattern
- **Job dependency**: Automatic transitions require Bull queue to be running

### Neutral

- State is stored in the `status` column (existing field)
- Background job adds ~1 minute latency to automatic transitions
- State machine is in-memory (no external service dependency)

## Alternatives Considered

### Option 1: Simple Status Field with Ad-hoc Validation

**Pros:**
- Simple to implement
- No new dependencies

**Cons:**
- Validation logic scattered across codebase
- Easy to miss edge cases
- No automatic transitions

### Option 2: External Workflow Engine (Temporal, Camunda)

**Pros:**
- Rich workflow capabilities
- Built-in retry and compensation
- Visual workflow editor

**Cons:**
- Additional infrastructure
- Operational complexity
- Overkill for our use case

### Option 3: Database Triggers

**Pros:**
- Enforcement at database level
- No application code needed

**Cons:**
- Limited logic capabilities
- Harder to test
- Database-specific implementation

## References

- [Finite State Machine Pattern](https://en.wikipedia.org/wiki/Finite-state_machine)
- [XState (JavaScript FSM library)](https://xstate.js.org/)
- [Bull Queue Documentation](https://github.com/OptimalBits/bull)
- Event State Machine Implementation: `src/services/event-state-machine.ts`
- Transition Jobs: `src/jobs/event-transitions.job.ts`
