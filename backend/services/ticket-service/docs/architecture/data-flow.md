# Ticket Service - Data Flow

## Overview

This document describes data flow patterns in the Ticket Service, including request/response flows, event-driven flows, and blockchain synchronization.

## Request/Response Flow

### Ticket Purchase Flow

```
┌─────────┐      ┌─────────────┐      ┌──────────────┐      ┌──────────┐
│  Client │────▶│ API Gateway │────▶│Ticket Service│────▶│ Database │
└─────────┘      └─────────────┘      └──────────────┘      └──────────┘
     │                  │                    │                    │
     │   1. POST /purchase                   │                    │
     │   ─────────────────────────────────▶ │                    │
     │                  │                    │                    │
     │                  │   2. Validate JWT  │                    │
     │                  │   ◀────────────────│                    │
     │                  │                    │                    │
     │                  │                    │  3. Check inventory│
     │                  │                    │  ─────────────────▶│
     │                  │                    │  ◀─────────────────│
     │                  │                    │                    │
     │                  │                    │  4. Create ticket  │
     │                  │                    │  ─────────────────▶│
     │                  │                    │  ◀─────────────────│
     │                  │                    │                    │
     │                  │                    │  ┌────────────┐    │
     │                  │                    │──│ RabbitMQ   │    │
     │                  │                    │  │ (mint NFT) │    │
     │                  │                    │  └────────────┘    │
     │                  │                    │                    │
     │   5. Response 201                     │                    │
     │   ◀─────────────────────────────────  │                    │
```

### Check-In (QR Scan) Flow

```
┌──────────┐      ┌──────────────┐      ┌──────────┐      ┌───────────┐
│ Scanner  │────▶│Ticket Service│────▶│ Database │     │ Blockchain│
└──────────┘      └──────────────┘      └──────────┘     └───────────┘
     │                    │                    │               │
     │  1. POST /validate │                    │               │
     │  ──────────────────▶                    │               │
     │                    │                    │               │
     │                    │  2. Decrypt QR     │               │
     │                    │  (AES-256)         │               │
     │                    │                    │               │
     │                    │  3. Get ticket     │               │
     │                    │  ─────────────────▶│               │
     │                    │  ◀─────────────────│               │
     │                    │                    │               │
     │                    │  4. Verify on-chain│               │
     │                    │  ─────────────────────────────────▶│
     │                    │  ◀─────────────────────────────────│
     │                    │                    │               │
     │                    │  5. Check scans    │               │
     │                    │  ─────────────────▶│               │
     │                    │  ◀─────────────────│               │
     │                    │                    │               │
     │                    │  6. Record scan    │               │
     │                    │  ─────────────────▶│               │
     │                    │  ◀─────────────────│               │
     │                    │                    │               │
     │  7. Response       │                    │               │
     │  ◀─────────────────│                    │               │
```

## Event-Driven Flows

### Ticket Lifecycle Events

```
┌──────────────┐     ┌───────────┐     ┌──────────────┐
│Ticket Service│────▶│ RabbitMQ  │────▶│   Consumers  │
└──────────────┘     └───────────┘     └──────────────┘
                          │
                          ├── ticket.purchased ──▶ [Notification Service]
                          │                        [Analytics Service]
                          │
                          ├── ticket.transferred ─▶ [Notification Service]
                          │                        [Blockchain Service]
                          │
                          ├── ticket.checked_in ──▶ [Analytics Service]
                          │                        [Venue Service]
                          │
                          ├── ticket.revoked ─────▶ [Notification Service]
                          │                        [Payment Service (refund)]
                          │
                          └── ticket.expired ────▶ [Analytics Service]
                                                   [Inventory Service]
```

### Blockchain Synchronization

```
┌───────────┐     ┌──────────────┐     ┌───────────┐     ┌──────────┐
│ Solana    │────▶│ WebSocket    │────▶│ Event     │────▶│ Database │
│ Network   │     │ Listener     │     │ Processor │     │ Update   │
└───────────┘     └──────────────┘     └───────────┘     └──────────┘
     │                   │                   │                 │
     │  Program events   │                   │                 │
     │  ────────────────▶│                   │                 │
     │                   │                   │                 │
     │                   │  Parse logs       │                 │
     │                   │  ─────────────────▶                 │
     │                   │                   │                 │
     │                   │                   │  Update state   │
     │                   │                   │  ───────────────▶
     │                   │                   │  ◀──────────────│
     │                   │                   │                 │
     │                   │                   │  Log to         │
     │                   │                   │  blockchain_sync│
     │                   │                   │  ───────────────▶
```

