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

// ── Trump Feed System Prompt ─────────────────────────────────────────────────
const TRUMP_SYSTEM = `You are OmniDecode, the macro intelligence layer for OmniUSD — a BRC trading system for the NY session (8:30-10:30 AM CT).

You will receive the raw HTML/text content of trumpstruth.org — a live archive of Donald Trump's Truth Social posts.

YOUR JOB: Scan all posts and extract ONLY the ones that are market-relevant. Ignore political attacks, retweets of random users, entertainment, and personal posts.

MARKET-RELEVANT posts include:
- Tariffs (any country, any product)
- Trade deals or negotiations
- Federal Reserve / Jerome Powell / interest rates
- Dollar strength/weakness
- Stock market comments ("Market is doing great", "Stocks up")
- Iran, Middle East, oil, Strait of Hormuz
- China trade, Xi Jinping
- EU trade, NATO
- Sanctions, executive orders affecting markets
- Any specific mention of Gold, crypto, or commodities

For each market-relevant post extract the exact quote and timestamp.

Respond ONLY with this exact JSON — no markdown, no backticks:
{"posts":[{"time":"May 11, 2026 11:28 PM","text":"exact quote from the post — max 280 chars","topic":"Tariffs or Fed or Iran or Trade or Markets or Dollar or Geopolitics","instruments_affected":["XAUUSD","EURUSD","NAS100","US30","US500"],"impact":"Bullish or Bearish or Volatile or Neutral","color":"green or red or amber or purple","url":"https://truthsocial.com/@realDonaldTrump/[post-id]"}],"market_posts_found":0,"last_checked":"timestamp of most recent post seen","summary":"one sentence — overall market tone from Trump's recent posts or 'No market-relevant posts in recent feed'"}`;

// ── Dashboard System Prompt ───────────────────────────────────────────────────
const DASHBOARD_SYSTEM = `You are OmniDecode for OmniUSD, a BRC trading system (NY session 8:30-10:30 AM CT).

Run these 3 searches in order:
1. "US dollar index" DXY price today 2026
2. "10 year treasury yield" today 2026
3. economic calendar this week high impact forex 2026

For DXY: find the current index value (should be a number like 101.5). Direction vs last week: up/down/flat.
For 10Y yield: find the current % (like 4.31%). Direction vs last week: up/down/flat.
For calendar: list only HIGH and MEDIUM impact US events this week with CT times.

If you cannot find DXY or yield from search — use your knowledge of recent values as a best estimate and mark as "est."

Return ONLY this JSON, no markdown, no backticks:
{"week_of":"May 12-16 2026","dxy":{"value":"101.5","direction":"up or down or flat","note":"one line on dollar impact"},"yield_10y":{"value":"4.31%","direction":"up or down or flat","note":"one line on yield impact"},"fedwatch":{"next_meeting":"June 17-18","hold_pct":"90","cut_pct":"10","hike_pct":"0","note":"one line"},"calendar":[{"day":"Tue","date":"May 12","time_ct":"7:30 AM","event":"CPI April","impact":"HIGH","forecast":"3.1%","instruments":["XAUUSD","EURUSD","NAS100","US30","US500"],"color":"red"}],"week_bias":"one sentence","key_risk":"one sentence","instrument_outlook":[{"instrument":"XAUUSD","verdict":"TRADE or CAUTION or AVOID","direction":"LONG or SHORT or NEUTRAL","plain_english":"max 20 words — must state LONG or SHORT bias explicitly"},{"instrument":"XAGUSD","verdict":"TRADE or CAUTION or AVOID","direction":"LONG or SHORT or NEUTRAL","plain_english":"max 20 words — must state LONG or SHORT"},{"instrument":"EURUSD","verdict":"TRADE or CAUTION or AVOID","direction":"LONG or SHORT or NEUTRAL","plain_english":"max 20 words — must state LONG or SHORT"},{"instrument":"NAS100","verdict":"TRADE or CAUTION or AVOID","direction":"LONG or SHORT or NEUTRAL","plain_english":"max 20 words — must state LONG or SHORT"},{"instrument":"US30","verdict":"TRADE or CAUTION or AVOID","direction":"LONG or SHORT or NEUTRAL","plain_english":"max 20 words — must state LONG or SHORT"},{"instrument":"US500","verdict":"TRADE or CAUTION or AVOID","direction":"LONG or SHORT or NEUTRAL","plain_english":"max 20 words — must state LONG or SHORT"}]}`;

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
  const timeout = setTimeout(() => controller.abort(), 58000);

  try {
    let body;

    if (mode === "dashboard") {
      body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1800,
        system: DASHBOARD_SYSTEM,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Today is ${date || "today"}. Search for DXY, 10Y yield, and this week's economic calendar. Return JSON only.`
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
    } else if (mode === "trump") {
      // Manual paste mode — user provides posts directly
      const pastedPosts = req.body.posts || "";
      if (!pastedPosts.trim()) {
        return res.status(400).json({ error: "No posts provided" });
      }
      body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: TRUMP_SYSTEM,
        messages: [{
          role: "user",
          content: `Here are Trump's Truth Social posts pasted by the user. Analyze each one and extract only the market-relevant content:

${pastedPosts}`
        }]
      };
    } else if (mode === "omniintel") {
      // OmniIntel — Opus 4, full institutional thinking
      const systemPrompt = req.body.system_override || ANALYSIS_SYSTEM;
      body = {
        model: "claude-opus-4-5",
        max_tokens: 1500,
        system: systemPrompt,
        messages: messages,
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
    const msg = err.name === "AbortError" ? "Request timed out after 58s — try with fewer images" 
              : err.message || String(err);
    console.error("decode error:", mode, msg);
    return res.status(200).json({ ok: false, error: msg });
  }
};
