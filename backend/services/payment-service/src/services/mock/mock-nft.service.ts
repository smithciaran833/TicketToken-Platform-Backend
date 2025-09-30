export class MockNFTService {
  private mintQueue: any[] = [];

  async queueMinting(ticketIds: string[], eventId: string) {
    const job = {
      id: `mint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ticketIds,
      eventId,
      status: 'queued',
      createdAt: new Date(),
      mockData: true
    };
    
    this.mintQueue.push(job);
    
    // Simulate processing after 2 seconds
    setTimeout(() => {
      const index = this.mintQueue.findIndex(j => j.id === job.id);
      if (index > -1) {
        this.mintQueue[index].status = 'completed';
        this.mintQueue[index].transactionHash = `0x${Math.random().toString(16).substr(2, 40)}`;
      }
    }, 2000);
    
    return job;
  }

  async getMintStatus(jobId: string) {
    const job = this.mintQueue.find(j => j.id === jobId);
    return job || { id: jobId, status: 'not_found' };
  }

  async estimateGasFees(ticketCount: number) {
    return {
      blockchain: 'solana',
      estimatedFee: 0.002 * ticketCount, // 0.002 SOL per ticket
      feeInUSD: 0.05 * ticketCount, // ~$0.05 per ticket
      congestionLevel: 'low',
      timestamp: new Date()
    };
  }
}
