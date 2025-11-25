import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Form1099DAService } from '../services/compliance';

export class ComplianceController {
  private form1099DAService: Form1099DAService;

  constructor() {
    this.form1099DAService = new Form1099DAService();
  }

  async getTaxForm(request: FastifyRequest, reply: FastifyReply) {
    const { year } = request.params as any;
    const user = (request as any).user;

    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const userId = user.id;

    const form = await this.form1099DAService.generateForm1099DA(
      userId,
      parseInt(year)
    );

    if (!form.required) {
      return reply.send({
        required: false,
        message: 'Form 1099-DA not required for this tax year'
      });
    }

    return reply.send({
      required: true,
      form: form.formData,
      downloadUrl: `/api/compliance/tax-forms/1099-da/${userId}/${year}/download`
    });
  }

  async downloadTaxForm(request: FastifyRequest, reply: FastifyReply) {
    const { year } = request.params as any;
    const user = (request as any).user;

    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const userId = user.id;

    // Generate PDF (in production, use PDF library)
    const formData = await this.form1099DAService.generateForm1099DA(
      userId,
      parseInt(year)
    );

    if (!formData.required) {
      return reply.status(404).send({
        error: 'No tax form available'
      });
    }

    // Set headers for PDF download
    reply.header('Content-Type', 'application/pdf');
    reply.header(
      'Content-Disposition',
      `attachment; filename="1099-DA_${year}_${userId}.pdf"`
    );

    // In production, generate actual PDF
    return reply.send('PDF content would be here');
  }

  async getTaxSummary(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user;

    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const userId = user.id;
    const currentYear = new Date().getFullYear();

    const summary = {
      years: [] as any[]
    };

    // Check last 3 years
    for (let year = currentYear - 2; year <= currentYear; year++) {
      const status = await this.form1099DAService.getFormStatus(userId, year);
      summary.years.push({
        year,
        ...status
      });
    }

    return reply.send(summary);
  }
}
