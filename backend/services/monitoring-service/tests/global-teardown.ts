/**
 * Jest Global Teardown for Monitoring Service
 *
 * Runs once after all tests
 */

export default async function globalTeardown(): Promise<void> {
  console.log('\n🧹 Cleaning up Monitoring Service Test Suite...\n');
  console.log('\n✨ Monitoring Service Test Suite Complete!\n');
}
