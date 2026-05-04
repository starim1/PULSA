export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, modules } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const mods = modules || 'price,summaryProfile,financialData,defaultKeyStatistics,assetProfile,topHoldings,fundProfile,recommendationTrend';

  const urls = [
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${mods}`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=${mods}`,
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com',
        }
      });
      if (!r.ok) continue;
      const data = await r.json();
      if (data?.quoteSummary?.result?.[0]) return res.json(data);
    } catch (e) { continue; }
  }

  return res.status(502).json({ error: 'fetch failed' });
}
