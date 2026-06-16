import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export function truncateHash(h) {
  if (!h) return null;
  return h.length > 20 ? `${h.slice(0, 10)}…${h.slice(-8)}` : h;
}

export function field(id, label, value, display) {
  const v = value != null ? String(value) : null;
  return { id, label, value: v, display: display ?? v };
}

function useMetaHover() {
  const [metaPos, setMetaPos] = useState(null);
  const hideTimeout = useRef(null);
  const iconRef = useRef(null);

  const showMeta = useCallback(() => {
    clearTimeout(hideTimeout.current);
    if (iconRef.current) {
      const r = iconRef.current.getBoundingClientRect();
      const tooltipWidth = 300;
      const left =
        r.right + 8 + tooltipWidth > window.innerWidth
          ? r.left - tooltipWidth - 8
          : r.right + 8;
      setMetaPos({ top: r.bottom + 6, left });
    }
  }, []);

  const hideMeta = useCallback(() => {
    hideTimeout.current = setTimeout(() => setMetaPos(null), 150);
  }, []);

  return { metaPos, iconRef, showMeta, hideMeta };
}

function TooltipPanel({ sections, pos, onMouseEnter, onMouseLeave }) {
  const [copied, setCopied] = useState(null);

  const copy = (id, value) => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1200);
    });
  };

  return createPortal(
    <div
      className="trade-meta-tooltip"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {sections.map((section, si) => (
        <div key={section.title}>
          <div className={`meta-section${si === 0 ? ' meta-section--first' : ''}`}>
            {section.title}
          </div>
          {section.fields.map((f) => {
            const isCopied = copied === f.id;
            const canCopy = !!f.value;
            return (
              <div
                key={f.id}
                className={`meta-row${canCopy ? ' meta-row--copyable' : ' meta-row--empty'}`}
                onClick={(e) => { e.stopPropagation(); copy(f.id, f.value); }}
              >
                <span className="meta-label">{f.label}</span>
                <span className={`meta-value${isCopied ? ' meta-value--copied' : ''}`}>
                  {isCopied ? '✓ copied' : (f.display ?? '—')}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>,
    document.body
  );
}

// Hover ⓘ button with a metadata tooltip. `sections` is an array of
// { title, fields: [field(...)] }.
export function InfoButton({ sections, className = '' }) {
  const { metaPos, iconRef, showMeta, hideMeta } = useMetaHover();
  return (
    <>
      <button
        ref={iconRef}
        className={`info-btn ${className}`}
        onMouseEnter={showMeta}
        onMouseLeave={hideMeta}
        onClick={(e) => e.stopPropagation()}
        aria-label="Metadata"
      >
        ⓘ
      </button>
      {metaPos && (
        <TooltipPanel sections={sections} pos={metaPos} onMouseEnter={showMeta} onMouseLeave={hideMeta} />
      )}
    </>
  );
}
