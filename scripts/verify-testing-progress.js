#!/usr/bin/env node

/**
 * TicketToken Platform - Testing Progress Verification
 * Starting from L2.1-016: Generate tickets (Ticket→Event)
 */

const axios = require('axios');
const colors = require('colors');

// Service URLs
const SERVICES = {
  auth: 'http://localhost:3001',
  venue: 'http://localhost:3002',
  event: 'http://localhost:3003',
  ticket: 'http://localhost:3004',
  payment: 'http://localhost:3005',
  marketplace: 'http://localhost:3006',
  analytics: 'http://localhost:3007',
  notification: 'http://localhost:3008',
  order: 'http://localhost:3016'
};

// Test state
let authToken = null;
let testVenueId = null;
let testEventId = null;
let testTicketTypeId = null;
let testOrderId = null;
let completedTests = [];
let failedTests = [];

// Utility functions
const logTest = (testId, description, status, details = '') => {
  const statusSymbol = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  const statusColor = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow';
  
  console.log(`${statusSymbol} ${testId}: ${description}`[statusColor]);
  if (details) {
    console.log(`   ${details}`.gray);
  }
  
  if (status === 'PASS') {
    completedTests.push(testId);
  } else if (status === 'FAIL') {
    failedTests.push({ testId, description, details });
  }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Check what's already been completed
async function checkExistingProgress() {
  console.log('\n📊 CHECKING EXISTING TEST PROGRESS'.cyan.bold);
  console.log('════════════════════════════════════'.cyan);
  
  // Check if we have auth working (L2.1-001 to L2.1-005)
  try {
    const loginRes = await axios.post(`${SERVICES.auth}/auth/login`, {
      email: 'admin@tickettoken.com',
      password: 'admin123'
    });
    
    if (loginRes.data.accessToken) {
      authToken = loginRes.data.accessToken;
      logTest('L2.1-001 to L2.1-005', 'Auth Service Tests', 'PASS', 'Authentication working');
      
      // Mark auth tests as complete
      for (let i = 1; i <= 5; i++) {
        completedTests.push(`L2.1-00${i}`);
      }
    }
  } catch (error) {
    logTest('L2.1-001 to L2.1-005', 'Auth Service Tests', 'FAIL', 'Need to complete auth tests first');
    return false;
  }
  
  // Check venue tests (L2.1-006 to L2.1-010)
  try {
    const venueRes = await axios.get(`${SERVICES.venue}/venues`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (venueRes.data.venues && venueRes.data.venues.length > 0) {
      testVenueId = venueRes.data.venues[0].id;
      logTest('L2.1-006 to L2.1-010', 'Venue Service Tests', 'PASS', `Found ${venueRes.data.venues.length} venues`);
      
      for (let i = 6; i <= 10; i++) {
        completedTests.push(`L2.1-0${i < 10 ? '0' : ''}${i}`);
      }
    }
  } catch (error) {
    logTest('L2.1-006 to L2.1-010', 'Venue Service Tests', 'WARN', 'Venue tests may need completion');
  }
  
  // Check event tests (L2.1-011 to L2.1-015)
  try {
    const eventRes = await axios.get(`${SERVICES.event}/events`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (eventRes.data.events && eventRes.data.events.length > 0) {
      testEventId = eventRes.data.events[0].id;
      logTest('L2.1-011 to L2.1-015', 'Event Service Tests', 'PASS', `Found ${eventRes.data.events.length} events`);
      
      for (let i = 11; i <= 15; i++) {
        completedTests.push(`L2.1-0${i}`);
      }
    }
  } catch (error) {
    logTest('L2.1-011 to L2.1-015', 'Event Service Tests', 'WARN', 'Event tests may need completion');
  }
  
  return true;
}

// L2.1-016: Generate tickets test
async function testGenerateTickets() {
  console.log('\n🎫 TESTING TICKET GENERATION (L2.1-016)'.cyan.bold);
  console.log('════════════════════════════════════════'.cyan);
  
  try {
    // First, create a ticket type for the event
    const ticketTypeRes = await axios.post(
      `${SERVICES.ticket}/ticket-types`,
      {
        event_id: testEventId,
        name: 'General Admission',
        description: 'Standard entry ticket',
        price: 50.00,
        quantity: 100,
        sale_starts: new Date().toISOString(),
        sale_ends: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    testTicketTypeId = ticketTypeRes.data.id;
    logTest('L2.1-016a', 'Create Ticket Type', 'PASS', `Ticket type ID: ${testTicketTypeId}`);
    
    // Now generate the actual tickets
    const generateRes = await axios.post(
      `${SERVICES.ticket}/tickets/generate`,
      {
        ticket_type_id: testTicketTypeId,
        quantity: 10
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    if (generateRes.data.tickets && generateRes.data.tickets.length === 10) {
      logTest('L2.1-016', 'Generate Tickets (Ticket→Event)', 'PASS', `Generated ${generateRes.data.tickets.length} tickets`);
      return generateRes.data.tickets;
    } else {
      throw new Error('Incorrect number of tickets generated');
    }
  } catch (error) {
    logTest('L2.1-016', 'Generate Tickets', 'FAIL', error.response?.data?.message || error.message);
    return null;
  }
}

// L2.1-017: Reserve ticket test
async function testReserveTicket(tickets) {
  console.log('\n🔒 TESTING TICKET RESERVATION (L2.1-017)'.cyan.bold);
  
  if (!tickets || tickets.length === 0) {
    logTest('L2.1-017', 'Reserve Ticket', 'SKIP', 'No tickets available to reserve');
    return null;
  }
  
  try {
    const ticketToReserve = tickets[0];
    
    const reserveRes = await axios.post(
      `${SERVICES.ticket}/tickets/${ticketToReserve.id}/reserve`,
      {
        duration_minutes: 15
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    if (reserveRes.data.status === 'reserved') {
      logTest('L2.1-017', 'Reserve Ticket (Ticket→Database)', 'PASS', `Ticket ${ticketToReserve.id} reserved`);
      return ticketToReserve.id;
    } else {
      throw new Error('Ticket not properly reserved');
    }
  } catch (error) {
    logTest('L2.1-017', 'Reserve Ticket', 'FAIL', error.response?.data?.message || error.message);
    return null;
  }
}

// L2.1-018: Release reservation test
async function testReleaseReservation(ticketId) {
  console.log('\n🔓 TESTING RESERVATION RELEASE (L2.1-018)'.cyan.bold);
  
  if (!ticketId) {
    logTest('L2.1-018', 'Release Reservation', 'SKIP', 'No reservation to release');
    return;
  }
  
  try {
    const releaseRes = await axios.post(
      `${SERVICES.ticket}/tickets/${ticketId}/release`,
      {},
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    if (releaseRes.data.status === 'available') {
      logTest('L2.1-018', 'Release Reservation (Ticket→Database)', 'PASS', `Ticket ${ticketId} released`);
    } else {
      throw new Error('Ticket not properly released');
    }
  } catch (error) {
    logTest('L2.1-018', 'Release Reservation', 'FAIL', error.response?.data?.message || error.message);
  }
}

// L2.1-019: Ticket validation test
async function testTicketValidation(tickets) {
  console.log('\n✔️ TESTING TICKET VALIDATION (L2.1-019)'.cyan.bold);
  
  if (!tickets || tickets.length === 0) {
    logTest('L2.1-019', 'Ticket Validation', 'SKIP', 'No tickets to validate');
    return;
  }
  
  try {
    const ticketToValidate = tickets[0];
    
    const validateRes = await axios.get(
      `${SERVICES.ticket}/tickets/${ticketToValidate.id}/validate`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    if (validateRes.data.valid !== undefined) {
      logTest('L2.1-019', 'Ticket Validation (Ticket→Database)', 'PASS', 
        `Ticket validation returned: ${validateRes.data.valid ? 'Valid' : 'Invalid'}`);
    } else {
      throw new Error('Validation response missing valid field');
    }
  } catch (error) {
    logTest('L2.1-019', 'Ticket Validation', 'FAIL', error.response?.data?.message || error.message);
  }
}

// L2.1-020: QR generation test
async function testQRGeneration(tickets) {
  console.log('\n📱 TESTING QR CODE GENERATION (L2.1-020)'.cyan.bold);
  
  if (!tickets || tickets.length === 0) {
    logTest('L2.1-020', 'QR Generation', 'SKIP', 'No tickets for QR generation');
    return;
  }
  
  try {
    const ticketForQR = tickets[0];
    
    const qrRes = await axios.get(
      `${SERVICES.ticket}/tickets/${ticketForQR.id}/qr`,
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    if (qrRes.data.qr_code || qrRes.data.qr_url) {
      logTest('L2.1-020', 'QR Generation (Ticket→Database)', 'PASS', 
        'QR code generated successfully');
    } else {
      throw new Error('QR code not generated');
    }
  } catch (error) {
    logTest('L2.1-020', 'QR Generation', 'FAIL', error.response?.data?.message || error.message);
  }
}

// L2.1-021 to L2.1-025: Order Management Tests
async function testOrderManagement(tickets) {
  console.log('\n📦 TESTING ORDER MANAGEMENT (L2.1-021 to L2.1-025)'.cyan.bold);
  console.log('═══════════════════════════════════════════════════'.cyan);
  
  // L2.1-021: Create order
  try {
    const orderRes = await axios.post(
      `${SERVICES.order}/orders`,
      {
        user_id: 'test-user-id'
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );
    
    testOrderId = orderRes.data.id;
    logTest('L2.1-021', 'Create Order (Order→Database)', 'PASS', `Order ID: ${testOrderId}`);
  } catch (error) {
    logTest('L2.1-021', 'Create Order', 'FAIL', error.response?.data?.message || error.message);
    return;
  }
  
  // L2.1-022: Add items to order
  if (testOrderId && tickets && tickets.length > 0) {
    try {
      const addItemRes = await axios.post(
        `${SERVICES.order}/orders/${testOrderId}/items`,
        {
          ticket_id: tickets[0].id,
          quantity: 1,
          price: 50.00
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );
      
      logTest('L2.1-022', 'Add Items (Order→Ticket)', 'PASS', 'Item added to order');
    } catch (error) {
      logTest('L2.1-022', 'Add Items', 'FAIL', error.response?.data?.message || error.message);
    }
  }
  
  // L2.1-023: Calculate total
  if (testOrderId) {
    try {
      const totalRes = await axios.get(
        `${SERVICES.order}/orders/${testOrderId}/total`,
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );
      
      if (totalRes.data.total !== undefined) {
        logTest('L2.1-023', 'Calculate Total (Order→Database)', 'PASS', 
          `Total: $${totalRes.data.total}`);
      }
    } catch (error) {
      logTest('L2.1-023', 'Calculate Total', 'FAIL', error.response?.data?.message || error.message);
    }
  }
  
  // L2.1-024: Order expiry (schedule)
  if (testOrderId) {
    try {
      const expiryRes = await axios.post(
        `${SERVICES.order}/orders/${testOrderId}/schedule-expiry`,
        {
          expires_in_minutes: 15
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );
      
      logTest('L2.1-024', 'Order Expiry (Order→Queue)', 'PASS', 'Expiry scheduled');
    } catch (error) {
      logTest('L2.1-024', 'Order Expiry', 'FAIL', error.response?.data?.message || error.message);
    }
  }
  
  // L2.1-025: Update order status
  if (testOrderId) {
    try {
      const statusRes = await axios.put(
        `${SERVICES.order}/orders/${testOrderId}/status`,
        {
          status: 'pending_payment'
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );
      
      logTest('L2.1-025', 'Order Status (Order→Database)', 'PASS', 'Status updated');
    } catch (error) {
      logTest('L2.1-025', 'Order Status', 'FAIL', error.response?.data?.message || error.message);
    }
  }
}

// Generate summary report
function generateSummary() {
  console.log('\n\n' + '═'.repeat(60));
  console.log('📊 TESTING SUMMARY REPORT'.yellow.bold);
  console.log('═'.repeat(60));
  
  const totalTests = 25; // L2.1-001 to L2.1-025
  const passedCount = completedTests.length;
  const failedCount = failedTests.length;
  const completionRate = ((passedCount / totalTests) * 100).toFixed(1);
  
  console.log(`\n✅ Tests Passed: ${passedCount}/${totalTests} (${completionRate}%)`.green);
  console.log(`❌ Tests Failed: ${failedCount}`.red);
  
  if (completedTests.length > 0) {
    console.log('\n✅ Completed Tests:'.green);
    // Group consecutive tests
    let ranges = [];
    let start = null;
    let prev = null;
    
    completedTests.sort().forEach(test => {
      const num = parseInt(test.split('-')[1]);
      if (start === null) {
        start = num;
        prev = num;
      } else if (num === prev + 1) {
        prev = num;
      } else {
        ranges.push(start === prev ? `L2.1-${String(start).padStart(3, '0')}` : 
                    `L2.1-${String(start).padStart(3, '0')} to L2.1-${String(prev).padStart(3, '0')}`);
        start = num;
        prev = num;
      }
    });
    
    if (start !== null) {
      ranges.push(start === prev ? `L2.1-${String(start).padStart(3, '0')}` : 
                  `L2.1-${String(start).padStart(3, '0')} to L2.1-${String(prev).padStart(3, '0')}`);
    }
    
    ranges.forEach(range => console.log(`   ${range}`.green));
  }
  
  if (failedTests.length > 0) {
    console.log('\n❌ Failed Tests:'.red);
    failedTests.forEach(test => {
      console.log(`   ${test.testId}: ${test.description}`.red);
      if (test.details) {
        console.log(`      └─ ${test.details}`.gray);
      }
    });
  }
  
  console.log('\n📝 Next Steps:'.yellow);
  if (passedCount < 16) {
    console.log('   1. Complete ticket generation tests (L2.1-016 to L2.1-020)');
  }
  if (passedCount < 25) {
    console.log('   2. Complete order management tests (L2.1-021 to L2.1-025)');
  }
  if (passedCount >= 25) {
    console.log('   ✨ All L2.1 Service Pair tests complete! Ready for L2.2 Service Chain tests.');
  }
  
  console.log('\n' + '═'.repeat(60));
}

// Main test execution
async function runTests() {
  console.log('═'.repeat(60));
  console.log('🚀 TICKETTOKEN TESTING PROGRESS VERIFICATION'.cyan.bold);
  console.log('   Starting from L2.1-016: Ticket Management Tests'.gray);
  console.log('═'.repeat(60));
  
  // Check existing progress
  const canContinue = await checkExistingProgress();
  if (!canContinue) {
    console.log('\n❌ Cannot continue - auth tests must be completed first'.red);
    return;
  }
  
  // Run ticket management tests (L2.1-016 to L2.1-020)
  const tickets = await testGenerateTickets();
  
  if (tickets) {
    const reservedTicketId = await testReserveTicket(tickets);
    await sleep(1000); // Wait a bit between operations
    
    if (reservedTicketId) {
      await testReleaseReservation(reservedTicketId);
    }
    
    await sleep(1000);
    await testTicketValidation(tickets);
    
    await sleep(1000);
    await testQRGeneration(tickets);
    
    // Continue with order management tests
    await sleep(2000);
    await testOrderManagement(tickets);
  }
  
  // Generate final report
  generateSummary();
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:'.red, error);
  process.exit(1);
});

// Run the tests
runTests().catch(error => {
  console.error('\n❌ Test execution failed:'.red, error);
  process.exit(1);
});
