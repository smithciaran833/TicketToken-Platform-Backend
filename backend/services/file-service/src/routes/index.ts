/**
 * File Service Routes
 * 
 * AUDIT FIX: All authenticated routes now include tenant context middleware
 * - setTenantContext: Extracts tenant_id from JWT and sets PostgreSQL session var
 * - All file operations are tenant-scoped via RLS and explicit queries
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { DocumentController } from '../controllers/document.controller';
import { DownloadController } from '../controllers/download.controller';
import { HealthController } from '../controllers/health.controller';
import { ImageController } from '../controllers/image.controller';
import { MetricsController } from '../controllers/metrics.controller';
import { QRController } from '../controllers/qr.controller';
import { UploadController } from '../controllers/upload.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { setTenantContext } from '../middleware/tenant-context';
import { verifyFileOwnership, verifyFileModifyPermission } from '../middleware/file-ownership.middleware';
import { uploadRateLimiter, processingRateLimiter, downloadRateLimiter } from '../middleware/rate-limit';

export async function setupRoutes(app: FastifyInstance) {
  const adminController = new AdminController();
  const documentController = new DocumentController();
  const downloadController = new DownloadController();
  const healthController = new HealthController();
  const imageController = new ImageController();
  const metricsController = new MetricsController();
  const qrController = new QRController();
  const uploadController = new UploadController();

  // Health routes (public - no authentication required)
  app.get('/health', healthController.check);

  // Metrics routes (public for Prometheus scraping)
  app.get('/metrics', metricsController.getMetrics.bind(metricsController));
  app.get('/metrics/json', {
    preHandler: [authenticate, setTenantContext, requireAdmin]
  }, metricsController.getMetricsJSON.bind(metricsController));
  app.get('/metrics/stats', {
    preHandler: [authenticate, setTenantContext, requireAdmin]
  }, metricsController.getStats.bind(metricsController));
  app.get('/metrics/health', {
    preHandler: [authenticate, setTenantContext, requireAdmin]
  }, metricsController.getDetailedHealth.bind(metricsController));

  // Admin routes (requires authentication + tenant context + admin role)
  // AUDIT FIX: Added setTenantContext to all admin routes
  app.get('/admin/stats', {
    preHandler: [authenticate, setTenantContext, requireAdmin]
  }, adminController.getStats);
  
  app.post('/admin/cleanup', {
    preHandler: [authenticate, setTenantContext, requireAdmin]
  }, adminController.cleanupOrphaned);
  
  app.delete('/admin/bulk-delete', {
    preHandler: [authenticate, setTenantContext, requireAdmin]
  }, adminController.bulkDelete);

  // Document routes (requires authentication + tenant context + ownership)
  // AUDIT FIX: Added setTenantContext to all document routes
  app.get('/documents/:fileId/preview', {
    preHandler: [authenticate, setTenantContext, verifyFileOwnership]
  }, documentController.getPreview);
  
  app.get('/documents/:fileId/page/:pageNumber', {
    preHandler: [authenticate, setTenantContext, verifyFileOwnership]
  }, documentController.getPage);
  
  app.post('/documents/:fileId/convert', {
    preHandler: [authenticate, setTenantContext, verifyFileOwnership]
  }, documentController.convertFormat);
  
  app.get('/documents/:fileId/text', {
    preHandler: [authenticate, setTenantContext, verifyFileOwnership]
  }, documentController.extractText);

  // Download routes (requires authentication + tenant context + ownership + rate limit)
  // AUDIT FIX: Added setTenantContext and downloadRateLimiter to all download routes
  app.get('/download/:fileId', {
    preHandler: [authenticate, setTenantContext, downloadRateLimiter, verifyFileOwnership]
  }, downloadController.downloadFile);
  
  app.get('/stream/:fileId', {
    preHandler: [authenticate, setTenantContext, downloadRateLimiter, verifyFileOwnership]
  }, downloadController.streamFile);

  // Image routes (requires authentication + tenant context + ownership/modify permission + rate limit)
  // AUDIT FIX: SEC-R9 - Added processingRateLimiter to all image processing routes
  app.post('/images/:fileId/resize', {
    preHandler: [authenticate, setTenantContext, processingRateLimiter, verifyFileModifyPermission]
  }, imageController.resize);
  
  app.post('/images/:fileId/crop', {
    preHandler: [authenticate, setTenantContext, processingRateLimiter, verifyFileModifyPermission]
  }, imageController.crop);
  
  app.post('/images/:fileId/rotate', {
    preHandler: [authenticate, setTenantContext, processingRateLimiter, verifyFileModifyPermission]
  }, imageController.rotate);
  
  app.post('/images/:fileId/watermark', {
    preHandler: [authenticate, setTenantContext, processingRateLimiter, verifyFileModifyPermission]
  }, imageController.watermark);
  
  app.get('/images/:fileId/metadata', {
    preHandler: [authenticate, setTenantContext, verifyFileOwnership]
  }, imageController.getMetadata);

  // QR routes (requires authentication + tenant context)
  // AUDIT FIX: Added setTenantContext to all QR routes
  app.post('/qr/generate', {
    preHandler: [authenticate, setTenantContext]
  }, qrController.generateQRCode);
  
  app.post('/qr/generate-store', {
    preHandler: [authenticate, setTenantContext]
  }, qrController.generateAndStore);

  // Upload routes (requires authentication + tenant context + rate limit)
  // AUDIT FIX: SEC-R7 - Added uploadRateLimiter to all upload routes
  app.post('/upload/url', {
    preHandler: [authenticate, setTenantContext, uploadRateLimiter]
  }, (req, reply) => uploadController.generateUploadUrl(req as FastifyRequest<{ Body: { fileName: string; contentType: string } }>, reply));
  
  app.post('/upload/confirm', {
    preHandler: [authenticate, setTenantContext, uploadRateLimiter]
  }, (req, reply) => uploadController.confirmUpload(req as FastifyRequest<{ Params: { fileKey: string } }>, reply));
  
  app.delete('/files/:fileId', {
    preHandler: [authenticate, setTenantContext, verifyFileModifyPermission]
  }, (req, reply) => uploadController.deleteFile(req as FastifyRequest<{ Params: { fileId: string } }>, reply));
}
