#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { scanInputValidation, Finding } from './scan-input-validation';
import { scanSecurity } from './scan-security';

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
    console.error('Usage: npx ts-node tools/security-audit/run-audit.ts --service <service-name>');
    console.error('Example: npx ts-node tools/security-audit/run-audit.ts --service auth-service');
    process.exit(1);
  }
  
  const serviceName = serviceArg.split('=')[1];
  const servicePath = `backend/services/${serviceName}`;
  
  // Check if service directory exists
  if (!fs.existsSync(servicePath)) {
    console.error(`❌ Error: Service directory not found: ${servicePath}`);
    process.exit(1);
  }
  
  console.log(`\n🔎 TicketToken Security Audit Tool`);
  console.log(`====================================`);
  console.log(`Service: ${serviceName}`);
  console.log(`Path: ${servicePath}`);
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  // Run input validation scan
  const inputValidationFindings = await scanInputValidation(servicePath);
  
  // Run security scan
  const securityFindings = await scanSecurity(servicePath);
  
  // Combine results
  const allFindings = [...inputValidationFindings, ...securityFindings];
  
  // Calculate summary statistics
  const summary = {
    totalFindings: allFindings.length,
    bySeverity: {
      CRITICAL: allFindings.filter(f => f.severity === 'CRITICAL').length,
      HIGH: allFindings.filter(f => f.severity === 'HIGH').length,
      MEDIUM: allFindings.filter(f => f.severity === 'MEDIUM').length,
      LOW: allFindings.filter(f => f.severity === 'LOW').length,
    },
    byCategory: {
      inputValidation: inputValidationFindings.length,
      security: securityFindings.length,
    },
  };
  
  // Create result object
  const result: AuditResult = {
    service: serviceName,
    timestamp: new Date().toISOString(),
    summary,
    findings: {
      inputValidation: inputValidationFindings,
      security: securityFindings,
    },
  };
  
  // Create output directory if it doesn't exist
  const outputDir = 'audit-results';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write results to JSON file
  const outputPath = path.join(outputDir, `${serviceName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  
  // Print summary to console
  console.log(`\n📊 Audit Summary`);
  console.log(`================`);
  console.log(`Total Findings: ${summary.totalFindings}`);
  console.log(`\nBy Severity:`);
  console.log(`  🔴 CRITICAL: ${summary.bySeverity.CRITICAL}`);
  console.log(`  🟠 HIGH:     ${summary.bySeverity.HIGH}`);
  console.log(`  🟡 MEDIUM:   ${summary.bySeverity.MEDIUM}`);
  console.log(`  🟢 LOW:      ${summary.bySeverity.LOW}`);
  console.log(`\nBy Category:`);
  console.log(`  Input Validation: ${summary.byCategory.inputValidation}`);
  console.log(`  Security:         ${summary.byCategory.security}`);
  
  // Print top findings
  if (allFindings.length > 0) {
    console.log(`\n🔝 Top Findings:`);
    console.log(`===============`);
    
    // Group by checkId and show count
    const groupedFindings = allFindings.reduce((acc, finding) => {
      if (!acc[finding.checkId]) {
        acc[finding.checkId] = {
          count: 0,
          description: finding.description,
          severity: finding.severity,
        };
      }
      acc[finding.checkId].count++;
      return acc;
    }, {} as Record<string, { count: number; description: string; severity: string }>);
    
    // Sort by severity and count
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sortedChecks = Object.entries(groupedFindings)
      .sort((a, b) => {
        const severityDiff = severityOrder[a[1].severity as keyof typeof severityOrder] - 
                            severityOrder[b[1].severity as keyof typeof severityOrder];
        if (severityDiff !== 0) return severityDiff;
        return b[1].count - a[1].count;
      })
      .slice(0, 10);
    
    for (const [checkId, data] of sortedChecks) {
      const severityIcon = data.severity === 'CRITICAL' ? '🔴' : 
                          data.severity === 'HIGH' ? '🟠' : 
                          data.severity === 'MEDIUM' ? '🟡' : '🟢';
      console.log(`  ${severityIcon} ${checkId}: ${data.description} (${data.count} occurrences)`);
    }
  }
  
  console.log(`\n✅ Audit complete!`);
  console.log(`📄 Results saved to: ${outputPath}`);
  console.log(`\nTo view detailed results:`);
  console.log(`  cat ${outputPath} | jq`);
  console.log(`  # or`);
  console.log(`  code ${outputPath}\n`);
  
  // Exit with error code if critical findings exist
  if (summary.bySeverity.CRITICAL > 0) {
    console.log(`⚠️  WARNING: ${summary.bySeverity.CRITICAL} CRITICAL findings detected!`);
    process.exit(1);
  }
}

// Run the audit
main().catch(error => {
  console.error('❌ Fatal error during audit:', error);
  process.exit(1);
});
