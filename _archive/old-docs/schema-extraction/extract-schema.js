const fs = require('fs');
const path = require('path');

// Read the markdown file
const serviceName = process.argv[2];
if (!serviceName) {
  console.error('Usage: node extract-schema.js <service-name>');
  process.exit(1);
}

const filePath = path.join(__dirname, '..', 'schema-extraction', `${serviceName}-complete.md`);
const content = fs.readFileSync(filePath, 'utf-8');

// Get all table names from FROM clauses
const fromMatches = content.matchAll(/FROM\s+([a-z_]+)/gi);
const tables = new Set();
for (const match of fromMatches) {
  tables.add(match[1]);
}

console.log(`Found ${tables.size} tables in ${serviceName}\n`);

// For each table, extract column information
const schemas = {};

tables.forEach(table => {
  schemas[table] = {
    columns: new Set(),
    queries: []
  };
  
  // Find INSERT statements
  const insertRegex = new RegExp(`INSERT INTO ${table}[\\s\\S]*?\\(([^)]+)\\)`, 'gi');
  const inserts = content.matchAll(insertRegex);
  
  for (const insert of inserts) {
    const columnList = insert[1];
    const columns = columnList.split(',').map(c => c.trim());
    columns.forEach(col => {
      if (col && !col.includes('$')) {
        schemas[table].columns.add(col);
      }
    });
    schemas[table].queries.push(`INSERT: ${insert[0].substring(0, 100)}...`);
  }
  
  // Find UPDATE statements to get more columns
  const updateRegex = new RegExp(`UPDATE ${table}[\\s\\S]*?SET ([^W]+)WHERE`, 'gi');
  const updates = content.matchAll(updateRegex);
  
  for (const update of updates) {
    const setClause = update[1];
    const assignments = setClause.split(',');
    assignments.forEach(assign => {
      const colMatch = assign.match(/([a-z_]+)\s*=/i);
      if (colMatch && !colMatch[1].includes('$')) {
        schemas[table].columns.add(colMatch[1].trim());
      }
    });
  }
  
  // Find SELECT statements to get columns in WHERE clauses
  const selectRegex = new RegExp(`SELECT[\\s\\S]*?FROM ${table}[\\s\\S]*?WHERE ([^;]+)`, 'gi');
  const selects = content.matchAll(selectRegex);
  
  for (const select of selects) {
    const whereClause = select[1];
    const conditions = whereClause.split(/AND|OR/i);
    conditions.forEach(cond => {
      const colMatch = cond.match(/([a-z_]+)\s*[=<>!]/i);
      if (colMatch && !colMatch[1].includes('$')) {
        schemas[table].columns.add(colMatch[1].trim());
      }
    });
  }
});

// Output results
console.log('=' .repeat(80));
console.log(`SCHEMA EXTRACTION FOR: ${serviceName}`);
console.log('='.repeat(80));
console.log();

Object.keys(schemas).sort().forEach(table => {
  console.log(`## TABLE: ${table}`);
  console.log(`Columns found: ${schemas[table].columns.size}`);
  console.log('Columns:');
  Array.from(schemas[table].columns).sort().forEach(col => {
    console.log(`  - ${col}`);
  });
  console.log();
});

// Write to output file
const outputPath = path.join(__dirname, `${serviceName}-schema-extracted.txt`);
let output = `Schema Extraction for ${serviceName}\n`;
output += `Generated: ${new Date().toISOString()}\n\n`;

Object.keys(schemas).sort().forEach(table => {
  output += `TABLE: ${table}\n`;
  output += `Columns: ${Array.from(schemas[table].columns).sort().join(', ')}\n\n`;
});

fs.writeFileSync(outputPath, output);
console.log(`\nResults written to: ${outputPath}`);
