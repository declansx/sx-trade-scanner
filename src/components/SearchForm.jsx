import { useState } from 'react';

function defaultStartDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

export default function SearchForm({ onSearch, loading, leagues = [], games = [], leagueFilter = '', gameFilter = '', onLeagueChange, onGameChange }) {
  const [walletAddress, setWalletAddress] = useState('');
  const [settled, setSettled] = useState('all');
  const [pageSize, setPageSize] = useState(300);
  const [baseToken, setBaseToken] = useState('');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState('');
  const [maker, setMaker] = useState('all');
  const [tradeStatus, setTradeStatus] = useState('all');

  function handleSubmit(e) {
    e.preventDefault();
    const addr = walletAddress.trim();
    if (!addr) return;

    // Convert date strings to unix timestamps (seconds), capped at now to avoid future-date rejections
    const now = Math.floor(Date.now() / 1000);
    const startTs = startDate ? Math.min(Math.floor(new Date(startDate).getTime() / 1000), now) : null;
    // End date: use end of selected day in UTC (matching how date-only strings are parsed)
    const endTs = endDate
      ? Math.min(Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000), now)
      : null;

    onSearch(addr, {
      settled,
      pageSize,
      baseToken,
      startDate: startTs,
      endDate: endTs,
      maker,
      tradeStatus: tradeStatus === 'all' ? null : tradeStatus,
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

      {/* Row 2: date range + maker + trade status */}
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="startDate">
            Start Date <span className="label-hint">(default: last 30d)</span>
          </label>
          <input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="endDate">End Date</label>
          <input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

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
