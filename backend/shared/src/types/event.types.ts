export interface Event {
  id: string;
  name: string;
  venueId: string;
  organizerId: string;
  startDate: Date;
  endDate?: Date;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}
