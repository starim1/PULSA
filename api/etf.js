// ETF holdings - 발행사 공식 사이트에서 직접 가져옴 (자동 최신화)
// 지원: SSGA, Invesco, iShares (BlackRock), Vanguard, ARK
// 매일 거래일 마감 후 발행사가 업데이트, 우리는 12시간 캐싱
import * as XLSX from 'xlsx';

const cache = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000;

// SSGA SPDR ETF — sym.toLowerCase() 패턴으로 URL 생성
const SSGA = ['XLK','XLF','XLE','XLV','XLY','XLP','XLI','XLB','XLU','XLRE','XLC','SPY','DIA','MDY','SLY','SPLG','SPYG','SPYV','SPYD','SDY','XBI','KBE','KRE','KIE','GLD','GLDM','XHB','XME','XOP','XRT','XSD','XPH','XHE'];

// Invesco — 매개변수에 ticker
const INVESCO = ['QQQ','QQQM','QQQJ','RSP','SPGP','SPHQ','SPLV','SPHB','PDBC','PGX','SPSM','BKLN'];

// ARK — sym.toLowerCase() 패턴
const ARK = ['ARKK','ARKG','ARKF','ARKW','ARKQ','ARKX','PRNT','IZRL'];

// iShares — product ID가 필요. 자주 쓰는 것만 매핑
// URL 패턴: https://www.ishares.com/us/products/{PRODUCT_ID}/...{TICKER}.ajax?fileType=csv&fileName={TICKER}_holdings&dataType=fund
const ISHARES = {
  // S&P 500
  'IVV': '239726',
  'IVW': '239725', // S&P 500 Growth
  'IVE': '239728', // S&P 500 Value
  // Total Market
  'ITOT': '239724',
  // Russell
  'IWM': '239710', // Russell 2000
  'IWB': '239707', // Russell 1000
  'IWF': '239706', // Russell 1000 Growth
  'IWD': '239708', // Russell 1000 Value
  'IWO': '239711', // Russell 2000 Growth
  'IWN': '239712', // Russell 2000 Value
  'IWV': '239714', // Russell 3000
  // International
  'EFA': '239623', // MSCI EAFE
  'EEM': '239637', // MSCI Emerging Markets
  'IEFA': '244049', // MSCI EAFE IMI
  'IEMG': '244050', // MSCI Emerging Markets IMI
  'ACWI': '239600', // MSCI ACWI
  // Mid/Small Cap
  'IJH': '239763', // S&P Mid-Cap 400
  'IJR': '239774', // S&P Small-Cap 600
  'IJK': '239765',
  'IJJ': '239764',
  // Sector
  'IYW': '239522', // Tech
  'IYF': '239508', // Financials
  'IYE': '239507', // Energy
  'IYH': '239511', // Healthcare
  'IYC': '239505', // Consumer Discretionary
  'IYK': '239517', // Consumer Staples
  'IYJ': '239516', // Industrials
  'IYM': '239519', // Materials
  'IYR': '239520', // Real Estate
  'IYZ': '239529', // Telecom
  'IDU': '239502', // Utilities
  // Bonds
  'AGG': '239458', // Aggregate Bond
  'TLT': '239454', // 20+ Year Treasury
  'IEF': '239456', // 7-10 Year Treasury
  'SHY': '239452', // 1-3 Year Treasury
  'HYG': '239565', // High Yield Corporate
  'LQD': '239566', // Investment Grade Corporate
  // Country
  'EWJ': '239665', // Japan
  'EWZ': '239677', // Brazil
  'INDA': '244750', // India
  'EWT': '239686', // Taiwan
  'EWY': '239690', // South Korea
  'EWG': '239663', // Germany
  'EWU': '239690', // UK
  'MCHI': '244047', // China
  'FXI': '239536', // China Large-Cap
  // Thematic
  'SOXX': '239705', // Semiconductor
  'IBB': '239699', // Biotech
};

// Vanguard — function: ${TICKER}-holdings.csv but actually they use specific portIds.
// Vanguard URL is complex. Their JSON API: 
// https://api.vanguard.com/rs/ire/01/ind/fund/{PORTID}/portfolio-holding/stock.json
const VANGUARD = {
  'VOO': '0968', // S&P 500
  'VTI': '0970', // Total Stock Market
  'VEA': '0936', // Developed Markets
  'VWO': '0964', // Emerging Markets
  'VGT': '0958', // Information Technology
  'VHT': '0959', // Health Care
  'VFH': '0954', // Financials
  'VDE': '0961', // Energy
  'VAW': '0967', // Materials
  'VCR': '0944', // Consumer Discretionary
  'VDC': '0962', // Consumer Staples
  'VIS': '0934', // Industrials
  'VPU': '0944', // Utilities
  'VNQ': '0986', // Real Estate
  'VOX': '0963', // Communication Services
  'VYM': '0923', // High Dividend Yield
  'VIG': '0920', // Dividend Appreciation
  'VUG': '0935', // Growth
  'VTV': '0966', // Value
  'VB': '0955', // Small-Cap
  'VO': '0956', // Mid-Cap
  'VV': '0925', // Large-Cap
  'VXUS': '3369', // Total International Stock
  'VEU': '0992', // FTSE All-World ex-US
  'BND': '0928', // Total Bond Market
  'BNDX': '3146', // Total International Bond
};

