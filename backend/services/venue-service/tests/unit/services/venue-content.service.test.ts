/**
 * Unit tests for src/services/venue-content.service.ts
 */

// Valid MongoDB ObjectId format (24 hex chars)
const validVenueId = '507f1f77bcf86cd799439011';
const validContentId = '507f1f77bcf86cd799439012';
const validUserId = '507f1f77bcf86cd799439013';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock mongoose Types.ObjectId
jest.mock('mongoose', () => ({
  Types: {
    ObjectId: jest.fn().mockImplementation((id) => id),
  },
}));

// Create a mock save function we can control per test
const mockSave = jest.fn();

// Mock VenueContentModel - constructor captures input and returns controllable instance
jest.mock('../../../src/models/mongodb/venue-content.model', () => {
  return {
    VenueContentModel: Object.assign(
      jest.fn().mockImplementation(function(data: any) {
        return {
          ...data,
          _id: validContentId,
          save: mockSave,
        };
      }),
      {
        findById: jest.fn(),
        findByIdAndDelete: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
      }
    ),
    VenueContentType: {
      DESCRIPTION: 'description',
      IMAGE: 'image',
      VIDEO: 'video',
    },
    VenueContentStatus: {
      DRAFT: 'draft',
      PUBLISHED: 'published',
      ARCHIVED: 'archived',
    },
  };
});

import { VenueContentService } from '../../../src/services/venue-content.service';
import { VenueContentModel } from '../../../src/models/mongodb/venue-content.model';

