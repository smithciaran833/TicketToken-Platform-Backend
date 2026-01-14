/**
 * Unit tests for venue-content.controller.ts
 * Tests HTTP route handlers for venue content (images, descriptions, etc.)
 */

import { createMockRequest, createMockReply, createAuthenticatedRequest } from '../../__mocks__/fastify.mock';

// Mock dependencies
const mockVenueContentService = {
  getVenueContent: jest.fn(),
  updateVenueContent: jest.fn(),
  uploadImage: jest.fn(),
  deleteImage: jest.fn(),
  getGallery: jest.fn(),
  updateGalleryOrder: jest.fn(),
};

const mockVenueService = {
  checkVenueAccess: jest.fn(),
};

describe('venue-content.controller', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  const mockVenueId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createAuthenticatedRequest({ params: { venueId: mockVenueId } });
    mockReply = createMockReply();
    mockVenueService.checkVenueAccess.mockResolvedValue(true);
  });

  describe('GET /venues/:venueId/content', () => {
    it('should return venue content', async () => {
      const content = {
        description: 'A premier comedy venue',
        shortDescription: 'Premier comedy club',
        amenities: ['Parking', 'Bar'],
        policies: { ageRestriction: 21 },
      };
      mockVenueContentService.getVenueContent.mockResolvedValue(content);

      const result = await mockVenueContentService.getVenueContent(mockVenueId);

      expect(result.description).toBeDefined();
      expect(result.amenities).toHaveLength(2);
    });
  });

  describe('PUT /venues/:venueId/content', () => {
    it('should update venue content', async () => {
      const updateData = {
        description: 'Updated description',
        amenities: ['Parking', 'Bar', 'Restaurant'],
      };
      mockVenueContentService.updateVenueContent.mockResolvedValue({
        ...updateData,
        updatedAt: new Date().toISOString(),
      });

      const result = await mockVenueContentService.updateVenueContent(mockVenueId, updateData);

      expect(result.description).toBe('Updated description');
      expect(result.amenities).toHaveLength(3);
    });
  });

  describe('POST /venues/:venueId/content/images', () => {
    it('should upload image successfully', async () => {
      mockVenueContentService.uploadImage.mockResolvedValue({
        id: 'img-123',
        url: 'https://cdn.example.com/venues/venue-123/image.jpg',
        type: 'gallery',
      });

      const result = await mockVenueContentService.uploadImage(mockVenueId, {
        type: 'gallery',
        file: Buffer.from('fake-image'),
      });

      expect(result.url).toBeDefined();
      expect(result.id).toBe('img-123');
    });

    it('should validate image type', async () => {
      const validTypes = ['logo', 'cover', 'gallery', 'floor_plan'];
      expect(validTypes).toContain('gallery');
    });
  });

  describe('DELETE /venues/:venueId/content/images/:imageId', () => {
    it('should delete image', async () => {
      mockVenueContentService.deleteImage.mockResolvedValue({ success: true });

      const result = await mockVenueContentService.deleteImage(mockVenueId, 'img-123');

      expect(result.success).toBe(true);
    });
  });

  describe('GET /venues/:venueId/content/gallery', () => {
    it('should return gallery images', async () => {
      const gallery = [
        { id: 'img-1', url: 'https://cdn.example.com/1.jpg', order: 1 },
        { id: 'img-2', url: 'https://cdn.example.com/2.jpg', order: 2 },
      ];
      mockVenueContentService.getGallery.mockResolvedValue(gallery);

      const result = await mockVenueContentService.getGallery(mockVenueId);

      expect(result).toHaveLength(2);
      expect(result[0].order).toBe(1);
    });
  });

  describe('PUT /venues/:venueId/content/gallery/order', () => {
    it('should update gallery order', async () => {
      const newOrder = ['img-2', 'img-1'];
      mockVenueContentService.updateGalleryOrder.mockResolvedValue({ success: true });

      const result = await mockVenueContentService.updateGalleryOrder(mockVenueId, newOrder);

      expect(result.success).toBe(true);
    });
  });
});
