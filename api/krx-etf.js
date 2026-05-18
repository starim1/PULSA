// KRX OpenAPI - 한국 ETF 전체 종목 코드 + 이름 매핑
// 무료, 10,000회/일 제한, 매일 1회만 호출하면 충분
// 영업일 기준 전일 데이터 사용 (KRX는 영업일 +1 13:00 갱신)

let CACHE = null;
let CACHE_DATE = null;

function getYesterdayKR(){
  // KR 시간 기준 어제 날짜 (영업일 가정)
  const now = new Date();
  const kst = new Date(now.getTime() + 9*60*60*1000);
  // 1일 전
  kst.setUTCDate(kst.getUTCDate() - 1);
  // 토요일이면 -1, 일요일이면 -2
  const dow = kst.getUTCDay();
  if(dow === 0) kst.setUTCDate(kst.getUTCDate() - 2);
  else if(dow === 6) kst.setUTCDate(kst.getUTCDate() - 1);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if(!process.env.KRX_API_KEY){
    return res.status(500).json({error: 'KRX_API_KEY not set in environment'});
  }

  const today = new Date().toISOString().slice(0, 10);
  
  // 캐시 체크 (당일 캐시 있으면 그대로 반환)
  if(CACHE && CACHE_DATE === today){
    return res.json({source: 'cache', date: CACHE_DATE, etfs: CACHE});
  }

  // KRX API 호출 (영업일 기준 전일)
  let basDd = getYesterdayKR();
  // 최대 5일 거꾸로 시도 (휴장일 대응)
  let result = null;
  let tries = 0;
  
  while(tries < 5){
    try{
      const url = `http://data-dbg.krx.co.kr/svc/apis/etp/etf_bydd_trd?basDd=${basDd}`;
      const r = await fetch(url, {
        headers: {'AUTH_KEY': process.env.KRX_API_KEY},
      });
      
      if(!r.ok){
        console.warn(`KRX API failed: ${r.status} on ${basDd}`);
        // 1일 더 거꾸로
        const dt = new Date(basDd.slice(0,4) + '-' + basDd.slice(4,6) + '-' + basDd.slice(6,8));
        dt.setDate(dt.getDate() - 1);
        basDd = dt.toISOString().slice(0,10).replace(/-/g,'');
        tries++;
        continue;
      }
      
      const data = await r.json();
      const list = data.OutBlock_1 || [];
      
      if(list.length > 0){
        result = list;
        break;
      }
      
      // 빈 결과 → 어제 거 거꾸로
      const dt = new Date(basDd.slice(0,4) + '-' + basDd.slice(4,6) + '-' + basDd.slice(6,8));
      dt.setDate(dt.getDate() - 1);
      basDd = dt.toISOString().slice(0,10).replace(/-/g,'');
      tries++;
    }catch(e){
      console.error('KRX fetch error:', e);
      tries++;
    }
  }

  if(!result){
    return res.status(500).json({error: 'KRX API returned no data after 5 tries'});
  }

  // 종목코드 → 종목명 매핑만 추출 (필요한 것만)
  const etfs = {};
  for(const row of result){
    if(row.ISU_CD && row.ISU_NM){
      etfs[row.ISU_CD.trim()] = row.ISU_NM.trim();
    }
  }
  
  CACHE = etfs;
  CACHE_DATE = today;
  
  return res.json({
    source: 'fresh',
    date: today,
    basDd: basDd,
    count: Object.keys(etfs).length,
    etfs: etfs,
  });
}
