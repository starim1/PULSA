export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  }

  try {
    // 두 형식 모두 지원
    const userPrompt = req.body?.prompt || req.body?.messages?.[0]?.content || '주식 분석';
    const isShort = !!req.body?.short;
    const useSearch = req.body?.search !== false;  // 기본은 검색 사용

    // 현재 날짜 (한국 시간)
    const now = new Date();
    const krDate = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    }).format(now);

    let systemContext;
    if (isShort) {
      systemContext = `당신은 주식 분석 전문가입니다. 답변은 반드시 한 문장(40자 이내)으로 핵심만. 다른 설명 없이 결과만.`;
    } else {
      systemContext = `당신은 전문 주식 애널리스트입니다.
**중요: 현재 시점은 ${krDate}입니다. 절대 다른 날짜를 사용하지 마세요.**
답변에서 "현재 시점"을 언급할 때는 반드시 위의 날짜를 사용하세요.
최신 뉴스와 실적 정보는 Google 검색을 활용해 확인하고, 검색 결과 기반으로 답변하세요.
검색하지 않은 추측성 정보는 제공하지 마세요.`;
    }

    const fullPrompt = systemContext + '\n\n' + userPrompt;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const body = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: isShort ? 0.5 : 0.7,
        maxOutputTokens: isShort ? 200 : 2048,
      },
    };
    if (useSearch && !isShort) {
      body.tools = [{ google_search: {} }];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Gemini API error',
        status: response.status,
        details: data,
      });
    }

    const aiText = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || '응답이 비어있습니다.';

    // short 모드에서는 출처 안 붙임
    if (isShort) {
      return res.status(200).json({ text: aiText.trim() });
    }

    // 검색 출처
    const sources = data?.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map(c => c.web?.title)
      .filter(Boolean)
      .slice(0, 3);
    const sourceText = sources?.length ? '\n\n📚 참고 출처: ' + sources.join(', ') : '';

    return res.status(200).json({
      content: [{ type: 'text', text: aiText + sourceText }],
    });
  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}
