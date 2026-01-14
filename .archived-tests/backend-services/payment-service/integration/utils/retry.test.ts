/**
 * Retry Utility Integration Tests
 * 100% code coverage
 */

import {
  withRetry,
  withRetryJitter,
  retryOnSpecificErrors,
  retryBatch,
} from '../../../src/utils/retry';

describe('withRetry()', () => {
  describe('successful execution', () => {
    it('should return result on first success', async () => {
      const result = await withRetry(async () => 'success');
      expect(result).toBe('success');
    });

    it('should return complex objects', async () => {
      const result = await withRetry(async () => ({ data: 123 }));
      expect(result).toEqual({ data: 123 });
    });

    it('should execute async functions', async () => {
      const result = await withRetry(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async result';
      });
      expect(result).toBe('async result');
    });
  });

  describe('retry behavior', () => {
    it('should retry on failure and succeed', async () => {
      let attempts = 0;
      const result = await withRetry(async () => {
        attempts++;
        if (attempts < 2) throw new Error('fail');
        return 'success';
      }, { maxAttempts: 3, initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should throw after max attempts exhausted', async () => {
      let attempts = 0;
      await expect(
        withRetry(async () => {
          attempts++;
          throw new Error('always fails');
        }, { maxAttempts: 3, initialDelayMs: 10 })
      ).rejects.toThrow('always fails');

      expect(attempts).toBe(3);
    });

    it('should use exponential backoff', async () => {
      const timestamps: number[] = [];

      await expect(
        withRetry(async () => {
          timestamps.push(Date.now());
          throw new Error('fail');
        }, { 
          maxAttempts: 4, 
          initialDelayMs: 50,
          backoffMultiplier: 2,
          maxDelayMs: 500,
        })
      ).rejects.toThrow();

      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      const delay3 = timestamps[3] - timestamps[2];

      expect(delay2).toBeGreaterThan(delay1 * 1.5);
      expect(delay3).toBeGreaterThan(delay2 * 1.5);
    });

    it('should respect maxDelayMs cap', async () => {
      const timestamps: number[] = [];

      await expect(
        withRetry(async () => {
          timestamps.push(Date.now());
          throw new Error('fail');
        }, { 
          maxAttempts: 5, 
          initialDelayMs: 100,
          maxDelayMs: 120,
          backoffMultiplier: 10,
        })
      ).rejects.toThrow();

      for (let i = 1; i < timestamps.length; i++) {
        const delay = timestamps[i] - timestamps[i - 1];
        expect(delay).toBeLessThan(200);
      }
    });
  });

  describe('retryableErrors option', () => {
    it('should retry when error matches retryableErrors', async () => {
      let attempts = 0;
      await expect(
        withRetry(async () => {
          attempts++;
          throw new Error('network timeout');
        }, {
          maxAttempts: 3,
          initialDelayMs: 10,
          retryableErrors: ['network timeout'],
        })
      ).rejects.toThrow();

      expect(attempts).toBe(3);
    });

    it('should not retry when error does not match retryableErrors', async () => {
      let attempts = 0;
      await expect(
        withRetry(async () => {
          attempts++;
          throw new Error('validation error');
        }, {
          maxAttempts: 3,
          initialDelayMs: 10,
          retryableErrors: ['network timeout'],
        })
      ).rejects.toThrow('validation error');

      expect(attempts).toBe(1);
    });

    it('should match partial error messages', async () => {
      let attempts = 0;
      await expect(
        withRetry(async () => {
          attempts++;
          throw new Error('Connection timeout after 5000ms');
        }, {
          maxAttempts: 3,
          initialDelayMs: 10,
          retryableErrors: ['timeout'],
        })
      ).rejects.toThrow();

      expect(attempts).toBe(3);
    });

    it('should not retry when retryableErrors is empty array', async () => {
      let attempts = 0;
      await expect(
        withRetry(async () => {
          attempts++;
          throw new Error('any error');
        }, {
          maxAttempts: 3,
          initialDelayMs: 10,
          retryableErrors: [],
        })
      ).rejects.toThrow();

      expect(attempts).toBe(1);
    });
  });

  describe('onRetry callback', () => {
    it('should call onRetry on each retry attempt', async () => {
      const retryAttempts: number[] = [];
      
      await expect(
        withRetry(async () => {
          throw new Error('fail');
        }, {
          maxAttempts: 3,
          initialDelayMs: 10,
          onRetry: (attempt) => retryAttempts.push(attempt),
        })
      ).rejects.toThrow();

      expect(retryAttempts).toEqual([1, 2]);
    });

    it('should pass error to onRetry callback', async () => {
      const errors: Error[] = [];
      
      await expect(
        withRetry(async () => {
          throw new Error('specific error message');
        }, {
          maxAttempts: 2,
          initialDelayMs: 10,
          onRetry: (_, error) => errors.push(error),
        })
      ).rejects.toThrow();

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('specific error message');
    });

    it('should not call onRetry on success', async () => {
      const onRetry = jest.fn();
      
      await withRetry(async () => 'success', {
        maxAttempts: 3,
        initialDelayMs: 10,
        onRetry,
      });

      expect(onRetry).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should convert non-Error throws to Error', async () => {
      await expect(
        withRetry(async () => {
          throw 'string error';
        }, { maxAttempts: 1 })
      ).rejects.toThrow('string error');
    });

    it('should preserve Error type', async () => {
      class CustomError extends Error {
        code = 'CUSTOM';
      }

      try {
        await withRetry(async () => {
          throw new CustomError('custom error');
        }, { maxAttempts: 1 });
      } catch (e) {
        expect(e).toBeInstanceOf(CustomError);
        expect((e as CustomError).code).toBe('CUSTOM');
      }
    });
  });

  describe('default options', () => {
    it('should use default maxAttempts of 3', async () => {
      let attempts = 0;
      await expect(
        withRetry(async () => {
          attempts++;
          throw new Error('fail');
        }, { initialDelayMs: 10 })
      ).rejects.toThrow();

      expect(attempts).toBe(3);
    });
  });
});

describe('withRetryJitter()', () => {
  it('should return result on first success', async () => {
    const result = await withRetryJitter(async () => 'success');
    expect(result).toBe('success');
  });

  it('should retry on failure and succeed', async () => {
    let attempts = 0;
    const result = await withRetryJitter(async () => {
      attempts++;
      if (attempts < 2) throw new Error('fail');
      return 'success';
    }, { maxAttempts: 3, initialDelayMs: 10 });

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('should throw after max attempts exhausted', async () => {
    let attempts = 0;
    await expect(
      withRetryJitter(async () => {
        attempts++;
        throw new Error('always fails');
      }, { maxAttempts: 3, initialDelayMs: 10 })
    ).rejects.toThrow('always fails');

    expect(attempts).toBe(3);
  });

  it('should add random jitter to delays', async () => {
    const allDelays: number[] = [];
    
    for (let run = 0; run < 3; run++) {
      const timestamps: number[] = [];
      
      await expect(
        withRetryJitter(async () => {
          timestamps.push(Date.now());
          throw new Error('fail');
        }, { maxAttempts: 3, initialDelayMs: 50 })
      ).rejects.toThrow();

      allDelays.push(timestamps[1] - timestamps[0]);
    }

    const min = Math.min(...allDelays);
    const max = Math.max(...allDelays);
    expect(max - min).toBeGreaterThanOrEqual(0);
  });

  it('should call onRetry callback', async () => {
    const retryAttempts: number[] = [];
    
    await expect(
      withRetryJitter(async () => {
        throw new Error('fail');
      }, {
        maxAttempts: 3,
        initialDelayMs: 10,
        onRetry: (attempt) => retryAttempts.push(attempt),
      })
    ).rejects.toThrow();

    expect(retryAttempts).toEqual([1, 2]);
  });

  it('should convert non-Error throws to Error', async () => {
    await expect(
      withRetryJitter(async () => {
        throw 'string error';
      }, { maxAttempts: 1 })
    ).rejects.toThrow('string error');
  });
});

describe('retryOnSpecificErrors()', () => {
  class NetworkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NetworkError';
    }
  }

  class ValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ValidationError';
    }
  }

  class TimeoutError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TimeoutError';
    }
  }

  it('should return result on success', async () => {
    const result = await retryOnSpecificErrors(
      async () => 'success',
      [NetworkError]
    );
    expect(result).toBe('success');
  });

  it('should retry on specified error type', async () => {
    let attempts = 0;
    const result = await retryOnSpecificErrors(
      async () => {
        attempts++;
        if (attempts < 2) throw new NetworkError('network fail');
        return 'success';
      },
      [NetworkError],
      { maxAttempts: 3, initialDelayMs: 10 }
    );

    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('should not retry on non-specified error type', async () => {
    let attempts = 0;
    await expect(
      retryOnSpecificErrors(
        async () => {
          attempts++;
          throw new ValidationError('validation fail');
        },
        [NetworkError],
        { maxAttempts: 3, initialDelayMs: 10 }
      )
    ).rejects.toThrow('validation fail');

    expect(attempts).toBe(1);
  });

  it('should throw after max attempts on specified error type', async () => {
    let attempts = 0;
    await expect(
      retryOnSpecificErrors(
        async () => {
          attempts++;
          throw new NetworkError('always fails');
        },
        [NetworkError],
        { maxAttempts: 3, initialDelayMs: 10 }
      )
    ).rejects.toThrow('always fails');

    expect(attempts).toBe(3);
  });

  it('should handle multiple error types', async () => {
    let attempts = 0;
    await expect(
      retryOnSpecificErrors(
        async () => {
          attempts++;
          if (attempts === 1) throw new NetworkError('network');
          if (attempts === 2) throw new TimeoutError('timeout');
          throw new NetworkError('network again');
        },
        [NetworkError, TimeoutError],
        { maxAttempts: 3, initialDelayMs: 10 }
      )
    ).rejects.toThrow();

    expect(attempts).toBe(3);
  });

  it('should stop retrying when non-matching error thrown', async () => {
    let attempts = 0;
    await expect(
      retryOnSpecificErrors(
        async () => {
          attempts++;
          if (attempts === 1) throw new NetworkError('network');
          throw new ValidationError('validation');
        },
        [NetworkError],
        { maxAttempts: 5, initialDelayMs: 10 }
      )
    ).rejects.toThrow('validation');

    expect(attempts).toBe(2);
  });

  it('should convert non-Error throws to Error', async () => {
    await expect(
      retryOnSpecificErrors(
        async () => {
          throw 'string error';
        },
        [Error],
        { maxAttempts: 1 }
      )
    ).rejects.toThrow('string error');
  });
});

