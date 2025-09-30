import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import puppeteer from 'puppeteer';
import { logger } from '../../utils/logger';
import { fileModel } from '../../models/file.model';
import { storageService } from '../../storage/storage.service';

export class DocumentProcessor {
  async processDocument(fileId: string): Promise<void> {
    try {
      const file = await fileModel.findById(fileId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      const buffer = await storageService.download(file.storagePath);

      if (file.mimeType === 'application/pdf') {
        await this.processPDF(fileId, buffer);
      } else if (file.mimeType.includes('word')) {
        await this.processWord(fileId, buffer);
      }

      await fileModel.updateStatus(fileId, 'ready');
      
    } catch (error) {
      logger.error(`Document processing failed for ${fileId}:`, error);
      await fileModel.updateStatus(fileId, 'failed', error.message);
    }
  }

  private async processPDF(fileId: string, buffer: Buffer): Promise<void> {
    try {
      const data = await pdf(buffer);
      
      await this.saveDocumentMetadata(fileId, {
        pageCount: data.numpages,
        text: data.text.substring(0, 5000), // First 5000 chars
        info: data.info
      });

      // Generate thumbnail of first page
      await this.generatePDFThumbnail(fileId, buffer);
      
    } catch (error) {
      logger.error('PDF processing failed:', error);
      throw error;
    }
  }

  private async processWord(fileId: string, buffer: Buffer): Promise<void> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      await this.saveDocumentMetadata(fileId, {
        text: result.value.substring(0, 5000),
        messages: result.messages
      });
      
    } catch (error) {
      logger.error('Word processing failed:', error);
      throw error;
    }
  }

  private async generatePDFThumbnail(fileId: string, buffer: Buffer): Promise<void> {
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      
      // Convert PDF to image using puppeteer
      const base64 = buffer.toString('base64');
      await page.goto(`data:application/pdf;base64,${base64}`);
      
      const screenshot = await page.screenshot({ 
        type: 'jpeg',
        quality: 85,
        clip: { x: 0, y: 0, width: 600, height: 800 }
      });

      // Save thumbnail
      const file = await fileModel.findById(fileId);
      if (file) {
        const thumbPath = file.storagePath.replace(/\.[^.]+$/, '_thumb.jpg');
        await storageService.upload(screenshot, thumbPath);
      }
      
    } finally {
      await browser.close();
    }
  }

  private async saveDocumentMetadata(fileId: string, metadata: any): Promise<void> {
    const pool = await import('../../config/database.config').then(m => m.getPool());
    if (!pool) return;

    await pool.query(`
      INSERT INTO document_metadata (
        file_id, page_count, extracted_text
      ) VALUES ($1, $2, $3)
      ON CONFLICT (file_id) DO UPDATE SET
        page_count = $2, extracted_text = $3
    `, [fileId, metadata.pageCount || null, metadata.text || null]);
  }
}

export const documentProcessor = new DocumentProcessor();
