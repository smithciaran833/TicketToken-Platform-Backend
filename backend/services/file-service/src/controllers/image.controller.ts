import { FastifyRequest, FastifyReply } from 'fastify';
import sharp from 'sharp';
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { logger } from '../utils/logger';
import { getTenantId } from '../middleware/tenant-context';

export class ImageController {
  async resize(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { width, height, fit } = request.body as any;
      const tenantId = getTenantId(request);
      
      const file = await fileModel.findById(id, tenantId);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      if (!file.storagePath) {
        return reply.status(400).send({ error: 'File has no storage path' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      const resized = await sharp(buffer)
        .resize(width, height, {
          fit: fit || 'cover',
          position: 'center'
        })
        .toBuffer();
      
      const newPath = file.storagePath.replace(/\.[^.]+$/, `_${width}x${height}.jpg`);
      const result = await storageService.upload(resized, newPath);
      
      reply.send({
        success: true,
        url: result.publicUrl,
        width,
        height
      });
      
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Resize failed');
      reply.status(500).send({ error: error.message });
    }
  }
  
  async crop(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { x, y, width, height } = request.body as any;
      const tenantId = getTenantId(request);
      
      const file = await fileModel.findById(id, tenantId);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      if (!file.storagePath) {
        return reply.status(400).send({ error: 'File has no storage path' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      const cropped = await sharp(buffer)
        .extract({ left: x, top: y, width, height })
        .toBuffer();
      
      const newPath = file.storagePath.replace(/\.[^.]+$/, `_crop_${width}x${height}.jpg`);
      const result = await storageService.upload(cropped, newPath);
      
      reply.send({
        success: true,
        url: result.publicUrl
      });
      
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Crop failed');
      reply.status(500).send({ error: error.message });
    }
  }
  
  async rotate(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { angle } = request.body as { angle: number };
      const tenantId = getTenantId(request);
      
      const file = await fileModel.findById(id, tenantId);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      if (!file.storagePath) {
        return reply.status(400).send({ error: 'File has no storage path' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      
      const rotated = await sharp(buffer)
        .rotate(angle)
        .toBuffer();
      
      const newPath = file.storagePath.replace(/\.[^.]+$/, `_rot${angle}.jpg`);
      const result = await storageService.upload(rotated, newPath);
      
      reply.send({
        success: true,
        url: result.publicUrl,
        angle
      });
      
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Rotate failed');
      reply.status(500).send({ error: error.message });
    }
  }
  
  async watermark(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const { text, position: _position } = request.body as any;
      const tenantId = getTenantId(request);
      
      const file = await fileModel.findById(id, tenantId);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      if (!file.storagePath) {
        return reply.status(400).send({ error: 'File has no storage path' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      const metadata = await sharp(buffer).metadata();
      
      // Create watermark SVG
      const watermarkSVG = Buffer.from(`
        <svg width="${metadata.width}" height="${metadata.height}">
          <text x="50%" y="50%" 
                font-family="Arial" 
                font-size="48" 
                fill="white" 
                fill-opacity="0.5"
                text-anchor="middle"
                transform="rotate(-45 ${(metadata.width ?? 0)/2} ${(metadata.height ?? 0)/2})">
            ${text || 'WATERMARK'}
          </text>
        </svg>
      `);
      
      const watermarked = await sharp(buffer)
        .composite([{
          input: watermarkSVG,
          blend: 'over'
        }])
        .toBuffer();
      
      const newPath = file.storagePath.replace(/\.[^.]+$/, '_watermark.jpg');
      const result = await storageService.upload(watermarked, newPath);
      
      reply.send({
        success: true,
        url: result.publicUrl
      });
      
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Watermark failed');
      reply.status(500).send({ error: error.message });
    }
  }
  
  async getMetadata(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const tenantId = getTenantId(request);
      
      const file = await fileModel.findById(id, tenantId);
      if (!file) {
        return reply.status(404).send({ error: 'File not found' });
      }
      
      if (!file.storagePath) {
        return reply.status(400).send({ error: 'File has no storage path' });
      }
      
      const buffer = await storageService.download(file.storagePath);
      const metadata = await sharp(buffer).metadata();
      
      // Get image metadata from database
      const pool = await import('../config/database.config').then(m => m.getPool());
      const dbMetadata = await pool?.query(
        'SELECT * FROM image_metadata WHERE file_id = $1',
        [id]
      );
      
      reply.send({
        file: metadata,
        stored: dbMetadata?.rows[0] || null
      });
      
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Get metadata failed');
      reply.status(500).send({ error: error.message });
    }
  }
}

export const imageController = new ImageController();
