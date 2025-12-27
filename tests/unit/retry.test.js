/**
 * Unit Tests for Retry Utility
 */

const { RetryHandler, withRetry, CircuitBreaker } = require('../../src/utils/retry');

describe('RetryHandler', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = global.testUtils.createMockLogger();
  });

  describe('calculateDelay', () => {
    it('should calculate exponential backoff delay', () => {
      const handler = new RetryHandler({
        initialDelay: 1000,
        backoffMultiplier: 2,
        jitter: false,
        logger: mockLogger
      });

      expect(handler.calculateDelay(0)).toBe(1000);
      expect(handler.calculateDelay(1)).toBe(2000);
      expect(handler.calculateDelay(2)).toBe(4000);
    });

    it('should respect maxDelay', () => {
      const handler = new RetryHandler({
        initialDelay: 1000,
        backoffMultiplier: 10,
        maxDelay: 5000,
        jitter: false,
        logger: mockLogger
      });

      expect(handler.calculateDelay(2)).toBe(5000);
    });

    it('should add jitter when enabled', () => {
      const handler = new RetryHandler({
        initialDelay: 1000,
        jitter: true,
        logger: mockLogger
      });

      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(handler.calculateDelay(0));
      }

      // With jitter, we shouldn't get the exact same delay
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });
  });

  describe('isRetryable', () => {
    it('should identify retryable errors', () => {
      const handler = new RetryHandler({ logger: mockLogger });

      expect(handler.isRetryable(new Error('ECONNRESET'))).toBe(true);
      expect(handler.isRetryable(new Error('ETIMEDOUT'))).toBe(true);
      expect(handler.isRetryable(new Error('net::ERR_FAILED'))).toBe(true);
      expect(handler.isRetryable(new Error('Navigation timeout'))).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const handler = new RetryHandler({ logger: mockLogger });

      expect(handler.isRetryable(new Error('CAPTCHA_DETECTED'))).toBe(false);
      expect(handler.isRetryable(new Error('Invalid argument'))).toBe(false);
    });

    it('should handle null/undefined errors', () => {
      const handler = new RetryHandler({ logger: mockLogger });

      expect(handler.isRetryable(null)).toBe(false);
      expect(handler.isRetryable(undefined)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should succeed on first attempt', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelay: 10,
        logger: mockLogger
      });

      const result = await handler.execute(async () => 'success', 'test');

      expect(result).toBe('success');
    });

    it('should retry on retryable error and succeed', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelay: 10,
        logger: mockLogger
      });

      let attempts = 0;
      const result = await handler.execute(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('ECONNRESET');
        }
        return 'success';
      }, 'test');

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should throw after max retries', async () => {
      const handler = new RetryHandler({
        maxRetries: 2,
        initialDelay: 10,
        logger: mockLogger
      });

      await expect(
        handler.execute(async () => {
          throw new Error('ECONNRESET');
        }, 'test')
      ).rejects.toThrow('ECONNRESET');
    });

    it('should not retry non-retryable errors', async () => {
      const handler = new RetryHandler({
        maxRetries: 3,
        initialDelay: 10,
        logger: mockLogger
      });

      let attempts = 0;
      await expect(
        handler.execute(async () => {
          attempts++;
          throw new Error('Non-retryable error');
        }, 'test')
      ).rejects.toThrow('Non-retryable error');

      expect(attempts).toBe(1);
    });
  });
});

describe('withRetry', () => {
  it('should be a convenience wrapper for RetryHandler', async () => {
    const result = await withRetry(
      async () => 'success',
      { maxRetries: 1, initialDelay: 10, context: 'test' }
    );

    expect(result).toBe('success');
  });
});

describe('CircuitBreaker', () => {
  let mockLogger;

  beforeEach(() => {
    mockLogger = global.testUtils.createMockLogger();
  });

  it('should start in CLOSED state', () => {
    const breaker = new CircuitBreaker({ logger: mockLogger });
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should execute successfully in CLOSED state', async () => {
    const breaker = new CircuitBreaker({ logger: mockLogger });

    const result = await breaker.execute(async () => 'success', 'test');

    expect(result).toBe('success');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should open after reaching failure threshold', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      logger: mockLogger
    });

    for (let i = 0; i < 3; i++) {
      await expect(
        breaker.execute(async () => { throw new Error('fail'); }, 'test')
      ).rejects.toThrow('fail');
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('should reject immediately when OPEN', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      timeout: 60000, // Long timeout so it stays open
      logger: mockLogger
    });

    // Trigger open state
    await expect(
      breaker.execute(async () => { throw new Error('fail'); }, 'test')
    ).rejects.toThrow('fail');

    // Should reject immediately
    await expect(
      breaker.execute(async () => 'success', 'test')
    ).rejects.toThrow('Circuit breaker OPEN');
  });

  it('should reset to CLOSED after reset()', () => {
    const breaker = new CircuitBreaker({ logger: mockLogger });
    breaker.state = 'OPEN';
    breaker.failures = 5;

    breaker.reset();

    expect(breaker.getState()).toBe('CLOSED');
    expect(breaker.failures).toBe(0);
  });
});
