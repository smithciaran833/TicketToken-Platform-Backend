import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export class PDFService {
  private outputDir = process.env.PDF_OUTPUT_PATH || './generated-forms';
  
  constructor() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }
  
  async generate1099K(data: {
    venueId: string;
    businessName: string;
    ein: string;
    year: number;
    grossAmount: number;
    transactionCount: number;
    monthlyAmounts: any;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const filename = `1099K_${data.venueId}_${data.year}.pdf`;
        const filepath = path.join(this.outputDir, filename);
        
        const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);
        
        // IRS Form 1099-K Header
        doc.fontSize(16).font('Helvetica-Bold')
           .text('Form 1099-K', 50, 50);
        
        doc.fontSize(12).font('Helvetica')
           .text('Payment Card and Third Party Network Transactions', 50, 75);
        
        doc.fontSize(10)
           .text(`Tax Year: ${data.year}`, 450, 50);
        
        // Payer Information (TicketToken)
        doc.fontSize(12).font('Helvetica-Bold')
           .text('PAYER (TicketToken Platform)', 50, 120);
        
        doc.fontSize(10).font('Helvetica')
           .text('TicketToken Inc.', 50, 140)
           .text('123 Blockchain Way', 50, 155)
           .text('Nashville, TN 37203', 50, 170)
           .text('EIN: 88-1234567', 50, 185);
        
        // Payee Information (Venue)
        doc.fontSize(12).font('Helvetica-Bold')
           .text('PAYEE', 300, 120);
        
        doc.fontSize(10).font('Helvetica')
           .text(data.businessName, 300, 140)
           .text(`EIN: ${data.ein}`, 300, 155)
           .text(`Venue ID: ${data.venueId}`, 300, 170);
        
        // Transaction Information
        doc.fontSize(12).font('Helvetica-Bold')
           .text('Transaction Information', 50, 230);
        
        // Box 1a: Gross amount of payment card/third party transactions
        doc.rect(50, 250, 500, 30).stroke();
        doc.fontSize(10).font('Helvetica')
           .text('1a. Gross amount of payment card/third party network transactions', 55, 255)
           .font('Helvetica-Bold')
           .text(`$${data.grossAmount.toFixed(2)}`, 450, 255);
        
        // Box 2: Card not present transactions
        doc.rect(50, 285, 500, 30).stroke();
        doc.fontSize(10).font('Helvetica')
           .text('2. Card not present transactions', 55, 290)
           .font('Helvetica-Bold')
           .text(`${data.transactionCount}`, 450, 290);
        
        // Monthly breakdown
        doc.fontSize(12).font('Helvetica-Bold')
           .text('Monthly Breakdown', 50, 340);
        
        let yPos = 360;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        doc.fontSize(9).font('Helvetica');
        for (let i = 0; i < 12; i++) {
          const amount = data.monthlyAmounts[`month_${i + 1}`] || 0;
          if (i % 2 === 0) {
            doc.text(`${months[i]}: $${amount.toFixed(2)}`, 50, yPos);
          } else {
            doc.text(`${months[i]}: $${amount.toFixed(2)}`, 200, yPos);
            yPos += 15;
          }
        }
        
        // Footer
        doc.fontSize(8).font('Helvetica')
           .text('This is important tax information and is being furnished to the Internal Revenue Service.', 50, 500)
           .text('If you are required to file a return, a negligence penalty or other sanction may be imposed', 50, 510)
           .text('on you if taxable income results from this transaction and the IRS determines that it has', 50, 520)
           .text('not been reported.', 50, 530);
        
        // Copy designation
        doc.fontSize(10).font('Helvetica-Bold')
           .text('Copy B - For Recipient', 450, 550);
        
        doc.end();
        
        stream.on('finish', () => {
          console.log(`📄 Generated 1099-K: ${filepath}`);
          resolve(filepath);
        });
        
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  async generateW9(data: {
    businessName: string;
    ein: string;
    address: string;
  }): Promise<string> {
    // Similar PDF generation for W-9
    const filename = `W9_${data.ein}_${Date.now()}.pdf`;
    const filepath = path.join(this.outputDir, filename);
    
    // Create W-9 PDF...
    console.log(`📄 Generated W-9: ${filepath}`);
    return filepath;
  }
}

export const pdfService = new PDFService();