function getSourceInfo(symbol) {
  const sym = symbol.toUpperCase();
  if (SSGA.includes(sym)) {
    return {
      url: `https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${sym.toLowerCase()}.xlsx`,
      type: 'ssga',
    };
  }
  if (INVESCO.includes(sym)) {
    return {
      url: `https://www.invesco.com/us/financial-products/etfs/holdings/main/holdings/0?audienceType=Investor&action=download&ticker=${sym}`,
      type: 'invesco',
    };
  }
  if (ARK.includes(sym)) {
    return {
      url: `https://www.ark-funds.com/wp-content/uploads/funds-etf-csv/ARK_${sym}_HOLDINGS.csv`,
      type: 'ark',
    };
  }
  if (ISHARES[sym]) {
    return {
      url: `https://www.ishares.com/us/products/${ISHARES[sym]}/fund/1467271812596.ajax?fileType=csv&fileName=${sym}_holdings&dataType=fund`,
      type: 'ishares',
    };
  }
  if (VANGUARD[sym]) {
    return {
      url: `https://api.vanguard.com/rs/ire/01/ind/fund/${VANGUARD[sym]}/portfolio-holding/stock.jsonp?callback=&count=999&format=jsonp`,
      type: 'vanguard',
    };
  }
  return null;
}

async function fetchSSGA(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    },
  });
  if (!r.ok) throw new Error(`SSGA fetch failed: ${r.status}`);
  const buffer = await r.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map(c => String(c).toLowerCase());
    if (row.some(c => c === 'ticker' || c.includes('ticker')) && row.some(c => c.includes('weight'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error('Header row not found in SSGA');

  const headers = rows[headerIdx].map(c => String(c).toLowerCase().trim());
  const tickerCol = headers.findIndex(h => h === 'ticker' || h.includes('ticker'));
  const nameCol = headers.findIndex(h => h === 'name' || h.includes('name'));
  const weightCol = headers.findIndex(h => h.includes('weight'));
  const sectorCol = headers.findIndex(h => h.includes('sector'));

  const holdings = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || tickerCol < 0 || !row[tickerCol]) continue;
    const ticker = String(row[tickerCol]).trim();
    if (!ticker || ticker === '-' || ticker === '') continue;
    let weight = row[weightCol];
    if (typeof weight === 'string') weight = parseFloat(weight.replace('%','').replace(/,/g,'').trim());
    if (typeof weight !== 'number' || isNaN(weight)) weight = null;
    holdings.push({
      symbol: ticker,
      name: nameCol >= 0 ? String(row[nameCol] || '').trim() : '',
      weight,
      sector: sectorCol >= 0 ? String(row[sectorCol] || '').trim() : '',
    });
  }
  holdings.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return holdings;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const result = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuote = !inQuote; continue; }
      if (c === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
      cur += c;
    }
    result.push(cur);
    out.push(result);
  }
  return out;
}

async function fetchInvesco(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/121.0.0.0 Safari/537.36' },
  });
  if (!r.ok) throw new Error(`Invesco fetch failed: ${r.status}`);
  const text = await r.text();
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('Invesco CSV empty');
  const headers = rows[0].map(h => h.toLowerCase().trim());
  const tickerCol = headers.findIndex(h => h === 'holding ticker' || h === 'ticker');
  const nameCol = headers.findIndex(h => h === 'name' || h === 'holding name' || h.includes('description'));
  const weightCol = headers.findIndex(h => h.includes('weight') || h.includes('% of'));
  const sectorCol = headers.findIndex(h => h.includes('sector') || h.includes('industry'));

  const holdings = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (tickerCol < 0 || !cols[tickerCol]) continue;
    const ticker = String(cols[tickerCol] || '').trim();
    if (!ticker) continue;
    let weight = cols[weightCol];
    if (typeof weight === 'string') weight = parseFloat(weight.replace('%','').replace(/,/g,'').trim());
    if (typeof weight !== 'number' || isNaN(weight)) weight = null;
    holdings.push({
      symbol: ticker,
      name: nameCol >= 0 ? String(cols[nameCol] || '').trim() : '',
      weight,
      sector: sectorCol >= 0 ? String(cols[sectorCol] || '').trim() : '',
    });
  }
  holdings.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return holdings;
}

