import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export function generateFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function generateStorageKey(
  fileId: string,
  filename: string,
  entityType?: string,
  entityId?: string
): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  const entityPath = entityType && entityId 
    ? `${entityType}/${entityId}`
    : 'general';
  
  // Use the fileId passed in, don't generate a new one!
  return `${entityPath}/${year}/${month}/${fileId}/${filename}`;
}

export function generateFileId(): string {
  return uuidv4();
}

export function getMimeTypeCategory(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
  return 'other';
}
