# Data Flow Diagrams - Venue Service

## 1. Venue Creation Flow

```
┌─────────┐     ┌─────────────┐     ┌─────────────────┐     ┌────────────┐
│  User   │────►│ API Gateway │────►│  Auth Service   │────►│ JWT Valid? │
└─────────┘     └─────────────┘     └─────────────────┘     └─────┬──────┘
                                                                   │
                                                              Yes  │  No
                                                          ┌────────┴────────┐
                                                          │                 │
                                                          ▼                 ▼
                                              ┌─────────────────┐     401 Unauthorized
                                              │  Venue Service  │
                                              └────────┬────────┘
                                                       │
                        ┌──────────────────────────────┼──────────────────────────────┐
                        │                              │                              │
                        ▼                              ▼                              ▼
              ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
              │ Validate Input  │          │  Set Tenant ID  │          │ Generate Slug   │
              │ (Schema check)  │          │  (RLS context)  │          │ (unique)        │
              └────────┬────────┘          └─────────────────┘          └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐          ┌─────────────────┐
              │  PostgreSQL     │────────► │  Publish Event  │────────► RabbitMQ
              │  INSERT venue   │          │  venue.created  │
              └─────────────────┘          └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Create Default │
              │  venue_settings │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │  Return 201     │
              │  Created        │
              └─────────────────┘
```

## 2. Stripe Connect Onboarding Flow

```
┌───────────────┐                                              ┌────────────────┐
│ Venue Owner   │                                              │     Stripe     │
└───────┬───────┘                                              └────────┬───────┘
        │                                                               │
        │  1. Initiate Connect                                         │
        ▼                                                               │
┌─────────────────┐                                                     │
│  Venue Service  │                                                     │
└───────┬─────────┘                                                     │
        │                                                               │
        │  2. Create Stripe Account                                     │
        ├───────────────────────────────────────────────────────────────►
        │     POST /v1/accounts                                         │
        │                                                               │
        │  3. Account ID returned                                       │
        ◄───────────────────────────────────────────────────────────────┤
        │                                                               │
        │  4. Store account_id in venues table                          │
        │                                                               │
        │  5. Create Onboarding Link                                    │
        ├───────────────────────────────────────────────────────────────►
        │     POST /v1/account_links                                    │
        │                                                               │
        │  6. Onboarding URL returned                                   │
        ◄───────────────────────────────────────────────────────────────┤
        │                                                               │
        │  7. Return URL to venue owner                                 │
        ▼                                                               │
┌───────────────┐                                                       │
│ Venue Owner   │────────────────────────────────────────────────────────►
│ completes     │  8. Complete onboarding on Stripe                     │
│ onboarding    │                                                       │
└───────────────┘                                                       │
                                                                        │
                    9. Webhook: account.updated                         │
┌─────────────────┐ ◄───────────────────────────────────────────────────┤
│  Venue Service  │                                                     │
│  /api/webhook   │                                                     │
└───────┬─────────┘                                                     │
        │                                                               │
        │  10. Verify signature                                         │
        │  11. Check webhook_events (dedup)                             │
        │  12. Acquire distributed lock                                 │
        │  13. Update venue stripe_status                               │
        │  14. Release lock                                             │
        │  15. Mark event processed                                     │
        │                                                               │
        ▼                                                               │
┌─────────────────┐                                                     │
│  Return 200 OK  │                                                     │
└─────────────────┘                                                     │
```

## 3. Resale Transfer Validation Flow

```
┌─────────────┐     ┌─────────────────┐     ┌────────────────────────┐
│   Buyer     │────►│ Transfer Service│────►│    Venue Service       │
│  (Fan App)  │     │ (different svc) │     │ POST /api/v1/resale/   │
└─────────────┘     └─────────────────┘     │      validate          │
                                            └───────────┬────────────┘
                                                        │
              ┌─────────────────────────────────────────┤
              │                                         │
              ▼                                         ▼
    ┌─────────────────┐                    ┌─────────────────────────┐
    │ Detect          │                    │ Get Resale Policy       │
    │ Jurisdiction    │                    │ (venue + event + tenant)│
    │ (buyer location)│                    └────────────┬────────────┘
    └────────┬────────┘                                 │
             │                                          │
             ▼                                          ▼
    ┌─────────────────┐                    ┌─────────────────────────┐
    │ Get Jurisdiction│                    │ Check Transfer Count    │
    │ Price Cap Rules │                    │ (transfer_history)      │
    │ (US-CT, FR, etc)│                    └────────────┬────────────┘
    └────────┬────────┘                                 │
             │                                          │
             └──────────────────────┬───────────────────┘
                                    │
                                    ▼
                       ┌─────────────────────────┐
                       │   Validate Price        │
                       │   - jurisdiction cap    │
                       │   - venue max multiplier│
                       │   - fixed max price     │
                       └────────────┬────────────┘
                                    │
                                    ▼
                       ┌─────────────────────────┐
                       │ Check Seller Verified?  │
                       │ (seller_verifications)  │
                       └────────────┬────────────┘
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                    Allowed              Not Allowed
                          │                   │
                          ▼                   ▼
              ┌─────────────────┐  ┌─────────────────────┐
              │ Return:         │  │ Return:             │
              │ allowed: true   │  │ allowed: false      │
              │ maxPrice: $X    │  │ reason: "..."       │
              │ transferCount: N│  │ requiresVerification│
              └─────────────────┘  └─────────────────────┘
```

