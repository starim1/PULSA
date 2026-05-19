// Portfolio ETF 분류 진단 페이지
// 사용법: 자산 화면에 있는 본인 ETF 코드들 입력하면 실제 어떻게 분류되는지 보여줌
// https://your-app.vercel.app/api/portfolio-diag?tickers=069500.KS,232080.KS,...

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!process.env.KRX_API_KEY) {
    return res.status(500).send('<h1>KRX_API_KEY 없음</h1>');
  }

  // KRX ETF 데이터 받아오기
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

  // ─── guessETFSectorByName 함수 복제 (클라이언트와 동일 로직) ───
  function guessETFSectorByName(name) {
    if (!name) return null;
    const n = name.toUpperCase().replace(/\s+/g, '');

    let brand = '';
    if (/KODEX/i.test(name)) brand = 'KODEX';
    else if (/TIGER/i.test(name)) brand = 'TIGER';
    else if (/ACE/i.test(name)) brand = 'ACE';
    else if (/RISE/i.test(name)) brand = 'RISE';
    else if (/KOACT|KoAct/i.test(name)) brand = 'KoAct';
    else if (/PLUS/i.test(name)) brand = 'PLUS';
    else if (/HANARO/i.test(name)) brand = 'HANARO';
    else if (/KOSEF/i.test(name)) brand = 'KOSEF';
    else if (/ARIRANG/i.test(name)) brand = 'ARIRANG';
    else if (/TIMEFOLIO/i.test(name)) brand = 'TIMEFOLIO';
    else if (/KINDEX/i.test(name)) brand = 'KINDEX';
    else if (/SOL\b/i.test(name)) brand = 'SOL';
    else if (/WOORI/i.test(name)) brand = 'WOORI';
    else if (/WON\b/i.test(name)) brand = 'WON';
    else if (/1Q\b/i.test(name)) brand = '1Q';
    else if (/마이다스|MIDAS/i.test(name)) brand = 'MIDAS';
    else if (/KBSTAR/i.test(name)) brand = 'KBSTAR';

    if (!brand) return null;

    const checks = [
      [/KOSPI200|코스피200|KOSPI\s*200/i, '한국 KOSPI200'],
      [/KOSDAQ150|코스닥150|KOSDAQ\s*150/i, '한국 KOSDAQ150'],
      [/KOSPI(?!200)|코스피(?!200)/i, '한국 KOSPI'],
      [/KOSDAQ(?!150)|코스닥(?!150)/i, '한국 KOSDAQ'],
      [/레버리지.*인버스|인버스.*레버리지|인버스2X|2X.*인버스/i, '한국 인버스 2X'],
      [/인버스/i, '한국 인버스'],
      [/레버리지|2X/i, '한국 레버리지'],
      [/S&P\s*500|S&P500|에스앤피500/i, '미국 S&P500'],
      [/나스닥100|NASDAQ\s*100/i, '미국 나스닥100'],
      [/나스닥|NASDAQ/i, '미국 나스닥'],
      [/다우|DOW/i, '미국 다우존스'],
      [/필라델피아|반도체.*미국|미국.*반도체/i, '미국 반도체'],
      [/빅테크|BIG\s*TECH|매그니피센트/i, '미국 빅테크'],
      [/AI.*반도체|반도체.*AI/i, '미국 AI반도체'],
      [/AI(테크|테마|밸류|클라우드|소프트웨어)?/i, 'AI 테마'],
      [/양자.*컴퓨팅|QUANTUM/i, '양자컴퓨팅'],
      [/K[-·\s]*방산|한국.*방산|국내.*방산/i, '한국 K-방산'],
      [/방산|방위산업|국방|DEFENSE/i, '방산'],
      [/우주.*항공|UAM|항공.*우주/i, '우주항공'],
      [/우주/i, '우주'],
      [/휴머노이드/i, '휴머노이드 로봇'],
      [/로봇|ROBOT/i, '로봇'],
      [/원자력|원전|NUCLEAR|SMR/i, '원자력/SMR'],
      [/조선/i, '조선'],
      [/중국|차이나|CHINA/i, '중국'],
      [/일본|JAPAN|TOPIX/i, '일본'],
      [/인도|INDIA|NIFTY/i, '인도'],
      [/2차전지|배터리|BATTERY/i, '한국 2차전지'],
      [/반도체|SEMICONDUCTOR/i, '한국 반도체'],
      [/바이오|BIO|헬스/i, '한국 헬스케어/바이오'],
      [/은행|BANK/i, '한국 은행'],
      [/증권/i, '한국 증권'],
      [/보험/i, '한국 보험'],
      [/금융/i, '한국 금융'],
      [/철강|STEEL/i, '한국 철강'],
      [/에너지|화학/i, '한국 에너지화학'],
      [/자동차|AUTO/i, '한국 자동차'],
      [/건설/i, '한국 건설'],
      [/운송/i, '한국 운송'],
      [/게임|GAME/i, '한국 게임'],
      [/미디어|컨텐츠|엔터/i, '한국 미디어/엔터'],
      [/K[-·\s]*팝|K[-·\s]*POP/i, 'K-팝'],
      [/K[-·\s]*컬처/i, 'K-컬처'],
      [/K[-·\s]*뷰티/i, 'K-뷰티'],
      [/K[-·\s]*푸드/i, 'K-푸드'],
      [/메타버스|METAVERSE/i, '메타버스'],
      [/ESG|친환경|탄소중립/i, 'ESG/친환경'],
      [/국고채.*10년|10년.*국고채/i, '한국 국고채 10년'],
      [/국고채.*3년|3년.*국고채/i, '한국 국고채 3년'],
      [/국고채|국채/i, '한국 국채'],
      [/회사채/i, '한국 회사채'],
      [/통안채/i, '한국 통안채'],
      [/단기.*채권|단기.*채|머니마켓|MMF/i, '한국 단기채권'],
      [/CD\s*금리|KOFR/i, '한국 CD/KOFR 금리'],
      [/30년.*국채.*미국|미국.*30년/i, '미국 30년국채'],
      [/리츠|REIT/i, '리츠 (REITs)'],
      [/금\s*선물|금현물|GOLD/i, '금'],
      [/은\s*선물|SILVER/i, '은'],
      [/원유|오일|WTI|CRUDE/i, '원유'],
      [/달러|USD/i, '미국달러'],
      [/배당귀족|배당.*ARIST/i, '미국 배당귀족'],
      [/배당다우|SCHD/i, '미국 배당다우존스'],
      [/배당.*성장/i, '배당성장'],
      [/고배당|HIGH\s*DIVIDEND/i, '고배당'],
      [/커버드콜|COVERED\s*CALL/i, '커버드콜'],
      [/비트코인|BITCOIN|BTC/i, '비트코인'],
      [/액티브|ACTIVE/i, '액티브 운용'],
    ];

    for (const [pattern, sector] of checks) {
      if (pattern.test(name)) return `${sector} (${brand})`;
    }

    return `한국 ETF (${brand})`;
  }

  // 사용자 입력 처리
  const tickers = (req.query.tickers || '').split(',').map(s => s.trim()).filter(Boolean);

  let resultRows = '';
  if (tickers.length > 0) {
    resultRows = tickers.map(tk => {
      const cleanCode = tk.replace(/\.(KS|KQ)$/i, '').trim();
      const name = etfs[cleanCode] || '';
      const sector = name ? guessETFSectorByName(name) : null;
      
      let nameDisplay, sectorDisplay;
      if (!name) {
        nameDisplay = '<span class="fail">❌ KRX 데이터에 없음</span>';
        sectorDisplay = '<span class="fail">분류 불가 (KRX에서 종목명 못 받아옴)</span>';
      } else if (!sector) {
        nameDisplay = `<span class="ok">✅ ${name}</span>`;
        sectorDisplay = '<span class="warn">⚠️ 패턴 매칭 안 됨 → null 반환 (자산 화면에 "기타"로 표시)</span>';
      } else {
        nameDisplay = `<span class="ok">✅ ${name}</span>`;
        sectorDisplay = `<span class="ok">✅ ETF · ${sector}</span>`;
      }

      return `<tr>
        <td>${tk}</td>
        <td>${nameDisplay}</td>
        <td>${sectorDisplay}</td>
      </tr>`;
    }).join('');
  }

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Portfolio ETF 분류 진단</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 16px auto; padding: 0 12px; background: #0a1628; color: #e8e8ef; }
  h1 { color: #10d090; font-size: 20px; }
  .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 14px; margin-bottom: 12px; }
  .ok { color: #26d782; }
  .fail { color: #ff4d6d; }
  .warn { color: #f5b53d; }
  .help { background: rgba(245,181,61,0.1); border-color: rgba(245,181,61,0.4); padding: 10px; font-size: 13px; }
  input { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: #e8e8ef; padding: 6px 10px; border-radius: 6px; width: 100%; font-size: 13px; box-sizing: border-box; }
  button { background: #10d090; color: #0a1628; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; margin-top: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  table th, table td { padding: 8px 6px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: left; vertical-align: top; }
  table th { color: #8a92a6; font-weight: 600; }
  table td:first-child { font-family: monospace; color: #4a9eff; width: 100px; }
</style>
</head>
<body>

<h1>🔍 내 ETF 분류 진단</h1>

<div class="card help">
  자산 화면에 있는 한국 ETF 티커들을 쉼표로 구분해서 입력하세요.<br>
  형식: <code>069500.KS, 232080.KS, 0080G0.KS</code><br>
  (".KS" 또는 ".KQ" 포함)<br><br>
  <form method="get">
    <input name="tickers" placeholder="069500.KS, 232080.KS, ..." value="${(req.query.tickers || '').replace(/"/g, '&quot;')}">
    <button type="submit">분류 확인</button>
  </form>
</div>

${tickers.length > 0 ? `
<div class="card">
  <strong>분류 결과</strong>
  <table>
    <thead><tr><th>티커</th><th>KRX 종목명</th><th>분류 결과</th></tr></thead>
    <tbody>${resultRows}</tbody>
  </table>
</div>

<div class="card help">
  <strong>💡 해석</strong><br>
  • ✅ KRX 종목명 + ✅ 분류 → 정상 작동해야 함 (자산 화면에 잘 나와야 함)<br>
  • ❌ KRX 데이터에 없음 → 티커 형식 다름 (영숫자 코드일 수도)<br>
  • ⚠️ 패턴 매칭 안 됨 → 종목명에 키워드가 없어서 분류 못함
</div>
` : ''}

<div style="text-align:center; margin-top:20px; font-size:11px; color:#8a92a6">
  PULSA · Portfolio ETF 진단
</div>

</body>
</html>`;

  return res.status(200).send(html);
}
