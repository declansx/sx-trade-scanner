import { useState, useEffect } from 'react';
import { formatDateTime, getLegResult } from '../utils/tradeHelpers.js';
import { useFormatOdds } from '../OddsFormatContext.jsx';
import { fetchMarketSettleTxs } from '../api/fetchTrades.js';
import { InfoButton, field, truncateHash } from './MetaTooltip.jsx';

const EXPLORER_BASE = 'https://explorerl2.sx.technology/tx/';

const money = (v) => (v != null ? `$${Number(v).toFixed(2)}` : null);

// Metadata sections for a single bet (shown in the ⓘ hover tooltip).
function betSections(bet, market, settleTx, fmtOdds) {
  return [
    {
      title: 'Identifiers',
      fields: [
        field('fillHash', 'Trade Hash', bet.fillHash, truncateHash(bet.fillHash)),
        field('fillOrderHash', 'Fill Order Hash', bet.fillOrderHash, truncateHash(bet.fillOrderHash)),
        field('marketHash', 'Market Hash', bet.marketHash, truncateHash(bet.marketHash)),
        field('settleTxHash', 'Settle Tx Hash', settleTx, truncateHash(settleTx)),
      ],
    },
    {
      title: 'Trade',
      fields: [
        field('betTime', 'Bet Time', formatDateTime(bet.betTime)),
        field('stake', 'Stake', money(bet.totalStake)),
        field('odds', 'Odds', fmtOdds(bet.odds) !== '—' ? fmtOdds(bet.odds) : null),
        field('side', 'Side', bet.bettingOutcomeLabel),
        field('role', 'Role', bet.maker ? 'Maker' : 'Taker'),
        field('settled', 'Settled', String(bet.settled)),
        field('outcome', 'Outcome (raw)', bet.outcome != null ? String(bet.outcome) : null),
        field('potentialReturn', 'Potential Return', money(bet.totalReturn)),
        field('netReturn', 'Net Return', money(bet.netReturn)),
        field('settleNet', 'Settled Return', money(bet.settleNetReturnValue)),
      ],
    },
    {
      title: 'Market',
      fields: [
        field('league', 'League', market?.leagueLabel || bet.leagueLabel || null),
        field('leagueId', 'League ID', market?.leagueId != null ? String(market.leagueId) : null),
        field('sport', 'Sport', market?.sportLabel || null),
        field('game', 'Game', bet.gameLabel || null),
        field('teamOne', 'Team 1', market?.teamOneName || null),
        field('teamTwo', 'Team 2', market?.teamTwoName || null),
        field('type', 'Market Type', market?.type || null),
        field('line', 'Line', market?.line != null ? String(market.line) : null),
        field('outcomeOne', 'Outcome 1', market?.outcomeOneName || null),
        field('outcomeTwo', 'Outcome 2', market?.outcomeTwoName || null),
        field('gameTime', 'Game Time', market?.gameTime ? formatDateTime(market.gameTime) : null),
        field('status', 'Status', market?.status || null),
        field(
          'score',
          'Score',
          market?.teamOneScore != null && market?.teamTwoScore != null
            ? `${market.teamOneScore}-${market.teamTwoScore}`
            : null
        ),
        field('eventId', 'Event ID', bet.sportXeventId || null),
      ],
    },
  ];
}

// Metadata sections for a refund (portfolio refund event).
function refundSections(r, market) {
  return [
    {
      title: 'Refund',
      fields: [
        field('amount', 'Amount', `$${Number(r.amount).toFixed(2)}`),
        field('amountBtv', 'Amount (bet-time)', r.amountBetTimeValue != null ? `$${Number(r.amountBetTimeValue).toFixed(2)}` : null),
        field('date', 'Date', r.createdAt ? formatDateTime(Math.floor(new Date(r.createdAt).getTime() / 1000)) : null),
        field('side', 'Side', r.sideLabel),
        field('role', 'Role', r.maker ? 'Maker' : 'Taker'),
      ],
    },
    {
      title: 'Identifiers',
      fields: [
        field('fillOrderHash', 'Fill Order Hash', r.fillOrderHash, truncateHash(r.fillOrderHash)),
        field('marketHash', 'Market Hash', r.marketHash, truncateHash(r.marketHash)),
        field('game', 'Game', market?.teamOneName ? `${market.teamOneName} vs ${market.teamTwoName}` : null),
      ],
    },
  ];
}

