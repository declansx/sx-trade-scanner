import { useState, useRef, useMemo, useCallback } from 'react';
import LoadMoreButton from './components/LoadMoreButton.jsx';
import InfoCallout from './components/InfoCallout.jsx';
import { InfoButton, field, truncateHash } from './components/MetaTooltip.jsx';
import { fetchRawTrades } from './api/fetchRawTrades.js';
import { fetchRefunds } from './api/fetchRefunds.js';
import { fetchAllMarkets } from './api/fetchMarkets.js';
import { formatStake, formatDateTime } from './utils/tradeHelpers.js';
import { useFormatOdds } from './OddsFormatContext.jsx';

const EXPLORER_BASE = 'https://explorerl2.sx.technology/tx/';

function sideLabel(t, market) {
  if (!market) return t.bettingOutcomeOne ? 'Outcome 1' : 'Outcome 2';
  return t.bettingOutcomeOne ? market.outcomeOneName : market.outcomeTwoName;
}
function gameLabel(market) {
  if (!market) return null;
  const a = market.teamOneName || market.outcomeOneName;
  const b = market.teamTwoName || market.outcomeTwoName;
  return a && b ? `${a} vs ${b}` : a ?? null;
}

function tradeSections(t, market, fmtOdds) {
  return [
    {
      title: 'Identifiers',
      fields: [
        field('fillHash', 'Trade Hash', t.fillHash, truncateHash(t.fillHash)),
        field('fillOrderHash', 'Fill Order Hash', t.fillOrderHash, truncateHash(t.fillOrderHash)),
        field('marketHash', 'Market Hash', t.marketHash, truncateHash(t.marketHash)),
        field('settleTxHash', 'Settle Tx Hash', t.settleTxHash, truncateHash(t.settleTxHash)),
      ],
    },
    {
      title: 'Trade',
      fields: [
        field('betTime', 'Bet Time', formatDateTime(t.betTime)),
        field('stake', 'Stake', t.stake != null ? `$${formatStake(t.stake)}` : null),
        field('odds', 'Odds', fmtOdds(t.odds) !== '—' ? fmtOdds(t.odds) : null),
        field('side', 'Side', sideLabel(t, market)),
        field('role', 'Role', t.maker ? 'Maker' : 'Taker'),
        field('status', 'Status', t.tradeStatus),
        field('settled', 'Settled', String(t.settled)),
        field('outcome', 'Outcome (raw)', t.outcome != null ? String(t.outcome) : null),
      ],
    },
    {
      title: 'Market',
      fields: [
        field('league', 'League', market?.leagueLabel || null),
        field('game', 'Game', gameLabel(market)),
        field('eventId', 'Event ID', t.sportXeventId || market?.sportXeventId || null),
      ],
    },
  ];
}

function refundSections(r, market) {
  return [
    {
      title: 'Refund',
      fields: [
        field('amount', 'Amount', `$${Number(r.amount).toFixed(2)}`),
        field('amountBtv', 'Amount (bet-time)', r.amountBetTimeValue != null ? `$${Number(r.amountBetTimeValue).toFixed(2)}` : null),
        field('date', 'Date', r.createdAt ? formatDateTime(Math.floor(new Date(r.createdAt).getTime() / 1000)) : null),
        field('role', 'Role', r.maker ? 'Maker' : 'Taker'),
      ],
    },
    {
      title: 'Identifiers',
      fields: [
        field('fillOrderHash', 'Fill Order Hash', r.fillOrderHash, truncateHash(r.fillOrderHash)),
        field('marketHash', 'Market Hash', r.marketHash, truncateHash(r.marketHash)),
        field('game', 'Game', gameLabel(market)),
      ],
    },
  ];
}

