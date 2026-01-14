import QRCode from 'qrcode';
import { logger } from '../utils/logger';

export interface QROptions {
  width?: number;
  margin?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  color?: {
    dark?: string;
    light?: string;
  };
}

export class QRService {
  /**
   * Generate a QR code as a PNG buffer
   */
  async generateQR(data: string, options?: QROptions): Promise<Buffer> {
    try {
      const qrOptions = {
        width: options?.width || 300,
        margin: options?.margin || 2,
        errorCorrectionLevel: options?.errorCorrectionLevel || 'M',
        color: {
          dark: options?.color?.dark || '#000000',
          light: options?.color?.light || '#FFFFFF'
        }
      };

      const buffer = await QRCode.toBuffer(data, qrOptions);
      logger.debug({ dataLength: data.length }, 'QR code generated');
      return buffer;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'QR generation failed');
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate a QR code as a data URL (base64)
   */
  async generateQRDataURL(data: string, options?: QROptions): Promise<string> {
    try {
      const qrOptions = {
        width: options?.width || 300,
        margin: options?.margin || 2,
        errorCorrectionLevel: options?.errorCorrectionLevel || 'M',
        color: {
          dark: options?.color?.dark || '#000000',
          light: options?.color?.light || '#FFFFFF'
        }
      };

      return await QRCode.toDataURL(data, qrOptions);
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'QR data URL generation failed');
      throw new Error('Failed to generate QR code');
    }
  }
}

export const qrService = new QRService();
