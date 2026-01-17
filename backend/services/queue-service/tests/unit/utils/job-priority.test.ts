import {
  JobPriority,
  getJobOptionsWithPriority,
  PriorityLabels,
  shouldPrioritize,
  getDelayMultiplier,
} from '../../../src/utils/job-priority';

describe('Job Priority Utils', () => {
  describe('JobPriority enum', () => {
    it('should have correct priority values', () => {
      expect(JobPriority.CRITICAL).toBe(1);
      expect(JobPriority.HIGH).toBe(3);
      expect(JobPriority.NORMAL).toBe(5);
      expect(JobPriority.LOW).toBe(7);
      expect(JobPriority.BACKGROUND).toBe(10);
    });

    it('should maintain priority order (lower number = higher priority)', () => {
      expect(JobPriority.CRITICAL).toBeLessThan(JobPriority.HIGH);
      expect(JobPriority.HIGH).toBeLessThan(JobPriority.NORMAL);
      expect(JobPriority.NORMAL).toBeLessThan(JobPriority.LOW);
      expect(JobPriority.LOW).toBeLessThan(JobPriority.BACKGROUND);
    });
  });

  describe('getJobOptionsWithPriority', () => {
    describe('critical priority jobs', () => {
      it('should return correct options for payment job', () => {
        const options = getJobOptionsWithPriority('payment');

        expect(options).toEqual({
          priority: JobPriority.CRITICAL,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        });
      });

      it('should return correct options for refund job', () => {
        const options = getJobOptionsWithPriority('refund');

        expect(options).toEqual({
          priority: JobPriority.CRITICAL,
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        });
      });
    });

    describe('high priority jobs', () => {
      it('should return correct options for mint job', () => {
        const options = getJobOptionsWithPriority('mint');

        expect(options).toEqual({
          priority: JobPriority.HIGH,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        });
      });

      it('should return correct options for transfer job', () => {
        const options = getJobOptionsWithPriority('transfer');

        expect(options).toEqual({
          priority: JobPriority.HIGH,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        });
      });
    });

    describe('normal priority jobs', () => {
      it('should return correct options for email job', () => {
        const options = getJobOptionsWithPriority('email');

        expect(options).toEqual({
          priority: JobPriority.NORMAL,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        });
      });

      it('should return correct options for webhook job', () => {
        const options = getJobOptionsWithPriority('webhook');

        expect(options).toEqual({
          priority: JobPriority.NORMAL,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        });
      });

      it('should return normal priority for unknown job types', () => {
        const options = getJobOptionsWithPriority('unknown-job-type');

        expect(options).toEqual({
          priority: JobPriority.NORMAL,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: false,
          removeOnFail: false,
        });
      });
    });

    describe('low priority jobs', () => {
      it('should return correct options for analytics job', () => {
        const options = getJobOptionsWithPriority('analytics');

        expect(options).toEqual({
          priority: JobPriority.LOW,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        });
      });

      it('should return correct options for report job', () => {
        const options = getJobOptionsWithPriority('report');

        expect(options).toEqual({
          priority: JobPriority.LOW,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        });
      });
    });

    describe('background priority jobs', () => {
      it('should return correct options for cleanup job', () => {
        const options = getJobOptionsWithPriority('cleanup');

        expect(options).toEqual({
          priority: JobPriority.BACKGROUND,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        });
      });

      it('should return correct options for maintenance job', () => {
        const options = getJobOptionsWithPriority('maintenance');

        expect(options).toEqual({
          priority: JobPriority.BACKGROUND,
          attempts: 2,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: true,
          removeOnFail: false,
        });
      });
    });

    describe('custom priority override', () => {
      it('should use custom priority when provided', () => {
        const options = getJobOptionsWithPriority('email', JobPriority.CRITICAL);

        expect(options.priority).toBe(JobPriority.CRITICAL);
        expect(options.attempts).toBe(5);
        expect(options.backoff.delay).toBe(1000);
      });

      it('should override default priority for payment job', () => {
        const options = getJobOptionsWithPriority('payment', JobPriority.LOW);

        expect(options.priority).toBe(JobPriority.LOW);
        expect(options.attempts).toBe(2);
        expect(options.removeOnComplete).toBe(true);
      });

      it('should work with all custom priority levels', () => {
        const priorities = [
          JobPriority.CRITICAL,
          JobPriority.HIGH,
          JobPriority.NORMAL,
          JobPriority.LOW,
          JobPriority.BACKGROUND,
        ];

        priorities.forEach(priority => {
          const options = getJobOptionsWithPriority('test', priority);
          expect(options.priority).toBe(priority);
        });
      });
    });

    describe('removeOnComplete behavior', () => {
      it('should remove on complete for low priority jobs', () => {
        const options = getJobOptionsWithPriority('analytics');
        expect(options.removeOnComplete).toBe(true);
      });

      it('should remove on complete for background jobs', () => {
        const options = getJobOptionsWithPriority('cleanup');
        expect(options.removeOnComplete).toBe(true);
      });

      it('should keep critical jobs on complete', () => {
        const options = getJobOptionsWithPriority('payment');
        expect(options.removeOnComplete).toBe(false);
      });

      it('should keep high priority jobs on complete', () => {
        const options = getJobOptionsWithPriority('mint');
        expect(options.removeOnComplete).toBe(false);
      });

      it('should keep normal priority jobs on complete', () => {
        const options = getJobOptionsWithPriority('email');
        expect(options.removeOnComplete).toBe(false);
      });
    });

    describe('removeOnFail behavior', () => {
      it('should keep all failed jobs regardless of priority', () => {
        const jobTypes = ['payment', 'mint', 'email', 'analytics', 'cleanup'];

        jobTypes.forEach(jobType => {
          const options = getJobOptionsWithPriority(jobType);
          expect(options.removeOnFail).toBe(false);
        });
      });
    });

    describe('attempts based on priority', () => {
      it('should give 5 attempts to critical jobs', () => {
        const options = getJobOptionsWithPriority('payment');
        expect(options.attempts).toBe(5);
      });

      it('should give 3 attempts to high priority jobs', () => {
        const options = getJobOptionsWithPriority('mint');
        expect(options.attempts).toBe(3);
      });

      it('should give 2 attempts to normal priority jobs', () => {
        const options = getJobOptionsWithPriority('email');
        expect(options.attempts).toBe(2);
      });

      it('should give 2 attempts to low priority jobs', () => {
        const options = getJobOptionsWithPriority('analytics');
        expect(options.attempts).toBe(2);
      });

      it('should give 2 attempts to background jobs', () => {
        const options = getJobOptionsWithPriority('cleanup');
        expect(options.attempts).toBe(2);
      });
    });

    describe('backoff strategy based on priority', () => {
      it('should use 1s delay for critical jobs', () => {
        const options = getJobOptionsWithPriority('payment');
        expect(options.backoff).toEqual({
          type: 'exponential',
          delay: 1000,
        });
      });

      it('should use 2s delay for high priority jobs', () => {
        const options = getJobOptionsWithPriority('mint');
        expect(options.backoff).toEqual({
          type: 'exponential',
          delay: 2000,
        });
      });

      it('should use 5s delay for normal priority jobs', () => {
        const options = getJobOptionsWithPriority('email');
        expect(options.backoff).toEqual({
          type: 'exponential',
          delay: 5000,
        });
      });

      it('should use exponential backoff for all priorities', () => {
        const jobTypes = ['payment', 'mint', 'email', 'analytics', 'cleanup'];

        jobTypes.forEach(jobType => {
          const options = getJobOptionsWithPriority(jobType);
          expect(options.backoff.type).toBe('exponential');
        });
      });
    });
  });

  describe('PriorityLabels', () => {
    it('should have labels for all priority levels', () => {
      expect(PriorityLabels[JobPriority.CRITICAL]).toBe('Critical');
      expect(PriorityLabels[JobPriority.HIGH]).toBe('High');
      expect(PriorityLabels[JobPriority.NORMAL]).toBe('Normal');
      expect(PriorityLabels[JobPriority.LOW]).toBe('Low');
      expect(PriorityLabels[JobPriority.BACKGROUND]).toBe('Background');
    });

    it('should have correct label casing', () => {
      expect(PriorityLabels[JobPriority.CRITICAL]).toMatch(/^[A-Z]/);
      expect(PriorityLabels[JobPriority.HIGH]).toMatch(/^[A-Z]/);
      expect(PriorityLabels[JobPriority.NORMAL]).toMatch(/^[A-Z]/);
      expect(PriorityLabels[JobPriority.LOW]).toMatch(/^[A-Z]/);
      expect(PriorityLabels[JobPriority.BACKGROUND]).toMatch(/^[A-Z]/);
    });

    it('should cover all enum values', () => {
      const enumValues = Object.values(JobPriority).filter(
        v => typeof v === 'number'
      ) as JobPriority[];

      enumValues.forEach(priority => {
        expect(PriorityLabels[priority]).toBeDefined();
        expect(typeof PriorityLabels[priority]).toBe('string');
      });
    });
  });

  describe('shouldPrioritize', () => {
    it('should return true when first priority is higher (lower number)', () => {
      expect(shouldPrioritize(JobPriority.CRITICAL, JobPriority.HIGH)).toBe(true);
      expect(shouldPrioritize(JobPriority.HIGH, JobPriority.NORMAL)).toBe(true);
      expect(shouldPrioritize(JobPriority.NORMAL, JobPriority.LOW)).toBe(true);
      expect(shouldPrioritize(JobPriority.LOW, JobPriority.BACKGROUND)).toBe(true);
    });

    it('should return false when first priority is lower (higher number)', () => {
      expect(shouldPrioritize(JobPriority.HIGH, JobPriority.CRITICAL)).toBe(false);
      expect(shouldPrioritize(JobPriority.NORMAL, JobPriority.HIGH)).toBe(false);
      expect(shouldPrioritize(JobPriority.LOW, JobPriority.NORMAL)).toBe(false);
      expect(shouldPrioritize(JobPriority.BACKGROUND, JobPriority.LOW)).toBe(false);
    });

    it('should return false when priorities are equal', () => {
      expect(shouldPrioritize(JobPriority.CRITICAL, JobPriority.CRITICAL)).toBe(false);
      expect(shouldPrioritize(JobPriority.HIGH, JobPriority.HIGH)).toBe(false);
      expect(shouldPrioritize(JobPriority.NORMAL, JobPriority.NORMAL)).toBe(false);
      expect(shouldPrioritize(JobPriority.LOW, JobPriority.LOW)).toBe(false);
      expect(shouldPrioritize(JobPriority.BACKGROUND, JobPriority.BACKGROUND)).toBe(false);
    });

    it('should work with numeric values', () => {
      expect(shouldPrioritize(1, 5)).toBe(true);
      expect(shouldPrioritize(5, 1)).toBe(false);
      expect(shouldPrioritize(3, 7)).toBe(true);
      expect(shouldPrioritize(10, 3)).toBe(false);
    });

    it('should handle extreme priority differences', () => {
      expect(shouldPrioritize(JobPriority.CRITICAL, JobPriority.BACKGROUND)).toBe(true);
      expect(shouldPrioritize(JobPriority.BACKGROUND, JobPriority.CRITICAL)).toBe(false);
    });
  });

  describe('getDelayMultiplier', () => {
    it('should return 1 for critical priority', () => {
      expect(getDelayMultiplier(JobPriority.CRITICAL)).toBe(1);
    });

    it('should return 1.5 for high priority', () => {
      expect(getDelayMultiplier(JobPriority.HIGH)).toBe(1.5);
    });

    it('should return 2 for normal priority', () => {
      expect(getDelayMultiplier(JobPriority.NORMAL)).toBe(2);
    });

    it('should return 3 for low priority', () => {
      expect(getDelayMultiplier(JobPriority.LOW)).toBe(3);
    });

    it('should return 5 for background priority', () => {
      expect(getDelayMultiplier(JobPriority.BACKGROUND)).toBe(5);
    });

    it('should return 2 for unknown priority values', () => {
      expect(getDelayMultiplier(99 as JobPriority)).toBe(2);
      expect(getDelayMultiplier(0 as JobPriority)).toBe(2);
      expect(getDelayMultiplier(-1 as JobPriority)).toBe(2);
    });

    it('should have increasing multipliers for decreasing priority', () => {
      const critical = getDelayMultiplier(JobPriority.CRITICAL);
      const high = getDelayMultiplier(JobPriority.HIGH);
      const normal = getDelayMultiplier(JobPriority.NORMAL);
      const low = getDelayMultiplier(JobPriority.LOW);
      const background = getDelayMultiplier(JobPriority.BACKGROUND);

      expect(critical).toBeLessThan(high);
      expect(high).toBeLessThan(normal);
      expect(normal).toBeLessThan(low);
      expect(low).toBeLessThan(background);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string job type', () => {
      const options = getJobOptionsWithPriority('');
      expect(options.priority).toBe(JobPriority.NORMAL);
    });

    it('should handle null-like job types', () => {
      const options = getJobOptionsWithPriority('null');
      expect(options.priority).toBe(JobPriority.NORMAL);
    });

    it('should handle case sensitivity in job types', () => {
      const lowerCase = getJobOptionsWithPriority('payment');
      const upperCase = getJobOptionsWithPriority('PAYMENT');
      const mixedCase = getJobOptionsWithPriority('PaYmEnT');

      expect(lowerCase.priority).toBe(JobPriority.CRITICAL);
      expect(upperCase.priority).toBe(JobPriority.NORMAL); // Different case = unknown
      expect(mixedCase.priority).toBe(JobPriority.NORMAL);
    });

    it('should handle job types with special characters', () => {
      const options1 = getJobOptionsWithPriority('payment-special');
      const options2 = getJobOptionsWithPriority('payment_special');
      const options3 = getJobOptionsWithPriority('payment special');

      expect(options1.priority).toBe(JobPriority.NORMAL);
      expect(options2.priority).toBe(JobPriority.NORMAL);
      expect(options3.priority).toBe(JobPriority.NORMAL);
    });
  });

  describe('integration scenarios', () => {
    it('should provide consistent configuration for same job type', () => {
      const options1 = getJobOptionsWithPriority('payment');
      const options2 = getJobOptionsWithPriority('payment');

      expect(options1).toEqual(options2);
    });

    it('should allow comparing job priorities', () => {
      const payment = getJobOptionsWithPriority('payment');
      const email = getJobOptionsWithPriority('email');
      const cleanup = getJobOptionsWithPriority('cleanup');

      expect(shouldPrioritize(payment.priority, email.priority)).toBe(true);
      expect(shouldPrioritize(email.priority, cleanup.priority)).toBe(true);
      expect(shouldPrioritize(payment.priority, cleanup.priority)).toBe(true);
    });

    it('should calculate effective delays with multipliers', () => {
      const baseDelay = 1000;
      
      const criticalDelay = baseDelay * getDelayMultiplier(JobPriority.CRITICAL);
      const normalDelay = baseDelay * getDelayMultiplier(JobPriority.NORMAL);
      const backgroundDelay = baseDelay * getDelayMultiplier(JobPriority.BACKGROUND);

      expect(criticalDelay).toBe(1000);
      expect(normalDelay).toBe(2000);
      expect(backgroundDelay).toBe(5000);
    });

    it('should support sorting jobs by priority', () => {
      const jobs = [
        { type: 'cleanup', priority: getJobOptionsWithPriority('cleanup').priority },
        { type: 'payment', priority: getJobOptionsWithPriority('payment').priority },
        { type: 'email', priority: getJobOptionsWithPriority('email').priority },
        { type: 'mint', priority: getJobOptionsWithPriority('mint').priority },
      ];

      const sorted = jobs.sort((a, b) => a.priority - b.priority);

      expect(sorted[0].type).toBe('payment');
      expect(sorted[1].type).toBe('mint');
      expect(sorted[2].type).toBe('email');
      expect(sorted[3].type).toBe('cleanup');
    });
  });
});
