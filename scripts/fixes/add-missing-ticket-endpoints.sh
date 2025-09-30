#!/bin/bash

echo "Adding missing endpoints to ticket service..."

# 1. First, add the new routes to ticketRoutes.ts
cat > temp-routes.ts << 'ROUTES'
import { Router } from 'express';
import { ticketController } from '../controllers/ticketController';
import { validate, ticketSchemas } from '../utils/validation';
import { requireRole } from '../middleware/auth';
const router = Router();
// Ticket type management (admin/venue manager only)
router.post(
  '/types',
  requireRole(['admin', 'venue_manager']),
  validate(ticketSchemas.createTicketType),
  ticketController.createTicketType.bind(ticketController)
);
router.get(
  '/events/:eventId/types',
  ticketController.getTicketTypes.bind(ticketController)
);
// Ticket purchasing
router.post(
  '/purchase',
  validate(ticketSchemas.purchaseTickets),
  ticketController.createReservation.bind(ticketController)
);
router.post(
  '/reservations/:reservationId/confirm',
  ticketController.confirmPurchase.bind(ticketController)
);

// NEW: Release reservation (L2.1-018)
router.delete(
  '/reservations/:reservationId',
  ticketController.releaseReservation.bind(ticketController)
);

// NEW: Generate QR (L2.1-020)
router.get(
  '/:ticketId/qr',
  ticketController.generateQR.bind(ticketController)
);

// NEW: Validate QR (L2.1-019)
router.post(
  '/validate-qr',
  ticketController.validateQR.bind(ticketController)
);

// Ticket viewing
router.get(
  '/users/:userId',
  ticketController.getUserTickets.bind(ticketController)
);
export default router;
ROUTES

mv temp-routes.ts backend/services/ticket-service/src/routes/ticketRoutes.ts

echo "✅ Routes updated"

# 2. Add methods to controller - we'll append to the class before the closing brace
sed -i '/^export const ticketController/i\
  async releaseReservation(\
    req: AuthenticatedRequest,\
    res: Response,\
    next: NextFunction\
  ): Promise<void> {\
    try {\
      const { reservationId } = req.params;\
      const userId = req.user?.id;\
      \
      if (!userId) {\
        res.status(401).json({ error: "User not authenticated" });\
        return;\
      }\
      \
      const result = await this.ticketService.releaseReservation(reservationId, userId);\
      \
      await cache.delete([\
        `reservation:${reservationId}`,\
        `user:${userId}:reservations`\
      ]);\
      \
      res.json({\
        success: true,\
        message: "Reservation released",\
        data: result\
      });\
    } catch (error) {\
      next(error);\
    }\
  }\
\
  async generateQR(\
    req: AuthenticatedRequest,\
    res: Response,\
    next: NextFunction\
  ): Promise<void> {\
    try {\
      const { ticketId } = req.params;\
      const result = await this.ticketService.generateQR(ticketId);\
      \
      res.json({\
        success: true,\
        data: result\
      });\
    } catch (error) {\
      next(error);\
    }\
  }\
\
  async validateQR(\
    req: AuthenticatedRequest,\
    res: Response,\
    next: NextFunction\
  ): Promise<void> {\
    try {\
      const { qrData } = req.body;\
      const validation = await this.ticketService.validateQR(qrData);\
      \
      res.json({\
        valid: validation.valid,\
        data: validation.data\
      });\
    } catch (error) {\
      next(error);\
    }\
  }\
}' backend/services/ticket-service/src/controllers/ticketController.ts

echo "✅ Controller methods added"

