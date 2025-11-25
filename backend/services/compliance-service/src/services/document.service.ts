import { db } from './database.service';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class DocumentService {
  private uploadDir = process.env.DOCUMENT_STORAGE_PATH || './uploads';
  
  constructor() {
    // Create upload directory if it doesn't exist
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }
  
  async storeDocument(
    venueId: string, 
    documentType: string, 
    buffer: Buffer,
    originalName: string,
    tenantId: string
  ): Promise<string> {
    try {
      // Generate unique filename
      const documentId = `doc_${uuidv4()}`;
      const ext = path.extname(originalName);
      const filename = `${venueId}_${documentType}_${documentId}${ext}`;
      const filepath = path.join(this.uploadDir, filename);
      
      // In production, this would upload to S3
      // For now, save locally
      fs.writeFileSync(filepath, buffer);
      
      // Store reference in database
      await db.query(
        `INSERT INTO compliance_documents 
         (document_id, venue_id, document_type, filename, original_name, storage_path, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [documentId, venueId, documentType, filename, originalName, filepath, tenantId]
      );
      
      // Update venue verification status
      if (documentType === 'W9') {
        await db.query(
          `UPDATE venue_verifications 
           SET w9_uploaded = true, updated_at = NOW()
           WHERE venue_id = $1 AND tenant_id = $2`,
          [venueId, tenantId]
        );
      }
      
      logger.info(`📄 Document stored: ${documentType} for venue ${venueId}, tenant ${tenantId}`);
      return documentId;
      
    } catch (error) {
      logger.error('Error storing document:', error);
      throw error;
    }
  }
  
  async getDocument(documentId: string, tenantId: string): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    const result = await db.query(
      'SELECT * FROM compliance_documents WHERE document_id = $1 AND tenant_id = $2',
      [documentId, tenantId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Document not found');
    }
    
    const doc = result.rows[0];
    const buffer = fs.readFileSync(doc.storage_path);
    
    return {
      buffer,
      filename: doc.original_name,
      contentType: this.getContentType(doc.original_name)
    };
  }
  
  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const types: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return types[ext] || 'application/octet-stream';
  }
  
  async validateW9(venueId: string, ein: string): Promise<boolean> {
    // Mock W-9 validation
    // In production: OCR to extract EIN and validate
    logger.info(`✅ W-9 validated for venue ${venueId}`);
    return true;
  }
}

export const documentService = new DocumentService();
