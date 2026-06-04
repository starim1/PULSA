// 시간외 가격 진단 페이지
// 사용법: /api/krx-test?ticker=AVGO
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const ticker = (req.query.ticker || 'AVGO').toUpperCase();

  const host = req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const baseUrl = `${proto}://${host}`;

  // 1) PULSA 프록시 (앱이 호출하는 방식)
  let proxyMeta = null, proxyErr = null;
  try {
    const r = await fetch(`${baseUrl}/api/stock?symbol=${ticker}&range=1d&interval=1m`);
    if (r.ok) {
      const data = await r.json();
      proxyMeta = data?.chart?.result?.[0]?.meta || null;
    } else {
      proxyErr = `HTTP ${r.status}`;
    }
  } catch (e) {
    proxyErr = e.message;
  }

  // 시간 정보
  const now = new Date();
  const kst = now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const est = now.toLocaleString('en-US', { timeZone: 'America/New_York' });

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>시간외 가격 진단</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:680px;margin:14px auto;padding:0 12px;background:#0a1628;color:#e8e8ef}
h1{color:#10d090;font-size:20px}h2{color:#4a9eff;font-size:14px;margin-top:18px}
.card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px;margin-bottom:12px}
.ok{color:#26d782;font-weight:600}.fail{color:#ff4d6d;font-weight:600}.warn{color:#f5b53d;font-weight:600}
.kv{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px}
.kv:last-child{border:none}
.kv .k{color:#8a92a6;font-family:monospace}
.kv .v{font-family:'JetBrains Mono',monospace;color:#e8e8ef;font-weight:600;text-align:right;word-break:break-all;max-width:60%}
.big{font-size:28px;font-weight:700;color:#10d090;margin:8px 0}
input{width:100%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);color:#e8e8ef;padding:8px 12px;border-radius:6px;font-size:14px;box-sizing:border-box}
button{background:#10d090;color:#0a1628;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;margin-top:8px;font-size:13px}
form{margin-bottom:14px}
</style></head><body>

<h1>📊 시간외 가격 진단</h1>

<div class="card">
  <form method="get">
    <input name="ticker" value="${ticker}" placeholder="AVGO" style="text-transform:uppercase">
    <button type="submit">조회</button>
  </form>
</div>

<div class="card">
  <h2>현재 시간</h2>
  <div class="kv"><span class="k">한국 시간</span><span class="v">${kst}</span></div>
  <div class="kv"><span class="k">미국 동부 시간 (NY)</span><span class="v">${est}</span></div>
</div>

${proxyMeta ? `
<div class="card">
  <h2>${ticker} Yahoo 응답 데이터</h2>
  <div class="big">${proxyMeta.marketState || '?'}</div>
  <div style="font-size:11px;color:#8a92a6;margin-bottom:10px">
    PRE = 장 시작 전 | REGULAR = 정규장 중 | POST = 장 마감 직후 | POSTPOST = 다음날 새벽 데이마켓 | CLOSED = 휴장
  </div>
  
  <div class="kv"><span class="k">regularMarketPrice (정규장 종가)</span><span class="v">$${proxyMeta.regularMarketPrice || '?'}</span></div>
  <div class="kv"><span class="k">chartPreviousClose (전일 종가)</span><span class="v">$${proxyMeta.chartPreviousClose || '?'}</span></div>
  
  <h2>시간외 가격 (이게 있어야 데이마켓 표시 가능)</h2>
  <div class="kv"><span class="k">preMarketPrice</span><span class="v" style="color:${proxyMeta.preMarketPrice ? '#26d782' : '#ff4d6d'}">${proxyMeta.preMarketPrice ? '$' + proxyMeta.preMarketPrice : '❌ 없음'}</span></div>
  <div class="kv"><span class="k">preMarketChange</span><span class="v">${proxyMeta.preMarketChange != null ? proxyMeta.preMarketChange : '—'}</span></div>
  <div class="kv"><span class="k">preMarketChangePercent</span><span class="v">${proxyMeta.preMarketChangePercent != null ? proxyMeta.preMarketChangePercent.toFixed(2) + '%' : '—'}</span></div>
  
  <div class="kv"><span class="k">postMarketPrice</span><span class="v" style="color:${proxyMeta.postMarketPrice ? '#26d782' : '#ff4d6d'}">${proxyMeta.postMarketPrice ? '$' + proxyMeta.postMarketPrice : '❌ 없음'}</span></div>
  <div class="kv"><span class="k">postMarketChange</span><span class="v">${proxyMeta.postMarketChange != null ? proxyMeta.postMarketChange : '—'}</span></div>
  <div class="kv"><span class="k">postMarketChangePercent</span><span class="v">${proxyMeta.postMarketChangePercent != null ? proxyMeta.postMarketChangePercent.toFixed(2) + '%' : '—'}</span></div>
</div>

<div class="card" style="background:rgba(245,181,61,0.1);border-color:rgba(245,181,61,0.4)">
  <strong>🔍 진단 결과</strong><br><br>
  ${proxyMeta.marketState === 'REGULAR' 
    ? '✅ <strong>정규장 진행 중</strong> — 시간외 가격은 표시되지 않음 (정상)'
    : proxyMeta.postMarketPrice
      ? '✅ <strong>시간외 데이터 있음</strong> — PULSA에 "🌙 데이마켓 $' + proxyMeta.postMarketPrice + '" 표시되어야 함'
      : proxyMeta.preMarketPrice
        ? '✅ <strong>프리마켓 데이터 있음</strong> — PULSA에 "☀️ 프리마켓" 표시되어야 함'
        : '⚠️ <strong>marketState가 ' + proxyMeta.marketState + '이지만 시간외 가격이 없음</strong><br>주말이거나 휴장 중일 가능성. Yahoo가 시간외 데이터를 제공 안 함.<br><br>이런 경우 PULSA는 정규장 종가만 표시함 (정상 동작).'
  }
</div>
` : `<div class="card fail">에러: ${proxyErr || 'meta 없음'}</div>`}

</body></html>`;

  return res.status(200).send(html);
}
