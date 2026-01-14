import sharp from 'sharp';
import { logger } from '../utils/logger';
import { metricsService } from './metrics.service';
import { cacheService, CacheTTL } from './cache.service';
import { fileModel } from '../models/file.model';
import { storageService } from '../storage/storage.service';
import { watermarkProcessor } from '../processors/image/watermark.processor';

interface BatchJob {
  id: string;
  type: 'resize' | 'convert' | 'compress' | 'watermark' | 'delete';
  fileIds: string[];
  options: any;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdBy: string;
  tenantId: string;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * Batch Processor Service
 * Handles bulk file operations efficiently
 */
export class BatchProcessorService {
  private activeJobs: Map<string, BatchJob> = new Map();
  private jobQueue: BatchJob[] = [];
  private processing: boolean = false;

  constructor() {
    logger.info('Batch processor service initialized');
  }

  /**
   * Create a new batch job
   */
  async createBatchJob(
    type: BatchJob['type'],
    fileIds: string[],
    options: any,
    createdBy: string,
    tenantId: string
  ): Promise<string> {
    const jobId = this.generateJobId();

    const job: BatchJob = {
      id: jobId,
      type,
      fileIds,
      options,
      status: 'pending',
      progress: 0,
      createdBy,
      tenantId,
      createdAt: new Date()
    };

    // Store job in cache
    await cacheService.set(
      `batch-job:${jobId}`,
      job,
      { ttl: CacheTTL.VERY_LONG, prefix: 'jobs' }
    );

    // Add to queue
    this.jobQueue.push(job);
    this.activeJobs.set(jobId, job);

    logger.info(`Created batch job ${jobId} for ${fileIds.length} files`);

    // Start processing if not already running
    if (!this.processing) {
      this.startProcessing();
    }

    return jobId;
  }

  /**
   * Get batch job status
   */
  async getBatchJobStatus(jobId: string): Promise<BatchJob | null> {
    // Check memory first
    if (this.activeJobs.has(jobId)) {
      return this.activeJobs.get(jobId)!;
    }

    // Check cache
    const cached = await cacheService.get<BatchJob>(
      `batch-job:${jobId}`,
      { prefix: 'jobs' }
    );

    return cached;
  }

  /**
   * Process batch jobs from queue
   */
  private async startProcessing() {
    if (this.processing) return;

    this.processing = true;
    logger.info('Starting batch job processing');

    while (this.jobQueue.length > 0) {
      const job = this.jobQueue.shift();
      if (!job) continue;

      try {
        await this.processJob(job);
      } catch (error) {
        logger.error({ err: error instanceof Error ? error : new Error(String(error)), jobId: job.id }, 'Batch job failed');
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        await this.updateJobStatus(job);
      }
    }

    this.processing = false;
    logger.info('Batch job processing completed');
  }

  /**
   * Process a single batch job
   */
  private async processJob(job: BatchJob) {
    logger.info(`Processing batch job ${job.id}: ${job.type}`);

    job.status = 'processing';
    await this.updateJobStatus(job);

    const totalFiles = job.fileIds.length;
    let processed = 0;

    // Process files in chunks
    const chunkSize = 10;
    for (let i = 0; i < totalFiles; i += chunkSize) {
      const chunk = job.fileIds.slice(i, i + chunkSize);

      await Promise.all(
        chunk.map(async (fileId) => {
          try {
            await this.processFile(fileId, job.type, job.options, job.tenantId);
            processed++;

            // Update progress
            job.progress = Math.round((processed / totalFiles) * 100);
            await this.updateJobStatus(job);

          } catch (error) {
            logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId, jobId: job.id }, 'Failed to process file in batch');
          }
        })
      );
    }

    // Mark as completed
    job.status = 'completed';
    job.progress = 100;
    job.completedAt = new Date();
    await this.updateJobStatus(job);

    // Record metrics
    const duration = (job.completedAt.getTime() - job.createdAt.getTime()) / 1000;
    metricsService.recordProcessing(`batch_${job.type}`, 'success', duration);

