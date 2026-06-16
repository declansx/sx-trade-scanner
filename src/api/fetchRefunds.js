import { apiGet } from './http.js';

// Fetches all capital-efficiency / refund events for a bettor as a flat list.
// Each event: { marketHash, fillOrderHash, amount, createdAt, maker }.
// These become "Refund" line items under their market group (matched by marketHash),
// and reduce the market's net wagered in the aggregate.
// `sinceUnix` (optional) bounds the fetch to recent refunds: results are newest-first, so
// once we page past that timestamp we stop. This avoids pulling the wallet's entire refund
// history when a view only cares about a recent window (the endpoint has no date param).
export async function fetchRefunds(bettor, marketHash, sinceUnix) {
  const events = [];
  let page = 0;
  const PER_PAGE = 500;

  for (;;) {
    const params = new URLSearchParams();
    params.set('bettor', bettor.trim());
    if (marketHash && marketHash.trim()) params.set('marketHash', marketHash.trim());
    params.set('sortAsc', 'false');
    params.set('page', String(page));
    params.set('perPage', String(PER_PAGE));

    const res = await apiGet(`/trades/portfolio/refunds?${params}`);
    if (!res.ok) throw new Error(`Refunds API error: ${res.status} ${res.statusText}`);
    const json = await res.json();

    const results = json.data?.results ?? [];
    let reachedOlderThanSince = false;
    for (const group of results) {
      for (const ev of group.events ?? []) {
        const t = ev.createdAt ? Math.floor(new Date(ev.createdAt).getTime() / 1000) : 0;
        if (sinceUnix && t < sinceUnix) {
          reachedOlderThanSince = true;
          continue;
        }
        events.push({
          marketHash: ev.marketHash,
          fillOrderHash: ev.fillOrderHash,
          amount: Number(ev.amount),
          amountBetTimeValue: ev.amountBetTimeValue != null ? Number(ev.amountBetTimeValue) : null,
          baseToken: ev.baseToken,
          createdAt: ev.createdAt,
          maker: ev.maker,
        });
      }
    }

    const count = json.data?.count ?? 0;
    page += 1;
    if (results.length === 0 || page * PER_PAGE >= count || page > 50) break;
    if (sinceUnix && reachedOlderThanSince) break; // paged past the window — stop
  }

  return events;
}