# 3. Add methods to service - append before the closing brace
sed -i '/^export const ticketService/i\
  async releaseReservation(reservationId: string, userId: string): Promise<any> {\
    return await DatabaseService.transaction(async (client) => {\
      const resQuery = `\
        SELECT * FROM reservations \
        WHERE id = $1 AND user_id = $2 AND status = '"'"'ACTIVE'"'"'\
        FOR UPDATE\
      `;\
      const resResult = await client.query(resQuery, [reservationId, userId]);\
      \
      if (resResult.rows.length === 0) {\
        throw new NotFoundError("Reservation not found or already processed");\
      }\
      \
      const reservation = resResult.rows[0];\
      \
      await client.query(\
        `UPDATE reservations SET status = '"'"'released'"'"', updated_at = NOW() WHERE id = $1`,\
        [reservationId]\
      );\
      \
      const tickets = reservation.tickets || [];\
      for (const ticket of tickets) {\
        await client.query(\
          "UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2",\
          [ticket.quantity, ticket.ticketTypeId]\
        );\
      }\
      \
      await RedisService.del(`reservation:${reservationId}`);\
      \
      return { success: true, reservation: reservation };\
    });\
  }\
\
  async generateQR(ticketId: string): Promise<any> {\
    const ticket = await this.getTicket(ticketId);\
    \
    const qrPayload = {\
      ticketId: ticket.id,\
      eventId: ticket.event_id,\
      userId: ticket.owner_id,\
      timestamp: Date.now()\
    };\
    \
    const encrypted = this.encryptData(JSON.stringify(qrPayload));\
    \
    const QRCode = require("qrcode");\
    const qrImage = await QRCode.toDataURL(encrypted);\
    \
    return {\
      qrCode: encrypted,\
      qrImage: qrImage,\
      ticketId: ticketId\
    };\
  }\
\
  async validateQR(qrData: string): Promise<any> {\
    try {\
      const decrypted = this.decryptData(qrData);\
      const payload = JSON.parse(decrypted);\
      \
      const ticket = await this.getTicket(payload.ticketId);\
      \
      const isValid = ticket.status === '"'"'SOLD'"'"' && !ticket.used_at;\
      \
      return {\
        valid: isValid,\
        data: {\
          ticketId: payload.ticketId,\
          eventId: payload.eventId,\
          userId: payload.userId\
        }\
      };\
    } catch (error) {\
      return {\
        valid: false,\
        error: "Invalid QR code"\
      };\
    }\
  }\
\
  private encryptData(data: string): string {\
    const crypto = require("crypto");\
    const algorithm = "aes-256-cbc";\
    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || "defaultkeychangethisto32charlong");\
    const iv = crypto.randomBytes(16);\
    \
    const cipher = crypto.createCipheriv(algorithm, key, iv);\
    let encrypted = cipher.update(data, "utf8", "base64");\
    encrypted += cipher.final("base64");\
    \
    return iv.toString("base64") + ":" + encrypted;\
  }\
\
  private decryptData(data: string): string {\
    const crypto = require("crypto");\
    const algorithm = "aes-256-cbc";\
    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || "defaultkeychangethisto32charlong");\
    \
    const parts = data.split(":");\
    const iv = Buffer.from(parts[0], "base64");\
    const encrypted = parts[1];\
    \
    const decipher = crypto.createDecipheriv(algorithm, key, iv);\
    let decrypted = decipher.update(encrypted, "base64", "utf8");\
    decrypted += decipher.final("utf8");\
    \
    return decrypted;\
  }\
}' backend/services/ticket-service/src/services/ticketService.ts

echo "✅ Service methods added"

# Rebuild the container
echo "Rebuilding ticket service container..."
docker-compose up -d --build ticket

echo "✅ Ticket service updated and restarted"
echo ""
echo "Waiting for service to be ready..."
sleep 5

echo "Testing endpoints..."
curl -X GET http://localhost:3004/health

echo ""
echo "✅ Done! The following endpoints should now work:"
echo "  - DELETE /api/v1/tickets/reservations/:id (Release reservation)"
echo "  - GET /api/v1/tickets/:ticketId/qr (Generate QR)"
echo "  - POST /api/v1/tickets/validate-qr (Validate QR)"
