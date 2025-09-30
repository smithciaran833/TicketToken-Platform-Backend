#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking environment variables...\n');

const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'AMQP_URL',
  'PORT'
];

const servicesDir = path.join(process.cwd(), 'backend/services');
const services = fs.readdirSync(servicesDir).filter(f => 
  fs.statSync(path.join(servicesDir, f)).isDirectory()
);

let missingEnvs = [];

services.forEach(serviceName => {
  const servicePath = path.join(servicesDir, serviceName);
  const envFile = path.join(servicePath, '.env');
  
  if (!fs.existsSync(envFile)) {
    missingEnvs.push(`${serviceName}: No .env file found`);
    return;
  }
  
  const content = fs.readFileSync(envFile, 'utf8');
  requiredEnvVars.forEach(varName => {
    if (!content.includes(`${varName}=`)) {
      missingEnvs.push(`${serviceName}: Missing ${varName}`);
    }
  });
  
  // Check for consistent JWT_SECRET
  const jwtMatch = content.match(/JWT_SECRET=(.+)/);
  if (jwtMatch && jwtMatch[1] !== 'development_secret_change_in_production') {
    console.warn(`⚠️  ${serviceName}: JWT_SECRET differs from standard`);
  }
});

if (missingEnvs.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingEnvs.forEach(missing => console.error(`  ${missing}`));
  process.exit(1);
} else {
  console.log('✅ All required environment variables are present');
}
