#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

interface Finding {
  checkId: string;
  description: string;
  file: string;
  line: number;
  code: string;
  severity: string;
}

interface AuditResult {
  service: string;
  timestamp: string;
  summary: {
    totalFindings: number;
    bySeverity: {
      CRITICAL: number;
      HIGH: number;
      MEDIUM: number;
      LOW: number;
    };
    byCategory: {
      inputValidation: number;
      security: number;
    };
  };
  findings: {
    inputValidation: Finding[];
    security: Finding[];
  };
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const serviceArg = args.find(arg => arg.startsWith('--service='));
  
  if (!serviceArg) {
    console.error('❌ Error: --service argument is required');
    console.error('Usage: npx tsx tools/security-audit/filter-findings.ts --service <service-name>');
    process.exit(1);
  }
  
  const serviceName = serviceArg.split('=')[1];
  const inputPath = `audit-results/${serviceName}.json`;
  const outputPath = `audit-results/${serviceName}-for-review.md`;
  
  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Error: Audit results not found: ${inputPath}`);
    console.error(`Run: npx tsx tools/security-audit/run-audit.ts --service=${serviceName}`);
    process.exit(1);
  }
  
  console.log(`\n📄 Generating LLM Review Document`);
  console.log(`==================================`);
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}\n`);
  
  // Read audit results
  const auditData: AuditResult = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  // Combine all findings
  const allFindings = [
    ...auditData.findings.inputValidation,
    ...auditData.findings.security
  ];
  
  // Group findings by checkId
  const groupedFindings = allFindings.reduce((acc, finding) => {
    if (!acc[finding.checkId]) {
      acc[finding.checkId] = {
        description: finding.description,
        severity: finding.severity,
        findings: []
      };
    }
    acc[finding.checkId].findings.push(finding);
    return acc;
  }, {} as Record<string, { description: string; severity: string; findings: Finding[] }>);
  
  // Sort by severity and count
  const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedCheckIds = Object.keys(groupedFindings).sort((a, b) => {
    const severityDiff = severityOrder[groupedFindings[a].severity] - 
                        severityOrder[groupedFindings[b].severity];
    if (severityDiff !== 0) return severityDiff;
    return groupedFindings[b].findings.length - groupedFindings[a].findings.length;
  });
  
  // Generate markdown
  let markdown = `# Security Audit Review: ${serviceName}\n\n`;
  markdown += `**Generated:** ${new Date().toISOString()}\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `- **Total Findings:** ${auditData.summary.totalFindings}\n`;
  markdown += `- **Critical:** ${auditData.summary.bySeverity.CRITICAL}\n`;
  markdown += `- **High:** ${auditData.summary.bySeverity.HIGH}\n`;
  markdown += `- **Medium:** ${auditData.summary.bySeverity.MEDIUM}\n`;
  markdown += `- **Low:** ${auditData.summary.bySeverity.LOW}\n\n`;
  
  markdown += `## Instructions\n\n`;
  markdown += `Review each finding below and determine if it's a TRUE ISSUE or FALSE POSITIVE.\n\n`;
  markdown += `For each finding, add one of these judgments:\n\n`;
  markdown += `- ✅ **TRUE ISSUE** - Legitimate security/validation problem that should be fixed\n`;
  markdown += `- ❌ **FALSE POSITIVE** - Incorrectly flagged, no actual issue\n`;
  markdown += `- ⚠️ **NEEDS CONTEXT** - Requires more information to determine\n\n`;
  markdown += `Add a brief reason for your judgment.\n\n`;
  markdown += `---\n\n`;
  
  // Generate sections for each check ID
  for (const checkId of sortedCheckIds) {
    const group = groupedFindings[checkId];
    const severityEmoji = group.severity === 'CRITICAL' ? '🔴' : 
                         group.severity === 'HIGH' ? '🟠' : 
                         group.severity === 'MEDIUM' ? '🟡' : '🟢';
    
    markdown += `## ${severityEmoji} ${checkId}: ${group.description}\n\n`;
    markdown += `**Severity:** ${group.severity}  \n`;
    markdown += `**Count:** ${group.findings.length} findings\n\n`;
    markdown += `Review each finding and mark as TRUE ISSUE or FALSE POSITIVE with brief reason.\n\n`;
    
    // List each finding
    group.findings.forEach((finding, index) => {
      markdown += `### Finding ${index + 1}\n\n`;
      markdown += `- **File:** \`${finding.file}\`\n`;
      markdown += `- **Line:** ${finding.line}\n`;
      markdown += `- **Code:** \`${finding.code}\`\n\n`;
      markdown += `**Judgment:** _[Mark as TRUE ISSUE, FALSE POSITIVE, or NEEDS CONTEXT]_\n\n`;
      markdown += `**Reason:** _[Brief explanation]_\n\n`;
      markdown += `---\n\n`;
    });
  }
  
  // Add context section
  markdown += `## Additional Context\n\n`;
  markdown += `### Common False Positives\n\n`;
  markdown += `**Routes without authentication:**\n`;
  markdown += `- Public routes like /login, /register, /forgot-password are intentionally unauthenticated\n`;
  markdown += `- OAuth callbacks, email verification, token refresh routes need special handling\n\n`;
  markdown += `**Routes without validation:**\n`;
  markdown += `- Check if validation exists in preHandler block on subsequent lines\n`;
  markdown += `- Validation may be in parent route group\n\n`;
  markdown += `**Queries without tenant_id:**\n`;
  markdown += `- System queries (migrations, information_schema) don't need tenant filtering\n`;
  markdown += `- Queries on tenants table itself\n`;
  markdown += `- Global cleanup/maintenance jobs\n\n`;
  markdown += `**Logs with sensitive keywords:**\n`;
  markdown += `- Check if actual sensitive data is logged or just the word "password"/"token"\n`;
  markdown += `- Logs like "Password reset request" don't contain actual passwords\n\n`;
  markdown += `### Service Context\n\n`;
  markdown += `**Service:** ${serviceName}\n`;
  markdown += `**Type:** ${serviceName.includes('auth') ? 'Authentication Service' : 'Business Service'}\n`;
  markdown += `**Public Routes Expected:** ${serviceName.includes('auth') ? 'Yes (login, register, password reset)' : 'Minimal'}\n\n`;
  
  // Write to file
  fs.writeFileSync(outputPath, markdown);
  
  console.log(`✅ Review document generated!`);
  console.log(`\n📊 Statistics:`);
  console.log(`   Total Check IDs: ${sortedCheckIds.length}`);
  console.log(`   Total Findings: ${allFindings.length}`);
  console.log(`\n📋 Next Steps:`);
  console.log(`   1. Review the document: code ${outputPath}`);
  console.log(`   2. Or copy content to Claude for AI-assisted review`);
  console.log(`   3. Mark each finding as TRUE ISSUE or FALSE POSITIVE`);
  console.log(`   4. Use judgments to prioritize fixes\n`);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
