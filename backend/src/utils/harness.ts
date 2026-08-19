/**
 * Rejects if the wrapped promise does not resolve within the specified timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs: number, 
  errorMessage: string = "Operation timed out"
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Retries an asynchronous function with bounded attempts and exponential backoff.
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    factor?: number;
    retryCondition?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const { 
    retries = 3, 
    delay = 200, 
    factor = 2, 
    retryCondition = (err) => {
      // Do not retry client input, authorization, rate-limit, or quota errors
      const msg = String(err.message || "").toLowerCase();
      if (
        msg.includes("401") || 
        msg.includes("403") || 
        msg.includes("400") || 
        msg.includes("429") || 
        msg.includes("rate_limited") || 
        msg.includes("quota") ||
        msg.includes("resource_exhausted") ||
        msg.includes("invalid api key")
      ) {
        return false;
      }
      return true;
    }
  } = options;

  let attempt = 0;
  
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      if (attempt > retries || !retryCondition(error)) {
        throw error;
      }
      const backoff = delay * Math.pow(factor, attempt - 1);
      console.warn(`[Execution Harness] Attempt ${attempt} failed: ${error.message || error}. Retrying in ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
}
