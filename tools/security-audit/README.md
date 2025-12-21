# Security Audit Tool

Automated security and input validation scanner for TicketToken services.

## Overview

This tool automatically scans your services for common security and input validation issues using pattern matching with `ripgrep (rg)`. It generates detailed JSON reports with specific file locations and code snippets for each finding.

## Features

### Input Validation Checks

- **RD1**: Routes without schema validation
- **RD2**: Schemas without `.unknown(false)` (mass assignment risk)
- **RD3**: String fields without `maxLength` constraint
- **RD4**: URL params (`:id`, `:userId`, etc.) without validation
- **SD1**: Array fields without `maxItems` constraint
- **SL1**: Direct `request.body` spread into queries
- **SL2**: SQL queries with string interpolation (SQL injection risk)

### Security Checks

- **SEC-R1**: Routes without authentication middleware
- **SEC-R2**: JWT using `decode` instead of `verify`
- **SEC-R6**: Hardcoded secrets (variables with SECRET/KEY/PASSWORD)
- **SEC-DB1**: Database connection without SSL/TLS
- **SEC-S5**: Queries without `tenant_id` filter (multi-tenant isolation)
- **SEC-DB10**: Logs containing sensitive data (password/token/secret)
- **SEC-R7/R8/R9**: Missing rate limiting on auth endpoints

## Installation

Requires `ripgrep` (rg) to be installed:

```bash
# Ubuntu/Debian
sudo apt install ripgrep

# macOS
brew install ripgrep

# Windows (via Chocolatey)
choco install ripgrep
```

## Usage

### Scan a Single Service

```bash
# Using tsx (recommended)
npx tsx tools/security-audit/run-audit.ts --service=auth-service

# Or using ts-node
npx ts-node tools/security-audit/run-audit.ts --service=auth-service
```

### Output

The tool generates:

1. **Console summary** with finding counts and top issues
2. **JSON report** saved to `audit-results/<service-name>.json`

### Example Output

```
🔎 TicketToken Security Audit Tool
====================================
Service: auth-service
Path: backend/services/auth-service
Time: 2025-12-21T01:02:16.341Z

🔍 Scanning Input Validation for: backend/services/auth-service
   Found 67 input validation findings

🔒 Scanning Security for: backend/services/auth-service
   Found 66 security findings

📊 Audit Summary
================
Total Findings: 133

By Severity:
  🔴 CRITICAL: 55
  🟠 HIGH:     52
  🟡 MEDIUM:   26
  🟢 LOW:      0

By Category:
  Input Validation: 67
  Security:         66

🔝 Top Findings:
===============
  🔴 SEC-R1: Route without authentication middleware (32 occurrences)
  🔴 SEC-S5: Database query without tenant_id filter (22 occurrences)
  🟠 RD1: Route without schema validation (39 occurrences)
  🟡 RD3: String field without maxLength constraint (26 occurrences)

✅ Audit complete!
📄 Results saved to: audit-results/auth-service.json
```

## JSON Report Format

Each finding includes:

```json
{
  "checkId": "RD1",
  "description": "Route without schema validation",
  "file": "src/routes/auth.routes.ts",
  "line": 45,
  "code": "fastify.get('/sessions', async (req, reply) => {",
  "severity": "HIGH"
}
```

Full report structure:

```json
{
  "service": "auth-service",
  "timestamp": "2025-12-21T01:02:16.939Z",
  "summary": {
    "totalFindings": 133,
    "bySeverity": {
      "CRITICAL": 55,
      "HIGH": 52,
      "MEDIUM": 26,
      "LOW": 0
    },
    "byCategory": {
      "inputValidation": 67,
      "security": 66
    }
  },
  "findings": {
    "inputValidation": [...],
    "security": [...]
  }
}
```

## View Results

```bash
# Pretty print JSON with jq
cat audit-results/auth-service.json | jq

# View in VS Code
code audit-results/auth-service.json

# Filter by severity
cat audit-results/auth-service.json | jq '.findings | .inputValidation + .security | map(select(.severity == "CRITICAL"))'

# Count findings by check ID
cat audit-results/auth-service.json | jq '.findings | .inputValidation + .security | group_by(.checkId) | map({checkId: .[0].checkId, count: length}) | sort_by(-.count)'
```

## Scan All Services

Create a bash script to scan all services:

