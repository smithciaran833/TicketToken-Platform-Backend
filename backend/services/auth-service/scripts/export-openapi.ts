/**
 * OpenAPI Spec Export Script
 *
 * Generates the OpenAPI specification from the running Fastify app
 * and saves it to docs/api/openapi.json
 *
 * Usage: npx tsx scripts/export-openapi.ts
 */

import fs from 'fs';
import path from 'path';
import { buildApp } from '../src/app';

async function exportOpenApiSpec() {
  console.log('Building app to extract OpenAPI spec...');

  // Mock environment for spec generation
  process.env.NODE_ENV = 'development';
  process.env.DB_HOST = 'localhost';
  process.env.DB_NAME = 'test';
  process.env.DB_USER = 'test';
  process.env.DB_PASSWORD = 'test';

  try {
    const app = await buildApp();

    // Wait for Swagger to initialize
    await app.ready();

    // Get the OpenAPI spec from Swagger
    const spec = (app as any).swagger();

    // Ensure docs/api directory exists
    const outputDir = path.join(__dirname, '..', 'docs', 'api');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write JSON spec
    const jsonPath = path.join(outputDir, 'openapi.json');
    fs.writeFileSync(jsonPath, JSON.stringify(spec, null, 2));
    console.log(`OpenAPI spec written to: ${jsonPath}`);

    // Write YAML spec (simple conversion)
    const yamlPath = path.join(outputDir, 'openapi.yaml');
    const yaml = jsonToYaml(spec);
    fs.writeFileSync(yamlPath, yaml);
    console.log(`OpenAPI spec written to: ${yamlPath}`);

    await app.close();
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to export OpenAPI spec:', error);
    process.exit(1);
  }
}

function jsonToYaml(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent);
  let yaml = '';

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      yaml += `${spaces}${key}: null\n`;
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      yaml += jsonToYaml(value, indent + 1);
    } else if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`;
      for (const item of value) {
        if (typeof item === 'object') {
          yaml += `${spaces}  -\n`;
          yaml += jsonToYaml(item, indent + 2).replace(/^/, '');
        } else {
          yaml += `${spaces}  - ${JSON.stringify(item)}\n`;
        }
      }
    } else if (typeof value === 'string') {
      // Handle multiline strings and special characters
      if (value.includes('\n') || value.includes(':') || value.includes('#')) {
        yaml += `${spaces}${key}: "${value.replace(/"/g, '\\"')}"\n`;
      } else {
        yaml += `${spaces}${key}: ${value}\n`;
      }
    } else {
      yaml += `${spaces}${key}: ${value}\n`;
    }
  }

  return yaml;
}

exportOpenApiSpec();