async function fetchARK(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/121.0.0.0 Safari/537.36' },
  });
  if (!r.ok) throw new Error(`ARK fetch failed: ${r.status}`);
  const text = await r.text();
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('ARK CSV empty');
  // ARK columns: date, fund, company, ticker, cusip, shares, market value, weight (%)
  const headers = rows[0].map(h => h.toLowerCase().trim());
  const tickerCol = headers.findIndex(h => h === 'ticker');
  const nameCol = headers.findIndex(h => h === 'company' || h === 'name');
  const weightCol = headers.findIndex(h => h.includes('weight'));

  const holdings = [];
  for (let i = 1; i < rows.length; i++) {
    const cols = rows[i];
    if (tickerCol < 0 || !cols[tickerCol]) continue;
    const ticker = String(cols[tickerCol] || '').trim();
    if (!ticker) continue;
    let weight = cols[weightCol];
    if (typeof weight === 'string') weight = parseFloat(weight.replace('%','').replace(/,/g,'').trim());
    if (typeof weight !== 'number' || isNaN(weight)) weight = null;
    holdings.push({
      symbol: ticker,
      name: nameCol >= 0 ? String(cols[nameCol] || '').trim() : '',
      weight,
      sector: '',
    });
  }
  holdings.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return holdings;
}

async function fetchIShares(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 Chrome/121.0.0.0 Safari/537.36' },
  });
  if (!r.ok) throw new Error(`iShares fetch failed: ${r.status}`);
  const text = await r.text();
  const rows = parseCsv(text);
  if (rows.length < 5) throw new Error('iShares CSV empty');
  // iShares CSV는 상단 메타데이터가 있어서 헤더 행을 찾아야 함
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const row = rows[i].map(c => String(c).toLowerCase());
    if (row.some(c => c === 'ticker') && row.some(c => c.includes('weight'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error('iShares header not found');
  const headers = rows[headerIdx].map(h => h.toLowerCase().trim());
  const tickerCol = headers.findIndex(h => h === 'ticker');
  const nameCol = headers.findIndex(h => h === 'name');
  const weightCol = headers.findIndex(h => h.includes('weight'));
  const sectorCol = headers.findIndex(h => h === 'sector');

  const holdings = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const cols = rows[i];
    if (tickerCol < 0 || !cols[tickerCol]) continue;
    const ticker = String(cols[tickerCol] || '').trim();
    if (!ticker || ticker === '-') continue;
    let weight = cols[weightCol];
    if (typeof weight === 'string') weight = parseFloat(weight.replace('%','').replace(/,/g,'').trim());
    if (typeof weight !== 'number' || isNaN(weight)) weight = null;
    holdings.push({
      symbol: ticker,
      name: nameCol >= 0 ? String(cols[nameCol] || '').trim() : '',
      weight,
      sector: sectorCol >= 0 ? String(cols[sectorCol] || '').trim() : '',
    });
  }
  holdings.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return holdings;
}

async function fetchVanguard(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://investor.vanguard.com/',
    },
  });
  if (!r.ok) throw new Error(`Vanguard fetch failed: ${r.status}`);
  const text = await r.text();
  // jsonp callback 처리
  let json;
  try {
    // jsonp 형식: callback({...})
    const m = text.match(/\(([\s\S]*)\)\s*;?\s*$/);
    json = m ? JSON.parse(m[1]) : JSON.parse(text);
  } catch {
    throw new Error('Vanguard JSON parse failed');
  }
  // Vanguard 응답: { fund: { entity: [{ ticker, longName, percentWeight, sector, ... }] } }
  const items = json?.fund?.entity || json?.entity || json?.items || [];
  if (!Array.isArray(items) || items.length === 0) throw new Error('Vanguard items empty');
  const holdings = items.map(it => ({
    symbol: it.ticker || it.symbol || '',
    name: it.longName || it.shortName || it.holdingName || '',
    weight: typeof it.percentWeight === 'number' ? it.percentWeight : (typeof it.percentOfFunds === 'number' ? it.percentOfFunds : (parseFloat(it.percentWeight) || null)),
    sector: it.sector || it.gicsSector || '',
  })).filter(h => h.symbol);
  holdings.sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return holdings;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'symbol required' });

  const sym = symbol.toUpperCase();
  const cached = cache.get(sym);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return res.json({ holdings: cached.data, source: cached.source, cached: true, count: cached.data.length });
  }

  const info = getSourceInfo(sym);
  if (!info) {
    return res.status(404).json({
      error: 'ETF not supported',
      symbol: sym,
      hint: 'Supported issuers: SSGA, Invesco, iShares, Vanguard, ARK',
    });
  }

  try {
    let holdings;
    switch (info.type) {
      case 'ssga': holdings = await fetchSSGA(info.url); break;
      case 'invesco': holdings = await fetchInvesco(info.url); break;
      case 'ark': holdings = await fetchARK(info.url); break;
      case 'ishares': holdings = await fetchIShares(info.url); break;
      case 'vanguard': holdings = await fetchVanguard(info.url); break;
      default: return res.status(500).json({ error: 'unknown source' });
    }

    if (!holdings || holdings.length === 0) {
      return res.status(500).json({ error: 'no holdings parsed', source: info.type });
    }

    cache.set(sym, { data: holdings, time: Date.now(), source: info.type });
    return res.json({ holdings, source: info.type, count: holdings.length });
  } catch (e) {
    return res.status(500).json({ error: e.message, source: info.type });
  }
}
