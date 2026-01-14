/**
 * Unit Tests: Order Notes Service
 * Tests note creation, search, and templates
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

import { OrderNotesService } from '../../../src/services/order-notes.service';
import { OrderNoteType } from '../../../src/types/admin.types';

describe('OrderNotesService', () => {
  let service: OrderNotesService;
  const tenantId = 'tenant-123';
  const orderId = 'order-456';
  const adminUserId = 'admin-789';

  const sampleNote = {
    id: 'note-1',
    tenant_id: tenantId,
    order_id: orderId,
    admin_user_id: adminUserId,
    note_type: OrderNoteType.GENERAL,
    content: 'Test note',
    is_internal: true,
    is_flagged: false,
    tags: ['important'],
    attachments: [],
    mentioned_users: [],
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderNotesService(mockPool as any);
  });

  describe('createNote', () => {
    it('should create note with defaults', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleNote] });

      const result = await service.createNote(tenantId, orderId, adminUserId, OrderNoteType.GENERAL, 'Test note');

      expect(result.content).toBe('Test note');
      expect(result.isInternal).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO order_notes'),
        expect.arrayContaining([tenantId, orderId, adminUserId, OrderNoteType.GENERAL, 'Test note', true, false])
      );
    });

    it('should create note with all options', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleNote, is_flagged: true }] });

      await service.createNote(tenantId, orderId, adminUserId, OrderNoteType.ISSUE_REPORTED, 'Urgent issue', {
        isInternal: false,
        isFlagged: true,
        tags: ['urgent', 'escalation'],
        attachments: [{ name: 'file.pdf' }],
        mentionedUsers: ['user-1', 'user-2'],
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([false, true, ['urgent', 'escalation']])
      );
    });
  });

  describe('updateNote', () => {
    it('should update note content', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleNote, content: 'Updated content' }] });

      const result = await service.updateNote('note-1', tenantId, { content: 'Updated content' });

      expect(result.content).toBe('Updated content');
    });

    it('should update flagged status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleNote, is_flagged: true }] });

      await service.updateNote('note-1', tenantId, { isFlagged: true });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_flagged'),
        expect.arrayContaining([true])
      );
    });

    it('should update tags', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleNote, tags: ['new-tag'] }] });

      await service.updateNote('note-1', tenantId, { tags: ['new-tag'] });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tags'),
        expect.arrayContaining([['new-tag']])
      );
    });
  });

  describe('deleteNote', () => {
    it('should delete note', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.deleteNote('note-1', tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM order_notes WHERE id = $1 AND tenant_id = $2',
        ['note-1', tenantId]
      );
    });
  });

  describe('getNote', () => {
    it('should return note by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleNote] });

      const result = await service.getNote('note-1', tenantId);

      expect(result?.id).toBe('note-1');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getNote('nonexistent', tenantId);

      expect(result).toBeNull();
    });
  });

  describe('getOrderNotes', () => {
    it('should return all notes for order', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleNote, { ...sampleNote, id: 'note-2' }] });

      const result = await service.getOrderNotes(orderId, tenantId);

      expect(result).toHaveLength(2);
    });

    it('should exclude internal notes when requested', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getOrderNotes(orderId, tenantId, false);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_internal = false'),
        expect.any(Array)
      );
    });
  });

  describe('getFlaggedNotes', () => {
    it('should return flagged notes', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleNote, is_flagged: true }] });

      const result = await service.getFlaggedNotes(tenantId);

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_flagged = true'),
        [tenantId, 50]
      );
    });

    it('should respect limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getFlaggedNotes(tenantId, 10);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [tenantId, 10]);
    });
  });

  describe('searchNotes', () => {
    it('should search notes by content', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleNote] });

      const result = await service.searchNotes(tenantId, 'test');

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%test%'])
      );
    });

    it('should filter by note type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.searchNotes(tenantId, 'test', { noteType: OrderNoteType.ISSUE_REPORTED });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('note_type'),
        expect.arrayContaining([OrderNoteType.ISSUE_REPORTED])
      );
    });

    it('should filter by tags', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.searchNotes(tenantId, 'test', { tags: ['urgent'] });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tags &&'),
        expect.arrayContaining([['urgent']])
      );
    });
  });

  describe('Note Templates', () => {
    const sampleTemplate = {
      id: 'template-1',
      tenant_id: tenantId,
      name: 'Refund Response',
      note_type: OrderNoteType.RESOLUTION,
      content_template: 'Your refund has been processed.',
      is_active: true,
      usage_count: 5,
      created_by: adminUserId,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should create template', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleTemplate] });

      const result = await service.createTemplate(
        tenantId, 'Refund Response', OrderNoteType.RESOLUTION, 'Your refund has been processed.', adminUserId
      );

      expect(result.name).toBe('Refund Response');
    });

    it('should get templates', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleTemplate] });

      const result = await service.getTemplates(tenantId);

      expect(result).toHaveLength(1);
    });

    it('should filter templates by note type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getTemplates(tenantId, OrderNoteType.ISSUE_REPORTED);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('note_type = $2'),
        [tenantId, OrderNoteType.ISSUE_REPORTED]
      );
    });

    it('should increment template usage', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.incrementTemplateUsage('template-1', tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('usage_count = usage_count + 1'),
        ['template-1', tenantId]
      );
    });
  });
});
