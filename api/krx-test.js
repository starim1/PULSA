// 실적 캘린더 진단
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!process.env.FINNHUB_API_KEY) {
    return res.status(500).send('<h1>FINNHUB_API_KEY 없음</h1>');
  }

  const now = new Date();
  const from = new Date(now.getTime() - 7*24*60*60*1000).toISOString().slice(0,10);
  const to = new Date(now.getTime() + 90*24*60*60*1000).toISOString().slice(0,10);

  let errMsg = null, sample = [], count = 0, nvdaItem = null;

  try {
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${process.env.FINNHUB_API_KEY}`;
    const r = await fetch(url);
    const text = await r.text();
    if (r.ok) {
      try {
        const data = JSON.parse(text);
        const list = data.earningsCalendar || [];
        count = list.length;
        sample = list.slice(0, 10);
        nvdaItem = list.find(e => e.symbol === 'NVDA');
      } catch (e) {
        errMsg = `JSON 파싱 실패: ${text.slice(0, 400)}`;
      }
    } else {
      errMsg = `HTTP ${r.status}: ${text.slice(0, 400)}`;
    }
  } catch (e) {
    errMsg = `예외: ${e.message}`;
  }

  const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>실적 캘린더 진단</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:700px;margin:14px auto;padding:0 12px;background:#0a1628;color:#e8e8ef}
h1{color:#10d090;font-size:20px}
.card{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:14px;margin-bottom:12px}
.ok{color:#26d782;font-weight:600}.fail{color:#ff4d6d;font-weight:600}.warn{color:#f5b53d;font-weight:600}
.num{font-size:26px;font-weight:700;color:#10d090}
pre{background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
td{padding:6px;border-bottom:1px solid rgba(255,255,255,0.05);vertical-align:top}
.next{background:rgba(245,181,61,0.1);border-color:rgba(245,181,61,0.4)}
</style></head><body>

<h1>📅 실적 캘린더 진단</h1>

<div class="card">조회 기간: <strong>${from} ~ ${to}</strong></div>

<div class="card">
  <div style="color:#8a92a6;font-size:13px">받아온 실적 발표 일정</div>
  ${count > 0 ? `<div class="num">${count}개</div><div class="ok">✅ Finnhub에서 데이터 받아옴</div>` 
    : `<div class="fail">❌ 데이터 0개</div>`}
</div>

${errMsg ? `<div class="card"><div class="fail">에러:</div><pre>${errMsg.replace(/</g,'&lt;')}</pre></div>` : ''}

${nvdaItem ? `
<div class="card">
  <strong>🟢 NVDA 실제 발표 일정</strong>
  <pre>${JSON.stringify(nvdaItem, null, 2)}</pre>
</div>` : count > 0 ? `<div class="card warn">⚠️ NVDA가 향후 90일 내 발표 일정에 없음</div>` : ''}

${sample.length > 0 ? `
<div class="card">
  <strong>발표 일정 샘플 (앞 10개)</strong>
  <table>
    <tr style="color:#8a92a6;font-weight:600"><td>날짜</td><td>티커</td><td>시간</td><td>예상 EPS</td></tr>
    ${sample.map(e => `<tr>
      <td>${e.date || '-'}</td>
      <td><strong>${e.symbol || '-'}</strong></td>
      <td>${e.hour === 'bmo' ? '장 전' : e.hour === 'amc' ? '장 후' : e.hour || '-'}</td>
      <td>${e.epsEstimate || '-'}</td>
    </tr>`).join('')}
  </table>
</div>` : ''}

<div class="card next">
  <strong>📋 해석</strong><br><br>
  ${count > 0 ? `
    ✅ Finnhub 무료 플랜에서 정상 작동.<br>
    PULSA 캘린더에 자동으로 실적이 추가됩니다.<br><br>
    안 보이면:
    <ul>
      <li>PULSA 강력 새로고침</li>
      <li>캘린더 캐시 자동 갱신 대기 (24시간)</li>
    </ul>
  ` : `
    ❌ Finnhub 무료 플랜에서 막힘.<br>
    대안 필요: FMP / Alpha Vantage / 알고리즘 폴백
  `}
</div>

</body></html>`;

  return res.status(200).send(html);
}
