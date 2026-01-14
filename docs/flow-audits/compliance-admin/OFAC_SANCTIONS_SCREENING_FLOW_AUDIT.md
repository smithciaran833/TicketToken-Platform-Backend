# OFAC SANCTIONS SCREENING FLOW AUDIT

## Document Information

| Field | Value |
|-------|-------|
| Created | January 1, 2025 |
| Author | Kevin + Claude |
| Status | Complete |
| Flow | OFAC Sanctions Screening |

---

## Executive Summary

**WORKING - Real OFAC integration with Treasury data**

| Component | Status |
|-----------|--------|
| OFAC SDN list download | ✅ Working |
| Parse Treasury XML | ✅ Working |
| Store in ofac_sdn_list table | ✅ Working |
| Name screening endpoint | ✅ Working |
| Exact match search | ✅ Working |
| Fuzzy match (similarity) | ✅ Working |
| Result caching (24h) | ✅ Working |
| Audit logging | ✅ Working |
| Automated list refresh | ⚠️ Manual trigger |
| Alert on match | ⚠️ Returns flag only |

**Bottom Line:** Full OFAC sanctions screening using official Treasury Department SDN list. Supports exact and fuzzy matching with PostgreSQL similarity functions. Results are cached for 24 hours. Missing automated daily refresh and alerting on matches.

---

## API Endpoints

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/compliance/ofac/check` | POST | Screen name against OFAC | ✅ Working |
| `/compliance/ofac/refresh` | POST | Update SDN list | ⚠️ Admin only |

---

## How It Works

### 1. SDN List Download

**File:** `backend/services/compliance-service/src/services/ofac-real.service.ts`
```typescript
private readonly OFAC_SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml';

async downloadAndUpdateOFACList() {
  // Download from Treasury
  const response = await axios.get(this.OFAC_SDN_URL, {
    responseType: 'text',
    timeout: 30000
  });

  // Parse XML
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(response.data);

  // Clear and reload
  await db.query('TRUNCATE TABLE ofac_sdn_list');

  // Store each entry
  for (const entry of sdnEntries) {
    await db.query(
      `INSERT INTO ofac_sdn_list
       (uid, full_name, first_name, last_name, sdn_type, programs, raw_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uid, fullName, firstName, lastName, sdnType, programs, rawData]
    );
  }

  // Record update time
  await redis.set('ofac:last_update', new Date().toISOString());
}
```

### 2. Name Screening
```typescript
async checkAgainstOFAC(name: string, fuzzyMatch: boolean = true) {
  const normalizedName = name.toUpperCase().trim();

  // Check cache first
  const cached = await redis.get(`ofac:check:${normalizedName}`);
  if (cached) return JSON.parse(cached);

  // Fuzzy matching with PostgreSQL similarity
  const query = `
    SELECT *,
           similarity(UPPER(full_name), $1) as score
    FROM ofac_sdn_list
    WHERE similarity(UPPER(full_name), $1) > 0.3
    ORDER BY score DESC
    LIMIT 10
  `;

  const result = await db.query(query, [normalizedName]);

  const response = {
    isMatch: result.rows.length > 0,
    confidence: result.rows[0]?.score ? Math.round(result.rows[0].score * 100) : 0,
    matches: result.rows.map(row => ({
      name: row.full_name,
      type: row.sdn_type,
      programs: row.programs,
      score: row.score
    }))
  };

  // Cache for 24 hours
  await redis.set(cacheKey, JSON.stringify(response), 86400);
  return response;
}
```

---

## API Request/Response

### Request
```json
POST /compliance/ofac/check
{
  "name": "John Smith",
  "venueId": "venue-uuid"
}
```

### Response (Clear)
```json
{
  "success": true,
  "data": {
    "isMatch": false,
    "confidence": 0,
    "matches": [],
    "matchedName": null,
    "timestamp": "2025-01-01T12:00:00Z",
    "action": "CLEARED"
  }
}
```

### Response (Match)
```json
{
  "success": true,
  "data": {
    "isMatch": true,
    "confidence": 87,
    "matches": [
      {
        "name": "JOHN SMITH",
        "type": "individual",
        "programs": ["SDGT"],
        "score": 0.87
      }
    ],
    "matchedName": "JOHN SMITH",
    "timestamp": "2025-01-01T12:00:00Z",
    "action": "REQUIRES_REVIEW"
  }
}
```

---

## Database Schema

### ofac_sdn_list
```sql
CREATE TABLE ofac_sdn_list (
  id SERIAL PRIMARY KEY,
  uid VARCHAR(20),
  full_name VARCHAR(500),
  first_name VARCHAR(200),
  last_name VARCHAR(200),
  sdn_type VARCHAR(50),
  programs JSONB,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable pg_trgm for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_ofac_fullname_trgm ON ofac_sdn_list USING gin(full_name gin_trgm_ops);
```

### ofac_checks (Audit Log)
```sql
CREATE TABLE ofac_checks (
  id SERIAL PRIMARY KEY,
  venue_id UUID,
  name_checked VARCHAR(500),
  is_match BOOLEAN,
  confidence INTEGER,
  matched_name VARCHAR(500),
  tenant_id UUID,
  checked_at TIMESTAMP DEFAULT NOW()
);
```

---

## What's Missing

### 1. Automated Daily Refresh
```typescript
// NOT IMPLEMENTED
// Should run daily via cron/scheduled job
schedule.scheduleJob('0 2 * * *', async () => {
  await realOFACService.downloadAndUpdateOFACList();
});
```

### 2. Match Alerts
```typescript
// NOT IMPLEMENTED
if (response.isMatch) {
  await alertService.send({
    type: 'OFAC_MATCH',
    severity: 'HIGH',
    data: { name, matches: response.matches }
  });
}
```

### 3. Consolidated List

The code references consolidated list URL but only uses SDN list.

---

## Recommendations

### P2 - Complete OFAC Implementation

| Task | Effort |
|------|--------|
| Add scheduled daily refresh | 0.5 day |
| Add alert on match | 0.5 day |
| Add consolidated list support | 0.5 day |
| Add batch screening endpoint | 0.5 day |
| **Total** | **2 days** |

---

## Files Involved

| File | Purpose |
|------|---------|
| `compliance-service/src/services/ofac-real.service.ts` | OFAC logic |
| `compliance-service/src/controllers/ofac.controller.ts` | Endpoints |
| `compliance-service/src/routes/ofac.routes.ts` | Routes |

---

## Related Documents

- `KYC_COMPLIANCE_FLOW_AUDIT.md` - Verification flow
- `RISK_ASSESSMENT_FLOW_AUDIT.md` - Risk scoring
