# Escalation Procedures

## Severity Levels

### P1 - Critical
**Definition**: Complete service outage or data loss risk
- All users affected
- Revenue impacting
- Security breach

**Response Time**: 15 minutes
**Escalation**: Immediate to Engineering Lead

### P2 - High
**Definition**: Major feature broken or significant degradation
- Many users affected
- Workaround may exist

**Response Time**: 1 hour
**Escalation**: After 30 minutes without resolution

### P3 - Medium
**Definition**: Minor feature broken or minor degradation
- Some users affected
- Easy workaround exists

**Response Time**: 4 hours
**Escalation**: After 2 hours without resolution

### P4 - Low
**Definition**: Cosmetic issues or minor bugs
- Few users affected
- No business impact

**Response Time**: Next business day
**Escalation**: Not required

## Escalation Matrix
```
┌─────────────────────────────────────────────────────────────┐
│                    ESCALATION PATH                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  On-Call Engineer                                           │
│       │                                                     │
│       ▼ (15 min P1, 30 min P2)                             │
│  Engineering Lead                                           │
│       │                                                     │
│       ▼ (30 min P1, 1 hr P2)                               │
│  Engineering Manager                                        │
│       │                                                     │
│       ▼ (1 hr P1)                                          │
│  VP Engineering                                             │
│       │                                                     │
│       ▼ (2 hr P1 - security/data)                          │
│  CTO                                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## When to Escalate

### Escalate Immediately (P1)

- [ ] Database is down or corrupted
- [ ] Security breach detected
- [ ] All API requests failing
- [ ] Data loss confirmed
- [ ] Payment processing broken

### Escalate After Initial Triage (P2)

- [ ] Root cause unclear after 30 minutes
- [ ] Fix requires access you don't have
- [ ] Multiple services affected
- [ ] Customer-facing degradation

### Escalate for Visibility (P3/P4)

- [ ] Pattern of recurring issues
- [ ] Requires architectural change
- [ ] Cross-team coordination needed

## How to Escalate

### 1. Update Incident Status
```bash
# In Slack incident channel
/incident escalate <incident-id> --to @eng-lead --reason "Root cause unclear"
```

### 2. Page Next Level
```bash
# PagerDuty
pd incident:escalate <incident-id> --level 2
```

### 3. Brief the Escalation Target

Provide:
- **Impact**: What's broken, who's affected
- **Timeline**: When it started, key events
- **Actions**: What you've tried
- **Ask**: What you need from them

### 4. Document

Update incident channel with:
- Escalation time
- Who was paged
- Current status

## Communication Templates

### Stakeholder Update (P1)
```
🔴 P1 INCIDENT UPDATE - Event Service

Status: INVESTIGATING
Impact: Event creation and ticket sales affected
Started: HH:MM UTC
Duration: X minutes

Current Actions:
- [Action 1]
- [Action 2]

Next Update: HH:MM UTC (30 min)
Incident Lead: @name
```

### Resolution Notice
```
✅ INCIDENT RESOLVED - Event Service

Duration: X hours Y minutes
Impact: [Summary of impact]
Root Cause: [Brief description]
Resolution: [What fixed it]

Post-mortem scheduled: [Date/Time]
```

## Post-Incident

### Within 24 Hours (P1/P2)

1. Create post-mortem document
2. Schedule review meeting
3. Identify action items

### Within 1 Week

1. Complete post-mortem review
2. Assign action items
3. Update runbooks if needed

### Post-Mortem Template

See [post-mortem-template.md](./post-mortem-template.md)