describe('VenueContentService', () => {
  let service: VenueContentService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
    service = new VenueContentService();
  });

  describe('createContent()', () => {
    it('should create new content', async () => {
      const result = await service.createContent({
        venueId: validVenueId,
        contentType: 'description' as any,
        content: { text: 'Test' },
        createdBy: validUserId,
      });

      expect(result).toBeDefined();
      expect(result._id).toBe(validContentId);
      expect(mockSave).toHaveBeenCalled();
    });

    it('should set status to draft by default', async () => {
      const result = await service.createContent({
        venueId: validVenueId,
        contentType: 'description' as any,
        content: { text: 'Test' },
        createdBy: validUserId,
      });

      expect(result.status).toBe('draft');
    });

    it('should use provided displayOrder', async () => {
      const result = await service.createContent({
        venueId: validVenueId,
        contentType: 'description' as any,
        content: { text: 'Test' },
        createdBy: validUserId,
        displayOrder: 5,
      });

      expect(result.displayOrder).toBe(5);
    });

    it('should use provided featured flag', async () => {
      const result = await service.createContent({
        venueId: validVenueId,
        contentType: 'description' as any,
        content: { text: 'Test' },
        createdBy: validUserId,
        featured: true,
      });

      expect(result.featured).toBe(true);
    });

    it('should log content creation', async () => {
      const { logger } = require('../../../src/utils/logger');

      await service.createContent({
        venueId: validVenueId,
        contentType: 'description' as any,
        content: { text: 'Test' },
        createdBy: validUserId,
      });

      expect(logger.info).toHaveBeenCalled();
    });

    it('should throw on save error', async () => {
      mockSave.mockRejectedValue(new Error('Save failed'));

      await expect(service.createContent({
        venueId: validVenueId,
        contentType: 'description' as any,
        content: { text: 'Test' },
        createdBy: validUserId,
      })).rejects.toThrow('Save failed');
    });

    it('should log error on failure', async () => {
      const { logger } = require('../../../src/utils/logger');
      mockSave.mockRejectedValue(new Error('Save failed'));

      await service.createContent({
        venueId: validVenueId,
        contentType: 'description' as any,
        content: { text: 'Test' },
        createdBy: validUserId,
      }).catch(() => {});

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('updateContent()', () => {
    it('should update existing content', async () => {
      const mockContent = {
        _id: validContentId,
        content: { text: 'Old' },
        version: 1,
        save: mockSave,
      };
      (VenueContentModel.findById as jest.Mock).mockResolvedValue(mockContent);

      const result = await service.updateContent(validContentId, {
        content: { text: 'New' },
        updatedBy: validUserId,
      });

      expect(result).toBeDefined();
      expect(mockSave).toHaveBeenCalled();
    });

    it('should throw error when content not found', async () => {
      (VenueContentModel.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.updateContent(validContentId, {
        content: { text: 'New' },
        updatedBy: validUserId,
      })).rejects.toThrow('Content not found');
    });

    it('should increment version on update', async () => {
      const mockContent = {
        _id: validContentId,
        content: { text: 'Old' },
        version: 1,
        save: mockSave,
      };
      (VenueContentModel.findById as jest.Mock).mockResolvedValue(mockContent);

      const result = await service.updateContent(validContentId, {
        content: { text: 'New' },
        updatedBy: validUserId,
      });

      expect(result!.version).toBe(2);
    });

    it('should update displayOrder', async () => {
      const mockContent = {
        _id: validContentId,
        displayOrder: 0,
        version: 1,
        save: mockSave,
      };
      (VenueContentModel.findById as jest.Mock).mockResolvedValue(mockContent);

      const result = await service.updateContent(validContentId, {
        displayOrder: 10,
        updatedBy: validUserId,
      });

      expect(result!.displayOrder).toBe(10);
    });

    it('should update featured flag', async () => {
      const mockContent = {
        _id: validContentId,
        featured: false,
        version: 1,
        save: mockSave,
      };
      (VenueContentModel.findById as jest.Mock).mockResolvedValue(mockContent);

      const result = await service.updateContent(validContentId, {
        featured: true,
        updatedBy: validUserId,
      });

      expect(result!.featured).toBe(true);
    });

    it('should update primaryImage flag', async () => {
      const mockContent = {
        _id: validContentId,
        primaryImage: false,
        version: 1,
        save: mockSave,
      };
      (VenueContentModel.findById as jest.Mock).mockResolvedValue(mockContent);

      const result = await service.updateContent(validContentId, {
        primaryImage: true,
        updatedBy: validUserId,
      });

      expect(result!.primaryImage).toBe(true);
    });

    it('should log update', async () => {
      const { logger } = require('../../../src/utils/logger');
      const mockContent = { _id: validContentId, version: 1, save: mockSave };
      (VenueContentModel.findById as jest.Mock).mockResolvedValue(mockContent);

      await service.updateContent(validContentId, { updatedBy: validUserId });

      expect(logger.info).toHaveBeenCalled();
    });
  });

  describe('deleteContent()', () => {
    it('should delete content and return true', async () => {
      (VenueContentModel.findByIdAndDelete as jest.Mock).mockResolvedValue({ _id: validContentId });

      const result = await service.deleteContent(validContentId);

      expect(result).toBe(true);
    });

    it('should return false when content not found', async () => {
      (VenueContentModel.findByIdAndDelete as jest.Mock).mockResolvedValue(null);

      const result = await service.deleteContent(validContentId);

      expect(result).toBe(false);
    });

    it('should log deletion', async () => {
      const { logger } = require('../../../src/utils/logger');
      (VenueContentModel.findByIdAndDelete as jest.Mock).mockResolvedValue({ _id: validContentId });

      await service.deleteContent(validContentId);

      expect(logger.info).toHaveBeenCalled();
    });

    it('should throw on delete error', async () => {
      (VenueContentModel.findByIdAndDelete as jest.Mock).mockRejectedValue(new Error('Delete failed'));

      await expect(service.deleteContent(validContentId)).rejects.toThrow('Delete failed');
    });
  });

  describe('Content Types', () => {
    it('should handle description content type', async () => {
      const result = await service.createContent({
        venueId: validVenueId,
        contentType: 'description' as any,
        content: { text: 'Description' },
        createdBy: validUserId,
      });

      expect(result.contentType).toBe('description');
    });

    it('should handle image content type', async () => {
      const result = await service.createContent({
        venueId: validVenueId,
        contentType: 'image' as any,
        content: { url: 'https://example.com/image.jpg' },
        createdBy: validUserId,
      });

      expect(result.contentType).toBe('image');
    });

    it('should handle video content type', async () => {
      const result = await service.createContent({
        venueId: validVenueId,
        contentType: 'video' as any,
        content: { url: 'https://example.com/video.mp4' },
        createdBy: validUserId,
      });

      expect(result.contentType).toBe('video');
    });
  });

  describe('Error Handling', () => {
    it('should handle save errors', async () => {
      mockSave.mockRejectedValue(new Error('MongoDB connection failed'));

      await expect(service.createContent({
        venueId: validVenueId,
        contentType: 'description' as any,
        content: {},
        createdBy: validUserId,
      })).rejects.toThrow('MongoDB connection failed');
    });

    it('should log all errors', async () => {
      const { logger } = require('../../../src/utils/logger');
      (VenueContentModel.findById as jest.Mock).mockRejectedValue(new Error('DB Error'));

      await service.updateContent(validContentId, {
        content: {},
        updatedBy: validUserId,
      }).catch(() => {});

      expect(logger.error).toHaveBeenCalled();
    });
  });
});
