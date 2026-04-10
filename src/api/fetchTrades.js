const BASE = '/api';

export async function fetchTrades({
  bettor,
  settled,
  pageSize,
  baseToken,
  paginationKey,
  startDate,
  endDate,
  maker,
  tradeStatus,
}) {
  const params = new URLSearchParams();
  params.set('bettor', bettor.trim());
  if (settled === 'settled') params.set('settled', 'true');
  if (settled === 'unsettled') params.set('settled', 'false');
  if (pageSize) params.set('pageSize', String(pageSize));
  if (baseToken && baseToken.trim()) params.set('baseToken', baseToken.trim());
  if (paginationKey) params.set('paginationKey', paginationKey);
  if (startDate) params.set('startDate', String(startDate));
  if (endDate) params.set('endDate', String(endDate));
  if (maker === 'maker') params.set('maker', 'true');
  if (maker === 'taker') params.set('maker', 'false');
  if (tradeStatus === 'SUCCESS') params.set('tradeStatus', 'SUCCESS');
  if (tradeStatus === 'FAILED') params.set('tradeStatus', 'FAILED');

  const res = await fetch(`${BASE}/trades?${params}`);
  if (!res.ok) throw new Error(`Trades API error: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.data;
}