    logger.info(`Batch job ${job.id} completed: ${processed}/${totalFiles} files`);
  }

  /**
   * Process individual file based on job type
   */
  private async processFile(fileId: string, type: BatchJob['type'], options: any, tenantId: string) {
    switch (type) {
      case 'resize':
        await this.resizeFile(fileId, tenantId, options);
        break;
      case 'convert':
        await this.convertFile(fileId, tenantId, options);
        break;
      case 'compress':
        await this.compressFile(fileId, tenantId, options);
        break;
      case 'watermark':
        await this.watermarkFile(fileId, tenantId, options);
        break;
      case 'delete':
        await this.deleteFile(fileId, tenantId);
        break;
      default:
        throw new Error(`Unknown batch job type: ${type}`);
    }
  }

  /**
   * Batch resize images
   */
  private async resizeFile(
    fileId: string,
    tenantId: string,
    options: { width?: number; height?: number; quality?: number }
  ) {
    const file = await fileModel.findById(fileId, tenantId);
    if (!file || !file.storagePath) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await storageService.download(file.storagePath);
    
    const resized = await sharp(buffer)
      .resize(options.width, options.height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: options.quality || 85 })
      .toBuffer();

    // Save resized version
    const resizedPath = file.storagePath.replace(/\.[^.]+$/, '_resized.jpg');
    await storageService.upload(resized, resizedPath);

    logger.debug({ fileId, width: options.width, height: options.height }, 'File resized');
  }

  /**
   * Batch convert files
   */
  private async convertFile(
    fileId: string,
    tenantId: string,
    options: { format: string }
  ) {
    const file = await fileModel.findById(fileId, tenantId);
    if (!file || !file.storagePath) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await storageService.download(file.storagePath);
    
    let converted: Buffer;
    const format = options.format.toLowerCase();
    
    switch (format) {
      case 'jpeg':
      case 'jpg':
        converted = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
        break;
      case 'png':
        converted = await sharp(buffer).png().toBuffer();
        break;
      case 'webp':
        converted = await sharp(buffer).webp({ quality: 85 }).toBuffer();
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    const convertedPath = file.storagePath.replace(/\.[^.]+$/, `.${format}`);
    await storageService.upload(converted, convertedPath);

    logger.debug({ fileId, format }, 'File converted');
  }

  /**
   * Batch compress files
   */
  private async compressFile(
    fileId: string,
    tenantId: string,
    options: { quality?: number }
  ) {
    const file = await fileModel.findById(fileId, tenantId);
    if (!file || !file.storagePath) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await storageService.download(file.storagePath);
    const quality = options.quality || 70;

    const compressed = await sharp(buffer)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    // Only save if actually smaller
    if (compressed.length < buffer.length) {
      const compressedPath = file.storagePath.replace(/\.[^.]+$/, '_compressed.jpg');
      await storageService.upload(compressed, compressedPath);
      
      const reduction = Math.round((1 - compressed.length / buffer.length) * 100);
      logger.debug({ fileId, reduction: `${reduction}%` }, 'File compressed');
    } else {
      logger.debug({ fileId }, 'File not compressed - already optimal');
    }
  }

  /**
   * Batch watermark images
   */
  private async watermarkFile(
    fileId: string,
    tenantId: string,
    options: { text?: string; opacity?: number; position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }
  ) {
    const file = await fileModel.findById(fileId, tenantId);
    if (!file || !file.storagePath) {
      throw new Error(`File not found: ${fileId}`);
    }

    const buffer = await storageService.download(file.storagePath);
    
    const watermarked = await watermarkProcessor.addTextWatermark(buffer, {
      text: options.text || 'WATERMARK',
      opacity: options.opacity || 0.3,
      position: options.position || 'center'
    });

    const watermarkedPath = file.storagePath.replace(/\.[^.]+$/, '_watermarked.jpg');
    await storageService.upload(watermarked, watermarkedPath);

    logger.debug({ fileId, text: options.text }, 'Watermark added');
  }

  /**
   * Batch delete files
   */
  private async deleteFile(fileId: string, tenantId: string) {
    await fileModel.softDelete(fileId, tenantId);
    logger.debug({ fileId }, 'File deleted');
  }

  /**
   * Update job status in cache
   */
  private async updateJobStatus(job: BatchJob) {
    this.activeJobs.set(job.id, job);
    await cacheService.set(
      `batch-job:${job.id}`,
      job,
      { ttl: CacheTTL.VERY_LONG, prefix: 'jobs' }
    );
  }

  /**
   * Cancel a batch job
   */
  async cancelBatchJob(jobId: string): Promise<boolean> {
    const job = this.activeJobs.get(jobId);
    if (!job) return false;

    if (job.status === 'completed') {
      logger.warn({ jobId }, 'Cannot cancel completed job');
      return false;
    }

    // Remove from queue if pending
    const queueIndex = this.jobQueue.findIndex(j => j.id === jobId);
    if (queueIndex !== -1) {
      this.jobQueue.splice(queueIndex, 1);
    }

    job.status = 'failed';
    job.error = 'Cancelled by user';
    await this.updateJobStatus(job);

    this.activeJobs.delete(jobId);

    logger.info(`Cancelled batch job ${jobId}`);
    return true;
  }

  /**
   * Get all active jobs
   */
  getActiveJobs(): BatchJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.jobQueue.length;
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up old completed jobs
   */
  async cleanupOldJobs(olderThanDays: number = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let cleaned = 0;
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.status === 'completed' && job.completedAt && job.completedAt < cutoffDate) {
        this.activeJobs.delete(jobId);
        await cacheService.delete(`batch-job:${jobId}`, { prefix: 'jobs' });
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old batch jobs`);
    }
  }

  /**
   * Get batch job statistics
   */
  getStats() {
    const jobs = Array.from(this.activeJobs.values());

    return {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      queueSize: this.jobQueue.length
    };
  }
}

// Export singleton instance
export const batchProcessorService = new BatchProcessorService();
