// Odds are stored as fixed-point integers; divide by 10^20 to get implied probability (0–1).
export function convertOdds(raw) {
  if (!raw) return '—';
  return (Number(raw) / 1e20).toFixed(4);
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

// Net return (profit/loss) in USDC, relative to the bettor's stake.
//   unsettled/pending → null  (shows "—")
//
// Preferred path: SX's `netReturn` field is the authoritative gross amount returned
// to the bettor — stake + winnings when held to settlement, or the proceeds of a
// cash-out / capital-efficiency refund when the position was (partly) closed before
// settlement. Net P&L is therefore `netReturn - stake`.
//
// This matters because of capital efficiency: SX releases collateral early when a
// bettor's worst-case loss in a market group drops (CE refunds), and positions can be
// cashed out before the game settles. In both cases the bettor's realized return is
// NOT `±stake at full odds` — reconstructing from stake × odds would report a full win
// or a full loss for a position that actually returned something else entirely.
//
// Fallback (legacy trades without `netReturn`, e.g. older SXN-chain trades):
//   push              → 0     (shows "$0.00")
//   loss              → -stake
//   win               → (stake / impliedOdds) - stake
//   parlay with push leg → 0  (voided)
export function calculateReturn(trade, market) {
  if (!trade.settled) return null;
  const stakeNorm = Number(trade.stake) / 1e6;

  // `netReturn` is a string-encoded decimal token amount; "0" is a valid value
  // (a clean loss), so guard on presence rather than truthiness.
  if (trade.netReturn != null && trade.netReturn !== '') {
    return Number(trade.netReturn) - stakeNorm;
  }

  // ── Fallback: reconstruct from stake × odds (no refund/cash-out awareness) ──
  const impliedOdds = Number(trade.odds) / 1e20; // probability 0–1
  const result = getResult(trade, market);

  if (result === 'PUSH') return 0;
  if (result === 'LOSS') return -stakeNorm;
  if (result === 'WIN') {
    // A push on any parlay leg voids the whole parlay
    if (trade.parlayLegs?.some((leg) => getLegResult(leg) === 'PUSH')) return 0;
    return (stakeNorm / impliedOdds) - stakeNorm;
  }
  return null; // Pending
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
