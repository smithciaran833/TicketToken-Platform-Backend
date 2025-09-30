#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Checking dependencies...\n');

const servicesDir = path.join(process.cwd(), 'backend/services');
const services = fs.readdirSync(servicesDir).filter(f => 
  fs.statSync(path.join(servicesDir, f)).isDirectory()
);

const commonModules = ['axios', 'jsonwebtoken', 'pg', 'redis', 'amqplib', 'express', 'dotenv'];
let missingDeps = [];

services.forEach(serviceName => {
  const servicePath = path.join(servicesDir, serviceName);
  const packageJson = path.join(servicePath, 'package.json');
  
  if (!fs.existsSync(packageJson)) {
    console.warn(`⚠️  ${serviceName}: No package.json found`);
    return;
  }
  
  const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  
  // Check source files for imports
  const sourceFiles = execSync(
    `find ${servicePath}/src -name "*.js" -o -name "*.ts" 2>/dev/null || true`,
    { encoding: 'utf8' }
  ).split('\n').filter(Boolean);
  
  commonModules.forEach(module => {
    sourceFiles.forEach(file => {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const hasImport = content.includes(`require('${module}')`) || 
                         content.includes(`from '${module}'`) ||
                         content.includes(`import '${module}'`);
        
        if (hasImport && !dependencies[module]) {
          missingDeps.push(`${serviceName}: Missing ${module}`);
        }
      }
    });
  });
});

if (missingDeps.length > 0) {
  console.error('❌ Missing dependencies detected:');
  [...new Set(missingDeps)].forEach(dep => console.error(`  ${dep}`));
  process.exit(1);
} else {
  console.log('✅ All imported modules are in package.json');
}
