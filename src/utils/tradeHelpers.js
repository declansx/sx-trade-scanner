// Supported odds display formats, in toggle order. Labels are shown in the global toggle.
export const ODDS_FORMATS = ['implied', 'decimal', 'american'];
export const ODDS_FORMAT_LABELS = {
  implied: 'Implied',
  decimal: 'Decimal',
  american: 'American',
};

// Odds are stored as fixed-point integers; divide by 10^20 to get implied probability (0–1).
// `format` selects the display representation of that same probability:
//   implied  → probability as a 0–1 decimal (e.g. 0.5000)
//   decimal  → decimal odds (e.g. 2.00)
//   american → moneyline odds (e.g. +100 / −110)
export function convertOdds(raw, format = 'implied') {
  if (!raw) return '—';
  const implied = Number(raw) / 1e20;
  if (!(implied > 0)) return '—';

  switch (format) {
    case 'decimal':
      return (1 / implied).toFixed(2);
    case 'american': {
      // implied ≥ 1 is a (near-)certain outcome with no meaningful moneyline.
      if (implied >= 1) return '—';
      const decimal = 1 / implied;
      const american =
        decimal >= 2
          ? Math.round((decimal - 1) * 100)
          : Math.round(-100 / (decimal - 1));
      return `${american > 0 ? '+' : '−'}${Math.abs(american)}`;
    }
    case 'implied':
    default:
      return implied.toFixed(4);
  }
}

// Stake is in raw token units. USDC on Polygon uses 6 decimals.
export function formatStake(raw) {
  if (!raw) return '—';
  return (Number(raw) / 1e6).toFixed(2);
}

// bettingOutcomeOne=true  → user backed outcomeOneName
// bettingOutcomeOne=false → user backed outcomeTwoName
export function getBetOutcome(trade, market) {
  if (!market) return '—';
  return trade.bettingOutcomeOne ? market.outcomeOneName : market.outcomeTwoName;
}

// Normalizes the raw outcome value from either the trade or market object.
// Returns 'outcomeOne', 'outcomeTwo', 'push', or null (unsettled/unknown).
function parseRawOutcome(outcome) {
  if (outcome == null) return null;
  if (outcome === 0 || outcome === '0') return 'push';
  if (outcome === true  || outcome === 1 || outcome === '1') return 'outcomeOne';
  if (outcome === false || outcome === 2 || outcome === '2') return 'outcomeTwo';
  return null;
}

export function getResult(trade, market) {
  if (!trade.settled) return '—';
  // Use trade-level outcome first (most direct); fall back to market.outcome
  const raw = parseRawOutcome(trade.outcome ?? market?.outcome);
  if (raw === null)   return 'Pending';
  if (raw === 'push') return 'PUSH';
  return (trade.bettingOutcomeOne === (raw === 'outcomeOne')) ? 'WIN' : 'LOSS';
}

// Result for a single parlay leg: 'WIN', 'LOSS', 'PUSH', or null (unsettled)
export function getLegResult(leg) {
  const m = leg.marketData;
  if (!m) return null;
  const raw = parseRawOutcome(m.outcome);
  if (raw === null)   return null;
  if (raw === 'push') return 'PUSH';
  return (leg.bettingOutcomeOne === (raw === 'outcomeOne')) ? 'WIN' : 'LOSS';
}

// Realized P&L (profit/loss) in USDC, relative to the bettor's stake.
//   unsettled/pending → null  (shows "—")
//
// Matches SX Bet's own portfolio (sx-backend ce_profit_loss_events.ts):
//   profit = settleNetReturnValue + refunds − stake  (= totalReturned − totalRisked).
// SX uses net_return only for best-case/maxWin display, not realized P&L. Refunds
// (capital efficiency) are attached as `trade.ceRefund` from /trades/portfolio/refunds.
export function calculateReturn(trade) {
  if (!trade.settled) return null;
  const stakeNorm = Number(trade.stake) / 1e6;
  const settleNet = Number(trade.settleNetReturnValue ?? 0);
  const refund = Number(trade.ceRefund ?? 0);
  return settleNet + refund - stakeNorm;
}

export function formatDateTime(unixTimestamp) {
  if (!unixTimestamp) return '—';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(unixTimestamp * 1000));
}

export function formatMatchup(market) {
  if (!market) return '—';
  const t1 = market.teamOneName || market.outcomeOneName || '?';
  const t2 = market.teamTwoName || market.outcomeTwoName || '?';
  return `${t1} vs ${t2}`;
}
