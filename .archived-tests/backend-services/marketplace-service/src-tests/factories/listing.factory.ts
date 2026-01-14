import { testData } from './test-data';

export interface TestListing {
  id?: string;
  ticket_id: string;
  seller_id: string;
  event_id: string;
  venue_id: string;
  price: number;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  original_face_value: number;
}

export const createTestListing = (overrides: Partial<TestListing> = {}): TestListing => ({
  id: testData.uuid(),
  ticket_id: testData.uuid(),
  seller_id: testData.uuid(),
  event_id: testData.uuid(),
  venue_id: testData.uuid(),
  price: testData.price(10, 500),
  original_face_value: testData.price(10, 200),
  status: 'active',
  ...overrides
});
