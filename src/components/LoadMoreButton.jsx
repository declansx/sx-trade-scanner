export default function LoadMoreButton({ onLoadMore, loading, count, hasMore }) {
  if (!hasMore) return null;

  return (
    <div className="load-more-row">
      <span className="count-label">{count} trades loaded</span>
      <button className="btn-secondary" onClick={onLoadMore} disabled={loading}>
        {loading ? <><span className="spinner" /> Loading…</> : 'Load More'}
      </button>
    </div>
  );
}