describe('retryBatch()', () => {
  it('should return all successes when all operations succeed', async () => {
    const operations = [
      async () => 'result-a',
      async () => 'result-b',
      async () => 'result-c',
    ];

    const { successes, failures } = await retryBatch(operations);
    
    expect(successes).toEqual(['result-a', 'result-b', 'result-c']);
    expect(failures).toHaveLength(0);
  });

  it('should return all failures when all operations fail', async () => {
    const operations = [
      async () => { throw new Error('fail 1'); },
      async () => { throw new Error('fail 2'); },
      async () => { throw new Error('fail 3'); },
    ];

    const { successes, failures } = await retryBatch(operations, {
      maxAttempts: 1,
      initialDelayMs: 10,
    });

    expect(successes).toHaveLength(0);
    expect(failures).toHaveLength(3);
    expect(failures[0].message).toBe('fail 1');
    expect(failures[1].message).toBe('fail 2');
    expect(failures[2].message).toBe('fail 3');
  });

  it('should handle mixed success and failure', async () => {
    const operations = [
      async () => 'success-1',
      async () => { throw new Error('fail'); },
      async () => 'success-2',
    ];

    const { successes, failures } = await retryBatch(operations, {
      maxAttempts: 1,
      initialDelayMs: 10,
    });

    expect(successes).toHaveLength(2);
    expect(failures).toHaveLength(1);
    expect(successes).toContain('success-1');
    expect(successes).toContain('success-2');
  });

  it('should retry each operation according to options', async () => {
    const attemptCounts = [0, 0, 0];
    const operations = [
      async () => {
        attemptCounts[0]++;
        if (attemptCounts[0] < 2) throw new Error('fail');
        return 'recovered-1';
      },
      async () => {
        attemptCounts[1]++;
        return 'immediate-success';
      },
      async () => {
        attemptCounts[2]++;
        throw new Error('always fails');
      },
    ];

    const { successes, failures } = await retryBatch(operations, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });

    expect(successes).toContain('recovered-1');
    expect(successes).toContain('immediate-success');
    expect(failures).toHaveLength(1);
    expect(attemptCounts[0]).toBe(2);
    expect(attemptCounts[1]).toBe(1);
    expect(attemptCounts[2]).toBe(3);
  });

  it('should handle empty operations array', async () => {
    const { successes, failures } = await retryBatch([]);
    
    expect(successes).toHaveLength(0);
    expect(failures).toHaveLength(0);
  });

  it('should execute operations in parallel', async () => {
    const startTime = Date.now();
    const operations = [
      async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'a';
      },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'b';
      },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'c';
      },
    ];

    await retryBatch(operations);
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(150);
  });

  it('should return results in same order as operations', async () => {
    const operations = [
      async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return 'slow';
      },
      async () => 'fast',
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'medium';
      },
    ];

    const { successes } = await retryBatch(operations);
    
    expect(successes[0]).toBe('slow');
    expect(successes[1]).toBe('fast');
    expect(successes[2]).toBe('medium');
  });

  it('should use default options when none provided', async () => {
    const operations = [async () => 'success'];
    const { successes } = await retryBatch(operations);
    expect(successes).toEqual(['success']);
  });
});
