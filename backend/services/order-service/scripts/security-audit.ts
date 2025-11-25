#!/usr/bin/env ts-node
/**
 * Security Audit Script
 * Comprehensive security audit for the order service
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface AuditResult {
  timestamp: string;
  passed: boolean;
  score: number;
  checks: AuditCheck[];
}

interface AuditCheck {
  name: string;
  category: string;
  passed: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  recommendation?: string;
}

class SecurityAuditor {
  private checks: AuditCheck[] = [];
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(__dirname, '../reports');
  }

  /**
   * Run all security checks
   */
  async runAudit(): Promise<AuditResult> {
    console.log('🔒 Running security audit...\n');

    await this.checkEnvironmentVariables();
    await this.checkDependencies();
    await this.checkFilePermissions();
    await this.checkSecurityHeaders();
    await this.checkCryptographicPractices();
    await this.checkInputValidation();
    await this.checkAuthentication();
    await this.checkAccessControl();

    const passed = this.checks.every(check => 
      check.passed || check.severity === 'low'
    );

    const score = this.calculateScore();

    return {
      timestamp: new Date().toISOString(),
      passed,
      score,
      checks: this.checks,
    };
  }

  /**
   * Check for exposed secrets in environment
   */
  private async checkEnvironmentVariables(): Promise<void> {
    console.log('📋 Checking environment variables...');

    const envExample = path.join(__dirname, '../.env.example');
    const envFile = path.join(__dirname, '../.env');

    // Check .env.example exists
    if (!fs.existsSync(envExample)) {
      this.checks.push({
        name: 'Environment Example File',
        category: 'Configuration',
        passed: false,
        severity: 'medium',
        message: '.env.example file not found',
        recommendation: 'Create .env.example to document required environment variables'
      });
    } else {
      this.checks.push({
        name: 'Environment Example File',
        category: 'Configuration',
        passed: true,
        severity: 'low',
        message: '.env.example file exists'
      });
    }

    // Check .env is in .gitignore
    const gitignore = path.join(__dirname, '../../../.gitignore');
    if (fs.existsSync(gitignore)) {
      const content = fs.readFileSync(gitignore, 'utf-8');
      const hasEnv = content.includes('.env');
      
      this.checks.push({
        name: 'Environment File Protection',
        category: 'Configuration',
        passed: hasEnv,
        severity: 'critical',
        message: hasEnv ? '.env is in .gitignore' : '.env not in .gitignore',
        recommendation: hasEnv ? undefined : 'Add .env to .gitignore to prevent secret exposure'
      });
    }
  }

  /**
   * Check dependencies for known vulnerabilities
   */
  private async checkDependencies(): Promise<void> {
    console.log('📦 Checking dependencies...');

    try {
      const auditOutput = execSync('npm audit --json', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
        cwd: path.join(__dirname, '..')
      });

      const auditData = JSON.parse(auditOutput);
      const vulns = auditData.metadata?.vulnerabilities || {};

      const hasCritical = vulns.critical > 0;
      const hasHigh = vulns.high > 0;

      this.checks.push({
        name: 'Dependency Vulnerabilities',
        category: 'Dependencies',
        passed: !hasCritical && !hasHigh,
        severity: hasCritical ? 'critical' : hasHigh ? 'high' : 'low',
        message: `Found ${vulns.critical || 0} critical, ${vulns.high || 0} high vulnerabilities`,
        recommendation: (hasCritical || hasHigh) ? 'Run npm audit fix to resolve vulnerabilities' : undefined
      });

    } catch (error: any) {
      if (error.stdout) {
        const auditData = JSON.parse(error.stdout);
        const vulns = auditData.metadata?.vulnerabilities || {};
        const hasCritical = vulns.critical > 0;
        const hasHigh = vulns.high > 0;

        this.checks.push({
          name: 'Dependency Vulnerabilities',
          category: 'Dependencies',
          passed: !hasCritical && !hasHigh,
          severity: hasCritical ? 'critical' : hasHigh ? 'high' : 'low',
          message: `Found ${vulns.critical || 0} critical, ${vulns.high || 0} high vulnerabilities`,
          recommendation: (hasCritical || hasHigh) ? 'Run npm audit fix to resolve vulnerabilities' : undefined
        });
      }
    }
  }

  /**
   * Check sensitive file permissions
   */
  private async checkFilePermissions(): Promise<void> {
    console.log('🔐 Checking file permissions...');

    const sensitiveFiles = [
      '.env',
      'package.json',
      'tsconfig.json',
    ];

    for (const file of sensitiveFiles) {
      const filePath = path.join(__dirname, '..', file);
      
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const mode = stats.mode & parseInt('777', 8);
        const isSecure = mode === parseInt('600', 8) || mode === parseInt('644', 8);

        this.checks.push({
          name: `File Permissions: ${file}`,
          category: 'File System',
          passed: isSecure,
          severity: file === '.env' ? 'high' : 'medium',
          message: `File ${file} has permissions ${mode.toString(8)}`,
          recommendation: !isSecure ? `Set secure permissions: chmod 600 ${file}` : undefined
        });
      }
    }
  }

  /**
   * Check security headers configuration
   */
  private async checkSecurityHeaders(): Promise<void> {
    console.log('🛡️  Checking security headers...');

    const middlewareFile = path.join(__dirname, '../src/middleware/security-headers.middleware.ts');
    
    if (fs.existsSync(middlewareFile)) {
      const content = fs.readFileSync(middlewareFile, 'utf-8');
      
      const requiredHeaders = [
        'X-Frame-Options',
        'X-Content-Type-Options', 
        'Strict-Transport-Security',
        'X-XSS-Protection',
      ];

      const missingHeaders = requiredHeaders.filter(header => 
        !content.includes(header)
      );

      this.checks.push({
        name: 'Security Headers Implementation',
        category: 'HTTP Security',
        passed: missingHeaders.length === 0,
        severity: 'high',
        message: missingHeaders.length === 0 
          ? 'All required security headers implemented'
          : `Missing headers: ${missingHeaders.join(', ')}`,
        recommendation: missingHeaders.length > 0 
          ? 'Implement missing security headers' 
          : undefined
      });
    } else {
      this.checks.push({
        name: 'Security Headers Middleware',
        category: 'HTTP Security',
        passed: false,
        severity: 'critical',
        message: 'Security headers middleware not found',
        recommendation: 'Create security-headers.middleware.ts'
      });
    }
  }

  /**
   * Check cryptographic practices
   */
  private async checkCryptographicPractices(): Promise<void> {
    console.log('🔑 Checking cryptographic practices...');

    // Check for weak crypto usage
    const srcDir = path.join(__dirname, '../src');
    
    if (fs.existsSync(srcDir)) {
      const files = this.getAllFiles(srcDir, ['.ts']);
      let hasWeakCrypto = false;
      let weakCryptoFiles: string[] = [];

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes('createHash') && content.includes('md5')) {
          hasWeakCrypto = true;
          weakCryptoFiles.push(path.relative(srcDir, file));
        }
      }

      this.checks.push({
        name: 'Weak Cryptography',
        category: 'Cryptography',
        passed: !hasWeakCrypto,
        severity: 'high',
        message: hasWeakCrypto 
          ? `Weak crypto found in: ${weakCryptoFiles.join(', ')}`
          : 'No weak cryptographic algorithms detected',
        recommendation: hasWeakCrypto 
          ? 'Replace MD5 with SHA-256 or stronger algorithms' 
          : undefined
      });
    }
  }

  /**
   * Check input validation
   */
  private async checkInputValidation(): Promise<void> {
    console.log('✅ Checking input validation...');

    const validatorsDir = path.join(__dirname, '../src/validators');
    
    if (fs.existsSync(validatorsDir)) {
      this.checks.push({
        name: 'Input Validation',
        category: 'Input Handling',
        passed: true,
        severity: 'low',
        message: 'Validators directory exists'
      });
    } else {
      this.checks.push({
        name: 'Input Validation',
        category: 'Input Handling',
        passed: false,
        severity: 'high',
        message: 'No validators directory found',
        recommendation: 'Implement input validation for all endpoints'
      });
    }
  }

  /**
   * Check authentication implementation
   */
  private async checkAuthentication(): Promise<void> {
    console.log('🔓 Checking authentication...');

    const authFiles = [
      'src/middleware/auth.ts',
      'src/middleware/mfa.middleware.ts',
      'src/services/token-rotation.service.ts',
    ];

    let implementedCount = 0;
    for (const file of authFiles) {
      if (fs.existsSync(path.join(__dirname, '..', file))) {
        implementedCount++;
      }
    }

    this.checks.push({
      name: 'Authentication Implementation',
      category: 'Authentication',
      passed: implementedCount >= 2,
      severity: 'critical',
      message: `${implementedCount}/${authFiles.length} authentication components found`,
      recommendation: implementedCount < 2 
        ? 'Implement comprehensive authentication system' 
        : undefined
    });
  }

  /**
   * Check access control
   */
  private async checkAccessControl(): Promise<void> {
    console.log('🚪 Checking access control...');

    const aclFile = path.join(__dirname, '../src/utils/auth-guards.ts');
    
    if (fs.existsSync(aclFile)) {
      this.checks.push({
        name: 'Access Control',
        category: 'Authorization',
        passed: true,
        severity: 'low',
        message: 'Access control utilities found'
      });
    } else {
      this.checks.push({
        name: 'Access Control',
        category: 'Authorization',
        passed: false,
        severity: 'high',
        message: 'No access control utilities found',
        recommendation: 'Implement role-based access control'
      });
    }
  }

  /**
   * Calculate overall security score
   */
  private calculateScore(): number {
    const weights = {
      critical: 25,
      high: 15,
      medium: 10,
      low: 5,
    };

    let maxScore = 0;
    let earnedScore = 0;

    for (const check of this.checks) {
      const weight = weights[check.severity];
      maxScore += weight;
      if (check.passed) {
        earnedScore += weight;
      }
    }

    return maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0;
  }

  /**
   * Generate report
   */
  async generateReport(result: AuditResult): Promise<void> {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    const reportPath = path.join(
      this.outputDir,
      `security-audit-${Date.now()}.json`
    );

    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);
  }

  /**
   * Display results
   */
  displayResults(result: AuditResult): void {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('           SECURITY AUDIT RESULTS                  ');
    console.log('═══════════════════════════════════════════════════\n');

    console.log(`🎯 Security Score: ${result.score}/100\n`);

    // Group by category
    const grouped = result.checks.reduce((acc, check) => {
      if (!acc[check.category]) {
        acc[check.category] = [];
      }
      acc[check.category].push(check);
      return acc;
    }, {} as Record<string, AuditCheck[]>);

    // Display by category
    for (const [category, checks] of Object.entries(grouped)) {
      console.log(`\n📌 ${category}:`);
      for (const check of checks) {
        const icon = check.passed ? '✅' : '❌';
        const severity = check.passed ? '' : ` [${check.severity.toUpperCase()}]`;
        console.log(`   ${icon} ${check.name}${severity}`);
        console.log(`      ${check.message}`);
        if (check.recommendation) {
          console.log(`      💡 ${check.recommendation}`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════');
    if (result.passed) {
      console.log('✅ PASSED - All critical checks passed');
    } else {
      console.log('❌ FAILED - Some critical checks failed');
    }
    console.log('═══════════════════════════════════════════════════\n');
  }

  /**
   * Get all files recursively
   */
  private getAllFiles(dir: string, extensions: string[]): string[] {
    const files: string[] = [];
    
    if (!fs.existsSync(dir)) {
      return files;
    }

    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath, extensions));
      } else if (extensions.some(ext => fullPath.endsWith(ext))) {
        files.push(fullPath);
      }
    }

    return files;
  }
}

// Main execution
async function main() {
  const auditor = new SecurityAuditor();

  try {
    const result = await auditor.runAudit();
    
    auditor.displayResults(result);
    
    await auditor.generateReport(result);

    // Exit with appropriate code
    if (!result.passed) {
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

