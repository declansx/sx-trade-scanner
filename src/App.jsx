import { useState, useRef, useCallback } from 'react';
import SearchForm from './components/SearchForm.jsx';
import TradesTable from './components/TradesTable.jsx';
import LoadMoreButton from './components/LoadMoreButton.jsx';
import { fetchTrades } from './api/fetchTrades.js';
import { fetchAllMarkets } from './api/fetchMarkets.js';

export default function App() {
  const [trades, setTrades] = useState([]);
  const [nextKey, setNextKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Market cache persists across Load More calls without triggering re-renders
  const marketCache = useRef({});
  // Store current search params so Load More can reuse them
  const currentSearch = useRef({ address: '', filters: {} });

  const loadTrades = useCallback(async (address, filters, cursorKey, append) => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchTrades({ bettor: address, ...filters, paginationKey: cursorKey });
      const rawTrades = data.trades ?? [];
      const cursor = data.nextKey ?? null;

      // Fetch uncached trade markets
      const uniqueHashes = [...new Set(rawTrades.map((t) => t.marketHash))];
      const uncachedHashes = uniqueHashes.filter((h) => !marketCache.current[h]);

      if (uncachedHashes.length > 0) {
        const newMarkets = await fetchAllMarkets(uncachedHashes);
        if (!append) {
          console.log('[trade-scanner] sample market:', Object.values(newMarkets)[0]);
        }
        Object.assign(marketCache.current, newMarkets);
      }

      // For parlay markets (sportId 25 or has legs array), fetch each leg's market data
      const parlayLegHashes = [];
      uniqueHashes.forEach((hash) => {
        const market = marketCache.current[hash];
        if (market?.legs?.length) {
          market.legs.forEach((leg) => {
            const legHash = leg.marketHash ?? leg;
            if (legHash && !marketCache.current[legHash]) {
              parlayLegHashes.push(legHash);
            }
          });
        }
      });

      if (parlayLegHashes.length > 0) {
        const legMarkets = await fetchAllMarkets([...new Set(parlayLegHashes)]);
        Object.assign(marketCache.current, legMarkets);
      }

      // Join market + resolved parlay legs onto each trade
      const joined = rawTrades.map((t) => {
        const market = marketCache.current[t.marketHash] ?? null;
        let parlayLegs = null;
        if (market?.legs?.length) {
          parlayLegs = market.legs.map((leg) => {
            const legHash = leg.marketHash ?? leg;
            return {
              bettingOutcomeOne: leg.bettingOutcomeOne,
              marketData: marketCache.current[legHash] ?? null,
            };
          });
        }
        return { ...t, market, parlayLegs };
      });

      // Sort by most recent betTime first
      const sorted = [...joined].sort((a, b) => b.betTime - a.betTime);

      setTrades((prev) => {
        if (append) {
          return [...prev, ...sorted].sort((a, b) => b.betTime - a.betTime);
        }
        return sorted;
      });
      setNextKey(cursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleSearch(address, filters) {
    currentSearch.current = { address, filters };
    marketCache.current = {};
    setHasSearched(true);
    loadTrades(address, filters, null, false);
  }

  function handleLoadMore() {
    const { address, filters } = currentSearch.current;
    loadTrades(address, filters, nextKey, true);
  }

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

        {hasSearched && !loading && !error && trades.length === 0 && (
          <div className="empty-state">No trades found for this address.</div>
        )}

        <TradesTable trades={trades} />

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
