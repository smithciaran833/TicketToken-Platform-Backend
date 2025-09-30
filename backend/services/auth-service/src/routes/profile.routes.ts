import { Router } from 'express';

const router = Router();

// Profile routes will be added here
router.get('/', (req, res) => {
  res.json({ message: 'Profile route' });
});

export default router;
