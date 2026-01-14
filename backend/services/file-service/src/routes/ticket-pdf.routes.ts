import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { ticketPDFService } from '../services/ticket-pdf.service';

export default async function ticketPdfRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  /**
   * POST /api/v1/tickets/pdf/generate
   * Generate branded ticket PDF
   */
  fastify.post('/generate', async (req, reply) => {
    try {
      const { ticketData, venueId } = req.body as any;

      const pdfBuffer = await ticketPDFService.generateTicketPDF(ticketData, venueId);

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `attachment; filename="ticket-${ticketData.ticketId}.pdf"`);
      return reply.send(pdfBuffer);
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });
}
