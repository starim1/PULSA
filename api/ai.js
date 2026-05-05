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
    const userPrompt = req.body?.prompt || req.body?.messages?.[0]?.content || '주식 분석';
    const isShort = !!req.body?.short;
    const useSearch = req.body?.search !== false;
    const mode = req.body?.mode || (isShort ? 'short' : 'full');

    const now = new Date();
    const krDate = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    }).format(now);

    let systemContext;
    if (isShort || mode === 'translate') {
      systemContext = mode === 'translate'
        ? `당신은 전문 번역가입니다. 자연스러운 한국어로만 번역하세요.`
        : `당신은 주식 분석 전문가입니다. 답변은 반드시 한 문장(40자 이내)으로 핵심만.`;
    } else {
      systemContext = `당신은 전문 주식 애널리스트입니다.
**중요: 현재 시점은 ${krDate}입니다. 절대 다른 날짜를 사용하지 마세요.**
최신 뉴스는 Google 검색을 활용하세요.`;
    }

    const fullPrompt = systemContext + '\n\n' + userPrompt;

    // 모델 폴백 순서: lite (빠름/저렴) → flash (안정) → flash-002 (백업)
    const models = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-001'];

    const body = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: isShort ? 0.5 : 0.7,
        maxOutputTokens: mode === 'short' ? 200 : (mode === 'translate' ? 1024 : 2048),
      },
    };
    if (useSearch && !isShort && mode !== 'translate') {
      body.tools = [{ google_search: {} }];
    }

    const errors = [];
    
    // 각 모델당 3회 시도 (지수 백오프: 2초 → 5초 → 다음 모델)
    const RETRY_DELAYS = [2000, 5000];  // 1차 실패 후 2초, 2차 실패 후 5초
    
    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
      
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

          const text = await response.text();
          let data;
          try { data = JSON.parse(text); } catch { data = { raw: text }; }

          if (response.ok) {
            const aiText = data?.candidates?.[0]?.content?.parts
              ?.map(p => p.text)
              .filter(Boolean)
              .join('\n') || '응답이 비어있습니다.';

            if (isShort || mode === 'translate') {
              return res.status(200).json({ text: aiText.trim(), model });
            }

            const sources = data?.candidates?.[0]?.groundingMetadata?.groundingChunks
              ?.map(c => c.web?.title)
              .filter(Boolean)
              .slice(0, 3);
            const sourceText = sources?.length ? '\n\n📚 참고 출처: ' + sources.join(', ') : '';

            return res.status(200).json({
              content: [{ type: 'text', text: aiText + sourceText }],
              model,
            });
          }

          // 503, 429, 500: 재시도 가치 있음
          if (response.status === 503 || response.status === 429 || response.status === 500) {
            errors.push({ model, attempt: attempt+1, status: response.status });
            // 마지막 시도가 아니면 백오프 후 재시도
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
              continue;
            }
            // 3번 다 실패: 다음 모델로
            break;
          }

          // 400, 401 등 다른 에러는 재시도/폴백 의미 없음
          return res.status(response.status).json({
            error: 'Gemini API error',
            status: response.status,
            model,
            details: data,
          });

        } catch (e) {
          errors.push({ model, attempt: attempt+1, error: e.message });
          if (attempt < 2) {
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
            continue;
          }
          break;
        }
      }
    }

    // 모든 시도 실패
    return res.status(503).json({
      error: 'AI 서비스 일시 과부하. 잠시 후 다시 시도해주세요.',
      attempts: errors,
    });

  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}
