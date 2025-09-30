import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller';

const router = Router();

// Document routes authenticated by default from index.ts
router.post('/documents/upload', DocumentController.uploadDocument);
router.get('/documents/:documentId', DocumentController.getDocument);

export default router;
