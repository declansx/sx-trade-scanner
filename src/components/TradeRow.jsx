import { useState } from 'react';
import {
  convertOdds,
  formatStake,
  getBetOutcome,
  getLegResult,
  calculateReturn,
  formatDateTime,
  formatMatchup,
} from '../utils/tradeHelpers.js';

const EXPLORER_BASE = 'https://explorerl2.sx.technology/tx/';

function LegResultIcon({ result }) {
  if (result === 'WIN')  return <span className="leg-icon leg-icon--win">✓</span>;
  if (result === 'LOSS') return <span className="leg-icon leg-icon--loss">✗</span>;
  if (result === 'PUSH') return <span className="leg-icon leg-icon--push">–</span>;
  return <span className="leg-icon leg-icon--pending">·</span>;
}

function ParlayLegs({ legs }) {
  if (!legs?.length) return <span className="text-muted">—</span>;
  return (
    <div className="parlay-legs">
      {legs.map((leg, i) => {
        const m = leg.marketData;
        if (!m) return <div key={i} className="parlay-leg text-muted">leg {i + 1}</div>;
        const outcome =
          leg.bettingOutcomeOne != null
            ? leg.bettingOutcomeOne ? m.outcomeOneName : m.outcomeTwoName
            : '?';
        const matchup =
          m.teamOneName && m.teamTwoName
            ? `${m.teamOneName} vs ${m.teamTwoName}`
            : m.outcomeOneName ?? '?';
        const legResult = getLegResult(leg);
        return (
          <div key={i} className="parlay-leg">
            <LegResultIcon result={legResult} />
            <div className="parlay-leg-text">
              <span className="parlay-leg-match">{matchup}</span>
              <span className="parlay-leg-pick">{outcome}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReturnCell({ value, txLink }) {
  if (value === null) return <span className="result-na">—</span>;
  if (value === 0)    return <span className="result-push">$0.00</span>;
  const formatted = `${value > 0 ? '+' : ''}$${Math.abs(value).toFixed(2)}`;
  const inner = (
    <span className={value > 0 ? 'result-win' : 'result-loss'}>
      {formatted}
    </span>
  );
  if (txLink) {
    return (
      <a href={txLink} target="_blank" rel="noreferrer" className="tx-link">
        {inner}
        <span className="tx-icon">↗</span>
      </a>
    );
  }
  return inner;
}

export default function TradeRow({ trade }) {
  const [parlayExpanded, setParlayExpanded] = useState(false);
  const { market, parlayLegs } = trade;
  const isParlay = !!parlayLegs;
  const ret = calculateReturn(trade, market);

  const settleTxLink = trade.settled && trade.settleTxHash
    ? `${EXPLORER_BASE}${trade.settleTxHash}`
    : null;
  const fillTxLink = trade.fillOrderHash
    ? `${EXPLORER_BASE}${trade.fillOrderHash}`
    : null;

  // Log raw trade on first render to aid debugging outcome field type
  // (remove once win/loss is confirmed correct)
  if (process.env.NODE_ENV !== 'production' && trade.settled) {
    console.log('[trade-scanner] settled trade sample:', {
      outcome: trade.outcome,
      marketOutcome: market?.outcome,
      bettingOutcomeOne: trade.bettingOutcomeOne,
      netReturn: trade.netReturn,
    });
  }

  return (
    <tr className={isParlay ? 'row-parlay' : ''}>
      {/* Maker / Taker badge */}
      <td className="td-role">
        <span className={`role-badge ${trade.maker ? 'role-badge--maker' : 'role-badge--taker'}`}>
          {trade.maker ? 'M' : 'T'}
        </span>
      </td>

      {/* Bet Time (plain — tx links are on stake/return cells) */}
      <td className="td-mono">{formatDateTime(trade.betTime)}</td>

      {/* League */}
      <td>
        {isParlay ? <span className="parlay-badge">Parlay</span> : (market?.leagueLabel ?? '—')}
      </td>

      {/* Match */}
      <td className="td-match">
        {isParlay ? (
          <button
            className="parlay-expand-btn"
            onClick={() => setParlayExpanded((v) => !v)}
          >
            <span className="parlay-chevron">{parlayExpanded ? '▾' : '▸'}</span>
            {parlayLegs.length} leg{parlayLegs.length !== 1 ? 's' : ''}
          </button>
        ) : (
          formatMatchup(market)
        )}
      </td>

      {/* Bet On */}
      <td className="td-outcome">
        {isParlay ? (
          parlayExpanded
            ? <ParlayLegs legs={parlayLegs} />
            : <span className="text-muted">—</span>
        ) : (
          getBetOutcome(trade, market)
        )}
      </td>

      {/* Odds */}
      <td className="td-right td-mono">{convertOdds(trade.odds)}</td>

      {/* Stake — linked to fill tx */}
      <td className="td-right td-mono">
        {fillTxLink ? (
          <a href={fillTxLink} target="_blank" rel="noreferrer" className="tx-link tx-link--subtle">
            ${formatStake(trade.stake)}
            <span className="tx-icon">↗</span>
          </a>
        ) : (
          `$${formatStake(trade.stake)}`
        )}
      </td>

      {/* Return — linked to settle tx */}
      <td className="td-right td-mono">
        <ReturnCell value={ret} txLink={settleTxLink} />
      </td>
    </tr>
  );
}
