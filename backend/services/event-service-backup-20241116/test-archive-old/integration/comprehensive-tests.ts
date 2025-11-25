import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:3003/api/v1';
const AUTH_URL = process.env.AUTH_URL || 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class ComprehensiveEventServiceTests {
  private client: AxiosInstance;
  private authToken: string = '';
  private tenantId: string = '';
  private testResults: TestResult[] = [];
  
  private testEventId: string = '';
  private testCapacityId: string = '';
  private testPricingId: string = '';

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 10000,
      validateStatus: () => true
    });
  }

  async run(): Promise<void> {
    console.log('🚀 Starting COMPREHENSIVE Event Service Tests\n');
    console.log('=' .repeat(70));

    try {
      await this.authenticate();
      
      // Setup test data
      await this.setupTestData();
      
      // Run all test categories
      await this.testErrorHandling();
      await this.testDataValidation();
      await this.testEdgeCases();
      await this.testConcurrentOperations();
      await this.testCapacityLimits();
      await this.testPricingEdgeCases();
      await this.testReservationEdgeCases();
      await this.testDeleteOperations();
      
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

  private async setupTestData(): Promise<void> {
    console.log('\n📦 Setting up test data...');
    
    // Create test event
    const eventResponse = await this.client.post('/events', {
      name: 'Comprehensive Test Event',
      description: 'For comprehensive testing',
      venue_id: '7025024b-7dab-4e9a-87d9-ea83caf1dc06'
    }, {
      headers: { Authorization: `Bearer ${this.authToken}` }
    });
    
    this.testEventId = eventResponse.data.event.id;
    
    // Create test capacity
    const capacityResponse = await this.client.post(`/events/${this.testEventId}/capacity`, {
      section_name: 'Test Section',
      total_capacity: 100,
      section_code: 'TEST'
    }, {
      headers: { Authorization: `Bearer ${this.authToken}` }
    });
    
    this.testCapacityId = capacityResponse.data.capacity.id;
    
    // Create test pricing
    const pricingResponse = await this.client.post(`/events/${this.testEventId}/pricing`, {
      name: 'Test Pricing',
      base_price: 50.00,
      service_fee: 5.00,
      capacity_id: this.testCapacityId
    }, {
      headers: { Authorization: `Bearer ${this.authToken}` }
    });
    
    this.testPricingId = pricingResponse.data.pricing.id;
    
    console.log('✅ Test data created');
  }

  private async testErrorHandling(): Promise<void> {
    console.log('\n🚨 Testing Error Handling');
    
    await this.runTest('404 - Get Non-existent Event', async () => {
      const response = await this.client.get('/events/00000000-0000-0000-0000-000000000000', {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status !== 404) {
        throw new Error(`Expected 404, got ${response.status}`);
      }
    });

    await this.runTest('404 - Get Non-existent Capacity', async () => {
      const response = await this.client.get('/capacity/00000000-0000-0000-0000-000000000000', {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status !== 404) {
        throw new Error(`Expected 404, got ${response.status}`);
      }
    });

    await this.runTest('404 - Get Non-existent Pricing', async () => {
      const response = await this.client.get('/pricing/00000000-0000-0000-0000-000000000000', {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status !== 404) {
        throw new Error(`Expected 404, got ${response.status}`);
      }
    });

    await this.runTest('401 - Missing Auth Token', async () => {
      const response = await this.client.get('/events');
      
      if (response.status !== 401) {
        throw new Error(`Expected 401, got ${response.status}`);
      }
    });

    await this.runTest('401 - Invalid Auth Token', async () => {
      const response = await this.client.get('/events', {
        headers: { Authorization: 'Bearer invalid-token-12345' }
      });
      
      if (response.status !== 401) {
        throw new Error(`Expected 401, got ${response.status}`);
      }
    });
  }

  private async testDataValidation(): Promise<void> {
    console.log('\n✅ Testing Data Validation');

    await this.runTest('Reject Event Without Name', async () => {
      const response = await this.client.post('/events', {
        description: 'Missing name',
        venue_id: '7025024b-7dab-4e9a-87d9-ea83caf1dc06'
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status === 201) {
        throw new Error('Should reject event without name');
      }
    });

    await this.runTest('Reject Event Without Venue', async () => {
      const response = await this.client.post('/events', {
        name: 'Test Event'
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status === 201) {
        throw new Error('Should reject event without venue');
      }
    });

    await this.runTest('Reject Capacity Without Section Name', async () => {
      const response = await this.client.post(`/events/${this.testEventId}/capacity`, {
        total_capacity: 100
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status === 201) {
        throw new Error('Should reject capacity without section_name');
      }
    });

    await this.runTest('Reject Negative Capacity', async () => {
      const response = await this.client.post(`/events/${this.testEventId}/capacity`, {
        section_name: 'Negative Test',
        total_capacity: -50
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status === 201) {
        throw new Error('Should reject negative capacity');
      }
    });

    await this.runTest('Reject Negative Price', async () => {
      const response = await this.client.post(`/events/${this.testEventId}/pricing`, {
        name: 'Negative Price',
        base_price: -10.00,
        capacity_id: this.testCapacityId
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status === 201) {
        throw new Error('Should reject negative price');
      }
    });
  }

  private async testEdgeCases(): Promise<void> {
    console.log('\n🔍 Testing Edge Cases');

    await this.runTest('Check Availability - Zero Quantity', async () => {
      const response = await this.client.post(`/capacity/${this.testCapacityId}/check`, {
        quantity: 0
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status === 200) {
        throw new Error('Should reject zero quantity');
      }
    });

    await this.runTest('Check Availability - Negative Quantity', async () => {
      const response = await this.client.post(`/capacity/${this.testCapacityId}/check`, {
        quantity: -5
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status === 200) {
        throw new Error('Should reject negative quantity');
      }
    });

    await this.runTest('Calculate Price - Zero Quantity', async () => {
      const response = await this.client.post(`/pricing/${this.testPricingId}/calculate`, {
        quantity: 0
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status === 200) {
        throw new Error('Should reject zero quantity');
      }
    });

    await this.runTest('Reserve Exact Available Capacity', async () => {
      // Get current available
      const capResponse = await this.client.get(`/capacity/${this.testCapacityId}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      const available = capResponse.data.capacity.available_capacity;
      
      const response = await this.client.post(`/capacity/${this.testCapacityId}/reserve`, {
        quantity: available,
        reservation_minutes: 1
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status !== 200) {
        throw new Error(`Should allow reserving exact available: ${response.data.message}`);
      }
      
      if (response.data.capacity.available_capacity !== 0) {
        throw new Error('Available should be 0 after reserving all');
      }
    });
  }

  private async testConcurrentOperations(): Promise<void> {
    console.log('\n🔄 Testing Concurrent Operations');

    await this.runTest('Concurrent Capacity Checks', async () => {
      const promises = Array(10).fill(0).map(() => 
        this.client.post(`/capacity/${this.testCapacityId}/check`, {
          quantity: 5
        }, {
          headers: { Authorization: `Bearer ${this.authToken}` }
        })
      );
      
      const results = await Promise.all(promises);
      
      if (results.some(r => r.status !== 200)) {
        throw new Error('Some concurrent checks failed');
      }
    });

    await this.runTest('Concurrent Price Calculations', async () => {
      const promises = Array(10).fill(0).map(() => 
        this.client.post(`/pricing/${this.testPricingId}/calculate`, {
          quantity: 2
        }, {
          headers: { Authorization: `Bearer ${this.authToken}` }
        })
      );
      
      const results = await Promise.all(promises);
      
      if (results.some(r => r.status !== 200)) {
        throw new Error('Some concurrent calculations failed');
      }
      
      // All should return same price
      const prices = results.map(r => r.data.total);
      if (new Set(prices).size !== 1) {
        throw new Error('Concurrent calculations returned different prices');
      }
    });
  }

  private async testCapacityLimits(): Promise<void> {
    console.log('\n🎫 Testing Capacity Limits');

    await this.runTest('Cannot Reserve More Than Available', async () => {
      const capResponse = await this.client.get(`/capacity/${this.testCapacityId}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      const available = capResponse.data.capacity.available_capacity;
      
      const response = await this.client.post(`/capacity/${this.testCapacityId}/reserve`, {
        quantity: available + 1000,
        reservation_minutes: 1
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status === 200) {
        throw new Error('Should not allow reserving more than available');
      }
    });

    await this.runTest('Check Boundary - Exactly At Capacity', async () => {
      // Create new capacity for clean test
      const newCapResponse = await this.client.post(`/events/${this.testEventId}/capacity`, {
        section_name: 'Boundary Test',
        total_capacity: 10,
        section_code: 'BOUND'
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      const capId = newCapResponse.data.capacity.id;
      
      const checkResponse = await this.client.post(`/capacity/${capId}/check`, {
        quantity: 10
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (!checkResponse.data.available) {
        throw new Error('Should be available at exact capacity');
      }
      
      const checkOverResponse = await this.client.post(`/capacity/${capId}/check`, {
        quantity: 11
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (checkOverResponse.data.available) {
        throw new Error('Should not be available over capacity');
      }
    });
  }

  private async testPricingEdgeCases(): Promise<void> {
    console.log('\n💰 Testing Pricing Edge Cases');

    await this.runTest('Calculate Large Quantity Price', async () => {
      const response = await this.client.post(`/pricing/${this.testPricingId}/calculate`, {
        quantity: 1000
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status !== 200) {
        throw new Error('Should handle large quantity');
      }
      
      if (response.data.total <= 0) {
        throw new Error('Price should be positive');
      }
    });

    await this.runTest('Price Calculation Accuracy', async () => {
      const response = await this.client.post(`/pricing/${this.testPricingId}/calculate`, {
        quantity: 3
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status !== 200) {
        throw new Error('Price calculation failed');
      }
      
      const { base_price, service_fee, total, per_ticket } = response.data;
      
      // Verify math
      const expectedPerTicket = total / 3;
      if (Math.abs(per_ticket - expectedPerTicket) > 0.01) {
        throw new Error('Per ticket price calculation incorrect');
      }
    });
  }

  private async testReservationEdgeCases(): Promise<void> {
    console.log('\n⏰ Testing Reservation Edge Cases');

    await this.runTest('Reserve With Custom Expiry', async () => {
      // Create fresh capacity
      const capResponse = await this.client.post(`/events/${this.testEventId}/capacity`, {
        section_name: 'Reservation Test',
        total_capacity: 50,
        section_code: 'RES'
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      const capId = capResponse.data.capacity.id;
      
      const response = await this.client.post(`/capacity/${capId}/reserve`, {
        quantity: 5,
        reservation_minutes: 30
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response.status !== 200) {
        throw new Error('Custom expiry reservation failed');
      }
      
      const expiresAt = new Date(response.data.capacity.reserved_expires_at);
      const now = new Date();
      const diffMinutes = (expiresAt.getTime() - now.getTime()) / 60000;
      
      if (Math.abs(diffMinutes - 30) > 2) {
        throw new Error('Reservation expiry time incorrect');
      }
    });

    await this.runTest('Multiple Reservations Same Section', async () => {
      // Create fresh capacity
      const capResponse = await this.client.post(`/events/${this.testEventId}/capacity`, {
        section_name: 'Multi Reserve Test',
        total_capacity: 100,
        section_code: 'MULTI'
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      const capId = capResponse.data.capacity.id;
      
      // First reservation
      await this.client.post(`/capacity/${capId}/reserve`, {
        quantity: 10,
        reservation_minutes: 1
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      // Second reservation
      const response2 = await this.client.post(`/capacity/${capId}/reserve`, {
        quantity: 20,
        reservation_minutes: 1
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (response2.status !== 200) {
        throw new Error('Second reservation failed');
      }
      
      if (response2.data.capacity.reserved_capacity !== 30) {
        throw new Error('Reserved capacity not accumulated correctly');
      }
      
      if (response2.data.capacity.available_capacity !== 70) {
        throw new Error('Available capacity not decremented correctly');
      }
    });
  }

  private async testDeleteOperations(): Promise<void> {
    console.log('\n🗑️  Testing Delete Operations');

    await this.runTest('Delete Event', async () => {
      // Create event to delete
      const createResponse = await this.client.post('/events', {
        name: 'Event To Delete',
        venue_id: '7025024b-7dab-4e9a-87d9-ea83caf1dc06'
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      const eventId = createResponse.data.event.id;
      
      const deleteResponse = await this.client.delete(`/events/${eventId}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (deleteResponse.status !== 204 && deleteResponse.status !== 200) {
        throw new Error(`Delete failed with status ${deleteResponse.status}`);
      }
      
      // Verify it's gone
      const getResponse = await this.client.get(`/events/${eventId}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });
      
      if (getResponse.status !== 404) {
        throw new Error('Deleted event still accessible');
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
    console.log('\n' + '='.repeat(70));
    console.log('📊 COMPREHENSIVE TEST RESULTS');
    console.log('='.repeat(70));

    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;
    const totalTime = this.testResults.reduce((sum, r) => sum + r.duration, 0);

    console.log(`\n📈 Overall Statistics:`);
    console.log(`   Total Tests: ${total}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏱️  Total Time: ${totalTime}ms`);
    console.log(`   📊 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    // Category breakdown
    const categories = {
      'Error Handling': this.testResults.filter(r => r.name.includes('404') || r.name.includes('401')),
      'Data Validation': this.testResults.filter(r => r.name.includes('Reject') || r.name.includes('Negative')),
      'Edge Cases': this.testResults.filter(r => r.name.includes('Zero') || r.name.includes('Boundary') || r.name.includes('Exact')),
      'Concurrent Operations': this.testResults.filter(r => r.name.includes('Concurrent')),
      'Capacity Limits': this.testResults.filter(r => r.name.includes('Cannot Reserve') || r.name.includes('More Than')),
      'Pricing': this.testResults.filter(r => r.name.includes('Price') && r.name.includes('Calculate')),
      'Reservations': this.testResults.filter(r => r.name.includes('Reservation') && r.name.includes('Test')),
      'Delete Operations': this.testResults.filter(r => r.name.includes('Delete'))
    };

    console.log(`\n📂 Category Breakdown:`);
    for (const [category, tests] of Object.entries(categories)) {
      const catPassed = tests.filter(t => t.passed).length;
      const catTotal = tests.length;
      if (catTotal > 0) {
        console.log(`   ${category}: ${catPassed}/${catTotal} passed`);
      }
    }

    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}`);
        console.log(`    ${r.error}`);
      });
      process.exit(1);
    } else {
      console.log('\n🎉 ALL COMPREHENSIVE TESTS PASSED!');
      console.log('🏆 Event Service is PRODUCTION READY!');
      process.exit(0);
    }
  }
}

// Run tests
const tests = new ComprehensiveEventServiceTests();
tests.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
