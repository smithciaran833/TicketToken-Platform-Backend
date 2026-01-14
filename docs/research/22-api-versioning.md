# API Versioning Strategies: Best Practices & Audit Guide

**Platform**: TicketToken (Blockchain Ticketing SaaS)  
**Stack**: Node.js/TypeScript, REST APIs  
**Date**: December 2024

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [Implementation Examples](#4-implementation-examples)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 Versioning Strategies

There are four primary approaches to API versioning, each with distinct tradeoffs. The choice depends on your API's audience, update frequency, and caching requirements.

#### URL Path Versioning

The version number is embedded directly in the URL path.

```
GET /api/v1/users/123
GET /api/v2/users/123
```

| Pros | Cons |
|------|------|
| Highly explicit and visible | Violates REST principle that URI should identify a resource |
| Easy for clients to understand | Can lead to URL proliferation |
| Works well with HTTP caching | Breaking client integration when version changes |
| Simple to implement in most frameworks | Longer URLs |

**Used by**: Facebook, Twitter, Stripe, Airbnb, Google

**Best for**: Public APIs where clarity and ease of use are paramount.

#### Header-Based Versioning

Version information is passed via HTTP headers, keeping URLs clean.

```http
GET /api/users/123
Accept: application/vnd.myapi.v2+json

# Or using custom header:
GET /api/users/123
X-API-Version: 2
```

| Pros | Cons |
|------|------|
| Clean, consistent URLs | Not visible in browser URL bar |
| Separates resource identifier from representation | Requires tooling to set headers (Postman, curl) |
| Allows per-resource versioning | More complex caching configuration |
| RESTful content negotiation | Some proxies may strip custom headers |

**Used by**: GitHub (`X-GitHub-Api-Version`), Stripe (supports both)

**Best for**: Internal APIs or APIs with sophisticated clients that can easily set headers.

#### Query Parameter Versioning

Version is specified as a query parameter.

```
GET /api/users/123?version=2
GET /api/users/123?v=2
```

| Pros | Cons |
|------|------|
| Simple to implement | Can clutter URLs |
| Easy to default to latest if omitted | Query parameters can be overlooked |
| Works with existing routing | May cause caching issues |
| Quick for testing/trials | Less explicit than URL path |

**Used by**: Facebook Graph API (supports both), Amazon AWS

**Best for**: Quick trials, optional overrides, or adding versioning to existing APIs.

#### Content Negotiation (Media Type Versioning)

Uses the `Accept` header with vendor-specific media types.

```http
GET /api/users/123
Accept: application/vnd.myapi.v2+json
```

| Pros | Cons |
|------|------|
| Most RESTful approach | Complex to implement |
| Granular per-resource versioning | Difficult to test in browser |
| Smaller code footprint | Can confuse developers unfamiliar with media types |
| No URI routing rules needed | |

**Best for**: APIs requiring fine-grained control over individual resource representations.

#### Date-Based Versioning (Stripe-Style)

Uses dates instead of sequential version numbers.

```http
GET /api/users/123
Stripe-Version: 2024-10-01
```

| Pros | Cons |
|------|------|
| Communicates "API epoch" clearly | Policy discipline needed |
| Enables per-account pinning | Not always obvious which date maps to which features |
| Avoids proliferating /v42, /v43, etc. | |

**Used by**: Stripe, Twilio

**Best for**: APIs with frequent incremental changes where you want to pin clients to specific behavior sets.

#### Strategy Comparison Summary

| Strategy | Visibility | Caching | Implementation | REST Compliance |
|----------|------------|---------|----------------|-----------------|
| URL Path | ⭐⭐⭐ High | ⭐⭐⭐ Easy | ⭐⭐⭐ Simple | ⭐ Low |
| Header | ⭐ Low | ⭐ Complex | ⭐⭐ Medium | ⭐⭐⭐ High |
| Query Param | ⭐⭐ Medium | ⭐⭐ Medium | ⭐⭐⭐ Simple | ⭐⭐ Medium |
| Media Type | ⭐ Low | ⭐ Complex | ⭐ Complex | ⭐⭐⭐ High |

**Recommendation**: URL path versioning with major versions only (v1, v2) combined with clear deprecation policies offers the best balance of simplicity and flexibility for most APIs.

---

### 1.2 Deprecation Policies

Deprecation is the process of phasing out API functionality. It typically occurs in two stages:

1. **Deprecation**: API is not the preferred/recommended version but still works
2. **Sunset**: API becomes unresponsive and is fully decommissioned

#### Industry Standards: HTTP Headers

**RFC 8594 - Sunset Header**: Indicates when a resource will become unresponsive.

```http
Sunset: Sat, 31 Dec 2024 23:59:59 GMT
```

**RFC 9745 - Deprecation Header**: Indicates deprecation status and date.

```http
Deprecation: @1688169599
# Or boolean:
Deprecation: true
```

**Combined Example** (per RFC guidance):

```http
HTTP/1.1 200 OK
Deprecation: @1688169599
Sunset: Sun, 30 Jun 2024 23:59:59 UTC
Link: </api/v2/users>; rel="successor-version"
Link: <https://docs.example.com/migration>; rel="deprecation"; type="text/html"
```

#### Deprecation Timeline Best Practices

| Company | Deprecation Notice Period | Notes |
|---------|---------------------------|-------|
| Twilio | 12 months minimum | Full year's notice before deprecating any API version |
| Salesforce | Minimum 3 releases (~9 months) | Supported versions back to Spring 2014 |
| Google | Varies by API | Typically 1 year for major versions |
| GitHub | 6-12 months | Uses both Deprecation and Sunset headers |

**Recommended Minimum Timeline**:

```
Announcement          Migration Period          Sunset
     |                      |                     |
     |   6-12 months        |    3-6 months       |
     |<-------------------->|<------------------->|
     
Day 0: Announce deprecation, add Deprecation header
Day 180: Add Sunset header with date
Day 365: Sunset - API returns 410 Gone
```

#### Deprecation Response Headers Implementation

```javascript
// Express.js middleware for deprecated endpoints
const deprecationMiddleware = (sunsetDate, successorUrl) => {
  return (req, res, next) => {
    // RFC 9745 Deprecation header (Unix timestamp)
    res.set('Deprecation', '@' + Math.floor(Date.now() / 1000));
    
    // RFC 8594 Sunset header
    res.set('Sunset', new Date(sunsetDate).toUTCString());
    
    // Link to successor and documentation
    res.set('Link', [
      `<${successorUrl}>; rel="successor-version"`,
      `</docs/migration>; rel="deprecation"; type="text/html"`
    ].join(', '));
    
    next();
  };
};

// Apply to deprecated routes
app.use('/api/v1/*', deprecationMiddleware(
  '2025-06-30',
  '/api/v2'
));
```

#### What to Include in Deprecation Notices

1. **What**: Specific endpoints, fields, or entire version being deprecated
2. **Why**: Reason for deprecation (security, performance, better alternative)
3. **When**: Clear timeline with specific dates
4. **How**: Migration guide with code examples
5. **Where**: Link to successor version or alternative

---

### 1.3 Backwards Compatibility

Backwards compatibility ensures that existing clients continue to work when the API is updated. This is the foundation of API stability and user trust.

> "APIs are forever." — Werner Vogels, Amazon CTO

#### The Hippocratic Oath of API Design

**"First, do no harm."** Once an API is released and consumers depend on it, breaking that promise can mean losing customers.

#### Three Types of Compatibility

| Type | Definition | Concern |
|------|------------|---------|
| **Source Compatibility** | Code compiles against newer version | SDK/client library changes |
| **Binary Compatibility** | Compiled code runs against newer version | Runtime behavior |
| **Wire Compatibility** | Messages serialize/deserialize correctly | API request/response format |

#### Rules for Maintaining Backwards Compatibility

1. **Never remove existing functionality without versioning**
2. **Never change the meaning of existing fields**
3. **New features must be optional** (cannot add required parameters)
4. **Maintain stable response structures**
5. **Provide default values for new required fields**

#### Strategies for Backwards-Compatible Changes

| Instead of... | Do this... |
|---------------|------------|
| Removing a field | Mark as deprecated, return null/empty |
| Renaming a field | Add new field, keep old field (dual-write) |
| Changing field type | Add new field with new type |
| Making optional field required | Keep optional, validate on new endpoints |
| Removing an endpoint | Deprecate, add sunset date, redirect |

#### Google's Compatibility Guidelines (AIP-180)

From Google's API Improvement Proposals:

- Existing fields must not be moved into or out of a `oneof`
- Existing fields must not have their type changed (even if wire-compatible)
- Resource names must never change across major versions
- String field length changes should be treated as incompatible
- Field format changes (even for opaque strings) are breaking

---

### 1.4 Breaking vs Non-Breaking Changes

Understanding what constitutes a breaking change is critical for versioning decisions.

#### Breaking Changes (Require Version Bump)

| Category | Examples |
|----------|----------|
| **Endpoint Changes** | Removing an endpoint, changing HTTP method, changing URL structure |
| **Field Removal** | Removing a response field, removing a request parameter |
| **Type Changes** | Changing field type (string → integer), changing enum values |
| **Behavior Changes** | Changing validation rules, changing error codes, changing default values |
| **Authentication** | Changing auth method, adding required scopes |
| **Semantic Changes** | Changing what a field means (even if type is same) |

#### Non-Breaking Changes (Safe Without Version Bump)

| Category | Examples |
|----------|----------|
| **Additions** | New endpoints, new optional fields, new optional parameters |
| **Relaxations** | Making required field optional, accepting additional input formats |
| **Documentation** | Clarifying descriptions, adding examples |
| **Performance** | Faster response times, better error messages |
| **Cosmetic** | Changing order of fields in response (if clients don't depend on order) |

#### Real-World Examples

**Breaking Change - Field Rename**:
```json
// v1 Response
{ "emailAddress": "user@example.com" }

// v2 Response (BREAKING - clients expecting emailAddress will fail)
{ "email": "user@example.com" }
```

**Non-Breaking Change - Add Optional Field**:
```json
// v1 Response
{ "email": "user@example.com" }

// v1.1 Response (safe - old clients ignore new field)
{ "email": "user@example.com", "phoneNumber": "+1234567890" }
```

**Breaking Change - Required Parameter**:
```javascript
// v1: POST /users { "name": "John" }
// v2: POST /users { "name": "John", "email": "john@example.com" } // BREAKING
```

#### Semantic Versioning for APIs

While SemVer (MAJOR.MINOR.PATCH) was designed for libraries, it can guide API versioning:

| Version Part | When to Increment | API Context |
|--------------|-------------------|-------------|
| **MAJOR** (X.0.0) | Breaking changes | New API version (v1 → v2) |
| **MINOR** (0.X.0) | Backwards-compatible features | New optional endpoints/fields |
| **PATCH** (0.0.X) | Bug fixes | Bug fixes, documentation updates |

**Note**: For public APIs, typically only MAJOR version is exposed to clients (v1, v2), with MINOR and PATCH tracked internally.

---

### 1.5 API Lifecycle Management

API lifecycle management covers the entire lifespan of an API, from conception to retirement.

#### Lifecycle Stages

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   PLAN &    │────▶│   DEVELOP   │────▶│    TEST     │
│   DESIGN    │     │   & BUILD   │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   RETIRE    │◀────│   MONITOR   │◀────│   DEPLOY    │
│ (Deprecate) │     │  & VERSION  │     │  & PUBLISH  │
└─────────────┘     └─────────────┘     └─────────────┘
```

#### Stage Details

| Stage | Activities | Deliverables |
|-------|------------|--------------|
| **Plan & Design** | Requirements gathering, API design, OpenAPI spec | API specification, data models |
| **Develop & Build** | Implementation, documentation, code reviews | Working endpoints, developer docs |
| **Test** | Functional, security, performance, contract testing | Test reports, validated API |
| **Deploy & Publish** | Deployment, API gateway config, developer portal | Live API, published documentation |
| **Monitor & Version** | Usage analytics, performance monitoring, versioning | Metrics, version updates |
| **Retire** | Deprecation notices, sunset planning, migration support | Migration guides, sunset dates |

#### Versioning Within the Lifecycle

**When to Create New Version**:
- Breaking changes are necessary
- Major feature additions that change API paradigm
- Security vulnerabilities requiring incompatible fixes
- Compliance/regulatory requirements

**When NOT to Create New Version**:
- Adding new optional endpoints
- Adding new optional fields
- Performance improvements
- Bug fixes (unless fix is breaking)
- Documentation updates

#### API Governance Best Practices

1. **Establish API Design Guidelines**: Consistent naming, error formats, authentication
2. **Version Control API Specifications**: Store OpenAPI specs in git
3. **Automated Testing**: Contract tests, backwards compatibility checks
4. **Approval Gates**: Review process before publishing changes
5. **Usage Monitoring**: Track which versions are being used
6. **Clear Ownership**: Designated owners for each API

---

### 1.6 Communicating Changes to Clients

Effective communication is as important as technical implementation. Poor communication is a leading cause of integration failures.

#### Communication Channels

| Channel | Use Case | Timing |
|---------|----------|--------|
| **HTTP Headers** | Real-time deprecation signals | Every response |
| **Changelog** | Detailed change history | With each release |
| **Email** | Major announcements | Key milestones |
| **Developer Portal** | Comprehensive documentation | Continuous |
| **API Response** | In-band notifications | As needed |
| **Social Media** | Broad announcements | Major releases |
| **SDKs/Libraries** | Logged warnings | At runtime |

#### Changelog Best Practices

A well-structured changelog should include:

```markdown
## API Changelog

### 2024-12-01 - Version 2.1.0

#### Added
- New `GET /api/v2/events/{id}/attendees` endpoint
- Optional `metadata` field in ticket response

#### Changed
- Improved error messages for validation failures

#### Deprecated
- `GET /api/v1/users` - Use v2 endpoint instead
  - Sunset date: 2025-06-30
  - Migration guide: /docs/migration/users-v2

#### Fixed
- Fixed pagination returning incorrect total count
```

#### Email Notification Templates

**Initial Deprecation Notice**:

```
Subject: [Action Required] API v1 Deprecation Notice

Dear API Developer,

We're writing to inform you about an upcoming change to our API.

WHAT'S CHANGING:
API v1 will be deprecated on [DATE].

WHY:
[Brief explanation of improvements in v2]

TIMELINE:
- [DATE]: v2 available (now)
- [DATE + 6 months]: v1 deprecated, sunset header added
- [DATE + 12 months]: v1 sunset, returns 410 Gone

WHAT YOU NEED TO DO:
1. Review migration guide: [LINK]
2. Update your integration to use v2
3. Test in sandbox environment: [LINK]

NEED HELP?
- Migration guide: [LINK]
- API documentation: [LINK]
- Support: [EMAIL]

Thank you for building with us.
```

#### In-API Deprecation Warning

Include deprecation info in API responses:

```json
{
  "data": { ... },
  "meta": {
    "deprecation": {
      "warning": "This endpoint is deprecated and will be removed on 2025-06-30",
      "successor": "/api/v2/users",
      "documentation": "https://docs.example.com/migration"
    }
  }
}
```

#### Developer Portal Requirements

Your developer portal should include:

1. **Version Selector**: Easy switching between version docs
2. **Changelog**: Detailed history with dates
3. **Migration Guides**: Step-by-step upgrade instructions
4. **Version Status**: Clear indicators (Current, Deprecated, Sunset)
5. **Sandbox Environment**: Test new versions before migrating
6. **Support Channels**: How to get help

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 No Versioning Strategy

**The Problem**: Launching an API without any versioning scheme, then scrambling when changes are needed.

**Symptoms**:
- Ad-hoc breaking changes
- No clear path for evolution
- Client integrations break unexpectedly
- Inability to innovate without disruption

**Real-World Impact**:
- Client applications malfunction without warning
- Lost revenue during outages
- Damaged developer trust and relationships
- Technical debt accumulates rapidly

**Statistics**: According to industry research, unplanned API changes cause service outages and can lead to direct revenue loss for both providers and consumers.

**Prevention**:
```javascript
// Start with versioning from day one
// Even if you think you won't need it

// Good: Version in URL from the start
app.use('/api/v1', v1Routes);

// Bad: No version
app.use('/api', routes); // Will cause problems later
```

**Recommendation**: Choose a versioning strategy before your first release. URL path versioning is simplest for most teams.

---

### 2.2 Breaking Changes Without Version Bump

**The Problem**: Making breaking changes to an existing version instead of creating a new version.

**Common Scenarios**:
- Renaming fields "because the new name is clearer"
- Adding required parameters to existing endpoints
- Changing response structure "for consistency"
- Removing "unused" fields (that are actually used)

**Real-World Example**:

```javascript
// Original API (v1)
GET /api/v1/users/123
Response: { "user_name": "john_doe", "email": "john@example.com" }

// "Small fix" deployed to production (BREAKING!)
GET /api/v1/users/123
Response: { "username": "john_doe", "email": "john@example.com" }
// All clients expecting "user_name" now fail
```

**Prevention**:
1. **Automated contract testing**: Detect breaking changes in CI/CD
2. **API specification diffing**: Compare OpenAPI specs between versions
3. **Breaking change checklist**: Review before any deployment
4. **Immutable versions**: Once released, a version's contract doesn't change

**Tools for Detection**:
- OpenAPI-diff
- Spectral (linting)
- Optic (API change detection)
- Contract testing (Pact)

---

### 2.3 No Deprecation Warnings

**The Problem**: Removing or changing API features without advance notice.

**Impact**:
- Clients break without warning
- No time to plan migration
- Support burden increases dramatically
- Developer trust erodes

**Anti-Pattern**:
```
Monday: API v1 works fine
Tuesday: API v1 returns 404 - removed without notice
Wednesday: Angry support tickets flood in
```

**Proper Pattern**:
```
Month 1: Announce deprecation, add Deprecation header
Month 3: Add Sunset header with date
Month 6: Send reminder emails
Month 9: Final warning, API still works
Month 12: Sunset - API returns 410 Gone with migration info
```

**Prevention**:
```javascript
// Always add deprecation headers before removing anything
app.get('/api/v1/legacy-endpoint', (req, res) => {
  res.set({
    'Deprecation': 'true',
    'Sunset': 'Sat, 30 Jun 2025 23:59:59 GMT',
    'Link': '</api/v2/new-endpoint>; rel="successor-version"'
  });
  
  // Include warning in response body too
  res.json({
    data: result,
    _warning: 'This endpoint is deprecated. Migrate to /api/v2/new-endpoint by 2025-06-30'
  });
});
```

---

### 2.4 Supporting Too Many Old Versions

**The Problem**: Maintaining multiple API versions indefinitely creates unsustainable overhead.

**Symptoms**:
- Engineering resources spread thin
- Security patches must be applied to many versions
- Bug fixes multiplied across versions
- Documentation becomes confusing
- Testing matrix explodes

**Real-World Example**: Salesforce releases 3 API versions per year and supported versions back to 2014 (v30 through v51). This is exceptional and requires significant resources.

**The Cost**:
- Each active version requires maintenance, testing, documentation
- Security vulnerabilities must be patched across all versions
- Feature parity decisions become complex
- Team cognitive load increases

**Recommended Approach**:

```
Active Versions Policy:
- Current: v3 (latest)
- Supported: v2 (previous)
- Deprecated: v1 (sunset in 6 months)
- Sunset: v0 (no longer available)

Maximum supported versions: N and N-1
Deprecation window: 12 months
```

**Version Retirement Strategy**:
1. Track usage of each version (analytics)
2. Identify customers still on old versions
3. Proactive outreach before deprecation
4. Provide migration support
5. Set firm sunset dates

---

### 2.5 Inconsistent Versioning Across Services

**The Problem**: In microservices architectures, different teams using different versioning strategies creates chaos.

**Symptoms**:
- `/api/v1/users` but `/services/orders/2.0/`
- Some services use headers, others use URL
- Different error response formats per version
- No unified deprecation policy
- Clients must learn multiple versioning schemes

**Impact**:
- Developer confusion and frustration
- Integration complexity multiplied
- Impossible to coordinate deprecations
- Documentation inconsistency

**Example of Inconsistency**:
```
Service A: GET /api/v1/users
Service B: GET /orders?version=2
Service C: GET /payments (X-API-Version: 3)
Service D: GET /v2.1.3/shipping

// Client must implement 4 different versioning strategies!
```

**Prevention - Establish Organization-Wide Standards**:

```yaml
# API Versioning Standard (company-wide)

versioning:
  strategy: url-path
  format: /api/v{major}/{resource}
  examples:
    - /api/v1/users
    - /api/v2/orders
    
deprecation:
  minimum_notice: 12 months
  headers_required:
    - Deprecation
    - Sunset
    - Link (successor-version)
    
error_format:
  standard: RFC 7807 (Problem Details)
  
documentation:
  tool: OpenAPI 3.x
  location: /api/v{version}/openapi.json
```

**Governance**:
- API design review board
- Shared tooling and templates
- Automated compliance checking
- Regular cross-team syncs

---

## 3. Audit Checklist

### 3.1 Versioning Strategy Checklist

#### Strategy Selection
- [ ] **Versioning strategy chosen and documented** (URL path, header, query, or media type)
- [ ] **Consistent strategy across all APIs** in the organization
- [ ] **Version format defined** (v1, v2 or date-based like 2024-01-01)
- [ ] **Default version behavior documented** (what happens if no version specified?)

#### Implementation
- [ ] **All endpoints include version** in chosen location
- [ ] **Version routing implemented** correctly in API gateway/framework
- [ ] **Version visible in API documentation** (OpenAPI spec)
- [ ] **Version included in SDK/client libraries**

#### Version Management
- [ ] **Current version clearly identified** in documentation
- [ ] **Supported versions listed** with support timelines
- [ ] **Version discovery endpoint available** (`GET /api/versions`)
- [ ] **Version tracked in monitoring/analytics**

```javascript
// Example: Version discovery endpoint
GET /api/versions
{
  "versions": {
    "v1": { "status": "deprecated", "sunset": "2025-06-30" },
    "v2": { "status": "current" },
    "v3": { "status": "beta" }
  },
  "latest": "v2",
  "documentation": "https://docs.example.com/api"
}
```

---

### 3.2 Deprecation Process Checklist

#### Policy Definition
- [ ] **Deprecation policy documented** and published
- [ ] **Minimum deprecation notice period defined** (recommended: 12 months)
- [ ] **Sunset timeline defined** (time between deprecation and removal)
- [ ] **Communication channels identified** (email, headers, portal)

#### Implementation
- [ ] **RFC 9745 Deprecation header implemented** on deprecated endpoints
- [ ] **RFC 8594 Sunset header implemented** with specific date
- [ ] **Link header points to successor** version/documentation
- [ ] **Deprecation warnings included** in response body

```http
# Required headers for deprecated endpoints
Deprecation: @1735689599
Sunset: Wed, 31 Dec 2025 23:59:59 GMT
Link: </api/v2/users>; rel="successor-version"
Link: </docs/migration/v2>; rel="deprecation"; type="text/html"
```

#### Communication
- [ ] **Changelog updated** with deprecation notice
- [ ] **Email sent to affected developers** (multiple reminders)
- [ ] **Developer portal updated** with deprecation status
- [ ] **Migration guide created** with code examples
- [ ] **Sandbox environment available** for testing new version

#### Monitoring
- [ ] **Usage tracked for deprecated endpoints** to identify stragglers
- [ ] **Alerts configured** for high usage of deprecated endpoints near sunset
- [ ] **Individual client outreach** for major consumers on deprecated versions

---

### 3.3 Backwards Compatibility Checklist

#### Design Principles
- [ ] **New fields are optional** (never add required fields to existing endpoints)
- [ ] **Fields are never removed** without version bump
- [ ] **Field types are never changed** without version bump
- [ ] **Field semantics are never changed** (meaning stays consistent)
- [ ] **Default values provided** for new optional fields

#### Testing
- [ ] **Contract tests implemented** (e.g., Pact)
- [ ] **Backwards compatibility tests run in CI/CD**
- [ ] **API specification diffing** to detect breaking changes
- [ ] **Consumer-driven contracts** validated before deployment

```yaml
# CI/CD Pipeline Check
- name: Check API Compatibility
  run: |
    openapi-diff previous-spec.yaml current-spec.yaml
    pact-verifier --provider-version=$VERSION
```

#### Response Format Stability
- [ ] **Error format consistent** (recommend RFC 7807)
- [ ] **Pagination format consistent** across endpoints
- [ ] **Date/time format consistent** (ISO 8601)
- [ ] **Null handling documented** and consistent

---

### 3.4 Breaking Change Management Checklist

#### Identification
- [ ] **Breaking change definition documented** (what counts as breaking)
- [ ] **Change review process established** (who decides if change is breaking)
- [ ] **Automated detection tools configured** (spectral, openapi-diff)

#### When Breaking Change is Necessary
- [ ] **New major version created** (never break existing version)
- [ ] **Both versions deployed** simultaneously
- [ ] **Migration guide written** with before/after examples
- [ ] **SDK updated** with new version support
- [ ] **Deprecation timeline announced** for old version

#### Common Breaking Changes Checklist

| Change Type | Breaking? | Action Required |
|-------------|-----------|-----------------|
| Remove endpoint | ✅ Yes | New version required |
| Remove field | ✅ Yes | New version required |
| Add required parameter | ✅ Yes | New version required |
| Change field type | ✅ Yes | New version required |
| Rename field | ✅ Yes | New version required |
| Change error codes | ✅ Yes | New version required |
| Add optional field | ❌ No | Document in changelog |
| Add new endpoint | ❌ No | Document in changelog |
| Improve performance | ❌ No | Document in changelog |

---

### 3.5 API Lifecycle Checklist

#### Design Phase
- [ ] **API versioning strategy included** in initial design
- [ ] **OpenAPI specification created** before implementation
- [ ] **API design review conducted** by team/architect
- [ ] **Backwards compatibility strategy documented**

#### Development Phase
- [ ] **Version routing implemented** correctly
- [ ] **Deprecation middleware available** for future use
- [ ] **Logging includes version information**
- [ ] **Health checks are version-aware**

#### Deployment Phase
- [ ] **Version deployed to API gateway** correctly
- [ ] **Documentation published** to developer portal
- [ ] **Changelog updated** with new version info
- [ ] **Monitoring configured** per version

#### Maintenance Phase
- [ ] **Usage analytics tracked** per version
- [ ] **Security patches applied** to all active versions
- [ ] **Bug fixes applied** according to version support policy
- [ ] **Deprecation reviews conducted** quarterly

#### Retirement Phase
- [ ] **Deprecation announcement made** (12+ months in advance)
- [ ] **Migration support provided** to affected clients
- [ ] **Sunset date communicated** clearly
- [ ] **Post-sunset handling configured** (410 Gone with migration info)

---

### 3.6 Communication Checklist

#### Documentation
- [ ] **API versioning documented** in developer guide
- [ ] **Changelog maintained** and easily accessible
- [ ] **Migration guides available** for each version upgrade
- [ ] **Version lifecycle clearly displayed** (current, deprecated, sunset)

#### Notifications
- [ ] **Email list for API announcements** maintained
- [ ] **Multiple notification channels** used (email, portal, social)
- [ ] **Notification timeline established** (when to send reminders)

```
Notification Timeline:
- Day 0: Initial deprecation announcement
- Month 3: First reminder
- Month 6: Second reminder, sunset date confirmed
- Month 9: Final warning
- Month 11: Last call
- Month 12: Sunset
```

#### Developer Experience
- [ ] **Sandbox environment** for testing new versions
- [ ] **SDK/client libraries** support multiple versions
- [ ] **Error messages helpful** and include migration guidance
- [ ] **Support channels available** for migration assistance

---

### 3.7 Microservices Consistency Checklist

#### Organization-Wide Standards
- [ ] **Single versioning strategy** adopted across all services
- [ ] **Shared API guidelines document** maintained
- [ ] **Standard error format** (RFC 7807) used by all services
- [ ] **Consistent deprecation policy** across all teams

#### Implementation
- [ ] **Shared libraries/middleware** for versioning
- [ ] **API gateway handles version routing** centrally
- [ ] **Contract testing between services** implemented
- [ ] **Schema registry** used for data contracts (if applicable)

#### Governance
- [ ] **API review board** or design authority established
- [ ] **Automated compliance checking** in CI/CD
- [ ] **Cross-team coordination** for deprecation timelines
- [ ] **Centralized API catalog** with version information

---

## 4. Implementation Examples

### 4.1 Express.js Version Routing

```javascript
const express = require('express');
const app = express();

// Version middleware
const versionRouter = express.Router();

// V1 routes
const v1Router = require('./routes/v1');
app.use('/api/v1', v1Router);

// V2 routes
const v2Router = require('./routes/v2');
app.use('/api/v2', v2Router);

// Version discovery endpoint
app.get('/api/versions', (req, res) => {
  res.json({
    versions: {
      v1: { 
        status: 'deprecated', 
        sunset: '2025-06-30',
        documentation: '/docs/v1'
      },
      v2: { 
        status: 'current',
        documentation: '/docs/v2'
      }
    },
    latest: 'v2'
  });
});

// Default to latest version (optional)
app.use('/api', (req, res, next) => {
  res.redirect(307, `/api/v2${req.path}`);
});
```

### 4.2 Deprecation Middleware

```javascript
const deprecationMiddleware = (config) => {
  return (req, res, next) => {
    const { sunsetDate, successorUrl, migrationDoc, message } = config;
    
    // RFC 9745 Deprecation header
    res.set('Deprecation', 'true');
    
    // RFC 8594 Sunset header
    if (sunsetDate) {
      res.set('Sunset', new Date(sunsetDate).toUTCString());
    }
    
    // Link headers
    const links = [];
    if (successorUrl) {
      links.push(`<${successorUrl}>; rel="successor-version"`);
    }
    if (migrationDoc) {
      links.push(`<${migrationDoc}>; rel="deprecation"; type="text/html"`);
    }
    if (links.length) {
      res.set('Link', links.join(', '));
    }
    
    // Optional: Log deprecated endpoint usage
    console.warn(`Deprecated endpoint accessed: ${req.method} ${req.path}`);
    
    // Store warning for response body
    res.locals.deprecationWarning = {
      warning: message || 'This endpoint is deprecated',
      sunset: sunsetDate,
      successor: successorUrl,
      documentation: migrationDoc
    };
    
    next();
  };
};

// Usage
app.use('/api/v1/*', deprecationMiddleware({
  sunsetDate: '2025-06-30',
  successorUrl: '/api/v2',
  migrationDoc: 'https://docs.example.com/migration-v2',
  message: 'API v1 is deprecated. Please migrate to v2 before June 30, 2025.'
}));
```

### 4.3 OpenAPI Specification with Deprecation

```yaml
openapi: 3.0.3
info:
  title: TicketToken API
  version: '2.0.0'
  description: |
    ## API Versioning
    This API uses URL path versioning. Current version: v2
    
    ## Deprecated Versions
    - v1: Deprecated, sunset June 30, 2025

paths:
  /api/v2/events:
    get:
      summary: List events
      responses:
        '200':
          description: Successful response
          
  /api/v1/events:
    get:
      summary: List events (DEPRECATED)
      deprecated: true
      description: |
        **DEPRECATED**: This endpoint will be removed on 2025-06-30.
        Use `/api/v2/events` instead.
        See [Migration Guide](/docs/migration-v2)
      responses:
        '200':
          description: Successful response
          headers:
            Deprecation:
              schema:
                type: string
              example: 'true'
            Sunset:
              schema:
                type: string
              example: 'Mon, 30 Jun 2025 23:59:59 GMT'
```

### 4.4 Contract Testing Example (Pact)

```javascript
// consumer.pact.spec.js
const { Pact } = require('@pact-foundation/pact');

describe('User API Contract', () => {
  const provider = new Pact({
    consumer: 'WebApp',
    provider: 'UserService',
    port: 1234
  });

  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());

  it('should return user by ID', async () => {
    await provider.addInteraction({
      state: 'user 123 exists',
      uponReceiving: 'a request for user 123',
      withRequest: {
        method: 'GET',
        path: '/api/v2/users/123',
        headers: { 'Accept': 'application/json' }
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: '123',
          email: Matchers.email(),
          name: Matchers.string('John Doe'),
          createdAt: Matchers.iso8601DateTime()
        }
      }
    });

    // Test your client against mock
    const response = await userClient.getUser('123');
    expect(response.id).toBe('123');
  });
});
```

---

## 5. Sources

### Official Standards & RFCs

1. **RFC 8594 - The Sunset HTTP Header Field**  
   https://www.rfc-editor.org/rfc/rfc8594.html

2. **RFC 9745 - The Deprecation HTTP Response Header Field**  
   https://www.rfc-editor.org/rfc/rfc9745.html

3. **Google AIP-180 - Backwards Compatibility**  
   https://cloud.google.com/apis/design/compatibility

### Versioning Strategies & Best Practices

4. **Postman - What is API Versioning?**  
   https://www.postman.com/api-platform/api-versioning/

5. **Ambassador - API Versioning Best Practices**  
   https://www.getambassador.io/blog/api-versioning-best-practices

6. **xMatters - API Versioning Strategies**  
   https://www.xmatters.com/blog/api-versioning-strategies

7. **API7.ai - Versioning in APIs Best Practices**  
   https://api7.ai/learning-center/api-101/api-versioning

8. **REST API Tutorial - API Versioning**  
   https://restfulapi.net/versioning/

9. **Zuplo - API Backwards Compatibility Best Practices**  
   https://zuplo.com/learning-center/api-versioning-backward-compatibility-best-practices

10. **APIs You Won't Hate - API Versioning Has No "Right Way"**  
    https://apisyouwonthate.com/blog/api-versioning-has-no-right-way/

### Deprecation & Communication

11. **Treblle - Best Practices for Deprecating an API**  
    https://treblle.com/blog/best-practices-deprecating-api

12. **Treblle - API Version Changes Communication Guide**  
    https://blog.treblle.com/10-steps-how-to-guide-to-communicate-api-version-changes/

13. **Stoplight - Deprecating API Endpoints**  
    https://blog.stoplight.io/deprecating-api-endpoints

14. **Zuplo - HTTP Deprecation Header**  
    https://zuplo.com/blog/2024/10/25/http-deprecation-header

15. **Zalando RESTful API Guidelines - Deprecation**  
    https://github.com/zalando/restful-api-guidelines/blob/main/chapters/deprecation.adoc

16. **Axway - API Lifecycle Management: Deprecation and Sunsetting**  
    https://blog.axway.com/learning-center/apis/api-management/api-lifecycle-management-deprecation-and-sunsetting

### Breaking Changes & Compatibility

17. **InfoQ - Beyond API Compatibility: Understanding Breaking Changes**  
    https://www.infoq.com/articles/breaking-changes-are-broken-semver/

18. **Container Solutions - API Versioning: What Is It and Why Is It So Hard?**  
    https://blog.container-solutions.com/api-versioning-what-is-it-why-so-hard

19. **Middesk - API Changes (Breaking vs Non-Breaking)**  
    https://docs.middesk.com/reference/api-changes

20. **Nordic APIs - How to Manage Breaking Changes**  
    https://nordicapis.com/how-to-manage-breaking-changes-throughout-an-apis-lifecycle/

21. **LinkedIn - How to Handle Breaking Changes in Your API**  
    https://www.linkedin.com/advice/0/how-do-you-handle-breaking-changes-your-api-without

### API Lifecycle Management

22. **Postman - API Lifecycle**  
    https://www.postman.com/api-platform/api-lifecycle/

23. **Moesif - Mastering the API Lifecycle**  
    https://www.moesif.com/blog/technical/api-development/Mastering-API-Lifecycle/

24. **Boomi - Best Practices for API Lifecycle Management**  
    https://boomi.com/blog/best-prices-api-lifecycle-management/

25. **TechTarget - API Lifecycle Management Definition**  
    https://www.techtarget.com/searchapparchitecture/definition/API-lifecycle-management

26. **Document360 - API Lifecycle Management**  
    https://document360.com/blog/api-lifecycle-management/

### Microservices & Consistency

27. **Microsoft - Microservice APIs and Contracts**  
    https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/maintain-microservice-apis

28. **DreamFactory - Ultimate Guide to Microservices API Versioning**  
    https://blog.dreamfactory.com/ultimate-guide-to-microservices-api-versioning

29. **OpsLevel - Microservices Versioning Best Practices**  
    https://www.opslevel.com/resources/the-ultimate-guide-to-microservices-versioning-best-practices

30. **TechTarget - Microservices Versioning Techniques**  
    https://www.techtarget.com/searchapparchitecture/tip/Get-to-know-4-microservices-versioning-techniques

31. **DZone - API Versioning in Microservices Architecture**  
    https://dzone.com/articles/api-versioning-in-microservices-architecture

### Communication & Changelogs

32. **Nordic APIs - Methods to Communicate API Change Effectively**  
    https://nordicapis.com/methods-to-communicate-api-change-effectively/

33. **Redocly - What to Do When Your API Changes**  
    https://redocly.com/blog/communicate-api-changes

34. **Theneo - Managing API Changes: Strategies for Developers**  
    https://www.theneo.io/blog/managing-api-changes-strategies

35. **Lonti - Managing API Changes in Versioned APIs**  
    https://www.lonti.com/blog/managing-api-changes-and-breaking-changes-in-versioned-apis

---

## Quick Reference Card

### Versioning Strategy Decision Tree

```
Is your API public-facing?
├── YES → Use URL Path Versioning (/api/v1/)
│         └── Clearest for external developers
└── NO (Internal only)
    ├── Need per-resource versioning? → Header/Media Type
    └── Simple versioning OK? → URL Path or Query Param
```

### Deprecation Timeline Template

| Milestone | Timing | Actions |
|-----------|--------|---------|
| Announce | Day 0 | Email, changelog, add Deprecation header |
| Reminder 1 | Month 3 | Email, blog post |
| Sunset Date Set | Month 6 | Add Sunset header, email |
| Reminder 2 | Month 9 | Email, identify stragglers |
| Final Warning | Month 11 | Email, direct outreach to major users |
| Sunset | Month 12 | Return 410 Gone, remove code |

### Breaking Change Quick Check

**Is it breaking?** Ask these questions:
1. Will existing clients get errors? → Breaking
2. Will existing clients get wrong data? → Breaking
3. Will existing clients work unchanged? → Not breaking

### Required Headers for Deprecated Endpoints

```http
Deprecation: true
Sunset: [HTTP-date]
Link: <[successor-url]>; rel="successor-version"
Link: <[docs-url]>; rel="deprecation"; type="text/html"
```

---

*Document Version: 1.0*  
*Last Updated: December 2024*  
*Next Review: March 2025*