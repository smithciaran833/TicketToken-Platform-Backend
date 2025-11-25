import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database';
import logger from '../utils/logger';

interface RegisterBody {
  device_id: string;
  name: string;
  zone?: string;
}

export default async function deviceRoutes(fastify: FastifyInstance) {
  // GET /api/devices - List all devices
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const pool = getPool();

    try {
      const result = await pool.query(
        'SELECT * FROM devices WHERE is_active = true ORDER BY name'
      );

      return reply.send({
        success: true,
        devices: result.rows
      });
    } catch (error) {
      logger.error('Device list error:', error);
      return reply.status(500).send({
        success: false,
        error: 'DEVICE_LIST_ERROR'
      });
    }
  });

  // POST /api/devices/register - Register a new device
  fastify.post('/register', async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
    const pool = getPool();
    const { device_id, name, zone = 'GA' } = request.body;

    if (!device_id || !name) {
      return reply.status(400).send({
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

      return reply.send({
        success: true,
        device: result.rows[0]
      });
    } catch (error) {
      logger.error('Device registration error:', error);
      return reply.status(500).send({
        success: false,
        error: 'REGISTRATION_ERROR'
      });
    }
  });
}
