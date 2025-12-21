#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as path from 'path';

export interface Finding {
  checkId: string;
  description: string;
  file: string;
  line: number;
  code: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export async function scanInputValidation(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  console.log(`\n🔍 Scanning Input Validation for: ${servicePath}`);
  
  // RD1: Routes without schema validation
  findings.push(...await scanRoutesWithoutValidation(servicePath));
  
  // RD2: Schemas without .unknown(false)
  findings.push(...await scanSchemasWithoutUnknown(servicePath));
  
  // RD3: Schemas without maxLength on strings
  findings.push(...await scanStringsWithoutMaxLength(servicePath));
  
  // RD4: URL params without validation
  findings.push(...await scanParamsWithoutValidation(servicePath));
  
  // SD1: Arrays without maxItems
  findings.push(...await scanArraysWithoutMaxItems(servicePath));
  
  // SL1: Direct request.body spread into queries
  findings.push(...await scanDirectBodySpread(servicePath));
  
  // SL2: Missing parameterized queries (SQL injection risk)
  findings.push(...await scanStringInterpolationInSQL(servicePath));
  
  console.log(`   Found ${findings.length} input validation findings`);
  
  return findings;
}

async function scanRoutesWithoutValidation(servicePath: string): Promise<Finding[]> {
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
      
      // Check if this route has validation
      // Look for: preHandler, validate, schema in the route definition
      if (!code.includes('preHandler') && 
          !code.includes('validate') && 
          !code.includes('schema:') &&
          !code.includes('// public') &&
          !code.includes('// Public')) {
        
        findings.push({
          checkId: 'RD1',
          description: 'Route without schema validation',
          file: file.replace(`${servicePath}/`, ''),
          line: parseInt(lineNum),
          code: code.trim(),
          severity: 'HIGH',
        });
      }
    }
  } catch (error: any) {
    // No matches or error - that's fine
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning routes: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanSchemasWithoutUnknown(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find schema definitions
    const schemaPattern = 'export const \\w+Schema';
    const cmd = `rg -n -A 20 "${schemaPattern}" ${servicePath}/src/validators/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    let currentSchema: { file: string; line: number; name: string; hasUnknown: boolean } | null = null;
    
    for (const line of lines) {
      if (line.includes('export const') && line.includes('Schema')) {
        // Save previous schema if it didn't have .unknown(false)
        if (currentSchema && !currentSchema.hasUnknown) {
          findings.push({
            checkId: 'RD2',
            description: 'Schema without .unknown(false) - allows extra fields (mass assignment risk)',
            file: currentSchema.file,
            line: currentSchema.line,
            code: `export const ${currentSchema.name}`,
            severity: 'HIGH',
          });
        }
        
        // Start tracking new schema
        const match = line.match(/^([^:]+):(\d+):.*export const (\w+Schema)/);
        if (match) {
          currentSchema = {
            file: match[1].replace(`${servicePath}/`, ''),
            line: parseInt(match[2]),
            name: match[3],
            hasUnknown: false,
          };
        }
      } else if (currentSchema && line.includes('.unknown(false)')) {
        currentSchema.hasUnknown = true;
      }
    }
    
    // Check last schema
    if (currentSchema && !currentSchema.hasUnknown) {
      findings.push({
        checkId: 'RD2',
        description: 'Schema without .unknown(false) - allows extra fields (mass assignment risk)',
        file: currentSchema.file,
        line: currentSchema.line,
        code: `export const ${currentSchema.name}`,
        severity: 'HIGH',
      });
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning schemas: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanStringsWithoutMaxLength(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find string fields without max length
    const stringPattern = '\\.(string\\(\\)|Joi\\.string\\(\\)|z\\.string\\(\\))';
    const cmd = `rg -n "${stringPattern}" ${servicePath}/src/validators/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      // Check if line has max/maxLength after string()
      if (!code.includes('.max(') && !code.includes('.maxLength(')) {
        findings.push({
          checkId: 'RD3',
          description: 'String field without maxLength constraint',
          file: file.replace(`${servicePath}/`, ''),
          line: parseInt(lineNum),
          code: code.trim(),
          severity: 'MEDIUM',
        });
      }
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning string fields: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanParamsWithoutValidation(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find URL params like :userId, :id, :orderId, etc.
    const paramsPattern = ':[a-zA-Z]+Id|:[a-zA-Z]+Key|:[a-zA-Z]+Token';
    const cmd = `rg -n "${paramsPattern}" ${servicePath}/src/routes/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      // Extract the param name
      const paramMatch = code.match(/:([a-zA-Z]+(?:Id|Key|Token))/);
      if (!paramMatch) continue;
      
      // Check if there's param validation nearby (within 5 lines)
      try {
        const contextCmd = `rg -n -C 5 "${paramMatch[0]}" ${file}`;
        const context = execSync(contextCmd, { encoding: 'utf8' });
        
        if (!context.includes("validate") && !context.includes("'params'") && !context.includes('"params"')) {
          findings.push({
            checkId: 'RD4',
            description: `URL param ${paramMatch[1]} without validation`,
            file: file.replace(`${servicePath}/`, ''),
            line: parseInt(lineNum),
            code: code.trim(),
            severity: 'HIGH',
          });
        }
      } catch {
        // Context search failed - assume no validation
        findings.push({
          checkId: 'RD4',
          description: `URL param ${paramMatch[1]} without validation`,
          file: file.replace(`${servicePath}/`, ''),
          line: parseInt(lineNum),
          code: code.trim(),
          severity: 'HIGH',
        });
      }
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning params: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanArraysWithoutMaxItems(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find array fields
    const arrayPattern = '\\.(array\\(\\)|Joi\\.array\\(\\)|z\\.array\\(\\))';
    const cmd = `rg -n "${arrayPattern}" ${servicePath}/src/validators/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      // Check if line has max/maxItems
      if (!code.includes('.max(') && !code.includes('.maxItems(')) {
        findings.push({
          checkId: 'SD1',
          description: 'Array field without maxItems constraint',
          file: file.replace(`${servicePath}/`, ''),
          line: parseInt(lineNum),
          code: code.trim(),
          severity: 'MEDIUM',
        });
      }
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning arrays: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanDirectBodySpread(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find places where request.body is spread directly
    const spreadPattern = '\\.\\.\\.req(uest)?\\.body|\\.\\.\\.data';
    const cmd = `rg -n "${spreadPattern}" ${servicePath}/src/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      findings.push({
        checkId: 'SL1',
        description: 'Direct request.body spread - use explicit field mapping',
        file: file.replace(`${servicePath}/`, ''),
        line: parseInt(lineNum),
        code: code.trim(),
        severity: 'HIGH',
      });
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning spread operators: ${error.message}`);
    }
  }
  
  return findings;
}

async function scanStringInterpolationInSQL(servicePath: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  
  try {
    // Find template literals with query/execute/raw
    const sqlPattern = '(query|execute|raw)\\s*\\(\\s*`';
    const cmd = `rg -n "${sqlPattern}" ${servicePath}/src/ -t ts`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      const match = line.match(/^([^:]+):(\d+):(.+)$/);
      if (!match) continue;
      
      const [, file, lineNum, code] = match;
      
      // Check if template literal contains ${} interpolation
      if (code.includes('${')) {
        findings.push({
          checkId: 'SL2',
          description: 'SQL query with string interpolation - use parameterized queries',
          file: file.replace(`${servicePath}/`, ''),
          line: parseInt(lineNum),
          code: code.trim(),
          severity: 'CRITICAL',
        });
      }
    }
  } catch (error: any) {
    if (!error.message?.includes('exit code 1')) {
      console.error(`   ⚠️  Error scanning SQL queries: ${error.message}`);
    }
  }
  
  return findings;
}

// Allow direct execution for testing
if (require.main === module) {
  const servicePath = process.argv[2] || 'backend/services/auth-service';
  scanInputValidation(servicePath).then(findings => {
    console.log(JSON.stringify(findings, null, 2));
  });
}
