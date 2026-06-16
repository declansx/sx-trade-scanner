import { apiGet } from './http.js';

// Default page size for the consolidated endpoint (max 1000).
const DEFAULT_PER_PAGE = 100;

// Normalize a consolidated-trade record into the shape the rest of the app expects.
//
// We use /trades/consolidated (not /trades) because only the consolidated endpoint
// exposes a correct, precise realized return:
//   - `netReturn` here is the REALIZED return (0 on a loss, full payout on a win,
//      stake back on a push) and already includes capital-efficiency refunds.
//   - the plain /trades endpoint's `netReturn` is the POTENTIAL payout (always > 0)
//      and its `settleNetReturnValue` is integer-rounded — both unusable for P&L.
//
// Consolidated merges multi-order fills into one entry per bet, which is also the
// granularity we want to display. Field differences from /trades are mapped here so
// downstream code (enrichment, TradeRow, tradeHelpers) is unchanged.
function normalizeConsolidatedTrade(t) {
  const totalStake = Number(t.totalStake ?? 0);
  return {
    ...t,
    // stake stored as raw 6-decimal units so formatStake()/calculateReturn() (which
    // divide by 1e6) keep working unchanged.
    stake: Math.round(totalStake * 1e6),
    odds: t.weightedAverageOdds,
    // consolidated reports the chosen side as bettingOutcome (1 | 2); the app keys off
    // the boolean bettingOutcomeOne.
    bettingOutcomeOne: t.bettingOutcome === 1,
    // netReturn / settleNetReturnValue / totalReturn / outcome / betTime / marketHash /
    // maker / settled / fillHash / fillOrderHash / sportXeventId all pass through as-is.
  };
}

// Quarter-line (Asian .25) bets are recorded as a synthetic PARENT plus two leg trades
// on adjacent whole/half lines. The consolidated endpoint returns all three; per SX docs
// you must "sum parent consolidated trades only — never both parents and legs", otherwise
// quarter-line bets are double/triple-counted.
//
// There is no parent->leg id in the response, but a parent and its two legs always share
// (sportXeventId, bettingOutcome, betTime) and the parent's stake equals the sum of the
// legs. We attach the legs to their parent as `quarterLegs` (for the expandable detail
// row) and drop the legs from the top-level list so each row is exactly one bet.
function groupQuarterLines(trades) {
  const key = (t) => `${t.sportXeventId}|${t.bettingOutcome}|${t.betTime}`;
  const parents = new Map();
  for (const t of trades) {
    if (t.isQuarterLineParent) {
      t.quarterLegs = [];
      parents.set(key(t), t);
    }
  }
  for (const t of trades) {
    if (t.isQuarterLineLeg) parents.get(key(t))?.quarterLegs.push(t);
  }
  // Keep parents + ordinary trades; legs live inside their parent's `quarterLegs`.
  return trades.filter((t) => !t.isQuarterLineLeg);
}

// Look up settlement tx hashes for a single market (the consolidated endpoint doesn't
// expose settleTxHash; the regular /trades endpoint does). Returns fillOrderHash ->
// settleTxHash. Used lazily when a market row is expanded, to build "payout" links.
export async function fetchMarketSettleTxs(bettor, marketHash) {
  const params = new URLSearchParams();
  params.set('bettor', bettor.trim());
  params.set('marketHashes', marketHash);
  params.set('pageSize', '100');
  const res = await apiGet(`/trades?${params}`);
  if (!res.ok) return {};
  const json = await res.json();
  const map = {};
  for (const t of json.data?.trades ?? []) {
    if (t.fillOrderHash && t.settleTxHash) map[t.fillOrderHash] = t.settleTxHash;
  }
  return map;
}

// Fetch one page of consolidated trades for a given settled state.
async function fetchConsolidatedPage(settledBool, page, perPage, common, sortBy, sortAsc) {
  const params = new URLSearchParams(common);
  // The consolidated endpoint REQUIRES settled to be a boolean and 400s otherwise,
  // along with sortAsc/page/perPage.
  params.set('settled', String(settledBool));
  params.set('sortAsc', String(!!sortAsc));
  if (sortBy) params.set('sortBy', sortBy);
  params.set('page', String(page));
  params.set('perPage', String(perPage));

  const res = await apiGet(`/trades/consolidated?${params}`);
  if (!res.ok) throw new Error(`Trades API error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return { rows: json.data?.trades ?? [], count: json.data?.count ?? 0 };
}

export async function fetchTrades({
  bettor,
  settled,
  pageSize,
  baseToken,
  paginationKey,
  startDate,
  endDate,
  maker,
  tradeStatus,
  sortBy,
  sortAsc = false,
  sportXeventId,
  marketHash,
}) {
  const perPage = pageSize || DEFAULT_PER_PAGE;
  // The app drives pagination through an opaque `paginationKey`; for the consolidated
  // endpoint that key is just the next page index (0-based). This keeps App.jsx's
  // cursor-style loop working without changes.
  const page = paginationKey ? Number(paginationKey) : 0;

  // Params common to every request (everything except settled/sortAsc/sortBy/page/perPage).
  const common = new URLSearchParams();
  common.set('bettor', bettor.trim());
  if (baseToken && baseToken.trim()) common.set('baseToken', baseToken.trim());
  if (startDate) common.set('startDate', String(startDate));
  if (endDate) common.set('endDate', String(endDate));
  if (maker === 'maker') common.set('maker', 'true');
  if (maker === 'taker') common.set('maker', 'false');
  if (tradeStatus === 'SUCCESS') common.set('tradeStatus', 'SUCCESS');
  if (tradeStatus === 'FAILED') common.set('tradeStatus', 'FAILED');
  // Server-side scoping (both verified honored). sportXeventId = one game (all its markets);
  // marketHash (SINGULAR — the plural is the raw /trades param) = one specific market/line.
  if (sportXeventId && String(sportXeventId).trim()) common.set('sportXeventId', String(sportXeventId).trim());
  if (marketHash && String(marketHash).trim()) common.set('marketHash', String(marketHash).trim());

  // The consolidated endpoint can only return ONE settled state per call. For "All"
  // (neither 'settled' nor 'unsettled') we fetch both states for this page and merge —
  // the endpoint has no combined mode.
  const states =
    settled === 'settled' ? [true] : settled === 'unsettled' ? [false] : [true, false];

  const pages = await Promise.all(
    states.map((s) => fetchConsolidatedPage(s, page, perPage, common, sortBy, sortAsc))
  );

  const rawTrades = pages.flatMap((p) => p.rows).map(normalizeConsolidatedTrade);
  // For the default bet-time ordering, keep newest-first so a merged settled+unsettled page
  // is ordered sensibly (and so PortfolioView's lookback stop works). For an explicit
  // server sortBy, preserve the server's order — re-sorting by betTime would discard it.
  if (!sortBy || sortBy === 'betTime') {
    rawTrades.sort((a, b) => (sortAsc ? 1 : -1) * ((a.betTime ?? 0) - (b.betTime ?? 0)));
  }
  const trades = groupQuarterLines(rawTrades);

  // More pages remain if ANY queried state still has rows beyond this page.
  const hasMore = pages.some((p) => (page + 1) * perPage < p.count);
  const nextKey = hasMore ? String(page + 1) : null;

  return { trades, nextKey };
}
