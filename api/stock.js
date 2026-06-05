export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, range = '1y', interval = '1d' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const sym = encodeURIComponent(symbol);

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://finance.yahoo.com',
  };

  // 1) Chart API (캔들 데이터) — 원래대로 안전하게
  const chartUrls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}`,
  ];

  let chartData = null;
  for (const url of chartUrls) {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.chart?.result?.[0]) {
        chartData = data;
        break;
      }
    } catch (e) { continue; }
  }

  if (!chartData) return res.status(502).json({ error: 'fetch failed' });

  // 2) v7/quote에서 시간외 보강 (best-effort) — 절대로 chart 응답을 막지 않음
  // 짧은 타임아웃을 줘서 느려도 chart 반환에 지장 없게
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);  // 2초 타임아웃
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${sym}`,
        { headers, signal: controller.signal }
      );
      clearTimeout(timeoutId);
      if (r.ok) {
        const data = await r.json();
        const q = data?.quoteResponse?.result?.[0];
        if (q) {
          const meta = chartData.chart.result[0].meta;
          if (q.marketState) meta.marketState = q.marketState;
          if (q.preMarketPrice != null) meta.preMarketPrice = q.preMarketPrice;
          if (q.preMarketChange != null) meta.preMarketChange = q.preMarketChange;
          if (q.preMarketChangePercent != null) meta.preMarketChangePercent = q.preMarketChangePercent;
          if (q.postMarketPrice != null) meta.postMarketPrice = q.postMarketPrice;
          if (q.postMarketChange != null) meta.postMarketChange = q.postMarketChange;
          if (q.postMarketChangePercent != null) meta.postMarketChangePercent = q.postMarketChangePercent;
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      // 무시
    }
  } catch (e) { /* 무시 */ }

  return res.json(chartData);
}