// Metadata sections for a single parlay leg's market (shown in the ⓘ hover tooltip).
function legSections(m) {
  return [
    {
      title: 'Market',
      fields: [
        field('marketHash', 'Market Hash', m.marketHash, truncateHash(m.marketHash)),
        field('sport', 'Sport', m.sportLabel || null),
        field('league', 'League', m.leagueLabel || null),
        field('type', 'Market Type', m.type || null),
        field('line', 'Line', m.line != null ? String(m.line) : null),
        field('gameTime', 'Game Time', m.gameTime ? formatDateTime(m.gameTime) : null),
        field('status', 'Status', m.status || null),
        field('eventId', 'Event ID', m.sportXeventId || null),
      ],
    },
    {
      title: 'Outcomes',
      fields: [
        field('teamOne', 'Team 1', m.teamOneName || null),
        field('teamTwo', 'Team 2', m.teamTwoName || null),
        field('outcomeOne', 'Outcome 1', m.outcomeOneName || null),
        field('outcomeTwo', 'Outcome 2', m.outcomeTwoName || null),
        field(
          'score',
          'Score',
          m.teamOneScore != null && m.teamTwoScore != null
            ? `${m.teamOneScore}-${m.teamTwoScore}`
            : null
        ),
      ],
    },
  ];
}

// ✓/✗/– result glyph for a single parlay leg (null result = unsettled).
function LegResultIcon({ result }) {
  if (result === 'WIN')  return <span className="leg-icon leg-icon--win">✓</span>;
  if (result === 'LOSS') return <span className="leg-icon leg-icon--loss">✗</span>;
  if (result === 'PUSH') return <span className="leg-icon leg-icon--push">–</span>;
  return <span className="leg-icon leg-icon--pending">·</span>;
}

// Signed money string matching SX's convention: +$ for gains, plain $ (color conveys
// the sign) for losses, $0.00 for break-even.
function moneySigned(v) {
  return `${v > 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`;
}

// Profit/return value with color class + optional tx link (↗), mirroring the old
// ReturnCell: win → green, loss → red, 0 → muted, null → "—".
function ValueCell({ value, txLink }) {
  if (value == null) return <span className="result-na">—</span>;
  const cls = value > 0 ? 'result-win' : value < 0 ? 'result-loss' : 'result-push';
  const inner = <span className={cls}>{moneySigned(value)}</span>;
  if (!txLink) return inner;
  return (
    <a href={txLink} target="_blank" rel="noreferrer" className="tx-link" onClick={(e) => e.stopPropagation()}>
      {inner}
      <span className="tx-icon">↗</span>
    </a>
  );
}

// Flatten a group's bets + refunds into time-sorted line items (newest first).
function buildLineItems(group) {
  const items = [];
  for (const b of group.bets) {
    items.push({
      key: b.fillHash,
      time: b.betTime ?? 0,
      type: 'Bet',
      side: b.bettingOutcomeLabel ?? '—',
      transferred: -Number(b.totalStake ?? 0),
      odds: b.odds, // raw fixed-point; formatted at render time
      // Settled → realized return (settleNetReturnValue, SX "totalReturned" basis, keeps the
      // bet+refund rows summing to group profit). Unsettled → potential return (netReturn).
      returned: Number((b.settled ? b.settleNetReturnValue : b.netReturn) ?? 0),
      fillOrderHash: b.fillOrderHash, // placement
      bet: b,
    });
  }
  for (const r of group.refunds) {
    items.push({
      key: `r-${r.fillOrderHash}-${r.createdAt}`,
      time: r.createdAt ? Math.floor(new Date(r.createdAt).getTime() / 1000) : 0,
      type: 'Refund',
      side: r.sideLabel ?? '—',
      transferred: r.amount,
      odds: null,
      returned: null,
      fillOrderHash: r.fillOrderHash,
      refund: r,
    });
  }
  return items.sort((a, b) => b.time - a.time);
}

function LineItemRow({ item, market, settleTxMap }) {
  const fmtOdds = useFormatOdds();
  const placementLink = item.fillOrderHash ? `${EXPLORER_BASE}${item.fillOrderHash}` : null;
  const settleTx = settleTxMap?.[item.fillOrderHash];
  const payoutLink = settleTx ? `${EXPLORER_BASE}${settleTx}` : null;
  const isBet = item.type === 'Bet';
  return (
    <tr className="li-row">
      <td className="td-info">
        <InfoButton sections={isBet ? betSections(item.bet, market, settleTx, fmtOdds) : refundSections(item.refund, market)} />
      </td>
      <td className="td-mono">{item.time ? formatDateTime(item.time) : '—'}</td>
      <td><span className={`li-type li-type--${item.type.toLowerCase()}`}>{item.type}</span></td>
      <td>{item.side}</td>
      <td className={`td-right td-mono ${item.transferred >= 0 ? 'result-win' : ''}`}>
        {placementLink ? (
          <a href={placementLink} target="_blank" rel="noreferrer" className="tx-link" onClick={(e) => e.stopPropagation()}>
            {moneySigned(item.transferred)}<span className="tx-icon">↗</span>
          </a>
        ) : (
          moneySigned(item.transferred)
        )}
      </td>
      <td className="td-right td-mono">{item.odds != null ? fmtOdds(item.odds) : 'N/A'}</td>
      <td className="td-right td-mono">
        {isBet ? <ValueCell value={item.returned} txLink={payoutLink} /> : <span className="result-na">N/A</span>}
      </td>
    </tr>
  );
}

