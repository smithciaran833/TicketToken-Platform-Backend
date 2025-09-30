export interface Ticket {
  id: string;
  eventId: string;
  ticketTypeId: string;
  ownerId: string;
  nftTokenId?: string;
  status: 'available' | 'reserved' | 'sold' | 'transferred' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}
