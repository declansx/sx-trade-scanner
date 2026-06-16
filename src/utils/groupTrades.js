// Group consolidated bets + refund events into one entry per market — mirroring SX Bet's
// portfolio page (the auth-gated /trades/consolidated/grouped/v2 endpoint), reconstructed
// from the public endpoints.
//
// Each group is a market with:
//   - bets:    individual consolidated trades (the "Bet" line items)
//   - refunds: refund events for the market (the "Refund" line items)
//   - aggregates: risked (Σstake − Σrefund), returned (Σ settled), profit (returned − risked)
//   - bestCase: the outcome label the bettor stands to win the most on
//   - score, weighted odds, game label
//
// At the market level P&L is unambiguous: profit = Σ settleNetReturn + Σ refunds − Σ stake,
// which is what SX shows (totalReturned − totalRisked).

function impliedToDecimal(rawOdds) {
  const implied = Number(rawOdds) / 1e20;
  return implied > 0 ? 1 / implied : 0;
}

export function buildMarketGroups(trades, refundEvents) {
  const groups = new Map();

  const labelFromMarket = (m) =>
    m?.teamOneName ? `${m.teamOneName} vs ${m.teamTwoName}` : null;

  // Normalize gameTime to unix seconds (consolidated trades give an ISO string;
  // enriched market data gives unix seconds).
  const toUnix = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
  };

  const ensure = (hash, seed) => {
    if (!groups.has(hash)) {
      groups.set(hash, {
        marketHash: hash,
        market: seed.market ?? null,
        // consolidated trades carry `gameLabel` directly; fall back to market teams.
        gameLabel: seed.gameLabel ?? labelFromMarket(seed.market) ?? '—',
        leagueLabel: seed.leagueLabel ?? seed.market?.leagueLabel ?? null,
        gameTime: seed.market?.gameTime ?? toUnix(seed.gameTime),
        betTime: 0,
        bets: [],
        refunds: [],
      });
    }
    return groups.get(hash);
  };

  for (const t of trades) {
    const g = ensure(t.marketHash, t);
    g.bets.push(t);
    if ((t.betTime ?? 0) > g.betTime) g.betTime = t.betTime ?? 0;
  }

  // Side label lookup for refunds: a refund's fillOrderHash matches the bet it came from.
  // We also collect the set of fills actually present so refunds can be matched to their
  // originating bet — not just the market.
  const sideByFillOrderHash = {};
  const fillOrderHashes = new Set();
  for (const t of trades) {
    if (t.fillOrderHash) {
      sideByFillOrderHash[t.fillOrderHash] = t.bettingOutcomeLabel;
      fillOrderHashes.add(t.fillOrderHash);
    }
    for (const leg of t.quarterLegs ?? []) {
      if (leg.fillOrderHash) {
        sideByFillOrderHash[leg.fillOrderHash] = leg.bettingOutcomeLabel;
        fillOrderHashes.add(leg.fillOrderHash);
      }
    }
  }

  for (const ev of refundEvents) {
    const g = groups.get(ev.marketHash);
    if (!g) continue; // refund for a market not in the current (filtered) view
    // Only attach a refund whose originating bet is actually in this (possibly date-filtered)
    // set. Matching by marketHash alone would pull in refunds for bets that were filtered
    // out — producing more refunds than bets and inflating the market's refund total.
    if (!fillOrderHashes.has(ev.fillOrderHash)) continue;
    g.refunds.push({ ...ev, sideLabel: sideByFillOrderHash[ev.fillOrderHash] ?? null });
  }

  // Finalize aggregates per group.
  const out = [];
  for (const g of groups.values()) {
    // Mirror SX Bet's own portfolio P&L (sx-backend ce_profit_loss_events.ts):
    //   totalRisked   = Σ total_stake − Σ refund_amount      (refunds reduce wagered)
    //   totalReturned = Σ settle_net_return                  (REFUND rows contribute 0)
    //   profit        = totalReturned − totalRisked = Σ settleNetReturnValue + Σ refunds − Σ stake
    // (SX uses net_return only for best-case/maxWin, NOT realized P&L.)
    const totalStake = g.bets.reduce((s, b) => s + Number(b.totalStake ?? 0), 0);
    const totalRefund = g.refunds.reduce((s, r) => s + r.amount, 0);
    const totalSettled = g.bets.reduce((s, b) => s + Number(b.settleNetReturnValue ?? 0), 0);

    g.risked = totalStake - totalRefund;                // SX "totalRisked" (Transferred)
    g.returned = totalSettled;                          // SX "totalReturned"
    g.profit = totalSettled + totalRefund - totalStake; // = returned − risked
    g.settled = g.bets.every((b) => b.settled);

    // Best case: the outcome the bettor would win the most on.
    let winIf1 = 0, winIf2 = 0, label1 = null, label2 = null;
    for (const b of g.bets) {
      const payout = (Number(b.totalStake ?? 0)) * impliedToDecimal(b.odds);
      if (b.bettingOutcome === 1) { winIf1 += payout; label1 = b.bettingOutcomeLabel; }
      else { winIf2 += payout; label2 = b.bettingOutcomeLabel; }
    }
    g.isTeam1MaxWin = winIf1 >= winIf2;
    g.bestCaseLabel = g.isTeam1MaxWin ? (label1 ?? label2) : (label2 ?? label1);

    // Stake-weighted average odds across the bets. Stored as the raw fixed-point value so
    // the view can render it in the user's chosen odds format (see useFormatOdds).
    const wImplied =
      totalStake > 0
        ? g.bets.reduce((s, b) => s + Number(b.totalStake ?? 0) * (Number(b.odds) / 1e20), 0) / totalStake
        : 0;
    g.oddsRaw = wImplied > 0 ? String(wImplied * 1e20) : null;

    // Score, if the market carries final scores.
    const m = g.market ?? {};
    g.score =
      m.teamOneScore != null && m.teamTwoScore != null
        ? `${m.teamOneScore}-${m.teamTwoScore}`
        : null;

    out.push(g);
  }

  // Newest first by game time (the time column the table is organized around); markets
  // with no known game time fall back to most recent bet, and sort last.
  out.sort((a, b) => (b.gameTime ?? b.betTime ?? 0) - (a.gameTime ?? a.betTime ?? 0));
  return out;
}
