const BASE = '/api';

// Shared GET with backoff for rate limits. SX limits are documented as:
//   - GET /trades/* : 200 req/min (SHARED across /trades, /trades/consolidated,
//     /trades/portfolio/refunds)
//   - other endpoints (incl. /markets/find): 500 req/min
// Over-limit returns 429 (no Retry-After header). We also retry transient 5xx, which
// the markets endpoint can throw under bursts. Backoff is exponential with jitter.
export async function apiGet(path, { retries = 4 } = {}) {
  let delay = 600;
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${BASE}${path}`);
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(delay);
      delay *= 2;
      continue;
    }
    if (res.ok) return res;
    // 429 (rate limited) and transient 5xx are retryable; 4xx (e.g. 400) are not.
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(delay + Math.floor(jitter() * 300));
      delay *= 2;
      continue;
    }
    return res; // caller decides how to handle a non-retryable non-ok response
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Small jitter so concurrent retries don't resynchronize into another burst.
function jitter() {
  // crypto-free, fine for spreading retries
  return (Date.now() % 997) / 997;
}
