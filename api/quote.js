export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, modules } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const mods = modules || 'price,summaryDetail,summaryProfile,financialData,defaultKeyStatistics,assetProfile,topHoldings,fundProfile,recommendationTrend,calendarEvents,earnings';

  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

  for (const host of hosts) {
    try {
      const url = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/',
        }
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.quoteSummary?.result?.[0]) return res.json(data);
    } catch (e) { continue; }
  }

  // Fallback: 핵심 모듈만 시도
  for (const host of hosts) {
    try {
      const url = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,financialData`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com/',
        }
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.quoteSummary?.result?.[0]) return res.json(data);
    } catch (e) { continue; }
  }

  return res.status(502).json({ error: 'fetch failed' });
}
