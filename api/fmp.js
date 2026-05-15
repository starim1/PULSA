// FMP stable endpoints (legacy v3는 2025-08-31 폐기됨)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, type } = req.query;

  if (!process.env.FMP_API_KEY) {
    return res.status(500).json({ error: 'FMP_API_KEY not set' });
  }

  // 종목 필요 없는 엔드포인트들
  const symbolFreeTypes = new Set(['gainers', 'losers', 'actives', 'earnings_cal', 'general_news']);
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
    news: `/stable/news/stock?symbols=${symbol}&limit=12`,
    general_news: `/stable/news/general-latest?limit=20`,
    ratios: `/stable/ratios?symbol=${symbol}&limit=4`,
    key_metrics: `/stable/key-metrics?symbol=${symbol}&limit=4`,
    insider: `/stable/insider-trading?symbol=${symbol}&limit=15`,
    earnings_history: `/stable/historical-earnings?symbol=${symbol}&limit=8`,
    grades: `/stable/grades-consensus?symbol=${symbol}`,
    earnings_cal: `/stable/earnings-calendar${from?`?from=${from}&to=${to}`:''}`,
    income_quarterly: `/stable/income-statement?symbol=${symbol}&period=quarter&limit=20`,
    ratios_quarterly: `/stable/ratios?symbol=${symbol}&period=quarter&limit=20`,
    cashflow_quarterly: `/stable/cash-flow-statement?symbol=${symbol}&period=quarter&limit=20`,
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
