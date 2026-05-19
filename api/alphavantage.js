// Alpha Vantage API
// 무료: 25 calls/day, 5 calls/min
// earnings_calendar: CSV 응답이라 별도 처리
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, type } = req.query;

  if (!process.env.ALPHAVANTAGE_API_KEY) {
    return res.status(500).json({ error: 'ALPHAVANTAGE_API_KEY not set' });
  }

  if (!symbol && type !== 'earnings_calendar') {
    return res.status(400).json({ error: 'symbol required' });
  }

  const functionMap = {
    income: 'INCOME_STATEMENT',
    balance: 'BALANCE_SHEET',
    cashflow: 'CASH_FLOW',
    earnings: 'EARNINGS',
    overview: 'OVERVIEW',
    earnings_calendar: 'EARNINGS_CALENDAR',
  };

  const fn = functionMap[type] || functionMap.income;
  let url = `https://www.alphavantage.co/query?function=${fn}&apikey=${process.env.ALPHAVANTAGE_API_KEY}`;
  if (symbol) url += `&symbol=${symbol}`;
  if (type === 'earnings_calendar') url += '&horizon=3month';

  try {
    const r = await fetch(url);
    
    if (type === 'earnings_calendar') {
      const csvText = await r.text();
      
      if (csvText.startsWith('{')) {
        try {
          const errData = JSON.parse(csvText);
          if (errData.Note || errData.Information) {
            return res.status(429).json({ error: 'AlphaVantage rate limit', details: errData });
          }
        } catch (e) {}
      }
      
      if (!r.ok) {
        return res.status(r.status).json({ error: 'AlphaVantage error', body: csvText.slice(0, 500) });
      }
      
      const lines = csvText.trim().split('\n');
      if (lines.length < 2) {
        return res.status(500).json({ error: 'Empty CSV', body: csvText.slice(0, 300) });
      }
      
      const headers = lines[0].split(',').map(h => h.trim());
      const earnings = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = (values[idx] || '').trim();
        });
        earnings.push(row);
      }
      
      return res.json({ count: earnings.length, earnings });
    }
    
    const data = await r.json();
    if (data.Note || data.Information) {
      return res.status(429).json({ error: 'AlphaVantage rate limit', details: data });
    }
    if (!r.ok) return res.status(r.status).json({ error: 'AlphaVantage error', details: data });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
