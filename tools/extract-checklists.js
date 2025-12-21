#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Extract Section 3 (Audit Checklist) from all research documents
 * and combine into a master checklist file
 */

const DOCS_DIR = path.join(__dirname, '../Docs/research');
const OUTPUT_FILE = path.join(DOCS_DIR, 'MASTER-CHECKLIST.md');

// Patterns to identify Section 3 start
const SECTION_3_PATTERNS = [
  /^##\s*3[\s\.].*$/im,           // ## 3. or ## 3
  /^##\s*Section\s*3.*$/im,       // ## Section 3
  /^##\s*Audit\s*Checklist.*$/im  // ## Audit Checklist
];

// Patterns to identify Section 4 start (end of Section 3)
const SECTION_4_PATTERNS = [
  /^##\s*4[\s\.].*$/im,           // ## 4. or ## 4
  /^##\s*Section\s*4.*$/im,       // ## Section 4
  /^##\s*Sources.*$/im,           // ## Sources
  /^##\s*Priority\s*Matrix.*$/im  // ## Priority Matrix
];

/**
 * Extract Section 3 content from markdown text
 */
function extractSection3(content) {
  const lines = content.split('\n');
  
  // Find start of Section 3
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (SECTION_3_PATTERNS.some(pattern => pattern.test(lines[i]))) {
      startIndex = i;
      break;
    }
  }
  
  if (startIndex === -1) {
    return null;
  }
  
  // Find end of Section 3 (start of Section 4 or similar)
  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    if (SECTION_4_PATTERNS.some(pattern => pattern.test(lines[i]))) {
      endIndex = i;
      break;
    }
  }
  
  // Extract the section content (excluding the ## 3 heading itself)
  return lines.slice(startIndex + 1, endIndex).join('\n').trim();
}

/**
 * Main execution
 */
function main() {
  console.log('Extracting checklists from research documents...\n');
  
  // Read all markdown files in research directory
  const files = fs.readdirSync(DOCS_DIR)
    .filter(file => file.endsWith('.md') && file.match(/^\d{2}-/))
    .sort();
  
  if (files.length === 0) {
    console.error('No research documents found in', DOCS_DIR);
    process.exit(1);
  }
  
  console.log(`Found ${files.length} research documents`);
  
  // Build master checklist
  let masterContent = '# Master Checklist - All Research Documents\n\n';
  masterContent += `Generated: ${new Date().toISOString()}\n`;
  masterContent += `Total Documents: ${files.length}\n\n`;
  
  let successCount = 0;
  let failedDocs = [];
  
  for (const file of files) {
    const filePath = path.join(DOCS_DIR, file);
    const docNumber = file.split('-')[0];
    const docName = file.replace('.md', '');
    
    console.log(`Processing: ${file}`);
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const section3Content = extractSection3(content);
      
      if (section3Content) {
        masterContent += '---\n\n';
        masterContent += `## ${docNumber} - ${docName}\n\n`;
        masterContent += section3Content + '\n\n';
        successCount++;
      } else {
        console.warn(`  ⚠ Warning: No Section 3 found in ${file}`);
        failedDocs.push(file);
      }
    } catch (error) {
      console.error(`  ✗ Error processing ${file}:`, error.message);
      failedDocs.push(file);
    }
  }
  
  // Write output file
  fs.writeFileSync(OUTPUT_FILE, masterContent, 'utf-8');
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('EXTRACTION COMPLETE');
  console.log('='.repeat(60));
  console.log(`✓ Successfully extracted: ${successCount} documents`);
  if (failedDocs.length > 0) {
    console.log(`✗ Failed to extract: ${failedDocs.length} documents`);
    console.log(`  Failed docs: ${failedDocs.join(', ')}`);
  }
  console.log(`\nOutput written to: ${OUTPUT_FILE}`);
  console.log(`File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
}

// Run the script
try {
  main();
} catch (error) {
  console.error('Fatal error:', error);
  process.exit(1);
}
