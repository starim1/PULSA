// 매일 한국 시간 아침 7시 (UTC 22시) 실행
// 주요 API를 미리 호출해서 Vercel Edge Cache를 따뜻하게 데움
// 사용자가 앱 열면 미리 캐시된 빠른 응답을 받음

export default async function handler(req, res) {
  // Vercel Cron이 호출하는지 확인 (선택적 보안)
  const isVercelCron = req.headers['x-vercel-cron'] === '1' || req.headers['user-agent']?.includes('vercel-cron');

  res.setHeader('Access-Control-Allow-Origin', '*');

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://pulsa-kohl.vercel.app';

  const results = {
    cron: isVercelCron,
    time: new Date().toISOString(),
    warmed: [],
    failed: [],
  };

  // 워밍할 endpoint 리스트
  const tasks = [
    // 주요 지수
    { name: 'index-sp500', url: `${baseUrl}/api/stock?symbol=%5EGSPC&range=1mo` },
    { name: 'index-nasdaq', url: `${baseUrl}/api/stock?symbol=%5EIXIC&range=1mo` },
    { name: 'index-dow', url: `${baseUrl}/api/stock?symbol=%5EDJI&range=1mo` },
    // 환율
    { name: 'usd-krw', url: `${baseUrl}/api/stock?symbol=KRW%3DX&range=1mo` },
    // 인기 종목 차트 데이터 미리 워밍 (Yahoo)
    { name: 'aapl', url: `${baseUrl}/api/stock?symbol=AAPL&range=1y` },
    { name: 'msft', url: `${baseUrl}/api/stock?symbol=MSFT&range=1y` },
    { name: 'googl', url: `${baseUrl}/api/stock?symbol=GOOGL&range=1y` },
    { name: 'amzn', url: `${baseUrl}/api/stock?symbol=AMZN&range=1y` },
    { name: 'nvda', url: `${baseUrl}/api/stock?symbol=NVDA&range=1y` },
    { name: 'tsla', url: `${baseUrl}/api/stock?symbol=TSLA&range=1y` },
    { name: 'meta', url: `${baseUrl}/api/stock?symbol=META&range=1y` },
    // 시장 뉴스 (Finnhub general)
    { name: 'market-news', url: `${baseUrl}/api/finnhub?type=general_news` },
    // FMP 일부 (관심 종목 뉴스, 지표 등)
    { name: 'fmp-gainers', url: `${baseUrl}/api/fmp?type=gainers` },
    { name: 'fmp-losers', url: `${baseUrl}/api/fmp?type=losers` },
    { name: 'fmp-actives', url: `${baseUrl}/api/fmp?type=actives` },
  ];

  // 병렬로 호출 (10초 타임아웃)
  await Promise.allSettled(
    tasks.map(async (task) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const r = await fetch(task.url, { signal: controller.signal });
        clearTimeout(timer);
        if (r.ok) {
          results.warmed.push(task.name);
        } else {
          results.failed.push({ name: task.name, status: r.status });
        }
      } catch (e) {
        results.failed.push({ name: task.name, error: e.message });
      }
    })
  );

  return res.status(200).json({
    success: true,
    summary: `Warmed ${results.warmed.length}/${tasks.length} endpoints`,
    ...results,
  });
}
