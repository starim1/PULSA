export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol, modules } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const fullModules = modules || 'price,summaryDetail,summaryProfile,financialData,defaultKeyStatistics,assetProfile,topHoldings,fundProfile,recommendationTrend,calendarEvents,earnings';

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://finance.yahoo.com/',
    'Origin': 'https://finance.yahoo.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
  };

  // 시도 순서: 1) query1 + full, 2) query2 + full, 3) query1 + 핵심만, 4) query2 + 핵심만, 5) v7 fallback
  const attempts = [
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${fullModules}`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${fullModules}`,
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,financialData`,
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price,summaryDetail,defaultKeyStatistics,financialData`,
  ];

  const errors = [];

  for (const url of attempts) {
    try {
      const r = await fetch(url, { headers });
      const status = r.status;
      const text = await r.text();
      
      if (!r.ok) {
        errors.push({ url: url.split('?')[0].split('/').slice(-2).join('/'), status, body: text.substring(0, 200) });
        continue;
      }
      
      let data;
      try { data = JSON.parse(text); } catch (e) {
        errors.push({ url: url.split('?')[0].split('/').slice(-2).join('/'), status, parseError: e.message });
        continue;
      }
      
      if (data?.quoteSummary?.error) {
        errors.push({ url: url.split('?')[0].split('/').slice(-2).join('/'), status, yahooError: data.quoteSummary.error });
        continue;
      }
      
      if (data?.quoteSummary?.result?.[0]) {
        return res.json(data);
      }
      
      errors.push({ url: url.split('?')[0].split('/').slice(-2).join('/'), status, msg: 'no result' });
    } catch (e) {
      errors.push({ url: url.split('?')[0].split('/').slice(-2).join('/'), error: e.message });
    }
  }

  // 마지막 시도: v7 quote 엔드포인트 (제한적이지만 가용)
  try {
    const v7url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const r = await fetch(v7url, { headers });
    if (r.ok) {
      const data = await r.json();
      const q = data?.quoteResponse?.result?.[0];
      if (q) {
        // v7 응답을 quoteSummary 형식으로 변환
        return res.json({
          quoteSummary: {
            result: [{
              price: { 
                longName: q.longName ? { raw: q.longName } : undefined,
                shortName: q.shortName,
                marketCap: q.marketCap ? { raw: q.marketCap } : undefined,
                exchangeName: q.fullExchangeName,
              },
              summaryDetail: {
                trailingPE: q.trailingPE ? { raw: q.trailingPE } : undefined,
                dividendYield: q.dividendYield ? { raw: q.dividendYield/100 } : undefined,
                marketCap: q.marketCap ? { raw: q.marketCap } : undefined,
              },
              defaultKeyStatistics: {
                trailingEps: q.epsTrailingTwelveMonths ? { raw: q.epsTrailingTwelveMonths } : undefined,
                beta: q.beta ? { raw: q.beta } : undefined,
              },
              financialData: {
                targetMeanPrice: q.targetMeanPrice ? { raw: q.targetMeanPrice } : undefined,
                targetHighPrice: q.targetHighPrice ? { raw: q.targetHighPrice } : undefined,
                targetLowPrice: q.targetLowPrice ? { raw: q.targetLowPrice } : undefined,
              },
            }],
          },
          _source: 'v7-fallback',
        });
      }
    }
  } catch (e) { errors.push({ url: 'v7', error: e.message }); }

  return res.status(502).json({ error: 'all attempts failed', attempts: errors });
}
