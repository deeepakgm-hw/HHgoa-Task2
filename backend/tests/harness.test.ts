import { withTimeout, withRetries } from '../src/utils/harness';

describe('Execution Harness Utilities', () => {
  describe('withTimeout', () => {
    it('should resolve if promise completes before timeout limit', async () => {
      const p = new Promise<string>(resolve => setTimeout(() => resolve("success"), 50));
      const res = await withTimeout(p, 200);
      expect(res).toBe("success");
    });

    it('should reject with timeout error if promise exceeds limit', async () => {
      const p = new Promise<string>(resolve => setTimeout(() => resolve("slow"), 300));
      await expect(withTimeout(p, 100)).rejects.toThrow("Operation timed out");
    });
  });

  describe('withRetries', () => {
    it('should resolve immediately if target succeeds on first run', async () => {
      const fn = jest.fn().mockResolvedValue("data");
      const res = await withRetries(fn, { retries: 2, delay: 10 });
      expect(res).toBe("data");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry multiple times and resolve if a later attempt succeeds', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error("Transient Error"));
        }
        return Promise.resolve("recovered");
      });

      const res = await withRetries(fn, { retries: 3, delay: 10, factor: 1.5 });
      expect(res).toBe("recovered");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should stop retrying and fail if unauthorized errors (like 401) occur', async () => {
      const fn = jest.fn().mockRejectedValue(new Error("HTTP Error 401: Unauthorized"));
      await expect(withRetries(fn, { retries: 3, delay: 10 })).rejects.toThrow("401");
      // Should not retry authorization failures
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
