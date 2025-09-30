import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { documentService } from '../services/document.service';
import multer from 'multer';

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, and PNG are allowed.'));
    }
  }
});

export class DocumentController {
  static uploadMiddleware = upload.single('document');

  static async uploadDocument(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const { venueId, documentType } = req.body;
      
      const documentId = await documentService.storeDocument(
        venueId,
        documentType,
        req.file.buffer,
        req.file.originalname
      );

      return res.json({
        success: true,
        message: 'Document uploaded successfully',
        data: {
          documentId,
          venueId,
          documentType,
          filename: req.file.originalname
        }
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  static async getDocument(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const doc = await documentService.getDocument(documentId);
      
      res.set({
        'Content-Type': doc.contentType,
        'Content-Disposition': `attachment; filename="${doc.filename}"`
      });
      
      return res.send(doc.buffer);
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }
}
