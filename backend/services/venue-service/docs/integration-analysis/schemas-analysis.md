# Venue Service Schemas Analysis

## Purpose: Integration Testing Documentation
## Source: venue.schema.ts, integration.schema.ts, params.schema.ts, settings.schema.ts
## Generated: January 18, 2026

---

## 📄 FILE 1: `venue.schema.ts`

### VALIDATION RULES

**Required Fields (createVenueSchema):**
- `name`: string, min: 2, max: 200
- `email`: string, email format, max: 255
- Must provide EITHER:
  - `address` object (street, city, state, zipCode, country) OR
  - Flat fields (address_line1, city, state_province)
- Must provide EITHER `capacity` OR `max_capacity` (integer, min: 1, max: 1,000,000)
- Must provide EITHER `type` OR `venue_type` (enum values)

**Optional Fields with Defaults:**
- `country_code`: default 'US', length: 2

**Enum Values:**
- `VENUE_TYPES`: 22 values
  - general, stadium, arena, theater, convention_center, concert_hall, amphitheater
  - comedy_club, nightclub, bar, lounge, cabaret, park, festival_grounds
  - outdoor_venue, sports_complex, gymnasium, museum, gallery, restaurant, hotel, other
- `STATUS_VALUES`: PENDING, ACTIVE, INACTIVE, SUSPENDED, CLOSED

**String Constraints:**
- `slug`: max 200, pattern: `/^[a-z0-9-]+$/`
- `description`: max 5000
- `phone`: max 20, pattern: `/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/`
- `website`: URI format, max 500
- `timezone`: max 50
- `business_name`: max 200
- `business_registration`: max 100
- `tax_id`: max 50
- `postal_code`: max 20
- `address_line1`: max 255
- `address_line2`: max 255
- `city`: max 100
- `state_province`: max 100
- `verification_level`: max 20
- `dress_code`: max 500
- `cancellation_policy`: max 5000
- `refund_policy`: max 5000

**Number Constraints:**
- Capacity fields: integer, min: 0/1, max: 1,000,000
  - `capacity` / `max_capacity`: min 1
  - `standing_capacity`: min 0
  - `seated_capacity`: min 0
  - `vip_capacity`: min 0
- `latitude`: -90 to 90
- `longitude`: -180 to 180
- `royalty_percentage`: 0-100, precision: 2
- `age_restriction`: integer, 0-99
- `average_rating`: 0-5, precision: 2
- `total_reviews`: integer, min 0
- `total_events`: integer, min 0
- `total_tickets_sold`: integer, min 0

**Blockchain Patterns:**
- `wallet_address`: max 44, pattern: `/^[A-Za-z0-9]+$/`
- `collection_address`: max 44, pattern: `/^[A-Za-z0-9]+$/`

**Array Constraints:**
- `image_gallery`: max 50 items, each URI max 1000
- `features`: max 100 items, each string max 100
- `accessibility_features`: max 100 items, each string max 100
- `prohibited_items`: max 100 items, each string max 100
- `tags`: max 50 items, each string max 50

**Query Parameters (venueQuerySchema):**
- `limit`: integer, 1-100, default: 20
- `offset`: integer, min: 0, default: 0
- `search`: string, max 100
- `type`/`venue_type`: enum VENUE_TYPES
- `status`: enum STATUS_VALUES
- `city`: string, max 100
- `state`: string, max 100
- `country`: string, length 2
- `is_verified`: boolean
- `min_capacity`: integer, min 0
- `max_capacity_filter`: integer, min 0
- `features`: string or array of strings
- `my_venues`: boolean
- `sort_by`: enum (name, created_at, capacity, rating, total_events), default: 'name'
- `sort_order`: enum (asc, desc), default: 'asc'

### SCHEMA RELATIONSHIPS

**Nested Objects:**
- `address`: {street, city, state, zipCode, country}
- `amenities`: pattern(any key, any value)
- `social_media`: pattern(string key, URI value)
- `metadata`: pattern(any key, any value)
- `settings`: object (unstructured)
- `onboarding`: object (unstructured)

