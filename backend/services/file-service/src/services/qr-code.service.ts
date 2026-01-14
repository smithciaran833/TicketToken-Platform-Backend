import * as QRCode from 'qrcode';
import { logger } from '../utils/logger';

export class QRCodeService {
  async generateQRCode(data: string, options?: QRCode.QRCodeToBufferOptions): Promise<Buffer> {
    try {
      const buffer: Buffer = await QRCode.toBuffer(data, {
        type: 'png',
        width: 400,
        margin: 1,
        ...options
      });
      
      logger.info(`Generated QR code for data length: ${data.length}`);
      return buffer;
    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'QR code generation failed');
      throw new Error('Failed to generate QR code');
    }
  }

  async generateTicketQR(ticketId: string, eventId: string): Promise<Buffer> {
    const ticketData = JSON.stringify({
      ticketId,
      eventId,
      platform: 'TicketToken',
      timestamp: Date.now()
    });

    return this.generateQRCode(ticketData);
  }
}

export const qrCodeService = new QRCodeService();
