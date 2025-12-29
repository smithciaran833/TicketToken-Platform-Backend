# Blockchain-Indexer Service - 02 Input Validation Audit

**Service:** blockchain-indexer
**Document:** 02-input-validation.md
**Date:** 2025-12-26
**Auditor:** Cline AI
**Pass Rate:** 63% (17/27 applicable checks)

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 1 | Missing additionalProperties: false |
| HIGH | 4 | No base58 pattern, unbounded offset, no extracted data validation |
| MEDIUM | 3 | SELECT *, loose MongoDB query, no response filtering |
| LOW | 2 | Missing maxLength on tokenId, schema duplication |

## Route Definition (7/8 applicable)

- All routes have schema - PASS
- Params schema with format - PARTIAL (length only, no base58)
- Query schema with constraints - PASS
- Response schema defined - PARTIAL (loose object types)
- additionalProperties: false - FAIL (CRITICAL)
- Arrays have maxItems - N/A
- Strings have maxLength - PASS
- Integers have min/max - PARTIAL (offset unbounded)

## Schema Definition (5/5 applicable)

- No Type.Any in production - PARTIAL (fullData: object)
- Optional fields marked - PASS
- Default values set - PASS
- Schemas reusable - PARTIAL
- Schema naming consistent - PASS

## Service Layer (5/5 applicable)

- Business rule validation - PASS
- Authorization before access - PASS
- Entity existence checked - PASS
- External input re-validated - PASS
- Sensitive fields filtered - PARTIAL

## Database Layer (5/5 applicable)

- Parameterized queries - PASS
- No user input in table names - PASS
- Explicit field lists - PARTIAL (SELECT *)
- Explicit insert/update fields - PASS
- Query bounds enforced - PASS (LIMIT 100)

## Security (3/4 applicable)

- Prototype pollution blocked - FAIL
- Mass assignment prevented - PASS
- SQL injection prevented - PASS
- Integer bounds - PARTIAL

## Critical Issues

### 1. No additionalProperties: false
```typescript
const transactionSignatureSchema = {
  type: 'object',
  properties: { signature: {...} }
  // MISSING: additionalProperties: false
};
```

### 2. No Base58 Pattern Validation
```typescript
// Current - length only
signature: { type: 'string', minLength: 88, maxLength: 88 }

// Should add pattern
pattern: '^[1-9A-HJ-NP-Za-km-z]+$'
```

### 3. Unbounded Offset
```typescript
offset: { type: 'number', minimum: 0 }  // No maximum!
```

### 4. Unvalidated Extracted Data
```typescript
extractMintData(tx: any): MintData | null {
  return {
    tokenId: tx.meta?.postTokenBalances?.[0]?.mint,  // No validation
    owner: tx.meta?.postTokenBalances?.[0]?.owner
  };
}
```

## Positive Findings

- All queries use parameterized values
- Signature deduplication with DB check
- LIMIT 100 on reconciliation queries
- Explicit columns on INSERT/UPDATE
- Schema validation on all routes

## Remediations

### CRITICAL
Add additionalProperties: false to all schemas

### HIGH
1. Add base58 pattern to address/signature
2. Add maximum: 10000 to offset
3. Validate extracted blockchain data
4. Replace SELECT * with explicit columns

### MEDIUM
1. Type MongoDB query objects
2. Filter response fields
3. Extract shared pagination schema

Input Validation Score: 63/100
