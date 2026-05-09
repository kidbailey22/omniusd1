// /api/decode.js — OmniUSD Intelligence Decoder proxy (CommonJS)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const MANTRA = `
═══════════════════════════════════════════
OMNIUSD x COT — TRADING MANTRA (LOCKED)
═══════════════════════════════════════════

MODE 1 — FOLLOW THE SIGNAL
Conditions: Confidence 60%+ AND COT agrees with direction
Decision: Execute what OmniUSD says. Let it run.
Sizing: Full size (unless news = CAUTION, then 50%)

MODE 2 — FADE THE SIGNAL
Three sub-cases:

Case A:
- Low confidence (25-35%)
- COT Commercials/Asset Managers NET SHORT
- OmniUSD signal is LONG
Fade it. Go SHORT. Smart money is already there.

Case B:
- Low confidence (25-35%)
- COT Commercials/Asset Managers NET LONG
- OmniUSD signal is SHORT
Fade it. Go LONG. Smart money is already there.

Case C:
- Low confidence (25-35%)
- COT Commercials NEUTRAL (50/50)
No trade. Pass entirely. No edge.

PASS — Do not trade (overrides everything):
- News creates HIGH NOISE condition (surprise Fed, Trump macro shock, major data)
- Grade shown in screenshot is PASS or SKIP
- Confidence below 25%
- Weekend — no NY session

COT RULE: COT always overrides news for directional bias.
News is a PASS filter only — it cannot create a trade, only cancel one.
═══════════════════════════════════════════`;

const NEWS_SYSTEM = `You are OmniDecode, the macro intelligence layer for OmniUSD — a BRC trading system for the NY session (8:30–10:30 AM CT).

${MANTRA}

The OmniUSD COT Mantra: Mode 1 = confidence 60%+ and COT agrees = execute. Mode 2 = low confidence 25-35% and COT contradicts = fade the signal. News is a PASS filter only — it cannot create trades, only cancel them.

Search for today's macro news relevant to these 6 instruments: XAUUSD, XAGUSD, EURUSD, NAS100, US30, US500.

Search for: Fed statements, Trump Truth Social posts about markets/tariffs/dollar, major economic data releases (CPI/NFP/PPI/GDP), significant geopolitical or market-moving events.

If it is a weekend, set session_condition to PASS and explain markets are closed.

After searching, return ONLY this JSON — no markdown, no backticks:
{
  "summary": "2-3 sentence overall macro picture for today",
  "session_condition": "CLEAR | CAUTION | HIGH NOISE | PASS",
  "session_reason": "One sentence why",
  "news_items": [
    { "source": "Fed | Trump | Economic Data | Market News", "headline": "sharp one-liner", "impact": "Bullish | Bearish | Volatile | Neutral", "instruments_affected": ["XAUUSD"], "color": "green | red | amber | purple" }
  ],
  "brc_filter": "TRADE NORMAL | SIZE DOWN | PASS ALL | PASS INDICES | PASS METALS",
  "top_watch": "The single most important thing to watch entering the next NY session"
}`;

const ANALYSIS_SYSTEM = `You are OmniDecode — the combined intelligence layer for OmniUSD, a BRC (Break-Retest-Continuation) trading system for the NY session (8:30–10:30 AM CT).

You will receive:
1. An OmniUSD analysis screenshot — read the grade, confidence %, direction (LONG/SHORT), instrument, and any other visible data
2. The current week's COT positioning for that instrument
3. Today's macro news context

${MANTRA}

Read the screenshot carefully. Extract grade, direction, confidence %, instrument.
Then apply the mantra above exactly. Do not deviate.

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "instrument": "detected from screenshot",
  "grade": "A+ | B+ | B | C | PASS | SKIP — exactly as shown",
  "direction": "LONG | SHORT | N/A",
  "confidence": "XX% — exactly as shown or estimated",
  "decision": "EXECUTE | EXECUTE — SIZE DOWN | FADE — GO SHORT | FADE — GO LONG | PASS",
  "mode": "Mode 1 | Mode 1 (Size Down) | Mode 2 — Fade Short | Mode 2 — Fade Long | Mode 2 — No Edge | Pass",
  "sizing": "Full size | 50% size | 25% size | No trade",
  "mantra_case": "Mode 1 | Mode 2A | Mode 2B | Mode 2C | Pass",
  "layers": {
    "cot": { "verdict": "Agrees | Contradicts | Neutral", "detail": "one line max 12 words", "color": "green | red | amber" },
    "news": { "verdict": "Clear | Caution | High Noise | Pass", "detail": "one line max 12 words", "color": "green | amber | red" },
    "grade": { "verdict": "Strong | Moderate | Weak | Pass", "detail": "one line max 12 words", "color": "green | amber | red | purple" }
  },
  "reasoning": "2-3 sentences applying the exact mantra to this setup. Reference the specific mode case.",
  "key_warning": "One sentence — the most critical thing before entering or passing"
}`;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { mode, messages, date } = req.body;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    let body;

    if (mode === "news") {
      // News fetch — uses web search tool
      body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: NEWS_SYSTEM,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Search for and decode today's macro news (${date || "today"}) for OmniUSD. Check Fed statements, Trump Truth Social, economic data releases, and major market-moving events for XAUUSD, XAGUSD, EURUSD, NAS100, US30, US500.`
        }]
      };
    } else if (mode === "analyze") {
      // Screenshot analysis — uses vision
      body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: ANALYSIS_SYSTEM,
        messages: messages,
      };
    } else {
      return res.status(400).json({ error: "Invalid mode. Use 'news' or 'analyze'." });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify(body),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error("Anthropic API error: " + response.status + " — " + err);
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    clearTimeout(timeout);
    const msg = err.name === "AbortError" ? "Request timed out" : err.message;
    console.error("decode API error:", msg);
    return res.status(500).json({ error: msg });
  }
};
