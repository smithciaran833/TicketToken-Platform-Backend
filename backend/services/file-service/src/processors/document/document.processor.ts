import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../../utils/logger';
import { fileModel } from '../../models/file.model';
import { storageService } from '../../storage/storage.service';

export class DocumentProcessor {
  async processDocument(fileId: string, tenantId: string): Promise<void> {
    try {
      const file = await fileModel.findById(fileId, tenantId);
      if (!file) {
        throw new Error(`File not found: ${fileId}`);
      }

      if (!file.storagePath) {
        throw new Error(`File has no storage path: ${fileId}`);
      }

      const buffer = await storageService.download(file.storagePath);

      if (file.mimeType === 'application/pdf') {
        await this.processPDF(fileId, buffer);
      } else if (file.mimeType?.includes('word')) {
        await this.processWord(fileId, buffer);
      }

      await fileModel.updateStatus(fileId, tenantId, 'ready');
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error : new Error(String(error)), fileId }, 'Document processing failed');
      await fileModel.updateStatus(fileId, tenantId, 'failed', error.message);
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'PDF processing failed');
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
      logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Word processing failed');
      throw error;
    }
  }

  private async generatePDFThumbnail(fileId: string, _buffer: Buffer): Promise<void> {
    // PDF thumbnail generation disabled - puppeteer-based PDF rendering is unreliable
    // and requires significant resources. Consider using pdf-poppler or pdf2pic instead.
    logger.debug({ fileId }, 'PDF thumbnail generation skipped - not implemented');
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
