export default function TradeFilters({ leagues, games, league, game, onLeagueChange, onGameChange }) {
  if (!leagues.length) return null;
  return (
    <div className="trade-filters">
      <span className="trade-filters__label">Filter:</span>
      <select value={league} onChange={(e) => onLeagueChange(e.target.value)}>
        <option value="">All Leagues</option>
        {leagues.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <select value={game} onChange={(e) => onGameChange(e.target.value)}>
        <option value="">All Games</option>
        {games.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
    </div>
  );
}
