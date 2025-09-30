import { FastifyInstance } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { DocumentController } from '../controllers/document.controller';
import { DownloadController } from '../controllers/download.controller';
import { HealthController } from '../controllers/health.controller';
import { ImageController } from '../controllers/image.controller';
import { QRController } from '../controllers/qr.controller';
import { UploadController } from '../controllers/upload.controller';
import { VideoController } from '../controllers/video.controller';

export async function setupRoutes(app: FastifyInstance) {
  const adminController = new AdminController();
  const documentController = new DocumentController();
  const downloadController = new DownloadController();
  const healthController = new HealthController();
  const imageController = new ImageController();
  const qrController = new QRController();
  const uploadController = new UploadController();
  const videoController = new VideoController();

  // Health routes
  app.get('/health', healthController.check);

  // Admin routes
  app.get('/admin/stats', adminController.getStats);
  app.post('/admin/cleanup', adminController.cleanupOrphaned);
  app.delete('/admin/bulk-delete', adminController.bulkDelete);

  // Document routes
  app.get('/documents/:fileId/preview', documentController.getPreview);
  app.get('/documents/:fileId/page/:pageNumber', documentController.getPage);
  app.post('/documents/:fileId/convert', documentController.convertFormat);
  app.get('/documents/:fileId/text', documentController.extractText);

  // Download routes
  app.get('/download/:fileId', downloadController.downloadFile);
  app.get('/stream/:fileId', downloadController.streamFile);

  // Image routes
  app.post('/images/:fileId/resize', imageController.resize);
  app.post('/images/:fileId/crop', imageController.crop);
  app.post('/images/:fileId/rotate', imageController.rotate);
  app.post('/images/:fileId/watermark', imageController.watermark);
  app.get('/images/:fileId/metadata', imageController.getMetadata);

  // QR routes
  app.post('/qr/generate', qrController.generateQRCode);
  app.post('/qr/generate-store', qrController.generateAndStore);

  // Upload routes - these need to be fixed to use Fastify
  app.post('/upload/url', uploadController.generateUploadUrl.bind(uploadController));
  app.post('/upload/confirm', uploadController.confirmUpload.bind(uploadController));
  app.delete('/files/:fileId', uploadController.deleteFile.bind(uploadController));

  // Video routes
  app.get('/videos/:fileId/preview', videoController.getPreview);
  app.post('/videos/:fileId/transcode', videoController.transcode);
  app.get('/videos/:fileId/metadata', videoController.getMetadata);
}
