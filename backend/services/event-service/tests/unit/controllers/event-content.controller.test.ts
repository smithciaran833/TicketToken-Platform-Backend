/**
 * Event Content Controller Unit Tests
 * 
 * Tests the event content controller class methods for:
 * - createContent: Create content item for an event
 * - getEventContent: Get all content for an event
 * - getContent: Get specific content item
 * - updateContent: Update content item
 * - deleteContent: Delete content item
 * - publishContent: Publish content item
 * - archiveContent: Archive content item
 * - getGallery: Get gallery content
 * - getLineup: Get lineup/performers
 * - getSchedule: Get schedule content
 * - getPerformers: Get performers list
 */

import { EventContentController } from '../../../src/controllers/event-content.controller';

// Mock dependencies
jest.mock('../../../src/services/event-content.service', () => ({
  EventContentService: jest.fn().mockImplementation(() => ({
    createContent: jest.fn(),
    getEventContent: jest.fn(),
    getContent: jest.fn(),
    updateContent: jest.fn(),
    deleteContent: jest.fn(),
    publishContent: jest.fn(),
    archiveContent: jest.fn(),
    getGallery: jest.fn(),
    getLineup: jest.fn(),
    getScheduleContent: jest.fn(),
    getPerformers: jest.fn()
  }))
}));

import { EventContentService } from '../../../src/services/event-content.service';

