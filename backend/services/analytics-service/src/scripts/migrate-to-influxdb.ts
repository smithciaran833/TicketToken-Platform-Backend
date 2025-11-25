import { MetricsMigrationService } from '../services/metrics-migration.service';

async function main() {
  const migrationService = new MetricsMigrationService();

  const startDate = new Date(process.argv[2] || '2024-01-01');
  const endDate = new Date(process.argv[3] || new Date().toISOString());

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INFLUXDB MIGRATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Start Date: ${startDate.toISOString()}
  End Date: ${endDate.toISOString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);

  await migrationService.migrateHistoricalData(startDate, endDate);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Migration complete!
  
  Next steps:
  1. Validate data (run validation script)
  2. Switch reads to InfluxDB
  3. Stop MongoDB writes after 1 week
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
  
  process.exit(0);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
