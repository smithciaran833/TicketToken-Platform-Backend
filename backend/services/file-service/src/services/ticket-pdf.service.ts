import puppeteer from 'puppeteer';
import axios from 'axios';
import { logger } from '../utils/logger';
import QRCode from 'qrcode';

interface TicketData {
  ticketId: string;
  orderId: string;
  eventName: string;
  eventDate: string;
  venueName: string;
  venueAddress?: string;
  ticketType: string;
  seatInfo?: string;
  price: number;
  purchaserName: string;
  qrCodeData: string;
  termsAndConditions?: string;
}

interface BrandingConfig {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  ticketBackgroundImage?: string;
  ticketHeaderText?: string;
  ticketFooterText?: string;
  fontFamily?: string;
}

export class TicketPDFService {
  /**
   * Generate branded ticket PDF
   */
  async generateTicketPDF(
    ticketData: TicketData,
    venueId?: string
  ): Promise<Buffer> {
    let browser;
    
    try {
      // Fetch venue branding if provided
      let branding: BrandingConfig = {};
      let isWhiteLabel = false;

      if (venueId) {
        const brandingData = await this.fetchVenueBranding(venueId);
        if (brandingData) {
          branding = brandingData.branding;
          isWhiteLabel = brandingData.isWhiteLabel;
        }
      }

      // Generate QR code as data URL
      const qrCodeDataUrl = await QRCode.toDataURL(ticketData.qrCodeData, {
        width: 300,
        margin: 2,
        color: {
          dark: branding.primaryColor || '#000000',
          light: '#FFFFFF'
        }
      });

      // Generate HTML for ticket
      const html = this.generateTicketHTML(ticketData, branding, isWhiteLabel, qrCodeDataUrl);

      // Launch headless browser
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });

      const page = await browser.newPage();
      
      // Set content
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });

      logger.info({ ticketId: ticketData.ticketId }, 'Ticket PDF generated successfully');
      
      return Buffer.from(pdfBuffer);

    } catch (error) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Failed to generate ticket PDF');
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Fetch venue branding from venue-service
   */
  private async fetchVenueBranding(venueId: string): Promise<any> {
    try {
      const venueServiceUrl = process.env.VENUE_SERVICE_URL || 'http://venue-service:3002';
      const response = await axios.get(
        `${venueServiceUrl}/api/v1/branding/${venueId}`,
        { timeout: 2000 }
      );

      // Check if white-label
      const venueResponse = await axios.get(
        `${venueServiceUrl}/api/v1/venues/${venueId}`,
        { timeout: 2000 }
      );

      return {
        branding: response.data.branding,
        isWhiteLabel: venueResponse.data.venue?.hide_platform_branding || false
      };
    } catch (error: any) {
      logger.warn({ venueId, errorMessage: error.message }, 'Failed to fetch branding for venue');
      return null;
    }
  }

  /**
   * Generate HTML for ticket
   */
  private generateTicketHTML(
    ticket: TicketData,
    branding: BrandingConfig,
    isWhiteLabel: boolean,
    qrCodeDataUrl: string
  ): string {
    const primaryColor = branding.primaryColor || '#667eea';
    const secondaryColor = branding.secondaryColor || '#764ba2';
    const fontFamily = branding.fontFamily || 'Arial, sans-serif';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: ${fontFamily}; 
      background: #f5f5f5;
      padding: 20px;
    }
    .ticket-container {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      max-width: 800px;
      margin: 0 auto;
    }
    .ticket-header {
      background: linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%);
      color: white;
      padding: 30px;
      text-align: center;
      position: relative;
    }
    ${branding.logoUrl ? `
    .logo {
      max-width: 150px;
      margin-bottom: 15px;
    }
    ` : ''}
    ${branding.ticketBackgroundImage ? `
    .ticket-header::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url('${branding.ticketBackgroundImage}');
      background-size: cover;
      background-position: center;
      opacity: 0.2;
    }
    ` : ''}
    .ticket-header h1 {
      font-size: 28px;
      margin-bottom: 5px;
      position: relative;
      z-index: 1;
    }
    .ticket-header p {
      font-size: 16px;
      opacity: 0.9;
      position: relative;
      z-index: 1;
    }
    .ticket-body {
      padding: 40px;
    }
    .event-info {
      margin-bottom: 30px;
      padding-bottom: 30px;
      border-bottom: 2px dashed #ddd;
    }
    .event-name {
      font-size: 32px;
      font-weight: bold;
      color: ${primaryColor};
      margin-bottom: 20px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-top: 20px;
    }
    .info-item {
      padding: 15px;
      background: #f9f9f9;
      border-radius: 8px;
      border-left: 4px solid ${primaryColor};
    }
    .info-label {
      font-size: 12px;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 5px;
      font-weight: bold;
    }
    .info-value {
      font-size: 16px;
      color: #333;
      font-weight: 500;
    }
    .qr-section {
      text-align: center;
      padding: 30px;
      background: #f9f9f9;
      border-radius: 8px;
      margin: 30px 0;
    }
    .qr-code {
      max-width: 250px;
      height: auto;
      border: 4px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      border-radius: 8px;
    }
    .qr-label {
      margin-top: 15px;
      font-size: 14px;
      color: #666;
      font-weight: 500;
    }
    .ticket-footer {
      padding: 20px 40px;
      background: #f9f9f9;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #666;
    }
    .terms {
      margin-top: 15px;
      font-size: 11px;
      line-height: 1.5;
    }
    .ticket-id {
      font-family: 'Courier New', monospace;
      background: #f0f0f0;
      padding: 8px 12px;
      border-radius: 4px;
      display: inline-block;
      margin-top: 10px;
    }
    .powered-by {
      text-align: center;
      margin-top: 15px;
      font-size: 10px;
      color: #999;
    }
  </style>
