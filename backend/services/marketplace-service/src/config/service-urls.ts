// Additional service URLs that were missing
export const additionalServiceUrls = {
  blockchainServiceUrl: process.env.BLOCKCHAIN_SERVICE_URL || 'http://blockchain-service:3010',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
};
