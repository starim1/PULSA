export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;
  if (!hasGemini && !hasClaude) {
    return res.status(500).json({ error: 'No AI API key configured' });
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
최신 뉴스는 검색을 활용하세요.`;
    }

    const fullPrompt = systemContext + '\n\n' + userPrompt;
    const errors = [];

    // === Gemini 시도 (빠르게: 1개 모델, 1회만) ===
    if (hasGemini) {
      const model = 'gemini-2.5-flash-lite';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
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
            ?.map(p => p.text).filter(Boolean).join('\n') || '';
          if (aiText) {
            if (isShort || mode === 'translate') {
              return res.status(200).json({ text: aiText.trim(), model, provider: 'gemini' });
            }
            const sources = data?.candidates?.[0]?.groundingMetadata?.groundingChunks
              ?.map(c => c.web?.title).filter(Boolean).slice(0, 3);
            const sourceText = sources?.length ? '\n\n📚 참고 출처: ' + sources.join(', ') : '';
            return res.status(200).json({
              content: [{ type: 'text', text: aiText + sourceText }],
              model, provider: 'gemini',
            });
          }
        }
        errors.push({ provider: 'gemini', status: response.status });
        // Gemini 실패 → 즉시 Claude로 (재시도 X)
      } catch (e) {
        errors.push({ provider: 'gemini', error: e.message });
      }
    }

    // === Claude 폴백 (Gemini 실패 시 즉시 호출) ===
    if (hasClaude) {
      try {
        // web search가 필요한 경우 Claude도 web_search tool 사용
        const needsSearch = useSearch && !isShort && mode !== 'translate';
        const claudeBody = {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: mode === 'short' ? 200 : (mode === 'translate' ? 1024 : 4096),
          messages: [{ role: 'user', content: fullPrompt }],
        };
        if (needsSearch) {
          claudeBody.tools = [{
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 5,
          }];
        }

        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(claudeBody),
        });

        if (r.ok) {
          const data = await r.json();
          // text 블록들을 모아서 반환
          const aiText = (data?.content || [])
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');
          if (aiText) {
            if (isShort || mode === 'translate') {
              return res.status(200).json({ text: aiText.trim(), model: claudeBody.model, provider: 'claude' });
            }
            return res.status(200).json({
              content: [{ type: 'text', text: aiText }],
              model: claudeBody.model, provider: 'claude',
            });
          }
        } else {
          const errText = await r.text();
          errors.push({ provider: 'claude', status: r.status, body: errText.substring(0, 300) });
        }
      } catch (e) {
        errors.push({ provider: 'claude', error: e.message });
      }
    }

    return res.status(503).json({
      error: 'AI 서비스 일시 과부하. 잠시 후 다시 시도해주세요.',
      attempts: errors,
    });

  } catch (e) {
    return res.status(500).json({ error: 'Server error: ' + e.message });
  }
}
