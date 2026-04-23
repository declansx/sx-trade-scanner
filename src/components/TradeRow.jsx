import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  convertOdds,
  formatStake,
  getBetOutcome,
  getLegResult,
  getResult,
  calculateReturn,
  formatDateTime,
  formatMatchup,
} from '../utils/tradeHelpers.js';

const EXPLORER_BASE = 'https://explorerl2.sx.technology/tx/';

function truncateHash(h) {
  if (!h) return null;
  return h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h;
}

function field(id, label, value, display) {
  const v = value != null ? String(value) : null;
  return { id, label, value: v, display: display ?? v };
}

// ── Shared hover-state logic ──────────────────────────────────────────────────

function useMetaHover() {
  const [metaPos, setMetaPos] = useState(null);
  const hideTimeout = useRef(null);
  const iconRef = useRef(null);

  const showMeta = useCallback(() => {
    clearTimeout(hideTimeout.current);
    if (iconRef.current) {
      const r = iconRef.current.getBoundingClientRect();
      const tooltipWidth = 300;
      const left =
        r.right + 8 + tooltipWidth > window.innerWidth
          ? r.left - tooltipWidth - 8
          : r.right + 8;
      setMetaPos({ top: r.bottom + 6, left });
    }
  }, []);

  const hideMeta = useCallback(() => {
    hideTimeout.current = setTimeout(() => setMetaPos(null), 150);
  }, []);

  return { metaPos, iconRef, showMeta, hideMeta };
}

// ── Generic tooltip panel (portal) ───────────────────────────────────────────

