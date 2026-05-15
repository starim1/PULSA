// Alpha Vantage API - 펀더멘털 추이 데이터 백업용
// 무료: 25 calls/day (2024년 기준), 5 calls/min
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, type } = req.query;

  if (!process.env.ALPHAVANTAGE_API_KEY) {
    return res.status(500).json({ error: 'ALPHAVANTAGE_API_KEY not set' });
  }

  if (!symbol) {
    return res.status(400).json({ error: 'symbol required' });
  }

  // 함수 매핑
  const functionMap = {
    income: 'INCOME_STATEMENT',
    balance: 'BALANCE_SHEET',
    cashflow: 'CASH_FLOW',
    earnings: 'EARNINGS',
    overview: 'OVERVIEW',
  };

  const fn = functionMap[type] || functionMap.income;
  const url = `https://www.alphavantage.co/query?function=${fn}&symbol=${symbol}&apikey=${process.env.ALPHAVANTAGE_API_KEY}`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    // Alpha Vantage는 한도 초과 시 'Note' 또는 'Information' 필드로 응답
    if (data.Note || data.Information) {
      return res.status(429).json({ error: 'AlphaVantage rate limit', details: data });
    }
    if (!r.ok) return res.status(r.status).json({ error: 'AlphaVantage error', details: data });
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
