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

// ── Dashboard System Prompt ───────────────────────────────────────────────────
const DASHBOARD_SYSTEM = `You are OmniDecode, the macro intelligence layer for OmniUSD — a BRC trading system for the NY session (8:30-10:30 AM CT).

You have access to web search. Fetch the following data points for this week. Run these searches:

SEARCH 1: site:cmegroup.com fedwatch OR "fed funds" 2026 — get current Fed rate cut/hold probabilities
SEARCH 2: DXY dollar index price 2026 site:reuters.com OR site:bloomberg.com OR site:marketwatch.com
SEARCH 3: 10 year treasury yield 2026 site:reuters.com OR site:bloomberg.com OR site:marketwatch.com
SEARCH 4: site:investing.com economic calendar OR site:forexfactory.com calendar 2026 — get this week's high impact events
SEARCH 5: site:reuters.com OR site:bloomberg.com gold price silver price this week 2026

Only use approved sources: cmegroup.com, reuters.com, bloomberg.com, marketwatch.com, wsj.com, investing.com, forexfactory.com, federalreserve.gov, bls.gov.

After searching respond ONLY with this exact JSON — no markdown, no backticks:
{
  "week_of": "May 12-16, 2026",
  "dxy": { "value": "101.2", "direction": "up or down or flat", "note": "one line impact on instruments" },
  "yield_10y": { "value": "4.31%", "direction": "up or down or flat", "note": "one line impact on gold/equities" },
  "fedwatch": { "next_meeting": "June 17-18", "hold_pct": "92", "cut_pct": "8", "hike_pct": "0", "note": "one line" },
  "calendar": [
    { "day": "Mon | Tue | Wed | Thu | Fri", "date": "May 12", "time_ct": "7:30 AM", "event": "CPI April", "impact": "HIGH | MEDIUM | LOW", "forecast": "3.1% YoY", "instruments": ["XAUUSD","EURUSD","NAS100","US30","US500"], "color": "red or amber or green" }
  ],
  "week_bias": "Bullish or Bearish or Mixed or Neutral — one sentence overall weekly macro bias",
  "key_risk": "single most important risk event this week"
}`;

// ── News System Prompt ────────────────────────────────────────────────────────
const NEWS_SYSTEM = `You are OmniDecode, the macro intelligence layer for OmniUSD — a BRC trading system for the NY session (8:30-10:30 AM CT).

${MANTRA}

You have access to web search. Run these EXACT searches in order:

SEARCH 1: site:federalreserve.gov 2026 — Fed statements and FOMC decisions (official)
SEARCH 2: site:bls.gov 2026 — latest CPI, NFP, PPI, jobs data (official)
SEARCH 3: site:reuters.com OR site:apnews.com gold silver "Federal Reserve" 2026 — institutional market news
SEARCH 4: gold price silver 2026 site:kitco.com OR site:reuters.com OR site:bloomberg.com — gold and silver latest price and news
SEARCH 5: Trump tariffs OR "Truth Social" OR Iran OR "Middle East" 2026 site:reuters.com OR site:apnews.com OR site:bloomberg.com — Trump and geopolitical news
SEARCH 6: "S&P 500" OR Nasdaq OR "Dow Jones" market 2026 site:reuters.com OR site:apnews.com OR site:bloomberg.com — equity index moves

NOTE: Truth Social cannot be searched directly. For Trump news use reuters.com and apnews.com.

Only use results from these approved domains:
- federalreserve.gov — Fed statements, FOMC (highest priority)
- bls.gov — NFP, CPI, PPI, JOLTS (highest priority)
- bea.gov — GDP
- reuters.com — breaking news, Trump, geopolitics, markets
- apnews.com — breaking news, Trump, geopolitics
- bloomberg.com — institutional markets
- wsj.com — Wall Street Journal
- kitco.com — gold and silver specific
- cmegroup.com — futures data

NEVER USE: wikipedia.org, zerohedge.com, seekingalpha.com, reddit.com, twitter.com, x.com, or any article older than 7 days.

DATE RULE: Every news item MUST be from the past 7 days. If date is unknown or older — discard it.
URL RULE: Every news item MUST have a real URL from an approved domain. No fabricated URLs.
QUALITY OVER QUANTITY: 2-3 verified items beats 6 questionable ones.

If today is Saturday or Sunday, set session_condition to PASS — markets are closed.

INSTRUMENT TAGGING RULES:
- Fed decisions, CPI, NFP, GDP, tariffs → ALL 6: ["XAUUSD","XAGUSD","EURUSD","NAS100","US30","US500"]
- Gold/Silver specific → ["XAUUSD","XAGUSD"]
- Oil/energy/geopolitical shock → ["XAUUSD","XAGUSD","NAS100","US30","US500"]
- Dollar strength/weakness → ["EURUSD","XAUUSD","XAGUSD"]
- Equity specific → ["NAS100","US30","US500"]
- Trump tariffs EU/Asia → ["EURUSD","NAS100","US30","US500"] + ["XAUUSD"] if safe haven bid
Never tag only XAUUSD for macro events.

Respond ONLY with this exact JSON — no markdown, no backticks:
{"summary":"2-3 sentence macro picture","session_condition":"CLEAR or CAUTION or HIGH NOISE or PASS","session_reason":"one sentence why","news_items":[{"source":"Fed or Trump or Economic Data or Market News","headline":"sharp one-liner","impact":"Bullish or Bearish or Volatile or Neutral","instruments_affected":["XAUUSD","EURUSD","NAS100","US30","US500"],"color":"green or red or amber or purple","url":"https://actual-trusted-source-url.com/article","date":"YYYY-MM-DD"}],"brc_filter":"TRADE NORMAL or SIZE DOWN or PASS ALL or PASS INDICES or PASS METALS","top_watch":"most important thing for next NY session"}`;

