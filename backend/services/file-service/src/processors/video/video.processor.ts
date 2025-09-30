import { logger } from '../../utils/logger';

export class VideoProcessor {
  async processVideo(fileId: string): Promise<void> {
    logger.info(`Video processing for ${fileId} is not implemented yet`);
    // Stub implementation - venues don't need video processing for MVP
    return Promise.resolve();
  }

  async generateVideoThumbnails(fileId: string, videoPath: string, storagePath: string): Promise<void> {
    logger.info(`Video thumbnail generation for ${fileId} is not implemented yet`);
    return Promise.resolve();
  }

  async extractMetadata(videoPath: string): Promise<any> {
    return {
      format: { duration: 0 },
      streams: []
    };
  }
}

export const videoProcessor = new VideoProcessor();
