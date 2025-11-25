import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.API_URL || 'http://localhost:3003/api/v1';
const AUTH_URL = process.env.AUTH_URL || 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

class PriceLockingTests {
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
    console.log('🔒 Starting Price Locking & Venue Validation Tests\n');
    console.log('=' .repeat(70));

    try {
      await this.authenticate();
      await this.setupTestData();
      
      await this.testVenueCapacityValidation();
      await this.testPriceLocking();
      
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
      name: 'Price Lock Test Event',
      description: 'Testing price locking',
      venue_id: '7025024b-7dab-4e9a-87d9-ea83caf1dc06'
    }, {
      headers: { Authorization: `Bearer ${this.authToken}` }
    });
    
    this.testEventId = eventResponse.data.event.id;
    console.log('✅ Test data created');
  }

  private async testVenueCapacityValidation(): Promise<void> {
    console.log('\n🏟️  Testing Venue Capacity Validation');

    await this.runTest('Reject Capacity Exceeding Venue Max', async () => {
      const response = await this.client.post(`/events/${this.testEventId}/capacity`, {
        section_name: 'Oversized Section',
        section_code: 'OVER',
        total_capacity: 10000  // Venue max is 5000
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status === 201) {
        throw new Error('Should have rejected oversized capacity');
      }

      if (response.status !== 400) {
        throw new Error(`Expected 400, got ${response.status}`);
      }

      if (!response.data.details || !response.data.details[0].message.includes('exceed')) {
        throw new Error('Error message should mention exceeding capacity');
      }
    });

    await this.runTest('Accept Valid Capacity Within Venue Max', async () => {
      const response = await this.client.post(`/events/${this.testEventId}/capacity`, {
        section_name: 'Valid Section',
        section_code: 'VALID',
        total_capacity: 1000
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 201) {
        throw new Error(`Expected 201, got ${response.status}: ${JSON.stringify(response.data)}`);
      }

      this.testCapacityId = response.data.capacity.id;
    });

    await this.runTest('Cumulative Capacity Validation', async () => {
      // Already have 1000 capacity, try to add 4500 more (total would be 5500, exceeds 5000)
      const response = await this.client.post(`/events/${this.testEventId}/capacity`, {
        section_name: 'Another Section',
        section_code: 'ANOTHER',
        total_capacity: 4500
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status === 201) {
        throw new Error('Should reject cumulative capacity exceeding venue max');
      }
    });
  }

  private async testPriceLocking(): Promise<void> {
    console.log('\n💰 Testing Price Locking');

    await this.runTest('Create Pricing', async () => {
      const response = await this.client.post(`/events/${this.testEventId}/pricing`, {
        name: 'Test Pricing',
        base_price: 50.00,
        service_fee: 5.00,
        facility_fee: 2.50,
        tax_rate: 0.08,
        capacity_id: this.testCapacityId
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 201) {
        throw new Error(`Failed to create pricing: ${response.status}`);
      }

      this.testPricingId = response.data.pricing.id;
    });

    await this.runTest('Reserve With Price Lock', async () => {
      const response = await this.client.post(`/capacity/${this.testCapacityId}/reserve`, {
        quantity: 5,
        reservation_minutes: 15,
        pricing_id: this.testPricingId
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      if (response.status !== 200) {
        throw new Error(`Reservation failed: ${response.status}`);
      }

      const lockedPrice = response.data.locked_price;
      if (!lockedPrice) {
        throw new Error('No locked price data returned');
      }

      if (parseFloat(lockedPrice.locked_price) !== 50.00) {
        throw new Error(`Expected locked price 50.00, got ${lockedPrice.locked_price}`);
      }

      if (!lockedPrice.pricing_id) {
        throw new Error('Missing pricing_id in locked data');
      }
    });

    await this.runTest('Price Lock Persists After Price Change', async () => {
      // Change the base price
      await this.client.put(`/pricing/${this.testPricingId}`, {
        base_price: 100.00  // Double the price!
      }, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      // Check that reservation still has old price locked
      const response = await this.client.get(`/capacity/${this.testCapacityId}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      const lockedPrice = response.data.capacity.locked_price_data;
      if (!lockedPrice) {
        throw new Error('Locked price data lost');
      }

      if (parseFloat(lockedPrice.locked_price) !== 50.00) {
        throw new Error(`Price changed! Expected 50.00, got ${lockedPrice.locked_price}`);
      }
    });

    await this.runTest('Locked Price Includes Fees', async () => {
      const response = await this.client.get(`/capacity/${this.testCapacityId}`, {
        headers: { Authorization: `Bearer ${this.authToken}` }
      });

      const lockedData = response.data.capacity.locked_price_data;
      
      if (!lockedData.service_fee) {
        throw new Error('Service fee not locked');
      }

      if (!lockedData.facility_fee) {
        throw new Error('Facility fee not locked');
      }

      if (!lockedData.tax_rate) {
        throw new Error('Tax rate not locked');
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
    console.log('📊 PRICE LOCKING & VENUE VALIDATION TEST RESULTS');
    console.log('='.repeat(70));

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
      console.log('\n🎉 ALL PRICE LOCKING TESTS PASSED!');
      console.log('🔒 Price locking and venue validation working correctly!');
      process.exit(0);
    }
  }
}

const tests = new PriceLockingTests();
tests.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
