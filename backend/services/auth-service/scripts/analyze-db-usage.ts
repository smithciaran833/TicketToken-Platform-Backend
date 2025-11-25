import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askPassword(): Promise<string> {
  return new Promise((resolve) => {
    rl.question('Enter postgres password: ', (password: string) => {
      resolve(password);
    });
  });
}

// Regex patterns to extract database operations
const patterns = {
  knexTable: /(?:db|knex)\(['"](\w+)['"]\)/g,
  poolQuery: /pool\.query\(['"](.*?)['"][\s,]/g,
  withSchema: /\.withSchema\(['"](\w+)['"]\)/g,
  update: /\.update\(\{([^}]+)\}\)/g,
  insert: /\.insert\(\{([^}]+)\}\)/g,
  select: /\.select\(\[([^\]]+)\]\)/g,
};

async function getDbTables(pool: Pool): Promise<Record<string, string[]>> {
  const result = await pool.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const tables: Record<string, string[]> = {};
  result.rows.forEach(row => {
    if (!tables[row.table_name]) {
      tables[row.table_name] = [];
    }
    tables[row.table_name].push(row.column_name);
  });

  return tables;
}

async function getDbSchemas(pool: Pool): Promise<string[]> {
  const result = await pool.query(`
    SELECT schema_name FROM information_schema.schemata
  `);
  return result.rows.map(r => r.schema_name);
}

function extractFromFile(filePath: string, content: string) {
  const results = {
    file: filePath,
    tables: new Set<string>(),
    schemas: new Set<string>(),
    columns: new Set<string>(),
    rawQueries: [] as string[],
  };

  let match;
  while ((match = patterns.knexTable.exec(content)) !== null) {
    results.tables.add(match[1]);
  }

  patterns.withSchema.lastIndex = 0;
  while ((match = patterns.withSchema.exec(content)) !== null) {
    results.schemas.add(match[1]);
  }

  patterns.update.lastIndex = 0;
  while ((match = patterns.update.exec(content)) !== null) {
    const columns = match[1].split(',').map(c => c.trim().split(':')[0].trim());
    columns.forEach(col => results.columns.add(col));
  }

  patterns.insert.lastIndex = 0;
  while ((match = patterns.insert.exec(content)) !== null) {
    const columns = match[1].split(',').map(c => c.trim().split(':')[0].trim());
    columns.forEach(col => results.columns.add(col));
  }

  patterns.poolQuery.lastIndex = 0;
  while ((match = patterns.poolQuery.exec(content)) !== null) {
    results.rawQueries.push(match[1]);

    const sqlTableMatch = match[1].match(/FROM\s+(\w+)|INTO\s+(\w+)|UPDATE\s+(\w+)/i);
    if (sqlTableMatch) {
      const tableName = sqlTableMatch[1] || sqlTableMatch[2] || sqlTableMatch[3];
      results.tables.add(tableName);
    }
  }

  return results;
}

function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('dist')) {
        walkDir(filePath, fileList);
      }
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

async function analyzeService(pool: Pool) {
  console.log('Fetching database schema...');
  const dbTables = await getDbTables(pool);
  const dbSchemas = await getDbSchemas(pool);

  console.log('Analyzing service files...');
  const srcDir = path.join(__dirname, '../src');
  const files = walkDir(srcDir);

  const report = {
    filesAnalyzed: files.length,
    tablesFound: new Set<string>(),
    schemasFound: new Set<string>(),
    columnsFound: new Set<string>(),
    missingTables: new Set<string>(),
    missingSchemas: new Set<string>(),
    missingColumns: {} as Record<string, Set<string>>,
    fileDetails: [] as any[],
  };

  files.forEach(file => {
    const content = fs.readFileSync(file, 'utf8');
    const extracted = extractFromFile(file, content);

    if (extracted.tables.size > 0 || extracted.schemas.size > 0 || extracted.columns.size > 0) {
      extracted.tables.forEach(t => report.tablesFound.add(t));
      extracted.schemas.forEach(s => report.schemasFound.add(s));
      extracted.columns.forEach(c => report.columnsFound.add(c));

      report.fileDetails.push({
        file: path.relative(srcDir, file),
        tables: Array.from(extracted.tables),
        schemas: Array.from(extracted.schemas),
        columns: Array.from(extracted.columns),
        rawQueries: extracted.rawQueries,
      });
    }
  });

  report.tablesFound.forEach(table => {
    if (!dbTables[table]) {
      report.missingTables.add(table);
    }
  });

  report.schemasFound.forEach(schema => {
    if (!dbSchemas.includes(schema)) {
      report.missingSchemas.add(schema);
    }
  });

  report.fileDetails.forEach(detail => {
    detail.tables.forEach((table: string) => {
      if (dbTables[table]) {
        detail.columns.forEach((col: string) => {
          if (!dbTables[table].includes(col)) {
            if (!report.missingColumns[table]) {
              report.missingColumns[table] = new Set();
            }
            report.missingColumns[table].add(col);
          }
        });
      }
    });
  });

  return report;
}

async function main() {
  const password = await askPassword();
  rl.close();

  const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'tickettoken_db',
    password: password,
  });

  try {
    const report = await analyzeService(pool);

    console.log('\n=== AUTH SERVICE DATABASE ANALYSIS ===\n');
    console.log(`Files analyzed: ${report.filesAnalyzed}`);
    console.log(`Tables referenced: ${report.tablesFound.size}`);
    console.log(`Schemas referenced: ${report.schemasFound.size}`);
    console.log(`Columns referenced: ${report.columnsFound.size}`);

    console.log('\n=== ISSUES FOUND ===\n');

    if (report.missingTables.size > 0) {
      console.log('MISSING TABLES:');
      report.missingTables.forEach(t => console.log(`  ✗ ${t}`));
    }

    if (report.missingSchemas.size > 0) {
      console.log('\nMISSING SCHEMAS:');
      report.missingSchemas.forEach(s => console.log(`  ✗ ${s} (code uses this but doesn't exist)`));
    }

    if (Object.keys(report.missingColumns).length > 0) {
      console.log('\nMISSING COLUMNS:');
      Object.entries(report.missingColumns).forEach(([table, cols]) => {
        console.log(`  Table: ${table}`);
        cols.forEach(col => console.log(`    ✗ ${col}`));
      });
    }

    if (report.missingTables.size === 0 &&
        report.missingSchemas.size === 0 &&
        Object.keys(report.missingColumns).length === 0) {
      console.log('✓ No missing tables, schemas, or columns found!');
    }

    fs.writeFileSync(
      'database-analysis-report.json',
      JSON.stringify({
        ...report,
        missingTables: Array.from(report.missingTables),
        missingSchemas: Array.from(report.missingSchemas),
        missingColumns: Object.fromEntries(
          Object.entries(report.missingColumns).map(([k, v]) => [k, Array.from(v)])
        ),
        tablesFound: Array.from(report.tablesFound),
        schemasFound: Array.from(report.schemasFound),
        columnsFound: Array.from(report.columnsFound),
      }, null, 2)
    );

    console.log('\nDetailed report written to: database-analysis-report.json');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

main();