```bash
#!/bin/bash
# scan-all-services.sh

SERVICES=(
  "auth-service"
  "venue-service"
  "event-service"
  "ticket-service"
  "payment-service"
  "marketplace-service"
  "analytics-service"
  "notification-service"
  "integration-service"
  "compliance-service"
  "queue-service"
  "search-service"
  "file-service"
  "monitoring-service"
  "blockchain-service"
  "order-service"
)

for service in "${SERVICES[@]}"; do
  echo "Scanning $service..."
  npx tsx tools/security-audit/run-audit.ts --service="$service" || true
done

echo "✅ All services scanned!"
echo "📊 Generating summary..."

# Generate combined summary
node -e "
const fs = require('fs');
const services = $(echo ${SERVICES[@]} | jq -R 'split(\" \")');
const results = [];

for (const service of services) {
  try {
    const data = JSON.parse(fs.readFileSync(\`audit-results/\${service}.json\`, 'utf8'));
    results.push({
      service,
      totalFindings: data.summary.totalFindings,
      critical: data.summary.bySeverity.CRITICAL,
      high: data.summary.bySeverity.HIGH
    });
  } catch (e) {
    console.error(\`Failed to read \${service}: \${e.message}\`);
  }
}

results.sort((a, b) => b.critical - a.critical);

console.log('\n📊 Summary of All Services\n');
console.log('Service                  | Total | Critical | High');
console.log('-------------------------|-------|----------|------');
for (const r of results) {
  console.log(\`\${r.service.padEnd(24)} | \${String(r.totalFindings).padStart(5)} | \${String(r.critical).padStart(8)} | \${String(r.high).padStart(4)}\`);
}

const totals = results.reduce((acc, r) => ({
  totalFindings: acc.totalFindings + r.totalFindings,
  critical: acc.critical + r.critical,
  high: acc.high + r.high
}), {totalFindings: 0, critical: 0, high: 0});

console.log('-------------------------|-------|----------|------');
console.log(\`TOTAL                    | \${String(totals.totalFindings).padStart(5)} | \${String(totals.critical).padStart(8)} | \${String(totals.high).padStart(4)}\`);
"
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Security Audit

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  security-audit:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install ripgrep
        run: sudo apt-get install -y ripgrep
      
      - name: Run security audit on auth-service
        run: npx tsx tools/security-audit/run-audit.ts --service=auth-service
        continue-on-error: true
      
      - name: Upload audit results
        uses: actions/upload-artifact@v3
        with:
          name: security-audit-results
          path: audit-results/
      
      - name: Fail if critical issues found
        run: |
          CRITICAL=$(cat audit-results/auth-service.json | jq '.summary.bySeverity.CRITICAL')
          if [ "$CRITICAL" -gt 0 ]; then
            echo "❌ $CRITICAL critical security issues found!"
            exit 1
          fi
```

## Known Limitations

1. **False Positives**: Pattern matching may flag intentionally public routes as missing auth
2. **Context-Aware**: Cannot detect if validation happens in parent route groups
3. **Regex Escaping**: Some complex patterns may have shell escaping issues
4. **Migration Queries**: Flags system queries in migrations that don't need tenant_id

## Improving Accuracy

To reduce false positives:

1. **Add comments** to public routes: `// public` or `// Public`
2. **Use consistent patterns** for auth middleware naming
3. **Review findings manually** - this tool assists, doesn't replace human review

## Extending the Tool

### Add New Checks

Edit `scan-input-validation.ts` or `scan-security.ts`:

```typescript
async function scanNewCheck(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    const pattern = 'your-regex-pattern';
    const cmd = `rg -n "${pattern}" ${servicePath}/src/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    // Parse output and create findings
    // ...
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning: ${error.message}`);
    }
  }
  
  return findings;
}
```

Then add to main scan function:

```typescript
export async function scanInputValidation(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  // Existing checks...
  findings.push(...await scanNewCheck(servicePath));
  
  return findings;
}
```

## Contributing

When adding new security checks:

1. Use clear, specific check IDs (e.g., `SEC-R10`, `RD5`)
2. Provide actionable descriptions
3. Set appropriate severity levels
4. Test on multiple services to reduce false positives
5. Document the check in this README

## Support

For issues or questions:
- Check existing findings manually to verify
- Review regex patterns in scanner files
- Test patterns with `rg` command directly first
- Report bugs with example code that causes false positives

---

**Last Updated**: December 20, 2025  
**Version**: 1.0.0
