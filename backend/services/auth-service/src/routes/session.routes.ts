import { Router } from 'express';

const router = Router();

// Session routes will be added here
router.get('/', (req, res) => {
  res.json({ message: 'Session route' });
});

export default router;
