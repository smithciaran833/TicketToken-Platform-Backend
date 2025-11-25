import { Request, Response, NextFunction } from 'express';
import { db } from '../../../src/config/database';

jest.mock('../../../src/config/database');

describe('File Ownership Middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let fileOwnershipMiddleware: any;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      params: {},
      user: undefined,
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();

    // Mock the middleware function
    fileOwnershipMiddleware = (req: Request, res: Response, next: NextFunction) => {
      const fileId = req.params.fileId;
      const userId = (req as any).user?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!fileId) {
        return res.status(400).json({ error: 'File ID required' });
      }

      // Check file ownership
      (db as any)('files')
        .where({ id: fileId, uploaded_by: userId })
        .first()
        .then((file: any) => {
          if (!file) {
            return res.status(403).json({ error: 'Access denied' });
          }
          (req as any).file = file;
          next();
        })
        .catch((error: Error) => {
          res.status(500).json({ error: 'Database error' });
        });
    };
  });

  describe('ownership verification', () => {
    it('should allow access to file owner', async () => {
      const userId = 'user-123';
      const fileId = 'file-456';
      const mockFile = {
        id: fileId,
        filename: 'document.pdf',
        uploaded_by: userId
      };

      (req as any).user = { userId };
      req.params = { fileId };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile)
      };
      (db as jest.Mock).mockReturnValue(mockQuery);

      await fileOwnershipMiddleware(req as Request, res as Response, next);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockQuery.where).toHaveBeenCalledWith({
        id: fileId,
        uploaded_by: userId
      });
      expect(next).toHaveBeenCalled();
      expect ((req as any).file).toEqual(mockFile);
    });

    it('should deny access to non-owner', async () => {
      const userId = 'user-123';
      const fileId = 'file-456';

      (req as any).user = { userId };
      req.params = { fileId };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };
      (db as jest.Mock).mockReturnValue(mockQuery);

      await fileOwnershipMiddleware(req as Request, res as Response, next);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Access denied' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should require authentication', async () => {
      (req as any).user = undefined;
      req.params = { fileId: 'file-123' };

      fileOwnershipMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Authentication') })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should require file ID', async () => {
      (req as any).user = { userId: 'user-123' };
      req.params = {};

      fileOwnershipMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('File ID') })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('shared file access', () => {
    it('should allow access to shared file with read permission', async () => {
      const userId = 'user-123';
      const fileId = 'file-456';
      const mockFile = {
        id: fileId,
        filename: 'document.pdf',
        uploaded_by: 'other-user',
        access_level: 'shared'
      };

      const mockShare = {
        file_id: fileId,
        shared_with_user_id: userId,
        permission: 'read'
      };

      (req as any).user = { userId };
      req.params = { fileId };

      // First query returns null (not owner)
      const mockQuery1 = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null)
      };

      // Second query checks shares
      const mockQuery2 = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockShare)
      };

      // Third query gets file
      const mockQuery3 = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile)
      };

      (db as jest.Mock)
        .mockReturnValueOnce(mockQuery1)
        .mockReturnValueOnce(mockQuery2)
        .mockReturnValueOnce(mockQuery3);

      const sharedFileMiddleware = async (req: Request, res: Response, next: NextFunction) => {
        const fileId = req.params.fileId;
        const userId = (req as any).user?.userId;

        // Check ownership first
        const ownedFile = await (db as any)('files')
          .where({ id: fileId, uploaded_by: userId })
          .first();

        if (ownedFile) {
          (req as any).file = ownedFile;
          return next();
        }

        // Check if file is shared with user
        const share = await (db as any)('file_shares')
          .where({ file_id: fileId, shared_with_user_id: userId })
          .first();

        if (share) {
          const file = await (db as any)('files')
            .where({ id: fileId })
            .first();
          
          (req as any).file = file;
          (req as any).filePermission = share.permission;
          return next();
        }

        return res.status(403).json({ error: 'Access denied' });
      };

      await sharedFileMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).file).toEqual(mockFile);
      expect((req as any).filePermission).toBe('read');
    });
  });

  describe('tenant-level access', () => {
    it('should allow access to tenant files for tenant members', async () => {
      const userId = 'user-123';
      const fileId = 'file-456';
      const tenantId = 'tenant-789';
      
      const mockFile = {
        id: fileId,
        filename: 'document.pdf',
        tenant_id: tenantId,
        access_level: 'tenant'
      };

      (req as any).user = { userId, tenantId };
      req.params = { fileId };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile)
      };
      (db as jest.Mock).mockReturnValue(mockQuery);

      const tenantAccessMiddleware = async (req: Request, res: Response, next: NextFunction) => {
        const fileId = req.params.fileId;
        const userId = (req as any).user?.userId;
        const tenantId = (req as any).user?.tenantId;

        const file = await (db as any)('files')
          .where({ id: fileId })
          .first();

        if (!file) {
          return res.status(404).json({ error: 'File not found' });
        }

        // Check if user has access
        const hasAccess = 
          file.uploaded_by === userId ||
          (file.tenant_id === tenantId && file.access_level === 'tenant') ||
          file.access_level === 'public';

        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied' });
        }

        (req as any).file = file;
        next();
      };

      await tenantAccessMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).file).toEqual(mockFile);
    });

    it('should deny access to tenant files for non-members', async () => {
      const userId = 'user-123';
      const fileId = 'file-456';
      const mockFile = {
        id: fileId,
        tenant_id: 'other-tenant',
        access_level: 'tenant'
      };

      (req as any).user = { userId, tenantId: 'my-tenant' };
      req.params = { fileId };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile)
      };
      (db as jest.Mock).mockReturnValue(mockQuery);

      const tenantAccessMiddleware = async (req: Request, res: Response, next: NextFunction) => {
        const fileId = req.params.fileId;
        const tenantId = (req as any).user?.tenantId;

        const file = await (db as any)('files')
          .where({ id: fileId })
          .first();

        const hasAccess = file.tenant_id === tenantId && file.access_level === 'tenant';

        if (!hasAccess) {
          return res.status(403).json({ error: 'Access denied' });
        }

        next();
      };

      await tenantAccessMiddleware(req as Request, res as Response, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('public file access', () => {
    it('should allow unauthenticated access to public files', async () => {
      const fileId = 'file-456';
      const mockFile = {
        id: fileId,
        filename: 'public-image.jpg',
        access_level: 'public'
      };

      (req as any).user = undefined;
      req.params = { fileId };

      const mockQuery = {
        where: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(mockFile)
      };
      (db as jest.Mock).mockReturnValue(mockQuery);

      const publicAccessMiddleware = async (req: Request, res: Response, next: NextFunction) => {
        const fileId = req.params.fileId;

        const file = await (db as any)('files')
          .where({ id: fileId })
          .first();

        if (!file) {
          return res.status(404).json({ error: 'File not found' });
        }

        if (file.access_level !== 'public') {
          return res.status(403).json({ error: 'Access denied' });
        }

        (req as any).file = file;
        next();
      };

      await publicAccessMiddleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect((req as any).file).toEqual(mockFile);
    });
  });
});
