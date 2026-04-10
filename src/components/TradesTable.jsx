import TradeRow from './TradeRow.jsx';

export default function TradesTable({ trades }) {
  if (!trades.length) return null;

  return (
    <div className="table-wrapper">
      <table className="trades-table">
        <thead>
          <tr>
            <th className="th-role"></th>
            <th>Bet Time</th>
            <th>League</th>
            <th>Match</th>
            <th>Bet On</th>
            <th className="td-right">Odds</th>
            <th className="td-right">Stake</th>
            <th className="td-right">Return</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade) => (
            <TradeRow key={trade.fillHash} trade={trade} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
