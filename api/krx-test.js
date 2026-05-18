// KRX OpenAPI 진단 페이지
// 사용법: 브라우저에서 https://your-app.vercel.app/api/krx-test 접속
// HTML로 결과를 보여줌 (개발자 도구 없이도 확인 가능)

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const hasKey = !!process.env.KRX_API_KEY;
  const keyMasked = hasKey
    ? (process.env.KRX_API_KEY.slice(0, 4) + '****' + process.env.KRX_API_KEY.slice(-4))
    : '(없음)';

  let testResult = null;
  let testError = null;
  let etfCount = 0;
  let sampleEtfs = [];

  if (hasKey) {
    try {
      // 오늘로부터 5일 거꾸로 시도
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      kst.setUTCDate(kst.getUTCDate() - 1);
      const dow = kst.getUTCDay();
      if (dow === 0) kst.setUTCDate(kst.getUTCDate() - 2);
      else if (dow === 6) kst.setUTCDate(kst.getUTCDate() - 1);

      const y = kst.getUTCFullYear();
      const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
      const d = String(kst.getUTCDate()).padStart(2, '0');
      let basDd = `${y}${m}${d}`;

      let tries = 0;
      while (tries < 5 && !testResult) {
        const url = `http://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd?basDd=${basDd}`;
        const r = await fetch(url, {
          headers: { 'AUTH_KEY': process.env.KRX_API_KEY },
        });
        const status = r.status;
        const ct = r.headers.get('content-type') || '';
        const bodyText = await r.text();
        
        if (r.ok && ct.includes('json')) {
          try {
            const data = JSON.parse(bodyText);
            if (data.OutBlock_1 && data.OutBlock_1.length > 0) {
              testResult = { status, basDd, count: data.OutBlock_1.length };
              etfCount = data.OutBlock_1.length;
              sampleEtfs = data.OutBlock_1.slice(0, 10).map(r => ({
                code: r.ISU_CD,
                name: r.ISU_NM,
              }));
              break;
            } else {
              testError = `${basDd} 데이터 없음 (휴장일?), 응답: ${bodyText.slice(0, 200)}`;
            }
          } catch (e) {
            testError = `JSON 파싱 실패 (${basDd}): ${bodyText.slice(0, 300)}`;
          }
        } else {
          testError = `HTTP ${status} (${basDd}): ${bodyText.slice(0, 300)}`;
        }

        const dt = new Date(basDd.slice(0,4) + '-' + basDd.slice(4,6) + '-' + basDd.slice(6,8));
        dt.setDate(dt.getDate() - 1);
        basDd = dt.toISOString().slice(0,10).replace(/-/g,'');
        tries++;
      }
    } catch (e) {
      testError = `예외: ${e.message}`;
    }
  }

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KRX API 진단</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 20px auto; padding: 0 16px; background: #0a1628; color: #e8e8ef; }
  h1 { color: #10d090; font-size: 22px; }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; margin-bottom: 14px; }
  .ok { color: #26d782; font-weight: 600; }
  .fail { color: #ff4d6d; font-weight: 600; }
  .warn { color: #f5b53d; font-weight: 600; }
  .label { color: #8a92a6; font-size: 13px; margin-bottom: 4px; }
  .val { font-family: monospace; font-size: 14px; word-break: break-all; }
  pre { background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-size: 11px; overflow-x: auto; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table td { padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  table td:first-child { color: #8a92a6; font-family: monospace; }
  .next { background: rgba(16, 208, 144, 0.1); border-color: rgba(16, 208, 144, 0.4); padding: 14px; }
  .next li { margin: 8px 0; }
</style>
</head>
<body>

<h1>🔍 KRX API 진단</h1>

<div class="card">
  <div class="label">1️⃣ KRX_API_KEY 환경변수</div>
  ${hasKey 
    ? `<div class="ok">✅ 등록됨</div><div class="val">${keyMasked}</div>` 
    : `<div class="fail">❌ 등록 안 됨</div><div class="val">Vercel 환경변수에 KRX_API_KEY 추가 필요</div>`}
</div>

${hasKey ? `
<div class="card">
  <div class="label">2️⃣ KRX API 호출 결과</div>
  ${testResult 
    ? `<div class="ok">✅ 성공!</div>
       <div class="val">기준일: ${testResult.basDd} / ETF ${testResult.count}개 받아옴</div>`
    : `<div class="fail">❌ 실패</div>
       <pre>${(testError || '알 수 없는 에러').replace(/</g, '&lt;')}</pre>`}
</div>

${sampleEtfs.length > 0 ? `
<div class="card">
  <div class="label">3️⃣ 받아온 ETF 샘플 (앞 10개)</div>
  <table>
    ${sampleEtfs.map(e => `<tr><td>${e.code}</td><td>${e.name}</td></tr>`).join('')}
  </table>
</div>
` : ''}
` : ''}

<div class="card next">
  <div class="label">📋 다음 단계</div>
  ${!hasKey ? `
    <ol>
      <li><a href="https://openapi.krx.co.kr/" style="color:#10d090">openapi.krx.co.kr</a>에서 회원가입 + API 키 신청</li>
      <li>관리자 승인 대기 (1~3 영업일)</li>
      <li>승인 후 키 받으면 Vercel → Settings → Environment Variables → <code>KRX_API_KEY</code> 추가</li>
      <li>재배포</li>
    </ol>
  ` : testResult ? `
    <div class="ok">✅ 모든 게 정상 작동 중!</div>
    <p style="margin-top:10px">한국 ETF가 자동으로 분류되고 검색에서도 자동완성 됩니다.</p>
    <p>그래도 자산 화면에 ETF 분류 안 나오면:</p>
    <ul>
      <li>자산 화면에 등록된 ETF가 <code>069500.KS</code> 같은 형식인지 확인</li>
      <li>새로고침 (Ctrl+Shift+R) 후 자산 화면 다시 진입</li>
    </ul>
  ` : `
    <ul>
      <li>위 에러 메시지 확인</li>
      <li>키가 정확히 입력됐는지 (앞뒤 공백 없는지)</li>
      <li>키 승인 받았는지 (KRX 마이페이지에서 확인)</li>
      <li>승인 대기중이면 며칠 더 기다리기</li>
    </ul>
  `}
</div>

<div style="text-align:center; margin-top:20px; font-size:12px; color:#8a92a6">
  PULSA · KRX 진단 도구
</div>

</body>
</html>`;

  return res.status(200).send(html);
}
