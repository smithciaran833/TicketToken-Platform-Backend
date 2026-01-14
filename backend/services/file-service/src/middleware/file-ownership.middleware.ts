import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { db } from '../config/database';

/**
 * Middleware to verify file ownership and access permissions
 * Checks if the authenticated user has permission to access the requested file
 */
export async function verifyFileOwnership(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { fileId } = request.params as { fileId: string };
    const user = (request as any).user;
    
    if (!user || !user.id) {
      logger.warn({}, 'File access attempted without valid user context');
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Authentication required' 
      });
    }
    
    // Fetch the file from database
    const file = await db('files')
      .where({ id: fileId })
      .whereNull('deleted_at')
      .first();
    
    if (!file) {
      logger.info(`File not found: ${fileId}`);
      return reply.status(404).send({ 
        error: 'Not Found',
        message: 'File not found or has been deleted' 
      });
    }
    
    // Check if user is the file owner
    if (file.uploaded_by === user.id) {
      logger.debug(`File access authorized: ${fileId} (owner: ${user.id})`);
      (request as any).file = file;
      return;
    }
    
    // Check if file is public
    if (file.is_public) {
      logger.debug(`File access authorized: ${fileId} (public file)`);
      (request as any).file = file;
      return;
    }
    
    // Check access level
    switch (file.access_level) {
      case 'public':
        // Public files are accessible to all authenticated users
        logger.debug(`File access authorized: ${fileId} (public access level)`);
        (request as any).file = file;
        return;
      
      case 'private':
        // Private files only accessible to owner (already checked above)
        logger.warn({ fileId, userId: user.id }, 'Unauthorized file access attempt');
        return reply.status(403).send({ 
          error: 'Forbidden',
          message: 'You do not have permission to access this file' 
        });
      
      case 'shared':
        // Check if user has explicit access
        const hasExplicitAccess = await checkExplicitAccess(user.id, fileId);
        if (hasExplicitAccess) {
          logger.debug(`File access authorized: ${fileId} (explicit share)`);
          (request as any).file = file;
          return;
        }
        
        logger.warn({ fileId, userId: user.id }, 'Unauthorized shared file access');
        return reply.status(403).send({ 
          error: 'Forbidden',
          message: 'This file has not been shared with you' 
        });
      
      case 'tenant':
        // Check if user is in the same tenant/organization
        const sameTenant = await checkSameTenant(user.id, file.uploaded_by);
        if (sameTenant) {
          logger.debug(`File access authorized: ${fileId} (same tenant)`);
          (request as any).file = file;
          return;
        }
        
        logger.warn({ fileId, userId: user.id }, 'Unauthorized tenant file access');
        return reply.status(403).send({ 
          error: 'Forbidden',
          message: 'You do not have permission to access this file' 
        });
      
      default:
        // Unknown access level - deny access
        logger.error({ fileId, accessLevel: file.access_level }, 'Unknown access level for file');
        return reply.status(403).send({ 
          error: 'Forbidden',
          message: 'Invalid file access configuration' 
        });
    }
    
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error in file ownership verification');
    return reply.status(500).send({ 
      error: 'Internal Server Error',
      message: 'Failed to verify file access permissions' 
    });
  }
}

/**
 * Check if a user has explicit access to a file via file_shares table
 */
async function checkExplicitAccess(userId: string, fileId: string): Promise<boolean> {
  try {
    // Check if file_shares table exists (will be created in future migration)
    const share = await db('file_shares')
      .where({ 
        file_id: fileId,
        shared_with_user_id: userId 
      })
      .where('expires_at', '>', db.fn.now())
      .orWhereNull('expires_at')
      .first()
      .catch(() => null); // Table might not exist yet
    
    return !!share;
  } catch (error) {
    logger.debug('file_shares table not found, skipping explicit access check');
    return false;
  }
}

/**
 * Check if two users belong to the same tenant/organization
 */
async function checkSameTenant(userId1: string, userId2: string): Promise<boolean> {
  try {
    // Query users table to check tenant_id
    const [user1, user2] = await Promise.all([
      db('users').where({ id: userId1 }).select('tenant_id').first().catch(() => null),
      db('users').where({ id: userId2 }).select('tenant_id').first().catch(() => null)
    ]);
    
    if (!user1 || !user2 || !user1.tenant_id || !user2.tenant_id) {
      return false;
    }
    
    return user1.tenant_id === user2.tenant_id;
  } catch (error) {
    logger.debug('Unable to check tenant relationship, assuming different tenants');
    return false;
  }
}

/**
 * Middleware to verify user can modify a file (stricter than read access)
 * Only file owner or admins can modify files
 */
export async function verifyFileModifyPermission(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { fileId } = request.params as { fileId: string };
    const user = (request as any).user;
    
    if (!user || !user.id) {
      return reply.status(401).send({ 
        error: 'Unauthorized',
        message: 'Authentication required' 
      });
    }
    
    // Fetch the file
    const file = await db('files')
      .where({ id: fileId })
      .whereNull('deleted_at')
      .first();
    
    if (!file) {
      return reply.status(404).send({ 
        error: 'Not Found',
        message: 'File not found' 
      });
    }
    
    // Check if user is owner or admin
    const isOwner = file.uploaded_by === user.id;
    const isAdmin = user.roles?.includes('admin') || user.role === 'admin' || user.isAdmin;
    
    if (!isOwner && !isAdmin) {
      logger.warn({ fileId, userId: user.id }, 'Unauthorized file modification attempt');
      return reply.status(403).send({ 
        error: 'Forbidden',
        message: 'Only the file owner can modify this file' 
      });
    }
    
    logger.debug(`File modification authorized: ${fileId} by user ${user.id}`);
    (request as any).file = file;
    
  } catch (error) {
    logger.error({ err: error instanceof Error ? error : new Error(String(error)) }, 'Error in file modification permission check');
    return reply.status(500).send({ 
      error: 'Internal Server Error',
      message: 'Failed to verify file modification permissions' 
    });
  }
}
