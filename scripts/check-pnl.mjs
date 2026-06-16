#!/usr/bin/env node
// Regression check for settled-trade P&L.
//
// Pulls a wallet's consolidated trades straight from the SX API and asserts the
// invariants the app's Return column must satisfy. This is the guardrail that would
// have caught both bad formulas we tried:
//   - `netReturn - stake` on the PLAIN /trades endpoint (netReturn = potential payout)
//     → every bet shows a profit. Caught by INV-2 / INV-4.
//   - stake×odds reconstruction → losers that got refunds show a full loss.
//     Caught by INV-5 (diverges from authoritative realized netReturn).
//
// Usage:  node scripts/check-pnl.mjs <wallet> [--days N] [--perPage N]
//   default wallet is a known-active one; --days limits to the last N days.

const API = 'https://api.sx.bet';
const args = process.argv.slice(2);
const wallet = args.find((a) => a.startsWith('0x')) || '0x97EC1C9682F70091efB04e97b0B34698cF815EE1';
const days = Number((args.find((a) => a.startsWith('--days=')) || '').split('=')[1]) || null;
const perPage = Number((args.find((a) => a.startsWith('--perPage=')) || '').split('=')[1]) || 1000;

// Mirror of src/utils/tradeHelpers.js calculateReturn (consolidated shape).
function realizedReturn(t) {
  if (!t.settled) return null;
  if (t.netReturn == null || t.netReturn === '') return null;
  return Number(t.netReturn) - Number(t.totalStake);
}
// The OLD buggy formula, for divergence reporting.
function oldReturn(t) {
  const stake = Number(t.totalStake);
  const imp = Number(t.weightedAverageOdds) / 1e20;
  const o = t.outcome;
  if (o === 0) return 0; // push
  const won = (t.bettingOutcome === 1) === (o === 1);
  return won ? stake / imp - stake : -stake;
}

async function main() {
  const params = new URLSearchParams({ bettor: wallet, settled: 'true', sortAsc: 'false', page: '0', perPage: String(perPage) });
  if (days) params.set('startDate', String(Math.floor(Date.now() / 1000) - days * 86400));

  const res = await fetch(`${API}/trades/consolidated?${params}`);
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  const trades = (await res.json()).data?.trades ?? [];
  console.log(`wallet ${wallet} — ${trades.length} settled trades${days ? ` (last ${days}d)` : ''}\n`);
  if (!trades.length) return;

  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); };

  // INV-1: every settled trade exposes a usable netReturn.
  const missing = trades.filter((t) => t.netReturn == null || t.netReturn === '').length;
  check(missing === 0, `INV-1 netReturn present: ${missing} settled trades missing netReturn`);

  // INV-2: a loss (netReturn 0) must never display a profit.
  const losersWithProfit = trades.filter((t) => Number(t.netReturn) < 0.01 && realizedReturn(t) > 0.01);
  check(losersWithProfit.length === 0, `INV-2 no profit on losses: ${losersWithProfit.length} losses show profit`);

  // INV-3: pushes (outcome 0) net to ~0.
  const badPush = trades.filter((t) => t.outcome === 0 && Math.abs(realizedReturn(t)) > 0.02);
  check(badPush.length === 0, `INV-3 pushes net ~0: ${badPush.length} pushes with non-zero P&L`);

  // INV-4: not every bet wins (would indicate potential-payout, not realized).
  const winRate = trades.filter((t) => realizedReturn(t) > 0.01).length / trades.length;
  check(winRate < 0.95, `INV-4 win rate sane: ${(winRate * 100).toFixed(1)}% of bets show a profit (looks like potential payout, not realized)`);

  // INV-5: the old reconstruction must agree with realized netReturn EXCEPT on
  // refund trades. Any non-refund, non-push divergence means the reconstruction (or our
  // understanding) is broken.
  const corrected = trades.filter((t) => Math.abs(realizedReturn(t) - oldReturn(t)) > 0.02);
  const diffNoRefund = corrected.filter((t) => !t.marketHasRefunds && t.outcome !== 0);
  check(diffNoRefund.length === 0, `INV-5 divergence only from refunds: ${diffNoRefund.length} non-refund trades disagree with realized netReturn`);

  const totalNew = trades.reduce((s, t) => s + realizedReturn(t), 0);
  const totalOld = trades.reduce((s, t) => s + oldReturn(t), 0);
  const correctionUsd = corrected.reduce((s, t) => s + (realizedReturn(t) - oldReturn(t)), 0);

  console.log(`win rate (profitable bets):  ${(winRate * 100).toFixed(1)}%`);
  console.log(`refund-affected trades:      ${trades.filter((t) => t.marketHasRefunds).length}`);
  console.log(`partially-refunded bets the fix corrects: ${corrected.length}  (net P&L impact ${correctionUsd >= 0 ? '+' : ''}${correctionUsd.toFixed(2)})`);
  console.log(`total P&L  old/buggy=${totalOld.toFixed(2)}   new/correct=${totalNew.toFixed(2)}\n`);

  if (fails.length) {
    console.error('FAIL:');
    fails.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('PASS — all invariants hold.');
}

main().catch((e) => { console.error(e); process.exit(1); });
