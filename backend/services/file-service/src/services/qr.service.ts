export class QRService {
  async generateQR(data: string) {
    // Stub implementation
    return Buffer.from('QR_CODE_DATA');
  }
}

export const qrService = new QRService();