**Backward Compatibility:**
- Accepts both old format (`address` object) and new format (flat fields)
- Accepts both `capacity`/`max_capacity` and `type`/`venue_type`

### REQUEST/RESPONSE SHAPES

- **createVenueSchema**: Request body validation
- **updateVenueSchema**: Request body validation (min 1 field required)
- **venueQuerySchema**: Query string parameters
- **venueIdSchema**: Route params (venueId UUID)

### ERROR MESSAGES

**Custom validation messages:**
- 'Either "address" object or flat address fields (address_line1, city, state_province) must be provided'
- 'Either "capacity" or "max_capacity" must be provided'
- 'Either "type" or "venue_type" must be provided'

### CROSS-FILE DEPENDENCIES

- **Imports**: `* as Joi from 'joi'`
- **Exports**: 
  - `createVenueSchema`
  - `updateVenueSchema`
  - `venueQuerySchema`
  - `venueIdSchema`
- **Constants exported**: `VENUE_TYPES`, `STATUS_VALUES` (used by other modules)

### 🚨 POTENTIAL ISSUES

1. **Inconsistent validation between create/update:**
   - Update allows `allow('', null)` on many fields, create doesn't
   - Could lead to data inconsistency

2. **Overly permissive schemas:**
   - `amenities`, `metadata`, `settings`, `onboarding` accept ANY values
   - No structure enforcement on these objects
   - Security risk: unbounded JSON objects

3. **Missing validation:**
   - No UUID validation for route param in `venueIdSchema` (just `.uuid()`)
   - Should use strict UUID v4 pattern like params.schema.ts

4. **Array size limits:**
   - Some arrays have limits (good), but very high (100 items for features)
   - No limits on nested array content size

5. **Backward compatibility complexity:**
   - Supporting both old and new field names increases complexity
   - Custom validation logic can be error-prone

6. **Read-only fields accepted in create:**
   - `average_rating`, `total_reviews`, `total_events`, `total_tickets_sold` should not be in create schema
   - These are calculated/aggregated values

---

## 📄 FILE 2: `integration.schema.ts`

### VALIDATION RULES

**Required Fields (createIntegrationSchema):**
- `provider` OR `type`: enum (square, stripe, toast, mailchimp, twilio)
- `credentials`: object (required, validated per provider)

**Provider-Specific Credentials:**

**Stripe:**
- `apiKey`: string, required
- `secretKey`: string, required
- `webhookSecret`: string, optional
- `accountId`: string, optional

**Square:**
- `accessToken`: string, required
- `applicationId`: string, required
- `locationId`: string, optional
- `environment`: enum (sandbox, production)

**Toast:**
- `clientId`: string, required
- `clientSecret`: string, required
- `restaurantGuid`: string, optional

**Mailchimp:**
- `apiKey`: string, required
- `serverPrefix`: string, required (e.g., 'us1')
- `listId`: string, optional

**Twilio:**
- `accountSid`: string, required
- `authToken`: string, required
- `phoneNumber`: string, optional

**Base Config Schema (non-sensitive):**
- `webhookUrl`: URI
- `apiVersion`: string, max 50
- `environment`: enum (sandbox, production)
- `features`: array, max 20 items, each string max 100 (RD7 fix applied)
- `enabled`: boolean

**Update Schema:**
- `config`: baseConfigSchema
- `status`: enum (active, inactive)
- `credentials`: object
- Min 1 field required
- `stripUnknown: true` applied

### SCHEMA RELATIONSHIPS

**Credential Schema Map:**
- Dynamic validation based on provider type
- Map: `{ stripe, square, toast, mailchimp, twilio }`
- Custom validator applies provider-specific schema based on `provider` or `type` field

### REQUEST/RESPONSE SHAPES

- **createIntegrationSchema**: Request body validation
- **updateIntegrationSchema**: Request body validation

### ERROR MESSAGES

**Custom messages:**
- 'Either "provider" or "type" is required' (via `.or()` validation)
- 'Invalid credentials for {provider}: {error.message}' (custom validation)
- 'object.missing': 'Either "provider" or "type" is required'

### CROSS-FILE DEPENDENCIES