export default function MarketRow({ group, bettor }) {
  const [open, setOpen] = useState(false);
  const [settleTxMap, setSettleTxMap] = useState(null);
  const fmtOdds = useFormatOdds();

  // Lazily fetch settlement tx hashes (for payout links) the first time the row opens.
  useEffect(() => {
    if (!open || settleTxMap || !bettor) return;
    let cancelled = false;
    fetchMarketSettleTxs(bettor, group.marketHash)
      .then((m) => !cancelled && setSettleTxMap(m))
      .catch(() => !cancelled && setSettleTxMap({}));
    return () => { cancelled = true; };
  }, [open, bettor, group.marketHash, settleTxMap]);

  const items = open ? buildLineItems(group) : [];
  const displayProfit = group.settled ? group.profit : null;
  const isParlay = !!group.market?.legs?.length;
  const parlayLegs = isParlay ? (group.bets[0]?.parlayLegs ?? null) : null;

  return (
    <>
      <tr className="market-row row-expandable" onClick={() => setOpen((v) => !v)}>
        <td className="td-mono market-time">
          <span className="detail-chevron">{open ? '▾' : '▸'}</span>
          {group.gameTime ? formatDateTime(group.gameTime) : '—'}
        </td>
        <td className="market-game">
          {isParlay ? <span className="parlay-badge">Parlay</span> : group.gameLabel}
          {group.leagueLabel && <span className="market-league"> · {group.leagueLabel}</span>}
        </td>
        <td className="market-bestcase">{group.bestCaseLabel ?? '—'}</td>
        <td className="td-mono market-score">{group.score ?? (group.settled ? '' : '—')}</td>
        <td className="td-right td-mono">${group.risked.toFixed(2)}</td>
        <td className="td-right td-mono">{group.oddsRaw != null ? fmtOdds(group.oddsRaw) : '—'}</td>
        <td className="td-right td-mono"><ValueCell value={displayProfit} /></td>
      </tr>

      {open && (
        <tr className="detail-row">
          <td colSpan={7}>
            {parlayLegs?.length > 0 && (
              <div className="parlay-legs-detail">
                <table className="line-items parlay-legs-table">
                  <thead>
                    <tr>
                      <th className="th-info"></th>
                      <th>Result</th>
                      <th>Game</th>
                      <th>Pick</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parlayLegs.map((leg, i) => {
                      const m = leg.marketData;
                      if (!m) {
                        return (
                          <tr key={i} className="li-row">
                            <td className="td-info"></td>
                            <td><LegResultIcon result={null} /></td>
                            <td className="text-muted" colSpan={2}>Leg {i + 1}</td>
                          </tr>
                        );
                      }
                      const outcome = leg.bettingOutcomeOne != null
                        ? (leg.bettingOutcomeOne ? m.outcomeOneName : m.outcomeTwoName)
                        : '?';
                      const matchup = m.teamOneName && m.teamTwoName
                        ? `${m.teamOneName} vs ${m.teamTwoName}`
                        : m.outcomeOneName ?? '?';
                      return (
                        <tr key={i} className="li-row">
                          <td className="td-info"><InfoButton sections={legSections(m)} /></td>
                          <td><LegResultIcon result={getLegResult(leg)} /></td>
                          <td className="text-muted">{matchup}</td>
                          <td className="parlay-leg-pick">{outcome}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <table className="line-items">
              <thead>
                <tr>
                  <th className="th-info"></th>
                  <th>Bet Time</th>
                  <th>Type</th>
                  <th>Side</th>
                  <th className="td-right">Transferred</th>
                  <th className="td-right">Odds</th>
                  {/* "Returned" once settled; "Return" (potential payout) while still open */}
                  <th className="td-right">{group.settled ? 'Returned' : 'Return'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <LineItemRow key={it.key} item={it} market={group.market} settleTxMap={settleTxMap} />
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