function TxnRow({ item }) {
  const fmtOdds = useFormatOdds();
  const market = item.market;
  const txHash = item.raw.fillOrderHash;
  const txLink = txHash ? `${EXPLORER_BASE}${txHash}` : null;
  const isBet = item.type === 'Bet';
  const sections = isBet ? tradeSections(item.raw, market, fmtOdds) : refundSections(item.raw, market);
  const failed = isBet && item.raw.tradeStatus === 'FAILED';

  return (
    <tr>
      <td className="td-info"><InfoButton sections={sections} /></td>
      <td className="td-mono">{item.time ? formatDateTime(item.time) : '—'}</td>
      <td>
        <span className={`li-type li-type--${isBet ? 'bet' : 'refund'}`}>{item.type}</span>
        {failed && <span className="li-type li-type--failed"> FAILED</span>}
      </td>
      <td>{gameLabel(market) ?? <span className="td-mono text-muted">{truncateHash(item.raw.marketHash)}</span>}</td>
      <td>{isBet ? sideLabel(item.raw, market) : '—'}</td>
      <td className={`td-right td-mono ${isBet ? '' : 'result-win'}`}>
        {isBet ? `−$${formatStake(item.raw.stake)}` : `+$${Number(item.raw.amount).toFixed(2)}`}
      </td>
      <td className="td-right td-mono">{isBet ? fmtOdds(item.raw.odds) : 'N/A'}</td>
      <td className="td-right">
        {txLink && (
          <a href={txLink} target="_blank" rel="noreferrer" className="tx-link">
            <span className="tx-icon">↗</span>
          </a>
        )}
      </td>
    </tr>
  );
}

// Default the start date to 30 days ago so the log opens on recent activity (the
// /trades endpoint paginates oldest→newest, so an unbounded query would surface
// ancient trades first).
const defaultStartDate = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);

