import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { container } from '../bootstrap/container';
import { cache } from '../services/cache-integration';

export class TicketController {
  private ticketService = container.services.ticketService;

  async createTicketType(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const ticketType = await this.ticketService.createTicketType(req.body);
      
      // Invalidate related caches
      await cache.delete([
        `ticket-types:${req.body.eventId}`,
        `event:${req.body.eventId}:availability`
      ]);
      
      res.status(201).json({
        success: true,
        data: ticketType
      });
    } catch (error) {
      next(error);
    }
  }

  async getTicketTypes(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { eventId } = req.params;
      const cacheKey = `ticket-types:${eventId}`;
      
      // Try cache first
      let ticketTypes = await cache.get(cacheKey);
      
      if (ticketTypes) {
        res.setHeader('X-Cache', 'HIT');
        res.json({
          success: true,
          data: ticketTypes
        });
        return;
      }
      
      // Cache miss - get from service
      ticketTypes = await this.ticketService.getTicketTypes(eventId);
      
      // Cache for 5 minutes
      await cache.set(cacheKey, ticketTypes, { ttl: 300 });
      
      res.setHeader('X-Cache', 'MISS');
      res.json({
        success: true,
        data: ticketTypes
      });
    } catch (error) {
      next(error);
    }
  }

  async createReservation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }
      
      const result = await this.ticketService.createReservation({
        ...req.body,
        userId: req.user.id
      });
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async confirmPurchase(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }
      
      const { reservationId } = req.params;
      const result = await this.ticketService.confirmPurchase(reservationId, req.user.id);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserTickets(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId } = req.params;
      const tickets = await this.ticketService.getUserTickets(userId);
      
      res.json({
        success: true,
        data: tickets
      });
    } catch (error) {
      next(error);
    }
  }

  // NEW METHOD: Release Reservation (L2.1-018)
  async releaseReservation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { reservationId } = req.params;
      const userId = req.user?.id;
      
      if (!userId) {
        res.status(401).json({ error: "User not authenticated" });
        return;
      }
      
      const result = await this.ticketService.releaseReservation(reservationId, userId);
      
      await cache.delete([
        `reservation:${reservationId}`,
        `user:${userId}:reservations`
      ]);
      
      res.json({
        success: true,
        message: "Reservation released",
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // NEW METHOD: Generate QR (L2.1-020)
  async generateQR(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { ticketId } = req.params;
      const result = await this.ticketService.generateQR(ticketId);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  // NEW METHOD: Validate QR (L2.1-019)
  async validateQR(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { qrData } = req.body;
      const validation = await this.ticketService.validateQR(qrData);
      
      res.json({
        valid: validation.valid,
        data: validation.data
      });
    } catch (error) {
      next(error);
    }
  }
}

export const ticketController = new TicketController();
