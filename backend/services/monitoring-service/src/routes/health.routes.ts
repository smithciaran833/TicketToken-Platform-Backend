import { FastifyInstance } from 'fastify';
import { healthController } from '../controllers/health.controller';

export default async function healthRoutes(server: FastifyInstance) {
  // Overall health
  server.get('/', healthController.getHealth);
  
  // Service-specific health
  server.get('/:service', healthController.getServiceHealth);
  
  // All services health
  server.get('/services/all', healthController.getAllServicesHealth);
  
  // Dependencies health
  server.get('/dependencies', healthController.getDependenciesHealth);
}
