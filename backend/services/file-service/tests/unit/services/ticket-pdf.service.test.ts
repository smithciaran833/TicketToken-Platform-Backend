// Mock dependencies BEFORE imports
jest.mock('puppeteer');
jest.mock('axios');
jest.mock('qrcode');
jest.mock('../../../src/utils/logger');

import { TicketPDFService, ticketPDFService } from '../../../src/services/ticket-pdf.service';
import puppeteer from 'puppeteer';
import axios from 'axios';
import QRCode from 'qrcode';

describe('services/ticket-pdf.service', () => {
  let service: TicketPDFService;
  let mockBrowser: any;
  let mockPage: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Puppeteer page
    mockPage = {
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-content'))
    };

    // Setup mock Puppeteer browser
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined)
    };

    (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);
    (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,mockQRCode');
    
    service = new TicketPDFService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateTicketPDF', () => {
    const mockTicketData = {
      ticketId: 'ticket-123',
      orderId: 'order-456',
      eventName: 'Concert Night',
      eventDate: '2024-12-31 20:00',
      venueName: 'Madison Square Garden',
      venueAddress: '4 Pennsylvania Plaza, New York, NY 10001',
      ticketType: 'VIP',
      seatInfo: 'Section A, Row 5, Seat 10',
      price: 150.00,
      purchaserName: 'John Doe',
      qrCodeData: 'TICKET_ticket-123',
      termsAndConditions: 'No refunds. Must present valid ID.'
    };

    it('should generate PDF with basic ticket data', async () => {
      // Act
      const result = await service.generateTicketPDF(mockTicketData);

      // Assert
      expect(result).toBeInstanceOf(Buffer);
      expect(puppeteer.launch).toHaveBeenCalledWith({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
      expect(mockPage.setContent).toHaveBeenCalled();
      expect(mockPage.pdf).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should generate QR code with default colors', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        mockTicketData.qrCodeData,
        {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        }
      );
    });

    it('should fetch venue branding when venueId provided', async () => {
      // Arrange
      const mockBranding = {
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#C70039',
          logoUrl: 'https://cdn.example.com/logo.png'
        },
        venue: {
          hide_platform_branding: false
        }
      };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockBranding })
        .mockResolvedValueOnce({ data: mockBranding });

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/branding/venue-789'),
        { timeout: 2000 }
      );
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/venues/venue-789'),
        { timeout: 2000 }
      );
    });

    it('should use custom QR code colors from branding', async () => {
      // Arrange
      const mockBranding = {
        branding: { primaryColor: '#FF5733' },
        venue: { hide_platform_branding: false }
      };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockBranding })
        .mockResolvedValueOnce({ data: mockBranding });

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      expect(QRCode.toDataURL).toHaveBeenCalledWith(
        mockTicketData.qrCodeData,
        expect.objectContaining({
          color: {
            dark: '#FF5733',
            light: '#FFFFFF'
          }
        })
      );
    });

    it('should handle branding fetch failure gracefully', async () => {
      // Arrange
      (axios.get as jest.Mock).mockRejectedValue(new Error('Network error'));

      // Act
      const result = await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      expect(result).toBeInstanceOf(Buffer);
      expect(mockPage.setContent).toHaveBeenCalled();
    });

    it('should use VENUE_SERVICE_URL env var', async () => {
      // Arrange
      const originalEnv = process.env.VENUE_SERVICE_URL;
      process.env.VENUE_SERVICE_URL = 'http://custom-venue-service:4000';
      (axios.get as jest.Mock).mockRejectedValue(new Error('Timeout'));

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('http://custom-venue-service:4000'),
        { timeout: 2000 }
      );

      // Cleanup
      process.env.VENUE_SERVICE_URL = originalEnv;
    });

    it('should set HTML content with waitUntil networkidle0', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      expect(mockPage.setContent).toHaveBeenCalledWith(
        expect.stringContaining('<!DOCTYPE html>'),
        { waitUntil: 'networkidle0' }
      );
    });

    it('should generate PDF with A4 format and margins', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      expect(mockPage.pdf).toHaveBeenCalledWith({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      });
    });

    it('should include event name in HTML', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain(mockTicketData.eventName);
    });

    it('should include ticket ID in HTML', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain(mockTicketData.ticketId);
    });

    it('should include QR code in HTML', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain('data:image/png;base64,mockQRCode');
    });

    it('should include seat info when provided', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain(mockTicketData.seatInfo);
    });

    it('should include venue address when provided', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain(mockTicketData.venueAddress);
    });

    it('should include terms and conditions when provided', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain(mockTicketData.termsAndConditions);
    });

    it('should show platform branding when not white-label', async () => {
      // Arrange
      const mockBranding = {
        branding: {},
        venue: { hide_platform_branding: false }
      };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockBranding })
        .mockResolvedValueOnce({ data: mockBranding });

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain('Powered by TicketToken');
    });

    it('should hide platform branding when white-label', async () => {
      // Arrange
      const mockBranding = {
        branding: {},
        venue: { hide_platform_branding: true }
      };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockBranding })
        .mockResolvedValueOnce({ data: mockBranding });

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).not.toContain('Powered by TicketToken');
    });

    it('should include custom logo when provided', async () => {
      // Arrange
      const logoUrl = 'https://cdn.example.com/venue-logo.png';
      const mockBranding = {
        branding: { logoUrl },
        venue: { hide_platform_branding: false }
      };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockBranding })
        .mockResolvedValueOnce({ data: mockBranding });

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain(logoUrl);
      expect(htmlContent).toContain('<img src=');
    });

    it('should apply primary and secondary colors', async () => {
      // Arrange
      const mockBranding = {
        branding: {
          primaryColor: '#FF5733',
          secondaryColor: '#C70039'
        },
        venue: { hide_platform_branding: false }
      };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockBranding })
        .mockResolvedValueOnce({ data: mockBranding });

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain('#FF5733');
      expect(htmlContent).toContain('#C70039');
    });

    it('should apply custom font family', async () => {
      // Arrange
      const mockBranding = {
        branding: { fontFamily: 'Roboto, sans-serif' },
        venue: { hide_platform_branding: false }
      };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockBranding })
        .mockResolvedValueOnce({ data: mockBranding });

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain('Roboto, sans-serif');
    });

    it('should close browser after successful generation', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should close browser even if error occurs', async () => {
      // Arrange
      mockPage.pdf.mockRejectedValue(new Error('PDF generation failed'));

      // Act & Assert
      await expect(service.generateTicketPDF(mockTicketData)).rejects.toThrow();
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('should throw error when PDF generation fails', async () => {
      // Arrange
      mockPage.pdf.mockRejectedValue(new Error('PDF generation failed'));

      // Act & Assert
      await expect(service.generateTicketPDF(mockTicketData)).rejects.toThrow('PDF generation failed');
    });

    it('should handle Puppeteer launch failure', async () => {
      // Arrange
      (puppeteer.launch as jest.Mock).mockRejectedValue(new Error('Failed to launch browser'));

      // Act & Assert
      await expect(service.generateTicketPDF(mockTicketData)).rejects.toThrow('Failed to launch browser');
    });

    it('should format price with two decimal places', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain('$150.00');
    });

    it('should handle ticket without optional fields', async () => {
      // Arrange
      const minimalTicket = {
        ticketId: 'ticket-123',
        orderId: 'order-456',
        eventName: 'Concert Night',
        eventDate: '2024-12-31 20:00',
        venueName: 'Madison Square Garden',
        ticketType: 'General Admission',
        price: 50.00,
        purchaserName: 'Jane Doe',
        qrCodeData: 'TICKET_ticket-123'
      };

      // Act
      const result = await service.generateTicketPDF(minimalTicket);

      // Assert
      expect(result).toBeInstanceOf(Buffer);
      expect(mockPage.setContent).toHaveBeenCalled();
    });

    it('should use default branding colors when no branding provided', async () => {
      // Act
      await service.generateTicketPDF(mockTicketData);

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain('#667eea'); // default primary
      expect(htmlContent).toContain('#764ba2'); // default secondary
    });

    it('should include custom header text when provided', async () => {
      // Arrange
      const mockBranding = {
        branding: { ticketHeaderText: 'CUSTOM EVENT PASS' },
        venue: { hide_platform_branding: false }
      };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockBranding })
        .mockResolvedValueOnce({ data: mockBranding });

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain('CUSTOM EVENT PASS');
    });

    it('should include custom footer text when provided', async () => {
      // Arrange
      const mockBranding = {
        branding: { ticketFooterText: 'Have a great time!' },
        venue: { hide_platform_branding: false }
      };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockBranding })
        .mockResolvedValueOnce({ data: mockBranding });

      // Act
      await service.generateTicketPDF(mockTicketData, 'venue-789');

      // Assert
      const htmlContent = mockPage.setContent.mock.calls[0][0];
      expect(htmlContent).toContain('Have a great time!');
    });
  });

  describe('singleton instance', () => {
    it('should export ticketPDFService instance', () => {
      expect(ticketPDFService).toBeInstanceOf(TicketPDFService);
    });

    it('should be the same instance across calls', () => {
      const instance1 = ticketPDFService;
      const instance2 = ticketPDFService;
      expect(instance1).toBe(instance2);
    });
  });
});
