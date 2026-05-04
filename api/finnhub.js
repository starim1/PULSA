export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, type } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!process.env.FINNHUB_API_KEY) {
    return res.status(500).json({ error: 'FINNHUB_API_KEY not set' });
  }

  const endpoints = {
    recommend: `/stock/recommendation?symbol=${symbol}`,
    target: `/stock/price-target?symbol=${symbol}`,
    profile: `/stock/profile2?symbol=${symbol}`,
    metric: `/stock/metric?symbol=${symbol}&metric=all`,
    quote: `/quote?symbol=${symbol}`,
  };

  const path = endpoints[type] || endpoints.recommend;
  const url = `https://finnhub.io/api/v1${path}&token=${process.env.FINNHUB_API_KEY}`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: 'Finnhub error', details: data });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
