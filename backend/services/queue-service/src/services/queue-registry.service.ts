import { MoneyQueue } from '../queues/definitions/money.queue';
import { CommunicationQueue } from '../queues/definitions/communication.queue';
import { BackgroundQueue } from '../queues/definitions/background.queue';

export class QueueRegistry {
  private static instance: QueueRegistry;
  private moneyQueue?: MoneyQueue;
  private communicationQueue?: CommunicationQueue;
  private backgroundQueue?: BackgroundQueue;

  private constructor() {}

  static getInstance(): QueueRegistry {
    if (!this.instance) {
      this.instance = new QueueRegistry();
    }
    return this.instance;
  }

  initialize(
    money: MoneyQueue,
    communication: CommunicationQueue,
    background: BackgroundQueue
  ): void {
    this.moneyQueue = money;
    this.communicationQueue = communication;
    this.backgroundQueue = background;
  }

  getMoneyQueue(): MoneyQueue {
    if (!this.moneyQueue) {
      throw new Error('Money queue not initialized');
    }
    return this.moneyQueue;
  }

  getCommunicationQueue(): CommunicationQueue {
    if (!this.communicationQueue) {
      throw new Error('Communication queue not initialized');
    }
    return this.communicationQueue;
  }

  getBackgroundQueue(): BackgroundQueue {
    if (!this.backgroundQueue) {
      throw new Error('Background queue not initialized');
    }
    return this.backgroundQueue;
  }
}
