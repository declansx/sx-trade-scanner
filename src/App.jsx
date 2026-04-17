import { useState, useRef, useCallback, useMemo } from 'react';
import SearchForm from './components/SearchForm.jsx';
import TradesTable from './components/TradesTable.jsx';
import TradeFilters from './components/TradeFilters.jsx';
import LoadMoreButton from './components/LoadMoreButton.jsx';
import { fetchTrades } from './api/fetchTrades.js';
import { fetchAllMarkets } from './api/fetchMarkets.js';
import { formatMatchup } from './utils/tradeHelpers.js';

export default function App() {
  const [trades, setTrades] = useState([]);
  const [nextKey, setNextKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [leagueFilter, setLeagueFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('');

  // Market cache persists across Load More calls without triggering re-renders
  const marketCache = useRef({});
  // Store current search params so Load More can reuse them
  const currentSearch = useRef({ address: '', filters: {} });

  const loadTrades = useCallback(async (address, filters, cursorKey, append) => {
    setLoading(true);
    setLoadingStatus('');
    setError(null);

    const AUTO_PAGE_CAP = 20;

    // Enrich a page of raw trades with market data (mutates marketCache, returns joined trades)
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

        let pagesFetched = 0;
        let totalLoaded = 0;

        do {
          const data = await fetchTrades({ bettor: address, ...filters, paginationKey: cursor });
          const pageTrades = data.trades ?? [];
          cursor = data.nextKey ?? null;
          pagesFetched++;
          totalLoaded += pageTrades.length;

          if (pageTrades.length > 0) {
            const enriched = await enrichPage(pageTrades);
            const sorted = enriched.sort((a, b) => b.betTime - a.betTime);
            setTrades((prev) => [...prev, ...sorted].sort((a, b) => b.betTime - a.betTime));
          }

          if (cursor) setLoadingStatus(`Loaded ${totalLoaded} trades, fetching more…`);

          if (pagesFetched >= AUTO_PAGE_CAP && cursor) {
            console.warn(`[trade-scanner] Auto-pagination capped at ${AUTO_PAGE_CAP} pages. Narrow the date range to see all trades sorted newest-first.`);
            break;
          }
        } while (cursor);
      } else {
        // Load More: single page only
        const data = await fetchTrades({ bettor: address, ...filters, paginationKey: cursor });
        const pageTrades = data.trades ?? [];
        cursor = data.nextKey ?? null;

        if (pageTrades.length > 0) {
          const enriched = await enrichPage(pageTrades);
          const sorted = enriched.sort((a, b) => b.betTime - a.betTime);
          setTrades((prev) => [...prev, ...sorted].sort((a, b) => b.betTime - a.betTime));
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
    trades.forEach((t) => {
      const label = t.market?.leagueLabel ?? (t.parlayLegs ? 'Parlay' : null);
      if (label) set.add(label);
    });
    return [...set].sort();
  }, [trades]);

  const games = useMemo(() => {
    const set = new Set();
    trades.forEach((t) => {
      if (t.parlayLegs) return;
      if (leagueFilter && (t.market?.leagueLabel ?? '') !== leagueFilter) return;
      const matchup = formatMatchup(t.market);
      if (matchup && matchup !== '—') set.add(matchup);
    });
    return [...set].sort();
  }, [trades, leagueFilter]);

  const visibleTrades = useMemo(() => {
    if (!leagueFilter && !gameFilter) return trades;
    return trades.filter((t) => {
      if (leagueFilter) {
        const league = t.market?.leagueLabel ?? (t.parlayLegs ? 'Parlay' : '');
        if (league !== leagueFilter) return false;
      }
      if (gameFilter) {
        if (t.parlayLegs) return false;
        if (formatMatchup(t.market) !== gameFilter) return false;
      }
      return true;
    });
  }, [trades, leagueFilter, gameFilter]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>SX Bet Trade Scanner</h1>
        <p className="app-subtitle">Look up trade history for any wallet address</p>
      </header>

      <main className="app-main">
        <SearchForm onSearch={handleSearch} loading={loading} />

        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && loadingStatus && (
          <div className="loading-status">{loadingStatus}</div>
        )}

        {hasSearched && !loading && !error && trades.length === 0 && (
          <div className="empty-state">No trades found for this address.</div>
        )}

        <TradeFilters
          leagues={leagues}
          games={games}
          league={leagueFilter}
          game={gameFilter}
          onLeagueChange={handleLeagueChange}
          onGameChange={setGameFilter}
        />

        <TradesTable trades={visibleTrades} />

        <LoadMoreButton
          onLoadMore={handleLoadMore}
          loading={loading}
          count={trades.length}
          hasMore={nextKey !== null}
        />
      </main>
    </div>
  );
}