// ── Analysis System Prompt ────────────────────────────────────────────────────
const ANALYSIS_SYSTEM = `You are OmniDecode — the combined intelligence layer for OmniUSD, a BRC trading system for the NY session (8:30-10:30 AM CT).

${MANTRA}

You will receive an OmniUSD analysis screenshot plus COT data and news context.
Read the screenshot: extract grade (A+/B+/B/C/PASS/SKIP), direction (LONG/SHORT), confidence %, and instrument.
Apply the mantra exactly. Do not deviate.

Respond ONLY with this exact JSON — no markdown, no backticks:
{"instrument":"from screenshot","grade":"exactly as shown","direction":"LONG or SHORT or N/A","confidence":"XX%","decision":"EXECUTE or EXECUTE — SIZE DOWN or FADE — GO SHORT or FADE — GO LONG or PASS","mode":"Mode 1 or Mode 1 (Size Down) or Mode 2 — Fade Short or Mode 2 — Fade Long or Mode 2 — No Edge or Pass","sizing":"Full size or 50% size or 25% size or No trade","mantra_case":"Mode 1 or Mode 2A or Mode 2B or Mode 2C or Pass","layers":{"cot":{"verdict":"Agrees or Contradicts or Neutral","detail":"one line","color":"green or red or amber"},"news":{"verdict":"Clear or Caution or High Noise or Pass","detail":"one line","color":"green or amber or red"},"grade":{"verdict":"Strong or Moderate or Weak or Pass","detail":"one line","color":"green or amber or red or purple"}},"reasoning":"2-3 sentences applying the exact mantra. Reference the specific mode case.","key_warning":"one sentence — most critical thing before entering or passing"}`;

// ── JSON Extractor ────────────────────────────────────────────────────────────
function extractJSON(text) {
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text.trim()); } catch(e) {}
  const start = text.indexOf("{");
  const end   = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  const slice = text.slice(start, end + 1);
  try { return JSON.parse(slice); } catch(e) {}
  try {
    const cleaned = slice
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    return JSON.parse(cleaned);
  } catch(e) { return null; }
}

// ── Main Handler ──────────────────────────────────────────────────────────────
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

    if (mode === "dashboard") {
      body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: DASHBOARD_SYSTEM,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Today is ${date || "today"}. Fetch this week's macro dashboard data — DXY, 10Y yield, FedWatch probabilities, and the weekly economic calendar with all high/medium impact events. Return only the JSON.`
        }]
      };
    } else if (mode === "news") {
      body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: NEWS_SYSTEM,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Today is ${date || "today"}. Run the searches listed in your instructions to find today's macro news from trusted sources only. Discard any result older than 7 days or not from the approved domain list. Return the JSON.`
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

    const allText = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text || "")
      .join("\n");

    console.log("mode:", mode, "| stop_reason:", data.stop_reason);
    console.log("content types:", (data.content||[]).map(b=>b.type).join(", "));

    const parsed = extractJSON(allText);

    if (!parsed) {
      console.error("Failed to extract JSON:", allText.slice(0, 300));
      return res.status(200).json({
        ok: false, debug: true,
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