- **Imports**: `* as Joi from 'joi'`
- **Exports**: 
  - `createIntegrationSchema`
  - `updateIntegrationSchema`
  - `credentialSchemaMap` (for use in other modules)

### 🚨 POTENTIAL ISSUES

1. **Security enhancements noted:**
   - ✅ FIXED (SD6): Removed `.unknown(true)` to prevent arbitrary properties
   - ✅ FIXED (RD7): Added `maxItems` constraint to arrays (max 20 for features)
   - ✅ Uses `stripUnknown: true` on all credential schemas

2. **Update credentials validation:**
   - Update schema accepts `credentials` object but doesn't validate per provider
   - Should apply same provider-specific validation on updates
   - Could accept invalid credentials for a provider

3. **No response schemas:**
   - Missing schemas for GET responses
   - No validation for what data is returned to clients
   - Credentials might be exposed in responses

4. **Limited providers:**
   - Only 5 providers supported
   - Adding new providers requires code changes to credentialSchemaMap
   - Not extensible

5. **No string length limits on credentials:**
   - API keys, tokens, secrets have no max length
   - Could accept extremely long values

---

## 📄 FILE 3: `params.schema.ts`

### VALIDATION RULES

**UUID Pattern:**
- Regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
- Validates UUID v4 format strictly (SECURITY FIX RD3)

**Param Schemas:**

1. **venueIdParamsSchema:**
   - `venueId`: UUID v4, required
   - `.unknown(false)` - rejects unknown properties (RD6 fix)
   - Custom error messages

2. **integrationIdParamsSchema:**
   - `venueId`: UUID v4, required
   - `integrationId`: UUID v4, required
   - `.unknown(false)` - rejects unknown properties (RD6 fix)
   - Custom error messages

3. **contentIdParamsSchema:**
   - `venueId`: UUID v4, required
   - `contentId`: UUID v4, required
   - ⚠️ Missing `.unknown(false)`

4. **reviewIdParamsSchema:**
   - `venueId`: UUID v4, required
   - `reviewId`: UUID v4, required
   - ⚠️ Missing `.unknown(false)`

**Factory Functions:**
- `createUuidParamSchema(paramName)`: Single UUID param
- `createMultipleUuidParamsSchema(paramNames[])`: Multiple UUID params
- Both generate schemas with strict UUID v4 pattern validation

**TypeBox Schemas (alternative):**
- `venueIdParamsSchemaTypebox`
- `integrationIdParamsSchemaTypebox`
- Format: 'uuid', `additionalProperties: false` (RD6 fix)
- Compatible with Fastify's built-in type provider

### ERROR MESSAGES

**Custom messages per schema:**
- 'string.pattern.base': '{paramName} must be a valid UUID'
- 'any.required': '{paramName} is required'

### CROSS-FILE DEPENDENCIES

- **Imports**: `* as Joi from 'joi'`
- **Exports**: 
  - `venueIdParamsSchema`
  - `integrationIdParamsSchema`
  - `contentIdParamsSchema`
  - `reviewIdParamsSchema`
  - `createUuidParamSchema` (factory function)
  - `createMultipleUuidParamsSchema` (factory function)
  - `venueIdParamsSchemaTypebox`
  - `integrationIdParamsSchemaTypebox`
  - `UUID_REGEX` (exported constant)

### 🚨 POTENTIAL ISSUES

1. **Inconsistent `.unknown(false)` application:**
   - ✅ Applied to: venueIdParamsSchema, integrationIdParamsSchema
   - ❌ Missing from: contentIdParamsSchema, reviewIdParamsSchema
   - Factory functions don't include this protection
   - Security vulnerability: could accept extra params

2. **TypeBox schemas incomplete:**
   - Only 2 TypeBox schemas provided (venueId, integrationId)
   - No contentId or reviewId versions
   - Inconsistent with Joi schema offerings

3. **No validation on factory output:**
   - `createMultipleUuidParamsSchema` doesn't add `.unknown(false)`
   - Could be security issue if used for sensitive routes

