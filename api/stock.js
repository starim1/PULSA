export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, range = '1y', interval = '1d' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const sym = encodeURIComponent(symbol);
  
  // 1) Chart API (캔들 데이터)
  const chartUrls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=${interval}&range=${range}`,
  ];
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/javascript,*/*;q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
  };

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
  
  // 2) v7/quote에서 시간외 + marketState 보강 (chart에는 없는 경우 다수)
  try {
    const quoteUrls = [
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${sym}`,
      `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${sym}`,
    ];
    for (const url of quoteUrls) {
      try {
        const r = await fetch(url, { headers });
        if (!r.ok) continue;
        const data = await r.json();
        const q = data?.quoteResponse?.result?.[0];
        if (q) {
          // chart meta에 시간외 필드 병합 (v7/quote가 더 정확)
          const meta = chartData.chart.result[0].meta;
          meta.marketState = q.marketState || meta.marketState;
          if (q.preMarketPrice != null) meta.preMarketPrice = q.preMarketPrice;
          if (q.preMarketChange != null) meta.preMarketChange = q.preMarketChange;
          if (q.preMarketChangePercent != null) meta.preMarketChangePercent = q.preMarketChangePercent;
          if (q.postMarketPrice != null) meta.postMarketPrice = q.postMarketPrice;
          if (q.postMarketChange != null) meta.postMarketChange = q.postMarketChange;
          if (q.postMarketChangePercent != null) meta.postMarketChangePercent = q.postMarketChangePercent;
          break;
        }
      } catch (e) { continue; }
    }
  } catch (e) { /* 보강 실패해도 chart 데이터는 그대로 반환 */ }
  
  return res.json(chartData);
}
