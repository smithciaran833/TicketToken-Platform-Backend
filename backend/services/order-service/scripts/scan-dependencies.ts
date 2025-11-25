#!/usr/bin/env ts-node
/**
 * Dependency Scanner Script
 * Scans dependencies for known vulnerabilities using npm audit
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface VulnerabilitySummary {
  info: number;
  low: number;
  moderate: number;
  high: number;
  critical: number;
  total: number;
}

interface ScanResult {
  timestamp: string;
  vulnerabilities: VulnerabilitySummary;
  details: any[];
  passed: boolean;
}

class DependencyScanner {
  private outputDir: string;
  private maxCritical: number;
  private maxHigh: number;

  constructor() {
    this.outputDir = path.join(__dirname, '../reports');
    this.maxCritical = 0; // No critical vulnerabilities allowed
    this.maxHigh = 5; // Maximum 5 high severity vulnerabilities
  }

  /**
   * Run npm audit
   */
  async runAudit(): Promise<ScanResult> {
    console.log('🔍 Scanning dependencies for vulnerabilities...\n');

    try {
      // Run npm audit with JSON output
      const auditOutput = execSync('npm audit --json', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'], // Ignore stderr to avoid errors for vulnerabilities
      });

      const auditData = JSON.parse(auditOutput);
      
      const vulnerabilities: VulnerabilitySummary = {
        info: auditData.metadata?.vulnerabilities?.info || 0,
        low: auditData.metadata?.vulnerabilities?.low || 0,
        moderate: auditData.metadata?.vulnerabilities?.moderate || 0,
        high: auditData.metadata?.vulnerabilities?.high || 0,
        critical: auditData.metadata?.vulnerabilities?.critical || 0,
        total: auditData.metadata?.vulnerabilities?.total || 0,
      };

      const details = Object.values(auditData.vulnerabilities || {});

      const passed = this.evaluateResults(vulnerabilities);

      return {
        timestamp: new Date().toISOString(),
        vulnerabilities,
        details,
        passed,
      };

    } catch (error: any) {
      // npm audit exits with non-zero on vulnerabilities, so parse the output
      if (error.stdout) {
        const auditData = JSON.parse(error.stdout);
        
        const vulnerabilities: VulnerabilitySummary = {
          info: auditData.metadata?.vulnerabilities?.info || 0,
          low: auditData.metadata?.vulnerabilities?.low || 0,
          moderate: auditData.metadata?.vulnerabilities?.moderate || 0,
          high: auditData.metadata?.vulnerabilities?.high || 0,
          critical: auditData.metadata?.vulnerabilities?.critical || 0,
          total: auditData.metadata?.vulnerabilities?.total || 0,
        };

        const details = Object.values(auditData.vulnerabilities || {});

        const passed = this.evaluateResults(vulnerabilities);

        return {
          timestamp: new Date().toISOString(),
          vulnerabilities,
          details,
          passed,
        };
      }

      throw error;
    }
  }

  /**
   * Check outdated packages
   */
  async checkOutdated(): Promise<any> {
    console.log('📦 Checking for outdated packages...\n');

    try {
      const outdatedOutput = execSync('npm outdated --json', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      return JSON.parse(outdatedOutput || '{}');
    } catch (error: any) {
      // npm outdated exits with non-zero for outdated packages
      if (error.stdout) {
        return JSON.parse(error.stdout || '{}');
      }
      return {};
    }
  }

  /**
   * Evaluate if results pass thresholds
   */
  private evaluateResults(vulnerabilities: VulnerabilitySummary): boolean {
    if (vulnerabilities.critical > this.maxCritical) {
      return false;
    }

    if (vulnerabilities.high > this.maxHigh) {
      return false;
    }

    return true;
  }

  /**
   * Generate report
   */
  async generateReport(scanResult: ScanResult, outdated: any): Promise<void> {
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const reportPath = path.join(
      this.outputDir,
      `dependency-scan-${Date.now()}.json`
    );

    const report = {
      ...scanResult,
      outdated,
      thresholds: {
        maxCritical: this.maxCritical,
        maxHigh: this.maxHigh,
      },
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);
  }

  /**
   * Display results
   */
  displayResults(scanResult: ScanResult, outdated: any): void {
    console.log('═══════════════════════════════════════════════════');
    console.log('             DEPENDENCY SCAN RESULTS               ');
    console.log('═══════════════════════════════════════════════════\n');

    // Vulnerabilities summary
    console.log('🔒 Vulnerability Summary:');
    console.log(`   Critical: ${scanResult.vulnerabilities.critical}`);
    console.log(`   High:     ${scanResult.vulnerabilities.high}`);
    console.log(`   Moderate: ${scanResult.vulnerabilities.moderate}`);
    console.log(`   Low:      ${scanResult.vulnerabilities.low}`);
    console.log(`   Info:     ${scanResult.vulnerabilities.info}`);
    console.log(`   ────────────────────────`);
    console.log(`   Total:    ${scanResult.vulnerabilities.total}\n`);

    // Outdated packages
    const outdatedCount = Object.keys(outdated).length;
    if (outdatedCount > 0) {
      console.log(`⚠️  Outdated Packages: ${outdatedCount}`);
      console.log('   Run "npm outdated" for details\n');
    }

    // Pass/Fail
    if (scanResult.passed) {
      console.log('✅ PASSED - Vulnerabilities within acceptable thresholds\n');
    } else {
      console.log('❌ FAILED - Vulnerabilities exceed acceptable thresholds');
      console.log(`   Max Critical: ${this.maxCritical} (Found: ${scanResult.vulnerabilities.critical})`);
      console.log(`   Max High: ${this.maxHigh} (Found: ${scanResult.vulnerabilities.high})\n`);
    }

    console.log('═══════════════════════════════════════════════════\n');
  }

  /**
   * Run fix if needed
   */
  async runFix(autoFix: boolean = false): Promise<void> {
    if (!autoFix) {
      return;
    }

    console.log('🔧 Running npm audit fix...\n');
    
    try {
      execSync('npm audit fix', {
        encoding: 'utf-8',
        stdio: 'inherit',
      });
      console.log('✅ Fix completed\n');
    } catch (error) {
      console.error('❌ Fix failed\n');
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const autoFix = args.includes('--fix');
  const ci = args.includes('--ci');

  const scanner = new DependencyScanner();

  try {
    // Run audit
    const scanResult = await scanner.runAudit();
    
    // Check outdated
    const outdated = await scanner.checkOutdated();

    // Display results
    scanner.displayResults(scanResult, outdated);

    // Generate report
    await scanner.generateReport(scanResult, outdated);

    // Run fix if requested
    await scanner.runFix(autoFix);

    // Exit with appropriate code for CI
    if (ci && !scanResult.passed) {
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Scan failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { DependencyScanner };
