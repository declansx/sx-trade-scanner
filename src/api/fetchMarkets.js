import { apiGet } from './http.js';

// /markets/find accepts at most 30 marketHashes per request (>30 → 400).
const BATCH_SIZE = 25;

async function fetchMarketsBatch(marketHashes) {
  const params = new URLSearchParams();
  marketHashes.forEach((h) => params.append('marketHashes', h));
  // Resilient: a single failed batch (e.g. a transient 500 / rate-limit after retries)
  // must not abort the whole search — those markets just render without enriched names.
  try {
    const res = await apiGet(`/markets/find?${params}`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.data?.markets ?? json.data ?? [];
  } catch {
    return [];
  }
}

export async function fetchAllMarkets(marketHashes) {
  if (!marketHashes.length) return {};

  const CONCURRENCY = 4; // cap parallel requests; well within the 500 req/min markets budget

  const batches = [];
  for (let i = 0; i < marketHashes.length; i += BATCH_SIZE) {
    batches.push(marketHashes.slice(i, i + BATCH_SIZE));
  }

  const map = {};
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY);
    const results = await Promise.all(group.map(fetchMarketsBatch));
    results.flat().forEach((m) => {
      if (m?.marketHash) map[m.marketHash] = m;
    });
  }
  return map;
}
