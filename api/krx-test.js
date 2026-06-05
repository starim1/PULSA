// 시간외 가격 다중 소스 진단
// /api/krx-test?ticker=AVGO
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const ticker = (req.query.ticker || 'AVGO').toUpperCase();
  
  const host = req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;
  
  const sources = {};
  
  // 1) Yahoo v7/finance/quote (시간외 잘 제공)
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://finance.yahoo.com',
      }
    });
    if (r.ok) {
      const data = await r.json();
      const q = data?.quoteResponse?.result?.[0];
      if (q) {
        sources['Yahoo v7/quote (직접)'] = {
          marketState: q.marketState,
          regularMarketPrice: q.regularMarketPrice,
          regularMarketChange: q.regularMarketChange,
          regularMarketPreviousClose: q.regularMarketPreviousClose,
          preMarketPrice: q.preMarketPrice,
          preMarketChange: q.preMarketChange,
          preMarketChangePercent: q.preMarketChangePercent,
          postMarketPrice: q.postMarketPrice,
          postMarketChange: q.postMarketChange,
          postMarketChangePercent: q.postMarketChangePercent,
        };
      } else {
        sources['Yahoo v7/quote (직접)'] = { error: 'no result' };
      }
    } else {
      sources['Yahoo v7/quote (직접)'] = { error: `HTTP ${r.status}` };
    }
  } catch (e) {
    sources['Yahoo v7/quote (직접)'] = { error: e.message };
  }
  
  // 2) Finnhub /quote (앱이 가진 키)
  try {
    const r = await fetch(`${baseUrl}/api/finnhub?symbol=${ticker}&type=quote`);
    if (r.ok) {
      const q = await r.json();
      sources['Finnhub /quote (프록시)'] = {
        c: q.c,        // current
        pc: q.pc,      // previous close
        o: q.o,        // open
        h: q.h,        // high
        l: q.l,        // low
        d: q.d,        // change
        dp: q.dp,      // change %
        t: q.t,        // timestamp
      };
    } else {
      sources['Finnhub /quote (프록시)'] = { error: `HTTP ${r.status}` };
    }
  } catch (e) {
    sources['Finnhub /quote (프록시)'] = { error: e.message };
  }
  
  // 3) Yahoo chart (현재 PULSA가 사용하는 방식)
  try {
    const r = await fetch(`${baseUrl}/api/stock?symbol=${ticker}&range=1d&interval=1m`);
    if (r.ok) {
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        sources['Yahoo chart (PULSA 현재 방식)'] = {
          marketState: meta.marketState,
          regularMarketPrice: meta.regularMarketPrice,
          chartPreviousClose: meta.chartPreviousClose,
          preMarketPrice: meta.preMarketPrice,
          postMarketPrice: meta.postMarketPrice,
        };
      }
    }
  } catch (e) {}
  
  const now = new Date();
  const kst = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'long' });
  const est = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' });
  
  const fmt = (v) => v == null ? '<span style="color:#ff4d6d">없음</span>' : 
    (typeof v === 'number' ? `<span style="color:#26d782">${v}</span>` : `<span style="color:#26d782">${v}</span>`);
  
  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>다중 소스 진단</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:680px;margin:14px auto;padding:0 12px;background:#0a1628;color:#e8e8ef}
h1{color:#10d090;font-size:20px}
h2{color:#4a9eff;font-size:14px;margin-top:18px;border-bottom:1px solid rgba(74,158,255,0.3);padding-bottom:4px}
.card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px;margin-bottom:12px}
.kv{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px}
.kv:last-child{border:none}
.kv .k{color:#8a92a6;font-family:monospace}
.kv .v{font-family:'JetBrains Mono',monospace;font-weight:600;text-align:right;word-break:break-all;max-width:60%}
input{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#e8e8ef;padding:8px 12px;border-radius:6px;font-size:14px;box-sizing:border-box}
button{background:#10d090;color:#0a1628;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;margin-top:8px;font-size:13px}
</style></head><body>

<h1>📊 시간외 가격 다중 소스 진단</h1>

<div class="card">
  <form method="get">
    <input name="ticker" value="${ticker}" placeholder="AVGO" style="text-transform:uppercase">
    <button type="submit">조회</button>
  </form>
</div>

<div class="card">
  <h2>현재 시간</h2>
  <div class="kv"><span class="k">한국</span><span class="v">${kst}</span></div>
  <div class="kv"><span class="k">미국 NY</span><span class="v">${est}</span></div>
</div>

${Object.entries(sources).map(([name, d]) => {
  if (d.error) return `<div class="card"><h2>${name}</h2><span style="color:#ff4d6d">❌ ${d.error}</span></div>`;
  
  return `<div class="card">
    <h2>${name}</h2>
    ${Object.entries(d).map(([k, v]) => `<div class="kv"><span class="k">${k}</span><span class="v">${fmt(v)}</span></div>`).join('')}
  </div>`;
}).join('')}

</body></html>`;

  return res.status(200).send(html);
}
