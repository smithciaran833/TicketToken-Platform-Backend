import express, { Request, Response, Router } from 'express';
import { getPool } from '../config/database';
import logger from '../utils/logger';

const router: Router = express.Router();

// GET /api/devices - List all devices
router.get('/', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();

  try {
    const result = await pool.query(
      'SELECT * FROM devices WHERE is_active = true ORDER BY name'
    );

    return res.json({
      success: true,
      devices: result.rows
    });

  } catch (error) {
    logger.error('Device list error:', error);
    return res.status(500).json({
      success: false,
      error: 'DEVICE_LIST_ERROR'
    });
  }
});

// POST /api/devices/register - Register a new device
router.post('/register', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const { device_id, name, zone = 'GA' } = req.body;

  if (!device_id || !name) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_PARAMETERS'
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO devices (device_id, name, zone, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (device_id) DO UPDATE
      SET name = EXCLUDED.name, zone = EXCLUDED.zone, updated_at = NOW()
      RETURNING *
    `, [device_id, name, zone]);

    return res.json({
      success: true,
      device: result.rows[0]
    });

  } catch (error) {
    logger.error('Device registration error:', error);
    return res.status(500).json({
      success: false,
      error: 'REGISTRATION_ERROR'
    });
  }
});

export default router;
