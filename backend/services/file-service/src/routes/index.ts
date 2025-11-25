import { FastifyInstance } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { DocumentController } from '../controllers/document.controller';
import { DownloadController } from '../controllers/download.controller';
import { HealthController } from '../controllers/health.controller';
import { ImageController } from '../controllers/image.controller';
import { MetricsController } from '../controllers/metrics.controller';
import { QRController } from '../controllers/qr.controller';
import { UploadController } from '../controllers/upload.controller';
import { VideoController } from '../controllers/video.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import { verifyFileOwnership, verifyFileModifyPermission } from '../middleware/file-ownership.middleware';

export async function setupRoutes(app: FastifyInstance) {
  const adminController = new AdminController();
  const documentController = new DocumentController();
  const downloadController = new DownloadController();
  const healthController = new HealthController();
  const imageController = new ImageController();
  const metricsController = new MetricsController();
  const qrController = new QRController();
  const uploadController = new UploadController();
  const videoController = new VideoController();

  // Health routes (public - no authentication required)
  app.get('/health', healthController.check);

  // Metrics routes (public for Prometheus scraping)
  app.get('/metrics', metricsController.getMetrics.bind(metricsController));
  app.get('/metrics/json', {
    preHandler: [authenticate, requireAdmin]
  }, metricsController.getMetricsJSON.bind(metricsController));
  app.get('/metrics/stats', {
    preHandler: [authenticate, requireAdmin]
  }, metricsController.getStats.bind(metricsController));
  app.get('/metrics/health', {
    preHandler: [authenticate, requireAdmin]
  }, metricsController.getDetailedHealth.bind(metricsController));

  // Admin routes (requires authentication + admin role)
  app.get('/admin/stats', {
    preHandler: [authenticate, requireAdmin]
  }, adminController.getStats);
  
  app.post('/admin/cleanup', {
    preHandler: [authenticate, requireAdmin]
  }, adminController.cleanupOrphaned);
  
  app.delete('/admin/bulk-delete', {
    preHandler: [authenticate, requireAdmin]
  }, adminController.bulkDelete);

  // Document routes (requires authentication + ownership)
  app.get('/documents/:fileId/preview', {
    preHandler: [authenticate, verifyFileOwnership]
  }, documentController.getPreview);
  
  app.get('/documents/:fileId/page/:pageNumber', {
    preHandler: [authenticate, verifyFileOwnership]
  }, documentController.getPage);
  
  app.post('/documents/:fileId/convert', {
    preHandler: [authenticate, verifyFileOwnership]
  }, documentController.convertFormat);
  
  app.get('/documents/:fileId/text', {
    preHandler: [authenticate, verifyFileOwnership]
  }, documentController.extractText);

  // Download routes (requires authentication + ownership)
  app.get('/download/:fileId', {
    preHandler: [authenticate, verifyFileOwnership]
  }, downloadController.downloadFile);
  
  app.get('/stream/:fileId', {
    preHandler: [authenticate, verifyFileOwnership]
  }, downloadController.streamFile);

  // Image routes (requires authentication + ownership/modify permission)
  app.post('/images/:fileId/resize', {
    preHandler: [authenticate, verifyFileModifyPermission]
  }, imageController.resize);
  
  app.post('/images/:fileId/crop', {
    preHandler: [authenticate, verifyFileModifyPermission]
  }, imageController.crop);
  
  app.post('/images/:fileId/rotate', {
    preHandler: [authenticate, verifyFileModifyPermission]
  }, imageController.rotate);
  
  app.post('/images/:fileId/watermark', {
    preHandler: [authenticate, verifyFileModifyPermission]
  }, imageController.watermark);
  
  app.get('/images/:fileId/metadata', {
    preHandler: [authenticate, verifyFileOwnership]
  }, imageController.getMetadata);

  // QR routes (requires authentication)
  app.post('/qr/generate', {
    preHandler: authenticate
  }, qrController.generateQRCode);
  
  app.post('/qr/generate-store', {
    preHandler: authenticate
  }, qrController.generateAndStore);

  // Upload routes (requires authentication)
  app.post('/upload/url', {
    preHandler: authenticate
  }, uploadController.generateUploadUrl.bind(uploadController));
  
  app.post('/upload/confirm', {
    preHandler: authenticate
  }, uploadController.confirmUpload.bind(uploadController));
  
  app.delete('/files/:fileId', {
    preHandler: [authenticate, verifyFileModifyPermission]
  }, uploadController.deleteFile.bind(uploadController));

  // Video routes (requires authentication + ownership)
  app.get('/videos/:fileId/preview', {
    preHandler: [authenticate, verifyFileOwnership]
  }, videoController.getPreview);
  
  app.post('/videos/:fileId/transcode', {
    preHandler: [authenticate, verifyFileModifyPermission]
  }, videoController.transcode);
  
  app.get('/videos/:fileId/metadata', {
    preHandler: [authenticate, verifyFileOwnership]
  }, videoController.getMetadata);
}
