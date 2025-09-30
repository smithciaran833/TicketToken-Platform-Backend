import { Router } from 'express';
import { DatabaseService } from '../services/databaseService';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'event-service' });
});

export default router;
