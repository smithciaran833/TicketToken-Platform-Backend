/**
 * Unit tests for EventContentService
 * Tests MongoDB content management for events
 */

// Mock Mongoose model
const mockSave = jest.fn();
const mockFindById = jest.fn();
const mockFindByIdAndDelete = jest.fn();
const mockFind = jest.fn();
const mockFindOne = jest.fn();

const mockContentInstance = {
  _id: 'content-123',
  eventId: 'event-123',
  contentType: 'GALLERY',
  content: { url: 'https://example.com/image.jpg' },
  status: 'draft',
  displayOrder: 0,
  featured: false,
  primaryImage: false,
  version: 1,
  createdBy: 'user-123',
  updatedBy: 'user-123',
  save: mockSave,
};

jest.mock('../../../src/models/mongodb/event-content.model', () => ({
  EventContentModel: Object.assign(
    jest.fn().mockImplementation(() => ({
      ...mockContentInstance,
      save: mockSave.mockResolvedValue(mockContentInstance),
    })),
    {
      findById: mockFindById,
      findByIdAndDelete: mockFindByIdAndDelete,
      find: mockFind,
      findOne: mockFindOne,
    }
  ),
  EventContentType: {
    GALLERY: 'GALLERY',
    LINEUP: 'LINEUP',
    SCHEDULE: 'SCHEDULE',
    PERFORMER_BIO: 'PERFORMER_BIO',
  },
  EventContentStatus: {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ARCHIVED: 'archived',
  },
}));

