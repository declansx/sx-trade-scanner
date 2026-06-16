import { useState } from 'react';

// Collapsible ⓘ context box shown above a page's filters.
export default function InfoCallout({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="info-callout">
      <button
        type="button"
        className="info-callout-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="info-callout-icon">ⓘ</span>
        <span className="info-callout-title">{title}</span>
        <span className="info-callout-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="info-callout-body">{children}</div>}
    </div>
  );
}
