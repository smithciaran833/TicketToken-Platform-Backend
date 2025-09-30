import { FastifyReply } from 'fastify';
import { ValidationError } from '../errors';
import { db } from '../config/database';
import { AuthenticatedRequest } from '../types';


export class ProfileController {
  async getProfile(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    
    try {
      const user = await db('users')
        .where({ id: userId })
        .whereNull('deleted_at')
        .select(
          'id',
          'email',
          'first_name',
          'last_name',
          'phone',
          'email_verified',
          'mfa_enabled',
          'role',
          'created_at',
          'updated_at',
          'last_login_at',
          'password_changed_at'
        )
        .first();
      
      if (!user) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }
      
      return reply.send({
        success: true,
        data: user
      });
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to get profile');
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve profile',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async updateProfile(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const updates = request.body as {
      first_name?: string;
      last_name?: string;
      phone?: string;
    };
    
    try {
      const allowedFields = ['first_name', 'last_name', 'phone'];
      const profileUpdates: Record<string, any> = {};
      
      for (const field of allowedFields) {
        if (updates[field as keyof typeof updates] !== undefined) {
          profileUpdates[field] = updates[field as keyof typeof updates];
        }
      }
      
      if (Object.keys(profileUpdates).length === 0) {
        throw new ValidationError([{ message: 'No valid fields to update' }]);
      }
      
      profileUpdates.updated_at = new Date();
      
      await db('users')
        .where({ id: userId })
        .update(profileUpdates);
      
      // Audit log
      await db('audit_logs').insert({
        user_id: userId,
        action: 'profile_updated',
        resource_type: 'user',
        resource_id: userId,
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
        metadata: {
          updated_fields: Object.keys(profileUpdates)
        },
        status: 'success'
      });
      
      return this.getProfile(request, reply);
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to update profile');
      
      if (error instanceof ValidationError) {
        return reply.status(422).send({
          success: false,
          error: error.message,
          code: 'VALIDATION_ERROR'
        });
      }
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to update profile',
        code: 'INTERNAL_ERROR'
      });
    }
  }
}
