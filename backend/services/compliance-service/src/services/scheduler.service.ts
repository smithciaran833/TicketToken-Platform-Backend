import { batchService } from './batch.service';
import { realOFACService } from './ofac-real.service';
import { logger } from '../utils/logger';

export class SchedulerService {
  private jobs: Map<string, NodeJS.Timeout> = new Map();
  
  startScheduledJobs() {
    logger.info('Starting scheduled compliance jobs...');
    
    // Daily OFAC update (3 AM)
    this.scheduleDaily('ofac-update', 3, async () => {
      logger.info('Running OFAC update...');
      await realOFACService.downloadAndUpdateOFACList();
    });
    
    // Daily compliance checks (4 AM)
    this.scheduleDaily('compliance-checks', 4, async () => {
      logger.info('Running daily compliance checks...');
      await batchService.dailyComplianceChecks("system");
    });
    
    // Weekly report generation (Sunday 2 AM)
    this.scheduleWeekly('weekly-report', 0, 2, async () => {
      logger.info('Generating weekly compliance report...');
      // TODO: Implement report generation
      logger.warn('Weekly report generation not yet implemented');
    });
    
    // Yearly 1099 generation (January 15)
    this.scheduleYearly('1099-generation', 1, 15, async () => {
      const previousYear = new Date().getFullYear() - 1;
      logger.info(`Generating 1099s for year ${previousYear}...`);
      await batchService.generateYear1099Forms(previousYear, "system");
    });
    
    logger.info('Scheduled jobs started successfully');
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
    logger.info(`Scheduled ${name} for ${scheduled.toLocaleString()}`);
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
    logger.info(`Scheduled ${name} for ${scheduled.toLocaleString()}`);
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
    logger.info(`Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  stopAllJobs() {
    for (const [name, job] of this.jobs) {
      clearTimeout(job);
      logger.info(`Stopped job: ${name}`);
    }
    this.jobs.clear();
  }
}

export const schedulerService = new SchedulerService();