</head>
<body>
  <div class="ticket-container">
    <div class="ticket-header">
      ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="Logo" class="logo">` : ''}
      <h1>🎫 ${branding.ticketHeaderText || 'TICKET'}</h1>
      <p>${ticket.eventName}</p>
    </div>
    
    <div class="ticket-body">
      <div class="event-info">
        <div class="event-name">${ticket.eventName}</div>
        
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">📅 Date & Time</div>
            <div class="info-value">${ticket.eventDate}</div>
          </div>
          
          <div class="info-item">
            <div class="info-label">📍 Venue</div>
            <div class="info-value">${ticket.venueName}</div>
          </div>
          
          <div class="info-item">
            <div class="info-label">🎟️ Ticket Type</div>
            <div class="info-value">${ticket.ticketType}</div>
          </div>
          
          ${ticket.seatInfo ? `
          <div class="info-item">
            <div class="info-label">💺 Seat</div>
            <div class="info-value">${ticket.seatInfo}</div>
          </div>
          ` : ''}
          
          <div class="info-item">
            <div class="info-label">👤 Ticket Holder</div>
            <div class="info-value">${ticket.purchaserName}</div>
          </div>
          
          <div class="info-item">
            <div class="info-label">💰 Price</div>
            <div class="info-value">$${ticket.price.toFixed(2)}</div>
          </div>
        </div>
        
        ${ticket.venueAddress ? `
        <div class="info-item" style="margin-top: 15px; grid-column: 1 / -1;">
          <div class="info-label">🗺️ Address</div>
          <div class="info-value">${ticket.venueAddress}</div>
        </div>
        ` : ''}
      </div>
      
      <div class="qr-section">
        <img src="${qrCodeDataUrl}" alt="Ticket QR Code" class="qr-code">
        <div class="qr-label">Scan this code at the venue entrance</div>
        <div class="ticket-id">Ticket ID: ${ticket.ticketId}</div>
      </div>
    </div>
    
    <div class="ticket-footer">
      ${branding.ticketFooterText ? `
        <p>${branding.ticketFooterText}</p>
      ` : `
        <p><strong>Important:</strong> This ticket is valid for one admission. Do not share this QR code. ${!isWhiteLabel ? 'This ticket is secured on the blockchain as an NFT.' : ''}</p>
      `}
      
      ${ticket.termsAndConditions ? `
        <div class="terms">
          <strong>Terms & Conditions:</strong><br>
          ${ticket.termsAndConditions}
        </div>
      ` : ''}
      
      ${!isWhiteLabel ? `
        <div class="powered-by">
          Powered by TicketToken - Blockchain Ticketing Platform
        </div>
      ` : ''}
    </div>
  </div>
</body>
</html>
    `;
  }
}

export const ticketPDFService = new TicketPDFService();