export default function TransactionsView() {
  const [bettor, setBettor] = useState('');
  const [marketHash, setMarketHash] = useState('');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState('');
  const [rawTrades, setRawTrades] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [nextKey, setNextKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);

  const marketCache = useRef({});
  const search = useRef({ bettor: '', marketHash: '' });

  const enrich = useCallback(async (trades, refundEvents) => {
    const hashes = [
      ...new Set([...trades.map((t) => t.marketHash), ...refundEvents.map((r) => r.marketHash)]),
    ].filter((h) => h && !marketCache.current[h]);
    if (hashes.length > 0) {
      const markets = await fetchAllMarkets(hashes);
      Object.assign(marketCache.current, markets);
    }
  }, []);

  const run = useCallback(async (append) => {
    const { bettor: addr, marketHash: mh, startDate: sd, endDate: ed } = search.current;
    if (!addr.trim()) return;
    setLoading(true);
    setError(null);
    // Interpret the date pickers in LOCAL time so the boundaries line up with the local
    // times shown in the Time column (a bare "2026-05-21" would otherwise parse as UTC
    // midnight, pulling in the prior local evening for behind-UTC users).
    const startUnix = sd ? Math.floor(new Date(sd + 'T00:00:00').getTime() / 1000) : undefined;
    const endUnix = ed ? Math.floor(new Date(ed + 'T23:59:59').getTime() / 1000) : undefined;
    const PAGE_CAP = 2; // pages per batch (×100 trades); Load More fetches the next batch
    try {
      // On a fresh search, fetch refunds (bounded to the window) in parallel with the
      // first trades batch so the initial load is fast and light on the rate limit.
      const refundPromise = append ? null : fetchRefunds(addr, mh, startUnix);

      let cursor = append ? nextKey : null;
      let acc = [];
      let pages = 0;
      do {
        const { trades, nextKey: nk } = await fetchRawTrades({
          bettor: addr, marketHash: mh, startDate: startUnix, endDate: endUnix, paginationKey: cursor,
        });
        acc = acc.concat(trades);
        cursor = nk;
        pages++;
      } while (cursor && pages < PAGE_CAP);

      if (!append) {
        const refundEvents = await refundPromise;
        await enrich(acc, refundEvents);
        setRefunds(refundEvents);
        setRawTrades(acc);
      } else {
        await enrich(acc, []);
        setRawTrades((prev) => [...prev, ...acc]);
      }
      setNextKey(cursor);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [enrich, nextKey]);

  function handleSubmit(e) {
    e.preventDefault();
    search.current = { bettor, marketHash, startDate, endDate };
    marketCache.current = {};
    setHasSearched(true);
    setRawTrades([]);
    setRefunds([]);
    setNextKey(null);
    run(false);
  }

  // Merge trades + refunds into one chronological (newest-first) list.
  //
  // The /trades endpoint paginates oldest→newest, so the loaded trades cover
  // [startDate, newest-loaded-trade]. The refunds endpoint has no date filter and returns
  // the wallet's *entire* history. Without clamping, thousands of recent refunds outrank
  // every loaded bet and the bets never appear. So we bound refunds to the same window the
  // loaded trades actually cover — keeping the two streams aligned and interleaved.
  const items = useMemo(() => {
    const tradeTimes = rawTrades.map((t) => t.betTime ?? 0).filter(Boolean);
    const startUnix = search.current.startDate
      ? Math.floor(new Date(search.current.startDate + 'T00:00:00').getTime() / 1000)
      : 0;
    const endUnix = search.current.endDate
      ? Math.floor(new Date(search.current.endDate + 'T23:59:59').getTime() / 1000)
      : Infinity;
    // Upper bound = the earlier of the newest loaded trade (so no refund outranks all bets)
    // and the end date; lower = startDate.
    const maxTradeTime = Math.min(
      endUnix,
      tradeTimes.length ? tradeTimes.reduce((m, t) => (t > m ? t : m), 0) : Infinity
    );

    const tradeItems = rawTrades.map((t) => ({
      key: `t-${t.fillHash}`,
      time: t.betTime ?? 0,
      type: 'Bet',
      raw: t,
      market: marketCache.current[t.marketHash] ?? null,
    }));

    const refundItems = refunds
      .map((r) => ({
        key: `r-${r.fillOrderHash}-${r.createdAt}`,
        time: r.createdAt ? Math.floor(new Date(r.createdAt).getTime() / 1000) : 0,
        type: 'Refund',
        raw: r,
        market: marketCache.current[r.marketHash] ?? null,
      }))
      // only refunds within the loaded trades' window (skip when no trades loaded)
      .filter((r) => tradeTimes.length === 0 || (r.time >= startUnix && r.time <= maxTradeTime));

    // Oldest → newest. The /trades endpoint only pages oldest→newest from startDate, so
    // displaying in that same order means Load More appends newer rows at the bottom (right
    // by the button) instead of inserting them off-screen at the top.
    return [...tradeItems, ...refundItems].sort((a, b) => a.time - b.time);
  }, [rawTrades, refunds]);

  return (
    <main className="app-main">
      <InfoCallout title="How the Transactions view works">
        <p>
          A chronological log (oldest first) of every individual <strong>Bet</strong> fill and{' '}
          <strong>Refund</strong> — not grouped by market. Use the ⓘ on any row for full
          metadata.
        </p>
      </InfoCallout>

      <form className="search-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group form-group--wide">
            <label>Wallet Address</label>
            <input
              type="text"
              value={bettor}
              onChange={(e) => setBettor(e.target.value)}
              placeholder="0x…"
            />
          </div>
          <div className="form-group form-group--wide">
            <label>Market Hash (optional)</label>
            <input
              type="text"
              value={marketHash}
              onChange={(e) => setMarketHash(e.target.value)}
              placeholder="0x… market hash"
            />
          </div>
          <div className="form-group">
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <button type="submit" className="btn-primary" disabled={loading || !bettor.trim()}>
              {loading ? 'Loading…' : 'Look Up'}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="error-banner"><strong>Error:</strong> {error}</div>
      )}

      {hasSearched && !loading && !error && items.length === 0 && (
        <div className="empty-state">No transactions found.</div>
      )}

      {items.length > 0 && (
        <div className="table-wrapper">
          <table className="trades-table">
            <thead>
              <tr>
                <th className="th-info"></th>
                <th>Time</th>
                <th>Type</th>
                <th>Market</th>
                <th>Side</th>
                <th className="td-right">Amount</th>
                <th className="td-right">Odds</th>
                <th className="td-right">Tx</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => <TxnRow key={it.key} item={it} />)}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 0 && (
        <LoadMoreButton
          onLoadMore={() => run(true)}
          loading={loading}
          count={items.length}
          hasMore={nextKey !== null}
        />
      )}
    </main>
  );
}
