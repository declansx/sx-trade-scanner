import { useState, useRef, useCallback, useMemo } from 'react';
import SearchForm from './components/SearchForm.jsx';
import InfoCallout from './components/InfoCallout.jsx';
import TradesTable from './components/TradesTable.jsx';
import LoadMoreButton from './components/LoadMoreButton.jsx';
import { fetchTrades } from './api/fetchTrades.js';
import { fetchRefunds } from './api/fetchRefunds.js';
import { fetchAllMarkets } from './api/fetchMarkets.js';
import { formatMatchup } from './utils/tradeHelpers.js';
import { buildMarketGroups } from './utils/groupTrades.js';

// Consistent league label for both building the dropdown and filtering
function tradeLeague(t) {
  return t.market?.leagueLabel ?? (t.parlayLegs?.length ? 'Parlay' : '');
}

// De-dupe by fillHash — pages (and a merged settled+unsettled fetch) can overlap.
function dedupeTrades(list) {
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const k = t.fillHash ?? `${t.marketHash}-${t.betTime}-${t.bettingOutcome}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

// Maps the server `sortBy` to the market-group aggregate to order the displayed rows by.
const GROUP_SORT_VALUE = {
  gameTime: (g) => g.gameTime ?? g.betTime ?? 0,
  betTime: (g) => g.betTime ?? 0,
  settleNetReturnValue: (g) => g.profit ?? 0,
  totalStake: (g) => g.risked ?? 0,
  weightedAverageOdds: (g) => Number(g.oddsRaw) || 0,
};

export default function PortfolioView() {
  const [trades, setTrades] = useState([]);
  const [nextKey, setNextKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [leagueFilter, setLeagueFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [activeSort, setActiveSort] = useState({ by: 'gameTime', asc: false });

  const marketCache = useRef({});
  const refundEvents = useRef([]);
  const currentSearch = useRef({ address: '', filters: {} });

  const loadTrades = useCallback(async (address, filters, cursorKey, append) => {
    setLoading(true);
    setLoadingStatus('');
    setError(null);

    const AUTO_PAGE_CAP = 20;
    const INITIAL_BATCH = 3; // pages to auto-load before Load More, when not time-browsing

    // How far the initial load auto-pages depends on the query shape:
    //  • Scoped to one game/market (sportXeventId/marketHash): tiny set → page to exhaustion.
    //  • Default bet-time browsing: stop after ~30 days, keep cursor for Load More (the
    //    endpoint ignores date params, so this depth heuristic is what bounds the fetch).
    //  • Explicit non-time sort (profit/stake/odds): server returns the extremes first, so a
    //    small initial batch surfaces the top markets; Load More pages further.
    const serverScoped = !!(filters.marketHash || filters.sportXeventId);

    // Decouple DISPLAY sort from FETCH order. Time sorts (game/bet time) still fetch
    // newest-bet-first so the 30-day lookback works; only money/odds sorts actually reorder
    // the server query (so the extremes page in first). The displayed rows are ordered by
    // `activeSort` regardless (see sortedGroups).
    const timeBrowse = !filters.sort || filters.sort === 'gameTime' || filters.sort === 'betTime';
    const serverSortBy = timeBrowse ? 'betTime' : filters.sort;
    const serverSortAsc = timeBrowse ? false : !!filters.sortAsc;

    const lookbackCutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
    const reachedInitialDepth = (rows, pagesFetched) => {
      if (serverScoped) return false; // exhaust via cursor (bounded by AUTO_PAGE_CAP)
      if (timeBrowse) return rows.length > 0 && rows.some((t) => (t.betTime ?? 0) < lookbackCutoff);
      return pagesFetched >= INITIAL_BATCH; // server-sorted: a small batch surfaces the top
    };

    async function enrichPage(rawTrades) {
      const uniqueHashes = [...new Set(rawTrades.map((t) => t.marketHash))];
      const uncachedHashes = uniqueHashes.filter((h) => !marketCache.current[h]);

      if (uncachedHashes.length > 0) {
        const newMarkets = await fetchAllMarkets(uncachedHashes);
        Object.assign(marketCache.current, newMarkets);
      }

      const parlayLegHashes = [];
      uniqueHashes.forEach((hash) => {
        const market = marketCache.current[hash];
        if (market?.legs?.length) {
          market.legs.forEach((leg) => {
            const legHash = leg.marketHash ?? leg;
            if (legHash && !marketCache.current[legHash]) parlayLegHashes.push(legHash);
          });
        }
      });

      if (parlayLegHashes.length > 0) {
        const legMarkets = await fetchAllMarkets([...new Set(parlayLegHashes)]);
        Object.assign(marketCache.current, legMarkets);
      }

      return rawTrades.map((t) => {
        const market = marketCache.current[t.marketHash] ?? null;
        const parlayLegs = market?.legs?.length
          ? market.legs.map((leg) => {
              const legHash = leg.marketHash ?? leg;
              return { bettingOutcomeOne: leg.bettingOutcomeOne, marketData: marketCache.current[legHash] ?? null };
            })
          : null;
        return { ...t, market, parlayLegs };
      });
    }

    try {
      let cursor = cursorKey;

      if (!append) {
        setTrades([]);
        setNextKey(null);
        refundEvents.current = await fetchRefunds(address);

        let pagesFetched = 0;
        let totalLoaded = 0;

        do {
          const data = await fetchTrades({ bettor: address, ...filters, sortBy: serverSortBy, sortAsc: serverSortAsc, paginationKey: cursor });
          const pageTrades = data.trades ?? [];
          cursor = data.nextKey ?? null;
          pagesFetched++;
          totalLoaded += pageTrades.length;

          if (pageTrades.length > 0) {
            const enriched = await enrichPage(pageTrades);
            setTrades((prev) => dedupeTrades([...prev, ...enriched]));
          }

          // Reached the initial depth for this query shape — stop, but keep the cursor so
          // Load More can pull more (older bets, or the next slice of the sorted set).
          if (reachedInitialDepth(pageTrades, pagesFetched)) break;

          if (cursor) setLoadingStatus(`Loaded ${totalLoaded} trades, fetching more…`);

          if (pagesFetched >= AUTO_PAGE_CAP && cursor) break;
        } while (cursor);
      } else {
        const data = await fetchTrades({ bettor: address, ...filters, sortBy: serverSortBy, sortAsc: serverSortAsc, paginationKey: cursor });
        const pageTrades = data.trades ?? [];
        cursor = data.nextKey ?? null;

        if (pageTrades.length > 0) {
          const enriched = await enrichPage(pageTrades);
          setTrades((prev) => dedupeTrades([...prev, ...enriched]));
        }
      }

      setNextKey(cursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  }, []);

  function handleSearch(address, filters) {
    currentSearch.current = { address, filters };
    marketCache.current = {};
    setHasSearched(true);
    setLeagueFilter('');
    setGameFilter('');
    setActiveSort({ by: filters.sort ?? 'gameTime', asc: !!filters.sortAsc });
    loadTrades(address, filters, null, false);
  }

  function handleLoadMore() {
    const { address, filters } = currentSearch.current;
    loadTrades(address, filters, nextKey, true);
  }

  function handleLeagueChange(val) {
    setLeagueFilter(val);
    setGameFilter('');
  }

  const leagues = useMemo(() => {
    const set = new Set();
    trades.forEach((t) => { const l = tradeLeague(t); if (l) set.add(l); });
    return [...set].sort();
  }, [trades]);

  const games = useMemo(() => {
    const set = new Set();
    trades.forEach((t) => {
      if (t.parlayLegs?.length) return;
      if (leagueFilter && tradeLeague(t) !== leagueFilter) return;
      const matchup = formatMatchup(t.market);
      if (matchup && matchup !== '—') set.add(matchup);
    });
    return [...set].sort();
  }, [trades, leagueFilter]);

  const visibleTrades = useMemo(() => {
    if (!leagueFilter && !gameFilter) return trades;
    return trades.filter((t) => {
      if (leagueFilter && tradeLeague(t) !== leagueFilter) return false;
      if (gameFilter && formatMatchup(t.market) !== gameFilter) return false;
      return true;
    });
  }, [trades, leagueFilter, gameFilter]);

  const groups = useMemo(
    () => buildMarketGroups(visibleTrades, refundEvents.current),
    [visibleTrades]
  );

  // Order the market rows by the selected sort field (server already biased which trades
  // loaded; this orders what's displayed). Falls back to game time for unknown keys.
  const sortedGroups = useMemo(() => {
    const valueOf = GROUP_SORT_VALUE[activeSort.by] ?? GROUP_SORT_VALUE.gameTime;
    const dir = activeSort.asc ? 1 : -1;
    return [...groups].sort((a, b) => (valueOf(a) - valueOf(b)) * dir);
  }, [groups, activeSort]);

  return (
    <main className="app-main">
      <InfoCallout title="How the Portfolio view works">
        <p>
          One row per market — click to expand the bets and refunds behind it.{' '}
          <strong>Risk</strong> is net stake (after capital-efficiency refunds);{' '}
          <strong>Profit</strong> is what came back minus that.
        </p>
        <p>
          <strong>League</strong> and <strong>Game</strong> only filter trades already loaded
          (past 30d by default); filter by a specific <strong>Market Hash</strong> or{' '}
          <strong>Event ID</strong> to ensure you fetch every trade for that market/event.
        </p>
      </InfoCallout>

      <SearchForm
        onSearch={handleSearch}
        loading={loading}
        leagues={leagues}
        games={games}
        leagueFilter={leagueFilter}
        gameFilter={gameFilter}
        onLeagueChange={handleLeagueChange}
        onGameChange={setGameFilter}
      />

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && loadingStatus && <div className="loading-status">{loadingStatus}</div>}

      {hasSearched && !loading && !error && trades.length === 0 && (
        <div className="empty-state">No trades found for this address.</div>
      )}

      <TradesTable groups={sortedGroups} bettor={currentSearch.current.address} />

      <LoadMoreButton
        onLoadMore={handleLoadMore}
        loading={loading}
        count={trades.length}
        hasMore={nextKey !== null}
      />
    </main>
  );
}
