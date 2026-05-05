export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, type } = req.query;
  if (!symbol && type !== 'gainers' && type !== 'losers' && type !== 'actives') {
    return res.status(400).json({ error: 'symbol required' });
  }
  if (!process.env.FMP_API_KEY) {
    return res.status(500).json({ error: 'FMP_API_KEY not set' });
  }

  const endpoints = {
    target: `/v3/price-target-consensus?symbol=${symbol}`,
    profile: `/v3/profile/${symbol}`,
    etf_holdings: `/v3/etf-holder/${symbol}`,
    etf_info: `/v4/etf-info?symbol=${symbol}`,
    quote: `/v3/quote/${symbol}`,
    gainers: `/v3/stock_market/gainers`,
    losers: `/v3/stock_market/losers`,
    actives: `/v3/stock_market/actives`,
    news: `/v3/stock_news?tickers=${symbol}&limit=5`,
  };

  const path = endpoints[type] || endpoints.target;
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://financialmodelingprep.com/api${path}${sep}apikey=${process.env.FMP_API_KEY}`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ error: 'FMP error', details: data });
    }
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
