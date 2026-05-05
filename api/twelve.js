export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, type } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });
  if (!process.env.TWELVE_DATA_KEY) {
    return res.status(500).json({ error: 'TWELVE_DATA_KEY not set' });
  }

  // type: 'price_target' | 'analyst_ratings' | 'profile' | 'statistics' | 'quote'
  const endpoints = {
    price_target: `/price_target?symbol=${symbol}`,
    analyst_ratings: `/recommendations?symbol=${symbol}`,
    profile: `/profile?symbol=${symbol}`,
    statistics: `/statistics?symbol=${symbol}`,
    quote: `/quote?symbol=${symbol}`,
  };

  const path = endpoints[type] || endpoints.price_target;
  const url = `https://api.twelvedata.com${path}&apikey=${process.env.TWELVE_DATA_KEY}`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    if (!r.ok || data?.status === 'error') {
      return res.status(r.status || 502).json({ error: 'TwelveData error', details: data });
    }
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
