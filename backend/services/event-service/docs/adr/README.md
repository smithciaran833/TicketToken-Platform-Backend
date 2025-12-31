# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for the Event Service.

## What is an ADR?

An Architecture Decision Record captures an important architectural decision made along with its context and consequences.

## ADR Template

Use this template when creating new ADRs:

```markdown
# ADR-NNN: Title

## Status

[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?

### Positive

- Benefit 1
- Benefit 2

### Negative

- Trade-off 1
- Trade-off 2

### Neutral

- Side effect 1

## Alternatives Considered

What other options were evaluated?

### Option 1: [Name]
- Pros
- Cons

### Option 2: [Name]
- Pros
- Cons

## References

- Link 1
- Link 2
```

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](./ADR-001-event-state-machine.md) | Event State Machine | Accepted | 2024-12-31 |

## Creating a New ADR

1. Copy the template above
2. Use the next available number: `ADR-NNN-short-title.md`
3. Fill in all sections
4. Submit a PR for review
5. Update this README's index once merged
