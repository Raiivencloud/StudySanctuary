/**
 * Simple frontend rate limiting utility to prevent excessive requests.
 * Limits users to 10 requests per second.
 */

const REQUEST_LIMIT = 10;
const WINDOW_MS = 1000;

let requestTimestamps: number[] = [];

export function checkRateLimit(): boolean {
  const now = Date.now();
  
  // Remove timestamps older than the window
  requestTimestamps = requestTimestamps.filter(ts => now - ts < WINDOW_MS);
  
  if (requestTimestamps.length >= REQUEST_LIMIT) {
    return false;
  }
  
  requestTimestamps.push(now);
  return true;
}

/**
 * Wraps a fetch call with rate limiting.
 */
export async function limitedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!checkRateLimit()) {
    throw new Error('Rate limit exceeded. Please wait a moment.');
  }
  return fetch(input, init);
}
