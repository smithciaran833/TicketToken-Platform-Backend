#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import { Finding } from './scan-input-validation';

export async function scanSecurity(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  console.log(`\n🔒 Scanning Security for: ${servicePath}`);
  
  // SEC-R1: Routes without auth middleware
  findings.push(...await scanRoutesWithoutAuth(servicePath));
  
  // SEC-R2: JWT using decode instead of verify
  findings.push(...await scanJWTDecode(servicePath));
  
  // SEC-R6: Hardcoded secrets
  findings.push(...await scanHardcodedSecrets(servicePath));
  
  // SEC-DB1: Database config without SSL/TLS
  findings.push(...await scanDatabaseSSL(servicePath));
  
  // SEC-S5: Queries without tenant_id filter
  findings.push(...await scanQueriesWithoutTenantId(servicePath));
  
  // SEC-DB10: Logs containing sensitive data
  findings.push(...await scanLogsWithSensitiveData(servicePath));
  
  // SEC-R7/R8: Missing rate limiting on auth endpoints
  findings.push(...await scanMissingRateLimiting(servicePath));
  
  console.log(`   Found ${findings.length} security findings`);
  
  return findings;
}

async function scanRoutesWithoutAuth(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find route definitions
    const routesPattern = '\\.(get|post|put|delete|patch)\\(';
    const cmd = `rg -n "${routesPattern}" ${servicePath}/src/routes/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      // Skip if route is explicitly public
      if (code.includes('// public') || code.includes('// Public')) {
        continue;
      }
      
      // Skip specific public routes
      if (code.includes('/register') || 
          code.includes('/login') || 
          code.includes('/health') ||
          code.includes('/metrics')) {
        continue;
      }
      
      // Check if route has auth protection
      // Look for: authenticate, requireAuth, protect, preHandler with auth
      const hasAuth = code.includes('authenticate') || 
                      code.includes('requireAuth') || 
                      code.includes('protect') ||
                      code.includes('preHandler');
      
      if (!hasAuth) {
        // Check if this is inside an authenticated route group
        try {
          const contextCmd = `rg -n -B 20 "${code.trim()}" ${file}`;
          const context = execSync(contextCmd, { encoding: 'utf8' });
          
          if (!context.includes('authenticate') && !context.includes('requireAuth')) {
            findings.push({
              checkId: 'SEC-R1',
              description: 'Route without authentication middleware',
              file: file.replace(`${servicePath}/`, ''),
              line: parseInt(lineNum),
              code: code.trim(),
              severity: 'CRITICAL',
            });
          }
        } catch {
          findings.push({
            checkId: 'SEC-R1',
            description: 'Route without authentication middleware',
            file: file.replace(`${servicePath}/`, ''),
            line: parseInt(lineNum),
            code: code.trim(),
            severity: 'CRITICAL',
          });
        }
      }
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning auth middleware: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanJWTDecode(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find jwt.decode usage
    const decodePattern = 'jwt\\.decode\\(';
    const cmd = `rg -n "${decodePattern}" ${servicePath}/src/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      findings.push({
        checkId: 'SEC-R2',
        description: 'JWT decode used instead of verify - no signature verification',
        file: file.replace(`${servicePath}/`, ''),
        line: parseInt(lineNum),
        code: code.trim(),
        severity: 'CRITICAL',
      });
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning JWT decode: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanHardcodedSecrets(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find variables with SECRET/KEY/PASSWORD in name assigned string literals
    const secretPattern = '(SECRET|KEY|PASSWORD).*=.*["\'][^"\'{}]*["\']';
    const cmd = `rg -n "${secretPattern}" ${servicePath}/src/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      // Skip if it references environment variable
      if (code.includes('process.env') || code.includes('env.')) {
        continue;
      }
      
      // Skip if it's in .example or test files
      if (file.includes('.example') || file.includes('.test.') || file.includes('.spec.')) {
        continue;
      }
      
      findings.push({
        checkId: 'SEC-R6',
        description: 'Hardcoded secret - should use environment variable or secrets manager',
        file: file.replace(`${servicePath}/`, ''),
        line: parseInt(lineNum),
        code: code.trim(),
        severity: 'CRITICAL',
      });
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning hardcoded secrets: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanDatabaseSSL(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Check database config files
    const configFiles = [
      `${servicePath}/src/config/database.ts`,
      `${servicePath}/src/config/db.ts`,
    ];
    
    for (const file of configFiles) {
      try {
        // Check if file exists and has database config
        const checkCmd = `rg -n "new Pool\\(|Pool\\(" ${file}`;
        execSync(checkCmd, { encoding: 'utf8' });
        
        // Now check if it has ssl config
        try {
          const sslCmd = `rg -n "ssl:|ssl =" ${file}`;
          execSync(sslCmd, { encoding: 'utf8' });
        } catch {
          // No SSL config found
          findings.push({
            checkId: 'SEC-DB1',
            description: 'Database connection without SSL/TLS configuration',
            file: file.replace(`${servicePath}/`, ''),
            line: 1,
            code: 'Database config missing ssl/sslmode',
            severity: 'CRITICAL',
          });
        }
      } catch {
        // File doesn't exist or no Pool config
        continue;
      }
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning database SSL: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanQueriesWithoutTenantId(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find SELECT/UPDATE/DELETE queries
    const queryPattern = '(SELECT|UPDATE|DELETE).*FROM';
    const cmd = `rg -n -i "${queryPattern}" ${servicePath}/src/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      // Skip if query includes tenant filtering
      if (code.toLowerCase().includes('tenant_id') || 
          code.toLowerCase().includes('tenantid')) {
        continue;
      }
      
      // Skip audit_logs and other system tables
      if (code.includes('audit_logs') || 
          code.includes('migrations') ||
          code.includes('system_')) {
        continue;
      }
      
      findings.push({
        checkId: 'SEC-S5',
        description: 'Database query without tenant_id filter - multi-tenant isolation risk',
        file: file.replace(`${servicePath}/`, ''),
        line: parseInt(lineNum),
        code: code.trim(),
        severity: 'CRITICAL',
      });
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning queries: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanLogsWithSensitiveData(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find console.log or logger calls with sensitive fields
    const logPattern = '(console\\.log|logger\\.|log\\.).*\\b(password|token|secret|key|credential)\\b';
    const cmd = `rg -n -i "${logPattern}" ${servicePath}/src/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      // Skip if it's redacting the sensitive data
      if (code.includes('[REDACTED]') || 
          code.includes('***') ||
          code.includes('mask') ||
          code.includes('sanitize')) {
        continue;
      }
      
      findings.push({
        checkId: 'SEC-DB10',
        description: 'Log statement may contain sensitive data (password/token/secret)',
        file: file.replace(`${servicePath}/`, ''),
        line: parseInt(lineNum),
        code: code.trim(),
        severity: 'HIGH',
      });
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning logs: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanMissingRateLimiting(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  const authEndpoints = [
    { path: '/login', code: 'SEC-R7' },
    { path: '/register', code: 'SEC-R9' },
    { path: '/forgot-password', code: 'SEC-R8' },
    { path: '/reset-password', code: 'SEC-R8' },
  ];
  
  try {
    for (const endpoint of authEndpoints) {
      // Find the endpoint definition
      const endpointPattern = `['"\`]${endpoint.path}['"\`]`;
      const cmd = `rg -n "${endpointPattern}" ${servicePath}/src/routes/ -t ts`;
      
      try {
        const output = execSync(cmd, { encoding: 'utf8' });
        const lines = output.trim().split('\n');
        
        for (const line of lines) {
          const match = line.match(/^([^:]+):(\d+):(.+)$/);
          if (!match) continue;
          
          const [, file, lineNum, code] = match;
          
          // Check if rate limiting is present nearby
          try {
            const contextCmd = `rg -n -C 10 "${endpoint.path}" ${file}`;
            const context = execSync(contextCmd, { encoding: 'utf8' });
            
            if (!context.includes('rateLimit') && 
                !context.includes('RateLimiter') &&
                !context.includes('rateLimiter')) {
              findings.push({
                checkId: endpoint.code,
                description: `Auth endpoint ${endpoint.path} without rate limiting`,
                file: file.replace(`${servicePath}/`, ''),
                line: parseInt(lineNum),
                code: code.trim(),
                severity: 'CRITICAL',
              });
            }
          } catch {
            findings.push({
              checkId: endpoint.code,
              description: `Auth endpoint ${endpoint.path} without rate limiting`,
              file: file.replace(`${servicePath}/`, ''),
              line: parseInt(lineNum),
              code: code.trim(),
              severity: 'CRITICAL',
            });
          }
        }
      } catch {
        // Endpoint not found - that's okay
        continue;
      }
    }
  } catch (error: any) {
    console.error(`   ⚠️  Error scanning rate limiting: ${error.message}`);
  }
  
  return findings;
}

// Allow direct execution for testing
if (require.main === module) {
  const servicePath = process.argv[2] || 'backend/services/auth-service';
  scanSecurity(servicePath).then(findings => {
    console.log(JSON.stringify(findings, null, 2));
  });
}
