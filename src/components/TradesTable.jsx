import MarketRow from './MarketRow.jsx';

export default function TradesTable({ groups, bettor }) {
  if (!groups.length) return null;

  return (
    <div className="table-wrapper">
      <table className="trades-table market-table">
        <thead>
          <tr>
            <th>Game Time</th>
            <th>Game</th>
            <th>Best Case</th>
            <th>Score</th>
            <th className="td-right">Risk</th>
            <th className="td-right">Odds</th>
            <th className="td-right">Profit</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <MarketRow key={group.marketHash} group={group} bettor={bettor} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
