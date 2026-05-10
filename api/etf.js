// ETF holdings - 발행사 공식 사이트에서 직접 가져옴 (자동 최신화)
// 매일 마감 후 발행사가 업데이트, 우리는 12시간 캐싱
import * as XLSX from 'xlsx';

const cache = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12시간

const SSGA_TICKERS = ['XLK','XLF','XLE','XLV','XLY','XLP','XLI','XLB','XLU','XLRE','XLC','SPY','DIA','MDY'];
const INVESCO_TICKERS = ['QQQ','QQQM'];

function getSourceInfo(symbol) {
  const sym = symbol.toUpperCase();
  if (SSGA_TICKERS.includes(sym)) {
    return {
      url: `https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-${sym.toLowerCase()}.xlsx`,
      type: 'ssga',
    };
  }
  if (INVESCO_TICKERS.includes(sym)) {
    return {
      url: `https://www.invesco.com/us/financial-products/etfs/holdings/main/holdings/0?audienceType=Investor&action=download&ticker=${sym}`,
      type: 'invesco',
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

  // 헤더 행 찾기 (Ticker, Name, Weight 등이 있는 행)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map(c => String(c).toLowerCase());
    if (row.some(c => c === 'ticker' || c.includes('ticker')) && row.some(c => c.includes('weight'))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error('Header row not found');

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

async function fetchInvesco(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    },
  });
  if (!r.ok) throw new Error(`Invesco fetch failed: ${r.status}`);
  const text = await r.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('Invesco CSV empty');

  const parseCsv = (line) => {
    const result = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQuote = !inQuote; continue; }
      if (c === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
      cur += c;
    }
    result.push(cur);
    return result;
  };

  const headers = parseCsv(lines[0]).map(h => h.toLowerCase().trim());
  const tickerCol = headers.findIndex(h => h === 'holding ticker' || h === 'ticker');
  const nameCol = headers.findIndex(h => h === 'name' || h === 'holding name' || h.includes('description'));
  const weightCol = headers.findIndex(h => h.includes('weight') || h.includes('% of'));
  const sectorCol = headers.findIndex(h => h.includes('sector') || h.includes('industry'));

  const holdings = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsv(lines[i]);
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
      supported_ssga: SSGA_TICKERS,
      supported_invesco: INVESCO_TICKERS,
    });
  }

  try {
    const holdings = info.type === 'ssga'
      ? await fetchSSGA(info.url)
      : await fetchInvesco(info.url);

    if (!holdings || holdings.length === 0) {
      return res.status(500).json({ error: 'no holdings parsed', source: info.type });
    }

    cache.set(sym, { data: holdings, time: Date.now(), source: info.type });
    return res.json({ holdings, source: info.type, count: holdings.length });
  } catch (e) {
    return res.status(500).json({ error: e.message, source: info.type });
  }
}
