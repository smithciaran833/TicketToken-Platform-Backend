export const mockNotification = {
  id: 'notif-123',
  venueId: 'venue-456',
  recipientId: 'user-789',
  recipient: {
    email: 'user@example.com',
    phone: '+1234567890'
  },
  channel: 'email',
  type: 'transactional',
  template: 'ticket_purchase',
  priority: 'normal',
  data: {
    eventName: 'Concert',
    ticketCount: 2
  },
  status: 'sent'
};

export const mockConsent = {
  customerId: 'user-789',
  channel: 'email',
  type: 'marketing',
  granted: true,
  source: 'signup',
  venueId: 'venue-456'
};

export const mockSendGridEvent = {
  event: 'delivered',
  email: 'user@example.com',
  timestamp: 1234567890,
  'smtp-id': 'msg-123',
  'sg_event_id': 'sg-event-123'
};

export const mockTwilioWebhook = {
  MessageStatus: 'delivered',
  MessageSid: 'SM123',
  From: '+1234567890',
  To: '+9876543210'
};

export const mockPreferences = {
  userId: 'user-789',
  email: true,
  sms: false,
  push: true,
  marketing: false,
  transactional: true
};