## 4. Webhook Processing with Distributed Locking

```
┌──────────┐     ┌─────────────────┐     ┌─────────────────────────┐
│  Stripe  │────►│  Venue Service  │────►│   WebhookService        │
│  Webhook │     │  POST /webhook  │     │   processWebhook()      │
└──────────┘     └─────────────────┘     └───────────┬─────────────┘
                                                     │
                                    ┌────────────────┴────────────────┐
                                    │                                 │
                                    ▼                                 │
                       ┌─────────────────────────┐                    │
                       │ Check webhook_events    │                    │
                       │ for event_id (dedup)    │                    │
                       └────────────┬────────────┘                    │
                                    │                                 │
                          ┌─────────┴─────────┐                       │
                     Exists               Not Found                   │
                          │                   │                       │
                          ▼                   ▼                       │
              ┌─────────────────┐  ┌─────────────────────┐            │
              │ Return 200      │  │ Acquire Redis Lock  │            │
              │ duplicate: true │  │ SET NX PX 30000     │            │
              └─────────────────┘  └────────┬────────────┘            │
                                            │                         │
                                  ┌─────────┴─────────┐               │
                             Acquired            Failed               │
                                  │                  │                │
                                  ▼                  ▼                │
                      ┌────────────────┐  ┌─────────────────┐         │
                      │ Insert/Update  │  │ Return 200      │         │
                      │ webhook_events │  │ duplicate: true │         │
                      │ status=processing                   │         │
                      └───────┬────────┘  └─────────────────┘         │
                              │                                       │
                              ▼                                       │
                      ┌────────────────┐                              │
                      │ Execute        │                              │
                      │ processor()    │                              │
                      └───────┬────────┘                              │
                              │                                       │
                    ┌─────────┴─────────┐                             │
               Success              Failed                            │
                    │                   │                             │
                    ▼                   ▼                             │
        ┌────────────────┐  ┌─────────────────────┐                   │
        │ Update status  │  │ Update status       │                   │
        │ = completed    │  │ = failed/retrying   │                   │
        │                │  │ error_message       │                   │
        └───────┬────────┘  │ retry_count++       │                   │
                │           └──────────┬──────────┘                   │
                │                      │                              │
                └──────────┬───────────┘                              │
                           │                                          │
                           ▼                                          │
                ┌─────────────────────┐                               │
                │ Release Redis Lock  │                               │
                │ DEL webhook:lock:X  │                               │
                └─────────────────────┘                               │
```

## 5. Venue Operations with Checkpointing

```
┌───────────────┐     ┌─────────────────────────┐
│ Admin Portal  │────►│ VenueOperationsService  │
│ Long-running  │     │ executeOperation()      │
│ migration     │     └───────────┬─────────────┘
└───────────────┘                 │
                                  ▼
                     ┌─────────────────────────┐
                     │ Check for existing      │
                     │ operation (409 if busy) │
                     └────────────┬────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────┐
                     │ Create venue_operations │
                     │ status: pending         │
                     └────────────┬────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────┐
                     │ Acquire distributed lock│
                     └────────────┬────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
                ▼                 ▼                 ▼
        ┌───────────┐     ┌───────────┐     ┌───────────┐
        │  Step 1   │────►│  Step 2   │────►│  Step 3   │
        │           │     │           │     │           │
        │ Checkpoint│     │ Checkpoint│     │ Checkpoint│
        └───────────┘     └───────────┘     └───────────┘
                │                 │                 │
                ▼                 ▼                 ▼
        ┌───────────────────────────────────────────┐
        │         checkpoint_data (JSONB)           │
        │ {                                         │
        │   "step1": { result: "..." },             │
        │   "step2": { result: "..." },             │
        │   "step3": { result: "..." }              │
        │ }                                         │
        └───────────────────────────────────────────┘
                                  │
                          ┌───────┴───────┐
                     Completed         Failed
                          │               │
                          ▼               ▼
              ┌─────────────────┐ ┌───────────────────┐
              │ status:completed│ │ status: failed    │
              │ Release lock    │ │ Can resume from   │
              └─────────────────┘ │ last checkpoint   │
                                  └───────────────────┘
```

## Data Stores Summary

| Store | Data Types | Access Pattern |
|-------|-----------|----------------|
| **PostgreSQL** | Venues, settings, operations, transfers | CRUD, RLS, transactions |
| **Redis** | Cache, rate limits, locks | Key-value, TTL, atomic ops |
| **MongoDB** | Content, reviews, media | Document queries, aggregations |
| **RabbitMQ** | Events | Pub/Sub, async messaging |

## Security Data Flow

```
User Request → API Gateway → JWT Verification → Tenant Extraction
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │ SET LOCAL       │
                                              │ app.tenant_id   │
                                              └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │ PostgreSQL RLS  │
                                              │ Policies Apply  │
                                              └─────────────────┘
```
