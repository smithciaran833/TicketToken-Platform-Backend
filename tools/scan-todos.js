#!/usr/bin/env node

/**
 * TODO Scanner for TicketToken Platform
 * 
 * Scans the entire codebase for TODO, FIXME, HACK, XXX, and BUG comments.
 * Ignores markdown (.md) files and focuses on code files only.
 * 
 * Usage:
 *   node tools/scan-todos.js                    # Scan all code
 *   node tools/scan-todos.js --service auth     # Scan specific service
 *   node tools/scan-todos.js --json             # Output as JSON
 *   node tools/scan-todos.js --severity         # Group by severity
 *   node tools/scan-todos.js --summary          # Summary only
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  // Patterns to search for (case insensitive)
  patterns: [
    { tag: 'TODO', severity: 'medium', description: 'Planned work' },
    { tag: 'FIXME', severity: 'high', description: 'Needs fixing' },
    { tag: 'HACK', severity: 'high', description: 'Temporary workaround' },
    { tag: 'XXX', severity: 'high', description: 'Critical attention needed' },
    { tag: 'BUG', severity: 'critical', description: 'Known bug' },
    { tag: 'NOTE', severity: 'low', description: 'Important note' },
    { tag: 'OPTIMIZE', severity: 'low', description: 'Performance improvement' },
    { tag: 'REFACTOR', severity: 'low', description: 'Code refactoring needed' },
    { tag: 'DEPRECATED', severity: 'medium', description: 'Deprecated code' },
    { tag: 'REVIEW', severity: 'medium', description: 'Needs code review' },
  ],

  // File extensions to scan
  codeExtensions: [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',  // JavaScript/TypeScript
    '.py',                                          // Python
    '.rs',                                          // Rust
    '.sol',                                         // Solidity
    '.json',                                        // JSON (for comments in package.json, etc.)
    '.yaml', '.yml',                                // YAML config
    '.sh', '.bash',                                 // Shell scripts
    '.sql',                                         // SQL
    '.css', '.scss', '.less',                       // Styles
    '.html', '.vue', '.svelte',                     // Templates
  ],

  // Directories to ignore
  ignoreDirs: [
    'node_modules',
    'dist',
    'build',
    '.git',
    'coverage',
    '.next',
    '.turbo',
    '__pycache__',
    'target',                                       // Rust target
    '.cache',
    'vendor',
  ],

  // Files to ignore
  ignoreFiles: [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
  ],

  // File patterns to ignore (regex)
  ignorePatterns: [
    /\.min\./,                                      // Minified files
    /\.d\.ts$/,                                     // Type declaration files
    /\.map$/,                                       // Source maps
    /\.md$/i,                                       // Markdown files (explicit ignore)
  ],
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const severityColors = {
  critical: colors.bgRed + colors.white,
  high: colors.red,
  medium: colors.yellow,
  low: colors.dim,
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    service: null,
    json: false,
    summary: false,
    severity: false,
    help: false,
    verbose: false,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--service':
      case '-s':
        options.service = args[++i];
        break;
      case '--json':
      case '-j':
        options.json = true;
        break;
      case '--summary':
        options.summary = true;
        break;
      case '--severity':
        options.severity = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
    }
  }

  return options;
}

/**
 * Display help message
 */
function showHelp() {
  console.log(`
${colors.bright}TODO Scanner for TicketToken Platform${colors.reset}

${colors.cyan}Usage:${colors.reset}
  node tools/scan-todos.js [options]

${colors.cyan}Options:${colors.reset}
  --service, -s <name>   Scan specific service only (e.g., auth, payment)
  --json, -j             Output results as JSON
  --summary              Show summary statistics only
  --severity             Group results by severity level
  --output, -o <file>    Write results to file
  --verbose, -v          Show verbose output
  --help, -h             Show this help message

${colors.cyan}Examples:${colors.reset}
  node tools/scan-todos.js                          # Scan all code
  node tools/scan-todos.js --service auth           # Scan auth service
  node tools/scan-todos.js --json -o todos.json     # Export to JSON
  node tools/scan-todos.js --severity               # Group by severity
  node tools/scan-todos.js --summary                # Statistics only

${colors.cyan}Scanned Tags:${colors.reset}
  ${CONFIG.patterns.map(p => `${p.tag} (${p.severity})`).join(', ')}
`);
}

