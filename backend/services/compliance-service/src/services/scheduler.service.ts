import { batchService } from './batch.service';
import { ofacService } from './ofac.service';

export class SchedulerService {
  private jobs: Map<string, NodeJS.Timeout> = new Map();
  
  startScheduledJobs() {
    console.log('⏰ Starting scheduled jobs...');
    
    // Daily OFAC update (3 AM)
    this.scheduleDaily('ofac-update', 3, async () => {
      console.log('Running OFAC update...');
      await batchService.processOFACUpdates();
    });
    
    // Daily compliance checks (4 AM)
    this.scheduleDaily('compliance-checks', 4, async () => {
      console.log('Running compliance checks...');
      await batchService.dailyComplianceChecks();
    });
    
    // Weekly report generation (Sunday 2 AM)
    this.scheduleWeekly('weekly-report', 0, 2, async () => {
      console.log('Generating weekly compliance report...');
      // TODO: Generate report
    });
    
    // Yearly 1099 generation (January 15)
    this.scheduleYearly('1099-generation', 1, 15, async () => {
      const previousYear = new Date().getFullYear() - 1;
      console.log(`Generating 1099s for year ${previousYear}...`);
      await batchService.generateYear1099Forms(previousYear);
    });
    
    console.log('✅ Scheduled jobs started');
  }
  
  private scheduleDaily(name: string, hour: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hour, 0, 0, 0);
    
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    
    const timeout = scheduled.getTime() - now.getTime();
    
    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next day
      this.scheduleDaily(name, hour, callback);
    }, timeout);
    
    this.jobs.set(name, job);
    console.log(`📅 Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  private scheduleWeekly(name: string, dayOfWeek: number, hour: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hour, 0, 0, 0);
    
    // Find next occurrence of the specified day
    const daysUntilTarget = (dayOfWeek - scheduled.getDay() + 7) % 7;
    scheduled.setDate(scheduled.getDate() + (daysUntilTarget || 7));
    
    const timeout = scheduled.getTime() - now.getTime();
    
    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next week
      this.scheduleWeekly(name, dayOfWeek, hour, callback);
    }, timeout);
    
    this.jobs.set(name, job);
    console.log(`📅 Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  private scheduleYearly(name: string, month: number, day: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setMonth(month - 1, day);
    scheduled.setHours(9, 0, 0, 0);
    
    if (scheduled <= now) {
      scheduled.setFullYear(scheduled.getFullYear() + 1);
    }
    
    const timeout = scheduled.getTime() - now.getTime();
    
    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next year
      this.scheduleYearly(name, month, day, callback);
    }, timeout);
    
    this.jobs.set(name, job);
    console.log(`📅 Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  stopAllJobs() {
    for (const [name, job] of this.jobs) {
      clearTimeout(job);
      console.log(`Stopped job: ${name}`);
    }
    this.jobs.clear();
  }
}

export const schedulerService = new SchedulerService();
