import { Router } from 'express';
import { ticketPDFService } from '../services/ticket-pdf.service';

const router = Router();

/**
 * POST /api/v1/tickets/pdf/generate
 * Generate branded ticket PDF
 */
router.post('/generate', async (req, res) => {
  try {
    const { ticketData, venueId } = req.body;

    const pdfBuffer = await ticketPDFService.generateTicketPDF(ticketData, venueId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${ticketData.ticketId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
