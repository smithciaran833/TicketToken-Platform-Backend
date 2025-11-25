import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:3003/api/v1';
const AUTH_URL = process.env.AUTH_URL || 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class EventServiceTests {
  private client: AxiosInstance;
  private authToken: string = '';
  private tenantId: string = '';
  private testResults: TestResult[] = [];
  
  // Test data IDs
  private testEventId: string = '';
  private testCapacityId: string = '';
  private testPricingId: string = '';

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 10000,
      validateStatus: () => true // Don't throw on any status
    });
  }

  async run(): Promise<void> {
    console.log('🚀 Starting Event Service Integration Tests\n');
    console.log('=' .repeat(60));

    try {
      await this.authenticate();
      
      // Core functionality tests
      await this.testHealth();
      await this.testEventCRUD();
      await this.testCapacityManagement();
      await this.testPricingManagement();
      await this.testReservationSystem();
      await this.testTenantIsolation();
      await this.testAuthProtection();
      
      // Print results
      this.printResults();
      
    } catch (error: any) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  private async authenticate(): Promise<void> {
    console.log('\n🔐 Authenticating...');
    
    const response = await axios.post(`${AUTH_URL}/auth/login`, {
      email: 'test2@test.com',
      password: 'Test123!@#'
    });

    if (response.status !== 200) {
      throw new Error('Authentication failed');
    }

    this.authToken = response.data.data.tokens.accessToken;
    const payload = JSON.parse(Buffer.from(this.authToken.split('.')[1], 'base64').toString());
    this.tenantId = payload.tenant_id;
    
    console.log(`✅ Authenticated as tenant: ${this.tenantId}`);
  }

  private async testHealth(): Promise<void> {
    await this.runTest('Health Check', async () => {
      const response = await axios.get('http://localhost:3003/health');
      
      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }
      
      if (response.data.status !== 'healthy') {
        throw new Error('Service not healthy');
      }

      if (!response.data.reservationCleanup?.isRunning) {
        throw new Error('Reservation cleanup job not running');
      }
    });
  }

  private async testEventCRUD(): Promise<void> {
    console.log('\n📅 Testing Event CRUD Operations');
    
    // Create Event
    await this.runTest('Create Event', async () => {
      const response = await this.client.post('/events', {
        name: 'Integration Test Event',
        description: 'Created by automated test',
        venue_id: '7025024b-7dab-4e9a-87d9-ea83caf1dc06'
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 201) {
        throw new Error(`Expected 201, got ${response.status}: ${JSON.stringify(response.data)}`);
      }

      this.testEventId = response.data.event.id;
      
      // Check if tenant_id exists and matches
      const eventTenantId = response.data.event.tenant_id;
      if (!eventTenantId) {
        throw new Error(`Event missing tenant_id. Event data: ${JSON.stringify(response.data.event)}`);
      }
      
      if (eventTenantId !== this.tenantId) {
        throw new Error(`Event created with wrong tenant_id. Expected: ${this.tenantId}, Got: ${eventTenantId}`);
      }
    });

    // Get Event
    await this.runTest('Get Event by ID', async () => {
      const response = await this.client.get(`/events/${this.testEventId}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (response.data.event.id !== this.testEventId) {
        throw new Error('Got wrong event');
      }
    });

    // List Events
    await this.runTest('List Events', async () => {
      const response = await this.client.get('/events', {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (!Array.isArray(response.data.events)) {
        throw new Error('Events not returned as array');
      }

      const hasOurEvent = response.data.events.some((e: any) => e.id === this.testEventId);
      if (!hasOurEvent) {
        throw new Error('Created event not in list');
      }
    });

    // Update Event
    await this.runTest('Update Event', async () => {
      const response = await this.client.put(`/events/${this.testEventId}`, {
        description: 'Updated by test'
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (response.data.event.description !== 'Updated by test') {
        throw new Error('Event not updated');
      }
    });

    // Publish Event
    await this.runTest('Publish Event', async () => {
      const response = await this.client.post(`/events/${this.testEventId}/publish`, {}, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (response.data.event.status !== 'PUBLISHED') {
        throw new Error('Event not published');
      }
    });
  }

  private async testCapacityManagement(): Promise<void> {
    console.log('\n🎫 Testing Capacity Management');

    // Create Capacity
    await this.runTest('Create Capacity', async () => {
      const response = await this.client.post(`/events/${this.testEventId}/capacity`, {
        section_name: 'Test Section',
        total_capacity: 50,
        section_code: 'TEST'
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 201) {
        throw new Error(`Expected 201, got ${response.status}: ${JSON.stringify(response.data)}`);
      }

      this.testCapacityId = response.data.capacity.id;

      if (response.data.capacity.tenant_id !== this.tenantId) {
        throw new Error('Capacity created with wrong tenant_id');
      }

      if (response.data.capacity.available_capacity !== 50) {
        throw new Error('Wrong available capacity');
      }
    });

    // Check Availability
    await this.runTest('Check Availability', async () => {
      const response = await this.client.post(`/capacity/${this.testCapacityId}/check`, {
        quantity: 10
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (response.data.available !== true) {
        throw new Error('Should be available');
      }
    });

    // Check Oversell Prevention
    await this.runTest('Prevent Overselling', async () => {
      const response = await this.client.post(`/capacity/${this.testCapacityId}/check`, {
        quantity: 100
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      if (response.data.available !== false) {
        throw new Error('Should not be available (oversell)');
      }
    });
  }

  private async testPricingManagement(): Promise<void> {
    console.log('\n💰 Testing Pricing Management');

    // Create Pricing
    await this.runTest('Create Pricing', async () => {
      const response = await this.client.post(`/events/${this.testEventId}/pricing`, {
        name: 'Test Pricing',
        base_price: 25.00,
        service_fee: 2.50,
        facility_fee: 1.00,
        tax_rate: 0.08,
        capacity_id: this.testCapacityId
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 201) {
        throw new Error(`Expected 201, got ${response.status}: ${JSON.stringify(response.data)}`);
      }

      this.testPricingId = response.data.pricing.id;

      if (response.data.pricing.tenant_id !== this.tenantId) {
        throw new Error('Pricing created with wrong tenant_id');
      }
    });

    // Calculate Price
    await this.runTest('Calculate Price', async () => {
      const response = await this.client.post(`/pricing/${this.testPricingId}/calculate`, {
        quantity: 2
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      // $25 base + $2.50 service + $1 facility = $28.50 per ticket
      // $28.50 * 2 = $57
      // Tax 8% on $57 = $4.56
      // Total = $61.56
      const expectedTotal = 61.56;
      
      if (Math.abs(response.data.total - expectedTotal) > 0.01) {
        throw new Error(`Price calc wrong: expected ${expectedTotal}, got ${response.data.total}`);
      }
    });
  }

  private async testReservationSystem(): Promise<void> {
    console.log('\n⏰ Testing Reservation System');

    // Reserve Capacity
    await this.runTest('Reserve Capacity', async () => {
      const response = await this.client.post(`/capacity/${this.testCapacityId}/reserve`, {
        quantity: 5,
        reservation_minutes: 1
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
      }

      if (response.data.capacity.reserved_capacity !== 5) {
        throw new Error('Reservation not created');
      }

      if (response.data.capacity.available_capacity !== 45) {
        throw new Error('Available capacity not decremented');
      }
    });
  }

  private async testTenantIsolation(): Promise<void> {
    console.log('\n🔒 Testing Tenant Isolation');

    await this.runTest('Tenant Isolation - Events', async () => {
      const response = await this.client.get('/events', {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Expected 200, got ${response.status}`);
      }

      // All events should have our tenant_id
      const wrongTenant = response.data.events.find((e: any) => e.tenant_id !== this.tenantId);
      if (wrongTenant) {
        throw new Error(`Found event with wrong tenant_id: ${wrongTenant.id}`);
      }
    });
  }

  private async testAuthProtection(): Promise<void> {
    console.log('\n🛡️  Testing Authentication Protection');

    await this.runTest('Reject Unauthenticated Request', async () => {
      const response = await this.client.get('/events'); // No auth header

      if (response.status !== 401) {
        throw new Error(`Expected 401, got ${response.status}`);
      }
    });
  }

  private async runTest(name: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.testResults.push({ name, passed: true, duration });
      console.log(`  ✅ ${name} (${duration}ms)`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.testResults.push({ name, passed: false, error: error.message, duration });
      console.log(`  ❌ ${name} (${duration}ms)`);
      console.log(`     Error: ${error.message}`);
    }
  }

  private printResults(): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(60));

    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;
    const totalTime = this.testResults.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\nTotal Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Total Time: ${totalTime}ms`);
    console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
      process.exit(1);
    } else {
      console.log('\n🎉 ALL TESTS PASSED!');
      process.exit(0);
    }
  }
}

// Run tests
const tests = new EventServiceTests();
tests.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
