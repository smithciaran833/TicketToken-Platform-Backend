import { stopContainers } from './setup/test-containers';

export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up test environment...\n');
  
  await stopContainers();
  
  console.log('\n✅ Cleanup complete\n');
}