describe('Event Content Controller', () => {
  let controller: EventContentController;
  let mockContentService: any;
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContentService = {
      createContent: jest.fn(),
      getEventContent: jest.fn(),
      getContent: jest.fn(),
      updateContent: jest.fn(),
      deleteContent: jest.fn(),
      publishContent: jest.fn(),
      archiveContent: jest.fn(),
      getGallery: jest.fn(),
      getLineup: jest.fn(),
      getScheduleContent: jest.fn(),
      getPerformers: jest.fn()
    };

    (EventContentService as jest.Mock).mockImplementation(() => mockContentService);

    controller = new EventContentController();

    mockRequest = {
      params: { eventId: 'event-123' },
      body: {},
      log: { error: jest.fn() }
    };
    (mockRequest as any).tenantId = 'tenant-123';
    (mockRequest as any).user = { id: 'user-123' };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('createContent', () => {
    it('should create content successfully', async () => {
      const contentData = {
        content_type: 'gallery',
        title: 'Event Gallery',
        content: { images: ['img1.jpg', 'img2.jpg'] }
      };
      const createdContent = { id: 'content-123', ...contentData };
      mockContentService.createContent.mockResolvedValue(createdContent);
      mockRequest.body = contentData;

      await controller.createContent(mockRequest, mockReply);

      expect(mockContentService.createContent).toHaveBeenCalledWith(
        'event-123',
        contentData,
        'tenant-123'
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: createdContent
      });
    });

    it('should handle errors', async () => {
      mockContentService.createContent.mockRejectedValue(new Error('Creation failed'));
      mockRequest.body = { content_type: 'gallery' };

      await controller.createContent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getEventContent', () => {
    it('should return all content for an event', async () => {
      const contentList = [
        { id: 'c1', content_type: 'gallery' },
        { id: 'c2', content_type: 'lineup' }
      ];
      mockContentService.getEventContent.mockResolvedValue(contentList);

      await controller.getEventContent(mockRequest, mockReply);

      expect(mockContentService.getEventContent).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: contentList
      });
    });

    it('should handle errors', async () => {
      mockContentService.getEventContent.mockRejectedValue(new Error('Fetch failed'));

      await controller.getEventContent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getContent', () => {
    it('should return specific content item', async () => {
      const content = { id: 'content-123', content_type: 'gallery' };
      mockContentService.getContent.mockResolvedValue(content);
      mockRequest.params = { eventId: 'event-123', contentId: 'content-123' };

      await controller.getContent(mockRequest, mockReply);

      expect(mockContentService.getContent).toHaveBeenCalledWith('content-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: content
      });
    });

    it('should return 404 when content not found', async () => {
      mockContentService.getContent.mockResolvedValue(null);
      mockRequest.params = { eventId: 'event-123', contentId: 'nonexistent' };

      await controller.getContent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Content not found'
      });
    });
  });

  describe('updateContent', () => {
    it('should update content successfully', async () => {
      const updates = { title: 'Updated Title' };
      const updatedContent = { id: 'content-123', title: 'Updated Title' };
      mockContentService.updateContent.mockResolvedValue(updatedContent);
      mockRequest.params = { eventId: 'event-123', contentId: 'content-123' };
      mockRequest.body = updates;

      await controller.updateContent(mockRequest, mockReply);

      expect(mockContentService.updateContent).toHaveBeenCalledWith(
        'content-123',
        updates,
        'tenant-123'
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: updatedContent
      });
    });

    it('should return 404 when content not found', async () => {
      mockContentService.updateContent.mockResolvedValue(null);
      mockRequest.params = { eventId: 'event-123', contentId: 'nonexistent' };
      mockRequest.body = { title: 'Update' };

      await controller.updateContent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteContent', () => {
    it('should delete content successfully', async () => {
      mockContentService.deleteContent.mockResolvedValue(true);
      mockRequest.params = { eventId: 'event-123', contentId: 'content-123' };

      await controller.deleteContent(mockRequest, mockReply);

      expect(mockContentService.deleteContent).toHaveBeenCalledWith('content-123', 'tenant-123');
      expect(mockReply.status).toHaveBeenCalledWith(204);
      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should return 404 when content not found', async () => {
      mockContentService.deleteContent.mockResolvedValue(false);
      mockRequest.params = { eventId: 'event-123', contentId: 'nonexistent' };

      await controller.deleteContent(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('publishContent', () => {
    it('should publish content successfully', async () => {
      const publishedContent = { id: 'content-123', status: 'published' };
      mockContentService.publishContent.mockResolvedValue(publishedContent);
      mockRequest.params = { eventId: 'event-123', contentId: 'content-123' };

      await controller.publishContent(mockRequest, mockReply);

      expect(mockContentService.publishContent).toHaveBeenCalledWith('content-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: publishedContent
      });
    });
  });

  describe('archiveContent', () => {
    it('should archive content successfully', async () => {
      const archivedContent = { id: 'content-123', status: 'archived' };
      mockContentService.archiveContent.mockResolvedValue(archivedContent);
      mockRequest.params = { eventId: 'event-123', contentId: 'content-123' };

      await controller.archiveContent(mockRequest, mockReply);

      expect(mockContentService.archiveContent).toHaveBeenCalledWith('content-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: archivedContent
      });
    });
  });

  describe('getGallery', () => {
    it('should return gallery content', async () => {
      const gallery = [{ id: 'g1', type: 'image' }, { id: 'g2', type: 'video' }];
      mockContentService.getGallery.mockResolvedValue(gallery);

      await controller.getGallery(mockRequest, mockReply);

      expect(mockContentService.getGallery).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: gallery
      });
    });
  });

  describe('getLineup', () => {
    it('should return lineup content', async () => {
      const lineup = [{ id: 'l1', artist: 'Artist 1' }];
      mockContentService.getLineup.mockResolvedValue(lineup);

      await controller.getLineup(mockRequest, mockReply);

      expect(mockContentService.getLineup).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: lineup
      });
    });
  });

  describe('getSchedule', () => {
    it('should return schedule content', async () => {
      const schedule = [{ id: 's1', time: '20:00', act: 'Main Act' }];
      mockContentService.getScheduleContent.mockResolvedValue(schedule);

      await controller.getSchedule(mockRequest, mockReply);

      expect(mockContentService.getScheduleContent).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: schedule
      });
    });
  });

  describe('getPerformers', () => {
    it('should return performers list', async () => {
      const performers = [{ id: 'p1', name: 'Performer 1' }];
      mockContentService.getPerformers.mockResolvedValue(performers);

      await controller.getPerformers(mockRequest, mockReply);

      expect(mockContentService.getPerformers).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: performers
      });
    });
  });
});