/**
 * Check if a file should be scanned
 */
function shouldScanFile(filePath) {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // Check if extension is allowed
  if (!CONFIG.codeExtensions.includes(ext)) {
    return false;
  }

  // Check ignore files
  if (CONFIG.ignoreFiles.includes(fileName)) {
    return false;
  }

  // Check ignore patterns
  for (const pattern of CONFIG.ignorePatterns) {
    if (pattern.test(filePath)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a directory should be traversed
 */
function shouldTraverseDir(dirName) {
  return !CONFIG.ignoreDirs.includes(dirName);
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dirPath, files = []) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (shouldTraverseDir(entry.name)) {
          getAllFiles(fullPath, files);
        }
      } else if (entry.isFile()) {
        if (shouldScanFile(fullPath)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }

  return files;
}

/**
 * Extract service name from file path
 */
function getServiceName(filePath) {
  const match = filePath.match(/services\/([^/]+)/);
  if (match) {
    return match[1];
  }

  if (filePath.includes('backend/shared')) {
    return 'shared';
  }

  if (filePath.includes('frontend')) {
    return 'frontend';
  }

  if (filePath.includes('smart-contracts')) {
    return 'smart-contracts';
  }

  if (filePath.includes('packages')) {
    return 'packages';
  }

  return 'root';
}

/**
 * Scan a file for TODO patterns
 */
function scanFile(filePath) {
  const results = [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    // Build regex pattern from all tags
    const tags = CONFIG.patterns.map(p => p.tag).join('|');
    const regex = new RegExp(`(//|/\\*|#|<!--|--|%)\\s*(${tags})\\s*:?\\s*(.*)`, 'gi');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      let match;

      while ((match = regex.exec(line)) !== null) {
        const tag = match[2].toUpperCase();
        const message = match[3].trim();
        const pattern = CONFIG.patterns.find(p => p.tag === tag);

        // Get context (surrounding lines)
        const contextStart = Math.max(0, lineNum - 1);
        const contextEnd = Math.min(lines.length - 1, lineNum + 1);
        const context = lines.slice(contextStart, contextEnd + 1).join('\n');

        results.push({
          file: filePath,
          relativePath: path.relative(process.cwd(), filePath),
          service: getServiceName(filePath),
          line: lineNum + 1,
          tag,
          severity: pattern?.severity || 'medium',
          message: message || '(no description)',
          context,
        });
      }
    }
  } catch (error) {
    // Skip files we can't read
  }

  return results;
}

/**
 * Format a single result for console output
 */
function formatResult(result, verbose = false) {
  const severityColor = severityColors[result.severity] || colors.reset;
  const tagStr = `${severityColor}[${result.tag}]${colors.reset}`;
  const locationStr = `${colors.cyan}${result.relativePath}${colors.reset}:${colors.yellow}${result.line}${colors.reset}`;

  let output = `${tagStr} ${locationStr}\n`;
  output += `    ${result.message}\n`;

  if (verbose && result.context) {
    output += `${colors.dim}    ---\n`;
    result.context.split('\n').forEach(line => {
      output += `    ${line}\n`;
    });
    output += `    ---${colors.reset}\n`;
  }

  return output;
}

/**
 * Generate summary statistics
 */
function generateSummary(results) {
  const summary = {
    total: results.length,
    byTag: {},
    bySeverity: {},
    byService: {},
  };

  for (const result of results) {
    // By tag
    summary.byTag[result.tag] = (summary.byTag[result.tag] || 0) + 1;

    // By severity
    summary.bySeverity[result.severity] = (summary.bySeverity[result.severity] || 0) + 1;

    // By service
    summary.byService[result.service] = (summary.byService[result.service] || 0) + 1;
  }

  return summary;
}

/**
 * Print summary to console
 */
function printSummary(summary) {
  console.log(`\n${colors.bright}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}                    TODO SCANNER SUMMARY${colors.reset}`);
  console.log(`${colors.bright}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

  console.log(`${colors.bright}Total Items Found:${colors.reset} ${summary.total}\n`);

  // By severity
  console.log(`${colors.bright}By Severity:${colors.reset}`);
  const severityOrder = ['critical', 'high', 'medium', 'low'];
  for (const severity of severityOrder) {
    const count = summary.bySeverity[severity] || 0;
    if (count > 0) {
      const bar = '█'.repeat(Math.min(count, 50));
      console.log(`  ${severityColors[severity]}${severity.padEnd(10)}${colors.reset} ${String(count).padStart(4)} ${colors.dim}${bar}${colors.reset}`);
    }
  }

  // By tag
  console.log(`\n${colors.bright}By Tag:${colors.reset}`);
  const sortedTags = Object.entries(summary.byTag).sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sortedTags) {
    const pattern = CONFIG.patterns.find(p => p.tag === tag);
    const bar = '█'.repeat(Math.min(count, 50));
    console.log(`  ${tag.padEnd(12)} ${String(count).padStart(4)} ${colors.dim}${bar}${colors.reset}`);
  }

  // By service
  console.log(`\n${colors.bright}By Service:${colors.reset}`);
  const sortedServices = Object.entries(summary.byService).sort((a, b) => b[1] - a[1]);
  for (const [service, count] of sortedServices) {
    const bar = '█'.repeat(Math.min(count, 50));
    console.log(`  ${colors.cyan}${service.padEnd(25)}${colors.reset} ${String(count).padStart(4)} ${colors.dim}${bar}${colors.reset}`);
  }

  console.log(`\n${colors.bright}═══════════════════════════════════════════════════════════════${colors.reset}\n`);
}

/**
 * Group results by various criteria
 */
function groupResults(results, groupBy) {
  const groups = {};

  for (const result of results) {
    const key = result[groupBy];
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(result);
  }

  return groups;
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log(`\n${colors.bright}🔍 Scanning codebase for TODO items...${colors.reset}\n`);

  // Determine scan directories
  let scanPaths = [process.cwd()];

  if (options.service) {
    const servicePath = path.join(process.cwd(), 'backend', 'services', `${options.service}-service`);
    if (fs.existsSync(servicePath)) {
      scanPaths = [servicePath];
      console.log(`${colors.dim}Scanning service: ${options.service}${colors.reset}\n`);
    } else {
      console.error(`${colors.red}Error: Service '${options.service}' not found at ${servicePath}${colors.reset}`);
      process.exit(1);
    }
  }

  // Collect all files
  let allFiles = [];
  for (const scanPath of scanPaths) {
    allFiles = allFiles.concat(getAllFiles(scanPath));
  }

  console.log(`${colors.dim}Found ${allFiles.length} code files to scan...${colors.reset}\n`);

  // Scan all files
  let allResults = [];
  for (const file of allFiles) {
    const results = scanFile(file);
    allResults = allResults.concat(results);
  }

  // Filter by service if specified
  if (options.service) {
    allResults = allResults.filter(r => r.service === `${options.service}-service`);
  }

  // Generate summary
  const summary = generateSummary(allResults);

  // Output based on options
  if (options.json) {
    const output = {
      scanDate: new Date().toISOString(),
      summary,
      results: allResults,
    };

    const jsonOutput = JSON.stringify(output, null, 2);

    if (options.output) {
      fs.writeFileSync(options.output, jsonOutput);
      console.log(`${colors.green}✓ Results written to ${options.output}${colors.reset}`);
    } else {
      console.log(jsonOutput);
    }
  } else if (options.summary) {
    printSummary(summary);
  } else {
    // Default: print all results grouped by service
    const groupKey = options.severity ? 'severity' : 'service';
    const groups = groupResults(allResults, groupKey);

    const groupOrder = options.severity
      ? ['critical', 'high', 'medium', 'low']
      : Object.keys(groups).sort();

    for (const group of groupOrder) {
      if (!groups[group] || groups[group].length === 0) continue;

      const groupColor = options.severity ? severityColors[group] : colors.cyan;
      console.log(`\n${colors.bright}${groupColor}━━━ ${group.toUpperCase()} (${groups[group].length} items) ━━━${colors.reset}\n`);

      for (const result of groups[group]) {
        console.log(formatResult(result, options.verbose));
      }
    }

    // Always print summary at the end
    printSummary(summary);
  }

  // Exit with error code if critical items found
  if (summary.bySeverity.critical > 0) {
    console.log(`${colors.red}⚠️  ${summary.bySeverity.critical} critical item(s) found!${colors.reset}`);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
