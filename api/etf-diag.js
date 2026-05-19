// 한국 ETF 분류 진단 페이지
// 사용법: https://your-app.vercel.app/api/etf-diag?codes=069500,232080,...
// 또는 그냥 https://your-app.vercel.app/api/etf-diag (전체 ETF 분류 결과)

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!process.env.KRX_API_KEY) {
    return res.status(500).send('<h1>KRX_API_KEY 없음</h1>');
  }

  // 어제 날짜 계산
  function getYesterday() {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    kst.setUTCDate(kst.getUTCDate() - 1);
    const dow = kst.getUTCDay();
    if (dow === 0) kst.setUTCDate(kst.getUTCDate() - 2);
    else if (dow === 6) kst.setUTCDate(kst.getUTCDate() - 1);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const d = String(kst.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  // KRX ETF 데이터 받아오기
  let etfs = {};
  let basDd = getYesterday();
  for (let i = 0; i < 5; i++) {
    try {
      const url = `http://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd?basDd=${basDd}`;
      const r = await fetch(url, { headers: { 'AUTH_KEY': process.env.KRX_API_KEY } });
      if (r.ok) {
        const data = await r.json();
        if (data.OutBlock_1 && data.OutBlock_1.length > 0) {
          for (const row of data.OutBlock_1) {
            const code = (row.ISU_CD || row.ISU_SRT_CD || '').trim();
            const name = (row.ISU_NM || row.ISU_ABBRV || '').trim();
            if (code && name) etfs[code] = name;
          }
          break;
        }
      }
      const dt = new Date(basDd.slice(0,4) + '-' + basDd.slice(4,6) + '-' + basDd.slice(6,8));
      dt.setDate(dt.getDate() - 1);
      basDd = dt.toISOString().slice(0,10).replace(/-/g,'');
    } catch (e) {}
  }

  const count = Object.keys(etfs).length;

  // 첫 50개 ETF 샘플
  const sample = Object.entries(etfs).slice(0, 50);

  // 운용사별 통계
  const brandCount = {};
  for (const name of Object.values(etfs)) {
    const upper = name.toUpperCase();
    let brand = '기타';
    if (upper.includes('KODEX')) brand = 'KODEX';
    else if (upper.includes('TIGER')) brand = 'TIGER';
    else if (upper.includes('ACE')) brand = 'ACE';
    else if (upper.includes('RISE')) brand = 'RISE';
    else if (upper.includes('KOACT') || /KoAct/i.test(name)) brand = 'KoAct';
    else if (upper.includes('PLUS')) brand = 'PLUS';
    else if (upper.includes('HANARO')) brand = 'HANARO';
    else if (upper.includes('KOSEF')) brand = 'KOSEF';
    else if (upper.includes('ARIRANG')) brand = 'ARIRANG';
    else if (upper.includes('TIMEFOLIO')) brand = 'TIMEFOLIO';
    else if (upper.includes('KINDEX')) brand = 'KINDEX';
    else if (upper.includes('SOL')) brand = 'SOL';
    else if (upper.includes('WON')) brand = 'WON';
    else if (upper.includes('1Q')) brand = '1Q';
    else if (upper.includes('KBSTAR')) brand = 'KBSTAR';
    brandCount[brand] = (brandCount[brand] || 0) + 1;
  }
  const brandStats = Object.entries(brandCount).sort((a,b) => b[1] - a[1]);

  // 사용자가 codes 파라미터로 자기 ETF 지정 가능
  const userCodes = (req.query.codes || '').split(',').map(s => s.trim()).filter(Boolean);
  let userEtfRows = '';
  if (userCodes.length > 0) {
    userEtfRows = userCodes.map(code => {
      const cleanCode = code.replace(/\.(KS|KQ)$/i, '');
      const name = etfs[cleanCode];
      return `<tr>
        <td>${cleanCode}</td>
        <td>${name || '<span style="color:#ff4d6d">KRX에 없음</span>'}</td>
      </tr>`;
    }).join('');
  }

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KRX ETF 진단</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 700px; margin: 16px auto; padding: 0 12px; background: #0a1628; color: #e8e8ef; }
  h1 { color: #10d090; font-size: 20px; }
  h2 { color: #4a9eff; font-size: 15px; margin-top: 24px; }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 14px; margin-bottom: 12px; }
  .ok { color: #26d782; font-weight: 600; }
  .fail { color: #ff4d6d; }
  .num { font-size: 28px; font-weight: 700; color: #10d090; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table td { padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: top; }
  table td:first-child { color: #8a92a6; font-family: monospace; width: 80px; }
  .brand { display: inline-block; padding: 4px 10px; margin: 3px; background: rgba(74,158,255,0.15); border-radius: 6px; font-size: 12px; }
  .help { background: rgba(245,181,61,0.1); border-color: rgba(245,181,61,0.4); padding: 10px; font-size: 12px; }
  input { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #e8e8ef; padding: 6px 10px; border-radius: 6px; width: 100%; font-size: 13px; }
  button { background: #10d090; color: #0a1628; border: none; padding: 7px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 8px; }
</style>
</head>
<body>

<h1>🔍 KRX ETF 진단</h1>

<div class="card">
  <div style="color:#8a92a6;font-size:13px">KRX에서 받아온 ETF 총 개수</div>
  <div class="num">${count}개</div>
  <div style="color:#8a92a6;font-size:11px;margin-top:4px">기준일: ${basDd}</div>
</div>

<h2>📊 운용사별 분포</h2>
<div class="card">
  ${brandStats.map(([b, c]) => `<span class="brand">${b}: <strong>${c}</strong></span>`).join('')}
</div>

<h2>🔎 내 ETF 코드 확인하기</h2>
<div class="card help">
  PULSA 자산 화면에 있는 한국 ETF 코드를 쉼표로 구분해서 입력하세요.<br>
  예: <code>069500, 232080, 0080G0</code> (".KS" 빼고)<br><br>
  <form method="get">
    <input name="codes" placeholder="069500, 232080, ..." value="${(req.query.codes || '').replace(/"/g, '&quot;')}">
    <button type="submit">확인</button>
  </form>
</div>

${userCodes.length > 0 ? `
<div class="card">
  <strong>내 ETF 검색 결과</strong>
  <table style="margin-top:8px">
    <thead><tr style="font-weight:600"><td>코드</td><td>KRX 종목명</td></tr></thead>
    <tbody>${userEtfRows}</tbody>
  </table>
</div>
` : ''}

<h2>📋 KRX ETF 샘플 (앞 50개)</h2>
<div class="card">
  <table>
    ${sample.map(([code, name]) => `<tr><td>${code}</td><td>${name}</td></tr>`).join('')}
  </table>
</div>

<div style="text-align:center; margin-top:20px; font-size:11px; color:#8a92a6">
  PULSA · KRX ETF 진단
</div>

</body>
</html>`;

  return res.status(200).send(html);
}
