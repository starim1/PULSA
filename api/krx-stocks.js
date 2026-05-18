// KRX OpenAPI - 한국 전종목 시세 + 종목명 + 펀더멘털 (PER/PBR/배당수익률)
// 무료, 10,000회/일 제한, 매일 1회만 호출하면 충분
// 영업일 기준 전일 데이터 사용 (KRX는 영업일 +1 13:00 이후 갱신)

let CACHE_STOCKS = null;
let CACHE_DATE = null;

function getYesterdayKR(){
  const now = new Date();
  const kst = new Date(now.getTime() + 9*60*60*1000);
  kst.setUTCDate(kst.getUTCDate() - 1);
  const dow = kst.getUTCDay();
  if(dow === 0) kst.setUTCDate(kst.getUTCDate() - 2);
  else if(dow === 6) kst.setUTCDate(kst.getUTCDate() - 1);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// 5일 거슬러 시도 (휴장일 대응)
async function fetchKrxWithFallback(urlBase, headers){
  let basDd = getYesterdayKR();
  for(let tries = 0; tries < 5; tries++){
    try{
      const url = `${urlBase}?basDd=${basDd}`;
      const r = await fetch(url, {headers});
      if(r.ok){
        const data = await r.json();
        const list = data.OutBlock_1 || [];
        if(list.length > 0){
          return {list, basDd};
        }
      }
      const dt = new Date(basDd.slice(0,4) + '-' + basDd.slice(4,6) + '-' + basDd.slice(6,8));
      dt.setDate(dt.getDate() - 1);
      basDd = dt.toISOString().slice(0,10).replace(/-/g,'');
    }catch(e){
      console.warn(`KRX fetch retry ${tries}:`, e?.message);
    }
  }
  return null;
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');

  if(!process.env.KRX_API_KEY){
    return res.status(500).json({error: 'KRX_API_KEY not set'});
  }

  const today = new Date().toISOString().slice(0, 10);
  
  // 당일 캐시
  if(CACHE_STOCKS && CACHE_DATE === today){
    return res.json({source: 'cache', date: CACHE_DATE, ...CACHE_STOCKS});
  }

  const headers = {'AUTH_KEY': process.env.KRX_API_KEY};

  try{
    // 1) KOSPI 전종목 시세
    const kospi = await fetchKrxWithFallback(
      'http://data-dbg.krx.co.kr/svc/apis/sto/stk_bydd_trd',
      headers
    );

    // 2) KOSDAQ 전종목 시세
    const kosdaq = await fetchKrxWithFallback(
      'http://data-dbg.krx.co.kr/svc/apis/sto/ksq_bydd_trd',
      headers
    );

    // 3) KOSPI PER/PBR/배당수익률
    const kospiPer = await fetchKrxWithFallback(
      'http://data-dbg.krx.co.kr/svc/apis/sto/stk_isu_base_info',
      headers
    );

    // 4) KOSDAQ PER/PBR/배당수익률
    const kosdaqPer = await fetchKrxWithFallback(
      'http://data-dbg.krx.co.kr/svc/apis/sto/ksq_isu_base_info',
      headers
    );

    // 통합: 종목코드 → {name, market, price, change, volume, per, pbr, divYield, ...}
    const stocks = {};

    function addList(list, market){
      if(!list) return;
      for(const r of list){
        const code = (r.ISU_CD || r.ISU_SRT_CD || '').trim();
        if(!code) continue;
        const existing = stocks[code] || {};
        stocks[code] = {
          ...existing,
          code,
          name: (r.ISU_NM || r.ISU_ABBRV || existing.name || '').trim(),
          market: market || existing.market,
          price: parseFloat(r.TDD_CLSPRC?.replace(/,/g,'')) || existing.price || null,
          change: parseFloat(r.CMPPREVDD_PRC?.replace(/,/g,'')) || existing.change || null,
          changePct: parseFloat(r.FLUC_RT) || existing.changePct || null,
          volume: parseInt(r.ACC_TRDVOL?.replace(/,/g,'')) || existing.volume || null,
          marketCap: parseFloat(r.MKTCAP?.replace(/,/g,'')) || existing.marketCap || null,
        };
      }
    }

    function addPerList(list){
      if(!list) return;
      for(const r of list){
        const code = (r.ISU_CD || r.ISU_SRT_CD || '').trim();
        if(!code || !stocks[code]) continue;
        stocks[code].per = parseFloat(r.PER) || null;
        stocks[code].pbr = parseFloat(r.PBR) || null;
        stocks[code].eps = parseFloat(r.EPS) || null;
        stocks[code].bps = parseFloat(r.BPS) || null;
        stocks[code].divYield = parseFloat(r.DVD_YLD) || null;
        stocks[code].dps = parseFloat(r.DPS) || null;
      }
    }

    if(kospi) addList(kospi.list, 'KOSPI');
    if(kosdaq) addList(kosdaq.list, 'KOSDAQ');
    if(kospiPer) addPerList(kospiPer.list);
    if(kosdaqPer) addPerList(kosdaqPer.list);

    if(Object.keys(stocks).length === 0){
      return res.status(500).json({error: 'No data from KRX'});
    }

    const result = {
      basDd: kospi?.basDd || kosdaq?.basDd,
      count: Object.keys(stocks).length,
      stocks,
    };

    CACHE_STOCKS = result;
    CACHE_DATE = today;

    return res.json({source: 'fresh', date: today, ...result});
  }catch(e){
    console.error('KRX stocks error:', e);
    return res.status(500).json({error: e.message});
  }
}
