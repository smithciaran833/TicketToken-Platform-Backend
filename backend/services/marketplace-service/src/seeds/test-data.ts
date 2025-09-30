import 'dotenv/config';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Seeding test data...');

  // Create test users if they don't exist
  const userId1 = '123e4567-e89b-12d3-a456-426614174000';
  const userId2 = '123e4567-e89b-12d3-a456-426614174001';
  
  // Check if users exist
  const user1Exists = await db('users').where({ id: userId1 }).first();
  if (!user1Exists) {
    await db('users').insert({
      id: userId1,
      email: 'seller@test.com',
      password_hash: await bcrypt.hash('password123', 10),
      first_name: 'Test',
      last_name: 'Seller',
      is_active: true,
      email_verified: true,
      role: 'user',
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  const user2Exists = await db('users').where({ id: userId2 }).first();
  if (!user2Exists) {
    await db('users').insert({
      id: userId2,
      email: 'buyer@test.com',
      password_hash: await bcrypt.hash('password123', 10),
      first_name: 'Test',
      last_name: 'Buyer',
      is_active: true,
      email_verified: true,
      role: 'user',
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  // Create test venue if it doesn't exist
  const venueId = '123e4567-e89b-12d3-a456-426614174002';
  const venueExists = await db('venues').where({ id: venueId }).first();
  if (!venueExists) {
    await db('venues').insert({
      id: venueId,
      name: 'Madison Square Garden',
      tenant_id: uuidv4(),
      location: 'New York, NY',
      capacity: 20000,
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  // Create venue marketplace settings
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
  }

  // Create test event if it doesn't exist
  const eventId = '123e4567-e89b-12d3-a456-426614174003';
  const eventExists = await db('events').where({ id: eventId }).first();
  if (!eventExists) {
    await db('events').insert({
      id: eventId,
      venue_id: venueId,
      name: 'Taylor Swift - Eras Tour',
      description: 'The Eras Tour at Madison Square Garden',
      start_date: new Date('2025-12-15T20:00:00Z'),
      end_date: new Date('2025-12-15T23:00:00Z'),
      created_by: userId1,
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  // Create test tickets
  const ticketIds = [
    '123e4567-e89b-12d3-a456-426614174010',
    '123e4567-e89b-12d3-a456-426614174011',
    '123e4567-e89b-12d3-a456-426614174012'
  ];

  // We need a ticket type first
  const ticketTypeId = '123e4567-e89b-12d3-a456-426614174020';
  const ticketTypeExists = await db('ticket_types').where({ id: ticketTypeId }).first();
  if (!ticketTypeExists) {
    await db('ticket_types').insert({
      id: ticketTypeId,
      event_id: eventId,
      name: 'General Admission',
      price: 150.00,
      quantity: 1000,
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  for (let i = 0; i < ticketIds.length; i++) {
    const ticketExists = await db('tickets').where({ id: ticketIds[i] }).first();
    if (!ticketExists) {
      await db('tickets').insert({
        id: ticketIds[i],
        event_id: eventId,
        ticket_type_id: ticketTypeId,
        user_id: userId1,
        barcode: `TICKET${Date.now()}${i}`,
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }

  // Create some test listings
  const listing1Exists = await db('marketplace_listings').where({ ticket_id: ticketIds[0] }).first();
  if (!listing1Exists) {
    await db('marketplace_listings').insert({
      id: uuidv4(),
      ticket_id: ticketIds[0],
      seller_id: userId1,
      event_id: eventId,
      venue_id: venueId,
      price: 200.00,
      original_face_value: 150.00,
      price_multiplier: 1.33,
      status: 'active',
      wallet_address: 'DRpbCBMxVnDK7maPdrPyKfuBWFb3m3EzsTest1',
      view_count: 0,
      favorite_count: 0,
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  const listing2Exists = await db('marketplace_listings').where({ ticket_id: ticketIds[1] }).first();
  if (!listing2Exists) {
    await db('marketplace_listings').insert({
      id: uuidv4(),
      ticket_id: ticketIds[1],
      seller_id: userId1,
      event_id: eventId,
      venue_id: venueId,
      price: 180.00,
      original_face_value: 150.00,
      price_multiplier: 1.2,
      status: 'active',
      wallet_address: 'DRpbCBMxVnDK7maPdrPyKfuBWFb3m3EzsTest1',
      view_count: 5,
      favorite_count: 2,
      created_at: new Date(),
      updated_at: new Date()
    });
  }

  console.log('Test data seeded successfully!');
  console.log('Test users:');
  console.log('- seller@test.com (password: password123)');
  console.log('- buyer@test.com (password: password123)');
  console.log(`- Event ID: ${eventId}`);
  console.log(`- Venue ID: ${venueId}`);
  console.log('- 2 active listings created');
}

seed()
  .then(() => {
    console.log('Seeding complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
