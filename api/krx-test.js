// PULSA 프록시(/api/finnhub) 통한 실적 캘린더 진단
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const host = req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] || 'https');
  const baseUrl = `${proto}://${host}`;

  let proxyResult = null, proxyError = null;
  try {
    const r = await fetch(`${baseUrl}/api/finnhub?type=earnings_calendar`);
    const text = await r.text();
    if (r.ok) {
      try {
        const data = JSON.parse(text);
        const list = data.earningsCalendar || [];
        proxyResult = {
          status: r.status,
          count: list.length,
          sample: list.slice(0, 5),
          nvda: list.find(e => e.symbol === 'NVDA'),
          hasKey: 'earningsCalendar' in data,
          rawKeys: Object.keys(data),
          rawSnippet: text.slice(0, 500),
        };
      } catch (e) {
        proxyError = `JSON 파싱 실패: ${text.slice(0, 500)}`;
      }
    } else {
      proxyError = `HTTP ${r.status}: ${text.slice(0, 500)}`;
    }
  } catch (e) {
    proxyError = `예외: ${e.message}`;
  }

  let nvdaResult = null, nvdaError = null;
  try {
    const r = await fetch(`${baseUrl}/api/finnhub?symbol=NVDA&type=earnings`);
    const text = await r.text();
    if (r.ok) {
      try {
        const data = JSON.parse(text);
        nvdaResult = {
          isArray: Array.isArray(data),
          count: Array.isArray(data) ? data.length : 0,
          sample: Array.isArray(data) ? data.slice(0, 3) : data,
          futureItems: Array.isArray(data) ? data.filter(d => d.actual == null) : [],
        };
      } catch (e) {
        nvdaError = `JSON 파싱 실패: ${text.slice(0, 500)}`;
      }
    } else {
      nvdaError = `HTTP ${r.status}: ${text.slice(0, 500)}`;
    }
  } catch (e) {
    nvdaError = `예외: ${e.message}`;
  }

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>실적 캘린더 진단 V2</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:700px;margin:14px auto;padding:0 12px;background:#0a1628;color:#e8e8ef}
h1{color:#10d090;font-size:20px}h2{color:#4a9eff;font-size:15px;margin-top:20px}
.card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px;margin-bottom:12px}
.ok{color:#26d782;font-weight:600}.fail{color:#ff4d6d;font-weight:600}.warn{color:#f5b53d;font-weight:600}
.num{font-size:24px;font-weight:700;color:#10d090}
pre{background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
</style></head><body>

<h1>📅 실적 캘린더 진단 V2</h1>
<div class="card">PULSA 앱이 실제 호출하는 방식과 동일하게 테스트</div>

<h2>1️⃣ /api/finnhub?type=earnings_calendar</h2>
${proxyResult ? `
<div class="card">
  <div>받아온 개수: <span class="num">${proxyResult.count}</span></div>
  <div style="margin-top:6px">earningsCalendar 키: ${proxyResult.hasKey ? '<span class="ok">✅</span>' : '<span class="fail">❌</span>'}</div>
  <div style="margin-top:6px">응답 키들: <code>${proxyResult.rawKeys.join(', ')}</code></div>
</div>
${proxyResult.nvda ? `<div class="card"><strong>NVDA 발견 ✅</strong><pre>${JSON.stringify(proxyResult.nvda, null, 2)}</pre></div>` 
  : `<div class="card warn">NVDA가 캘린더 endpoint에 없음 (개별 보강 필요)</div>`}
${proxyResult.count > 0 ? `<div class="card"><strong>샘플 5개:</strong><pre>${JSON.stringify(proxyResult.sample, null, 2)}</pre></div>` 
  : `<div class="card fail"><strong>⚠️ 데이터 0개</strong><pre>${proxyResult.rawSnippet.replace(/</g,'&lt;')}</pre></div>`}
` : `<div class="card fail">에러: <pre>${(proxyError || '').replace(/</g,'&lt;')}</pre></div>`}

<h2>2️⃣ /api/finnhub?symbol=NVDA&type=earnings (개별 종목)</h2>
${nvdaResult ? `
<div class="card">
  <div>총 ${nvdaResult.count}개</div>
  <div style="margin-top:6px">미래 예정 (actual=null): <strong>${nvdaResult.futureItems.length}개</strong></div>
</div>
${nvdaResult.futureItems.length > 0 ? `<div class="card ok"><strong>NVDA 미래 발표 ✅</strong><pre>${JSON.stringify(nvdaResult.futureItems, null, 2)}</pre></div>` 
  : `<div class="card warn"><strong>NVDA 미래 예정 없음</strong><pre>${JSON.stringify(nvdaResult.sample, null, 2)}</pre></div>`}
` : `<div class="card fail">에러: <pre>${(nvdaError || '').replace(/</g,'&lt;')}</pre></div>`}

</body></html>`;

  return res.status(200).send(html);
}
