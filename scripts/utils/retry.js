/**
 * Generic retry wrapper with exponential backoff.
 *
 * @param {Function} fn - Async function to retry
 * @param {object} [options]
 * @param {number} [options.maxAttempts=3] - Maximum number of attempts
 * @param {number} [options.baseDelayMs=1000] - Base delay in milliseconds
 * @param {number} [options.maxDelayMs=10000] - Maximum delay cap
 * @param {Function} [options.shouldRetry] - Predicate that receives the error and returns true to retry
 * @param {Function} [options.onRetry] - Callback invoked before each retry with (error, attemptNumber)
 * @returns {Promise<*>} Result of the function
 */
async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = delay * (0.5 + Math.random() * 0.5);

      if (onRetry) {
        onRetry(error, attempt, jitter);
      }

      await sleep(jitter);
    }
  }

  throw lastError;
}

/**
 * Default retry predicate — retries on network errors and 429/5xx HTTP status codes.
 * @param {Error} error
 * @returns {boolean}
 */
function defaultShouldRetry(error) {
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return true;
  }

  const status = error.response?.status || error.status;
  if (status === 429 || (status >= 500 && status < 600)) {
    return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { withRetry, defaultShouldRetry };