4. **UUID_REGEX not exported:**
   - Useful regex pattern but not explicitly exported
   - Other modules might duplicate this pattern

---

## 📄 FILE 4: `settings.schema.ts`

### VALIDATION RULES

**updateSettingsSchema (all optional nested fields):**

**general:**
- `timezone`: string, max 50
- `currency`: string, length 3 (ISO 4217)
- `language`: string, length 2 (ISO 639-1)
- `dateFormat`: string, max 20
- `timeFormat`: enum ('12h', '24h')

**ticketing:**
- `allowRefunds`: boolean
- `refundWindow`: number, 0-720 hours (max 30 days)
- `maxTicketsPerOrder`: number, 1-100
- `requirePhoneNumber`: boolean
- `enableWaitlist`: boolean
- `transferDeadline`: number, 0-168 hours (max 7 days)

**notifications:**
- `emailEnabled`: boolean
- `smsEnabled`: boolean
- `webhookUrl`: URI, allow empty string
- `notifyOnPurchase`: boolean
- `notifyOnRefund`: boolean
- `dailyReportEnabled`: boolean

**branding:**
- `primaryColor`: string, pattern: `/^#[0-9A-F]{6}$/i` (hex color)
- `secondaryColor`: string, pattern: `/^#[0-9A-F]{6}$/i` (hex color)
- `logo`: URI, allow empty string
- `emailFooter`: string, max 500

**Root level:**
- `.min(1)` - at least one top-level field required

### SCHEMA RELATIONSHIPS

**Nested Objects:**
- 4 top-level categories: general, ticketing, notifications, branding
- All fields within categories are optional
- No inter-category dependencies

### REQUEST/RESPONSE SHAPES

- **updateSettingsSchema**: Request body validation only
- ❌ No GET schema (response validation)
- ❌ No CREATE schema (only update)

### ERROR MESSAGES

- Uses default Joi error messages
- No custom error messages defined

### CROSS-FILE DEPENDENCIES

- **Imports**: `* as Joi from 'joi'`
- **Exports**: 
  - `updateSettingsSchema` only

### 🚨 POTENTIAL ISSUES

1. **No create schema:**
   - Only update schema exists
   - Assumes settings exist on venue creation?
   - No default values defined in schema
   - Unclear initialization behavior

2. **No response validation:**
   - Missing GET settings schema
   - Can't validate what's returned to clients
   - Could leak sensitive data

3. **Partial updates unclear:**
   - Can update single fields within categories
   - Unclear if partial updates merge or replace entire category
   - No documentation of merge behavior

4. **No `.unknown(false)` or `.stripUnknown()`:**
   - Could accept arbitrary properties
   - Security risk: extra fields could be stored
   - No protection against typos

5. **Weak currency validation:**
   - Only validates length (3 chars)
   - Doesn't validate against ISO 4217 list
   - Could accept invalid codes like "XXX" or "AAA"

6. **Weak language validation:**
   - Only validates length (2 chars)
   - Doesn't validate against ISO 639-1 list
   - Could accept invalid codes

7. **No max constraint on webhookUrl:**
   - URI validation but no length limit
   - Could accept extremely long URLs
   - Potential DoS vector

8. **Time window validation:**
   - Uses hours (0-720, 0-168)
   - No validation that these are sensible business hours
   - Could set 0 hours refund window (instant refund)

9. **Missing fields:**
   - No validation for settings retrieval
   - No error handling for missing categories

---

## 🎯 CROSS-FILE PATTERNS & ISSUES

### Common Security Enhancements

**Security Fixes Implemented:**
- **RD3 Fix**: Strict UUID v4 regex pattern for route params (params.schema.ts)
- **RD6 Fix**: Added `.unknown(false)` to reject unknown properties (partial implementation)
- **RD7 Fix**: Added `maxItems` constraints to arrays (partial implementation)
- **SD6 Fix**: Removed `.unknown(true)` from integration credentials

### Inconsistencies Across Files

