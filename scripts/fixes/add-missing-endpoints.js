// File: backend/services/ticket-service/src/routes/ticketRoutes.ts
// Add these routes to the existing router

// Add after the confirmPurchase route:

// Release reservation (L2.1-018)
router.delete(
  '/reservations/:reservationId',
  async (req, res, next) => {
    try {
      const { reservationId } = req.params;
      const userId = req.user?.id;
      
      // Release the reservation
      const result = await ticketController.releaseReservation(reservationId, userId);
      
      res.json({
        success: true,
        message: 'Reservation released',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
);

// QR Generation (L2.1-020) 
router.get(
  '/:ticketId/qr',
  async (req, res, next) => {
    try {
      const { ticketId } = req.params;
      
      // Generate QR code
      const qrData = await ticketController.generateQR(ticketId);
      
      res.json({
        success: true,
        data: qrData
      });
    } catch (error) {
      next(error);
    }
  }
);

// QR Validation (L2.1-019)
router.post(
  '/validate-qr',
  async (req, res, next) => {
    try {
      const { qrData } = req.body;
      
      // Validate QR code
      const validation = await ticketController.validateQR(qrData);
      
      res.json({
        valid: validation.valid,
        data: validation.data
      });
    } catch (error) {
      next(error);
    }
  }
);

// Now add these methods to ticketController.ts:

async releaseReservation(reservationId: string, userId: string): Promise<any> {
  try {
    // Update reservation status
    const result = await this.ticketService.releaseReservation(reservationId, userId);
    
    // Clear cache
    await cache.delete([
      `reservation:${reservationId}`,
      `user:${userId}:reservations`
    ]);
    
    return result;
  } catch (error) {
    throw error;
  }
}

async generateQR(ticketId: string): Promise<any> {
  try {
    const qrData = await this.ticketService.generateQR(ticketId);
    return qrData;
  } catch (error) {
    throw error;
  }
}

async validateQR(qrData: string): Promise<any> {
  try {
    const validation = await this.ticketService.validateQR(qrData);
    return validation;
  } catch (error) {
    throw error;
  }
}

// And finally add these methods to ticketService.ts:

async releaseReservation(reservationId: string, userId: string): Promise<any> {
  return await DatabaseService.transaction(async (client) => {
    // Get reservation
    const resQuery = `
      SELECT * FROM reservations 
      WHERE id = $1 AND user_id = $2 AND status = 'pending'
      FOR UPDATE
    `;
    const resResult = await client.query(resQuery, [reservationId, userId]);
    
    if (resResult.rows.length === 0) {
      throw new NotFoundError('Reservation not found or already processed');
    }
    
    // Update reservation status
    await client.query(
      `UPDATE reservations SET status = 'released', updated_at = NOW() WHERE id = $1`,
      [reservationId]
    );
    
    // Release the tickets
    await client.query(
      `UPDATE tickets SET status = 'available', reservation_id = NULL WHERE reservation_id = $1`,
      [reservationId]
    );
    
    // Update ticket type availability
    const reservation = resResult.rows[0];
    await client.query(
      `UPDATE ticket_types 
       SET available_quantity = available_quantity + $1 
       WHERE id = $2`,
      [reservation.quantity, reservation.ticket_type_id]
    );
    
    return { success: true, reservation: reservation };
  });
}

async generateQR(ticketId: string): Promise<any> {
  // Get ticket data
  const ticket = await this.getTicket(ticketId);
  
  // Create QR payload
  const qrPayload = {
    ticketId: ticket.id,
    eventId: ticket.event_id,
    userId: ticket.user_id,
    timestamp: Date.now()
  };
  
  // Encrypt the payload
  const encrypted = this.encryptData(JSON.stringify(qrPayload));
  
  // Generate QR code image (base64)
  const QRCode = require('qrcode');
  const qrImage = await QRCode.toDataURL(encrypted);
  
  return {
    qrCode: encrypted,
    qrImage: qrImage,
    ticketId: ticketId
  };
}

async validateQR(qrData: string): Promise<any> {
  try {
    // Decrypt the QR data
    const decrypted = this.decryptData(qrData);
    const payload = JSON.parse(decrypted);
    
    // Validate ticket exists and is valid
    const ticket = await this.getTicket(payload.ticketId);
    
    // Check if ticket is valid for entry
    const isValid = ticket.status === 'confirmed' && !ticket.used_at;
    
    return {
      valid: isValid,
      data: {
        ticketId: payload.ticketId,
        eventId: payload.eventId,
        userId: payload.userId
      }
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Invalid QR code'
    };
  }
}

// Helper methods for encryption/decryption
private encryptData(data: string): string {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || 'defaultkeychangethisto32charlong');
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // Combine iv and encrypted data
  return iv.toString('base64') + ':' + encrypted;
}

private decryptData(data: string): string {
  const crypto = require('crypto');
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || 'defaultkeychangethisto32charlong');
  
  // Split iv and encrypted data
  const parts = data.split(':');
  const iv = Buffer.from(parts[0], 'base64');
  const encrypted = parts[1];
  
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
