import { useState } from 'react';

// Server-side sort fields the consolidated endpoint supports that map cleanly to a
// market-group aggregate (value = API `sortBy`).
export const SORT_OPTIONS = [
  { value: 'gameTime', label: 'Game time' },
  { value: 'betTime', label: 'Bet time' },
  { value: 'settleNetReturnValue', label: 'Profit' },
  { value: 'totalStake', label: 'Risk' },
  { value: 'weightedAverageOdds', label: 'Odds' },
];

export default function SearchForm({ onSearch, loading, leagues = [], games = [], leagueFilter = '', gameFilter = '', onLeagueChange, onGameChange }) {
  const [walletAddress, setWalletAddress] = useState('');
  const [settled, setSettled] = useState('all');
  const [pageSize, setPageSize] = useState(300);
  const [baseToken, setBaseToken] = useState('');
  const [maker, setMaker] = useState('all');
  const [tradeStatus, setTradeStatus] = useState('all');
  const [marketHash, setMarketHash] = useState('');
  const [eventId, setEventId] = useState('');
  const [sortBy, setSortBy] = useState('gameTime');
  const [sortAsc, setSortAsc] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const addr = walletAddress.trim();
    if (!addr) return;

    onSearch(addr, {
      settled,
      pageSize,
      baseToken,
      maker,
      tradeStatus: tradeStatus === 'all' ? null : tradeStatus,
      marketHash: marketHash.trim() || null,
      sportXeventId: eventId.trim() || null,
      sort: sortBy,
      sortAsc,
    });
  }

  return (
    <form className="search-form" onSubmit={handleSubmit}>
      {/* Row 1: wallet + status + page size + base token */}
      <div className="form-row">
        <div className="form-group form-group--wide">
          <label htmlFor="wallet">Wallet Address</label>
          <input
            id="wallet"
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="0x..."
            spellCheck={false}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="settled">Status</label>
          <select id="settled" value={settled} onChange={(e) => setSettled(e.target.value)}>
            <option value="all">All</option>
            <option value="settled">Settled Only</option>
            <option value="unsettled">Unsettled Only</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="pageSize">Results per page</label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={300}>300</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="baseToken">
            Base Token <span className="label-hint">(optional)</span>
          </label>
          <input
            id="baseToken"
            type="text"
            value={baseToken}
            onChange={(e) => setBaseToken(e.target.value)}
            placeholder="0x token address"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Row 2: maker + trade status */}
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="maker">Role</label>
          <select id="maker" value={maker} onChange={(e) => setMaker(e.target.value)}>
            <option value="all">All</option>
            <option value="maker">Maker Only</option>
            <option value="taker">Taker Only</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="tradeStatus">Trade Status</label>
          <select
            id="tradeStatus"
            value={tradeStatus}
            onChange={(e) => setTradeStatus(e.target.value)}
          >
            <option value="all">All</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="sortBy">Sort By</label>
          <select id="sortBy" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="sortAsc">Order</label>
          <select id="sortAsc" value={sortAsc ? 'asc' : 'desc'} onChange={(e) => setSortAsc(e.target.value === 'asc')}>
            <option value="desc">High → Low</option>
            <option value="asc">Low → High</option>
          </select>
        </div>
      </div>

      {/* Row 3: server-side scoping — one game (event id) or one market (hash) */}
      <div className="form-row">
        <div className="form-group form-group--wide">
          <label htmlFor="eventId">
            Event ID <span className="label-hint">(optional · whole game)</span>
          </label>
          <input
            id="eventId"
            type="text"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="e.g. L18468509"
            spellCheck={false}
          />
        </div>
        <div className="form-group form-group--wide">
          <label htmlFor="marketHash">
            Market Hash <span className="label-hint">(optional · single market)</span>
          </label>
          <input
            id="marketHash"
            type="text"
            value={marketHash}
            onChange={(e) => setMarketHash(e.target.value)}
            placeholder="0x… market hash"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Row 3: client-side league/game filters — only shown once trades are loaded */}
      {leagues.length > 0 && (
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="leagueFilter">League <span className="label-hint">(filter)</span></label>
            <select id="leagueFilter" value={leagueFilter} onChange={(e) => onLeagueChange(e.target.value)}>
              <option value="">All Leagues</option>
              {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="gameFilter">Game <span className="label-hint">(filter)</span></label>
            <select id="gameFilter" value={gameFilter} onChange={(e) => onGameChange(e.target.value)}>
              <option value="">All Games</option>
              {games.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        </div>
      )}

      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? <span className="spinner" /> : null}
        {loading ? 'Fetching…' : 'Fetch Trades'}
      </button>
    </form>
  );
}
