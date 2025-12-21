# Search Implementation Security and Best Practices
## Production Readiness Audit - Industry Standards & Best Practices

**Platform:** TicketToken Blockchain Ticketing SaaS  
**Technology Stack:** Elasticsearch, Node.js/Fastify  
**Document Version:** 1.0  
**Last Updated:** December 2024

---

## Table of Contents

1. [Standards & Best Practices](#1-standards--best-practices)
   - [Elasticsearch Security Configuration](#11-elasticsearch-security-configuration)
   - [Search Query Sanitization](#12-search-query-sanitization)
   - [Index Design for Multi-Tenancy](#13-index-design-for-multi-tenancy)
   - [Search Relevance Tuning](#14-search-relevance-tuning)
   - [Pagination Best Practices](#15-pagination-best-practices)
   - [Search Result Filtering by Permissions](#16-search-result-filtering-by-permissions)
2. [Common Vulnerabilities & Mistakes](#2-common-vulnerabilities--mistakes)
3. [Audit Checklist](#3-audit-checklist)
4. [TicketToken-Specific Considerations](#4-tickettoken-specific-considerations)
5. [Sources](#5-sources)

---

## 1. Standards & Best Practices

### 1.1 Elasticsearch Security Configuration

Elasticsearch security is critical for protecting sensitive data. Research indicates that 60% of NoSQL data breaches involve Elasticsearch databases, primarily due to misconfiguration.

**Source:** https://coralogix.com/blog/5-common-elasticsearch-mistakes-that-lead-to-data-breaches/

#### Core Security Settings

Enable X-Pack security features in `elasticsearch.yml`:

```yaml
# Enable security features (REQUIRED)
xpack.security.enabled: true

# Enable TLS for transport layer (node-to-node)
xpack.security.transport.ssl.enabled: true
xpack.security.transport.ssl.verification_mode: certificate
xpack.security.transport.ssl.keystore.path: elastic-certificates.p12
xpack.security.transport.ssl.truststore.path: elastic-certificates.p12

# Enable TLS for HTTP layer (client connections)
xpack.security.http.ssl.enabled: true
xpack.security.http.ssl.keystore.path: http.p12

# Enable audit logging
xpack.security.audit.enabled: true
xpack.security.audit.logfile.events.include: 
  - access_denied
  - authentication_failed
  - connection_denied
  - tampered_request
  - run_as_denied
  - anonymous_access_denied
```

**Source:** https://www.elastic.co/docs/deploy-manage/security, https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/security-settings

#### Network Security

```yaml
# Bind to private network only - NEVER expose to public internet
network.host: 192.168.1.10

# Or bind to localhost only
network.host: 127.0.0.1

# Disable HTTP on data nodes if not needed
http.enabled: false
```

**Critical:** Elasticsearch default settings bind nodes to localhost, but many breaches occur when developers change this for convenience and forget to secure it. Research shows an unsecured Elasticsearch server will be discovered and attacked within 8 hours of exposure.

**Source:** https://www.computerweekly.com/news/252484365/Unsecured-ElasticSearch-server-breached-in-eight-hours-flat

#### Authentication & Authorization

Built-in authentication methods:
- Native realm (built-in user management)
- LDAP/Active Directory integration
- SAML authentication
- PKI authentication
- Kerberos authentication

```javascript
// Create user with limited permissions
PUT /_security/user/search_app
{
  "password" : "secure_password_here",
  "roles" : [ "search_only" ],
  "full_name" : "Search Application",
  "enabled": true
}

// Create role with minimal permissions
PUT /_security/role/search_only
{
  "cluster": ["monitor"],
  "indices": [
    {
      "names": [ "events-*", "tickets-*" ],
      "privileges": [ "read", "view_index_metadata" ]
    }
  ]
}
```

**Source:** https://severalnines.com/blog/best-practices-elasticsearch-security/

#### API Key Authentication

```javascript
// Create API key for application
POST /_security/api_key
{
  "name": "tickettoken-search-api",
  "expiration": "30d",
  "role_descriptors": {
    "search_only": {
      "cluster": ["monitor"],
      "indices": [
        {
          "names": ["events-*", "tickets-*"],
          "privileges": ["read"]
        }
      ]
    }
  }
}
```

---

### 1.2 Search Query Sanitization

Elasticsearch queries can be vulnerable to injection attacks when user input is directly embedded into query DSL.

**Source:** https://knowledge-base.secureflag.com/vulnerabilities/nosql_injection/nosql_injection_java.html

#### The Problem: Elasticsearch Injection

```javascript
// VULNERABLE: User input directly in query
const searchQuery = {
  query: {
    match: {
      title: userInput  // User could inject: ","zero_terms_query":"all
    }
  }
};
```

A malicious user could transform a filtered query into a match-all query by injecting query parameters.

**Source:** https://salt.security/blog/api-threat-research-elastic-vuln

#### Safe Query Construction Patterns

**Pattern 1: Use Search Templates with Mustache Escaping**

```javascript
// Define search template with DOUBLE braces (escapes quotes)
PUT _scripts/event_search
{
  "script": {
    "lang": "mustache",
    "source": {
      "query": {
        "bool": {
          "must": [
            { "match": { "title": "{{query}}" }},  // Double braces escape
            { "term": { "tenant_id": "{{tenant_id}}" }}
          ]
        }
      }
    }
  }
}

// Execute template
GET events/_search/template
{
  "id": "event_search",
  "params": {
    "query": "concert",
    "tenant_id": "tenant_123"
  }
}
```

**Important:** Use `{{variable}}` (double braces) for user input - this escapes double quotes. Never use `{{{variable}}}` (triple braces) with untrusted data as it performs no escaping.

**Source:** https://knowledge-base.secureflag.com/vulnerabilities/nosql_injection/nosql_injection_java.html

**Pattern 2: Query Builder with Explicit Type Validation**

```typescript
// Safe query builder pattern
class SafeSearchQueryBuilder {
  private query: any = { bool: { must: [], filter: [] } };

  addTextSearch(field: string, value: string): this {
    // Validate field is allowed
    const allowedFields = ['title', 'description', 'venue_name'];
    if (!allowedFields.includes(field)) {
      throw new Error(`Field ${field} not allowed for text search`);
    }
    
    // Sanitize value - remove control characters
    const sanitized = value
      .replace(/[\x00-\x1F\x7F]/g, '')  // Remove control chars
      .substring(0, 500);  // Limit length
    
    this.query.bool.must.push({
      match: { [field]: sanitized }
    });
    return this;
  }

  addTenantFilter(tenantId: string): this {
    // Validate tenant ID format
    if (!/^tenant_[a-zA-Z0-9]{8,32}$/.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
    
    this.query.bool.filter.push({
      term: { tenant_id: tenantId }
    });
    return this;
  }

  build(): object {
    return { query: this.query };
  }
}
```

**Pattern 3: Whitelist Allowed Query Parameters**

```typescript
// Only allow specific, safe query constructs
const ALLOWED_QUERY_TYPES = ['match', 'term', 'range', 'bool'];
const ALLOWED_FIELDS = ['title', 'description', 'date', 'venue', 'category'];

function validateQuery(query: any): boolean {
  // Reject queries with script, runtime_mappings, or aggregations
  const dangerousKeys = ['script', 'runtime_mappings', '_source', 'aggs'];
  
  const hasdangerous = dangerousKeys.some(key => 
    JSON.stringify(query).includes(`"${key}"`)
  );
  
  if (hasangerous) {
    throw new Error('Query contains disallowed constructs');
  }
  
  return true;
}
```

#### Disable Scripting (if not needed)

```yaml
# elasticsearch.yml - Restrict scripting
script.allowed_types: none
# Or allow only stored scripts
script.allowed_types: stored
```

**Source:** https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-scripting-security.html

---

### 1.3 Index Design for Multi-Tenancy

There are three primary patterns for multi-tenant Elasticsearch deployments, each with different security and scalability tradeoffs.

**Source:** https://www.elastic.co/blog/found-multi-tenancy, https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/build-a-multi-tenant-serverless-architecture-in-amazon-opensearch-service.html

#### Pattern 1: Separate Index Per Tenant (Silo Model)

```javascript
// Index naming convention
// events-{tenant_id}
// tickets-{tenant_id}

// Create tenant-specific index
PUT /events-tenant_abc123
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 1
  },
  "mappings": {
    "properties": {
      "title": { "type": "text" },
      "date": { "type": "date" }
    }
  }
}
```

**Pros:**
- Complete data isolation
- Per-tenant index settings
- Easy to delete tenant data

**Cons:**
- High shard overhead (memory cost per shard is constant)
- Doesn't scale beyond ~1000 tenants
- Cluster state bloat with many indices

**When to Use:** Enterprise customers requiring strict isolation, compliance requirements.

**Source:** https://developer.epages.com/blog/tech-stories/multitenancy-and-elasticsearch/

#### Pattern 2: Shared Index with Tenant Field (Pool Model)

```javascript
// Single shared index with tenant_id field
PUT /events
{
  "mappings": {
    "properties": {
      "tenant_id": { 
        "type": "keyword",
        "doc_values": true  // Required for filtering
      },
      "title": { "type": "text" },
      "date": { "type": "date" }
    }
  }
}

// All queries MUST include tenant filter
GET /events/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "title": "concert" } }
      ],
      "filter": [
        { "term": { "tenant_id": "tenant_abc123" } }
      ]
    }
  }
}
```

**Pros:**
- Scales to millions of tenants
- Efficient resource usage
- Single index to manage

**Cons:**
- Risk of cross-tenant data leakage if filter forgotten
- Shared scoring statistics affect relevance
- Cannot have tenant-specific analyzers

**When to Use:** SaaS applications with many small tenants.

**Source:** https://bigdataboutique.com/blog/multi-tenancy-with-elasticsearch-and-opensearch-c1047b

#### Pattern 3: Filtered Aliases (Recommended)

```javascript
// Create base index
PUT /events-shared
{
  "mappings": {
    "properties": {
      "tenant_id": { "type": "keyword" },
      "title": { "type": "text" }
    }
  }
}

// Create filtered alias for each tenant
POST /_aliases
{
  "actions": [
    {
      "add": {
        "index": "events-shared",
        "alias": "events-tenant_abc123",
        "filter": {
          "term": { "tenant_id": "tenant_abc123" }
        },
        "is_write_index": true
      }
    }
  ]
}

// Application uses alias - tenant filter automatically applied
GET /events-tenant_abc123/_search
{
  "query": {
    "match": { "title": "concert" }
  }
}
```

**Pros:**
- Automatic tenant filtering via alias
- Application code simpler (uses alias name)
- Can migrate tenants between indices

**Cons:**
- Alias list is part of cluster state
- Limited to ~10,000 aliases before performance issues

**When to Use:** Medium-scale multi-tenancy with strong isolation requirements.

**Source:** https://www.elastic.co/blog/found-multi-tenancy

#### Hybrid Approach for TicketToken

```javascript
// Tier 1: High-volume tenants get dedicated indices
// events-enterprise-{tenant_id}

// Tier 2: Standard tenants share indices with filtered aliases
// events-shared-{shard_group}

// Routing: Use tenant_id for routing in shared indices
PUT /events-shared/_doc/event123?routing=tenant_abc123
{
  "tenant_id": "tenant_abc123",
  "title": "Concert Event"
}
```

---

### 1.4 Search Relevance Tuning

Elasticsearch uses BM25 as its default scoring algorithm. Understanding and tuning relevance is essential for good search UX.

**Source:** https://www.elastic.co/blog/how-to-improve-elasticsearch-search-relevance-with-boolean-queries

#### Field Boosting

```javascript
// Multi-match with field weights
GET /events/_search
{
  "query": {
    "multi_match": {
      "query": "taylor swift",
      "fields": [
        "title^10",        // Title matches worth 10x
        "artist^5",        // Artist matches worth 5x
        "description^2",   // Description worth 2x
        "venue^1"          // Venue at baseline
      ],
      "type": "best_fields"
    }
  }
}
```

**Source:** https://www.elastic.co/guide/en/app-search/current/relevance-tuning-guide.html

#### Function Score for Dynamic Boosting

```javascript
// Boost recent events and popular events
GET /events/_search
{
  "query": {
    "function_score": {
      "query": {
        "match": { "title": "concert" }
      },
      "functions": [
        {
          // Decay function: newer events score higher
          "gauss": {
            "date": {
              "origin": "now",
              "scale": "30d",
              "decay": 0.5
            }
          },
          "weight": 2
        },
        {
          // Field value factor: popular events score higher
          "field_value_factor": {
            "field": "tickets_sold",
            "factor": 0.001,
            "modifier": "log1p",
            "missing": 1
          },
          "weight": 1.5
        }
      ],
      "score_mode": "sum",
      "boost_mode": "multiply"
    }
  }
}
```

**Source:** https://www.elastic.co/blog/easier-relevance-tuning-elasticsearch-7-0

#### Boosting Query (Demote Results)

```javascript
// Boost matching results, demote cancelled events
GET /events/_search
{
  "query": {
    "boosting": {
      "positive": {
        "match": { "title": "concert" }
      },
      "negative": {
        "term": { "status": "cancelled" }
      },
      "negative_boost": 0.2  // Reduce score to 20%
    }
  }
}
```

**Source:** https://pulse.support/kb/elasticsearch-boosting-query

#### Best Practices

| Practice | Recommendation |
|----------|----------------|
| Field weights | Keep boosts between 1-15; larger values have diminishing returns |
| Dynamic boosting | Use `function_score` for runtime signals (popularity, recency) |
| Test relevance | Use `_explain` API to understand scoring |
| Phrase matching | Boost exact phrase matches for better precision |
| Synonyms | Apply at query time for flexibility (index-time for performance) |

**Source:** https://marcobonzanini.com/2015/06/22/tuning-relevance-in-elasticsearch-with-custom-boosting/

---

### 1.5 Pagination Best Practices

Deep pagination in Elasticsearch is resource-intensive and can degrade cluster performance. The default limit of 10,000 results (from + size) exists as a safeguard.

**Source:** https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results

#### Pagination Methods Comparison

| Method | Use Case | Pros | Cons |
|--------|----------|------|------|
| `from` + `size` | First few pages | Simple, random access | Limited to 10K results, expensive for deep pages |
| `search_after` | Real-time deep pagination | Efficient, stateless | No random access, requires sort |
| `scroll` | Bulk export | Handles large datasets | Creates server-side state, not for user-facing |
| Point in Time (PIT) | Consistent deep pagination | Snapshot consistency | Additional complexity |

**Source:** https://www.luigisbox.com/blog/elasticsearch-pagination/

#### From/Size (Default - Use Sparingly)

```javascript
// Simple pagination - only for first 10-20 pages
GET /events/_search
{
  "from": 0,
  "size": 20,
  "query": {
    "match": { "title": "concert" }
  },
  "sort": [
    { "date": "desc" },
    { "_id": "asc" }  // Tiebreaker required
  ]
}
```

**Limit:** `from + size` cannot exceed `index.max_result_window` (default 10,000).

**Source:** https://pulse.support/kb/elasticsearch-index-max-result-window

#### Search After (Recommended for Deep Pagination)

```javascript
// First page
GET /events/_search
{
  "size": 20,
  "query": {
    "match": { "title": "concert" }
  },
  "sort": [
    { "date": "desc" },
    { "_id": "asc" }  // Unique tiebreaker required
  ]
}

// Response includes sort values for last document
// { "sort": [1640000000000, "event_xyz789"] }

// Next page - use sort values from last result
GET /events/_search
{
  "size": 20,
  "query": {
    "match": { "title": "concert" }
  },
  "search_after": [1640000000000, "event_xyz789"],
  "sort": [
    { "date": "desc" },
    { "_id": "asc" }
  ]
}
```

**Source:** https://dev.to/lazypro/explaining-pagination-in-elasticsearch-2g26

#### Point in Time (PIT) for Consistent Results

```javascript
// Create PIT
POST /events/_pit?keep_alive=5m
// Returns: { "id": "46ToAwMDaWQtMTI..." }

// Search with PIT
GET /_search
{
  "size": 20,
  "query": {
    "match": { "title": "concert" }
  },
  "pit": {
    "id": "46ToAwMDaWQtMTI...",
    "keep_alive": "5m"
  },
  "sort": [
    { "date": "desc" },
    { "_id": "asc" }
  ],
  "search_after": [1640000000000, "event_xyz789"]
}

// Delete PIT when done
DELETE /_pit
{
  "id": "46ToAwMDaWQtMTI..."
}
```

**Source:** https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results

#### Pagination Security Considerations

```typescript
// Enforce pagination limits in application code
const MAX_PAGE_SIZE = 100;
const MAX_TOTAL_RESULTS = 10000;

function validatePagination(from: number, size: number): void {
  if (size > MAX_PAGE_SIZE) {
    throw new Error(`Page size cannot exceed ${MAX_PAGE_SIZE}`);
  }
  
  if (from + size > MAX_TOTAL_RESULTS) {
    throw new Error(`Cannot paginate beyond ${MAX_TOTAL_RESULTS} results`);
  }
  
  if (from < 0 || size < 1) {
    throw new Error('Invalid pagination parameters');
  }
}
```

---

### 1.6 Search Result Filtering by Permissions

Document-level security (DLS) and field-level security (FLS) enable fine-grained access control on search results.

**Source:** https://www.elastic.co/guide/en/elasticsearch/reference/current/field-and-document-access-control.html

#### Document-Level Security (DLS)

```javascript
// Role with document-level security
PUT /_security/role/tenant_reader
{
  "indices": [
    {
      "names": ["events-*"],
      "privileges": ["read"],
      "query": {
        "term": { "tenant_id": "tenant_abc123" }
      }
    }
  ]
}

// Role using template for dynamic user context
PUT /_security/role/user_events
{
  "indices": [
    {
      "names": ["tickets-*"],
      "privileges": ["read"],
      "query": {
        "template": {
          "source": {
            "term": { "owner_id": "{{_user.username}}" }
          }
        }
      }
    }
  ]
}
```

**Source:** https://www.elastic.co/guide/en/elasticsearch/reference/current/document-level-security.html

#### Field-Level Security (FLS)

```javascript
// Role that hides sensitive fields
PUT /_security/role/public_search
{
  "indices": [
    {
      "names": ["events-*"],
      "privileges": ["read"],
      "field_security": {
        "grant": ["title", "date", "venue", "description"],
        "except": ["internal_notes", "cost_price", "api_keys"]
      }
    }
  ]
}
```

**Source:** https://www.elastic.co/guide/en/elasticsearch/reference/current/field-level-security.html

#### Application-Level Permission Filtering

When Elasticsearch security features aren't sufficient, implement permission filtering in your application:

```typescript
// Post-query permission filter
async function searchWithPermissions(
  query: any, 
  user: User
): Promise<SearchResult[]> {
  // Add tenant filter to query
  const securedQuery = {
    bool: {
      must: [query],
      filter: [
        { term: { tenant_id: user.tenantId } },
        // Add visibility filter
        {
          bool: {
            should: [
              { term: { visibility: 'public' } },
              { term: { created_by: user.id } },
              { terms: { shared_with: user.groups } }
            ]
          }
        }
      ]
    }
  };

  const results = await esClient.search({
    index: 'events',
    body: { query: securedQuery }
  });

  // Additional permission check on results
  return results.hits.hits.filter(hit => 
    permissionService.canView(user, hit._source)
  );
}
```

#### Combining DLS with Application Logic

```javascript
// Set security user processor for automatic context
PUT _ingest/pipeline/add_owner
{
  "processors": [
    {
      "set_security_user": {
        "field": "owner",
        "properties": ["username", "roles", "realm"]
      }
    }
  ]
}

// Index with pipeline
PUT /tickets/_doc/ticket123?pipeline=add_owner
{
  "event_id": "event456",
  "seat": "A1"
}
// Document automatically gets owner.username, owner.roles
```

**Source:** https://www.elastic.co/guide/en/elasticsearch/reference/current/field-and-document-access-control.html

---

## 2. Common Vulnerabilities & Mistakes

### 2.1 Elasticsearch Injection

**Problem:** User-controlled input is embedded directly into Elasticsearch queries, allowing attackers to modify query logic.

**Example Attack:**
```javascript
// Vulnerable code
const query = `{"query":{"match":{"title":"${userInput}"}}}`;

// Attack payload
userInput = '","zero_terms_query":"all';

// Results in match-all query
{"query":{"match":{"title":"","zero_terms_query":"all"}}}
```

**Prevention:**
- Use search templates with `{{variable}}` (double braces)
- Build queries programmatically with typed query builders
- Validate/whitelist allowed query structures
- Never interpolate user input into JSON strings

**Source:** https://knowledge-base.secureflag.com/vulnerabilities/nosql_injection/nosql_injection_java.html, https://secops.group/a-pentesters-guide-to-nosql-injection/

---

### 2.2 Exposing Elasticsearch Directly to Clients

**Problem:** Elasticsearch is exposed to the internet without authentication or accessed directly from frontend applications.

**Statistics:** An exposed Elasticsearch server will be attacked within 8 hours. Over 6 billion records have been leaked from misconfigured Elasticsearch servers.

**Source:** https://www.computerweekly.com/news/252484365/Unsecured-ElasticSearch-server-breached-in-eight-hours-flat, https://hackread.com/elasticsearch-leak-6-billion-record-scraping-breaches/

**Why Direct Exposure is Dangerous:**
- Elasticsearch is designed for backend use, not public access
- Query DSL is too powerful for untrusted users
- Scripting features can be abused
- No built-in rate limiting

**Source:** https://www.searchkit.co/docs/proxy-elasticsearch/why, https://github.com/elastic/elasticsearch/issues/67061

**Prevention:**
```
[Client] → [API Gateway] → [Application Server] → [Elasticsearch]
                                    ↓
                         - Authentication
                         - Authorization
                         - Query validation
                         - Rate limiting
                         - Result filtering
```

- Never expose ports 9200/9300 to public internet
- Use an application layer to proxy requests
- Bind Elasticsearch to private network only
- Use firewall rules to restrict access

**Source:** https://coralogix.com/blog/5-common-elasticsearch-mistakes-that-lead-to-data-breaches/

---

### 2.3 Missing Tenant Isolation in Search

**Problem:** Search queries don't enforce tenant boundaries, allowing data leakage between tenants.

**Example Vulnerability:**
```javascript
// VULNERABLE: No tenant filter
const results = await esClient.search({
  index: 'events',
  body: {
    query: { match: { title: userQuery } }
  }
});
// Returns events from ALL tenants!
```

**Prevention:**

```javascript
// SECURE: Always include tenant filter
const results = await esClient.search({
  index: 'events',
  body: {
    query: {
      bool: {
        must: [
          { match: { title: userQuery } }
        ],
        filter: [
          { term: { tenant_id: currentUser.tenantId } }  // REQUIRED
        ]
      }
    }
  }
});
```

**Additional Safeguards:**
- Use filtered aliases so tenant filter is automatic
- Implement middleware that rejects queries without tenant filter
- Unit test all search functions for tenant isolation
- Audit logs to detect cross-tenant access

**Source:** https://www.elastic.co/blog/found-multi-tenancy, https://bigdataboutique.com/blog/multi-tenancy-with-elasticsearch-and-opensearch-c1047b

---

### 2.4 No Authentication on Elasticsearch

**Problem:** Elasticsearch deployed without authentication, allowing anyone with network access to read/write data.

**Real-World Impact:** Billions of records have been exposed due to unauthenticated Elasticsearch instances.

**Source:** https://coralogix.com/blog/5-common-elasticsearch-mistakes-that-lead-to-data-breaches/

**Signs of Misconfiguration:**
```bash
# This should NOT work without credentials
curl http://elasticsearch:9200/_cat/indices
```

**Prevention:**

```yaml
# elasticsearch.yml
xpack.security.enabled: true
xpack.security.authc.api_key.enabled: true
```

```javascript
// All connections must use authentication
const esClient = new Client({
  node: 'https://elasticsearch:9200',
  auth: {
    apiKey: process.env.ES_API_KEY
  },
  tls: {
    rejectUnauthorized: true
  }
});
```

**Source:** https://www.elastic.co/blog/how-to-prevent-elasticsearch-server-breach-securing-elasticsearch

---

### 2.5 Returning Unauthorized Results

**Problem:** Search returns documents the user shouldn't have access to, relying solely on UI to hide them.

**Symptoms:**
- API returns more data than UI displays
- Users can access hidden data via API directly
- Permission checks happen after pagination

**Prevention:**

```typescript
// BAD: Filter after fetching
const allResults = await search(query);
const visibleResults = allResults.filter(r => canView(user, r));  // Wrong!
// If first 100 results are unauthorized, user sees empty page

// GOOD: Filter in query
const securedQuery = addPermissionFilters(query, user);
const results = await search(securedQuery);
// Elasticsearch only returns authorized results
```

**Implement Permission Filtering at Query Level:**

```javascript
// Build permission-aware query
function addPermissionFilters(query: any, user: User): any {
  const permissionFilters = [];
  
  // Public content - everyone can see
  permissionFilters.push({ term: { visibility: 'public' } });
  
  // User's own content
  permissionFilters.push({ term: { owner_id: user.id } });
  
  // Content shared with user's groups
  if (user.groups.length > 0) {
    permissionFilters.push({ 
      terms: { shared_with_groups: user.groups } 
    });
  }
  
  return {
    bool: {
      must: [query],
      filter: [
        { term: { tenant_id: user.tenantId } },
        { bool: { should: permissionFilters, minimum_should_match: 1 } }
      ]
    }
  };
}
```

**Source:** https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/controlling-access-at-document-field-level

---

### 2.6 Unbounded Result Sets

**Problem:** No limits on result set size, allowing denial-of-service through expensive queries.

**Symptoms:**
```javascript
// DANGEROUS: No size limit
GET /events/_search
{
  "query": { "match_all": {} }
}
// Could return millions of documents!

// DANGEROUS: Attempting to bypass limits
GET /events/_search
{
  "from": 0,
  "size": 1000000  // Exceeds max_result_window
}
```

**Prevention:**

```typescript
// Application-level limits
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_PAGINATION_DEPTH = 10000;

function buildSearchRequest(params: SearchParams): any {
  const size = Math.min(params.size || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const from = params.from || 0;
  
  if (from + size > MAX_PAGINATION_DEPTH) {
    throw new Error('Cannot paginate beyond 10,000 results. Use search_after.');
  }
  
  return {
    from,
    size,
    query: params.query,
    // Always include timeout
    timeout: '10s',
    // Limit fields returned
    _source: params.fields || ['id', 'title', 'date']
  };
}
```

**Elasticsearch-Level Protection:**
```yaml
# elasticsearch.yml
# Limit memory per query
indices.breaker.request.limit: 40%

# Limit total shards queried
action.search.shard_count.limit: 1000
```

```javascript
// Index setting - cannot be exceeded
PUT /events/_settings
{
  "index.max_result_window": 10000
}
```

**Source:** https://pulse.support/kb/elasticsearch-index-max-result-window

---

## 3. Audit Checklist

### 3.1 Elasticsearch Cluster Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | `xpack.security.enabled: true` in elasticsearch.yml | ☐ | CRITICAL |
| 2 | TLS enabled for HTTP layer (`xpack.security.http.ssl.enabled: true`) | ☐ | CRITICAL |
| 3 | TLS enabled for transport layer | ☐ | |
| 4 | Elasticsearch bound to private network only (not 0.0.0.0) | ☐ | CRITICAL |
| 5 | Ports 9200/9300 not exposed to public internet | ☐ | CRITICAL |
| 6 | All built-in user passwords changed from defaults | ☐ | |
| 7 | Audit logging enabled for security events | ☐ | |
| 8 | Anonymous access disabled | ☐ | |
| 9 | API keys rotated regularly (< 90 days) | ☐ | |
| 10 | Elasticsearch version is current (security patches) | ☐ | |
| 11 | Scripting disabled or restricted to stored scripts only | ☐ | |
| 12 | `index.max_result_window` not increased beyond 10,000 | ☐ | |

### 3.2 Application Architecture

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 13 | Elasticsearch not directly accessible from frontend | ☐ | CRITICAL |
| 14 | All ES requests go through application backend | ☐ | |
| 15 | Application authenticates to ES with minimal-privilege credentials | ☐ | |
| 16 | ES connection strings not exposed to clients | ☐ | |
| 17 | Rate limiting on search endpoints | ☐ | |
| 18 | Request timeout configured (< 30s for user-facing) | ☐ | |
| 19 | Circuit breaker pattern for ES failures | ☐ | |
| 20 | Health checks don't expose ES details | ☐ | |

### 3.3 Query Construction Security

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 21 | User input never interpolated into query strings | ☐ | CRITICAL |
| 22 | Search templates used with double-brace escaping | ☐ | |
| 23 | Allowed query fields whitelisted | ☐ | |
| 24 | Query structure validated before execution | ☐ | |
| 25 | No user control over `_source`, `script`, `aggs` | ☐ | |
| 26 | Sort fields limited to allowed list | ☐ | |
| 27 | Highlight fields restricted | ☐ | |
| 28 | Query logging (without PII) for security review | ☐ | |

### 3.4 Multi-Tenant Isolation

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 29 | **Every search query includes tenant filter** | ☐ | CRITICAL |
| 30 | Tenant ID validated from authenticated session | ☐ | CRITICAL |
| 31 | Tenant ID not accepted from user input | ☐ | |
| 32 | Filtered aliases used for tenant isolation | ☐ | |
| 33 | Cross-tenant queries explicitly forbidden | ☐ | |
| 34 | Tenant isolation tested with automated tests | ☐ | |
| 35 | Audit log captures tenant context | ☐ | |
| 36 | Data export respects tenant boundaries | ☐ | |

### 3.5 Permission-Based Result Filtering

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 37 | Permission filters applied at query level (not post-query) | ☐ | CRITICAL |
| 38 | Document-level security configured for sensitive indices | ☐ | |
| 39 | Field-level security hides sensitive fields | ☐ | |
| 40 | Public/private visibility enforced in query | ☐ | |
| 41 | Owner/creator permissions checked | ☐ | |
| 42 | Group-based permissions supported | ☐ | |
| 43 | Permission inheritance handled correctly | ☐ | |
| 44 | Admin/superuser queries logged separately | ☐ | |

### 3.6 Pagination & Result Limits

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 45 | Default page size enforced (e.g., 20) | ☐ | |
| 46 | Maximum page size enforced (e.g., 100) | ☐ | |
| 47 | Deep pagination blocked (from + size > 10,000) | ☐ | |
| 48 | `search_after` used for deep pagination needs | ☐ | |
| 49 | Scroll context TTL limited (< 5 minutes) | ☐ | |
| 50 | Total hits count capped (`track_total_hits`: 10000) | ☐ | |
| 51 | Returned fields limited (`_source` filtering) | ☐ | |
| 52 | Query timeout enforced | ☐ | |

### 3.7 Event Search Specific

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 53 | Event search includes tenant filter | ☐ | |
| 54 | Draft/unpublished events filtered for non-admins | ☐ | |
| 55 | Cancelled events handled appropriately | ☐ | |
| 56 | Future events only shown if published | ☐ | |
| 57 | Event visibility (public/private) enforced | ☐ | |
| 58 | Price/capacity data protected if sensitive | ☐ | |
| 59 | Venue coordinates don't leak private venues | ☐ | |
| 60 | Event search results don't expose organizer PII | ☐ | |

### 3.8 Ticket Search Specific

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 61 | Ticket search includes owner filter | ☐ | CRITICAL |
| 62 | Users can only search their own tickets | ☐ | CRITICAL |
| 63 | Admins can search all tickets with audit | ☐ | |
| 64 | Ticket codes/secrets never in search results | ☐ | |
| 65 | Transfer history protected | ☐ | |
| 66 | Payment details excluded from search | ☐ | |
| 67 | Buyer PII not exposed in resale listings | ☐ | |
| 68 | Blockchain wallet addresses handled per privacy policy | ☐ | |

### 3.9 Index Configuration

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 69 | Indices use appropriate shard count | ☐ | |
| 70 | Tenant ID field is `keyword` type (not analyzed) | ☐ | |
| 71 | Sensitive fields not analyzed (no inverted index) | ☐ | |
| 72 | PII fields excluded from `_all` / `copy_to` | ☐ | |
| 73 | Index templates enforce security mappings | ☐ | |
| 74 | Alias naming conventions followed | ☐ | |
| 75 | Index lifecycle policy configured | ☐ | |
| 76 | Old data deleted per retention policy | ☐ | |

### 3.10 Monitoring & Incident Response

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 77 | Search latency monitored | ☐ | |
| 78 | Query error rates tracked | ☐ | |
| 79 | Slow query log enabled | ☐ | |
| 80 | Failed authentication attempts alerted | ☐ | |
| 81 | Unusual query patterns detected | ☐ | |
| 82 | Cross-tenant access attempts logged | ☐ | |
| 83 | Backup strategy for ES data | ☐ | |
| 84 | Disaster recovery tested | ☐ | |
| 85 | Incident response plan includes ES breaches | ☐ | |

---

## 4. TicketToken-Specific Considerations

### 4.1 Event Search Architecture

```typescript
// Recommended event search implementation
interface EventSearchParams {
  query: string;
  category?: string;
  dateRange?: { start: Date; end: Date };
  location?: { lat: number; lon: number; radius: string };
  priceRange?: { min: number; max: number };
  page?: number;
  pageSize?: number;
}

async function searchEvents(
  params: EventSearchParams,
  context: RequestContext
): Promise<SearchResult<Event>> {
  // 1. Validate pagination
  const page = Math.max(0, params.page || 0);
  const pageSize = Math.min(100, params.pageSize || 20);
  
  if (page * pageSize > 10000) {
    throw new Error('Use cursor pagination for deep results');
  }

  // 2. Build base query
  const must: any[] = [];
  const filter: any[] = [];
  
  if (params.query) {
    must.push({
      multi_match: {
        query: params.query,
        fields: ['title^10', 'artist^5', 'venue.name^3', 'description'],
        fuzziness: 'AUTO'
      }
    });
  }

  // 3. ALWAYS add tenant filter (CRITICAL)
  filter.push({ term: { tenant_id: context.tenantId } });
  
  // 4. Only show published, future events
  filter.push({ term: { status: 'published' } });
  filter.push({ range: { date: { gte: 'now' } } });

  // 5. Add user-specified filters
  if (params.category) {
    filter.push({ term: { category: params.category } });
  }
  
  if (params.dateRange) {
    filter.push({
      range: {
        date: {
          gte: params.dateRange.start.toISOString(),
          lte: params.dateRange.end.toISOString()
        }
      }
    });
  }

  // 6. Execute search
  const response = await esClient.search({
    index: `events-${context.tenantId}`,  // Or use filtered alias
    body: {
      from: page * pageSize,
      size: pageSize,
      query: {
        bool: { must, filter }
      },
      _source: ['id', 'title', 'date', 'venue', 'category', 'price_range'],
      timeout: '10s'
    }
  });

  return {
    items: response.hits.hits.map(h => h._source as Event),
    total: Math.min(response.hits.total.value, 10000),
    page,
    pageSize
  };
}
```

### 4.2 Ticket Search Architecture

```typescript
async function searchUserTickets(
  userId: string,
  params: TicketSearchParams,
  context: RequestContext
): Promise<SearchResult<Ticket>> {
  // CRITICAL: Users can only see their own tickets
  const filter: any[] = [
    { term: { tenant_id: context.tenantId } },
    { term: { owner_id: userId } },  // Must match authenticated user
    { term: { status: 'active' } }   // Don't show transferred/cancelled
  ];

  // Optional filters
  if (params.eventId) {
    filter.push({ term: { event_id: params.eventId } });
  }

  const response = await esClient.search({
    index: 'tickets',
    body: {
      from: 0,
      size: Math.min(params.limit || 50, 100),
      query: { bool: { filter } },
      // CRITICAL: Exclude sensitive fields
      _source: {
        excludes: [
          'qr_code',
          'transfer_code', 
          'purchase_price',
          'payment_method',
          'blockchain_private_key'
        ]
      },
      sort: [{ purchased_at: 'desc' }]
    }
  });

  return mapResponse(response);
}
```

### 4.3 Marketplace/Resale Search

```typescript
async function searchResaleListings(
  params: ResaleSearchParams,
  context: RequestContext
): Promise<SearchResult<Listing>> {
  const filter: any[] = [
    { term: { tenant_id: context.tenantId } },
    { term: { status: 'active' } },
    { term: { visibility: 'public' } }  // Only public listings
  ];

  const response = await esClient.search({
    index: 'resale_listings',
    body: {
      query: { bool: { filter } },
      _source: {
        // CRITICAL: Never expose seller personal details
        includes: ['id', 'event_id', 'section', 'row', 'price', 'quantity'],
        excludes: ['seller_id', 'seller_email', 'seller_wallet']
      },
      // Boost verified sellers
      sort: [
        { 'seller.verified': 'desc' },
        { price: 'asc' }
      ]
    }
  });

  return mapResponse(response);
}
```

---

## 5. Sources

### Official Elasticsearch Documentation
- Elasticsearch Security: https://www.elastic.co/docs/deploy-manage/security
- Security Settings Reference: https://www.elastic.co/docs/reference/elasticsearch/configuration-reference/security-settings
- Document-Level Security: https://www.elastic.co/guide/en/elasticsearch/reference/current/document-level-security.html
- Field-Level Security: https://www.elastic.co/guide/en/elasticsearch/reference/current/field-level-security.html
- Access Control: https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/controlling-access-at-document-field-level
- Pagination: https://www.elastic.co/docs/reference/elasticsearch/rest-apis/paginate-search-results
- Scripting Security: https://www.elastic.co/guide/en/elasticsearch/reference/current/modules-scripting-security.html
- App Search Sanitization: https://www.elastic.co/guide/en/app-search/current/sanitization-guide.html
- Relevance Tuning: https://www.elastic.co/guide/en/app-search/current/relevance-tuning-guide.html

### Elasticsearch Security Best Practices
- Severalnines Security Guide: https://severalnines.com/blog/best-practices-elasticsearch-security/
- Logz.io Security Practices: https://logz.io/blog/elasticsearch-security-best-practices/
- Comparitech Security Guide: https://www.comparitech.com/net-admin/elasticsearch-security/
- Query Quotient Enterprise Security: https://queryquotient.com/blog/elasticsearch-security-best-practices
- Elastic Blog - Preventing Breaches: https://www.elastic.co/blog/how-to-prevent-elasticsearch-server-breach-securing-elasticsearch

### Injection & Query Security
- SecureFlag NoSQL Injection: https://knowledge-base.secureflag.com/vulnerabilities/nosql_injection/nosql_injection_java.html
- SecOps NoSQL Injection Guide: https://secops.group/a-pentesters-guide-to-nosql-injection/
- Salt Labs Elastic Vulnerability: https://salt.security/blog/api-threat-research-elastic-vuln

### Multi-Tenancy
- Elastic Blog Multi-Tenancy: https://www.elastic.co/blog/found-multi-tenancy
- AWS Multi-Tenant OpenSearch: https://docs.aws.amazon.com/prescriptive-guidance/latest/patterns/build-a-multi-tenant-serverless-architecture-in-amazon-opensearch-service.html
- BigData Boutique Multi-Tenancy: https://bigdataboutique.com/blog/multi-tenancy-with-elasticsearch-and-opensearch-c1047b
- ePages Multi-Tenancy: https://developer.epages.com/blog/tech-stories/multitenancy-and-elasticsearch/

### Pagination
- Luigi's Box Pagination Guide: https://www.luigisbox.com/blog/elasticsearch-pagination/
- DEV.to Pagination Explained: https://dev.to/lazypro/explaining-pagination-in-elasticsearch-2g26
- Opster Pagination Techniques: https://opster.com/guides/elasticsearch/how-tos/elasticsearch-pagination-techniques/

### Relevance Tuning
- Marco Bonzanini Boosting: https://marcobonzanini.com/2015/06/22/tuning-relevance-in-elasticsearch-with-custom-boosting/
- Elastic Blog Boolean Queries: https://www.elastic.co/blog/how-to-improve-elasticsearch-search-relevance-with-boolean-queries
- Elastic Blog Relevance Tuning 7.0: https://www.elastic.co/blog/easier-relevance-tuning-elasticsearch-7-0
- Pulse Boosting Query: https://pulse.support/kb/elasticsearch-boosting-query

### Data Breaches & Security Incidents
- Coralogix 5 Common Mistakes: https://coralogix.com/blog/5-common-elasticsearch-mistakes-that-lead-to-data-breaches/
- Computer Weekly Honeypot Study: https://www.computerweekly.com/news/252484365/Unsecured-ElasticSearch-server-breached-in-eight-hours-flat
- Hackread 6 Billion Records Leak: https://hackread.com/elasticsearch-leak-6-billion-record-scraping-breaches/
- TechRadar ES Leaks Explained: https://www.techradar.com/news/what-is-elasticsearch-and-why-is-it-involved-in-so-many-data-leaks

### Proxy & Architecture
- Searchkit Why Proxy: https://www.searchkit.co/docs/proxy-elasticsearch/why
- GitHub Issue - Direct Exposure: https://github.com/elastic/elasticsearch/issues/67061
- ReactiveSearch API Gateway: https://github.com/appbaseio/reactivesearch-api

### Result Window Limits
- Pulse max_result_window: https://pulse.support/kb/elasticsearch-index-max-result-window

---

**Document Prepared For:** TicketToken Platform Production Readiness Audit  
**Total Checklist Items:** 85  
**Next Steps:** Apply checklist to each microservice using Elasticsearch for search functionality