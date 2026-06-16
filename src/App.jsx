import { useState } from 'react';
import PortfolioView from './PortfolioView.jsx';
import TransactionsView from './TransactionsView.jsx';
import { OddsFormatProvider, useOddsFormatControl } from './OddsFormatContext.jsx';
import { ODDS_FORMATS, ODDS_FORMAT_LABELS } from './utils/tradeHelpers.js';

function OddsFormatToggle() {
  const { format, setFormat } = useOddsFormatControl();
  return (
    <div className="odds-toggle" role="group" aria-label="Odds format">
      <span className="odds-toggle-label">Odds</span>
      {ODDS_FORMATS.map((f) => (
        <button
          key={f}
          type="button"
          className={`odds-toggle-btn${format === f ? ' odds-toggle-btn--active' : ''}`}
          onClick={() => setFormat(f)}
        >
          {ODDS_FORMAT_LABELS[f]}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('portfolio');

  return (
    <OddsFormatProvider>
      <div className="app">
        <header className="app-header">
          <h1>SX Bet Trade Scanner</h1>
          <p className="app-subtitle">Look up trade history for any wallet address</p>
          <div className="header-controls">
            <nav className="view-nav">
              <button
                className={`view-tab${view === 'portfolio' ? ' view-tab--active' : ''}`}
                onClick={() => setView('portfolio')}
              >
                Portfolio
              </button>
              <button
                className={`view-tab${view === 'transactions' ? ' view-tab--active' : ''}`}
                onClick={() => setView('transactions')}
              >
                Transactions
              </button>
            </nav>
            <OddsFormatToggle />
          </div>
        </header>

        {view === 'portfolio' ? <PortfolioView /> : <TransactionsView />}
      </div>
    </OddsFormatProvider>
  );
}
