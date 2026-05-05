// FMP stable endpoints (legacy v3는 2025-08-31 폐기됨)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, type } = req.query;

  if (!process.env.FMP_API_KEY) {
    return res.status(500).json({ error: 'FMP_API_KEY not set' });
  }

  // 종목 필요 없는 엔드포인트들
  const symbolFreeTypes = new Set(['gainers', 'losers', 'actives', 'earnings_cal']);
  if (!symbol && !symbolFreeTypes.has(type)) {
    return res.status(400).json({ error: 'symbol required' });
  }

  // 추가 쿼리 파라미터
  const { from, to } = req.query;

  // stable 엔드포인트 매핑
  const endpoints = {
    target: `/stable/price-target-consensus?symbol=${symbol}`,
    target_summary: `/stable/price-target-summary?symbol=${symbol}`,
    profile: `/stable/profile?symbol=${symbol}`,
    etf_holdings: `/stable/etf/holdings?symbol=${symbol}`,
    etf_info: `/stable/etf/info?symbol=${symbol}`,
    quote: `/stable/quote?symbol=${symbol}`,
    gainers: `/stable/biggest-gainers`,
    losers: `/stable/biggest-losers`,
    actives: `/stable/most-actives`,
    news: `/stable/news/stock?symbols=${symbol}&limit=5`,
    grades: `/stable/grades-consensus?symbol=${symbol}`,
    earnings_cal: `/stable/earnings-calendar${from?`?from=${from}&to=${to}`:''}`,
  };

  const path = endpoints[type] || endpoints.target;
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://financialmodelingprep.com${path}${sep}apikey=${process.env.FMP_API_KEY}`;

  try {
    const r = await fetch(url);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!r.ok) {
      return res.status(r.status).json({ error: 'FMP error', status: r.status, details: data });
    }
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
