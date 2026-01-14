import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database';
import logger from '../utils/logger';

/**
 * SCAN POLICIES ROUTES
 * 
 * Manages scan policies for events (re-entry, duplicate detection, zones).
 * 
 * PHASE 5c BYPASS EXCEPTION:
 * This route queries events and venues tables for policy management.
 * This is intentional because:
 * 
 * 1. scan_policies is scanning-service owned table
 * 2. The JOINs with events/venues are for display purposes (names)
 * 3. The venue_id lookup in custom policy endpoint is minimal
 * 4. Policy management is not latency-critical (admin operations)
 * 5. These are infrequent operations (policies set once per event)
 * 
 * Future: Consider adding eventServiceClient.getEventVenue() method
 * for the minimal lookup required.
 */

interface EventParams {
  eventId: string;
}

interface ApplyTemplateBody {
  template_id: string;
}

interface CustomPolicyBody {
  duplicate_window_minutes?: number;
  reentry_enabled?: boolean;
  reentry_cooldown_minutes?: number;
  max_reentries?: number;
  strict_zones?: boolean;
  vip_all_access?: boolean;
}

export default async function policyRoutes(fastify: FastifyInstance) {
  // GET /api/policies/templates - List available policy templates
  fastify.get('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const pool = getPool();

    try {
      const result = await pool.query(`
        SELECT id, name, description, policy_set, is_default
        FROM scan_policy_templates
        ORDER BY is_default DESC, name
      `);

      return reply.send({
        success: true,
        templates: result.rows
      });
    } catch (error) {
      logger.error('Error fetching templates:', error);
      return reply.status(500).send({
        success: false,
        error: 'FETCH_ERROR'
      });
    }
  });

  // GET /api/policies/event/:eventId - Get current policies for an event
  fastify.get('/event/:eventId', async (request: FastifyRequest<{ Params: EventParams }>, reply: FastifyReply) => {
    const pool = getPool();
    const { eventId } = request.params;

    try {
      const result = await pool.query(`
        SELECT
          sp.*,
          e.name as event_name,
          v.name as venue_name
        FROM scan_policies sp
        JOIN events e ON sp.event_id = e.id
        LEFT JOIN venues v ON sp.venue_id = v.id
        WHERE sp.event_id = $1
        ORDER BY sp.policy_type
      `, [eventId]);

      return reply.send({
        success: true,
        policies: result.rows
      });
    } catch (error) {
      logger.error('Error fetching event policies:', error);
      return reply.status(500).send({
        success: false,
        error: 'FETCH_ERROR'
      });
    }
  });

  // POST /api/policies/event/:eventId/apply-template - Apply a template to an event
  fastify.post('/event/:eventId/apply-template', async (
    request: FastifyRequest<{ Params: EventParams; Body: ApplyTemplateBody }>,
    reply: FastifyReply
  ) => {
    const pool = getPool();
    const { eventId } = request.params;
    const { template_id } = request.body;

    if (!template_id) {
      return reply.status(400).send({
        success: false,
        error: 'MISSING_TEMPLATE_ID'
      });
    }

    try {
      await pool.query('SELECT apply_scan_policy_template($1, $2)', [eventId, template_id]);

      // Fetch the updated policies
      const result = await pool.query(`
        SELECT * FROM scan_policies
        WHERE event_id = $1
        ORDER BY policy_type
      `, [eventId]);

      return reply.send({
        success: true,
        message: 'Policy template applied successfully',
        policies: result.rows
      });
    } catch (error: any) {
      logger.error('Error applying template:', error);
      return reply.status(500).send({
        success: false,
        error: 'APPLY_ERROR',
        message: error.message
      });
    }
  });

  // PUT /api/policies/event/:eventId/custom - Set custom policies for an event
  fastify.put('/event/:eventId/custom', async (
    request: FastifyRequest<{ Params: EventParams; Body: CustomPolicyBody }>,
    reply: FastifyReply
  ) => {
    const pool = getPool();
    const client = await pool.connect();
    const { eventId } = request.params;
    const {
      duplicate_window_minutes,
      reentry_enabled,
      reentry_cooldown_minutes,
      max_reentries,
      strict_zones,
      vip_all_access
    } = request.body;

    try {
      await client.query('BEGIN');

      // Get venue_id
      const venueResult = await client.query(
        'SELECT venue_id FROM events WHERE id = $1',
        [eventId]
      );

      if (venueResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return reply.status(404).send({
          success: false,
          error: 'EVENT_NOT_FOUND',
          message: 'Event not found'
        });
      }

      const venueId = venueResult.rows[0].venue_id;

      // Update or insert duplicate window policy
      if (duplicate_window_minutes !== undefined) {
        await client.query(`
          INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
          VALUES ($1, $2, 'DUPLICATE_WINDOW', $3, 'Custom - Duplicate Window')
          ON CONFLICT (event_id, policy_type)
          DO UPDATE SET config = $3, updated_at = NOW()
        `, [eventId, venueId, JSON.stringify({ window_minutes: duplicate_window_minutes })]);
      }

      // Update or insert re-entry policy
      if (reentry_enabled !== undefined) {
        const reentryConfig = {
          enabled: reentry_enabled,
          cooldown_minutes: reentry_cooldown_minutes || 15,
          max_reentries: max_reentries || 2
        };

        await client.query(`
          INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
          VALUES ($1, $2, 'REENTRY', $3, 'Custom - Re-entry')
          ON CONFLICT (event_id, policy_type)
          DO UPDATE SET config = $3, updated_at = NOW()
        `, [eventId, venueId, JSON.stringify(reentryConfig)]);
      }

      // Update or insert zone enforcement policy
      if (strict_zones !== undefined || vip_all_access !== undefined) {
        const zoneConfig = {
          strict: strict_zones !== false,
          vip_all_access: vip_all_access || false
        };

        await client.query(`
          INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
          VALUES ($1, $2, 'ZONE_ENFORCEMENT', $3, 'Custom - Zone Access')
          ON CONFLICT (event_id, policy_type)
          DO UPDATE SET config = $3, updated_at = NOW()
        `, [eventId, venueId, JSON.stringify(zoneConfig)]);
      }

      await client.query('COMMIT');
      client.release();

      // Fetch updated policies
      const result = await pool.query(`
        SELECT * FROM scan_policies
        WHERE event_id = $1
        ORDER BY policy_type
      `, [eventId]);

      return reply.send({
        success: true,
        message: 'Custom policies applied successfully',
        policies: result.rows
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      client.release();
      logger.error('Error setting custom policies:', error);
      return reply.status(500).send({
        success: false,
        error: 'UPDATE_ERROR',
        message: error.message
      });
    }
  });
}
