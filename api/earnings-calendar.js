// Finnhub earnings/calendar - 실제 실적 발표 일정
// 무료 플랜 지원, 주간 단위로 받아옴
// 매일 1회 호출 → 캐시

let CACHE = null;
let CACHE_DATE = null;

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if(!process.env.FINNHUB_API_KEY){
    return res.status(500).json({error: 'FINNHUB_API_KEY not set'});
  }

  const today = new Date().toISOString().slice(0, 10);
  
  // 당일 캐시
  if(CACHE && CACHE_DATE === today){
    return res.json({source: 'cache', date: CACHE_DATE, earnings: CACHE});
  }

  try{
    // 과거 7일 ~ 미래 90일 (3개월)
    const now = new Date();
    const from = new Date(now.getTime() - 7*24*60*60*1000).toISOString().slice(0,10);
    const to = new Date(now.getTime() + 90*24*60*60*1000).toISOString().slice(0,10);
    
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${process.env.FINNHUB_API_KEY}`;
    const r = await fetch(url);
    
    if(!r.ok){
      const txt = await r.text().catch(()=>'');
      return res.status(r.status).json({error: 'Finnhub error', status: r.status, body: txt.slice(0,300)});
    }
    
    const data = await r.json();
    const list = data.earningsCalendar || [];
    
    if(list.length === 0){
      return res.status(500).json({error: 'No earnings data'});
    }

    CACHE = list;
    CACHE_DATE = today;
    
    return res.json({
      source: 'fresh',
      date: today,
      from, to,
      count: list.length,
      earnings: list,
    });
  }catch(e){
    return res.status(500).json({error: e.message});
  }
}