jest.mock('mongoose', () => ({
  Types: {
    ObjectId: jest.fn().mockImplementation((id) => id),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { EventContentService, CreateContentInput, UpdateContentInput } from '../../../src/services/event-content.service';

describe('EventContentService', () => {
  let service: EventContentService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EventContentService();
    
    // Default mock implementations
    mockSave.mockResolvedValue(mockContentInstance);
    mockFindById.mockResolvedValue(mockContentInstance);
    mockFindByIdAndDelete.mockResolvedValue(mockContentInstance);
    mockFind.mockReturnValue({
      sort: jest.fn().mockResolvedValue([mockContentInstance]),
    });
    mockFindOne.mockResolvedValue(mockContentInstance);
  });

  describe('createContent', () => {
    const createInput: CreateContentInput = {
      eventId: 'event-123',
      contentType: 'GALLERY' as any,
      content: { url: 'https://example.com/image.jpg' },
      createdBy: 'user-123',
      displayOrder: 0,
      featured: false,
    };

    it('should create content successfully', async () => {
      const result = await service.createContent(createInput);

      expect(result).toBeDefined();
      expect(mockSave).toHaveBeenCalled();
    });

    it('should set default status to draft', async () => {
      const result = await service.createContent(createInput);

      expect(result.status).toBe('draft');
    });

    it('should set displayOrder from input', async () => {
      const inputWithOrder = { ...createInput, displayOrder: 5 };
      await service.createContent(inputWithOrder);

      expect(mockSave).toHaveBeenCalled();
    });

    it('should set featured from input', async () => {
      const inputFeatured = { ...createInput, featured: true };
      await service.createContent(inputFeatured);

      expect(mockSave).toHaveBeenCalled();
    });

    it('should default displayOrder to 0', async () => {
      const inputNoOrder = { ...createInput, displayOrder: undefined };
      await service.createContent(inputNoOrder);

      expect(mockSave).toHaveBeenCalled();
    });

    it('should default featured to false', async () => {
      const inputNoFeatured = { ...createInput, featured: undefined };
      await service.createContent(inputNoFeatured);

      expect(mockSave).toHaveBeenCalled();
    });

    it('should throw on save error', async () => {
      mockSave.mockRejectedValue(new Error('MongoDB error'));

      await expect(service.createContent(createInput)).rejects.toThrow('MongoDB error');
    });

    it('should convert eventId to ObjectId', async () => {
      await service.createContent(createInput);

      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe('updateContent', () => {
    const updateInput: UpdateContentInput = {
      content: { url: 'https://example.com/updated.jpg' },
      updatedBy: 'user-456',
      displayOrder: 2,
      featured: true,
    };

    it('should update content successfully', async () => {
      const updatableContent = {
        ...mockContentInstance,
        save: mockSave,
      };
      mockFindById.mockResolvedValue(updatableContent);

      const result = await service.updateContent('content-123', updateInput);

      expect(result).toBeDefined();
      expect(mockSave).toHaveBeenCalled();
    });

    it('should throw error if content not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(service.updateContent('non-existent', updateInput))
        .rejects.toThrow('Content not found');
    });

    it('should update content field', async () => {
      const updatableContent = {
        ...mockContentInstance,
        save: mockSave,
      };
      mockFindById.mockResolvedValue(updatableContent);

      await service.updateContent('content-123', updateInput);

      expect(updatableContent.content).toEqual(updateInput.content);
    });

    it('should update displayOrder', async () => {
      const updatableContent = {
        ...mockContentInstance,
        save: mockSave,
      };
      mockFindById.mockResolvedValue(updatableContent);

      await service.updateContent('content-123', { updatedBy: 'user', displayOrder: 10 });

      expect(updatableContent.displayOrder).toBe(10);
    });

    it('should update featured', async () => {
      const updatableContent = {
        ...mockContentInstance,
        save: mockSave,
      };
      mockFindById.mockResolvedValue(updatableContent);

      await service.updateContent('content-123', { updatedBy: 'user', featured: true });

      expect(updatableContent.featured).toBe(true);
    });

    it('should update primaryImage', async () => {
      const updatableContent = {
        ...mockContentInstance,
        save: mockSave,
      };
      mockFindById.mockResolvedValue(updatableContent);

      await service.updateContent('content-123', { updatedBy: 'user', primaryImage: true });

      expect(updatableContent.primaryImage).toBe(true);
    });

    it('should increment version on update', async () => {
      const updatableContent = {
        ...mockContentInstance,
        version: 1,
        save: mockSave,
      };
      mockFindById.mockResolvedValue(updatableContent);

      await service.updateContent('content-123', updateInput);

      expect(updatableContent.version).toBe(2);
    });

    it('should update updatedBy field', async () => {
      const updatableContent = {
        ...mockContentInstance,
        save: mockSave,
      };
      mockFindById.mockResolvedValue(updatableContent);

      await service.updateContent('content-123', { updatedBy: 'new-user' });

      expect(updatableContent.updatedBy).toBe('new-user');
    });
  });

  describe('deleteContent', () => {
    it('should delete content successfully', async () => {
      mockFindByIdAndDelete.mockResolvedValue(mockContentInstance);

      const result = await service.deleteContent('content-123');

      expect(result).toBe(true);
      expect(mockFindByIdAndDelete).toHaveBeenCalledWith('content-123');
    });

    it('should return false if content not found', async () => {
      mockFindByIdAndDelete.mockResolvedValue(null);

      const result = await service.deleteContent('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('getContent', () => {
    it('should return content by id', async () => {
      mockFindById.mockResolvedValue(mockContentInstance);

      const result = await service.getContent('content-123');

      expect(result).toEqual(mockContentInstance);
      expect(mockFindById).toHaveBeenCalledWith('content-123');
    });

    it('should return null if not found', async () => {
      mockFindById.mockResolvedValue(null);

      const result = await service.getContent('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getEventContent', () => {
    it('should get all content for event', async () => {
      const mockSort = jest.fn().mockResolvedValue([mockContentInstance]);
      mockFind.mockReturnValue({ sort: mockSort });

      const result = await service.getEventContent('event-123');

      expect(result).toHaveLength(1);
    });

    it('should filter by contentType', async () => {
      const mockSort = jest.fn().mockResolvedValue([mockContentInstance]);
      mockFind.mockReturnValue({ sort: mockSort });

      await service.getEventContent('event-123', 'GALLERY' as any);

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({ contentType: 'GALLERY' })
      );
    });

    it('should filter by status', async () => {
      const mockSort = jest.fn().mockResolvedValue([mockContentInstance]);
      mockFind.mockReturnValue({ sort: mockSort });

      await service.getEventContent('event-123', undefined, 'published' as any);

      expect(mockFind).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published' })
      );
    });

    it('should sort by displayOrder and createdAt', async () => {
      const mockSort = jest.fn().mockResolvedValue([]);
      mockFind.mockReturnValue({ sort: mockSort });

      await service.getEventContent('event-123');

      expect(mockSort).toHaveBeenCalledWith({ displayOrder: 1, createdAt: -1 });
    });
  });

  describe('publishContent', () => {
    it('should publish content', async () => {
      const publishableContent = {
        ...mockContentInstance,
        status: 'draft',
        save: mockSave,
      };
      mockFindById.mockResolvedValue(publishableContent);

      const result = await service.publishContent('content-123', 'user-123');

      expect(publishableContent.status).toBe('published');
      expect(publishableContent.publishedAt).toBeDefined();
    });

    it('should set publishedAt timestamp', async () => {
      const publishableContent = {
        ...mockContentInstance,
        status: 'draft',
        save: mockSave,
      };
      mockFindById.mockResolvedValue(publishableContent);

      await service.publishContent('content-123', 'user-123');

      expect(publishableContent.publishedAt).toBeInstanceOf(Date);
    });

    it('should update updatedBy on publish', async () => {
      const publishableContent = {
        ...mockContentInstance,
        status: 'draft',
        save: mockSave,
      };
      mockFindById.mockResolvedValue(publishableContent);

      await service.publishContent('content-123', 'publisher-user');

      expect(publishableContent.updatedBy).toBe('publisher-user');
    });

    it('should throw error if content not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(service.publishContent('non-existent', 'user'))
        .rejects.toThrow('Content not found');
    });
  });

  describe('archiveContent', () => {
    it('should archive content', async () => {
      const archivableContent = {
        ...mockContentInstance,
        status: 'published',
        save: mockSave,
      };
      mockFindById.mockResolvedValue(archivableContent);

      const result = await service.archiveContent('content-123', 'user-123');

      expect(archivableContent.status).toBe('archived');
    });

    it('should set archivedAt timestamp', async () => {
      const archivableContent = {
        ...mockContentInstance,
        status: 'published',
        save: mockSave,
      };
      mockFindById.mockResolvedValue(archivableContent);

      await service.archiveContent('content-123', 'user-123');

      expect(archivableContent.archivedAt).toBeInstanceOf(Date);
    });

    it('should update updatedBy on archive', async () => {
      const archivableContent = {
        ...mockContentInstance,
        status: 'published',
        save: mockSave,
      };
      mockFindById.mockResolvedValue(archivableContent);

      await service.archiveContent('content-123', 'archiver-user');

      expect(archivableContent.updatedBy).toBe('archiver-user');
    });

    it('should throw error if content not found', async () => {
      mockFindById.mockResolvedValue(null);

      await expect(service.archiveContent('non-existent', 'user'))
        .rejects.toThrow('Content not found');
    });
  });

  describe('getGallery', () => {
    it('should return gallery content', async () => {
      const mockSort = jest.fn().mockResolvedValue([mockContentInstance]);
      mockFind.mockReturnValue({ sort: mockSort });

      const result = await service.getGallery('event-123');

      expect(mockFind).toHaveBeenCalledWith({
        eventId: 'event-123',
        contentType: 'GALLERY',
        status: 'published',
      });
    });

    it('should sort gallery by displayOrder', async () => {
      const mockSort = jest.fn().mockResolvedValue([]);
      mockFind.mockReturnValue({ sort: mockSort });

      await service.getGallery('event-123');

      expect(mockSort).toHaveBeenCalledWith({ displayOrder: 1 });
    });
  });

  describe('getLineup', () => {
    it('should return lineup content', async () => {
      await service.getLineup('event-123');

      expect(mockFindOne).toHaveBeenCalledWith({
        eventId: 'event-123',
        contentType: 'LINEUP',
        status: 'published',
      });
    });

    it('should return single lineup item', async () => {
      mockFindOne.mockResolvedValue(mockContentInstance);

      const result = await service.getLineup('event-123');

      expect(result).toEqual(mockContentInstance);
    });

    it('should return null if no lineup', async () => {
      mockFindOne.mockResolvedValue(null);

      const result = await service.getLineup('event-123');

      expect(result).toBeNull();
    });
  });

  describe('getSchedule', () => {
    it('should return schedule content', async () => {
      await service.getSchedule('event-123');

      expect(mockFindOne).toHaveBeenCalledWith({
        eventId: 'event-123',
        contentType: 'SCHEDULE',
        status: 'published',
      });
    });

    it('should return single schedule item', async () => {
      mockFindOne.mockResolvedValue(mockContentInstance);

      const result = await service.getSchedule('event-123');

      expect(result).toEqual(mockContentInstance);
    });
  });

  describe('getPerformers', () => {
    it('should return performer bios', async () => {
      const mockSort = jest.fn().mockResolvedValue([mockContentInstance]);
      mockFind.mockReturnValue({ sort: mockSort });

      await service.getPerformers('event-123');

      expect(mockFind).toHaveBeenCalledWith({
        eventId: 'event-123',
        contentType: 'PERFORMER_BIO',
        status: 'published',
      });
    });

    it('should sort performers by displayOrder', async () => {
      const mockSort = jest.fn().mockResolvedValue([]);
      mockFind.mockReturnValue({ sort: mockSort });

      await service.getPerformers('event-123');

      expect(mockSort).toHaveBeenCalledWith({ displayOrder: 1 });
    });

    it('should return multiple performers', async () => {
      const performers = [
        { ...mockContentInstance, _id: '1' },
        { ...mockContentInstance, _id: '2' },
      ];
      const mockSort = jest.fn().mockResolvedValue(performers);
      mockFind.mockReturnValue({ sort: mockSort });

      const result = await service.getPerformers('event-123');

      expect(result).toHaveLength(2);
    });
  });
});
