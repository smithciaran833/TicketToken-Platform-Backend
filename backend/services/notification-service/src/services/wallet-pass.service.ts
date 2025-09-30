import { logger } from '../config/logger';
import crypto from 'crypto';
import QRCode from 'qrcode';

interface WalletPassData {
  eventName: string;
  venueName: string;
  venueAddress: string;
  eventDate: Date;
  ticketId: string;
  seatInfo?: string;
  customerName: string;
  qrCodeData: string;
}

export class WalletPassService {
  async generateApplePass(data: WalletPassData): Promise<Buffer> {
    try {
      // Apple Wallet pass structure
      const pass = {
        formatVersion: 1,
        passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || 'pass.com.tickettoken',
        serialNumber: data.ticketId,
        teamIdentifier: process.env.APPLE_TEAM_ID || 'ABCDE12345',
        organizationName: 'TicketToken',
        description: `Ticket for ${data.eventName}`,
        foregroundColor: 'rgb(255, 255, 255)',
        backgroundColor: 'rgb(60, 65, 76)',
        labelColor: 'rgb(255, 255, 255)',
        
        eventTicket: {
          primaryFields: [
            {
              key: 'event',
              label: 'EVENT',
              value: data.eventName,
            },
          ],
          secondaryFields: [
            {
              key: 'loc',
              label: 'VENUE',
              value: data.venueName,
            },
            {
              key: 'date',
              label: 'DATE',
              value: this.formatDate(data.eventDate),
              dateStyle: 'PKDateStyleMedium',
              timeStyle: 'PKDateStyleShort',
            },
          ],
          auxiliaryFields: data.seatInfo ? [
            {
              key: 'seat',
              label: 'SEAT',
              value: data.seatInfo,
            },
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ] : [
            {
              key: 'name',
              label: 'ATTENDEE',
              value: data.customerName,
            },
          ],
          backFields: [
            {
              key: 'terms',
              label: 'TERMS & CONDITIONS',
              value: 'This ticket is non-transferable. Valid ID required.',
            },
            {
              key: 'venue-address',
              label: 'VENUE ADDRESS',
              value: data.venueAddress,
            },
          ],
        },
        
        barcode: {
          format: 'PKBarcodeFormatQR',
          message: data.qrCodeData,
          messageEncoding: 'iso-8859-1',
        },
        
        relevantDate: data.eventDate.toISOString(),
      };

      // In production, this would:
      // 1. Create pass.json
      // 2. Generate manifest.json with file hashes
      // 3. Sign the manifest
      // 4. Create .pkpass file (zip archive)
      
      // For now, return mock buffer
      return Buffer.from(JSON.stringify(pass));
    } catch (error) {
      logger.error('Failed to generate Apple Pass', error);
      throw error;
    }
  }

  async generateGooglePass(data: WalletPassData): Promise<string> {
    try {
      // Google Wallet pass structure
      const jwt = {
        iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        aud: 'google',
        typ: 'savetowallet',
        iat: Math.floor(Date.now() / 1000),
        payload: {
          eventTicketObjects: [
            {
              id: `${process.env.GOOGLE_ISSUER_ID}.${data.ticketId}`,
              classId: `${process.env.GOOGLE_ISSUER_ID}.event_ticket_class`,
              state: 'ACTIVE',
              ticketHolderName: data.customerName,
              ticketNumber: data.ticketId,
              barcode: {
                type: 'QR_CODE',
                value: data.qrCodeData,
              },
              eventName: {
                defaultValue: {
                  language: 'en-US',
                  value: data.eventName,
                },
              },
              venue: {
                name: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.venueName,
                  },
                },
                address: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.venueAddress,
                  },
                },
              },
              dateTime: {
                start: data.eventDate.toISOString(),
              },
              seatInfo: data.seatInfo ? {
                seat: {
                  defaultValue: {
                    language: 'en-US',
                    value: data.seatInfo,
                  },
                },
              } : undefined,
            },
          ],
        },
      };

      // In production, sign JWT with Google service account
      // For now, return the save URL
      const token = Buffer.from(JSON.stringify(jwt)).toString('base64url');
      return `https://pay.google.com/gp/v/save/${token}`;
    } catch (error) {
      logger.error('Failed to generate Google Pass', error);
      throw error;
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async generatePassQRCode(ticketId: string): Promise<string> {
    const data = {
      ticketId,
      validationUrl: `${process.env.API_URL}/validate/${ticketId}`,
      timestamp: Date.now(),
    };

    const signature = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'secret')
      .update(JSON.stringify(data))
      .digest('hex');

    const qrData = {
      ...data,
      signature,
    };

    return await QRCode.toDataURL(JSON.stringify(qrData));
  }
}

export const walletPassService = new WalletPassService();
