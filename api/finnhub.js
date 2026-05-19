export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, type } = req.query;

  if (!process.env.FINNHUB_API_KEY) {
    return res.status(500).json({ error: 'FINNHUB_API_KEY not set' });
  }

  // symbol 없이도 호출 가능한 타입
  const symbolFreeTypes = new Set(['general_news', 'forex_news', 'crypto_news', 'merger_news', 'earnings_calendar']);
  if (!symbol && !symbolFreeTypes.has(type)) {
    return res.status(400).json({ error: 'symbol required' });
  }

  // 종목별 뉴스: 최근 30일 범위
  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(fromDate.getDate() - 30);
  const fromStr = fromDate.toISOString().split('T')[0];
  const toStr = today.toISOString().split('T')[0];

  // 실적 캘린더: 과거 7일 ~ 미래 90일
  const earnFrom = new Date(today.getTime() - 7*24*60*60*1000).toISOString().slice(0,10);
  const earnTo = new Date(today.getTime() + 90*24*60*60*1000).toISOString().slice(0,10);

  const endpoints = {
    recommend: `/stock/recommendation?symbol=${symbol}`,
    target: `/stock/price-target?symbol=${symbol}`,
    profile: `/stock/profile2?symbol=${symbol}`,
    metric: `/stock/metric?symbol=${symbol}&metric=all`,
    quote: `/quote?symbol=${symbol}`,
    etf_holdings: `/etf/holdings?symbol=${symbol}`,
    etf_profile: `/etf/profile?symbol=${symbol}`,
    company_news: `/company-news?symbol=${symbol}&from=${fromStr}&to=${toStr}`,
    general_news: `/news?category=general`,
    forex_news: `/news?category=forex`,
    crypto_news: `/news?category=crypto`,
    merger_news: `/news?category=merger`,
    // 펀더멘털 추이용 (basic_financials의 series 필드에 시계열 포함)
    basic_financials: `/stock/metric?symbol=${symbol}&metric=all`,
    // 분기 income statement
    financials_quarterly: `/stock/financials-reported?symbol=${symbol}&freq=quarterly`,
    financials_annual: `/stock/financials-reported?symbol=${symbol}&freq=annual`,
    // 분기 실적 (EPS actual/estimate)
    earnings: `/stock/earnings?symbol=${symbol}&limit=20`,
    // 전체 실적 캘린더 (과거 7일 ~ 미래 90일)
    earnings_calendar: `/calendar/earnings?from=${earnFrom}&to=${earnTo}`,
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