function TooltipPanel({ sections, pos, onMouseEnter, onMouseLeave }) {
  const [copied, setCopied] = useState(null);

  const copy = (id, value) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1200);
    });
  };

  return createPortal(
    <div
      className="trade-meta-tooltip"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {sections.map((section, si) => (
        <div key={section.title}>
          <div className={`meta-section${si === 0 ? ' meta-section--first' : ''}`}>
            {section.title}
          </div>
          {section.fields.map((f) => {
            const isCopied = copied === f.id;
            const canCopy = !!f.value;
            return (
              <div
                key={f.id}
                className={`meta-row${canCopy ? ' meta-row--copyable' : ' meta-row--empty'}`}
                onClick={() => copy(f.id, f.value)}
              >
                <span className="meta-label">{f.label}</span>
                <span className={`meta-value${isCopied ? ' meta-value--copied' : ''}`}>
                  {isCopied ? '✓ copied' : (f.display ?? '—')}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>,
    document.body
  );
}

// ── Trade-level info button (renders as <td>) ─────────────────────────────────

function TradeMetaButton({ trade }) {
  const { metaPos, iconRef, showMeta, hideMeta } = useMetaHover();
  const { market } = trade;
  const ret = calculateReturn(trade, market);
  const result = getResult(trade, market);
  const retFormatted =
    ret === null
      ? null
      : ret === 0
      ? '$0.00'
      : `${ret > 0 ? '+' : ''}$${Math.abs(ret).toFixed(2)}`;

  const sections = [
    {
      title: 'Identifiers',
      fields: [
        field('fillHash',      'Trade Hash',      trade.fillHash,      truncateHash(trade.fillHash)),
        field('fillOrderHash', 'Fill Order Hash', trade.fillOrderHash, truncateHash(trade.fillOrderHash)),
        field('marketHash',    'Market Hash',     trade.marketHash,    truncateHash(trade.marketHash)),
        field('settleTxHash',  'Settle Tx Hash',  trade.settleTxHash,  truncateHash(trade.settleTxHash)),
      ],
    },
    {
      title: 'Trade',
      fields: [
        field('betTime',           'Bet Time',         formatDateTime(trade.betTime)),
        field('betTimeRaw',        'Bet Time (unix)',   trade.betTime),
        field('stake',             'Stake',             trade.stake != null ? `$${formatStake(trade.stake)} USDC` : null),
        field('stakeRaw',          'Stake (raw)',       trade.stake),
        field('odds',              'Odds',              convertOdds(trade.odds) !== '—' ? convertOdds(trade.odds) : null),
        field('oddsRaw',           'Odds (raw)',        trade.odds),
        field('side',              'Side',              getBetOutcome(trade, market)),
        field('bettingOutcomeOne', 'bettingOutcomeOne', trade.bettingOutcomeOne != null ? String(trade.bettingOutcomeOne) : null),
        field('role',              'Role',              trade.maker ? 'Maker' : 'Taker'),
        field('settled',           'Settled',           String(trade.settled)),
        field('outcomeRaw',        'Outcome (raw)',     trade.outcome != null ? String(trade.outcome) : 'null'),
        field('result',            'Result',            result !== '—' ? result : null),
        field('return',            'Return',            retFormatted),
      ],
    },
    {
      title: 'Market',
      fields: [
        field('league',     'League',    market?.leagueLabel    || null),
        field('teamOne',    'Team 1',    market?.teamOneName    || null),
        field('teamTwo',    'Team 2',    market?.teamTwoName    || null),
        field('outcomeOne', 'Outcome 1', market?.outcomeOneName || null),
        field('outcomeTwo', 'Outcome 2', market?.outcomeTwoName || null),
      ],
    },
  ];

  return (
    <td className="td-info">
      <button
        ref={iconRef}
        className="info-btn"
        onMouseEnter={showMeta}
        onMouseLeave={hideMeta}
        aria-label="Trade metadata"
      >
        ⓘ
      </button>
      {metaPos && (
        <TooltipPanel
          sections={sections}
          pos={metaPos}
          onMouseEnter={showMeta}
          onMouseLeave={hideMeta}
        />
      )}
    </td>
  );
}

// ── Per-leg info button ───────────────────────────────────────────────────────

function LegInfoButton({ market: m }) {
  const { metaPos, iconRef, showMeta, hideMeta } = useMetaHover();

  if (!m) return null;

  const sections = [
    {
      title: 'Identifiers',
      fields: [
        field('marketHash',    'Market Hash', m.marketHash,    truncateHash(m.marketHash)),
        field('sportXeventId', 'Event ID',    m.sportXeventId),
      ],
    },
    {
      title: 'Sport & League',
      fields: [
        field('sportLabel', 'Sport',     m.sportLabel),
        field('sportId',    'Sport ID',  m.sportId),
        field('leagueLabel','League',    m.leagueLabel),
        field('leagueId',   'League ID', m.leagueId),
      ],
    },
    {
      title: 'Market',
      fields: [
        field('type',        'Market Type',      m.type),
        field('line',        'Line',             m.line != null ? String(m.line) : null),
        field('gameTime',    'Game Time',        formatDateTime(m.gameTime)),
        field('gameTimeRaw', 'Game Time (unix)', m.gameTime),
        field('status',      'Status',           m.status),
        field('liveEnabled', 'Live Enabled',     m.liveEnabled != null ? String(m.liveEnabled) : null),
        field('mainLine',    'Main Line',        m.mainLine    != null ? String(m.mainLine)    : null),
        field('chainVersion','Chain Version',    m.chainVersion),
      ],
    },
    {
      title: 'Participants',
      fields: [
        field('teamOne',          'Team 1',    m.teamOneName),
        field('participantOneId', 'Team 1 ID', m.participantOneId),
        field('teamTwo',          'Team 2',    m.teamTwoName),
        field('participantTwoId', 'Team 2 ID', m.participantTwoId),
      ],
    },
    {
      title: 'Outcomes',
      fields: [
        field('outcomeOne',  'Outcome 1',    m.outcomeOneName),
        field('outcomeTwo',  'Outcome 2',    m.outcomeTwoName),
        field('outcomeVoid', 'Outcome Void', m.outcomeVoidName),
      ],
    },
    {
      title: 'Display',
      fields: [
        field('group1', 'Group 1', m.group1),
        field('group2', 'Group 2', m.group2),
      ],
    },
  ];

  return (
    <>
      <button
        ref={iconRef}
        className="info-btn info-btn--leg"
        onMouseEnter={showMeta}
        onMouseLeave={hideMeta}
        aria-label="Leg market metadata"
      >
        ⓘ
      </button>
      {metaPos && (
        <TooltipPanel
          sections={sections}
          pos={metaPos}
          onMouseEnter={showMeta}
          onMouseLeave={hideMeta}
        />
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
            <LegInfoButton market={m} />
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

// ── TradeRow ──────────────────────────────────────────────────────────────────

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
      <TradeMetaButton trade={trade} />

      {/* Maker / Taker badge */}
      <td className="td-role">
        <span className={`role-badge ${trade.maker ? 'role-badge--maker' : 'role-badge--taker'}`}>
          {trade.maker ? 'M' : 'T'}
        </span>
      </td>

      {/* Bet Time */}
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

      {/* Stake */}
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

      {/* Return */}
      <td className="td-right td-mono">
        <ReturnCell value={ret} txLink={settleTxLink} />
      </td>
    </tr>
  );
}
