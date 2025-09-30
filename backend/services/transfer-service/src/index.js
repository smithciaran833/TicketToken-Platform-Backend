
// Security imports
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express()
// Apply security middleware
app.use(helmet());
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests'
}));
;
app.use(express.json());

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'TicketToken2024Secure!',
  port: process.env.DB_PORT || 5432
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'transfer-service' });
});

// Free transfer (gift) endpoint
app.post('/api/v1/transfers/gift', async (req, res) => {
  const { ticketId, fromUserId, toEmail, message } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Lock the ticket
    const ticketResult = await client.query(
      'SELECT * FROM tickets WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [ticketId, fromUserId]
    );
    
    if (ticketResult.rows.length === 0) {
      throw new Error('Ticket not found or not owned by user');
    }
    
    const ticket = ticketResult.rows[0];
    
    // Check if ticket is transferable
    const ticketTypeResult = await client.query(
      'SELECT is_transferable, transfer_blocked_before_hours FROM ticket_types WHERE id = $1',
      [ticket.ticket_type_id]
    );
    
    const ticketType = ticketTypeResult.rows[0];
    if (!ticketType.is_transferable) {
      throw new Error('This ticket type is not transferable');
    }
    
    // Find or create recipient user
    let toUserResult = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [toEmail]
    );
    
    let toUserId;
    if (toUserResult.rows.length === 0) {
      // Create placeholder user
      const newUserResult = await client.query(
        'INSERT INTO users (id, email, status) VALUES ($1, $2, $3) RETURNING id',
        [uuidv4(), toEmail, 'pending']
      );
      toUserId = newUserResult.rows[0].id;
    } else {
      toUserId = toUserResult.rows[0].id;
    }
    
    // Create transfer record
    const transferId = uuidv4();
    const acceptanceCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await client.query(`
      INSERT INTO ticket_transfers (
        id, ticket_id, from_user_id, to_user_id, to_email,
        transfer_method, status, acceptance_code, message, is_gift,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      transferId, ticketId, fromUserId, toUserId, toEmail,
      'GIFT', 'PENDING', acceptanceCode, message, true,
      new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hour expiry
    ]);
    
    await client.query('COMMIT');
    
    res.json({
      transferId,
      acceptanceCode,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transfer error:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Accept transfer endpoint
app.post('/api/v1/transfers/:transferId/accept', async (req, res) => {
  const { transferId } = req.params;
  const { acceptanceCode, userId } = req.body;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get and lock transfer
    const transferResult = await client.query(
      `SELECT * FROM ticket_transfers 
       WHERE id = $1 AND acceptance_code = $2 AND status = 'PENDING' 
       FOR UPDATE`,
      [transferId, acceptanceCode]
    );
    
    if (transferResult.rows.length === 0) {
      throw new Error('Invalid transfer or acceptance code');
    }
    
    const transfer = transferResult.rows[0];
    
    // Check expiry
    if (new Date(transfer.expires_at) < new Date()) {
      await client.query(
        "UPDATE ticket_transfers SET status = 'EXPIRED' WHERE id = $1",
        [transferId]
      );
      throw new Error('Transfer has expired');
    }
    
    // Update ticket ownership
    await client.query(
      'UPDATE tickets SET user_id = $1, updated_at = NOW() WHERE id = $2',
      [transfer.to_user_id, transfer.ticket_id]
    );
    
    // Update transfer status
    await client.query(
      `UPDATE ticket_transfers 
       SET status = 'COMPLETED', accepted_at = NOW() 
       WHERE id = $1`,
      [transferId]
    );
    
    // Create transaction record
    await client.query(`
      INSERT INTO ticket_transactions (
        id, ticket_id, user_id, transaction_type, 
        amount, status, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      uuidv4(), transfer.ticket_id, transfer.to_user_id,
      'TRANSFER_RECEIVED', 0, 'COMPLETED',
      JSON.stringify({ transferId, fromUserId: transfer.from_user_id })
    ]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      ticketId: transfer.ticket_id,
      newOwnerId: transfer.to_user_id
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Accept transfer error:', error);
    res.status(400).json({ error: error.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 3019;
app.listen(PORT, () => {
  console.log(`Transfer service running on port ${PORT}`);
});