## Data Stores

### PostgreSQL (Primary)

```
┌─────────────────────────────────────────────────────────┐
│                      PostgreSQL                          │
├─────────────────┬────────────────┬──────────────────────┤
│     tickets     │  ticket_scans  │ pending_transactions │
├─────────────────┼────────────────┼──────────────────────┤
│ - id            │ - id           │ - id                 │
│ - event_id      │ - ticket_id    │ - tx_signature       │
│ - user_id       │ - event_id     │ - ticket_id          │
│ - status        │ - scanned_at   │ - status             │
│ - tenant_id     │ - scanned_by   │ - submitted_at       │
│ - nft_mint      │ - tenant_id    │ - confirmed_at       │
│ - blockchain_   │                │ - confirmation_count │
│   sync_status   │                │                      │
└─────────────────┴────────────────┴──────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
        RLS Policies  Idempotency  State Transitions
        (tenant_id)      Keys       (history log)
```

### Redis (Cache & Sessions)

```
┌─────────────────────────────────────────────────────────┐
│                         Redis                            │
├─────────────────┬────────────────┬──────────────────────┤
│   Rate Limits   │  Ticket Cache  │   Circuit Breaker    │
├─────────────────┼────────────────┼──────────────────────┤
│ rate:{tenant}:  │ ticket:{id}    │ circuit:{service}    │
│   {user}:{min}  │ [JSON ticket]  │ {state, failures}    │
│                 │                │                      │
│ TTL: 1 minute   │ TTL: 5 minutes │ TTL: 30 seconds      │
└─────────────────┴────────────────┴──────────────────────┘
```

### Solana (Blockchain)

```
┌─────────────────────────────────────────────────────────┐
│                     Solana Network                       │
├─────────────────┬────────────────┬──────────────────────┤
│  Ticket NFTs    │ Transfer Log   │   Program State      │
├─────────────────┼────────────────┼──────────────────────┤
│ - mint address  │ - from         │ - config             │
│ - owner         │ - to           │ - authority          │
│ - metadata      │ - timestamp    │ - fee structure      │
│ - attributes    │ - signature    │                      │
└─────────────────┴────────────────┴──────────────────────┘
```

## Data Consistency

### Write Path

```
                    ┌───────────────────┐
                    │   API Request     │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Input Validation  │
                    │ (Zod Schema)      │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │  Idempotency      │
                    │  Check            │
                    └─────────┬─────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    ┌──────────────────┐           ┌──────────────────┐
    │ Database Write   │           │ Return Cached    │
    │ (within TX)      │           │ Response         │
    └────────┬─────────┘           └──────────────────┘
             │
             ▼
    ┌──────────────────┐
    │ Queue Message    │
    │ (async process)  │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ Return Response  │
    └──────────────────┘
```

### Read Path

```
                    ┌───────────────────┐
                    │   API Request     │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │   Cache Check     │
                    │   (Redis)         │
                    └─────────┬─────────┘
                              │
              ┌───────────────┴───────────────┐
              │ Cache Hit              Cache Miss
              ▼                               ▼
    ┌──────────────────┐           ┌──────────────────┐
    │ Return Cached    │           │ Database Read    │
    │ Response         │           │ (with RLS)       │
    └──────────────────┘           └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ Populate Cache   │
                                   └────────┬─────────┘
                                            │
                                            ▼
                                   ┌──────────────────┐
                                   │ Return Response  │
                                   └──────────────────┘
```

## Error Handling

```
┌──────────────────────────────────────────────────────────────┐
│                      Error Handling Flow                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Request ──▶ Validation Error? ──▶ Return 400               │
│      │                                                       │
│      ▼                                                       │
│   Auth Error? ──────────────────▶ Return 401/403             │
│      │                                                       │
│      ▼                                                       │
│   Business Error? ──────────────▶ Return 409/422             │
│      │                                                       │
│      ▼                                                       │
│   Rate Limited? ────────────────▶ Return 429                 │
│      │                           (+ Retry-After)             │
│      ▼                                                       │
│   Service Error? ───────────────▶ Circuit Breaker            │
│      │                           Retry w/ backoff            │
│      ▼                           Return 503 if exhausted     │
│   Success ──────────────────────▶ Return 200/201             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Related Documents

- [C4 Context](./c4-context.md) - System context diagram
- [ADR-001](../adr/ADR-001-blockchain-source-of-truth.md) - Blockchain architecture decisions
