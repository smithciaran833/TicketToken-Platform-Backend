import 'dotenv/config';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

async function seed() {
  console.log('Seeding marketplace test data...');

  try {
    // First, let's check what users exist
    const users = await db('users').select('id', 'email').limit(2);
    if (users.length < 1) {
      console.error('No users found in database. Please create users first.');
      return;
    }
    const sellerId = users[0].id;
    console.log(`Using seller: ${users[0].email} (${sellerId})`);

    // Check for venues
    const venues = await db('venues').select('id', 'name').limit(1);
    if (venues.length < 1) {
      console.error('No venues found. Please create venues first.');
      return;
    }
    const venueId = venues[0].id;
    console.log(`Using venue: ${venues[0].name} (${venueId})`);

    // Create venue marketplace settings if not exists
    const settingsExist = await db('venue_marketplace_settings').where({ venue_id: venueId }).first();
    if (!settingsExist) {
      await db('venue_marketplace_settings').insert({
        venue_id: venueId,
        max_resale_multiplier: 3.0,
        min_price_multiplier: 0.8,
        allow_below_face: true,
        transfer_cutoff_hours: 2,
        listing_advance_hours: 720,
        royalty_percentage: 5.0,
        royalty_wallet_address: 'DRpbCBMxVnDK7maPdrPyKfuBWFb3m3EzsVenue1',
        created_at: new Date(),
        updated_at: new Date()
      });
      console.log('Created venue marketplace settings');
    }

    // Check for events
    const events = await db('events').select('id', 'name').where({ venue_id: venueId }).limit(1);
    let eventId;
    if (events.length < 1) {
      // Create a test event
      const result = await db('events').insert({
        id: uuidv4(),
        venue_id: venueId,
        name: 'Test Concert - Marketplace Demo',
        description: 'A test event for marketplace functionality',
        start_date: new Date('2025-12-15T20:00:00Z'),
        end_date: new Date('2025-12-15T23:00:00Z'),
        status: 'active',
        event_status: 'published',
        capacity: 1000,
        created_by: sellerId,
        created_at: new Date(),
        updated_at: new Date()
      }).returning('id');
      eventId = result[0].id;
      console.log('Created test event');
    } else {
      eventId = events[0].id;
      console.log(`Using event: ${events[0].name} (${eventId})`);
    }

    // Check for tickets
    const tickets = await db('tickets')
      .select('id', 'qr_code', 'seat_number')
      .where({ event_id: eventId, user_id: sellerId })
      .limit(3);
    
    if (tickets.length < 1) {
      console.log('No tickets found for this event. Creating test tickets...');
      
      // Create a ticket type first
      const ticketTypeId = uuidv4();
      await db('ticket_types').insert({
        id: ticketTypeId,
        event_id: eventId,
        name: 'General Admission',
        price: 150.00,
        quantity: 100,
        created_at: new Date(),
        updated_at: new Date()
      });

      // Create test tickets
      for (let i = 0; i < 3; i++) {
        const ticketId = uuidv4();
        const qrCode = `QR${Date.now()}${i}`;
        await db('tickets').insert({
          id: ticketId,
          event_id: eventId,
          ticket_type_id: ticketTypeId,
          user_id: sellerId,
          qr_code: qrCode,
          seat_number: `A${i + 1}`,
          price: 150.00,
          status: 'valid',
          created_at: new Date()
        });
        tickets.push({ id: ticketId, qr_code: qrCode, seat_number: `A${i + 1}` });
      }
      console.log('Created 3 test tickets');
    }

    // Create marketplace listings for first two tickets
    let listingsCreated = 0;
    for (let i = 0; i < Math.min(2, tickets.length); i++) {
      const ticket = tickets[i];
      
      // Check if listing already exists
      const existingListing = await db('marketplace_listings')
        .where({ ticket_id: ticket.id })
        .first();
      
      if (!existingListing) {
        const listingId = uuidv4();
        const prices = [200.00, 180.00, 220.00];
        const price = prices[i] || 200.00;
        
        await db('marketplace_listings').insert({
          id: listingId,
          ticket_id: ticket.id,
          seller_id: sellerId,
          event_id: eventId,
          venue_id: venueId,
          price: price,
          original_face_value: 150.00,
          price_multiplier: price / 150.00,
          status: 'active',
          wallet_address: 'DRpbCBMxVnDK7maPdrPyKfuBWFb3m3EzsTest1',
          view_count: Math.floor(Math.random() * 20),
          favorite_count: Math.floor(Math.random() * 5),
          created_at: new Date(),
          updated_at: new Date()
        });
        listingsCreated++;
        console.log(`Created listing ${listingId} for ticket ${ticket.seat_number || ticket.qr_code} at $${price}`);
      }
    }

    console.log('\n✅ Marketplace test data seeded successfully!');
    console.log(`Created ${listingsCreated} new listings`);
    console.log(`\nEvent ID: ${eventId}`);
    console.log(`Venue ID: ${venueId}`);
    
    // Show current listings
    const activeListings = await db('marketplace_listings')
      .where({ event_id: eventId, status: 'active' })
      .count('* as count');
    console.log(`\nTotal active listings for this event: ${activeListings[0].count}`);

  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}

seed()
  .then(() => {
    console.log('\nDone! You can now start the service and test the endpoints.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
