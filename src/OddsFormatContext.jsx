import { createContext, useCallback, useContext, useState } from 'react';
import { convertOdds, ODDS_FORMATS } from './utils/tradeHelpers.js';

const STORAGE_KEY = 'trade-scanner:oddsFormat';

const OddsFormatContext = createContext(null);

function loadInitial() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (ODDS_FORMATS.includes(saved)) return saved;
  } catch {
    /* localStorage unavailable (SSR / privacy mode) — fall through to default */
  }
  return 'implied';
}

export function OddsFormatProvider({ children }) {
  const [format, setFormatState] = useState(loadInitial);

  const setFormat = useCallback((next) => {
    setFormatState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence failures */
    }
  }, []);

  return (
    <OddsFormatContext.Provider value={{ format, setFormat }}>
      {children}
    </OddsFormatContext.Provider>
  );
}

// Current format string ('implied' | 'percent' | 'american').
export function useOddsFormat() {
  return useContext(OddsFormatContext)?.format ?? 'implied';
}

// { format, setFormat } — for the toggle control.
export function useOddsFormatControl() {
  return useContext(OddsFormatContext);
}

// Bound formatter: fmtOdds(rawOdds) → display string in the current format.
export function useFormatOdds() {
  const format = useOddsFormat();
  return useCallback((raw) => convertOdds(raw, format), [format]);
}