**1. UUID Validation:**
- ✅ `params.schema.ts`: Strict UUID v4 regex pattern `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
- ❌ `venue.schema.ts`: Just `.uuid()` without strict pattern
- **Recommendation**: Use strict pattern everywhere for consistency and security

**2. Unknown Property Handling:**
- ✅ `integration.schema.ts`: Uses `stripUnknown: true` on all schemas
- ✅ `params.schema.ts`: Uses `.unknown(false)` on venueId/integrationId schemas
- ❌ `params.schema.ts`: Missing `.unknown(false)` on contentId/reviewId schemas
- ❌ `venue.schema.ts`: No protection against unknown properties
- ❌ `settings.schema.ts`: No protection against unknown properties
- **Impact**: Security vulnerability, could accept malicious extra fields

**3. Array Size Limits:**
- ✅ `integration.schema.ts`: features max 20 (reasonable)
- ⚠️ `venue.schema.ts`: Very high limits (50-100 items)
  - `image_gallery`: max 50
  - `features`: max 100
  - `accessibility_features`: max 100
  - `prohibited_items`: max 100
  - `tags`: max 50
- ❌ No limits on nested array content size
- **Recommendation**: Review and reduce limits, add nested content size limits

**4. Error Messages:**
- ✅ `params.schema.ts`: Custom messages per field type
- ✅ `venue.schema.ts`: Custom messages for complex validation logic
- ✅ `integration.schema.ts`: Custom messages for provider validation
- ❌ `settings.schema.ts`: Default messages only
- **Impact**: Less helpful error responses for settings validation

**5. Field Name Duplication (Backward Compatibility):**
- `venue.schema.ts` only:
  - `capacity` / `max_capacity`
  - `type` / `venue_type`
  - `address` object / flat address fields
- **Impact**: Increased complexity, potential for confusion, validation logic more complex

### Missing Schemas Across All Files

1. **No response schemas** in any file
   - Can't validate GET responses
   - Can't ensure data consistency
   - Could leak sensitive fields

2. **No error response schemas**
   - Inconsistent error formats
   - No validation of error payloads

3. **settings.schema.ts**: Missing create schema
   - Only has update schema
   - Initialization unclear

4. **No DELETE validation schemas**
   - No validation for delete operations
   - No confirmation schemas

5. **No PATCH vs PUT distinction**
   - Update schemas unclear if partial or full replacement

### Security Concerns Summary

| Issue | Files Affected | Severity | Fix Required |
|-------|----------------|----------|--------------|
| Unknown properties accepted | venue, settings, params (partial) | HIGH | Add `.unknown(false)` or `stripUnknown: true` |
| Read-only fields in create | venue | MEDIUM | Remove or flag as error |
| Unbounded objects (metadata, settings) | venue | HIGH | Add structure or size limits |
| Weak enum validation (currency, language) | settings | MEDIUM | Validate against actual ISO lists |
| Missing response validation | all | MEDIUM | Add response schemas |
| Very high array limits | venue | LOW | Review and reduce |
| No credential length limits | integration | MEDIUM | Add max length constraints |
| Missing `.unknown(false)` on some params | params | HIGH | Apply consistently |

### Testing Implications

**High Priority Test Cases:**
1. Custom validation logic (address format, capacity, type requirements)
2. Provider-specific credential validation
3. UUID format validation (strict vs lenient)
4. Unknown property rejection (security critical)
5. Array size limit enforcement
6. Backward compatibility (dual field names)
7. Partial update behavior
8. Enum value validation
9. Regex pattern validation (blockchain addresses, phone, colors, slugs)
10. Nested object validation depth
11. Null vs empty string vs undefined handling
12. Boundary values for all numeric constraints

---

## ✅ SUMMARY

**Files analyzed:** 4/4
- `venue.schema.ts`: 4 schemas (create, update, query, params)
- `integration.schema.ts`: 2 schemas + 5 provider credential schemas
- `params.schema.ts`: 6 schemas + 2 factory functions + 2 TypeBox schemas
- `settings.schema.ts`: 1 schema (update only)

**Total schemas identified:** 12+ schemas

**Security issues found:** 8 major issues
- 3 HIGH severity (unknown properties, unbounded objects, missing param validation)
- 4 MEDIUM severity (read-only fields, weak enums, no credential limits, missing responses)
- 1 LOW severity (high array limits)

**Inconsistencies found:** 5 categories
- UUID validation approaches (2 different methods)
- Unknown property handling (3 different approaches)
- Array size limits (inconsistent application)
- Error messages (custom vs default)
- Backward compatibility (only in venue schema)

**Missing features:**
- Response validation schemas (all files)
- Create settings schema
- Error response schemas
- DELETE operation validation
- PATCH vs PUT distinction

**Security fixes already applied:**
- RD3: UUID v4 strict pattern (params.schema.ts)
- RD6: `.unknown(false)` on some params schemas
- RD7: Array size limits on integration features
- SD6: Removed `.unknown(true)` from credentials

**Security fixes needed:**
- Apply `.unknown(false)` or `stripUnknown: true` consistently
- Add structure to unbounded objects
- Remove read-only fields from create schemas
- Add string length limits to credentials
- Validate ISO codes against actual lists
- Add response validation

---

## 🧪 INTEGRATION TEST REQUIREMENTS

### Validation Tests (per schema)

| Schema | Test File | Key Test Cases |
|--------|-----------|----------------|
| **createVenueSchema** | `venue-validation.integration.test.ts` | • Required fields validation (name, email)<br>• Enum values (VENUE_TYPES, STATUS_VALUES)<br>• Address formats (object vs flat fields)<br>• Capacity bounds (1-1,000,000)<br>• Backward compatibility (capacity/max_capacity, type/venue_type)<br>• Custom validation (address OR flat fields required)<br>• Regex patterns (slug, phone, blockchain addresses)<br>• Array size limits (image_gallery, features, tags)<br>• Nested objects (amenities, metadata, social_media)<br>• Read-only fields rejection (ratings, counts) |
| **updateVenueSchema** | `venue-validation.integration.test.ts` | • Partial updates (min 1 field required)<br>• Null/empty handling (allow('', null) fields)<br>• Optional field updates<br>• Array updates (replace vs merge)<br>• Nested object updates<br>• Status transitions<br>• Backward compatibility fields |
| **venueQuerySchema** | `venue-validation.integration.test.ts` | • Pagination limits (limit: 1-100, offset >= 0)<br>• Default values (limit: 20, offset: 0)<br>• Sort options (sort_by, sort_order)<br>• Filter combinations (type, status, city, state)<br>• Search string validation (max 100)<br>• Features filter (string or array)<br>• Boolean filters (is_verified, my_venues) |
| **venueIdSchema** | `(covered in route tests)` | • UUID validation (should use strict v4 pattern)<br>• Invalid UUID formats<br>• Missing venueId |
| **createIntegrationSchema** | `integration-validation.integration.test.ts` | • Provider-specific credentials (all 5 providers)<br>• Unknown property rejection (stripUnknown)<br>• Provider/type field requirement (.or validation)<br>• Credential validation per provider<br>• Config field validation<br>• Features array size limit (max 20)<br>• Environment enum (sandbox, production)<br>• Required vs optional credential fields per provider |
| **updateIntegrationSchema** | `integration-validation.integration.test.ts` | • Partial credential updates<br>• Status transitions (active, inactive)<br>• Config updates<br>• Min 1 field requirement<br>• stripUnknown enforcement |
| **venueIdParamsSchema** | `(covered in route tests)` | • UUID v4 format validation (strict regex)<br>• Unknown param rejection (.unknown(false))<br>• Missing venueId<br>• Invalid UUID formats<br>• Custom error messages |
| **integrationIdParamsSchema** | `(covered in route tests)` | • UUID v4 format for both params<br>• Unknown param rejection (.unknown(false))<br>• Missing params<br>• Invalid UUID formats<br>• Custom error messages |
| **contentIdParamsSchema** | `(covered in route tests)` | • UUID v4 format for both params<br>• ⚠️ Test unknown param acceptance (missing .unknown(false))<br>• Missing params |
| **reviewIdParamsSchema** | `(covered in route tests)` | • UUID v4 format for both params<br>• ⚠️ Test unknown param acceptance (missing .unknown(false))<br>• Missing params |
| **updateSettingsSchema** | `settings-validation.integration.test.ts` | • Nested partial updates (per category)<br>• Color patterns (hex validation)<br>• URL validation (webhookUrl, logo)<br>• Currency length (3 chars) - test invalid codes<br>• Language length (2 chars) - test invalid codes<br>• TimeFormat enum ('12h', '24h')<br>• Number ranges (refundWindow: 0-720, transferDeadline: 0-168)<br>• Min 1 field requirement<br>• ⚠️ Unknown property acceptance (missing .unknown(false))<br>• Empty string handling (webhookUrl, logo) |

### Security Test Cases

**1. Unknown Property Rejection**
- ❌ venue.schema.ts: Test that extra properties ARE accepted (vulnerability)
- ✅ integration.schema.ts: Test that extra properties are stripped
- ✅ params (venueId/integrationId): Test that extra params are rejected
- ❌ params (contentId/reviewId): Test that extra params ARE accepted (vulnerability)
- ❌ settings.schema.ts: Test that extra properties ARE accepted (vulnerability)

**2. Read-Only Field Rejection on Create**
- Test `createVenueSchema` rejects:
  - `average_rating`
  - `total_reviews`
  - `total_events`
  - `total_tickets_sold`
  - `is_verified` (should be set by system)
  - `verified_at` (should be set by system)

**3. Array Size Limit Enforcement**
- Test enforcement of:
  - `image_gallery`: max 50 items
  - `features`: max 100 items (consider if too high)
  - `accessibility_features`: max 100 items
  - `prohibited_items`: max 100 items
  - `tags`: max 50 items
  - Integration `features`: max 20 items
- Test rejection when exceeding limits
- Test nested array content size (should have limits but doesn't)

**4. Regex Pattern Bypass Attempts**
- **Phone pattern**: Test international formats, special chars
- **Wallet address**: Test with invalid chars, wrong length
- **Collection address**: Test with invalid chars, wrong length
- **Slug**: Test with uppercase, underscores, special chars
- **Hex colors**: Test without #, wrong length, invalid chars
- **UUID v4**: Test v1/v5 UUIDs, test non-UUID strings

**5. Unbounded Object Security**
- Test large `metadata` objects (should have size limit)
- Test large `amenities` objects (should have size limit)
- Test large `settings` objects (should have size limit)
- Test deeply nested objects (should have depth limit)
- Test circular references

**6. Credential Validation Security**
- Test mismatched credentials for provider (wrong provider's creds)
- Test empty required credential fields
- Test extremely long credential strings (no max length defined)
- Test credential field injection (SQL, NoSQL)

**7. Enum Validation**
- Test invalid venue types
- Test invalid status values
- Test invalid environment values
- Test case sensitivity
- Test invalid currency codes (only length validated)
- Test invalid language codes (only length validated)

**8. Input Sanitization**
- Test XSS in string fields (name, description, etc.)
- Test SQL injection patterns
- Test NoSQL injection patterns
- Test command injection in webhook URLs

### Edge Cases

**1. Empty Strings vs Null vs Undefined**
- Test fields with `allow('', null)`:
  - phone, website, description, address_line2, etc.
- Test fields without `allow('', null)`:
  - name, email, etc.
- Test behavior difference between create and update

**2. Boundary Values (min/max for all number fields)**
- Capacity: test 0, 1, 1000000, 1000001
- Latitude: test -90, -91, 90, 91, 0
- Longitude: test -180, -181, 180, 181, 0
- Royalty: test -0.01, 0, 100, 100.01
- Age restriction: test -1, 0, 99, 100
- Rating: test -0.01, 0, 5, 5.01
- Refund window: test -1, 0, 720, 721
- Transfer deadline: test -1, 0, 168, 169
- Max tickets: test 0, 1, 100, 101
- Pagination limit: test 0, 1, 100, 101
- Pagination offset: test -1, 0, 1000000

**3. Unicode in String Fields**
- Test emoji in name, description
- Test multi-byte characters (Chinese, Arabic, etc.)
- Test RTL text
- Test combining characters
- Test zero-width characters

**4. Very Long Strings at Max Length**
- Test exactly at max length (should pass)
- Test max length + 1 (should fail)
- Test fields with no max length (security issue)
- Test URL fields with very long but valid URLs

**5. Array Edge Cases**
- Empty arrays (should be allowed?)
- Null arrays vs undefined arrays
- Arrays with null/undefined items
- Arrays with empty string items
- Mixed type arrays (should fail)

**6. Backward Compatibility Edge Cases**
- Provide both `capacity` AND `max_capacity` (which takes precedence?)
- Provide both `type` AND `venue_type` (which takes precedence?)
- Provide both `address` object AND flat fields (which takes precedence?)
- Provide neither (should fail with custom error)

**7. Nested Object Edge Cases**
- Empty nested objects
- Null nested objects
- Undefined nested objects
- Nested objects with unexpected structure
- Deeply nested metadata (10+ levels)

**8. Date/Time Edge Cases**
- ISO date formats (verified_at)
- Invalid ISO dates
- Future dates
- Very old dates (year 1900, etc.)
- Timezone handling

**9. URI/URL Edge Cases**
- Relative URLs (should fail)
- URLs without protocol (should fail)
- localhost URLs
- IP address URLs
- URLs with auth (user:pass@host)
- URLs with fragments
- Very long URLs
- International domain names (IDN)

**10. Partial Update Edge Cases**
- Update with empty object (should fail min(1))
- Update with only null values
- Update with only empty strings
- Update nested object partially
- Update array (append vs replace)

### Test Coverage Goals

**Per Schema:**
- ✅ All required fields validated
- ✅ All optional fields validated
- ✅ All enum values tested (valid + invalid)
- ✅ All regex patterns tested (valid + invalid)
- ✅ All min/max constraints tested (boundary values)
- ✅ All array limits tested
- ✅ All custom validation functions tested
- ✅ All error messages verified

**Cross-Schema:**
- ✅ Consistency in UUID validation
- ✅ Consistency in unknown property handling
- ✅ Consistency in array limit enforcement
- ✅ Consistency in error message format

**Security:**
- ✅ All injection attempts blocked
- ✅ All size limits enforced
- ✅ All regex bypasses prevented
- ✅ All unknown properties handled correctly
- ✅ All credential validations enforced

---

## 📋 RECOMMENDED ACTIONS

### Immediate (High Priority)

1. **Apply `.unknown(false)` consistently**
   - Add to venue.schema.ts (all schemas)
   - Add to settings.schema.ts
   - Add to params.schema.ts (contentId, reviewId schemas)
   - Add to factory functions in params.schema.ts

2. **Add response validation schemas**
   - Create GET response schemas for all entities
   - Define error response schemas
   - Ensure sensitive fields (credentials) are excluded from responses

3. **Remove read-only fields from create schemas**
   - Remove average_rating, total_reviews, total_events, total_tickets_sold from createVenueSchema

4. **Add structure to unbounded objects**
   - Define schema for metadata object
   - Define schema for amenities object
   - Define schema for settings object
   - Add max size constraints

### Medium Priority

5. **Strengthen ISO code validation**
   - Validate currency against actual ISO 4217 codes
   - Validate language against actual ISO 639-1 codes
   - Validate country_code against ISO 3166-1 alpha-2

6. **Add credential field constraints**
   - Add max length to all credential fields
   - Add format validation where applicable

7. **Review and reduce array limits**
   - Consider if 100 items for features is reasonable
   - Add nested content size limits

8. **Apply strict UUID validation everywhere**
   - Use UUID v4 regex pattern from params.schema.ts in venue.schema.ts

### Low Priority

9. **Add create schema for settings**
   - Define default values
   - Document initialization behavior

10. **Distinguish PATCH vs PUT**
    - Clarify partial vs full updates
    - Document merge behavior

11. **Add DELETE validation**
    - Confirmation schemas
    - Cascade behavior validation

12. **Improve extensibility**
    - Make integration providers more dynamic
    - Consider plugin architecture for new providers

---

**END OF ANALYSIS**
