# API Gateway - 14 File Handling Audit

**Service:** api-gateway
**Document:** 14-file-handling.md
**Date:** 2025-12-26
**Auditor:** Cline
**Pass Rate:** 92% (12/13 applicable checks)

## Summary

N/A for most checks - Gateway is pure proxy. All file handling delegated to file-service (correct architecture).

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 0 | - |
| MEDIUM | 0 | - |
| LOW | 1 | Timeout may be short for large uploads |

## Gateway File Handling (N/A)

Pure proxy - no file handling at gateway level.
```typescript
createAuthenticatedProxy(server, {
  serviceUrl: `${serviceUrls.file}/api/v1/file`,
  serviceName: 'file',
  publicPaths: ['/health', '/metrics']
});
```

## Proxy Configuration (4/5)

- File service route registered - PASS
- Authentication required - PASS
- Public paths limited - PASS
- Large body support (50MB) - PASS
- Timeout for uploads - PARTIAL (5s may be short)

## What Gateway Should NOT Do (5/5)

- No multipart parsing - PASS (correct)
- No file storage - PASS (correct)
- No virus scanning - PASS (correct)
- No file type validation - PASS (correct)
- No file transformation - PASS (correct)

## Security at Gateway (3/3)

- Auth required for uploads - PASS
- Header sanitization applies - PASS
- Tenant isolation enforced - PASS

## Architecture
```
CLIENT → API GATEWAY → FILE SERVICE
         (proxy)       (file logic)
         
Gateway:            File Service:
- JWT verify        - Multipart parse
- Header sanitize   - Type validation
- Stream body       - Virus scan
- 50MB limit        - S3 upload
- Add tenant        - DB record
```

## Evidence

### Pure Proxy Pattern
```typescript
export default async function fileRoutes(server: FastifyInstance) {
  const authenticatedRoutes = createAuthenticatedProxy(server, {
    serviceUrl: `${serviceUrls.file}/api/v1/file`,
    serviceName: 'file',
    publicPaths: ['/health', '/metrics']
  });
  return authenticatedRoutes(server);
}
```

### Body Limits
```typescript
maxContentLength: 50 * 1024 * 1024,  // 50MB
maxBodyLength: 50 * 1024 * 1024      // 50MB
```

## Remediations

### LOW
Increase timeout for file routes:
```typescript
createAuthenticatedProxy(server, {
  timeout: 120000,  // 2 minutes
});
```

## Correct Architecture

Gateway correctly implements pure proxy:
- Files never written to gateway disk
- Large files streamed through
- Auth/tenant enforced before file-service
- File validation in dedicated service

**File handling should be audited in file-service, not gateway.**

File Handling Score: 92/100 (N/A for most - correct design)
