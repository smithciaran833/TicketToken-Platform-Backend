import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { ComplianceController } from '../controllers/compliance.controller';
import { generateReportSchema } from '../validators/compliance.schemas';

export async function complianceRoutes(fastify: FastifyInstance, db: Pool) {
  const controller = new ComplianceController(db);

  // Generate compliance report
  fastify.post('/compliance/reports', {
    schema: {
      body: generateReportSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            report_id: { type: 'string' },
            report_type: { type: 'string' },
            tenant_id: { type: 'string' },
            period: {
              type: 'object',
              properties: {
                start: { type: 'string' },
                end: { type: 'string' }
              }
            },
            generated_at: { type: 'string' },
            summary: { type: 'object' },
            details: { type: 'object' }
          }
        }
      }
    }
  }, controller.generateReport.bind(controller));
}
