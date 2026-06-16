import { apiGet } from './http.js';

// Raw per-fill trades from the regular /trades endpoint (cursor-paginated). Unlike the
// consolidated endpoint, this returns every individual fill with settleTxHash and
// tradeStatus — the granularity wanted for a chronological transactions log.
export async function fetchRawTrades({ bettor, marketHash, startDate, endDate, pageSize = 100, paginationKey }) {
  const params = new URLSearchParams();
  params.set('bettor', bettor.trim());
  if (marketHash && marketHash.trim()) params.set('marketHashes', marketHash.trim());
  if (startDate) params.set('startDate', String(startDate));
  if (endDate) params.set('endDate', String(endDate));
  params.set('pageSize', String(pageSize));
  if (paginationKey) params.set('paginationKey', paginationKey);

  const res = await apiGet(`/trades?${params}`);
  if (!res.ok) throw new Error(`Trades API error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return { trades: json.data?.trades ?? [], nextKey: json.data?.nextKey ?? null };
}
