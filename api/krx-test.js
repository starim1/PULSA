// 시간외 가격 진단 페이지 (여러 range로 비교)
// 사용법: /api/krx-test?ticker=AVGO
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const ticker = (req.query.ticker || 'AVGO').toUpperCase();
  
  const host = req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;
  
  // 여러 range로 호출해 비교
  const ranges = ['1d', '5d', '1mo'];
  const results = {};
  
  for (const range of ranges) {
    const interval = range === '1d' ? '1m' : (range === '5d' ? '5m' : '1d');
    const url = `${baseUrl}/api/stock?symbol=${ticker}&range=${range}&interval=${interval}`;
    try {
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta) {
          results[range] = {
            ok: true,
            marketState: meta.marketState,
            regularMarketPrice: meta.regularMarketPrice,
            chartPreviousClose: meta.chartPreviousClose,
            previousClose: meta.previousClose,
            preMarketPrice: meta.preMarketPrice,
            preMarketChange: meta.preMarketChange,
            preMarketChangePercent: meta.preMarketChangePercent,
            postMarketPrice: meta.postMarketPrice,
            postMarketChange: meta.postMarketChange,
            postMarketChangePercent: meta.postMarketChangePercent,
          };
        } else {
          results[range] = { ok: false, error: 'no meta' };
        }
      } else {
        results[range] = { ok: false, error: `HTTP ${r.status}` };
      }
    } catch (e) {
      results[range] = { ok: false, error: e.message };
    }
  }
  
  const now = new Date();
  const kst = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' });
  const est = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  
  const fmt = (v) => v == null ? '<span style="color:#ff4d6d">없음</span>' : 
    (typeof v === 'number' ? `<span style="color:#26d782">$${v}</span>` : `<span style="color:#26d782">${v}</span>`);
  
  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>시간외 가격 진단</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:680px;margin:14px auto;padding:0 12px;background:#0a1628;color:#e8e8ef}
h1{color:#10d090;font-size:20px}
h2{color:#4a9eff;font-size:14px;margin-top:18px;border-bottom:1px solid rgba(74,158,255,0.3);padding-bottom:4px}
.card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px;margin-bottom:12px}
.kv{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px}
.kv:last-child{border:none}
.kv .k{color:#8a92a6;font-family:monospace}
.kv .v{font-family:'JetBrains Mono',monospace;color:#e8e8ef;font-weight:600;text-align:right;word-break:break-all;max-width:60%}
.big{font-size:24px;font-weight:700;margin:8px 0}
input{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#e8e8ef;padding:8px 12px;border-radius:6px;font-size:14px;box-sizing:border-box}
button{background:#10d090;color:#0a1628;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;margin-top:8px;font-size:13px}
.tag{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-right:4px}
.t-ok{background:rgba(38,215,130,0.2);color:#26d782}
.t-fail{background:rgba(255,77,109,0.2);color:#ff4d6d}
</style></head><body>

<h1>📊 시간외 가격 진단 (다중 range)</h1>

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

${ranges.map(r => {
  const d = results[r];
  if (!d.ok) return `<div class="card"><h2>range=${r}</h2><span class="tag t-fail">❌ ${d.error}</span></div>`;
  
  return `<div class="card">
    <h2>range=${r}</h2>
    <div class="big" style="color:${d.marketState ? '#10d090' : '#f5b53d'}">marketState: ${d.marketState || 'undefined'}</div>
    <div class="kv"><span class="k">regularMarketPrice</span><span class="v">${fmt(d.regularMarketPrice)}</span></div>
    <div class="kv"><span class="k">chartPreviousClose</span><span class="v">${fmt(d.chartPreviousClose)}</span></div>
    <div class="kv"><span class="k">previousClose</span><span class="v">${fmt(d.previousClose)}</span></div>
    <div class="kv"><span class="k">preMarketPrice</span><span class="v">${fmt(d.preMarketPrice)}</span></div>
    <div class="kv"><span class="k">preMarketChange</span><span class="v">${d.preMarketChange != null ? d.preMarketChange : '—'}</span></div>
    <div class="kv"><span class="k">preMarketChangePercent</span><span class="v">${d.preMarketChangePercent != null ? d.preMarketChangePercent.toFixed(2) + '%' : '—'}</span></div>
    <div class="kv"><span class="k">postMarketPrice</span><span class="v">${fmt(d.postMarketPrice)}</span></div>
    <div class="kv"><span class="k">postMarketChange</span><span class="v">${d.postMarketChange != null ? d.postMarketChange : '—'}</span></div>
    <div class="kv"><span class="k">postMarketChangePercent</span><span class="v">${d.postMarketChangePercent != null ? d.postMarketChangePercent.toFixed(2) + '%' : '—'}</span></div>
  </div>`;
}).join('')}

</body></html>`;

  return res.status(200).send(html);
}
