// /api/decode.js — OmniUSD Intelligence Decoder proxy (CommonJS)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const MANTRA = `
OMNIUSD x COT TRADING MANTRA (LOCKED):
MODE 1 — FOLLOW THE SIGNAL: Confidence 60%+ AND COT agrees with direction → Execute what OmniUSD says. Let it run. Full size.
MODE 2A — FADE: Low confidence (25-35%) + COT NET SHORT + OmniUSD signal LONG → Fade it. Go SHORT. Smart money is already there.
MODE 2B — FADE: Low confidence (25-35%) + COT NET LONG + OmniUSD signal SHORT → Fade it. Go LONG. Smart money is already there.
MODE 2C — NO EDGE: Low confidence (25-35%) + COT NEUTRAL (50/50) → No trade. Pass entirely. No edge.
PASS — overrides everything: HIGH NOISE news day, grade is PASS/SKIP, confidence below 25%, weekend/no session.
COT RULE: COT always overrides news for directional bias. News is a PASS filter only.`;

const NEWS_SYSTEM = `You are OmniDecode, the macro intelligence layer for OmniUSD — a BRC trading system for the NY session (8:30-10:30 AM CT).

${MANTRA}

You have access to web search. Search for today's most important macro news for these instruments: XAUUSD, XAGUSD, EURUSD, NAS100, US30, US500.

Search for: Fed statements, Trump Truth Social posts about markets or tariffs, major economic data (CPI/NFP/PPI/GDP), significant geopolitical events.

CRITICAL: For every news item you include, you MUST provide the actual source URL from your search results. Only include news items where you have a real URL — do not fabricate URLs. If you cannot find a URL for a story, do not include it.

If today is Saturday or Sunday, set session_condition to PASS — markets are closed, no NY session.

After searching, respond ONLY with this exact JSON structure. No markdown, no backticks, no extra text — just the raw JSON object:
{"summary":"2-3 sentence macro picture","session_condition":"CLEAR or CAUTION or HIGH NOISE or PASS","session_reason":"one sentence why","news_items":[{"source":"Fed or Trump or Economic Data or Market News","headline":"sharp one-liner","impact":"Bullish or Bearish or Volatile or Neutral","instruments_affected":["XAUUSD"],"color":"green or red or amber or purple","url":"https://actual-source-url.com/article"}],"brc_filter":"TRADE NORMAL or SIZE DOWN or PASS ALL or PASS INDICES or PASS METALS","top_watch":"most important thing for next NY session"}`;

const ANALYSIS_SYSTEM = `You are OmniDecode — the combined intelligence layer for OmniUSD, a BRC trading system for the NY session (8:30-10:30 AM CT).

${MANTRA}

You will receive an OmniUSD analysis screenshot plus COT data and news context.
Read the screenshot: extract grade (A+/B+/B/C/PASS/SKIP), direction (LONG/SHORT), confidence %, and instrument.
Apply the mantra exactly. Do not deviate.

Respond ONLY with this exact JSON — no markdown, no backticks:
{"instrument":"from screenshot","grade":"exactly as shown","direction":"LONG or SHORT or N/A","confidence":"XX%","decision":"EXECUTE or EXECUTE — SIZE DOWN or FADE — GO SHORT or FADE — GO LONG or PASS","mode":"Mode 1 or Mode 1 (Size Down) or Mode 2 — Fade Short or Mode 2 — Fade Long or Mode 2 — No Edge or Pass","sizing":"Full size or 50% size or 25% size or No trade","mantra_case":"Mode 1 or Mode 2A or Mode 2B or Mode 2C or Pass","layers":{"cot":{"verdict":"Agrees or Contradicts or Neutral","detail":"one line","color":"green or red or amber"},"news":{"verdict":"Clear or Caution or High Noise or Pass","detail":"one line","color":"green or amber or red"},"grade":{"verdict":"Strong or Moderate or Weak or Pass","detail":"one line","color":"green or amber or red or purple"}},"reasoning":"2-3 sentences applying the exact mantra. Reference the specific mode case.","key_warning":"one sentence — most critical thing before entering or passing"}`;

function extractJSON(text) {
  if (!text || !text.trim()) return null;
  // Try direct parse first
  try { return JSON.parse(text.trim()); } catch(e) {}
  // Find first { to last }
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  const slice = text.slice(start, end + 1);
  try { return JSON.parse(slice); } catch(e) {}
  // Clean and retry
  try {
    const cleaned = slice
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    return JSON.parse(cleaned);
  } catch(e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { mode, messages, date } = req.body;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    let body;

    if (mode === "news") {
      body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: NEWS_SYSTEM,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Today is ${date || "today"}. Search for today's macro news relevant to OmniUSD instruments and return the JSON.`
        }]
      };
    } else if (mode === "analyze") {
      body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: ANALYSIS_SYSTEM,
        messages: messages,
      };
    } else {
      return res.status(400).json({ error: "Invalid mode" });
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
      throw new Error("Anthropic error " + response.status + ": " + err.slice(0, 200));
    }

    const data = await response.json();

    // Collect all text blocks — web search returns tool_use + tool_result + text
    const allText = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text || "")
      .join("\n");

    console.log("stop_reason:", data.stop_reason);
    console.log("content types:", (data.content||[]).map(b=>b.type).join(", "));
    console.log("text preview:", allText.slice(0, 200));

    const parsed = extractJSON(allText);

    if (!parsed) {
      console.error("Failed to extract JSON. Full text:", allText.slice(0, 500));
      return res.status(200).json({
        ok: false,
        debug: true,
        stop_reason: data.stop_reason,
        content_types: (data.content||[]).map(b=>b.type),
        text_preview: allText.slice(0, 300)
      });
    }

    return res.status(200).json({ ok: true, result: parsed });

  } catch (err) {
    clearTimeout(timeout);
    const msg = err.name === "AbortError" ? "Request timed out after 55s" : err.message;
    console.error("decode error:", msg);
    return res.status(500).json({ error: msg });
  }
};
