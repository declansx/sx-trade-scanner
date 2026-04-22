const BASE = '/api';

async function fetchMarketsBatch(marketHashes) {
  const params = new URLSearchParams();
  marketHashes.forEach((h) => params.append('marketHashes', h));
  const res = await fetch(`${BASE}/markets/find?${params}`);
  if (!res.ok) throw new Error(`Markets API error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  // Expected shape: { status: 'success', data: { markets: [...] } }
  return json.data?.markets ?? json.data ?? [];
}

export async function fetchAllMarkets(marketHashes) {
  if (!marketHashes.length) return {};

  const BATCH_SIZE = 30;
  const batches = [];
  for (let i = 0; i < marketHashes.length; i += BATCH_SIZE) {
    batches.push(marketHashes.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(batches.map(fetchMarketsBatch));
  const map = {};
  results.flat().forEach((m) => {
    map[m.marketHash] = m;
  });
  return map;
}
