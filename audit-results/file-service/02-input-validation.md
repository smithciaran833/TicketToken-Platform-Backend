## File Service - Input Validation Audit Report

**Audit Date:** December 28, 2025  
**Service:** file-service  
**Standard:** Docs/research/02-input-validation.md

---

## 3.1 Route Definition Checklist

| ID | Check | Severity | Status | Evidence |
|----|-------|----------|--------|----------|
| RD1 | All routes have schema validation | CRITICAL | ❌ FAIL | No schema definitions on ANY route |
| RD2 | Body schema defined for POST/PUT/PATCH | CRITICAL | ❌ FAIL | All POST routes lack body schema validation |
| RD3 | Params schema defined with format validation | HIGH | ❌ FAIL | :fileId params have no UUID format validation |
| RD4 | Query schema defined with type constraints | HIGH | ❌ FAIL | No query schemas defined anywhere |
| RD5 | Response schema defined | MEDIUM | ❌ FAIL | No response schemas |
| RD6 | additionalProperties: false on all schemas | CRITICAL | ❌ FAIL | No schemas exist |
| RD7 | Arrays have maxItems constraint | HIGH | ⚠️ PARTIAL | metadata has .max(50) but bulkDelete unlimited |
| RD8 | Strings have maxLength constraint | HIGH | ✅ PASS | fileName maxLength 255 |
| RD9 | Integers have minimum and maximum | MEDIUM | ✅ PASS | width/height have min 1, max 10000 |

---

## 3.2 Critical Finding: Validators Exist But NOT Used

### Controllers NOT Using Validators

| Controller | Method | Issue |
|------------|--------|-------|
| image.controller.ts | resize | request.body as any - no validation |
| image.controller.ts | crop | request.body as any - no validation |
| image.controller.ts | rotate | request.body as { angle: number } - no validation |
| image.controller.ts | watermark | request.body as any - no validation |
| qr.controller.ts | generateQRCode | request.body as any - no validation |
| document.controller.ts | convertFormat | request.body as { format: string } - no validation |
| video.controller.ts | transcode | request.body as any - no validation |
| admin.controller.ts | bulkDelete | No UUID validation on fileIds |

---

## 3.3 Mass Assignment Vulnerabilities

### High Risk: Admin Bulk Delete
- No validation that fileIds are UUIDs
- No maxItems limit - could pass thousands of IDs

### Medium Risk: SVG Watermark (XSS)
- text directly embedded in SVG without sanitization

---

## Summary

### Critical Issues (5)

| # | Issue | Recommendation |
|---|-------|----------------|
| 1 | No Fastify schema validation | Implement TypeBox schemas in route definitions |
| 2 | Validators not integrated | Import and use Joi validators OR migrate to TypeBox |
| 3 | as any type casting | Replace with validated typed inputs |
| 4 | bulkDelete no array limit | Add maxItems constraint |
| 5 | SVG watermark XSS risk | Sanitize text input before SVG embedding |

### High Severity Issues (4)

| # | Issue | Recommendation |
|---|-------|----------------|
| 1 | UUID params not validated | Add format: 'uuid' to all :fileId params |
| 2 | No response schemas | Add response schemas to prevent data leakage |
| 3 | Video transcode accepts any format | Validate format against allowlist |
| 4 | QR endpoints no validation | Use generateQRSchema from validators |

---

### Overall Input Validation Score: **38/100**

**Risk Level:** CRITICAL
