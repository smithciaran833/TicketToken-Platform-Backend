const axios = require('axios');

class QueueClient {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.queueServiceUrl = process.env.QUEUE_SERVICE_URL || 'http://localhost:3011';
    this.apiKey = process.env.QUEUE_API_KEY || 'internal-service-key';
  }
  
  async addJob(queue, type, data, options = {}) {
    try {
      const response = await axios.post(
        `${this.queueServiceUrl}/api/v1/queue/jobs`,
        {
          queue,
          type,
          data,
          options: {
            ...options,
            submittedBy: this.serviceName
          }
        },
        {
          headers: {
            'X-API-Key': this.apiKey,
            'X-Service-Name': this.serviceName
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error(`Failed to add job to queue:`, error.message);
      throw error;
    }
  }
  
  // Helper methods for common job types
  async sendEmail(to, subject, template, data) {
    return this.addJob('communication-queue', 'email.send', {
      to,
      subject,
      template,
      data
    });
  }
  
  async processPayment(paymentData) {
    return this.addJob('money-queue', 'payment.process', paymentData, {
      priority: 1
    });
  }
  
  async mintNFT(ticketId, walletAddress, metadata) {
    return this.addJob('money-queue', 'nft.mint', {
      ticketId,
      walletAddress,
      metadata
    });
  }
  
  async generateReport(type, parameters) {
    return this.addJob('background-queue', `report.${type}`, parameters);
  }
  
  async processRefund(paymentId, amount, reason) {
    return this.addJob('money-queue', 'payment.refund', {
      paymentId,
      amount,
      reason
    }, {
      priority: 1
    });
  }
  
  async sendWebhook(url, data, retries = 3) {
    return this.addJob('communication-queue', 'webhook.send', {
      url,
      data,
      retries
    });
  }
  
  async scheduleEventReminder(eventId, reminderTime) {
    const delay = new Date(reminderTime).getTime() - Date.now();
    return this.addJob('communication-queue', 'email.event.reminder', {
      eventId
    }, {
      delay: delay > 0 ? delay : 0
    });
  }
}

module.exports = QueueClient;
