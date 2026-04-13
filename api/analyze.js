export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
  maxDuration: 60,
};

function validateTradePlan(parsed) {
  if (!parsed || typeof parsed !== 'object') return { valid: true };
  const direction = (parsed.bias || parsed.direction || '').toUpperCase();
  if (direction === 'NEUTRAL' || direction === 'NONE' || parsed.grade === 'PASS') return { valid: true };
  const toNum = (val) => { if (!val) return null; const n = parseFloat(String(val).replace(/[^0-9.-]/g, '')); return isNaN(n) ? null : n; };
  const entry = toNum(parsed.trigger_level);
  const tp1   = toNum(parsed.tp1);
  const tp2   = toNum(parsed.tp2);
  const runner= toNum(parsed.runner);
  const stop  = toNum(parsed.stop_loss);
  if (!entry || !tp1) return { valid: true };
  const errors = [];
  if (direction === 'SHORT') {
    if (tp1 >= entry)              errors.push(`TP1 (${tp1}) must be BELOW entry (${entry}) for SHORT`);
    if (tp2 && tp1 && tp2 >= tp1) errors.push(`TP2 (${tp2}) must be BELOW TP1 (${tp1}) for SHORT`);
    if (runner && tp2 && runner >= tp2) errors.push(`Runner (${runner}) must be BELOW TP2 (${tp2}) for SHORT`);
    if (stop && stop <= entry)     errors.push(`Stop (${stop}) must be ABOVE entry (${entry}) for SHORT`);
  }
  if (direction === 'LONG') {
    if (tp1 <= entry)              errors.push(`TP1 (${tp1}) must be ABOVE entry (${entry}) for LONG`);
    if (tp2 && tp1 && tp2 <= tp1) errors.push(`TP2 (${tp2}) must be ABOVE TP1 (${tp1}) for LONG`);
    if (runner && tp2 && runner <= tp2) errors.push(`Runner (${runner}) must be ABOVE TP2 (${tp2}) for LONG`);
    if (stop && stop >= entry)     errors.push(`Stop (${stop}) must be BELOW entry (${entry}) for LONG`);
  }
  if (errors.length === 0) return { valid: true };
  const fixed = { ...parsed, grade: parsed.grade === 'A+' || parsed.grade === 'A' ? 'B' : parsed.grade, _validation_warning: `TP direction math corrected: ${errors.join(' | ')}`, what_still_needed: [...(parsed.what_still_needed || []), `Verify TP levels — directional math flagged: ${errors[0]}`] };
  return { valid: false, reason: errors.join(' | '), fixed };
}

// Retry with exponential backoff — 3 attempts: 2s, 4s, 8s
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if ((response.status === 429 || response.status === 529 || response.status === 500) && attempt < maxRetries - 1) {
        const waitMs = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.warn(`[OmniUSD] API returned ${response.status} — retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[OmniUSD] Network error — retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries}):`, err.message);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError || new Error('Max retries exceeded');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey.trim()) return res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY not configured on server.' } });

  try {
    const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (response.ok && data?.content?.[0]?.text) {
      const text = data.content[0].text;
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        if (parsed?.grade && parsed?.bias) {
          const validation = validateTradePlan(parsed);
          if (!validation.valid) {
            console.warn('[OmniUSD] TP validation failed:', validation.reason);
            data.content[0].text = JSON.stringify(validation.fixed);
          }
        }
      } catch (_) {}
    }

    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: { message: err.message } });
  }
}
