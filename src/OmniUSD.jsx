import React, { useState, useRef, useEffect } from "react";


// ─── Supabase (fetch-based client — no external library needed) ─────────────
const SUPABASE_URL = "https://bwvbsomzldouymsldpsu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dmJzb216bGRvdXltc2xkcHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MDAwOTksImV4cCI6MjA4OTM3NjA5OX0.FxXLEaCIPTlbZSyYOcqtsKNyURmQzK50XzkVjgt-2Ik";

// Lightweight Supabase client using fetch + localStorage for session
const supabase = (() => {
  const BASE = SUPABASE_URL;
  const KEY  = SUPABASE_KEY;
  const SESSION_KEY = "omniusd_session";

  function headers(token) {
    const h = { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${token || KEY}` };
    return h;
  }
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }
  function saveSession(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  // Auth state listeners
  const listeners = [];
  function notifyListeners(event, session) {
    listeners.forEach(fn => fn(event, session));
  }

  const auth = {
    async getSession() {
      const s = getSession();
      return { data: { session: s } };
    },
    onAuthStateChange(callback) {
      listeners.push(callback);
      // Fire immediately with current state
      const s = getSession();
      setTimeout(() => callback(s ? "SIGNED_IN" : "SIGNED_OUT", s), 0);
      return { data: { subscription: { unsubscribe: () => {
        const i = listeners.indexOf(callback);
        if (i > -1) listeners.splice(i, 1);
      }}}};
    },
    async signUp({ email, password }) {
      const res = await fetch(`${BASE}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": KEY },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: { message: data.msg || data.error_description || "Signup failed" } };
      if (data.access_token) { saveSession(data); notifyListeners("SIGNED_IN", data); }
      return { data, error: null };
    },
    async signInWithPassword({ email, password }) {
      const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": KEY },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: { message: data.error_description || data.msg || "Invalid credentials" } };
      saveSession(data);
      notifyListeners("SIGNED_IN", data);
      return { data, error: null };
    },
    async signOut() {
      const s = getSession();
      if (s?.access_token) {
        await fetch(`${BASE}/auth/v1/logout`, {
          method: "POST",
          headers: headers(s.access_token),
        }).catch(() => {});
      }
      saveSession(null);
      notifyListeners("SIGNED_OUT", null);
      return { error: null };
    },
    async resetPasswordForEmail(email) {
      const res = await fetch(`${BASE}/auth/v1/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": KEY },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { const d = await res.json(); return { error: { message: d.msg || "Reset failed" } }; }
      return { error: null };
    },
  };

  function from(table) {
    const s = getSession();
    const token = s?.access_token;
    const h = headers(token);
    return {
      select(cols = "*") {
        this._select = cols; return this;
      },
      eq(col, val) { this._eq = { col, val }; return this; },
      single() { this._single = true; return this; },
      async then(resolve) {
        let url = `${BASE}/rest/v1/${table}?select=${this._select || "*"}`;
        if (this._eq) url += `&${this._eq.col}=eq.${this._eq.val}`;
        if (this._single) h["Accept"] = "application/vnd.pgrst.object+json";
        const res = await fetch(url, { headers: h });
        const data = await res.json();
        if (!res.ok) return resolve({ data: null, error: data });
        return resolve({ data, error: null });
      },
      async upsert(row) {
        const res = await fetch(`${BASE}/rest/v1/${table}`, {
          method: "POST",
          headers: { ...h, "Prefer": "resolution=merge-duplicates" },
          body: JSON.stringify(row),
        });
        if (!res.ok) { const d = await res.json(); return { error: d }; }
        return { error: null };
      },
      async delete() {
        if (!this._eq) return { error: { message: "No eq condition" } };
        const url = `${BASE}/rest/v1/${table}?${this._eq.col}=eq.${this._eq.val}`;
        const res = await fetch(url, { method: "DELETE", headers: h });
        if (!res.ok) { const d = await res.json(); return { error: d }; }
        return { error: null };
      },
    };
  }

  return { auth, from };
})();

// ─── Sample trades ─────────────────────────────────────────────────────────
const SAMPLE_TRADES = [
  { id:1, date:"Mar 10, 2026", time:"9:14 AM",  instrument:"XAUUSD", direction:"LONG",  entry:2318.50, exit:2341.20, phase:"Continuation", d:"🐂", h4:"🐂", h1:"🐂", result:"WIN",  pnl:+22.7 },
  { id:2, date:"Mar 07, 2026", time:"10:02 AM", instrument:"BTCUSD", direction:"SHORT", entry:88420,   exit:87100,   phase:"Retest",       d:"🐻", h4:"🐻", h1:"🐻", result:"WIN",  pnl:+18.3 },
  { id:3, date:"Mar 05, 2026", time:"8:48 AM",  instrument:"USOIL",  direction:"LONG",  entry:71.40,   exit:70.90,   phase:"Break",        d:"🐂", h4:"🐂", h1:"🐻", result:"LOSS", pnl:-7.2  },
  { id:4, date:"Mar 03, 2026", time:"9:33 AM",  instrument:"XAUUSD", direction:"LONG",  entry:2295.00, exit:2318.40, phase:"Continuation", d:"🐂", h4:"🐂", h1:"🐂", result:"WIN",  pnl:+31.4 },
  { id:5, date:"Feb 28, 2026", time:"11:15 AM", instrument:"BTCUSD", direction:"SHORT", entry:91200,   exit:89800,   phase:"Retest",       d:"🐻", h4:"🐻", h1:"🐻", result:"WIN",  pnl:+24.1 },
  { id:6, date:"Feb 25, 2026", time:"9:05 AM",  instrument:"USOIL",  direction:"SHORT", entry:74.20,   exit:73.10,   phase:"Continuation", d:"🐻", h4:"🐻", h1:"🐻", result:"WIN",  pnl:+19.8 },
  { id:7, date:"Feb 21, 2026", time:"10:44 AM", instrument:"XAUUSD", direction:"LONG",  entry:2271.80, exit:2268.50, phase:"Break",        d:"🐂", h4:"🐻", h1:"🐂", result:"LOSS", pnl:-8.1  },
  { id:8, date:"Feb 19, 2026", time:"9:21 AM",  instrument:"BTCUSD", direction:"LONG",  entry:95400,   exit:97200,   phase:"Continuation", d:"🐂", h4:"🐂", h1:"🐂", result:"WIN",  pnl:+27.6 },
];
const totalPnl   = SAMPLE_TRADES.reduce((s,t)=>s+t.pnl,0);
const wins       = SAMPLE_TRADES.filter(t=>t.result==="WIN").length;
const winRate    = Math.round((wins/SAMPLE_TRADES.length)*100);
const monthlyPnl = SAMPLE_TRADES.filter(t=>t.date.includes("Mar")).reduce((s,t)=>s+t.pnl,0);
const phaseColors= {Break:"#00e5ff",Retest:"#ff6bff",Continuation:"#7fff6b"};

// ─── Anime Data ────────────────────────────────────────────────────────────
const ANIME_LIST = []; // removed — coach layer eliminated

// ─── AI Prompts ────────────────────────────────────────────────────────────
function getPlanPrompt(profile, instrument="this instrument"){
  return `You are a professional BRC / Smart Money Concepts trade analyst. Output only structured data. No personality. No filler. Pure analysis.

EXECUTION WINDOW: NY Session 8:30 AM–12:00 PM CT. Best entries: 9:00 AM or 9:30 AM 30M candle closes.
Pre-market = scouting only. NY open = execution window.
CRITICAL RULE: "Pre-market movement is information — not permission." A move that ran before NY open is NOT a tradeable setup. Do not grade alignment on a move that has already happened without a proper retest forming.

BRC METHODOLOGY — NON-NEGOTIABLE RULES:
- Daily is the GENERAL. NEVER trade against it for A+ setups.
- 4H confirms direction. D+4H agree = bias locked.
- 1H is execution TF. ALL 3 (D+4H+1H) must agree for A+ grade.
- 30M is the trigger. A 30M candle CLOSE above/below a level triggers entry — wicks don't count.
- 15M is entry refinement and rejection confirmation.
- BRC sequence: BREAK → RETEST → CONTINUATION (all 3 required)
  Step 1 — BREAK: 30M closes above/below key level. Note it. Do NOT enter yet.
  Step 2 — RETEST: Price pulls back to the level. Watch it.
  Step 3 — CONFIRMATION: 30M closes again in the break direction after retest. THIS is entry.
- Tier 1 = first 30M close confirmation. Tier 2 = second 30M candle holds. Enter limit after Tier 2.
- WITH-TREND ONLY for A+ plans. Counter-trend = reduced size only.
- Stop Tight = better R:R. Stop Wide = safer for volatile markets. Both must give at least 1R to TP1.
- TP1 >= 1R minimum. TP2 = next liquidity target. Runner = full structure target.
- MANTRA: "The 15-minute warning gets me ready. The 30-minute close puts me in the trade. No 30-minute close, no trade."

UNDERSTANDING BRC SEQUENCES — READ EVERY TIME:

STEP 1 — THE DAILY IS THE GENERAL. CHECK IT FIRST. ALWAYS.
Daily BEARISH = you look for SHORT setups only.
Daily BULLISH = you look for LONG setups only.
This never changes. Everything else follows from this.

STEP 2 — IDENTIFY THE BRC SEQUENCE CORRECTLY:
A large move in the Daily's direction IS NOT an expired setup.
It is the BREAK — Step 1 of the BRC sequence. 

After a large break move, you look for:
- A bounce or consolidation = the RETEST (Step 2)
- Even a small bounce of $100–$500 qualifies as a retest
- A 30M candle close in the break direction after the retest = CONTINUATION (Step 3) = YOUR ENTRY

REAL EXAMPLE — BTCUSD MARCH 18, 2026 (A+ TRADE):
Daily: BEARISH from $97,938. General says SHORT.
$76,012 = liquidity grab / failed breakout. Institutions rejected price hard.
Flush from $76,012 → $71,723 = the BREAK ✅
Dead cat bounce $71,723 → $71,878 = the RETEST ✅ (only $155 bounce — still valid)
9:30 AM 30M close at $71,655 (new low below $71,723) = TIER 1 CONTINUATION ✅
10:00 AM 30M close at $71,400 = TIER 2 CONTINUATION ✅
Sell limit placed at $71,723–$71,900 retest zone = CORRECT ENTRY
This was an A+ setup. NOT an expired setup. NOT a PASS.

STEP 3 — LIQUIDITY GRABS ARE THE SETUP, NOT THE PROBLEM:
When price spikes above a key level then violently rejects = liquidity grab.
The spike itself IS the Break in reverse — institutions grabbed liquidity then reversed.
The correction after the spike = the Retest forming.
The 30M close in the reversal direction = your Continuation entry.
NEVER call PASS on a liquidity grab reversal setup.

STEP 4 — THE ONLY TIME TO CALL EXPIRED SETUP:
ONLY call PASS for expired setup when ALL of these are true:
1. The Daily, 4H, AND 1H are all pointing the same direction
2. AND price ran a huge distance in that direction
3. AND there was ZERO retest — not even a small bounce
4. AND the entire move happened outside the NY session window (e.g. Asian session news crash)
Even then, if a retest is currently forming during NY session — do NOT call PASS. Grade the setup.

STEP 5 — SMALL BOUNCES ARE VALID RETESTS:
A retest does NOT need to be a full 50% pullback.
A bounce of even $100–$300 after a $4,000 move qualifies as a retest.
Price pulling back to the break level and holding qualifies as a retest.
Do not require a large retest to validate the BRC sequence.

PHASE AWARENESS — THIS IS STEP ONE. DO IT BEFORE ANYTHING ELSE.

FIRST: Read the most recent candle on the 30M chart. Write down the current price. This is your anchor.

SECOND: Identify the most recent significant structural level — the last major break level, swing high rejection, or key support/resistance.

THIRD: Compare current price to that level. This tells you the phase.

PHASE DETECTION RULES:
- Current price BELOW the break level = Break already happened → you are in RETEST or CONTINUATION phase
- Current price ABOVE the break level = Break already happened to the upside → same logic reversed
- Current price AT or near the break level = Break may be forming → watch for 30M close

DO NOT anchor to levels from previous sessions. Read the current chart fresh every time.
The break level is always relative to WHERE PRICE IS RIGHT NOW — not where it was yesterday.

REAL EXAMPLE (March 20 BTCUSD):
Chart shows: High 76,012 → Low 68,770 → Current price 70,604 (bouncing)
The break DOWN already ran from 76,012 to 68,770. That is the Break.
Current bounce 68,770 → 70,604 = the Retest forming.
DO NOT say "wait for break below 71,723" — that level was broken 2 days ago.
Correct read: RETEST phase. Watch for 30M close back below 70,000–70,200 for continuation short.

REAL EXAMPLE (March 18 BTCUSD):
Chart shows: High 76,012 → flush to 71,723 → tiny bounce to 71,878 → current 71,878
Break: 76,012 → 71,723 ✅
Retest: bounce to 71,878 (only $155 — still valid) ✅  
Trigger: 30M close below 71,723 = Tier 1 confirmation ✅
Correct read: CONTINUATION phase. Grade A+.

NEVER describe a break as "pending" or "waiting" if current price has already passed that level.
The icc_phase field must reflect the ACTUAL current phase based on today's chart — not historical levels.
The break_trigger_level must be a CURRENT, ACTIONABLE level — not a level price blew through days ago.

CRITICAL — ALL FIELDS MUST BE CONSISTENT:
The break_trigger_level, the execution_plan entry zone, and the plain_english trade_plan MUST all reference the SAME price level.
They cannot contradict each other. If plain_english says "wait for close below 70,200" then break_trigger_level must also be 70,200.
If price is at 70,600 and the session low was 68,770:
→ break_trigger_level = 70,200 (current actionable trigger)
→ NOT 68,770 (that level is history — price is $1,800 above it)
→ NOT 76,012 (that was the original break — it ran days ago)
The trigger level is always the NEAREST price that, if broken by a 30M close, confirms the next move.

CHART VALIDATION — CRITICAL FIRST:
Images submitted in order: [1]=Daily, [2]=4H, [3]=1H, [4]=30M, [5]=15M. Selected instrument: ${instrument}.

STEP 1 — INSTRUMENT CHECK: Before checking timeframes, inspect all 5 charts for the instrument/ticker symbol visible on the chart (pair name, symbol, title bar, watermark, or price scale).

ACCEPTED ALIASES — these ticker labels are valid for each instrument:
- XAUUSD: XAUUSD, GOLD, GC, MGC, MGC1!, MGCM2026, MGCM6, MGCH2026, MGCU2026, MGCZ2026, XAU, GOLD/USD
- BTCUSD: BTCUSD, BTC, BTCUSDT, BITCOIN, BTC/USD, BTCPERP
- NAS100: NAS100, NASDAQ, NQ, NQ1!, NQM2026, NQM6, NQH2026, NQU2026, NQZ2026, US100, NDX, USTEC, USTECH
- US30: US30, DOW, YM, YM1!, YMM2026, YMM6, YMH2026, YMU2026, YMZ2026, DJIA, DJ30, WALL ST
- USOIL: USOIL, WTI, CL, CL1!, CLM2026, CLK2026, CLK6, CLM6, CRUDE, OIL
- US500: US500, SPX, ES, ES1!, ESM2026, ESM6, ESH2026, ESU2026, ESZ2026, SP500, SPX500, S&P500

- If the ticker on the charts matches ANY of the accepted aliases for ${instrument}, set instrument_valid=true.
- If the charts show a ticker that belongs to a DIFFERENT instrument entirely, set instrument_valid=false and instrument_detected= what you actually see.
- If you cannot clearly identify the instrument on any chart, set instrument_valid=false with instrument_detected="unreadable".
INSTRUMENT MISMATCH = hard block. Do NOT proceed with analysis if instrument_valid=false.

STEP 2 — TIMEFRAME CHECK: Inspect EVERY image for timeframe indicators (chart title, interval selector, candle size, time axis). This check is MANDATORY and NON-NEGOTIABLE.
- Slot 1 MUST be a Daily chart. If it shows 4H, 1H, 30M, 15M, or any other timeframe → charts_valid=false, stop immediately.
- Slot 2 MUST be a 4H chart. Wrong timeframe → charts_valid=false, stop.
- Slot 3 MUST be a 1H chart. Wrong timeframe → charts_valid=false, stop.
- Slot 4 MUST be a 30M chart. Wrong timeframe → charts_valid=false, stop.
- Slot 5 MUST be a 15M chart. Wrong timeframe → charts_valid=false, stop.
- If you CANNOT clearly read the timeframe from the image → mark that slot invalid → charts_valid=false, stop.
- A false pass on a wrong chart is worse than a false fail. When in doubt, reject.
- NEVER generate a plan if any slot has the wrong chart. No exceptions.
For each slot, set detected= the timeframe you actually see, and signals= array of 2-3 short visual cues (5 words max each). If valid, signals can be empty array.
If all valid → charts_valid=true, proceed.

OUTPUT STRUCTURE:
1. primary_decision — the verdict at a glance
2. execution_plan — exact levels to act on
3. invalidation — one hard rule that kills this setup
4. why — the reasoning behind the verdict

For grades B, C, or SKIP (PASS): always populate trigger_conditions. Use exact BRC sequence language:
- long_trigger: "1. 30M close above [EXACT LEVEL]. 2. Retest zone [EXACT ZONE]. 3. Second 30M close confirms. 4. Enter on retest zone [EXACT ZONE]."
- short_trigger: same pattern for short side with exact levels.
- risk_state: concise bullet lines separated by " / "

WHY FIELDS — complete polished sentences, operator-briefing tone, 1–2 sentences max per field.
CRITICAL: Always reference the OPERATIONAL range (match the levels in critical_levels) — not macro extremes.
- why.structure: range-bound description using operational levels
- why.htf_alignment: which TFs agree, which don't
- why.liquidity: where liquidity pools sit relative to current price
- why.session_timing: current session + preferred execution window
- why.momentum: 30M directional state

PLAIN ENGLISH BREAKDOWN — REQUIRED ON EVERY RESPONSE:
You must always include a "plain_english" object in your JSON. Write this like you are explaining the market to a smart 16-year-old who understands trading basics but not jargon. Use simple words. Be direct. No filler.

plain_english fields:
- structure: "What is the market doing right now?" — describe price action in simple terms. Example: "Gold has been making lower highs and lower lows all day. It broke below 4,650 and hasn't come back up. The trend is clearly down."
- brc_phase: "Where are we in the Break-Retest-Continuation sequence?" — Example: "We're still waiting for the Break. Price needs to close a 30-minute candle below 4,602 before anything happens."
- key_levels: "What prices matter most right now?" — list 2-3 levels with one sentence each explaining why. Example: "4,650 — this was support, now it's resistance. 4,500 — big round number, first place price might bounce."
- trade_plan: "What's the actual plan?" — write it like giving instructions to a friend. Example: "We're looking short. Wait for a 30-minute candle to close below 4,602. Don't enter on the wick — wait for the full candle close. If it closes below, set your limit order at the retest zone around 4,620."
- verdict: "Should we trade this or not — and exactly why?" — one clear paragraph. Example: "This is a PASS. The big move already happened before New York opened. You missed the entry. Chasing a short after a $460 drop is gambling, not trading. Sit on your hands and wait for a fresh setup tomorrow."
- psychological_rule: Always end with exactly this: "Once entered, hands off. Trust the system. Pre-market movement is information — not permission."

FIELD SEPARATION — NON-NEGOTIABLE:
Market structure fields contain PRICES ONLY — never session text, never rules, never conditions:
- break_trigger_level: single price or zone e.g. "5,035" or "5,030–5,040" — NOTHING ELSE
- retest_zone: single price or zone e.g. "5,025–5,030" — NOTHING ELSE
- entry, stop_tight, stop_wide, tp1, tp2, runner: price or zone ONLY — no words
If you feel the urge to write "after NY session open" or "on retest confirmation" inside a price field — STOP. Put that text in session_restriction or retest_confirmation_rule instead.

session_restriction: text only — describes WHEN to trade e.g. "NY session 9:00–10:30 AM CT only"
retest_confirmation_rule: text only — describes HOW to confirm e.g. "30M candle must close back below the broken level"
direction: "LONG" | "SHORT" | "NEUTRAL" — single word only

TRIGGER CONDITIONS — 4-step BRC format, exact prices required, each step under 8 words.
ALTERNATE SCENARIO condition: one sentence. Format: "Activates if 30M close [above/below] [exact level] in NY session."

CRITICAL LEVELS — all four must stay within the SAME operational framework (no macro extremes):
- long_trigger = activation level for bullish setup (PRICE ONLY)
- short_trigger = activation level for bearish setup (PRICE ONLY)
- major_support = nearest structural support (NOT all-time low) (PRICE ONLY)
- major_resistance = nearest structural resistance (NOT all-time high) (PRICE ONLY)
- Zone notation allowed: "68,500–69,000" when multiple nearby rejections cluster within 500 points.

CRITICAL RULE — every operational sentence must include exact price or zone.

Respond ONLY with a JSON object, no markdown, no backticks:
{"charts_valid":true,"instrument_valid":true,"instrument_detected":"string","chart_validation":{"daily":{"expected":"Daily","detected":"string","signals":[],"valid":true},"h4":{"expected":"4H","detected":"string","signals":[],"valid":true},"h1":{"expected":"1H","detected":"string","signals":[],"valid":true},"m30":{"expected":"30M","detected":"string","signals":[],"valid":true},"m15":{"expected":"15M","detected":"string","signals":[],"valid":true}},"primary_decision":{"bias":"SHORT|LONG|NEUTRAL","status":"VALID|WAITING|INVALIDATED","confidence":"HIGH|MEDIUM|LOW","confidence_reason":"string","grade":"A+|A|B|C|PASS"},"execution_plan":{"direction":"LONG|SHORT|NEUTRAL","break_trigger_level":"price only","retest_zone":"price or zone only","retest_confirmation_rule":"text rule only — no prices","session_restriction":"text only — when to trade","entry":"price or zone only","confirmation_trigger":"price only","stop_tight":"price only","stop_wide":"price only","tp1":"price only","tp2":"price only","runner":"price only","risk_reward":"string","size":"FULL SIZE|HALF SIZE|QUARTER SIZE"},"invalidation":"string","bias_levels":{"trigger_levels":"string","invalidation_levels":"string","acceleration_levels":"string"},"why":{"structure":"string","liquidity":"string","htf_alignment":"string","session_timing":"string","momentum":"string"},"icc_phase":"BREAK|RETEST|CONTINUATION|PRE-SETUP","alignment":"FULL ALIGN|COOKING|MISALIGNED|COUNTER-TREND ONLY","timeframe_reads":{"daily":{"bias":"BULLISH|BEARISH|NEUTRAL","structure":"string","key_level":"string"},"h4":{"bias":"BULLISH|BEARISH|NEUTRAL","structure":"string","key_level":"string"},"h1":{"bias":"BULLISH|BEARISH|NEUTRAL","structure":"string","key_level":"string"},"m30":{"bias":"BULLISH|BEARISH|NEUTRAL","structure":"string","key_level":"string"},"m15":{"bias":"BULLISH|BEARISH|NEUTRAL","structure":"string","key_level":"string"}},"secondary_plan":{"condition":"string","direction":"LONG|SHORT|NONE","entry":"price only","stop":"price only","tp1":"price only","tp2":"price only","runner":"price only","size":"FULL SIZE|HALF SIZE|QUARTER SIZE","warning":"string"},"critical_levels":{"long_trigger":"price only","short_trigger":"price only","major_support":"price only","major_resistance":"price only"},"trigger_conditions":{"long_trigger":"string","short_trigger":"string","risk_state":"string"},"plain_english":{"structure":"string","brc_phase":"string","key_levels":"string","trade_plan":"string","verdict":"string","psychological_rule":"Once entered, hands off. Trust the system. Pre-market movement is information — not permission."}}`;
}


function getPsychPrompt(anime, mode, answers) {
  const voice = anime
    ? `You are a trading psychology coach who speaks through the lens of ${anime.name}. Your mentor persona is ${anime.character}. Use ${anime.name} metaphors naturally — not forced, not every sentence, just where they land hard. Be direct, honest, and sharp. No fluff. Talk like a real mentor, not a self-help book.`
    : `You are a sharp, direct trading psychology coach. No fluff. Talk like a real mentor.`;

  if (mode === "pre") {
    return `${voice}

The trader answered these pre-session questions:
- Sleep quality: ${answers.sleep}
- Emotional state today: ${answers.emotion}  
- Any distractions or big events today: ${answers.distraction}
- Broke any rules in last session: ${answers.ruleBreak}

Give them:
1. GO or NO-GO verdict (bold, clear)
2. 2-3 sentence honest assessment — reference their specific answers
3. If GO: one mental focus point for the session
4. If NO-GO: what they should do instead of trading today

Keep it under 160 words. Respond in plain text, no JSON, no markdown headers.`;
  } else {
    return `${voice}

The trader just described their session:
"${answers.session}"

Analyze this like a mentor would after watching their student trade. Give them:
1. What they did right (be specific if you can tell)
2. What rule(s) they may have broken — be honest and direct
3. The lesson — tied to BRC methodology
4. A closing line that keeps them motivated but grounded

Keep it under 200 words. Respond in plain text, no JSON, no markdown headers.`;
  }
}

// v2.1 — single upload module, no duplicate states
// ─── TIER CONFIG ────────────────────────────────────────────────────────────
// DEV_MODE is NEVER a hardcoded constant — isDevMode() is called at the point
// of use so each user's own session determines their access. The owner being
// logged in on their device has zero effect on any other user's session.
const OWNER_EMAIL = "bailey.charles024@gmail.com";
function isDevMode() {
  try {
    const s = JSON.parse(localStorage.getItem("omniusd_session") || "{}");
    const email = s.user?.email || s.email || "";
    return email === OWNER_EMAIL;
  } catch { return false; }
}

const TIER_CONFIG = {
  starter: { label:"Starter", price:"$29/mo", priceId:"price_1TEyC2EOq82Vh8foSZIKCsG9", instruments:["XAUUSD","BTCUSD"],         dailyCap:3,  color:"#ffd166" },
  pro:     { label:"Pro",     price:"$39/mo", priceId:"price_1TEyEmEOq82Vh8foLEEFkBbV", instruments:["XAUUSD","BTCUSD","NAS100","US30"], dailyCap:5,  color:"#00e5ff" },
  elite:   { label:"Elite",   price:"$59/mo", priceId:"price_1TEyHFEOq82Vh8fokJEvZNFn", instruments:["XAUUSD","BTCUSD","NAS100","US30","USOIL","US500"], dailyCap:10, color:"#ff6bff" },
};

const CURRENT_TIER = isDevMode() ? "elite" : "starter";

function getTierAccess(tier=CURRENT_TIER){
  return isDevMode() ? TIER_CONFIG.elite : (TIER_CONFIG[tier]||TIER_CONFIG.starter);
}

if(typeof document!=="undefined"){
  const s=document.createElement("style");
  s.textContent=`
    html,body{margin:0;padding:0;overflow-x:hidden;}
    @keyframes icc-spin  {to{transform:rotate(360deg);}}
    @keyframes icc-pulse {0%,100%{opacity:1}50%{opacity:0.35}}
    @keyframes icc-slide {from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
    @keyframes icc-fade  {from{opacity:0}to{opacity:1}}
    @keyframes icc-pop   {0%{transform:scale(0.94);opacity:0}60%{transform:scale(1.02)}100%{transform:scale(1);opacity:1}}
    @keyframes icc-glow  {0%,100%{box-shadow:0 0 20px rgba(255,107,255,0.12)}50%{box-shadow:0 0 44px rgba(255,107,255,0.38)}}
    *{box-sizing:border-box;}
    ::-webkit-scrollbar{width:4px;height:4px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:rgba(255,107,255,0.25);border-radius:2px;}
    .ob-card:hover{filter:brightness(1.08);transform:scale(1.01)!important;}
    .ob-card:active{transform:scale(0.98)!important;}
    .ob-card-sel{transform:scale(1.03)!important;}
    .ob-btn-primary:hover{filter:brightness(1.12);transform:translateY(-1px);}
    .ob-btn-primary:active{transform:translateY(1px);}
    .ob-btn-back:hover{background:rgba(255,255,255,0.08)!important;}

    textarea:focus,input:focus{outline:none;}
    :root{
      --t-bg:#1e1a35;
      --t-navBg:rgba(28,22,50,0.97);
      --t-text:#fdf9ff;
      --t-subtext:#ede5ff;
      --t-border:rgba(255,107,255,0.16);
      --t-gridLine:rgba(255,107,255,0.04);
      --t-c1:rgba(255,255,255,0.07);
      --t-c2:rgba(255,255,255,0.11);
      --t-c3:rgba(255,255,255,0.15);
      --t-c4:rgba(255,255,255,0.18);
      --t-c5:rgba(255,255,255,0.10);
      --t-c6:rgba(255,255,255,0.13);
      --t-c7:rgba(255,255,255,0.15);
      --t-cardBg:rgba(255,255,255,0.10);
      --t-cardBorder:rgba(255,255,255,0.13);
      --t-inputBg:rgba(255,255,255,0.12);
      --t-inputBorder:rgba(255,107,255,0.22);
      --t-muted:#fdf9ff;
      --t-muted2:#ede5ff;
      --t-muted3:#d8ccf4;
      --t-muted4:#c4b4e0;
      --t-muted5:#a080c8;
      --t-tableBg:#221d3a;
    }
  `;
  document.head.appendChild(s);
}

// ─── Theme Injector ─────────────────────────────────────────────────────────
function ThemeInjector({T}){
  useEffect(()=>{
    let el=document.getElementById("icc-theme-style");
    if(!el){el=document.createElement("style");el.id="icc-theme-style";document.head.appendChild(el);}
    el.textContent=`
      :root{
        --t-bg:${T.bg};
        --t-navBg:${T.navBg};
        --t-text:${T.text};
        --t-subtext:${T.subtext};
        --t-border:${T.border};
        --t-gridLine:${T.gridLine};
        --t-c1:${T.c1};
        --t-c2:${T.c2};
        --t-c3:${T.c3};
        --t-c4:${T.c4};
        --t-c5:${T.c5};
        --t-c6:${T.c6};
        --t-c7:${T.c7};
        --t-cardBg:${T.cardBg};
        --t-cardBorder:${T.cardBorder};
        --t-inputBg:${T.inputBg};
        --t-inputBorder:${T.inputBorder};
        --t-muted:${T.muted};
        --t-muted2:${T.muted2};
        --t-muted3:${T.muted3};
        --t-muted4:${T.muted4};
        --t-muted5:${T.muted5};
        --t-tableBg:${T.tableBg};
      }
      ::-webkit-scrollbar-thumb{background:${T.scrollThumb}!important;}
    `;
  },[T]);
  return null;
}


const TF_SLOTS=[
  {key:"daily",label:"Daily",   short:"D",  color:"#ff6bff",desc:"Sets bias"},
  {key:"h4",   label:"4-Hour",  short:"4H", color:"#00e5ff",desc:"Confirms direction"},
  {key:"h1",   label:"1-Hour",  short:"1H", color:"#7fff6b",desc:"Execution timeframe"},
  {key:"m30",  label:"30-Min",  short:"30M",color:"#ffd166",desc:"Trigger timeframe"},
  {key:"m15",  label:"15-Min",  short:"15M",color:"#ff9a3c",desc:"Entry refinement"},
];

// ═══════════════════════════════════════════════════════════════════════════
// OMNIUSD LOGO MARK
// ═══════════════════════════════════════════════════════════════════════════
function OmniLogo({ size = 38 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 380 380" xmlns="http://www.w3.org/2000/svg" style={{display:"block",flexShrink:0}}>
      <defs>
        <linearGradient id="omni-cg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#cc44ff"/>
          <stop offset="100%" stopColor="#00ccff"/>
        </linearGradient>
      </defs>
      <g transform="translate(190, 190)">
        <circle cx="0" cy="0" r="178" fill="none" stroke="#cc44ff" strokeWidth="10"
          strokeDasharray="807.8 310.6" strokeDashoffset="-994.0" strokeLinecap="round"/>
        <circle cx="0" cy="0" r="146" fill="none" stroke="#8844ee" strokeWidth="7"
          strokeDasharray="726.4 191.2" strokeDashoffset="-771.4" strokeLinecap="round"/>
        <circle cx="0" cy="0" r="114" fill="none" stroke="#00ccff" strokeWidth="4.5"
          strokeDasharray="616.5 99.5" strokeDashoffset="-587.0" strokeLinecap="round"/>
        <circle cx="-48.2" cy="-103.3" r="5.5" fill="#00ccff" opacity="0.88"/>
        <circle cx="48.2" cy="-103.3" r="5.5" fill="#00ccff" opacity="0.88"/>
        <polygon points="0,-32 24,0 0,32 -24,0" fill="url(#omni-cg)" opacity="0.93"/>
        <polygon points="0,-32 24,0 0,32 -24,0" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
        <polyline points="-14,-46 0,-63 14,-46" fill="none" stroke="#cc44ff" strokeWidth="2.8"
          strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
        <circle cx="0" cy="0" r="5" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="0.8"/>
        <circle cx="0" cy="0" r="2.5" fill="rgba(255,255,255,0.65)"/>
      </g>
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY
// ═══════════════════════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("OmniUSD crash:", error, info);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight:"100vh", background:"#1e1a35", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"32px 24px", fontFamily:"'Space Mono',monospace", textAlign:"center" }}>
        <div style={{ fontSize:48, marginBottom:20 }}>⚠️</div>
        <div style={{ fontSize:14, fontWeight:900, letterSpacing:"0.2em", color:"rgba(255,107,107,0.8)", marginBottom:12 }}>SOMETHING WENT WRONG</div>
        <div style={{ fontSize:14, color:"rgba(255,255,255,0.8)", lineHeight:1.8, marginBottom:28, maxWidth:400 }}>
          OmniUSD hit an unexpected error. Your session plan and history are safe.
        </div>
        <button
          onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
          style={{ padding:"12px 28px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#ff6bff,#7b2fff)", color:"#fff", fontSize:14, fontWeight:700, letterSpacing:"0.1em", cursor:"pointer", fontFamily:"inherit" }}>
          RELOAD APP →
        </button>
        <div style={{ marginTop:16, fontSize:13, color:"rgba(255,255,255,0.80)" }}>
          If this keeps happening, email support@omniusd.pro
        </div>
      </div>
    );
  }
}

function OmniUSDApp(){
  const [ready,setReady]=useState(false);
  const [authUser,setAuthUser]=useState(null);
  const [profile,setProfile]=useState(null);
  const [view,setView]=useState("landing");      // "landing"|"auth"|"app"|"privacy"|"terms"|"reset_password"
  const [page,setPage]=useState("home");
  const [planResult,setPlanResult]=useState(null);
  const [resetToken,setResetToken]=useState(null);
  const [journal,setJournal]=useState(()=>{
    try{
      const _s=JSON.parse(localStorage.getItem("omniusd_session")||"{}");
      const _uid=_s.user?.id||_s.user_id||"anon";
      return JSON.parse(localStorage.getItem(`omniusd_journal_${_uid}`)||"[]");
    }catch{return[];}
  });
  const T=DARK;

  // ── Inject SVG favicon ────────────────────────────────────────────────────
  useEffect(()=>{
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 380">
      <defs>
        <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#cc44ff"/>
          <stop offset="100%" stop-color="#00ccff"/>
        </linearGradient>
      </defs>
      <rect width="380" height="380" rx="76" fill="#1e1a35"/>
      <g transform="translate(190,190)">
        <circle cx="0" cy="0" r="178" fill="none" stroke="#cc44ff" stroke-width="10" stroke-dasharray="807.8 310.6" stroke-dashoffset="-994.0" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="146" fill="none" stroke="#8844ee" stroke-width="7" stroke-dasharray="726.4 191.2" stroke-dashoffset="-771.4" stroke-linecap="round"/>
        <circle cx="0" cy="0" r="114" fill="none" stroke="#00ccff" stroke-width="4.5" stroke-dasharray="616.5 99.5" stroke-dashoffset="-587.0" stroke-linecap="round"/>
        <circle cx="-48.2" cy="-103.3" r="5.5" fill="#00ccff" opacity="0.88"/>
        <circle cx="48.2" cy="-103.3" r="5.5" fill="#00ccff" opacity="0.88"/>
        <polygon points="0,-32 24,0 0,32 -24,0" fill="url(#fg)" opacity="0.93"/>
        <polyline points="-14,-46 0,-63 14,-46" fill="none" stroke="#cc44ff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
        <circle cx="0" cy="0" r="2.5" fill="rgba(255,255,255,0.65)"/>
      </g>
    </svg>`;
    const encoded = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = encoded;
    document.title = "OmniUSD — BRC Execution System";
  },[]);

  useEffect(()=>{
    async function init(){
      try{
        // ── Check for Supabase password recovery link ──────────────────────
        // Supabase redirects to: omniusd.pro/#access_token=...&type=recovery
        const hash = window.location.hash;
        if (hash && hash.includes("type=recovery")) {
          const hashParams = new URLSearchParams(hash.replace("#",""));
          const accessToken = hashParams.get("access_token");
          if (accessToken) {
            window.history.replaceState({}, document.title, "/");
            setResetToken(accessToken);
            setView("reset_password");
            setReady(true);
            return;
          }
        }

        // Check for Stripe payment return
        const params=new URLSearchParams(window.location.search);
        const payment=params.get("payment");
        const tierFromStripe=params.get("tier");
        if(payment==="success"&&tierFromStripe){
          localStorage.setItem("omniusd_paid_tier", tierFromStripe);
          window.history.replaceState({},document.title,"/");
          setView("payment_success");
          setReady(true);
          return;
        }
        if(payment==="cancel"){
          window.history.replaceState({},document.title,"/");
        }

        const raw=localStorage.getItem("omniusd_session");
        if(raw){
          const session=JSON.parse(raw);
          if(session?.access_token){
            const userId=session.user?.id||session.user_id;
            if(userId){
              // Verify token is still valid before proceeding
              const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
                headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${session.access_token}` }
              });
              if(verifyRes.ok){
                setAuthUser(session.user||{id:userId,email:session.email||""});
                await loadProfile(userId, session.access_token);
                setView("app");
              } else {
                // Token expired — clear session and show landing
                localStorage.removeItem("omniusd_session");
              }
            }
          }
        }
      }catch(e){console.error("Init error",e);}
      setReady(true);
    }
    init();
  },[]);

  async function loadProfile(userId, token){
    const tok=token||JSON.parse(localStorage.getItem("omniusd_session")||"{}")?.access_token||SUPABASE_KEY;

    // ── DEV BYPASS — check email from session FIRST, before any DB call ──
    const _session = JSON.parse(localStorage.getItem("omniusd_session")||"{}");
    const _sessionEmail = _session?.user?.email || _session?.email || "";
    const _preferredName = _session?.user?.user_metadata?.preferred_name || "";
    if (_sessionEmail === "bailey.charles024@gmail.com") {
      setUserProfileTZ("America/Chicago");
      setProfile({
        mode:"standard", emoji:"◈", color:"#00e5ff", label:"Standard",
        tier:"elite", tierLabel:"Elite", tierColor:"#ff6bff",
        defaultInstrument:"XAUUSD", session:null,
        tz:{ iana:"America/Chicago", city:"Chicago", label:"CT / UTC-6", region:"North America" },
        isPaid:true, _devBypass:true,
        preferredName: _preferredName || "Chalie",
        email: _sessionEmail,
      });
      return;
    }
    // ── END BYPASS ────────────────────────────────────────────────────────
    try{
      const res=await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=*`,
        {headers:{
          "apikey":SUPABASE_KEY,
          "Authorization":`Bearer ${tok}`,
          "Accept":"application/vnd.pgrst.object+json"
        }}
      );
      if(res.ok){
        const data=await res.json();

        // ── DEV BYPASS — owner account gets Elite access always ──────────
        const _session = JSON.parse(localStorage.getItem("omniusd_session")||"{}");
        const _email = _session?.user?.email || data?.email || "";
        const _preferredName = _session?.user?.user_metadata?.preferred_name || data?.preferred_name || "";
        if (_email === "bailey.charles024@gmail.com") {
          const tzObj = data?.tz ? JSON.parse(data.tz) : null;
          if (tzObj?.iana) setUserProfileTZ(tzObj.iana);
          setProfile({
            mode:"standard", emoji:"◈", color:"#00e5ff", label:"Standard",
            tier:"elite", tierLabel:"Elite", tierColor:"#ff6bff",
            defaultInstrument:"XAUUSD", session:data?.session||null,
            tz: tzObj, isPaid:true, _devBypass:true,
            preferredName: _preferredName || "Chalie",
            email: _email,
          });
          return;
        }
        // ── END BYPASS ───────────────────────────────────────────────────

        if(data&&data.id&&data.is_paid){
          const tzObj = data.tz ? JSON.parse(data.tz) : null;
          if (tzObj?.iana) setUserProfileTZ(tzObj.iana);
          const _sess2 = JSON.parse(localStorage.getItem("omniusd_session")||"{}");
          const _name = _sess2?.user?.user_metadata?.preferred_name || data?.preferred_name || "";
          setProfile({
            mode:"standard",emoji:"◈",color:"#00e5ff",label:"Standard",
            tier:data.tier||"starter",
            tierLabel:data.tier_label||"Starter",
            tierColor:data.tier_color||"#ffd166",
            defaultInstrument:data.default_instrument||"XAUUSD",
            session:data.session||null,
            tz: tzObj,
            isPaid:true,
            preferredName: _name,
            email: _sess2?.user?.email || data?.email || "",
          });
        }
        // No row, or is_paid=false = needs onboarding/payment — profile stays null
      }
    }catch(e){console.error("loadProfile error",e);}
  }

  async function selectProfile(p){
    try{
      if(authUser){
        const token=JSON.parse(localStorage.getItem("omniusd_session")||"{}")?.access_token||SUPABASE_KEY;
        const paidTier=localStorage.getItem("omniusd_paid_tier")||p.tier||"starter";
        const TIER_COLORS={starter:"#ffd166",pro:"#00e5ff",elite:"#ff6bff"};
        const TIER_LABELS={starter:"Starter",pro:"Pro",elite:"Elite"};
        await fetch(`${SUPABASE_URL}/rest/v1/profiles`,{
          method:"POST",
          headers:{
            "apikey":SUPABASE_KEY,
            "Authorization":`Bearer ${token}`,
            "Content-Type":"application/json",
            "Prefer":"resolution=merge-duplicates",
          },
          body:JSON.stringify({
            id:authUser.id,
            email:authUser.email||"",
            tier:paidTier,
            tier_label:TIER_LABELS[paidTier]||"Starter",
            tier_color:TIER_COLORS[paidTier]||"#ffd166",
            default_instrument:p.defaultInstrument||"XAUUSD",
            session:p.session||null,
            tz:p.tz?JSON.stringify(p.tz):null,
            is_paid:true,
            updated_at:new Date().toISOString(),
          }),
        });
        // Merge paid tier into profile object
        p = { ...p, tier: paidTier, tierLabel: TIER_LABELS[paidTier]||"Starter", tierColor: TIER_COLORS[paidTier]||"#ffd166" };
      }
      try{await window.storage.set("omniusd_profile",JSON.stringify(p));}catch(e){}
    }catch(e){console.error("Profile save failed",e);}
    // Set global TZ so all time displays immediately use the user's selected timezone
    if (p.tz?.iana) setUserProfileTZ(p.tz.iana);
    setProfile(p);
  }

  async function resetProfile(){
    try{
      if(authUser){
        await supabase.from("profiles").delete().eq("id",authUser.id);
      }
      await window.storage.delete("omniusd_profile");
      await window.storage.delete("omniusd_prefs");
    }catch(e){}
    setPlanResult(null);
    setPage("home");
    setProfile(null);
  }

  async function signOut(){
    try {
      const _s = JSON.parse(localStorage.getItem("omniusd_session") || "{}");
      const _uid = _s.user?.id || _s.user_id || "anon";
      const _tok = _s.access_token || SUPABASE_KEY;
      // Wipe active sessions from localStorage
      localStorage.removeItem(`omniusd_sessions_${_uid}`);
      // Wipe active sessions from Supabase cloud — so next login starts fresh
      fetch(`${SUPABASE_URL}/rest/v1/user_history?user_id=eq.${_uid}&type=eq.active_sessions`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${_tok}` },
      }).catch(()=>{});
    } catch(e) {}
    localStorage.removeItem("omniusd_paid_tier");
    localStorage.removeItem("omniusd_session");
    await supabase.auth.signOut();
    setAuthUser(null);
    setProfile(null);
    setView("landing");
  }

  if(!ready)return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <Spinner size={40}/>
    </div>
  );

  // ── LEGAL PAGES ──
  if(view==="privacy") return <PrivacyPolicyPage onBack={()=>setView("landing")}/>;
  if(view==="terms") return <TermsOfServicePage onBack={()=>setView("landing")}/>;

  // ── PASSWORD RESET ──
  if(view==="reset_password") return <ResetPasswordPage token={resetToken} onDone={()=>setView("auth_login")}/>;

  // ── LANDING ──
  if(view==="landing") return <LandingPage 
    onEnterApp={()=>setView("pricing")} 
    onLogin={()=>setView("auth_login")}
    onPrivacy={()=>setView("privacy")}
    onTerms={()=>setView("terms")}
  />;

  // ── PRICING ──
  if(view==="pricing") return <PricingPage onBack={()=>setView("landing")} onPaid={()=>setView("auth")}/>;

  // ── PAYMENT SUCCESS ──
  if(view==="payment_success") return (
    <div style={{minHeight:"100vh",background:"#1e1a35",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"'Syne',sans-serif"}}>
      <div style={{maxWidth:480,textAlign:"center"}}>
        <div style={{fontSize:64,marginBottom:24}}>✅</div>
        <h1 style={{fontSize:32,fontWeight:800,color:"#f4f0ff",marginBottom:12,letterSpacing:"-0.02em"}}>Payment confirmed!</h1>
        <p style={{fontFamily:"monospace",fontSize:14,color:"#8878aa",lineHeight:1.7,marginBottom:32}}>
          Your access is ready. Create your password below to enter your dashboard.
        </p>
        <button onClick={()=>setView("auth")}
          style={{fontFamily:"monospace",fontSize:14,fontWeight:700,letterSpacing:"0.1em",
            color:"#0d0718",background:"linear-gradient(135deg,#ff6bff,#7b2fff)",
            border:"none",padding:"15px 40px",borderRadius:10,cursor:"pointer",
            boxShadow:"0 4px 28px rgba(255,107,255,0.25)"}}>
          SET UP MY ACCOUNT →
        </button>
      </div>
    </div>
  );

  // ── AUTH ──
  if((view==="auth"||view==="auth_login")&&!authUser) return <AuthScreen onBack={()=>setView("landing")} supabase={supabase} initialTab={view==="auth_login"?"login":"signup"}/>;

  // ── ONBOARDING ──
  if(!profile)return <Onboarding onSelect={selectProfile} theme={T}/>;

  const chipLabel = profile.tierLabel || "Starter";

  // ── HOME = Unified Dashboard — full screen, bypasses old wrapper ──
  if(page==="home") return <UnifiedDashboard
    profile={profile}
    onJournalEntry={(entry)=>{
      const newJournal=[{...entry,id:Date.now(),outcome:null},...journal];
      setJournal(newJournal);
      (() => {
        const _s=JSON.parse(localStorage.getItem("omniusd_session")||"{}");
        const _uid=_s.user?.id||_s.user_id||"anon";
        localStorage.setItem(`omniusd_journal_${_uid}`,JSON.stringify(newJournal));
      })();
    }}
    onOpenJournal={()=>setPage("journal")}
    onSignOut={signOut}
  />;

  return(
    <div style={{...S.root, background:T.bg, color:T.text}}>
      <ThemeInjector T={T}/>
      <div style={S.gridBg}/>
      <header style={S.nav}>
        <button onClick={()=>{setPage("home");setPlanResult(null);}} style={S.navLogo}>
          <OmniLogo size={36} />
          <span style={{display:"inline-flex"}}><span style={S.logoWord}>Omni</span><span style={S.logoWord2}>USD</span></span>
        </button>
        {/* Nav tabs */}
        <div style={{display:"flex",gap:4,position:"absolute",left:"50%",transform:"translateX(-50%)"}}>
          {[
            {id:"home",label:"Dashboard"},
          ].map(tab=>(
            <button key={tab.id} onClick={()=>setPage(tab.id)}
              style={{fontFamily:"inherit",fontSize:14,fontWeight:700,letterSpacing:"0.06em",
                padding:"5px 16px",borderRadius:8,border:"none",cursor:"pointer",
                background:page===tab.id?"rgba(255,107,255,0.15)":"none",
                color:page===tab.id?"#ff6bff":"var(--t-muted4)"}}>
              {tab.label}
            </button>
          ))}
        </div>
        <div style={S.navRight}>
          {/* Sign out */}
          <button onClick={signOut}
            style={{fontSize:13,fontWeight:700,letterSpacing:"0.08em",
              color:"var(--t-muted4)",background:"rgba(255,255,255,0.04)",
              border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,
              padding:"5px 12px",cursor:"pointer",fontFamily:"inherit"}}>
            Sign out
          </button>
          <button onClick={resetProfile}
            style={{display:"flex",alignItems:"center",gap:7,
              background:"rgba(255,255,255,0.06)",
              border:`1px solid ${profile.tierColor||"#00e5ff"}44`,
              borderRadius:20,padding:"5px 14px",cursor:"pointer",fontFamily:"inherit",
              transition:"all 0.15s"}}
            title="Change setup">
            <span style={{width:6,height:6,borderRadius:"50%",background:profile.tierColor||"#00e5ff",flexShrink:0}}/>
            <span style={{fontSize:14,fontWeight:700,letterSpacing:"0.06em",color:profile.tierColor||"#00e5ff"}}>{profile.tierLabel||"Starter"}</span>
            <span style={{fontSize:13,color:"var(--t-muted4)"}}>✎</span>
          </button>
        </div>
      </header>
      <main style={S.main}>
        {page==="home" && <HomePage planResult={planResult} setPlanResult={setPlanResult} anime={profile} T={T} onJournalEntry={(entry)=>{
          const newJournal=[{...entry,id:Date.now(),outcome:null},...journal];
          setJournal(newJournal);
          (() => {
        const _s=JSON.parse(localStorage.getItem("omniusd_session")||"{}");
        const _uid=_s.user?.id||_s.user_id||"anon";
        localStorage.setItem(`omniusd_journal_${_uid}`,JSON.stringify(newJournal));
      })();
        }}/>}
        {page==="journal" && <JournalPage journal={journal} onUpdate={(updated)=>{
          setJournal(updated);
          (() => {
        const _s=JSON.parse(localStorage.getItem("omniusd_session")||"{}");
        const _uid=_s.user?.id||_s.user_id||"anon";
        localStorage.setItem(`omniusd_journal_${_uid}`,JSON.stringify(updated));
      })();
        }} T={T}/>}
      </main>
      <footer style={{...S.footer, borderTop:`1px solid ${T.border}`}}>
        <span style={{color:T.subtext,display:"flex",alignItems:"center",gap:8}}><OmniLogo size={26} />© {new Date().getFullYear()} OmniUSD · BRC Execution System</span>
        <span style={{color:"rgba(255,107,107,0.5)",fontWeight:500,fontSize:13,letterSpacing:"0.04em"}}>⚠ Trade at your own risk · Results not guaranteed</span>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════════════════

// ─── Onboarding data ───────────────────────────────────────────────────────
// Global timezone list — city · label · IANA key for Intl · offset string used in SESSION_TIMES
const TIMEZONES=[
  // ── UTC-12 ──
  {city:"Baker Island",     region:"Pacific",    label:"AoE / UTC-12",  tz:"AoE (UTC-12)",  iana:"Etc/GMT+12"},
  // ── UTC-11 ──
  {city:"Pago Pago",        region:"Pacific",    label:"SST / UTC-11",  tz:"SST (UTC-11)",  iana:"Pacific/Pago_Pago"},
  {city:"Niue",             region:"Pacific",    label:"NUT / UTC-11",  tz:"NUT (UTC-11)",  iana:"Pacific/Niue"},
  // ── UTC-10 ──
  {city:"Honolulu",         region:"Americas",   label:"HST / UTC-10",  tz:"HST (UTC-10)",  iana:"Pacific/Honolulu"},
  {city:"Tahiti",           region:"Pacific",    label:"TAHT / UTC-10", tz:"TAHT (UTC-10)", iana:"Pacific/Tahiti"},
  // ── UTC-9:30 ──
  {city:"Marquesas Islands",region:"Pacific",    label:"MART / UTC-9:30",tz:"MART (UTC-9:30)",iana:"Pacific/Marquesas"},
  // ── UTC-9 ──
  {city:"Anchorage",        region:"Americas",   label:"AKST / UTC-9",  tz:"AKST (UTC-9)",  iana:"America/Anchorage"},
  {city:"Juneau",           region:"Americas",   label:"AKST / UTC-9",  tz:"AKST (UTC-9)",  iana:"America/Juneau"},
  {city:"Gambier Islands",  region:"Pacific",    label:"GAMT / UTC-9",  tz:"GAMT (UTC-9)",  iana:"Pacific/Gambier"},
  // ── UTC-8 ──
  {city:"Los Angeles",      region:"Americas",   label:"PST / UTC-8",   tz:"PST (UTC-8)",   iana:"America/Los_Angeles"},
  {city:"San Francisco",    region:"Americas",   label:"PST / UTC-8",   tz:"PST (UTC-8)",   iana:"America/Los_Angeles"},
  {city:"Seattle",          region:"Americas",   label:"PST / UTC-8",   tz:"PST (UTC-8)",   iana:"America/Los_Angeles"},
  {city:"Las Vegas",        region:"Americas",   label:"PST / UTC-8",   tz:"PST (UTC-8)",   iana:"America/Los_Angeles"},
  {city:"Portland",         region:"Americas",   label:"PST / UTC-8",   tz:"PST (UTC-8)",   iana:"America/Los_Angeles"},
  {city:"Vancouver",        region:"Americas",   label:"PST / UTC-8",   tz:"PST (UTC-8)",   iana:"America/Vancouver"},
  {city:"Tijuana",          region:"Americas",   label:"PST / UTC-8",   tz:"PST (UTC-8)",   iana:"America/Tijuana"},
  // ── UTC-7 ──
  {city:"Denver",           region:"Americas",   label:"MST / UTC-7",   tz:"MST (UTC-7)",   iana:"America/Denver"},
  {city:"Phoenix",          region:"Americas",   label:"MST / UTC-7",   tz:"MST (UTC-7)",   iana:"America/Phoenix"},
  {city:"Salt Lake City",   region:"Americas",   label:"MST / UTC-7",   tz:"MST (UTC-7)",   iana:"America/Denver"},
  {city:"Albuquerque",      region:"Americas",   label:"MST / UTC-7",   tz:"MST (UTC-7)",   iana:"America/Denver"},
  {city:"Calgary",          region:"Americas",   label:"MST / UTC-7",   tz:"MST (UTC-7)",   iana:"America/Edmonton"},
  {city:"Edmonton",         region:"Americas",   label:"MST / UTC-7",   tz:"MST (UTC-7)",   iana:"America/Edmonton"},
  {city:"Chihuahua",        region:"Americas",   label:"MST / UTC-7",   tz:"MST (UTC-7)",   iana:"America/Chihuahua"},
  // ── UTC-6 ──
  {city:"Chicago",          region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Chicago"},
  {city:"Dallas",           region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Chicago"},
  {city:"Houston",          region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Chicago"},
  {city:"Minneapolis",      region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Chicago"},
  {city:"Kansas City",      region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Chicago"},
  {city:"New Orleans",      region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Chicago"},
  {city:"Winnipeg",         region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Winnipeg"},
  {city:"Mexico City",      region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Mexico_City"},
  {city:"Guadalajara",      region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Mexico_City"},
  {city:"San José",         region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Costa_Rica"},
  {city:"Guatemala City",   region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Guatemala"},
  {city:"Tegucigalpa",      region:"Americas",   label:"CST / UTC-6",   tz:"CST (UTC-6)",   iana:"America/Tegucigalpa"},
  // ── UTC-5 ──
  {city:"New York",         region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Miami",            region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Atlanta",          region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Boston",           region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Philadelphia",     region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Washington DC",    region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Charlotte",        region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Detroit",          region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/Detroit"},
  {city:"Columbus",         region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Jacksonville",     region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Orlando",          region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Tampa",            region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/New_York"},
  {city:"Toronto",          region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/Toronto"},
  {city:"Ottawa",           region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/Toronto"},
  {city:"Montreal",         region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/Toronto"},
  {city:"Bogotá",           region:"Americas",   label:"COT / UTC-5",   tz:"COT (UTC-5)",   iana:"America/Bogota"},
  {city:"Lima",             region:"Americas",   label:"PET / UTC-5",   tz:"PET (UTC-5)",   iana:"America/Lima"},
  {city:"Quito",            region:"Americas",   label:"ECT / UTC-5",   tz:"ECT (UTC-5)",   iana:"America/Guayaquil"},
  {city:"Panama City",      region:"Americas",   label:"EST / UTC-5",   tz:"EST (UTC-5)",   iana:"America/Panama"},
  // ── UTC-4:30 ──
  {city:"Caracas",          region:"Americas",   label:"VET / UTC-4",   tz:"VET (UTC-4)",   iana:"America/Caracas"},
  // ── UTC-4 ──
  {city:"Santiago",         region:"Americas",   label:"CLT / UTC-4",   tz:"CLT (UTC-4)",   iana:"America/Santiago"},
  {city:"La Paz",           region:"Americas",   label:"BOT / UTC-4",   tz:"BOT (UTC-4)",   iana:"America/La_Paz"},
  {city:"Manaus",           region:"Americas",   label:"AMT / UTC-4",   tz:"AMT (UTC-4)",   iana:"America/Manaus"},
  {city:"Halifax",          region:"Americas",   label:"AST / UTC-4",   tz:"AST (UTC-4)",   iana:"America/Halifax"},
  {city:"Puerto Rico",      region:"Americas",   label:"AST / UTC-4",   tz:"AST (UTC-4)",   iana:"America/Puerto_Rico"},
  // ── UTC-3 ──
  {city:"São Paulo",        region:"Americas",   label:"BRT / UTC-3",   tz:"BRT (UTC-3)",   iana:"America/Sao_Paulo"},
  {city:"Rio de Janeiro",   region:"Americas",   label:"BRT / UTC-3",   tz:"BRT (UTC-3)",   iana:"America/Sao_Paulo"},
  {city:"Buenos Aires",     region:"Americas",   label:"ART / UTC-3",   tz:"ART (UTC-3)",   iana:"America/Argentina/Buenos_Aires"},
  {city:"Montevideo",       region:"Americas",   label:"UYT / UTC-3",   tz:"UYT (UTC-3)",   iana:"America/Montevideo"},
  {city:"Asunción",         region:"Americas",   label:"PYT / UTC-4",   tz:"PYT (UTC-4)",   iana:"America/Asuncion"},
  // ── UTC-2 ──
  {city:"South Georgia",    region:"Atlantic",   label:"GST / UTC-2",   tz:"GST (UTC-2)",   iana:"Atlantic/South_Georgia"},
  // ── UTC-1 ──
  {city:"Azores",           region:"Atlantic",   label:"AZOT / UTC-1",  tz:"AZOT (UTC-1)",  iana:"Atlantic/Azores"},
  {city:"Cape Verde",       region:"Atlantic",   label:"CVT / UTC-1",   tz:"CVT (UTC-1)",   iana:"Atlantic/Cape_Verde"},
  // ── UTC+0 ──
  {city:"London",           region:"Europe",     label:"GMT / UTC+0",   tz:"GMT (UTC+0)",   iana:"Europe/London"},
  {city:"Dublin",           region:"Europe",     label:"GMT / UTC+0",   tz:"GMT (UTC+0)",   iana:"Europe/Dublin"},
  {city:"Lisbon",           region:"Europe",     label:"WET / UTC+0",   tz:"WET (UTC+0)",   iana:"Europe/Lisbon"},
  {city:"Reykjavik",        region:"Europe",     label:"GMT / UTC+0",   tz:"GMT (UTC+0)",   iana:"Atlantic/Reykjavik"},
  {city:"Accra",            region:"Africa",     label:"GMT / UTC+0",   tz:"GMT (UTC+0)",   iana:"Africa/Accra"},
  {city:"Dakar",            region:"Africa",     label:"GMT / UTC+0",   tz:"GMT (UTC+0)",   iana:"Africa/Dakar"},
  {city:"Abidjan",          region:"Africa",     label:"GMT / UTC+0",   tz:"GMT (UTC+0)",   iana:"Africa/Abidjan"},
  // ── UTC+1 ──
  {city:"Paris",            region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Paris"},
  {city:"Amsterdam",        region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Amsterdam"},
  {city:"Frankfurt",        region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Berlin"},
  {city:"Berlin",           region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Berlin"},
  {city:"Zurich",           region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Zurich"},
  {city:"Madrid",           region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Madrid"},
  {city:"Barcelona",        region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Madrid"},
  {city:"Milan",            region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Rome"},
  {city:"Rome",             region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Rome"},
  {city:"Vienna",           region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Vienna"},
  {city:"Brussels",         region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Brussels"},
  {city:"Stockholm",        region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Stockholm"},
  {city:"Oslo",             region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Oslo"},
  {city:"Copenhagen",       region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Copenhagen"},
  {city:"Warsaw",           region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Warsaw"},
  {city:"Prague",           region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Prague"},
  {city:"Budapest",         region:"Europe",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Europe/Budapest"},
  {city:"Lagos",            region:"Africa",     label:"WAT / UTC+1",   tz:"WAT (UTC+1)",   iana:"Africa/Lagos"},
  {city:"Kinshasa",         region:"Africa",     label:"WAT / UTC+1",   tz:"WAT (UTC+1)",   iana:"Africa/Kinshasa"},
  {city:"Luanda",           region:"Africa",     label:"WAT / UTC+1",   tz:"WAT (UTC+1)",   iana:"Africa/Luanda"},
  {city:"Casablanca",       region:"Africa",     label:"WET / UTC+1",   tz:"WET (UTC+1)",   iana:"Africa/Casablanca"},
  {city:"Tunis",            region:"Africa",     label:"CET / UTC+1",   tz:"CET (UTC+1)",   iana:"Africa/Tunis"},
  // ── UTC+2 ──
  {city:"Helsinki",         region:"Europe",     label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Europe/Helsinki"},
  {city:"Athens",           region:"Europe",     label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Europe/Athens"},
  {city:"Bucharest",        region:"Europe",     label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Europe/Bucharest"},
  {city:"Kiev",             region:"Europe",     label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Europe/Kiev"},
  {city:"Riga",             region:"Europe",     label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Europe/Riga"},
  {city:"Vilnius",          region:"Europe",     label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Europe/Vilnius"},
  {city:"Tallinn",          region:"Europe",     label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Europe/Tallinn"},
  {city:"Sofia",            region:"Europe",     label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Europe/Sofia"},
  {city:"Johannesburg",     region:"Africa",     label:"SAST / UTC+2",  tz:"SAST (UTC+2)",  iana:"Africa/Johannesburg"},
  {city:"Cape Town",        region:"Africa",     label:"SAST / UTC+2",  tz:"SAST (UTC+2)",  iana:"Africa/Johannesburg"},
  {city:"Harare",           region:"Africa",     label:"CAT / UTC+2",   tz:"CAT (UTC+2)",   iana:"Africa/Harare"},
  {city:"Lusaka",           region:"Africa",     label:"CAT / UTC+2",   tz:"CAT (UTC+2)",   iana:"Africa/Lusaka"},
  {city:"Cairo",            region:"Africa",     label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Africa/Cairo"},
  {city:"Tel Aviv",         region:"Middle East",label:"IST / UTC+2",   tz:"IST (UTC+2)",   iana:"Asia/Jerusalem"},
  {city:"Jerusalem",        region:"Middle East",label:"IST / UTC+2",   tz:"IST (UTC+2)",   iana:"Asia/Jerusalem"},
  {city:"Beirut",           region:"Middle East",label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Asia/Beirut"},
  {city:"Nicosia",          region:"Middle East",label:"EET / UTC+2",   tz:"EET (UTC+2)",   iana:"Asia/Nicosia"},
  // ── UTC+3 ──
  {city:"Moscow",           region:"Europe",     label:"MSK / UTC+3",   tz:"MSK (UTC+3)",   iana:"Europe/Moscow"},
  {city:"St. Petersburg",   region:"Europe",     label:"MSK / UTC+3",   tz:"MSK (UTC+3)",   iana:"Europe/Moscow"},
  {city:"Istanbul",         region:"Middle East",label:"TRT / UTC+3",   tz:"TRT (UTC+3)",   iana:"Europe/Istanbul"},
  {city:"Riyadh",           region:"Middle East",label:"AST / UTC+3",   tz:"AST (UTC+3)",   iana:"Asia/Riyadh"},
  {city:"Doha",             region:"Middle East",label:"AST / UTC+3",   tz:"AST (UTC+3)",   iana:"Asia/Qatar"},
  {city:"Kuwait City",      region:"Middle East",label:"AST / UTC+3",   tz:"AST (UTC+3)",   iana:"Asia/Kuwait"},
  {city:"Baghdad",          region:"Middle East",label:"AST / UTC+3",   tz:"AST (UTC+3)",   iana:"Asia/Baghdad"},
  {city:"Bahrain",          region:"Middle East",label:"AST / UTC+3",   tz:"AST (UTC+3)",   iana:"Asia/Bahrain"},
  {city:"Nairobi",          region:"Africa",     label:"EAT / UTC+3",   tz:"EAT (UTC+3)",   iana:"Africa/Nairobi"},
  {city:"Addis Ababa",      region:"Africa",     label:"EAT / UTC+3",   tz:"EAT (UTC+3)",   iana:"Africa/Addis_Ababa"},
  {city:"Dar es Salaam",    region:"Africa",     label:"EAT / UTC+3",   tz:"EAT (UTC+3)",   iana:"Africa/Dar_es_Salaam"},
  {city:"Mogadishu",        region:"Africa",     label:"EAT / UTC+3",   tz:"EAT (UTC+3)",   iana:"Africa/Mogadishu"},
  {city:"Minsk",            region:"Europe",     label:"FET / UTC+3",   tz:"FET (UTC+3)",   iana:"Europe/Minsk"},
  // ── UTC+3:30 ──
  {city:"Tehran",           region:"Middle East",label:"IRST / UTC+3:30",tz:"IRST (UTC+3:30)",iana:"Asia/Tehran"},
  // ── UTC+4 ──
  {city:"Dubai",            region:"Middle East",label:"GST / UTC+4",   tz:"GST (UTC+4)",   iana:"Asia/Dubai"},
  {city:"Abu Dhabi",        region:"Middle East",label:"GST / UTC+4",   tz:"GST (UTC+4)",   iana:"Asia/Dubai"},
  {city:"Muscat",           region:"Middle East",label:"GST / UTC+4",   tz:"GST (UTC+4)",   iana:"Asia/Muscat"},
  {city:"Baku",             region:"Asia",       label:"AZT / UTC+4",   tz:"AZT (UTC+4)",   iana:"Asia/Baku"},
  {city:"Tbilisi",          region:"Asia",       label:"GET / UTC+4",   tz:"GET (UTC+4)",   iana:"Asia/Tbilisi"},
  {city:"Yerevan",          region:"Asia",       label:"AMT / UTC+4",   tz:"AMT (UTC+4)",   iana:"Asia/Yerevan"},
  {city:"Mauritius",        region:"Africa",     label:"MUT / UTC+4",   tz:"MUT (UTC+4)",   iana:"Indian/Mauritius"},
  // ── UTC+4:30 ──
  {city:"Kabul",            region:"Asia",       label:"AFT / UTC+4:30",tz:"AFT (UTC+4:30)",iana:"Asia/Kabul"},
  // ── UTC+5 ──
  {city:"Karachi",          region:"Asia",       label:"PKT / UTC+5",   tz:"PKT (UTC+5)",   iana:"Asia/Karachi"},
  {city:"Tashkent",         region:"Asia",       label:"UZT / UTC+5",   tz:"UZT (UTC+5)",   iana:"Asia/Tashkent"},
  {city:"Islamabad",        region:"Asia",       label:"PKT / UTC+5",   tz:"PKT (UTC+5)",   iana:"Asia/Karachi"},
  {city:"Almaty",           region:"Asia",       label:"ALMT / UTC+5",  tz:"ALMT (UTC+5)",  iana:"Asia/Almaty"},
  {city:"Maldives",         region:"Asia",       label:"MVT / UTC+5",   tz:"MVT (UTC+5)",   iana:"Indian/Maldives"},
  // ── UTC+5:30 ──
  {city:"Mumbai",           region:"Asia",       label:"IST / UTC+5:30",tz:"IST (UTC+5:30)",iana:"Asia/Kolkata"},
  {city:"Delhi",            region:"Asia",       label:"IST / UTC+5:30",tz:"IST (UTC+5:30)",iana:"Asia/Kolkata"},
  {city:"Kolkata",          region:"Asia",       label:"IST / UTC+5:30",tz:"IST (UTC+5:30)",iana:"Asia/Kolkata"},
  {city:"Chennai",          region:"Asia",       label:"IST / UTC+5:30",tz:"IST (UTC+5:30)",iana:"Asia/Kolkata"},
  {city:"Bangalore",        region:"Asia",       label:"IST / UTC+5:30",tz:"IST (UTC+5:30)",iana:"Asia/Kolkata"},
  {city:"Colombo",          region:"Asia",       label:"SLST / UTC+5:30",tz:"SLST (UTC+5:30)",iana:"Asia/Colombo"},
  // ── UTC+5:45 ──
  {city:"Kathmandu",        region:"Asia",       label:"NPT / UTC+5:45",tz:"NPT (UTC+5:45)",iana:"Asia/Kathmandu"},
  // ── UTC+6 ──
  {city:"Dhaka",            region:"Asia",       label:"BST / UTC+6",   tz:"BST (UTC+6)",   iana:"Asia/Dhaka"},
  {city:"Almaty",           region:"Asia",       label:"ALMT / UTC+6",  tz:"ALMT (UTC+6)",  iana:"Asia/Almaty"},
  {city:"Bishkek",          region:"Asia",       label:"KGT / UTC+6",   tz:"KGT (UTC+6)",   iana:"Asia/Bishkek"},
  // ── UTC+6:30 ──
  {city:"Yangon",           region:"Asia",       label:"MMT / UTC+6:30",tz:"MMT (UTC+6:30)",iana:"Asia/Yangon"},
  // ── UTC+7 ──
  {city:"Bangkok",          region:"Asia",       label:"ICT / UTC+7",   tz:"ICT (UTC+7)",   iana:"Asia/Bangkok"},
  {city:"Ho Chi Minh City", region:"Asia",       label:"ICT / UTC+7",   tz:"ICT (UTC+7)",   iana:"Asia/Ho_Chi_Minh"},
  {city:"Hanoi",            region:"Asia",       label:"ICT / UTC+7",   tz:"ICT (UTC+7)",   iana:"Asia/Ho_Chi_Minh"},
  {city:"Jakarta",          region:"Asia",       label:"WIB / UTC+7",   tz:"WIB (UTC+7)",   iana:"Asia/Jakarta"},
  {city:"Phnom Penh",       region:"Asia",       label:"ICT / UTC+7",   tz:"ICT (UTC+7)",   iana:"Asia/Phnom_Penh"},
  {city:"Vientiane",        region:"Asia",       label:"ICT / UTC+7",   tz:"ICT (UTC+7)",   iana:"Asia/Vientiane"},
  {city:"Novosibirsk",      region:"Asia",       label:"NOVT / UTC+7",  tz:"NOVT (UTC+7)",  iana:"Asia/Novosibirsk"},
  // ── UTC+8 ──
  {city:"Singapore",        region:"Asia",       label:"SGT / UTC+8",   tz:"SGT (UTC+8)",   iana:"Asia/Singapore"},
  {city:"Kuala Lumpur",     region:"Asia",       label:"MYT / UTC+8",   tz:"MYT (UTC+8)",   iana:"Asia/Kuala_Lumpur"},
  {city:"Hong Kong",        region:"Asia",       label:"HKT / UTC+8",   tz:"HKT (UTC+8)",   iana:"Asia/Hong_Kong"},
  {city:"Shanghai",         region:"Asia",       label:"CST / UTC+8",   tz:"CST (UTC+8)",   iana:"Asia/Shanghai"},
  {city:"Beijing",          region:"Asia",       label:"CST / UTC+8",   tz:"CST (UTC+8)",   iana:"Asia/Shanghai"},
  {city:"Shenzhen",         region:"Asia",       label:"CST / UTC+8",   tz:"CST (UTC+8)",   iana:"Asia/Shanghai"},
  {city:"Guangzhou",        region:"Asia",       label:"CST / UTC+8",   tz:"CST (UTC+8)",   iana:"Asia/Shanghai"},
  {city:"Taipei",           region:"Asia",       label:"CST / UTC+8",   tz:"CST (UTC+8)",   iana:"Asia/Taipei"},
  {city:"Manila",           region:"Asia",       label:"PST / UTC+8",   tz:"PST (UTC+8)",   iana:"Asia/Manila"},
  {city:"Perth",            region:"Oceania",    label:"AWST / UTC+8",  tz:"AWST (UTC+8)",  iana:"Australia/Perth"},
  {city:"Makassar",         region:"Asia",       label:"WITA / UTC+8",  tz:"WITA (UTC+8)",  iana:"Asia/Makassar"},
  {city:"Ulaanbaatar",      region:"Asia",       label:"ULAT / UTC+8",  tz:"ULAT (UTC+8)",  iana:"Asia/Ulaanbaatar"},
  {city:"Brunei",           region:"Asia",       label:"BNT / UTC+8",   tz:"BNT (UTC+8)",   iana:"Asia/Brunei"},
  // ── UTC+8:45 ──
  {city:"Eucla",            region:"Oceania",    label:"ACWST / UTC+8:45",tz:"ACWST (UTC+8:45)",iana:"Australia/Eucla"},
  // ── UTC+9 ──
  {city:"Tokyo",            region:"Asia",       label:"JST / UTC+9",   tz:"JST (UTC+9)",   iana:"Asia/Tokyo"},
  {city:"Osaka",            region:"Asia",       label:"JST / UTC+9",   tz:"JST (UTC+9)",   iana:"Asia/Tokyo"},
  {city:"Seoul",            region:"Asia",       label:"KST / UTC+9",   tz:"KST (UTC+9)",   iana:"Asia/Seoul"},
  {city:"Pyongyang",        region:"Asia",       label:"KST / UTC+9",   tz:"KST (UTC+9)",   iana:"Asia/Pyongyang"},
  {city:"Jayapura",         region:"Asia",       label:"WIT / UTC+9",   tz:"WIT (UTC+9)",   iana:"Asia/Jayapura"},
  {city:"Palau",            region:"Pacific",    label:"PWT / UTC+9",   tz:"PWT (UTC+9)",   iana:"Pacific/Palau"},
  {city:"Yakutsk",          region:"Asia",       label:"YAKT / UTC+9",  tz:"YAKT (UTC+9)",  iana:"Asia/Yakutsk"},
  // ── UTC+9:30 ──
  {city:"Darwin",           region:"Oceania",    label:"ACST / UTC+9:30",tz:"ACST (UTC+9:30)",iana:"Australia/Darwin"},
  {city:"Adelaide",         region:"Oceania",    label:"ACST / UTC+9:30",tz:"ACST (UTC+9:30)",iana:"Australia/Adelaide"},
  // ── UTC+10 ──
  {city:"Sydney",           region:"Oceania",    label:"AEST / UTC+10",  tz:"AEST (UTC+10)", iana:"Australia/Sydney"},
  {city:"Melbourne",        region:"Oceania",    label:"AEST / UTC+10",  tz:"AEST (UTC+10)", iana:"Australia/Melbourne"},
  {city:"Brisbane",         region:"Oceania",    label:"AEST / UTC+10",  tz:"AEST (UTC+10)", iana:"Australia/Brisbane"},
  {city:"Port Moresby",     region:"Pacific",    label:"PGT / UTC+10",  tz:"PGT (UTC+10)",  iana:"Pacific/Port_Moresby"},
  {city:"Vladivostok",      region:"Asia",       label:"VLAT / UTC+10", tz:"VLAT (UTC+10)", iana:"Asia/Vladivostok"},
  {city:"Guam",             region:"Pacific",    label:"ChST / UTC+10", tz:"ChST (UTC+10)", iana:"Pacific/Guam"},
  // ── UTC+10:30 ──
  {city:"Lord Howe Island", region:"Oceania",    label:"LHST / UTC+10:30",tz:"LHST (UTC+10:30)",iana:"Australia/Lord_Howe"},
  // ── UTC+11 ──
  {city:"Hobart",           region:"Oceania",    label:"AEDT / UTC+11",  tz:"AEDT (UTC+11)", iana:"Australia/Hobart"},
  {city:"Noumea",           region:"Pacific",    label:"NCT / UTC+11",  tz:"NCT (UTC+11)",  iana:"Pacific/Noumea"},
  {city:"Honiara",          region:"Pacific",    label:"SBT / UTC+11",  tz:"SBT (UTC+11)",  iana:"Pacific/Guadalcanal"},
  {city:"Magadan",          region:"Asia",       label:"MAGT / UTC+11", tz:"MAGT (UTC+11)", iana:"Asia/Magadan"},
  // ── UTC+12 ──
  {city:"Auckland",         region:"Oceania",    label:"NZST / UTC+12",  tz:"NZST (UTC+12)", iana:"Pacific/Auckland"},
  {city:"Wellington",       region:"Oceania",    label:"NZST / UTC+12",  tz:"NZST (UTC+12)", iana:"Pacific/Auckland"},
  {city:"Fiji",             region:"Pacific",    label:"FJT / UTC+12",  tz:"FJT (UTC+12)",  iana:"Pacific/Fiji"},
  {city:"Suva",             region:"Pacific",    label:"FJT / UTC+12",  tz:"FJT (UTC+12)",  iana:"Pacific/Fiji"},
  {city:"Funafuti",         region:"Pacific",    label:"TVT / UTC+12",  tz:"TVT (UTC+12)",  iana:"Pacific/Funafuti"},
  {city:"Kamchatka",        region:"Asia",       label:"PETT / UTC+12", tz:"PETT (UTC+12)", iana:"Asia/Kamchatka"},
  // ── UTC+12:45 ──
  {city:"Chatham Islands",  region:"Oceania",    label:"CHAST / UTC+12:45",tz:"CHAST (UTC+12:45)",iana:"Pacific/Chatham"},
  // ── UTC+13 ──
  {city:"Apia",             region:"Pacific",    label:"WST / UTC+13",  tz:"WST (UTC+13)",  iana:"Pacific/Apia"},
  {city:"Nuku'alofa",       region:"Pacific",    label:"TOT / UTC+13",  tz:"TOT (UTC+13)",  iana:"Pacific/Tongatapu"},
  // ── UTC+14 ──
  {city:"Kiritimati",       region:"Pacific",    label:"LINT / UTC+14", tz:"LINT (UTC+14)", iana:"Pacific/Kiritimati"},
];
const SESSION_TIMES={
  NY:       {label:"New York",          utc:"13:30-17:00 UTC",color:"#00e5ff",startUTC:13.5,endUTC:17},
  LONDON:   {label:"London",            utc:"08:00-12:00 UTC",color:"#ff6bff",startUTC:8,  endUTC:12},
  LONDON_NY:{label:"London-NY Overlap", utc:"13:30-16:00 UTC",color:"#7fff6b",startUTC:13.5,endUTC:16},
  ASIAN:    {label:"Asian",             utc:"00:00-06:00 UTC",color:"#ffd166",startUTC:0,  endUTC:6},
};

// Compute local time string for a session given an IANA tz
function sessionLocalTime(startUTC,endUTC,iana){
  try{
    const fmt=(h)=>{
      const d=new Date(Date.UTC(2024,0,15,Math.floor(h),(h%1)*60));
      return d.toLocaleTimeString("en-US",{timeZone:iana,hour:"numeric",minute:"2-digit",hour12:true});
    };
    return `${fmt(startUTC)} – ${fmt(endUTC)}`;
  }catch(e){return null;}
}

function Onboarding({onSelect}){
  // Step order: 1=Plan, 2=Platform, 3=Confirm, 4=Commit
  const [step,setStep]=useState(()=>{
    if(localStorage.getItem("omniusd_paid_tier")) return 2;
    const params=new URLSearchParams(window.location.search);
    if(params.get("session_id")) return 2; // post-Stripe: skip to confirm
    return 1;
  });
  const [selectedTier,setSelectedTier]=useState(()=>{
    // Use paid tier from Stripe if available
    return localStorage.getItem("omniusd_paid_tier")||null;
  });
  const [instrument,setInstrument]=useState(null); // set from dashboard preferences, not onboarding
  const [session,setSession]=useState(null);
  const [tzObj,setTzObj]=useState(null);
  const [tzSearch,setTzSearch]=useState("");
  const [tzDetecting,setTzDetecting]=useState(false);
  const [showCommit,setShowCommit]=useState(false);
  const [checkoutLoading,setCheckoutLoading]=useState(false);
  const [checkoutError,setCheckoutError]=useState(null);

  async function handleCheckout(){
    if(!selectedTier) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try{
      const session=JSON.parse(localStorage.getItem("omniusd_session")||"{}");
      const userId=session?.user?.id||session?.user_id||"";
      const email=session?.user?.email||session?.email||"";
      const tierCfg=TIER_CONFIG[selectedTier];
      const res=await fetch("/api/create-checkout",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          priceId:tierCfg.priceId,
          userId,
          email,
          tier:selectedTier,
        }),
      });
      const data=await res.json();
      if(!res.ok||data.error){
        setCheckoutError(data.error||"Checkout failed. Please try again.");
        setCheckoutLoading(false);
        return;
      }
      // Redirect to Stripe Checkout
      window.location.href=data.url;
    }catch(e){
      setCheckoutError("Connection error. Please try again.");
      setCheckoutLoading(false);
    }
  }
  const [mode,setMode]=useState("standard");
  const [anime,setAnime]=useState(null);
  const [deepOpen,setDeepOpen]=useState(false);

  function autoDetectTz(){
    setTzDetecting(true);
    try{
      const iana=Intl.DateTimeFormat().resolvedOptions().timeZone;
      const match=TIMEZONES.find(t=>t.iana===iana||iana.includes(t.city.split(" ")[0]));
      if(match) setTzObj(match);
      else{
        // build a generic entry from detected IANA
        const abbr=new Intl.DateTimeFormat("en",{timeZone:iana,timeZoneName:"short"}).formatToParts(new Date()).find(p=>p.type==="timeZoneName")?.value||iana;
        const offset=-(new Date().getTimezoneOffset()/60);
        const sign=offset>=0?"+":"";
        setTzObj({city:iana.split("/")[1]?.replace("_"," ")||iana,region:"Detected",label:`${abbr} / UTC${sign}${offset}`,tz:`${abbr} (UTC${sign}${offset})`,iana});
      }
    }catch(e){}
    setTzDetecting(false);
  }

  const MODES=[]; // removed
  const INSTRUMENTS=[
    {id:"XAUUSD", label:"Gold",    sub:"XAUUSD", color:"#ffd166"},
    {id:"NAS100", label:"Nasdaq",  sub:"NAS100",  color:"#00e5ff"},
    {id:"US30",   label:"Dow",     sub:"US30",    color:"#7fff6b"},
    {id:"BTCUSD", label:"Bitcoin", sub:"BTCUSD",  color:"#ff9a3c"},
    {id:"USOIL",  label:"Oil",     sub:"USOIL",   color:"#ff6b6b"},
    {id:"US500",  label:"S&P 500", sub:"US500",   color:"#ff6bff"},
  ];

  const modeProfile = mode && mode !== "anime" ? MODES.find(m=>m.id===mode) : null;
  const modeColor = mode ? (MODES.find(m=>m.id===mode)?.color||"#ff6bff") : "#ff6bff";

  // Step labels
  const stepList=["Plan","Platform","Confirm","Commit"];
  const totalSteps=stepList.length;
  const displayStep=step;

  // finish() called on step 3 (Commit)
  function finish(){
    // Use paid tier from Stripe if available, fallback to selected
    const paidTier=localStorage.getItem("omniusd_paid_tier")||selectedTier||"starter";
    const tierCfg = TIER_CONFIG[paidTier]||TIER_CONFIG.starter;
    const defaultInstrument = tierCfg.instruments[0]||"XAUUSD";
    const base={
      session,
      defaultInstrument,
      tier:paidTier,
      tierLabel:tierCfg.label,
      tierColor:tierCfg.color,
    };
    // Clear paid tier from localStorage
    localStorage.removeItem("omniusd_paid_tier");
    onSelect({mode:"standard",emoji:"◈",color:"#00e5ff",label:"Standard",...base,tz:tzObj||null});
  }

  const OB_BTN=(label,onClick,disabled,accent=true)=>(
    <button onClick={onClick} disabled={disabled}
      className={accent&&!disabled?"ob-btn-primary":!accent?"ob-btn-back":""}
      style={{flex:1,
        background:disabled?"rgba(255,255,255,0.06)":accent?"linear-gradient(135deg,#ff6bff,#7b2fff)":"rgba(255,255,255,0.08)",
        border:disabled?"1px solid rgba(255,255,255,0.08)":accent?"none":"1px solid rgba(255,255,255,0.18)",
        color:disabled?"var(--t-muted4)":accent?"#fff":"var(--t-muted)",
        padding:"17px 24px",borderRadius:13,fontSize:15,fontWeight:accent?900:700,letterSpacing:accent?"0.12em":"0.06em",
        fontFamily:"inherit",cursor:disabled?"not-allowed":"pointer",
        transition:"all 0.2s",boxShadow:accent&&!disabled?"0 4px 28px rgba(255,107,255,0.22)":"none"}}>
      {label}
    </button>
  );

  return(
    <div style={{minHeight:"100vh",background:"var(--t-bg)",color:"var(--t-text)",overflowY:"auto",position:"relative"}}>
      <div style={S.gridBg}/>
      <div style={{position:"fixed",top:"5%",left:"50%",transform:"translateX(-50%)",
        width:700,height:500,background:"radial-gradient(ellipse,rgba(255,107,255,0.08),transparent 65%)",
        pointerEvents:"none",zIndex:0}}/>
      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:860,margin:"0 auto",padding:"48px 24px 100px",animation:"icc-fade 0.5s ease both"}}>

        {/* Brand header + step indicator */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:56}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18,color:"#ff6bff"}}><OmniLogo size={28} /></span>
            <span style={{fontSize:15,fontWeight:900,color:"var(--t-text)",letterSpacing:"0.08em"}}>OmniUSD</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            {stepList.map((l,i)=>{
              const n=i+1; const done=n<step; const active=n===step;
              return(
                <div key={l} style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:24,height:24,borderRadius:"50%",
                      background:done?"#ff6bff":active?"rgba(255,107,255,0.18)":"rgba(255,255,255,0.06)",
                      border:`1.5px solid ${done||active?"#ff6bff":"rgba(255,255,255,0.12)"}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:14,fontWeight:900,color:done?"#fff":active?"#ff6bff":"var(--t-muted4)",
                      transition:"all 0.3s",flexShrink:0}}>
                      {done?"✓":n}
                    </div>
                    <span style={{fontSize:14,fontWeight:active?800:500,
                      color:active?"var(--t-text)":done?"rgba(255,107,255,0.7)":"var(--t-muted3)",
                      letterSpacing:"0.05em",transition:"all 0.3s"}}>
                      {l}
                    </span>
                  </div>
                  {i<totalSteps-1&&<div style={{width:28,height:1.5,background:done?"rgba(255,107,255,0.4)":"rgba(255,255,255,0.08)",borderRadius:2}}/>}
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP 1 — PLAN */}
        {step===1&&(
          <div style={{animation:"icc-slide 0.35s ease both",maxWidth:800,margin:"0 auto"}}>
            <div style={{marginBottom:48}}>
              <div style={{fontSize:14,fontWeight:900,letterSpacing:"0.2em",color:"#ff6bff",marginBottom:12}}>STEP 1 OF 3</div>
              <h2 style={{fontSize:36,fontWeight:900,color:"var(--t-text)",margin:"0 0 14px",lineHeight:1.1}}>Choose your access level</h2>
              <p style={{fontSize:17,color:"var(--t-muted2)",margin:0,fontWeight:500,lineHeight:1.6,maxWidth:480}}>Pick the plan that matches how many markets you want to trade.</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:44}}>
              {Object.entries(TIER_CONFIG).map(([key,tier])=>{
                const isSel=selectedTier===key;
                const isPopular=key==="pro";
                return(
                  <button key={key} onClick={()=>setSelectedTier(key)}
                    className={`ob-card${isSel?" ob-card-sel":""}`}
                    style={{position:"relative",
                      background:isSel?`${tier.color}10`:"rgba(255,255,255,0.03)",
                      border:`2px solid ${isSel?tier.color:isPopular?"rgba(255,255,255,0.16)":"rgba(255,255,255,0.07)"}`,
                      borderRadius:18,padding:"30px 24px 26px",cursor:"pointer",textAlign:"left",
                      fontFamily:"inherit",transition:"all 0.2s",
                      boxShadow:isSel?`0 8px 40px ${tier.color}18`:isPopular?"0 0 24px rgba(0,229,255,0.06)":"none"}}>
                    {isPopular&&(
                      <div style={{position:"absolute",top:-13,left:"50%",transform:"translateX(-50%)",
                        background:"linear-gradient(135deg,#00e5ff,#7b2fff)",color:"#fff",
                        fontSize:13,fontWeight:900,letterSpacing:"0.12em",
                        padding:"4px 16px",borderRadius:20,whiteSpace:"nowrap",
                        boxShadow:"0 2px 12px rgba(0,229,255,0.3)"}}>
                        MOST POPULAR
                      </div>
                    )}
                    {isSel&&(
                      <div style={{position:"absolute",top:14,right:14,width:22,height:22,borderRadius:"50%",
                        background:tier.color,display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:14,color:"#000",fontWeight:900}}>✓</div>
                    )}
                    <div style={{marginBottom:20}}>
                      <div style={{fontSize:14,fontWeight:900,color:isSel?tier.color:"var(--t-muted4)",letterSpacing:"0.14em",marginBottom:8}}>{tier.label.toUpperCase()}</div>
                      <div style={{fontSize:34,fontWeight:900,color:isSel?tier.color:"var(--t-text)",lineHeight:1,marginBottom:3}}>{tier.price}</div>
                      <div style={{fontSize:14,color:"var(--t-muted4)",fontWeight:500}}>per month</div>
                    </div>
                    <div style={{width:"100%",height:1,background:"rgba(255,255,255,0.06)",marginBottom:18}}/>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {tier.instruments.map(sym=>{
                        const inst=INSTRUMENTS.find(i=>i.id===sym);
                        return(
                          <div key={sym} style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:inst?.color||tier.color,flexShrink:0}}/>
                            <span style={{fontSize:14,color:isSel?"var(--t-muted)":"var(--t-muted2)",fontWeight:700}}>{inst?.label||sym}</span>
                            <span style={{fontSize:14,color:"var(--t-muted4)",fontWeight:500,marginLeft:"auto"}}>{sym}</span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Single CTA — appears after selection, advances with a deliberate delay */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,marginTop:8,minHeight:80,justifyContent:"center"}}>
              {!selectedTier?(
                <p style={{fontSize:14,color:"var(--t-muted4)",margin:0,fontWeight:500,textAlign:"center"}}>
                  Select a plan above to continue
                </p>
              ):(()=>{
                const t=TIER_CONFIG[selectedTier];
                return(
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,animation:"icc-slide 0.25s ease both"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,fontSize:14,color:"var(--t-muted3)",fontWeight:600}}>
                      <span style={{color:t.color}}>✓</span>
                      <span>{t.label} — {t.price}/month</span>
                    </div>
                    {checkoutError&&(
                      <div style={{fontSize:14,color:"#ff8080",background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.2)",borderRadius:8,padding:"8px 14px",textAlign:"center"}}>
                        {checkoutError}
                      </div>
                    )}
                    <button
                      onClick={handleCheckout}
                      disabled={checkoutLoading}
                      className="ob-btn-primary"
                      style={{background:checkoutLoading?"rgba(255,255,255,0.06)":"linear-gradient(135deg,#ff6bff,#7b2fff)",border:"none",
                        color:checkoutLoading?"var(--t-muted4)":"#fff",padding:"17px 52px",borderRadius:13,fontSize:15,fontWeight:900,
                        letterSpacing:"0.12em",fontFamily:"inherit",cursor:checkoutLoading?"not-allowed":"pointer",
                        boxShadow:checkoutLoading?"none":"0 4px 28px rgba(255,107,255,0.22)",transition:"all 0.2s"}}>
                      {checkoutLoading?"Setting up checkout...":"CONTINUE TO PAYMENT →"}
                    </button>
                    <div style={{fontSize:14,color:"var(--t-muted4)",fontFamily:"monospace"}}>
                      Paid plans start at $29/month · Secure checkout via Stripe
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}


        {/* STEP 2 — PLATFORM */}
        {step===2&&(
          <div style={{animation:"icc-slide 0.35s ease both",maxWidth:580,margin:"0 auto"}}>
            <div style={{marginBottom:40}}>
              <div style={{fontSize:14,fontWeight:900,letterSpacing:"0.18em",color:"#ff6bff",marginBottom:10}}>STEP 2 OF 4</div>
              <h2 style={{fontSize:34,fontWeight:900,color:"var(--t-text)",margin:"0 0 10px",lineHeight:1.1}}>Do you have a charting platform?</h2>
              <p style={{fontSize:16,color:"var(--t-muted3)",margin:0,fontWeight:500,lineHeight:1.55}}>OmniUSD reads screenshots from your charts. You'll need a platform that shows candlestick charts to use the app.</p>
            </div>

            {/* Platform cards */}
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:28}}>

              {/* TradingView */}
              <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:16,padding:"22px 24px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{width:36,height:36,borderRadius:10,background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.25)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📊</div>
                    <div>
                      <div style={{fontSize:16,fontWeight:900,color:"var(--t-text)"}}>TradingView</div>
                      <div style={{fontSize:13,color:"var(--t-muted4)"}}>Charts · Free & Pro plans</div>
                    </div>
                  </div>
                  <span style={{fontSize:11,fontWeight:900,padding:"3px 10px",borderRadius:20,background:"rgba(0,229,255,0.1)",border:"1px solid rgba(0,229,255,0.25)",color:"#00e5ff",letterSpacing:"0.08em",fontFamily:"'Space Mono',monospace"}}>RECOMMENDED</span>
                </div>
                <div style={{fontSize:13,color:"var(--t-muted3)",lineHeight:1.7,marginBottom:16}}>
                  The most widely used charting platform. Free plan works perfectly for OmniUSD — Daily, 4H, 1H, 30M, and 15M charts available on all instruments.
                </div>
                <a href="https://www.tradingview.com/OmniUSD?aff_id=164890" target="_blank" rel="noopener noreferrer"
                  style={{display:"block",width:"100%",padding:"11px 20px",borderRadius:9,background:"linear-gradient(135deg,#00e5ff,#0099bb)",color:"#1e1a35",fontSize:13,fontWeight:900,letterSpacing:"0.08em",fontFamily:"inherit",textDecoration:"none",textAlign:"center",cursor:"pointer",boxSizing:"border-box"}}>
                  GET TRADINGVIEW →
                </a>
              </div>

            </div>

            {/* Disclaimer */}
            <div style={{fontSize:11,color:"var(--t-muted4)",textAlign:"center",marginBottom:24,lineHeight:1.6,fontFamily:"'Space Mono',monospace"}}>
              These are affiliate links. OmniUSD earns a commission if you sign up — at no cost to you.
            </div>

            {/* Navigation */}
            <div style={{display:"flex",gap:10}}>
              {OB_BTN("← Back",()=>setStep(1),false,false)}
              <button onClick={()=>setStep(3)}
                style={{flex:2,background:"linear-gradient(135deg,#ff6bff,#7b2fff)",border:"none",color:"#fff",
                  padding:"17px 28px",borderRadius:13,fontSize:15,fontWeight:900,
                  letterSpacing:"0.1em",fontFamily:"inherit",cursor:"pointer",
                  boxShadow:"0 6px 40px rgba(255,107,255,0.28)",transition:"all 0.2s"}}>
                I ALREADY HAVE ONE — CONTINUE →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 — CONFIRM */}
        {step===3&&(
          <div style={{animation:"icc-slide 0.35s ease both",maxWidth:580,margin:"0 auto"}}>
            {!selectedTier&&(
              // Safety fallback — should never happen if flow is correct
              <div style={{textAlign:"center",padding:"40px 0"}}>
                <p style={{color:"#ff6b6b",fontSize:16,margin:"0 0 16px",fontWeight:600}}>No plan selected. Please go back and choose a plan first.</p>
                <button onClick={()=>setStep(2)} style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",color:"#ff6b6b",padding:"12px 24px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700}}>← Back</button>
              </div>
            )}
            <div style={{marginBottom:40}}>
              <div style={{fontSize:14,fontWeight:900,letterSpacing:"0.18em",color:"#ff6bff",marginBottom:10}}>STEP 3 OF 4</div>
              <h2 style={{fontSize:34,fontWeight:900,color:"var(--t-text)",margin:"0 0 10px",lineHeight:1.1}}>You're almost in.</h2>
              <p style={{fontSize:16,color:"var(--t-muted3)",margin:0,fontWeight:500,lineHeight:1.55}}>Set your timezone so OmniUSD always shows times in your local time.</p>
            </div>
            <div style={{background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,overflow:"hidden",marginBottom:20}}>
              {(()=>{
                const tier=TIER_CONFIG[selectedTier];
                if(!tier){
                  return(
                    <div style={{padding:"24px",textAlign:"center"}}>
                      <p style={{color:"#ff6b6b",fontSize:15,margin:"0 0 12px"}}>No plan selected. Please go back and choose a plan.</p>
                      <button onClick={()=>setStep(2)} style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",color:"#ff6b6b",padding:"10px 20px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700}}>← Back</button>
                    </div>
                  );
                }
                const sessLabels={NY:"New York Session",LONDON:"London Session",ASIAN:"Asia Session",ALL:"All Sessions"};
                const sessColors={NY:"#00e5ff",LONDON:"#ff6bff",ASIAN:"#ffd166",ALL:"#7fff6b"};
                const marketPills = tier.instruments.map(sym=>{
                  const inst = INSTRUMENTS.find(i=>i.id===sym);
                  return {label: inst ? `${inst.label} (${sym})` : sym, color: inst?.color||tier.color};
                });
                const rows = [
                  {label:"Plan",    val:tier.label,  sub:tier.price, color:tier.color, type:"text"},
                  {label:"Markets", pills:marketPills, color:tier.color, type:"pills"},

                ];
                return rows.map((row,i,arr)=>(
                  <div key={row.label} style={{
                    display:"flex",
                    alignItems:row.type==="pills"?"flex-start":"center",
                    justifyContent:"space-between",
                    padding:"18px 24px",
                    borderBottom:i<arr.length-1?"1px solid rgba(255,255,255,0.05)":"none",
                    gap:20}}>
                    {/* Label */}
                    <span style={{
                      fontSize:14,fontWeight:700,color:"var(--t-muted4)",
                      flexShrink:0,letterSpacing:"0.04em",
                      paddingTop:row.type==="pills"?3:0,
                      minWidth:64}}>
                      {row.label}
                    </span>
                    {/* Value */}
                    {row.type==="pills"?(
                      <div style={{display:"flex",flexWrap:"wrap",gap:4,justifyContent:"flex-end"}}>
                        {row.pills.map(p=>(
                          <span key={p.label} style={{
                            fontSize:14,fontWeight:700,
                            color:p.color,
                            background:`${p.color}12`,
                            border:`1px solid ${p.color}28`,
                            padding:"3px 8px",borderRadius:5,
                            whiteSpace:"nowrap",lineHeight:1.4}}>
                            {p.label}
                          </span>
                        ))}
                      </div>
                    ):(
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:16,fontWeight:900,color:row.color,lineHeight:1.2}}>{row.val}</div>
                        {row.sub&&<div style={{fontSize:14,color:"var(--t-muted4)",marginTop:3,fontWeight:500,letterSpacing:"0.02em"}}>{row.sub}</div>}
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
            {/* Timezone selector */}
            <div style={{padding:"12px 16px",background:"rgba(127,255,107,0.04)",border:"1px solid rgba(127,255,107,0.15)",borderLeft:"3px solid #7fff6b",borderRadius:0,marginBottom:16}}>
              <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.16em",color:"#7fff6b",marginBottom:8,fontFamily:"'Space Mono',monospace"}}>NY SESSION ONLY</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {[
                  {label:"Upload",    val:"30–60 min before NY open"},
                  {label:"Pre-scout", val:"7:00–8:30 AM CT"},
                  {label:"Execution", val:"8:30–10:30 AM CT"},
                  {label:"Cutoff",    val:"No new entries after 10:30 AM CT"},
                ].map(r=>(
                  <div key={r.label} style={{display:"flex",gap:8,alignItems:"baseline"}}>
                    <span style={{fontSize:9,fontWeight:700,color:"rgba(127,255,107,0.6)",fontFamily:"'Space Mono',monospace",minWidth:68,flexShrink:0}}>{r.label}</span>
                    <span style={{fontSize:12,color:"rgba(255,255,255,0.65)",fontFamily:"'Space Mono',monospace"}}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Timezone selector */}
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:14,fontWeight:700,color:"var(--t-muted3)",letterSpacing:"0.04em"}}>YOUR TIMEZONE</div>
                <button onClick={autoDetectTz}
                  style={{fontSize:14,fontWeight:700,color:"#00e5ff",background:"rgba(0,229,255,0.06)",
                    border:"1px solid rgba(0,229,255,0.18)",borderRadius:6,padding:"4px 12px",
                    cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.04em"}}>
                  {tzDetecting?"Detecting...":"⟳ Auto-detect"}
                </button>
              </div>
              {tzObj?(
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",
                  background:"rgba(0,229,255,0.08)",
                  border:"2px solid rgba(0,229,255,0.4)",
                  borderRadius:10,marginBottom:6,animation:"icc-slide 0.2s ease both"}}>
                  <span style={{fontSize:18}}>✓</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:900,color:"#00e5ff"}}>{tzObj.city}</div>
                    <div style={{fontSize:14,color:"rgba(0,229,255,0.7)",fontWeight:600,marginTop:2}}>{tzObj.label}</div>
                  </div>
                  <button onClick={()=>{setTzObj(null);setTzSearch("");}}
                    style={{fontSize:14,fontWeight:700,color:"var(--t-muted3)",background:"rgba(255,255,255,0.06)",
                      border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,padding:"4px 10px",
                      cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.04em"}}>
                    Change
                  </button>
                </div>
              ):(
                <div style={{position:"relative"}}>
                  <input
                    type="text"
                    placeholder="Search city or timezone..."
                    value={tzSearch}
                    onChange={e=>setTzSearch(e.target.value)}
                    style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",
                      borderRadius:10,padding:"11px 14px",fontSize:14,color:"var(--t-text)",
                      fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}
                  />
                  {tzSearch.length>1&&(
                    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,
                      background:"#1a0f2e",border:"1px solid rgba(255,255,255,0.1)",
                      borderRadius:10,marginTop:4,maxHeight:180,overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.5)"}}>
                      {TIMEZONES.filter(t=>
                        t.city.toLowerCase().includes(tzSearch.toLowerCase())||
                        t.label.toLowerCase().includes(tzSearch.toLowerCase())||
                        t.region.toLowerCase().includes(tzSearch.toLowerCase())
                      ).slice(0,8).map((t,idx)=>(
                        <button key={`${t.iana}-${idx}`}
                          onClick={e=>{e.stopPropagation();setTzObj(t);setTzSearch("");}}
                          style={{width:"100%",textAlign:"left",padding:"10px 14px",
                            background:"none",border:"none",cursor:"pointer",
                            fontFamily:"inherit",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
                          <div style={{fontSize:14,fontWeight:700,color:"var(--t-text)"}}>{t.city}</div>
                          <div style={{fontSize:14,color:"var(--t-muted4)"}}>{t.label}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{display:"flex",gap:10}}>
              {OB_BTN("← Back",()=>setStep(2),false,false)}
              <button onClick={()=>tzObj&&setStep(4)} disabled={!tzObj}
                style={{flex:2,
                  background:tzObj?"linear-gradient(135deg,#ff6bff,#7b2fff)":"rgba(255,255,255,0.06)",
                  border:tzObj?"none":"1px solid rgba(255,255,255,0.08)",
                  color:tzObj?"#fff":"var(--t-muted4)",
                  padding:"18px 28px",borderRadius:13,fontSize:16,fontWeight:900,
                  letterSpacing:"0.1em",fontFamily:"inherit",
                  cursor:tzObj?"pointer":"not-allowed",
                  boxShadow:tzObj?"0 6px 40px rgba(255,107,255,0.28)":"none",
                  transition:"all 0.2s"}}>
                {tzObj?"CONTINUE →":"Select your timezone to continue"}
              </button>
            </div>
          </div>
        )}

      </div>

      
        {/* STEP 4 — COMMIT */}
        {step===4&&(
          <div style={{animation:"icc-slide 0.35s ease both",maxWidth:520,margin:"0 auto"}}>
            <div style={{fontSize:14,fontWeight:900,letterSpacing:"0.2em",color:"#ff6bff",marginBottom:14}}>STEP 4 OF 4</div>
            <h2 style={{fontSize:34,fontWeight:900,color:"var(--t-text)",lineHeight:1.1,margin:"0 0 10px",letterSpacing:"-0.01em"}}>
              Before you begin.
            </h2>
            <p style={{fontSize:16,color:"var(--t-muted3)",margin:"0 0 32px",fontWeight:500,lineHeight:1.55}}>
              The edge is not in knowing the rules. It is in following them.
            </p>

            {/* Commitments */}
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:32}}>
              {[
                {n:"01", rule:"Upload before the session. Not during it.", detail:"Pre-market scouting opens at 7:00 AM CT. Upload your 5 charts before 8:30 AM CT so you have time to study the plan before execution begins."},
                {n:"02", rule:"8:30 to 10:30 AM CT. Nothing outside that.", detail:"OmniUSD is built for the NY session open — the highest conviction, highest volume window in the market. Outside this window, you wait."},
                {n:"03", rule:"A+ setups only. Pass on everything else.", detail:"You will see B-grade setups that look good. You will feel pressure to act. The system says PASS — you pass. Six A+ trades per month beats thirty B-grade trades every time."},
                {n:"04", rule:"30M close is the trigger. Wicks are noise.", detail:"Price touching a level is information. Price wicking through a level is information. Only a 30M candle closing beyond the level gives you permission to act."},
              ].map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:14,
                  padding:"16px 18px",
                  background:"rgba(255,255,255,0.03)",
                  border:"1px solid rgba(255,255,255,0.07)",
                  borderLeft:`3px solid rgba(255,107,255,0.4)`,
                  borderRadius:10}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:900,color:"rgba(255,107,255,0.5)",flexShrink:0,marginTop:1,minWidth:28}}>{item.n}</div>
                  <div>
                    <div style={{fontSize:14,fontWeight:900,color:"var(--t-text)",marginBottom:4,lineHeight:1.2}}>{item.rule}</div>
                    <div style={{fontSize:13,color:"var(--t-muted3)",lineHeight:1.6}}>{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:10,marginBottom:20}}>
              {OB_BTN("← Back",()=>setStep(3),false,false)}
              <button onClick={finish}
                style={{flex:2,background:"linear-gradient(135deg,#ff6bff,#7b2fff)",border:"none",
                  color:"#fff",padding:"18px 28px",borderRadius:13,fontSize:15,fontWeight:900,
                  letterSpacing:"0.12em",fontFamily:"inherit",cursor:"pointer",
                  boxShadow:"0 6px 40px rgba(255,107,255,0.28)",transition:"all 0.2s"}}>
                I ACCEPT THE PROCESS →
              </button>
            </div>

            {/* Disclaimer */}
            <p style={{fontSize:12,color:"rgba(255,255,255,0.45)",textAlign:"center",lineHeight:1.7,margin:0}}>
              OmniUSD is an execution framework, not financial advice. Trade at your own risk. By continuing you agree to our{" "}
              <a href="/terms" style={{color:"rgba(255,255,255,0.5)",textDecoration:"underline"}}>Terms of Service</a>{" "}and{" "}
              <a href="/privacy" style={{color:"rgba(255,255,255,0.5)",textDecoration:"underline"}}>Privacy Policy</a>.
            </p>
          </div>
        )}

    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// TRUST PANEL
// ═══════════════════════════════════════════════════════════════════════════
function TrustPanel({anime}){
  const [open,setOpen]=useState(false);
  const rules=[
    {icon:"📅",color:"#ff6bff",label:"Daily is the General",desc:"The Daily chart sets the overall trend bias. Every setup must go WITH this bias. A+ trades never fight the Daily."},
    {icon:"🔗",color:"#00e5ff",label:"3-Timeframe Alignment Required",desc:"Daily + 4H + 1H must all agree before a grade of A+ is possible. If even one timeframe disagrees, the grade drops — FULL ALIGN fires only when all three lock in."},
    {icon:"🕯️",color:"#7fff6b",label:"30M Close is the Trigger",desc:"A wick does nothing. A close does everything. Only a 30-minute candle closing above or below a key level counts as a valid trigger. No close = no trade."},
    {icon:"🔄",color:"#ffd166",label:"Break → Retest → Continuation",desc:"Step 1: 30M closes above the level. Note it, do not enter. Step 2: Price pulls back to the level. Normal — this is a discounted entry forming. Step 3: 30M closes in the break direction again after the retest. That is entry."},
    {icon:"⛔",color:"#ff9a3c",label:"Auto-Invalidation Conditions",desc:"Every plan includes a hard INVALIDATE IF condition. If price reclaims a key level on a 30M close before entry, the setup is dead. The engine detects this and marks it in the plan."},
    {icon:"📐",color:"#ff6b6b",label:"What This Engine Ignores",desc:"Fundamentals, news events, social sentiment, and pre-market spikes are not factors in this analysis. The engine reads chart structure and BRC methodology only — nothing else."},
  ];
  return(
    <div style={{marginBottom:24}}>
      {/* How it works — 3 steps, always visible */}
      <div style={{display:"flex",gap:0,marginBottom:12,background:"var(--t-c2)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,overflow:"hidden"}}>
        {[
          {n:"1",icon:"📸",title:"Upload 5 Charts",desc:"Daily · 4H · 1H · 30M · 15M — from your active broker only",color:"#ff6bff"},
          {n:"2",icon:"🧠",title:"Engine Reads All 5",desc:`Applies BRC rules across every timeframe and generates your structured plan`,color:"#00e5ff"},
          {n:"3",icon:"⚡",title:"Execute by the Rules",desc:"Follow the Live Tracker step by step — Tier 1, Tier 2, Retest, then limit order",color:"#7fff6b"},
        ].map((step,i)=>(
          <div key={i} style={{flex:1,padding:"16px 18px",borderRight:i<2?"1px solid rgba(255,255,255,0.05)":"none",display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:step.color+"14",border:`1px solid ${step.color}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:step.color,flexShrink:0}}>{step.n}</div>
            <div><div style={{fontSize:14,fontWeight:900,color:"var(--t-text)",marginBottom:3}}>{step.icon} {step.title}</div><div style={{fontSize:13,color:"var(--t-muted3)",lineHeight:1.6}}>{step.desc}</div></div>
          </div>
        ))}
      </div>

      {/* Methodology accordion */}
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:"100%",background:"var(--t-c2)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"11px 18px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",fontFamily:"inherit",marginBottom:open?8:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:14}}>🔎</span>
          <span style={{fontSize:13,letterSpacing:"0.16em",color:"var(--t-muted2)",fontWeight:900}}>HOW THIS ENGINE MAKES DECISIONS — 6 rules it applies to every chart</span>
        </div>
        <span style={{fontSize:13,color:"var(--t-muted3)"}}>{open?"▲ CLOSE":"▼ SEE THE RULES"}</span>
      </button>

      {open&&(
        <div style={{animation:"icc-slide 0.25s ease both",background:"var(--t-c1)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,overflow:"hidden"}}>
          {/* Engine identity */}
          <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"var(--t-c2)"}}>
            <p style={{fontSize:14,color:"var(--t-muted)",margin:0,lineHeight:1.75}}>
              This is a <strong style={{color:"var(--t-text)"}}>rules-based execution engine</strong> built on the BRC / Smart Money Concepts methodology.
              It reads chart structure across 5 timeframes and applies the same 6 rules on every single analysis — no exceptions, no overrides.
              The output is a structured trade plan, not a prediction. <strong style={{color:"var(--t-text)"}}>You are still responsible for your own execution and risk management.</strong>
            </p>
          </div>
          {/* 6 rules */}
          <div style={{display:"flex",flexDirection:"column"}}>
            {rules.map((r,i)=>(
              <div key={i} style={{display:"flex",gap:16,padding:"14px 20px",borderBottom:i<rules.length-1?"1px solid rgba(255,255,255,0.04)":"none",alignItems:"flex-start"}}>
                <div style={{width:32,height:32,borderRadius:8,background:r.color+"10",border:`1px solid ${r.color}28`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>{r.icon}</div>
                <div>
                  <div style={{fontSize:14,fontWeight:900,color:"#c8bcd8",marginBottom:4,letterSpacing:"0.04em"}}>{r.label}</div>
                  <p style={{fontSize:14,color:"#6858a0",margin:0,lineHeight:1.7}}>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {/* What grade means */}
          <div style={{padding:"14px 20px",borderTop:"1px solid rgba(255,255,255,0.05)",background:"var(--t-c2)"}}>
            <div style={{fontSize:13,letterSpacing:"0.16em",color:"var(--t-muted3)",fontWeight:900,marginBottom:10}}>WHAT THE GRADE MEANS</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[{g:"A+",c:"#7fff6b",d:"All 3 TF aligned. Full BRC sequence. Execute."},{g:"A",c:"#7fff6b",d:"Strong setup, minor hesitation on one TF."},{g:"B",c:"#ffd166",d:"Setup forming. Wait for more confirmation."},{g:"C",c:"#ff9a3c",d:"Weak structure. Reduce size or skip."},{g:"SKIP",c:"#ff6b6b",d:"No valid setup. Skip this session."}].map(item=>(
                <div key={item.g} style={{display:"flex",gap:8,alignItems:"flex-start",flex:"1 1 180px",background:"var(--t-c2)",border:`1px solid ${item.c}18`,borderLeft:`3px solid ${item.c}`,borderRadius:8,padding:"8px 12px"}}>
                  <span style={{fontSize:14,fontWeight:900,color:item.c,minWidth:28}}>{item.g}</span>
                  <span style={{fontSize:14,color:"var(--t-muted2)",lineHeight:1.5}}>{item.d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOADING SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function LoadingScreen({T=DARK}){
  const STAGES=[
    "Reading Daily structure",
    "Confirming 4H alignment",
    "Mapping 1H execution context",
    "Checking 30M trigger zone",
    "Refining 15M entry logic",
    "Building session plan",
  ];
  const [stageIdx,setStageIdx]=useState(0);
  const [fade,setFade]=useState(true);

  useEffect(()=>{
    const id=setInterval(()=>{
      setFade(false);
      setTimeout(()=>{
        setStageIdx(i=>(i+1)%STAGES.length);
        setFade(true);
      },300);
    },2200);
    return()=>clearInterval(id);
  },[]);

  return(
    <div style={{...S.loadingScreen,background:T.bg,gap:28}}>
      <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center",width:72,height:72}}>
        <div style={{position:"absolute",inset:0,borderRadius:"50%",border:"1.5px solid rgba(255,107,255,0.15)",animation:"icc-pulse 2s ease infinite"}}/>
        <div style={{position:"absolute",inset:6,borderRadius:"50%",border:"1.5px solid rgba(255,107,255,0.25)",animation:"icc-pulse 2s ease 0.3s infinite"}}/>
        <span style={{fontSize:28,color:"#ff6bff",animation:"icc-pulse 1.8s ease infinite"}}>◈</span>
      </div>
      <div style={{textAlign:"center"}}>
        <p style={{fontSize:16,fontWeight:900,letterSpacing:"0.18em",color:"var(--t-text)",margin:"0 0 10px"}}>ANALYZING CHARTS</p>
        <p style={{
          fontSize:14,color:"#00e5ff",margin:0,fontWeight:600,
          transition:"opacity 0.3s ease",
          opacity:fade?1:0,
          letterSpacing:"0.04em"
        }}>
          {STAGES[stageIdx]}
        </p>
      </div>
      <div style={{display:"flex",gap:10,alignItems:"center"}}>
        {TF_SLOTS.map((slot,i)=>(
          <div key={slot.key} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
            <div style={{
              width:8,height:8,borderRadius:"50%",
              background:slot.color,
              animation:`icc-pulse ${0.8+i*0.2}s ease ${i*0.15}s infinite`
            }}/>
            <span style={{fontSize:13,fontWeight:900,color:slot.color,letterSpacing:"0.08em",opacity:0.8}}>{slot.short}</span>
          </div>
        ))}
      </div>
      <p style={{fontSize:14,color:"var(--t-muted4)",margin:0,letterSpacing:"0.06em"}}>This takes about 10–20 seconds</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CHESS BOARD ANALYZING ANIMATION
// ═══════════════════════════════════════════════════════════════════════════
function ChessBoardAnalyzing({ instrument, onBack }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const t0Ref     = useRef(null);
  const statusRef = useRef(null);
  const dotsRef   = useRef(null);

  const STEPS = [
    { start:0.0,  text:'COMPRESSING CHARTS...' },
    { start:1.4,  text:'READING DAILY STRUCTURE...' },
    { start:2.6,  text:'CHECKING 4H ALIGNMENT...' },
    { start:3.8,  text:'SCANNING 1H FOR SETUP...' },
    { start:5.0,  text:'IDENTIFYING BRC PHASE...' },
    { start:6.2,  text:'VALIDATING ENTRY MATH...' },
    { start:7.4,  text:'GRADING YOUR SETUP...' },
    { start:8.4,  text:'THE BOARD IS SET.' },
  ];
  const LOOP = 10.5;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const DEG = Math.PI / 180;

    // Board
    const TW=40, TH=20, EXT=9, N=6;
    const OX=W/2, OY=H*0.56;

    // Logo
    const LCX=W/2, LCY=H*0.18;
    const RO=46, RM=38, RI=30;
    const AO=[-40*DEG, 220*DEG];
    const AM=[-52.5*DEG, 232.5*DEG];
    const AI=[-65*DEG, 245*DEG];
    const DL=[-12.4,-26.5], DR=[12.4,-26.5];
    const DIAM=[[0,-8.3],[6.2,0],[0,8.3],[-6.2,0]];
    const CHEV=[[-3.6,-11.8],[0,-16.3],[3.6,-11.8]];

    // Build diagonal tile order
    const tiles = [];
    for (let d=0; d<N*2-1; d++)
      for (let c=0; c<N; c++) { const r=d-c; if(r>=0&&r<N) tiles.push([c,r,d]); }

    function toIso(c,r){ return [OX+(c-r)*TW/2, OY+(c+r)*TH/2]; }
    function easeOut(t){ return 1-Math.pow(1-t,3); }
    function clamp(v){ return Math.max(0,Math.min(1,v)); }
    function sub(t,s,e){ return clamp((t-s)/(e-s)); }

    function drawTile(c,r,p,light) {
      if(p<=0)return;
      const [x,y]=toIso(c,r);
      const Y=y-(1-p)*60;
      ctx.globalAlpha=Math.min(p*1.8,1);
      const tc=light?'rgba(136,68,238,0.28)':'rgba(18,10,32,0.98)';
      const lc=light?'rgba(90,40,160,0.35)':'rgba(10,5,18,0.98)';
      const rc=light?'rgba(110,55,200,0.3)':'rgba(14,7,24,0.98)';
      ctx.beginPath();
      ctx.moveTo(x,Y); ctx.lineTo(x+TW/2,Y+TH/2); ctx.lineTo(x,Y+TH); ctx.lineTo(x-TW/2,Y+TH/2);
      ctx.closePath(); ctx.fillStyle=tc; ctx.fill();
      ctx.strokeStyle='rgba(204,68,255,0.13)'; ctx.lineWidth=0.6; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x-TW/2,Y+TH/2); ctx.lineTo(x,Y+TH); ctx.lineTo(x,Y+TH+EXT); ctx.lineTo(x-TW/2,Y+TH/2+EXT);
      ctx.closePath(); ctx.fillStyle=lc; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x+TW/2,Y+TH/2); ctx.lineTo(x,Y+TH); ctx.lineTo(x,Y+TH+EXT); ctx.lineTo(x+TW/2,Y+TH/2+EXT);
      ctx.closePath(); ctx.fillStyle=rc; ctx.fill();
      ctx.globalAlpha=1;
    }

    function drawBeam(p) {
      if(p<=0)return;
      const [bx,by]=toIso(2.5,2.5);
      const startY=LCY+RO+2, endY=by+TH/2;
      const g=ctx.createLinearGradient(LCX,startY,bx,endY);
      g.addColorStop(0,'rgba(204,68,255,0.4)');
      g.addColorStop(0.6,'rgba(136,68,238,0.15)');
      g.addColorStop(1,'rgba(0,204,255,0.01)');
      ctx.globalAlpha=p*0.55;
      ctx.beginPath(); ctx.moveTo(LCX,startY); ctx.lineTo(bx,endY);
      ctx.strokeStyle=g; ctx.lineWidth=1.5; ctx.stroke();
      ctx.globalAlpha=1;
    }

    function drawLogo(p, pulse) {
      if(p<=0)return;
      const cx=LCX, cy=LCY;
      ctx.lineCap='round';
      const p1=easeOut(sub(p,0,.40));
      const p2=easeOut(sub(p,.15,.55));
      const p3=easeOut(sub(p,.30,.70));
      const p4=easeOut(sub(p,.60,.78));
      const p5=easeOut(sub(p,.70,.90));
      const p6=easeOut(sub(p,.85,1.0));
      const glo=pulse*0.25;
      if(p1>0){ const sw=(AO[1]-AO[0])*p1; ctx.beginPath(); ctx.arc(cx,cy,RO,AO[0],AO[0]+sw); ctx.strokeStyle=`rgba(204,68,255,${0.78+glo})`; ctx.lineWidth=3; ctx.stroke(); }
      if(p2>0){ const sw=(AM[1]-AM[0])*p2; ctx.beginPath(); ctx.arc(cx,cy,RM,AM[0],AM[0]+sw); ctx.strokeStyle=`rgba(136,68,238,${0.84+glo})`; ctx.lineWidth=2.2; ctx.stroke(); }
      if(p3>0){ const sw=(AI[1]-AI[0])*p3; ctx.beginPath(); ctx.arc(cx,cy,RI,AI[0],AI[0]+sw); ctx.strokeStyle=`rgba(0,204,255,${0.9+glo})`; ctx.lineWidth=1.6; ctx.stroke(); }
      if(p4>0){ ctx.globalAlpha=p4*0.88; ctx.fillStyle='#00ccff'; [DL,DR].forEach(d=>{ ctx.beginPath(); ctx.arc(cx+d[0],cy+d[1],1.8,0,Math.PI*2); ctx.fill(); }); ctx.globalAlpha=1; }
      if(p5>0){
        ctx.globalAlpha=p5*0.93;
        const g=ctx.createLinearGradient(cx-6,cy-9,cx+6,cy+9);
        g.addColorStop(0,'#cc44ff'); g.addColorStop(1,'#00ccff');
        ctx.beginPath(); ctx.moveTo(cx+DIAM[0][0],cy+DIAM[0][1]); ctx.lineTo(cx+DIAM[1][0],cy+DIAM[1][1]); ctx.lineTo(cx+DIAM[2][0],cy+DIAM[2][1]); ctx.lineTo(cx+DIAM[3][0],cy+DIAM[3][1]); ctx.closePath();
        ctx.fillStyle=g; ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=0.7; ctx.stroke();
        ctx.globalAlpha=1;
      }
      if(p6>0){
        ctx.globalAlpha=p6*0.85;
        ctx.beginPath(); ctx.moveTo(cx+CHEV[0][0],cy+CHEV[0][1]); ctx.lineTo(cx+CHEV[1][0],cy+CHEV[1][1]); ctx.lineTo(cx+CHEV[2][0],cy+CHEV[2][1]);
        ctx.strokeStyle='#cc44ff'; ctx.lineWidth=1.3; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx,cy,1.6,0,Math.PI*2); ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=0.6; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx,cy,0.9,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,0.65)'; ctx.fill();
        ctx.globalAlpha=1;
      }
    }

    function drawBoardGlow(p) {
      if(p<=0)return;
      const [tx,ty]=toIso(0,0),[rx,ry]=toIso(N-1,0),[bx,by]=toIso(N-1,N-1),[lx,ly]=toIso(0,N-1);
      ctx.globalAlpha=p*0.3;
      ctx.beginPath(); ctx.moveTo(tx,ty); ctx.lineTo(rx+TW/2,ry+TH/2); ctx.lineTo(bx,by+TH); ctx.lineTo(lx-TW/2,ly+TH/2); ctx.closePath();
      ctx.strokeStyle='#cc44ff'; ctx.lineWidth=0.8; ctx.stroke();
      ctx.globalAlpha=1;
    }

    function frame(ts) {
      if(!t0Ref.current) t0Ref.current=ts;
      const t=((ts-t0Ref.current)/1000)%LOOP;
      ctx.fillStyle='#1e1a35'; ctx.fillRect(0,0,W,H);
      for(const [c,r,d] of tiles){ const p=easeOut(clamp((t-d*0.19)/0.38)); drawTile(c,r,p,(c+r)%2===0); }
      drawBoardGlow(clamp((t-2.2)/0.6));
      if(t>2.8){ const lp=easeOut(clamp((t-2.8)/5.6)); const pulse=t>8.8?(Math.sin((t-8.8)*Math.PI*1.4)*0.5+0.5):0; drawBeam(lp); drawLogo(lp,pulse); }
      // Update status text via DOM (keeps text off the canvas so it never overlaps the board)
      const statusEl = statusRef.current;
      const dotsEl   = dotsRef.current;
      if (!statusEl || !dotsEl) { rafRef.current=requestAnimationFrame(frame); return; }
      let cur=STEPS[0];
      for(let i=0;i<STEPS.length;i++){ if(t>=STEPS[i].start) cur=STEPS[i]; }
      const isFinal=cur===STEPS[STEPS.length-1];
      const blink=Math.floor(t*2)%2===0;
      statusEl.textContent = isFinal ? cur.text : cur.text+(blink?' ▮':'  ');
      statusEl.style.color = isFinal ? '#f0ecff' : '#8878aa';
      const idx=STEPS.indexOf(cur);
      Array.from(dotsEl.children).forEach((dot,i)=>{
        dot.style.background = i<=idx ? '#cc44ff' : 'rgba(255,255,255,0.12)';
      });
      rafRef.current=requestAnimationFrame(frame);
    }
    rafRef.current=requestAnimationFrame(frame);
    return()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  },[]);

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',flex:1,padding:'16px 0 8px'}}>
      <canvas ref={canvasRef} width={420} height={300}
        style={{borderRadius:14,maxWidth:'100%',display:'block'}}/>
      {/* Status text — lives BELOW canvas, never overlaps the board */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,marginTop:14}}>
        <div ref={dotsRef} style={{display:'flex',gap:10}}>
          {STEPS.map((_,i)=>(
            <div key={i} style={{width:4,height:4,borderRadius:'50%',background:'rgba(255,255,255,0.12)',transition:'background 0.2s'}}/>
          ))}
        </div>
        <div ref={statusRef} style={{fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,letterSpacing:'0.14em',color:'#8878aa',minHeight:16,transition:'color 0.2s'}}/>
      </div>
      <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.2)',marginTop:10,letterSpacing:'0.06em'}}>
        Do not close this tab — analysis in progress
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOME PAGE
// ═══════════════════════════════════════════════════════════════════════════
function HomePage({planResult,setPlanResult,anime,T=DARK,onJournalEntry}){
  // Unified flow — delegates entirely to UnifiedDashboard
  return <UnifiedDashboard profile={anime} onJournalEntry={onJournalEntry}/>;
}

// ─── Session states ──────────────────────────────────────────────────────────
const SESSION_STATES = {
  WATCHING:        { label: "WATCHING",          color: "#00e5ff", dot: true  },
  BREAK_CONFIRMED: { label: "BREAK CONFIRMED",   color: "#ffd166", dot: true  },
  RETEST_FORMING:  { label: "RETEST FORMING",    color: "#ff9a3c", dot: true  },
  READY_FOR_LIMIT: { label: "READY FOR LIMIT",   color: "#7fff6b", dot: true  },
  WINDOW_CLOSED:   { label: "WINDOW CLOSED",     color: "#ff6b6b", dot: false },
  INVALIDATED:     { label: "INVALIDATED",       color: "#ff6b6b", dot: false },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getCTTime() {
  // Internal calculations still use CT/ET — but display uses user's timezone
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const userTZ = getUserTZ();
  const userNow = new Date();
  return {
    now,
    // str shows time in USER's selected timezone, not hardcoded CT
    str: userNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: userTZ }),
    mins: now.getHours() * 60 + now.getMinutes(), // CT mins for session window logic
    isFriday: now.getDay() === 5,
    dayName: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][now.getDay()],
    dateStr: `${["January","February","March","April","May","June","July","August","September","October","November","December"][now.getMonth()]} ${now.getDate()} ${now.getFullYear()}`,
  };
}

function getMarketStatus(instrument, session = "NY") {
  if (!instrument) return { open: false, state: "no_instrument", reason: "Select an instrument first.", comeback: "" };

  // All timing in CT (Chicago Time) — master clock for OmniUSD
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const day = now.getDay();
  const mins = now.getHours() * 60 + now.getMinutes();
  const isBTC = instrument === "BTCUSD";
  const isXAU = instrument === "XAUUSD";
  const londonEligible = isBTC || isXAU;

  // ── WEEKEND ────────────────────────────────────────────────────────────
  if (day === 6) {
    return { open: false, state: "closed", reason: "Markets are closed on Saturday.", comeback: "Next NY session: Monday at 8:30 AM CT." };
  }
  if (day === 0 && mins < 7 * 60) {
    return { open: false, state: "closed", reason: "Markets are closed.", comeback: "Next NY session: Monday at 8:30 AM CT." };
  }

  // ── LONDON OPEN — BTCUSD + XAUUSD ONLY (2:00–4:00 AM CT) ─────────────
  if (mins >= 2 * 60 && mins < 4 * 60) {
    if (londonEligible) {
      return {
        open: true, state: "london",
        reason: "LONDON OPEN — REDUCED CONVICTION",
        comeback: instrument + " analysis allowed. Max grade B+. Reduce size.",
        maxGrade: "B",
        label: "LONDON OPEN",
        color: "#00e5ff",
      };
    }
    return {
      open: false, state: "wrong_session",
      reason: instrument + " is NY session only.",
      comeback: "OmniUSD is built for NY session execution. The window opens at 8:30 AM CT. Come back then with fresh charts for A+ analysis.",
    };
  }

  // ── BEFORE 7:00 AM CT — fully closed ──────────────────────────────────
  if (mins < 7 * 60) {
    const minsLeft = 7 * 60 - mins;
    const h = Math.floor(minsLeft / 60), m = minsLeft % 60;
    return {
      open: false, state: "closed",
      reason: "Market closed — NY opens in " + (h > 0 ? h + "h " + m + "m" : m + "m"),
      comeback: "Pre-market scouting available from 7:00 AM CT.",
    };
  }

  // ── PRE-MARKET SCOUT (7:00–8:30 AM CT) ────────────────────────────────
  if (mins >= 7 * 60 && mins < 8 * 60 + 30) {
    const minsLeft = (8 * 60 + 30) - mins;
    const h = Math.floor(minsLeft / 60), m = minsLeft % 60;
    return {
      open: true, state: "prep",
      reason: "PRE-MARKET SCOUT",
      comeback: "NY execution window opens in " + (h > 0 ? h + "h " + m + "m" : m + "m") + ". Upload now and study your plan.",
      minsUntilOpen: minsLeft,
      label: "PRE-MARKET SCOUT",
      color: "#ffd166",
    };
  }

  // ── NY SESSION OPEN (8:30–10:30 AM CT) ────────────────────────────────
  if (mins >= 8 * 60 + 30 && mins <= 10 * 60 + 30) {
    return {
      open: true, state: "live",
      reason: "NY SESSION OPEN — EXECUTION WINDOW",
      comeback: "Full analysis available. A+ setups executable.",
      label: "NY SESSION OPEN",
      color: "#7fff6b",
    };
  }

  // ── WINDOW CLOSED (after 10:30 AM CT) ─────────────────────────────────
  return {
    open: false, state: "closed",
    reason: "WINDOW CLOSED",
    comeback: "NY session closed. Next window opens tomorrow at 8:30 AM CT. Rest up.",
  };
}

function getNextClose() {
  const now = new Date();
  const ctNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const m = ctNow.getMinutes();
  const minsToNext = m < 30 ? 30 - m : 60 - m;
  const nextUTC = new Date(now.getTime() + minsToNext * 60000);
  // Show in user's selected timezone
  const userTZ = getUserTZ();
  const tzShort = new Intl.DateTimeFormat("en-US", { timeZoneName:"short", timeZone: userTZ, hour:"numeric" }).format(nextUTC).split(" ").pop();
  const timeStr = new Intl.DateTimeFormat("en-US", { hour:"2-digit", minute:"2-digit", hour12:true, timeZone: userTZ }).format(nextUTC);
  return `${timeStr} ${tzShort}`;
}

function getAnalysisPrompt(instrument, session = "NY") {
  const ct = getCTTime();
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const day = now.getDay();
  const nowMins = ct.mins;
  const isBTC = instrument === "BTCUSD";
  const sessCfg = SESSION_CONFIG[session] || SESSION_CONFIG.NY;
  const fit = SESSION_INSTRUMENT_FIT[instrument]?.[session] || "ok";
  const advisory = SESSION_ADVISORIES[instrument]?.[session] || null;

  // Session context
  let sessionContext = "";
  let sessionWarning = "";

  if (day === 6) {
    sessionContext = "TODAY IS SATURDAY. Traditional markets are CLOSED. No NY session today. No London session today.";
    if (isBTC) {
      sessionContext += " BTCUSD trades 24/7 — next BRC execution window is Asian session (Sunday ~8:00 PM CT) or NY session (Monday ~8:30 AM CT).";
      sessionWarning = "Do NOT frame as NY session setup. Grade structure only. Note the correct next window.";
    }
  } else if (day === 0 && nowMins < 14 * 60) {
    sessionContext = "TODAY IS SUNDAY. Markets not yet open. Asian session opens ~8:00 PM CT.";
    if (isBTC) sessionWarning = "Do NOT frame as NY session. Next window: Asian session tonight or NY Monday.";
  } else if (day === 0 && nowMins >= 14 * 60) {
    sessionContext = "TODAY IS SUNDAY. Asian session prep window — opens ~8:00 PM CT. NY session is Monday.";
  } else {
    sessionContext = nowMins < 8*60+30 ? "PRE-MARKET — NY session not yet open"
      : nowMins <= 10*60+30 ? "NY SESSION LIVE (8:30–10:30 AM CT)"
      : "NY SESSION CLOSED for today";
  }

  const fridayNote = ct.isFriday ? " FRIDAY — end of week. Extra caution. A PASS protects the week." : "";

  return `You are an institutional-grade BRC (Break-Retest-Continuation) trade analyst. You think in three timeframes simultaneously:

DAILY = The General (controls overall bias — NEVER trade against it)
4H = The Lieutenant (confirms the trend direction)
1H = The Scout (shows the immediate setup forming)
30M = The Trigger (the ONLY candle that gives entry permission)

CURRENT CONTEXT:
Today: ${ct.dayName} ${ct.dateStr}
Current Time (CT): ${ct.str} CT | User Local: ${etToUserTime(now.getHours(), now.getMinutes(), true)}
User Timezone: ${getUserTZ()}
Instrument: ${instrument}
Selected Session: ${sessCfg.label} (${sessCfg.hours})
Window Status: ${sessionContext}${fridayNote}
Session Candle Windows: ${sessCfg.candles.map(c => c.label || c).join(" → ")} — Hard cutoff: ${sessCfg.cutoff}
Minutes Until Next 30M Close: ${(() => { const m = now.getMinutes(); return m < 30 ? 30 - m : 60 - m; })()} minutes
Next 30M Candle Close (CT): ${getNextClose()}
${advisory ? `⚠️ SESSION ADVISORY: ${advisory}` : `✅ ${instrument} suits the ${sessCfg.label} session.`}
${sessionWarning ? `⚠️ WARNING: ${sessionWarning}` : ""}

WINDOW RULES — APPLY AUTOMATICALLY:
- Window Status = "NY SESSION LIVE" → Full A+ execution analysis allowed
- Window Status = "PRE-MARKET" → SOFT PASS only. Output conditional triggers, not executable plan.
- Window Status = "NY SESSION CLOSED" → Grade = PASS. Scout mode only. Note levels for next session.
- Window Status = "SATURDAY" or "SUNDAY" → Grade = PASS. No entries.
- NEVER output A+ grade when window is closed or it is pre-market.
- Always reference CT time for candles. Always show user's local time in brackets.
- Always tell user exactly how many minutes until next 30M close.

═══════════════════════════════════════
CORE RULES — NEVER VIOLATE THESE
═══════════════════════════════════════

RULE 1 — THE ALIGNMENT GATE (HIGHEST PRIORITY — CHECK FIRST)
Before anything else, run this gate in order. Do NOT skip steps.

STEP 1 — DAILY (THE GENERAL):
Read the Daily chart structure.
Bullish = clear HH + HL pattern.
Bearish = clear LH + LL pattern.
Mixed/unclear = SOFT PASS immediately. Stop here.

STEP 2 — 4H (THE LIEUTENANT):
Must AGREE with Daily direction.
4H mixed or opposite Daily = SOFT PASS immediately. Stop here.
Do NOT proceed to A+ if 4H conflicts.

STEP 3 — 1H (THE SOLDIER):
Must AGREE with Daily + 4H direction.
1H conflicts = SOFT PASS immediately. Stop here.
❌ NEVER: A+ when 1H = Bearish and trade is LONG
❌ NEVER: A+ when 1H = Bullish and trade is SHORT
❌ NEVER: Use 15M or 30M to override a conflicting 4H or 1H

STEP 4 — Only if ALL 3 agree (3/3 FULL ALIGNMENT):
Check 30M for entry trigger.
Check 15M for early warning.
Now you may consider A+.

WHAT MUST NEVER HAPPEN:
❌ A+ when 4H = Mixed or opposite Daily
❌ A+ when 1H disagrees with Daily + 4H
❌ A+ when session window is CLOSED
❌ Using 15M or 30M to justify overriding higher TF conflicts

RULE 2 — THE 30M CLOSE IS THE ONLY ENTRY TRIGGER
Price touching a level = information, not permission.
Price wicking through a level = information, not permission.
Only a 30M candle CLOSING beyond a level = permission to act.

RULE 3 — CURRENT PRICE AWARENESS (CRITICAL)
Before building any plan, check where current price is relative to the trigger level:
IF current price has already passed the trigger by more than 0.5% = the Break phase is DONE. Identify the actual current phase (Retest or Continuation).
IF current price is sitting AT or NEAR a key level = we may be in the Retest phase right now.
NEVER assign a Break trigger at a level price already left behind hours ago. That is a stale level.

RULE 4 — DIRECTIONAL MATH IS NON-NEGOTIABLE
For SHORT trades: Entry > TP1 > TP2 > Runner (all descending)
For LONG trades: Entry < TP1 < TP2 < Runner (all ascending)
If any TP is on the wrong side of entry = reject and recalculate.
This must be validated before outputting any plan.

RULE 5 — WITH-TREND ONLY
Daily says bull = LONG setups only.
Daily says bear = SHORT setups only.
Counter-trend setups = automatic PASS regardless of lower TF.

RULE 6 — SESSION RESTRICTION — NON-NEGOTIABLE
OmniUSD is a NEW YORK SESSION product. This is permanent and non-negotiable.

PRIMARY EXECUTION WINDOW: NY Session ONLY — 8:30–10:30 AM CT. Hard cutoff 10:30 AM CT.
PRE-MARKET SCOUT: 7:00–8:30 AM CT — analysis allowed, SCOUT grade only, no executable plan.
LONDON EXCEPTION: BTCUSD and XAUUSD ONLY may be analyzed during London open (2:00–4:00 AM CT). Maximum grade B+. Always add size warning: "LONDON OPEN — Lower conviction than NY session. Reduce size."

OUTSIDE NY WINDOW (all other instruments, all other times):
- grade = "PASS"
- pass_reason = "OmniUSD is built for NY session execution. The window opens at 8:30 AM CT. Come back then with fresh charts for A+ analysis. Pre-market scouting available from 7:00 AM CT."
- Never show executable A+ plan outside NY window
- Show watchlist levels only

Current window: ${sessionContext}${fridayNote}

RULE 7 — WEEKEND HARD BLOCK
If today is Saturday OR Sunday before 8:00 PM ET → grade="PASS" regardless of structure. Weekend volume is thin and unreliable.

RULE 8 — FRIDAY CAUTION
${ct.isFriday ? "TODAY IS FRIDAY — end of week. Apply extra caution. A PASS protects the week. Only A+ if structure is crystal clear." : "Apply standard grading rules."}

TRIGGER LEVEL PRECISION — NON-NEGOTIABLE:
The trigger_level MUST be the exact structural break price visible on the chart. Do NOT round to nearest 50 or 100. If the break happened at 3,847 — trigger is 3,847, not 3,850.

═══════════════════════════════════════
BRC PHASE IDENTIFICATION
═══════════════════════════════════════

PRE-BREAK: Price has not yet broken the key level. No entry. Set alert.

RETEST_COOKING: Price broke the level AND is now pulling back to test it.
Daily + 4H agree but 1H is temporarily counter-trend. This is healthy. WATCH.

CONTINUATION: Price broke, retested, and a 30M candle closed back in the break direction.
THIS is the A+ entry phase — but ONLY if 3/3 alignment confirmed above.

EXPIRED: Price broke, ran the full target, no retest occurred. PASS — do not chase.

═══════════════════════════════════════
3TF ANALYSIS PROTOCOL
═══════════════════════════════════════

DAILY: Primary structure (HH/HL = bull, LH/LL = bear). Key daily level. Bias.
4H: Confirm or contradict Daily. Swing sequence. Bias.
1H: Confirm Daily + 4H. Showing retest or continuation. Bias.

ALIGNMENT RESULT:
3/3 = A+ POSSIBLE (still needs BRC sequence + R:R)
2/3 = SOFT PASS only — output conditional triggers, no execution
1/3 or 0/3 = HARD PASS — no triggers, no plan

═══════════════════════════════════════
GRADING — STRICT
═══════════════════════════════════════

🟢 A+ EXECUTE (85-100%):
ALL of these must be true — no exceptions:
✅ Daily + 4H + 1H = 3/3 FULL ALIGNMENT same direction
✅ Clear BRC sequence (Break → Retest → Continuation)
✅ Price in Retest or Continuation phase RIGHT NOW
✅ Clean 30M trigger level identified (exact price, not rounded)
✅ R:R minimum 1.5:1
✅ Session window is currently OPEN

🟡 SOFT PASS — 2/3 alignment OR pre-market uncertainty:
Output TWO conditional trigger levels — one bullish, one bearish.
For each: exact 30M close price, what trade activates, stop, TP1.
Add: "Re-upload charts at next session open for execution grade."
This is NOT executable. This is preparation only.

🔴 HARD PASS:
1/3 or 0/3 TF aligned. Counter-trend. No man's land. Post-news chaos. Weekend.
State exactly what needs to change. No triggers. No plan.
"No trades today — protect the account."



TRIGGER: The 30M close price confirming Continuation. NOT the break level itself.
ENTRY: Limit order INSIDE the retest zone — not at the trigger.
STOP: Beyond the structure that invalidates the setup. NEVER inside the retest zone.

TP VALIDATION — run before outputting:
SHORT: TP1 < entry. TP2 < TP1. Runner < TP2. Recalculate if any fail.
LONG: TP1 > entry. TP2 > TP1. Runner > TP2. Recalculate if any fail.

TP1: Next clean swing level in trend direction. Min 1.5:1 R:R.
TP2: Next major structural level beyond TP1.
Runner: Only if momentum clearly accelerating past TP2.

what_still_needed: For ANY non-A+ grade, list 2-4 specific conditions needed for upgrade with exact prices and session timing. If A+, return [].

═══════════════════════════════════════
SPECIAL CONDITIONS
═══════════════════════════════════════

NEWS SPIKE: If most recent Daily candle range > 3x average of prior 5 candles = cap at PASS. "Post-event — wait 1-2 sessions."
CHOPPY: Price not near any defined level = PASS with levels to watch.
POST-CRASH BOUNCE: Bounce after crash = possible retest short, NOT a reversal long until Daily flips bullish.

Return ONLY this JSON — no markdown, no explanation, no preamble:
{
  "grade": "A+|A|B|C|PASS|SOFT PASS",
  "bias": "SHORT|LONG|NEUTRAL",
  "confidence": "HIGH|MEDIUM|LOW",
  "confidence_score": 0,
  "summary": "2-3 sentences plain English for a 16-year-old. What the charts show, current phase, which session this targets.",
  "market_structure": "HH/HL or LH/LL with key price levels",
  "brc_phase": "PRE-BREAK|RETEST_COOKING|CONTINUATION|EXPIRED",
  "trigger_level": "exact price only",
  "retest_zone": "price zone e.g. 2,650-2,680",
  "stop_loss": "exact price only",
  "tp1": "exact price only — REQUIRED",
  "tp2": "exact price only — REQUIRED. Next structural level beyond TP1. Never leave blank.",
  "runner": "exact price only — REQUIRED. Extended target if momentum continues. Never leave blank.",
  "alert_levels": ["price 1", "price 2"],
  "key_levels": ["support: price — method", "resistance: price — method", "critical: price"],
  "current_phase": "PRE-BREAK|RETEST_COOKING|CONTINUATION|EXPIRED",
  "confidence_reason": "multi-timeframe logic explaining the score",
  "session_note": "which session this targets and why",
  "friday_note": "Friday caution note if applicable, empty string otherwise",
  "pass_reason": "if hard PASS — exactly why. Empty string otherwise.",
  "soft_pass_scenarios": {
    "bull": {
      "trigger": "exact price — 30M close above this = LONG setup activates",
      "plan": "brief description of the long trade plan if triggered",
      "stop": "exact stop price for the long",
      "tp1": "exact TP1 for the long"
    },
    "bear": {
      "trigger": "exact price — 30M close below this = SHORT setup activates",
      "plan": "brief description of the short trade plan if triggered",
      "stop": "exact stop price for the short",
      "tp1": "exact TP1 for the short"
    }
  },
  "what_still_needed": ["condition 1 with price", "condition 2", "condition 3"],
  "plain_english": {
    "structure": "what the market is doing in plain English",
    "brc_phase": "which phase and what it means",
    "key_levels": "the levels that matter and why",
    "trade_plan": "exactly what needs to happen for a valid entry",
    "verdict": "PASS or EXECUTE and the one-line reason",
    "psychological_rule": "Once entered, hands off. Trust the system. Pre-market movement is information — not permission."
  }
}`;
}

function getLivePrompt(plan, session = "NY") {
  const ct = getCTTime();
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const day = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  const nowMins = ct.mins;
  const isBTC = plan.instrument === "BTCUSD";
  const sessCfg = SESSION_CONFIG[session] || SESSION_CONFIG.NY;

  // Build accurate session status
  let windowStatus = "";
  let sessionWarning = "";

  if (day === 6) {
    // Saturday
    windowStatus = "SATURDAY — NO VALID SESSION ❌";
    sessionWarning = `CRITICAL CONTEXT — IT IS SATURDAY:
- Traditional markets are CLOSED. No NY session, no London session.
- Even BTCUSD has thin, choppy weekend volume with no institutional participation.
- THIS IS NOT A VALID BRC EXECUTION WINDOW.
- If the trader asks about entering: tell them clearly — DO NOT TRADE NOW. Weekend moves are unreliable and do not count as BRC confirmations.
- Next valid execution window: Sunday Asian session (~8:00 PM CT) OR Monday NY session (~8:30 AM CT).
- Your job is to monitor the structure, NOT guide an entry tonight.
- If they push back: hold firm. The system is strict on purpose.`;
  } else if (day === 0) {
    // Sunday
    const asianOpen = 20 * 60; // 8 PM CT
    if (nowMins < asianOpen - 120) {
      windowStatus = "SUNDAY — MARKETS NOT YET OPEN ❌";
      sessionWarning = `CRITICAL CONTEXT — IT IS SUNDAY, MARKETS NOT OPEN YET:
- No valid session right now. Asian session opens ~8:00 PM CT Sunday.
- Do NOT guide any entries. Weekend moves are unreliable.
- Next window: Asian session tonight ~8:00 PM CT.`;
    } else if (nowMins >= asianOpen - 120 && nowMins < asianOpen) {
      windowStatus = "ASIAN SESSION PRE-MARKET — opens soon";
      sessionWarning = "Asian session opens in under 2 hours. This is prep time, not execution time.";
    } else {
      windowStatus = "ASIAN SESSION ACTIVE — reduced size recommended";
      sessionWarning = "Asian session is live. Remind the trader: reduced position size recommended. Choppier price action than NY.";
    }
  } else {
    // Weekday
    const nyOpen = 8 * 60 + 30;
    const nyCutoff = 10 * 60 + 30;
    if (nowMins < nyOpen) {
      windowStatus = `PRE-MARKET — NY opens at 8:30 AM CT (in ${Math.floor((nyOpen - nowMins) / 60)}h ${(nyOpen - nowMins) % 60}m)`;
    } else if (nowMins <= nyCutoff) {
      windowStatus = "NY SESSION LIVE ✅ (8:30–10:30 AM CT)";
    } else {
      windowStatus = "NY SESSION CLOSED ❌ — no new entries today";
      sessionWarning = "NY session is closed. If the trader wants to enter: tell them clearly — session is over, no new entries. Wait for tomorrow.";
    }
  }

  const fridayNote = ct.isFriday ? " FRIDAY: protect the week — if not A+, PASS." : "";

  return `You are OmniUSD — the trader's live session partner. You think like a seasoned trader who has seen every setup, every fake-out, every emotional mistake. You talk like a real person, not a bot.

CURRENT STATE:
Time: ${ct.str} CT | ${ct.dayName} | ${windowStatus}${fridayNote}
${sessionWarning ? `\n⚠️ ${sessionWarning}\n` : ""}
ACTIVE PLAN:
${plan.instrument} | ${plan.bias} | Grade: ${plan.grade} | Confidence: ${plan.confidence_score}%
Trigger: ${plan.trigger_level} | Retest: ${plan.retest_zone}
Stop: ${plan.stop_loss} | TP1: ${plan.tp1} | TP2: ${plan.tp2} | Runner: ${plan.runner}

SESSION CANDLES: ${sessCfg.candles.map(c => candleToUserTime(c)).join(" → ")} — cutoff ${sessCfg.cutoff}
Next 30M close in: ${(() => { const ctNow = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"})); const m = ctNow.getMinutes(); return m < 30 ? 30 - m : 60 - m; })()} minutes

TIME RULE: Every user message has a [CURRENT TIME] block. Use ONLY that time. Never guess or calculate.

━━━ HOW YOU TALK ━━━

You talk like a real experienced trader coaching a friend through a live session. Short. Direct. Confident. No fluff.

When they tell you a candle closed — you react immediately. You already know the plan. You don't ask them to repeat themselves. You don't explain the rules. You just respond to what happened.

When they ask a question — you answer it. Directly. If it's "is this counter trend?" you say yes or no and tell them why in one sentence. If it's "what do you mean?" you clarify in plain English. If it's "should I take this?" you tell them yes or no based on the conditions.

You never say "Try again." You never say "Great question!" You never re-explain BRC. You never lecture. You respond the way a sharp, calm trader would respond to their trading partner.

Keep responses under 4 lines unless they ask a real question that needs a real answer. One question per response max — never stack questions.

━━━ READING WHAT THEY SEND ━━━

Traders type fast. Read intent, not grammar.

"9am closed at 6417" = candle closed at 6417. React.
"closed 6417" = candle closed at 6417. React.
"6417" alone = that's the close price. React.
"wick" = not a close, wicked through. React.
"still forming" = candle still open. Acknowledge and wait.
"is this counter trend?" = answer yes or no with one line.
"what do you mean?" = explain your last message simply.
Any number in a live session context = assume it's a close price.

Never ask them to rephrase. If you're not 100% sure what they mean, make your best read and respond.

━━━ THE RULES YOU ENFORCE (silently) ━━━

- Entry only on 30M candle CLOSE. Wicks are noise. You know this. Don't repeat it more than once.
- Tier 1 = first 30M close ${plan.bias==="SHORT"?"below":"above"} ${plan.trigger_level}
- Tier 2 = second 30M close confirms → place limit order at ${plan.retest_zone}
- No market orders. No chasing. No entries past ${sessCfg.cutoff}.
- If the plan says ${plan.bias} and they're asking about a ${plan.bias==="SHORT"?"LONG":"SHORT"} — tell them that's counter trend and the plan doesn't support it.

━━━ WHAT YOU SAY FOR KEY MOMENTS ━━━

Tier 1 confirmed strong:
"🚨 Tier 1. ${plan.trigger_level} broken — closed at [price]. Watch the [next time] close for Tier 2."

Tier 1 confirmed barely:
"🚨 Tier 1 — squeaked it. [price]. Tier 2 needs to hold clean. Watch [next time] close."

Candle didn't confirm:
"[Time] didn't close ${plan.bias==="SHORT"?"below":"above"} ${plan.trigger_level}. [Next time] is the next window."

Wick only:
"Wick. Not a close. Wait for the full candle to close ${plan.bias==="SHORT"?"below":"above"} ${plan.trigger_level}."

Tier 2 confirmed:
"🚨 Tier 2. Place limit at ${plan.retest_zone}. Stop ${plan.stop_loss}. TP1 ${plan.tp1}. Order in — hands off. Let the trade work."

Last candle window:
"⚠️ Last window — [time]. This is it. If it doesn't confirm, plan expires. No chasing after ${sessCfg.cutoff}."

Cutoff hit:
"Session closed. No trade today. Plan is still valid for tomorrow's session."

Counter trend question:
"${plan.bias === "SHORT" ? "Yes — the plan is SHORT. A long here goes against the bias. No." : "Yes — the plan is LONG. A short here goes against the bias. No."}"

━━━ SIGNALS — MACHINE TAGS, NEVER CHANGE ━━━

Append ONLY at the end of a response when a real candle close is reported:
Tier 1 real close confirmed: <!--SIGNAL:{"tier1":true}-->
Tier 2 real close confirmed: <!--SIGNAL:{"tier2":true}-->
Setup invalidated: <!--SIGNAL:{"invalidated":true}-->
Retest forming: <!--SIGNAL:{"retest":true}-->

Do NOT emit signals for questions, hypotheticals, or wicks. Real price events only.`;
}

// ─── Main component ───────────────────────────────────────────────────────────
function DashFaqRow({item, isLast}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.06)", background: item.highlight ? "rgba(0,229,255,0.02)" : "transparent" }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"18px 22px", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left", gap:16 }}>
        <span style={{ fontFamily:"'Space Mono',monospace", fontSize:14, fontWeight:700, color: item.highlight ? "#00e5ff" : "#f0ecff", lineHeight:1.4 }}>
          {item.highlight && <span style={{ marginRight:8 }}>📌</span>}{item.q}
        </span>
        <span style={{ fontSize:18, color:"#ff6bff", flexShrink:0, transition:"transform 0.2s", transform: open ? "rotate(45deg)" : "rotate(0deg)", display:"inline-block" }}>+</span>
      </button>
      {open && (
        <div style={{ padding:"0 22px 18px", fontFamily:"'Space Mono',monospace", fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:1.9 }}>
          {item.a}
        </div>
      )}
    </div>
  );
}

function SettingsPage({profile, onSignOut, onClose}) {
  const isMobile = useWindowWidth() <= 768;
  const [section, setSection] = useState("account");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [cancelStep, setCancelStep] = useState(0);
  const [deleteStep, setDeleteStep] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [tzSearch, setTzSearch] = useState("");
  const [tzObj, setTzObj] = useState(profile?.tz || null);
  const [tzSaved, setTzSaved] = useState(false);

  const tier = profile?.tier || "starter";
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.starter;
  const nextTier = tier === "starter" ? TIER_CONFIG.pro : tier === "pro" ? TIER_CONFIG.elite : null;

  // Common timezones list
  const TZ_LIST = [
    {label:"Eastern Time (ET)",iana:"America/New_York",offset:"UTC-5/4"},
    {label:"Central Time (CT)",iana:"America/Chicago",offset:"UTC-6/5"},
    {label:"Mountain Time (MT)",iana:"America/Denver",offset:"UTC-7/6"},
    {label:"Pacific Time (PT)",iana:"America/Los_Angeles",offset:"UTC-8/7"},
    {label:"London (GMT/BST)",iana:"Europe/London",offset:"UTC+0/1"},
    {label:"Paris / Berlin (CET)",iana:"Europe/Paris",offset:"UTC+1/2"},
    {label:"Dubai (GST)",iana:"Asia/Dubai",offset:"UTC+4"},
    {label:"Singapore (SGT)",iana:"Asia/Singapore",offset:"UTC+8"},
    {label:"Tokyo (JST)",iana:"Asia/Tokyo",offset:"UTC+9"},
    {label:"Sydney (AEST)",iana:"Australia/Sydney",offset:"UTC+10/11"},
    {label:"São Paulo (BRT)",iana:"America/Sao_Paulo",offset:"UTC-3"},
    {label:"Lagos (WAT)",iana:"Africa/Lagos",offset:"UTC+1"},
  ];
  const filteredTZ = tzSearch ? TZ_LIST.filter(t=>t.label.toLowerCase().includes(tzSearch.toLowerCase())) : TZ_LIST;

  async function handleChangePassword() {
    if (!pwNew || !pwConfirm) { setPwMsg({type:"error", text:"Fill in all fields."}); return; }
    if (pwNew.length < 8) { setPwMsg({type:"error", text:"Password must be at least 8 characters."}); return; }
    if (pwNew !== pwConfirm) { setPwMsg({type:"error", text:"Passwords do not match."}); return; }
    setPwLoading(true); setPwMsg(null);
    try {
      const session = JSON.parse(localStorage.getItem("omniusd_session") || "{}");
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ password: pwNew }),
      });
      setPwLoading(false);
      if (res.ok) {
        setPwMsg({type:"success", text:"Password updated successfully."});
        setPwNew(""); setPwConfirm("");
      } else {
        const d = await res.json();
        setPwMsg({type:"error", text: d.msg || d.error || "Failed to update password."});
      }
    } catch(e) { setPwLoading(false); setPwMsg({type:"error", text:"Connection error."}); }
  }

  async function handleSaveTz() {
    if (!tzObj) return;
    try {
      const session = JSON.parse(localStorage.getItem("omniusd_session") || "{}");
      const userId = session.user?.id || JSON.parse(atob(session.access_token.split(".")[1]))?.sub;
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tz: JSON.stringify(tzObj), updated_at: new Date().toISOString() }),
      });
      setTzSaved(true);
      setTimeout(() => setTzSaved(false), 3000);
    } catch(e) {}
  }

  async function openBillingPortal() {
    setPortalLoading(true);
    try {
      const session = JSON.parse(localStorage.getItem("omniusd_session") || "{}");
      const userId = session.user?.id || JSON.parse(atob(session.access_token.split(".")[1]))?.sub;
      const res = await fetch("/api/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, return_url: window.location.origin + "?from=portal" }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Could not open billing portal. Try again.");
      }
    } catch(e) {
      alert("Connection error. Try again.");
    }
    setPortalLoading(false);
  }

  async function handleDeleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    try {
      const session = JSON.parse(localStorage.getItem("omniusd_session") || "{}");
      await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${session.access_token}` },
      });
    } catch(e) {}
    localStorage.clear();
    window.location.reload();
  }

  const card = {background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12,padding:"22px 24px",marginBottom:14};
  const lbl = {fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.14em",color:"rgba(255,255,255,0.8)",marginBottom:10,display:"block"};
  const inputSt = {width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,padding:"10px 14px",fontSize:14,color:"#f0ecff",fontFamily:"'Space Mono',monospace",outline:"none",boxSizing:"border-box"};

  return (
    <div style={{flex:1,overflowY:"auto",padding:isMobile?"20px 16px":"32px 24px",animation:"fadein 0.3s ease both"}}>
      <div style={{maxWidth:580,margin:"0 auto"}}>

        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
          <div>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,107,255,0.7)",letterSpacing:"0.18em",marginBottom:6}}>SETTINGS</div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:"#f0ecff",margin:0}}>Account & Plan</h2>
          </div>
          <button onClick={onClose} style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:"#8878aa",background:"none",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,padding:"6px 12px",cursor:"pointer"}}>
            ← Back
          </button>
        </div>

        {/* Section tabs */}
        <div style={{display:"flex",gap:4,marginBottom:20,background:"rgba(255,255,255,0.03)",padding:4,borderRadius:10,overflowX:"auto"}}>
          {[{id:"account",l:"Account"},{id:"plan",l:"Plan"},{id:"preferences",l:"Preferences"},{id:"danger",l:"Danger Zone"},...(isDevMode()?[{id:"storage",l:"🔧 Storage"}]:[])].map(t=>(
            <button key={t.id} onClick={()=>setSection(t.id)}
              style={{flex:1,padding:"7px 4px",borderRadius:7,border:"none",fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.06em",cursor:"pointer",transition:"all 0.15s",
                background:section===t.id?"rgba(255,107,255,0.12)":"none",
                color:section===t.id?"#ff6bff":"#8878aa"}}>
              {t.l}
            </button>
          ))}
        </div>

        {/* ── ACCOUNT ── */}
        {section === "account" && (<>
          <div style={card}>
            <span style={lbl}>NAME</span>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#f0ecff",padding:"10px 14px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8}}>
              {profile?.preferredName || <span style={{color:"rgba(255,255,255,0.35)"}}>Not set</span>}
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",fontFamily:"'Space Mono',monospace",marginTop:6}}>
              Name used in greetings and live session messages.
            </div>
          </div>
          <div style={card}>
            <span style={lbl}>EMAIL ADDRESS</span>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#f0ecff",padding:"10px 14px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8}}>
              {profile?.email || "—"}
            </div>
          </div>
          <div style={card}>
            <span style={lbl}>CHANGE PASSWORD</span>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <input type="password" placeholder="New password (min 8 characters)" value={pwNew} onChange={e=>setPwNew(e.target.value)} style={inputSt}/>
              <input type="password" placeholder="Confirm new password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)}
                style={{...inputSt,borderColor:pwConfirm&&pwConfirm!==pwNew?"rgba(255,107,107,0.4)":pwConfirm&&pwConfirm===pwNew?"rgba(127,255,107,0.3)":"rgba(255,255,255,0.1)"}}/>
              {pwMsg && <div style={{fontSize:14,color:pwMsg.type==="error"?"#ff8080":"#7fff6b",fontFamily:"'Space Mono',monospace"}}>{pwMsg.text}</div>}
              <button onClick={handleChangePassword} disabled={pwLoading}
                style={{padding:"10px 20px",borderRadius:8,border:"none",background:pwLoading?"rgba(255,255,255,0.05)":"rgba(255,107,255,0.15)",color:pwLoading?"#8878aa":"#ff6bff",fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.08em",cursor:pwLoading?"not-allowed":"pointer",alignSelf:"flex-start"}}>
                {pwLoading ? "Updating..." : "UPDATE PASSWORD →"}
              </button>
            </div>
          </div>
        </>)}

        {/* ── PLAN ── */}
        {section === "plan" && (<>
          <div style={{...card,border:`1px solid ${tierCfg.color}33`,background:`${tierCfg.color}06`}}>
            <span style={lbl}>CURRENT PLAN</span>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:tierCfg.color}}>{tierCfg.label}</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:16,fontWeight:700,color:"#f0ecff"}}>{tierCfg.price}</div>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
              {tierCfg.instruments.map(sym=>(
                <span key={sym} style={{fontFamily:"'Space Mono',monospace",fontSize:13,padding:"3px 9px",borderRadius:4,background:`${tierCfg.color}14`,border:`1px solid ${tierCfg.color}33`,color:tierCfg.color}}>{sym}</span>
              ))}
            </div>
            <button onClick={openBillingPortal} disabled={portalLoading}
              style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,padding:"9px 18px",borderRadius:7,border:"1px solid rgba(255,255,255,0.12)",background:"rgba(255,255,255,0.05)",color:"#f0ecff",cursor:portalLoading?"not-allowed":"pointer",letterSpacing:"0.08em"}}>
              {portalLoading ? "Opening..." : "MANAGE BILLING & INVOICES →"}
            </button>
          </div>

          {tier !== "elite" && (
            <div style={{...card,border:"1px solid rgba(255,107,255,0.2)",background:"rgba(255,107,255,0.03)"}}>
              <span style={lbl}>UPGRADE YOUR PLAN</span>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.75)",lineHeight:1.7,marginBottom:14}}>
                Upgrades are prorated — you only pay the difference for the remaining days in your billing cycle.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                {Object.entries(TIER_CONFIG).filter(([key])=> {
                  const order = {starter:0,pro:1,elite:2};
                  return order[key] > order[tier];
                }).map(([key,t])=>(
                  <div key={key} style={{padding:"14px 16px",borderRadius:8,background:"rgba(255,255,255,0.03)",border:`1px solid ${t.color}22`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:800,color:t.color,marginBottom:3}}>{t.label} — {t.price}</div>
                      <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.8)"}}>
                        Unlocks: {t.instruments.filter(i=>!tierCfg.instruments.includes(i)).join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={openBillingPortal} disabled={portalLoading}
                style={{width:"100%",padding:"12px",borderRadius:8,border:"none",background:portalLoading?"rgba(255,255,255,0.05)":"linear-gradient(135deg,#ff6bff,#7b2fff)",color:portalLoading?"#8878aa":"#fff",fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,letterSpacing:"0.1em",cursor:portalLoading?"not-allowed":"pointer"}}>
                {portalLoading ? "Opening..." : "UPGRADE PLAN →"}
              </button>
            </div>
          )}

          <div style={card}>
            <span style={lbl}>CANCEL SUBSCRIPTION</span>
            {cancelStep === 0 && (<>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.85)",lineHeight:1.8,marginBottom:14}}>
                Your access continues until the end of your current billing period. You will not be charged again.
              </div>
              <button onClick={()=>setCancelStep(1)}
                style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,padding:"8px 16px",borderRadius:7,border:"1px solid rgba(255,107,107,0.2)",background:"rgba(255,107,107,0.04)",color:"rgba(255,107,107,0.6)",cursor:"pointer"}}>
                Cancel subscription
              </button>
            </>)}
            {cancelStep === 1 && (<>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#ff8080",lineHeight:1.8,marginBottom:14,fontWeight:700}}>
                Are you sure? You will lose access at the end of your billing period.
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setCancelStep(0)} style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,padding:"8px 16px",borderRadius:7,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#8878aa",cursor:"pointer"}}>Keep my plan</button>
                <button onClick={openBillingPortal} disabled={portalLoading}
                  style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,padding:"8px 16px",borderRadius:7,border:"1px solid rgba(255,107,107,0.4)",background:"rgba(255,107,107,0.08)",color:"#ff6b6b",cursor:"pointer"}}>
                  {portalLoading ? "Opening..." : "Yes, cancel →"}
                </button>
              </div>
            </>)}
          </div>
        </>)}

        {/* ── PREFERENCES ── */}
        {section === "preferences" && (
          <div style={card}>
            <span style={lbl}>TIMEZONE</span>
            <div style={{marginBottom:10,fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.85)"}}>
              Currently: <span style={{color:"#f0ecff"}}>{tzObj?.label || "Not set"}</span>
            </div>
            <input
              placeholder="Search timezone..."
              value={tzSearch}
              onChange={e=>setTzSearch(e.target.value)}
              style={{...inputSt,marginBottom:10}}
            />
            <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:4,marginBottom:14}}>
              {filteredTZ.map((t,i)=>(
                <div key={t.iana+i} onClick={()=>setTzObj(t)}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderRadius:7,cursor:"pointer",
                    background:tzObj?.iana===t.iana?"rgba(255,107,255,0.12)":"rgba(255,255,255,0.03)",
                    border:`1px solid ${tzObj?.iana===t.iana?"rgba(255,107,255,0.35)":"rgba(255,255,255,0.06)"}`,
                    transition:"all 0.15s"}}>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:tzObj?.iana===t.iana?"#ff6bff":"#f0ecff"}}>{t.label}</span>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.75)"}}>{t.offset}</span>
                </div>
              ))}
            </div>
            {tzSaved && <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#7fff6b",marginBottom:10}}>✓ Timezone saved.</div>}
            <button onClick={handleSaveTz} disabled={!tzObj}
              style={{padding:"10px 20px",borderRadius:8,border:"none",background:tzObj?"rgba(255,107,255,0.15)":"rgba(255,255,255,0.04)",color:tzObj?"#ff6bff":"#8878aa",fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.08em",cursor:tzObj?"pointer":"not-allowed"}}>
              SAVE TIMEZONE →
            </button>
          </div>
        )}

        {/* ── DANGER ZONE ── */}
        {section === "danger" && (
          <div style={{...card,border:"1px solid rgba(255,107,107,0.2)"}}>
            <span style={{...lbl,color:"rgba(255,107,107,0.6)"}}>DELETE ACCOUNT</span>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.85)",lineHeight:1.8,marginBottom:16}}>
              This permanently deletes your account, profile, and all session history. This cannot be undone.
            </div>
            {deleteStep === 0 && (
              <button onClick={()=>setDeleteStep(1)} style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,padding:"8px 16px",borderRadius:7,border:"1px solid rgba(255,107,107,0.3)",background:"rgba(255,107,107,0.06)",color:"rgba(255,107,107,0.6)",cursor:"pointer"}}>
                Delete my account
              </button>
            )}
            {deleteStep === 1 && (<>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#ff8080",marginBottom:12,lineHeight:1.7}}>
                Type <strong>DELETE</strong> to confirm. This cannot be undone.
              </div>
              <input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE to confirm"
                style={{...inputSt,marginBottom:10,borderColor:deleteConfirm==="DELETE"?"rgba(255,107,107,0.5)":"rgba(255,255,255,0.1)"}}
              />
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setDeleteStep(0);setDeleteConfirm("");}} style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,padding:"8px 16px",borderRadius:7,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.04)",color:"#8878aa",cursor:"pointer"}}>Cancel</button>
                <button onClick={handleDeleteAccount} disabled={deleteConfirm!=="DELETE"}
                  style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,padding:"8px 16px",borderRadius:7,border:"1px solid rgba(255,107,107,0.5)",background:deleteConfirm==="DELETE"?"rgba(255,107,107,0.15)":"rgba(255,107,107,0.04)",color:deleteConfirm==="DELETE"?"#ff6b6b":"rgba(255,107,107,0.3)",cursor:deleteConfirm==="DELETE"?"pointer":"not-allowed"}}>
                  Permanently delete →
                </button>
              </div>
            </>)}
          </div>
        )}

        {/* ── STORAGE INSPECTOR (owner only) ── */}
        {section === "storage" && isDevMode() && (() => {
          const allKeys = Object.keys(localStorage).filter(k => k.startsWith("omniusd_"));
          return (
            <div style={{...card}}>
              <span style={{...lbl,color:"#00ccff"}}>STORAGE INSPECTOR</span>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:"#8878aa",marginBottom:16,lineHeight:1.6}}>
                All OmniUSD keys in this browser. Use this to diagnose missing history/journal data.
              </div>
              {allKeys.length === 0 ? (
                <div style={{fontSize:13,color:"#ff6b6b",fontFamily:"'Space Mono',monospace"}}>No OmniUSD keys found in localStorage.</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {allKeys.map(key => {
                    let raw = localStorage.getItem(key);
                    let parsed, preview, count;
                    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
                    if (Array.isArray(parsed)) {
                      count = parsed.length;
                      preview = `Array [${count} items]`;
                    } else if (parsed && typeof parsed === "object") {
                      count = Object.keys(parsed).length;
                      preview = `Object {${Object.keys(parsed).slice(0,3).join(", ")}${count>3?"...":""}}`;
                    } else {
                      preview = String(raw).slice(0, 60) + (raw?.length > 60 ? "..." : "");
                    }
                    const isData = key.includes("session_plans") || key.includes("exec_journal") || key.includes("journal_") || key.includes("sessions_");
                    return (
                      <div key={key} style={{padding:"10px 12px",background: isData?"rgba(0,204,255,0.04)":"rgba(255,255,255,0.02)",border:`1px solid ${isData?"rgba(0,204,255,0.15)":"rgba(255,255,255,0.06)"}`,borderRadius:8}}>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,color:isData?"#00ccff":"#8878aa",marginBottom:3,wordBreak:"break-all"}}>{key}</div>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"rgba(255,255,255,0.45)"}}>{preview}</div>
                        {isData && count > 0 && (
                          <div style={{marginTop:6}}>
                            <button
                              onClick={() => {
                                // Extract uid from key and copy data to current session uid
                                const _s = JSON.parse(localStorage.getItem("omniusd_session")||"{}");
                                const currentUid = _s.user?.id || _s.user_id || "anon";
                                const keyType = key.includes("session_plans") ? `omniusd_session_plans_${currentUid}`
                                  : key.includes("exec_journal") ? `omniusd_exec_journal_${currentUid}`
                                  : key.includes("journal_") ? `omniusd_journal_${currentUid}`
                                  : key.includes("sessions_") ? `omniusd_sessions_${currentUid}` : null;
                                if (keyType && keyType !== key) {
                                  const existing = localStorage.getItem(keyType);
                                  if (existing && existing !== "[]" && existing !== "{}") {
                                    alert(`Target key ${keyType} already has data. Delete it first if you want to restore from this key.`);
                                    return;
                                  }
                                  localStorage.setItem(keyType, raw);
                                  alert(`✓ Copied to ${keyType}. Reload the app to see restored data.`);
                                } else if (keyType === key) {
                                  alert("This key is already for your current session uid.");
                                }
                              }}
                              style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:6,border:"1px solid rgba(0,204,255,0.3)",background:"rgba(0,204,255,0.08)",color:"#00ccff",cursor:"pointer"}}>
                              Restore to current uid →
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{marginTop:16,padding:"10px 12px",background:"rgba(255,209,102,0.04)",border:"1px solid rgba(255,209,102,0.15)",borderRadius:8,fontFamily:"'Space Mono',monospace",fontSize:11,color:"rgba(255,209,102,0.65)",lineHeight:1.7}}>
                If you see session_plans or exec_journal keys with a different uid suffix than your current session, click "Restore to current uid" then reload the app.
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}



// ── Mobile detection hook ─────────────────────────────────────────────────
function useWindowWidth() {
  const [width, setWidth] = React.useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  React.useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}



// ── Timezone utilities ─────────────────────────────────────────────────────
// Single source of truth: user's selected timezone from profile (or browser fallback)
// ET is used ONLY for internal calculations — never shown to user unless they are in ET

let _userProfileTZ = null; // Set by UnifiedDashboard when profile loads

function getUserTZ() {
  // 1. Profile-saved timezone (from onboarding) — highest priority
  if (_userProfileTZ) return _userProfileTZ;
  // 2. Browser timezone — fallback
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "America/New_York"; }
}

function setUserProfileTZ(ianaTimezone) {
  if (ianaTimezone) _userProfileTZ = ianaTimezone;
}

// Get the user's TZ abbreviation (e.g. "CT", "PT", "GMT")
function getUserTZShort() {
  try {
    const userTZ = getUserTZ();
    const short = new Intl.DateTimeFormat("en-US", { timeZoneName: "short", timeZone: userTZ, hour: "numeric" })
      .format(new Date()).split(" ").pop();
    return short || "Local";
  } catch { return "Local"; }
}

// Convert an ET time (hour, min) to user's timezone — returns ONLY user's local time + their TZ abbr
// Never shows "ET" unless the user IS in ET
function etToUserTime(etHour, etMin, showTZName = true) {
  try {
    const userTZ = getUserTZ();
    // Build a UTC date for the given ET time today
    const etDate = new Date();
    const etNow = new Date(etDate.toLocaleString("en-US", { timeZone: "America/New_York" }));
    etNow.setHours(etHour, etMin, 0, 0);
    const etOffsetMs = etDate.getTime() - new Date(etDate.toLocaleString("en-US", { timeZone: "America/New_York" })).getTime();
    const utcTime = new Date(etNow.getTime() + etOffsetMs);

    const localTime = new Intl.DateTimeFormat("en-US", {
      hour: "numeric", minute: "2-digit", hour12: true, timeZone: userTZ,
    }).format(utcTime);

    if (!showTZName) return localTime;

    const tzShort = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "short", timeZone: userTZ, hour: "numeric",
    }).format(utcTime).split(" ").pop();

    return `${localTime} ${tzShort}`;
  } catch(e) {
    // Fallback: just show ET
    const h12 = etHour > 12 ? etHour - 12 : etHour === 0 ? 12 : etHour;
    const ampm = etHour >= 12 ? "PM" : "AM";
    return `${h12}:${String(etMin).padStart(2,"0")} ${ampm} ET`;
  }
}

// Keep etToLocal as alias for backward compat
function etToLocal(etHour, etMin, showTZName = true) {
  return etToUserTime(etHour, etMin, showTZName);
}

// Format a candle time object { label: "9:30 AM ET", h: 9, m: 30 } → user's local time
// Returns ONLY the user's time and TZ abbreviation — no "ET" unless user is in ET
function candleToUserTime(c) {
  if (!c) return "";
  return etToUserTime(c.h, c.m, true);
}

// ── Session config — instrument compatibility + candle times ────────────────
const SESSION_CONFIG = {
  NY: {
    label: "New York",
    short: "NY",
    color: "#7fff6b",
    hours: "9:30 AM–11:30 AM ET",
    cutoff: "11:30 AM ET",
    cutoffMins: 10*60+30, // CT equivalent for market check
    openMins: 8*60+30,    // CT equivalent for market check
    // ET times for display
    openET: { h: 9, m: 30 },
    cutoffET: { h: 11, m: 30 },
    candles: [
      { label: "9:30 AM ET", h: 9,  m: 30 },
      { label: "10:00 AM ET", h: 10, m: 0  },
      { label: "10:30 AM ET", h: 10, m: 30 },
      { label: "11:00 AM ET", h: 11, m: 0  },
      { label: "11:30 AM ET", h: 11, m: 30 },
    ],
    candleMins: [9*60, 9*60+30, 10*60, 10*60+30, 11*60], // CT for comparison
    desc: "Highest institutional volume. Cleanest BRC setups.",
  },
  LONDON: {
    label: "London",
    short: "LDN",
    color: "#00e5ff",
    hours: "3:00 AM–6:00 AM ET",
    cutoff: "6:00 AM ET",
    cutoffMins: 5*60,
    openMins: 2*60,
    openET: { h: 3, m: 0 },
    cutoffET: { h: 6, m: 0 },
    candles: [
      { label: "3:00 AM ET",  h: 3, m: 0  },
      { label: "3:30 AM ET",  h: 3, m: 30 },
      { label: "4:00 AM ET",  h: 4, m: 0  },
      { label: "4:30 AM ET",  h: 4, m: 30 },
      { label: "5:00 AM ET",  h: 5, m: 0  },
      { label: "5:30 AM ET",  h: 5, m: 30 },
    ],
    candleMins: [2*60, 2*60+30, 3*60, 3*60+30, 4*60, 4*60+30],
    desc: "Strong for forex and gold. Fast sharp moves.",
  },
  ASIAN: {
    label: "Asian (Singapore/HK)",
    short: "ASIA",
    color: "#ff9a3c",
    hours: "9:00 PM–12:00 AM ET",
    cutoff: "12:00 AM ET",
    cutoffMins: 23*60,
    openMins: 20*60,
    openET: { h: 21, m: 0 },
    cutoffET: { h: 0, m: 0 },
    candles: [
      { label: "9:00 PM ET",  h: 21, m: 0  },
      { label: "9:30 PM ET",  h: 21, m: 30 },
      { label: "10:00 PM ET", h: 22, m: 0  },
      { label: "10:30 PM ET", h: 22, m: 30 },
      { label: "11:00 PM ET", h: 23, m: 0  },
      { label: "11:30 PM ET", h: 23, m: 30 },
    ],
    candleMins: [20*60, 20*60+30, 21*60, 21*60+30, 22*60, 22*60+30],
    desc: "Singapore/HK open. Best for BTCUSD.",
  },
  LONDON_NY: {
    label: "London/NY Overlap",
    short: "LDN/NY",
    color: "#ff6bff",
    hours: "9:30 AM–11:30 AM ET",
    cutoff: "11:30 AM ET",
    cutoffMins: 10*60+30,
    openMins: 8*60+30,
    openET: { h: 9, m: 30 },
    cutoffET: { h: 11, m: 30 },
    candles: [
      { label: "9:30 AM ET",  h: 9,  m: 30 },
      { label: "10:00 AM ET", h: 10, m: 0  },
      { label: "10:30 AM ET", h: 10, m: 30 },
      { label: "11:00 AM ET", h: 11, m: 0  },
      { label: "11:30 AM ET", h: 11, m: 30 },
    ],
    candleMins: [9*60, 9*60+30, 10*60, 10*60+30, 11*60],
    desc: "Premium window. Highest volume of the day.",
  },
};

// Instrument-session compatibility
// "best" = optimal, "ok" = valid with advisory, "block" = hard blocked
const SESSION_INSTRUMENT_FIT = {
  XAUUSD:  { NY:"best", LONDON:"ok",    ASIAN:"ok",    LONDON_NY:"best" },
  BTCUSD:  { NY:"best", LONDON:"ok",    ASIAN:"best",  LONDON_NY:"best" },
  NAS100:  { NY:"best", LONDON:"block", ASIAN:"block", LONDON_NY:"best" },
  US30:    { NY:"best", LONDON:"block", ASIAN:"block", LONDON_NY:"best" },
  USOIL:   { NY:"best", LONDON:"ok",    ASIAN:"ok",    LONDON_NY:"best" },
  US500:   { NY:"best", LONDON:"block", ASIAN:"block", LONDON_NY:"best" },
};

const SESSION_ADVISORIES = {
  XAUUSD: {
    LONDON: "XAUUSD trades in London but NY is where institutional money moves gold. Expect wider spreads and slower moves in London. BRC setups here are valid but less reliable.",
    ASIAN:  "XAUUSD has very thin liquidity in the Asian session. Moves can be choppy and misleading. BRC works best on XAUUSD during NY (8:30–10:30 AM CT) when volume is highest. Proceed with extra caution.",
  },
  BTCUSD: {
    LONDON: "BTCUSD trades 24/7 but London session can produce choppy moves before NY takes over. Valid for BRC but NY produces cleaner follow-through.",
    ASIAN:  null, // no advisory — BTCUSD Asian is genuinely good
  },
  US500: {
    LONDON: "US500 is a US equity index. The US market is CLOSED during London session. No valid BRC execution here — NY session only.",
    ASIAN:  "US500 is a US equity index. The US market is CLOSED during the Asian session. NY session only.",
  },
  USOIL: {
    LONDON: "USOIL moves in London but the biggest volume comes at the NY open — especially around the 9:30 AM EIA report. London USOIL setups are valid but lighter.",
    ASIAN:  "USOIL has very thin volume in the Asian session. Wide spreads and low participation make BRC setups unreliable here.",
  },
};

const SESSION_BLOCKS = {
  US500: {
    LONDON: "US500 (S&P 500) is a US equity index. The US market is CLOSED during London session. NY session only — no valid BRC execution here.",
    ASIAN:  "US500 (S&P 500) is a US equity index. The US market is CLOSED during the Asian session. NY session only.",
  },
  NAS100: {
    LONDON: "NAS100 is a US equity index. The US market is CLOSED during London session. There is no valid BRC setup here — price is not being driven by real institutional volume.",
    ASIAN:  "NAS100 is a US equity index. The US market is CLOSED during the Asian session. Attempting to trade NAS100 overnight is gambling on noise, not structure.",
  },
  US30: {
    LONDON: "US30 is a US equity index. The US market is CLOSED during London session. No valid BRC execution is possible here.",
    ASIAN:  "US30 is a US equity index. The US market is CLOSED during the Asian session. No valid BRC execution is possible here.",
  },
};

// ── Usage tracking helpers ────────────────────────────────────────────────
const DAILY_CAPS = { starter: 3, pro: 5, elite: 10 };
const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

async function logUsage(userId, token, instrument) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/usage_logs`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        user_id: userId,
        instrument,
        type: "analysis",
        created_at: new Date().toISOString(),
      }),
    });
  } catch(e) { console.error("Usage log failed:", e); }
}

async function checkUsageLimits(userId, token, instrument, tier) {
  try {
    // Fetch today's logs for this user
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/usage_logs?user_id=eq.${userId}&type=eq.analysis&created_at=gte.${startOfDay.toISOString()}&select=instrument,created_at`,
      {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${token}`,
        }
      }
    );
    if (!res.ok) return { allowed: true }; // fail open

    const logs = await res.json();
    const cap = DAILY_CAPS[tier] || DAILY_CAPS.starter;

    // Check daily cap
    if (logs.length >= cap) {
      return {
        allowed: false,
        reason: `Daily limit reached`,
        detail: `Your ${tier.charAt(0).toUpperCase()+tier.slice(1)} plan includes ${cap} analyses per day. You've used all ${cap} today. Come back tomorrow or upgrade your plan.`,
        type: "cap",
      };
    }

    // Check instrument cooldown (2 hours)
    const lastForInstrument = logs
      .filter(l => l.instrument === instrument)
      .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0];

    if (lastForInstrument) {
      const elapsed = Date.now() - new Date(lastForInstrument.created_at).getTime();
      if (elapsed < COOLDOWN_MS) {
        const remaining = COOLDOWN_MS - elapsed;
        const hrs = Math.floor(remaining / 3600000);
        const mins = Math.floor((remaining % 3600000) / 60000);
        const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
        return {
          allowed: false,
          reason: `${instrument} cooldown active`,
          detail: `You analyzed ${instrument} recently. Next analysis available in ${timeStr}. This protects you from overtrading and keeps costs sustainable.`,
          type: "cooldown",
        };
      }
    }

    return { allowed: true };
  } catch(e) {
    console.error("Usage check failed:", e);
    return { allowed: true }; // fail open — never block on error
  }
}

// ── Timeframe detection from filename ─────────────────────────────────────
function detectTFFromFilename(filename) {
  const f = filename.toLowerCase();
  // TradingView patterns: "BTCUSD, 240.png", "BTCUSD, D.png" etc.
  if (f.match(/[,\s_-]d[,.\s_-]|daily|\b1d\b|,\s*d\b/)) return 0; // Daily
  if (f.match(/240|4h|4hr|4hour/)) return 1; // 4H
  if (f.match(/60|1h[^4]|1hr|1hour/)) return 2; // 1H
  if (f.match(/30m|30min|30\b/)) return 3; // 30M
  if (f.match(/15m|15min|15\b/)) return 4; // 15M
  return -1; // unknown
}

function BulkUploadZone({ images, setImages, readSlotFile, dragOverSlot, setDragOverSlot }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [unassigned, setUnassigned] = useState([]); // files that couldn't be auto-detected
  const fileInputRef = useRef(null);

  const SLOTS = [
    { tf: "Daily", label: "D",   role: "Bias",       color: "#ff6bff" },
    { tf: "4H",    label: "4H",  role: "Structure",  color: "#00e5ff" },
    { tf: "1H",    label: "1H",  role: "Setup",      color: "#7fff6b" },
    { tf: "30M",   label: "30M", role: "Trigger",    color: "#ffd166" },
    { tf: "15M",   label: "15M", role: "Refinement", color: "#ff9a3c" },
  ];

  const uploadedCount = images.filter(Boolean).length;
  const allReady = uploadedCount === 5;

  function processFiles(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith("image/")).slice(0, 10);
    if (!imgs.length) return;
    setAnimating(true);

    // Try to auto-detect timeframes
    const assigned = Array(5).fill(null);
    const leftover = [];

    imgs.forEach(file => {
      const idx = detectTFFromFilename(file.name);
      if (idx >= 0 && !assigned[idx]) {
        assigned[idx] = file;
      } else {
        leftover.push(file);
      }
    });

    // Fill remaining slots with leftover files in order
    let leftoverIdx = 0;
    for (let i = 0; i < 5; i++) {
      if (!assigned[i] && leftoverIdx < leftover.length) {
        assigned[i] = leftover[leftoverIdx++];
      }
    }

    // Read each assigned file
    assigned.forEach((file, i) => {
      if (file) readSlotFile(file, i);
    });

    setTimeout(() => setAnimating(false), 800);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragOver(false);
    setDragOverSlot(null);
    processFiles(e.dataTransfer.files);
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <style>{`
        @keyframes cardFanIn {
          0%   { opacity: 0; transform: translateY(20px) scale(0.92); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes orbitPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,107,255,0.4), 0 0 24px rgba(255,107,255,0.15); }
          50%       { box-shadow: 0 0 0 8px rgba(255,107,255,0), 0 0 40px rgba(255,107,255,0.3); }
        }
        @keyframes readyGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(127,255,107,0.5), 0 0 20px rgba(127,255,107,0.2); }
          50%       { box-shadow: 0 0 0 6px rgba(127,255,107,0), 0 0 40px rgba(127,255,107,0.4); }
        }
        @keyframes scanLine {
          0%   { top: 0; opacity: 0.7; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>

      {/* Drop zone */}
      {uploadedCount < 5 && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            position: "relative", overflow: "hidden",
            padding: "28px 20px",
            background: isDragOver
              ? "rgba(255,107,255,0.08)"
              : "rgba(255,255,255,0.02)",
            border: `1px solid ${isDragOver ? "rgba(255,107,255,0.6)" : "rgba(255,107,255,0.2)"}`,
            borderRadius: 14,
            cursor: "pointer",
            textAlign: "center",
            animation: isDragOver ? "orbitPulse 1s ease infinite" : "none",
            transition: "all 0.2s",
            marginBottom: 14,
          }}>

          {/* Grid overlay */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,107,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,255,0.04) 1px,transparent 1px)", backgroundSize: "24px 24px", pointerEvents: "none" }}/>

          {/* Scan line when dragging */}
          {isDragOver && (
            <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: "linear-gradient(90deg,transparent,#ff6bff,transparent)", animation: "scanLine 1s linear infinite", pointerEvents: "none" }}/>
          )}

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: isDragOver ? 40 : 32, marginBottom: 10, transition: "all 0.2s" }}>
              {isDragOver ? "↓" : "📁"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: isDragOver ? "#ff6bff" : "#f0ecff", marginBottom: 6 }}>
              {isDragOver ? "Drop all 5 charts here" : "Select or drop all 5 charts at once"}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.6 }}>
              Daily · 4H · 1H · 30M · 15M — select all at once or one by one
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,107,255,0.5)", marginTop: 8, fontFamily: "'Space Mono',monospace" }}>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={e => { if (e.target.files.length) processFiles(e.target.files); e.target.value = ""; }}
          />
        </div>
      )}

      {/* Cards — fan out as uploads come in */}
      {uploadedCount > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
          {SLOTS.map((slot, i) => {
            const hasImage = !!(images[i]?.preview);
            return (
              <div key={slot.tf}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 12px",
                  background: hasImage ? `${slot.color}08` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${hasImage ? `${slot.color}33` : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 10,
                  animation: hasImage && animating ? `cardFanIn 0.4s ease ${i * 0.08}s both` : "none",
                  transition: "all 0.3s",
                  cursor: "pointer",
                }}
                onClick={() => document.getElementById(`bulk-slot-${i}`).click()}>

                {/* TF badge */}
                <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 8, background: hasImage ? `${slot.color}14` : "rgba(255,255,255,0.04)", border: `1px solid ${hasImage ? `${slot.color}44` : "rgba(255,255,255,0.08)"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: hasImage ? slot.color : "rgba(255,255,255,0.38)", lineHeight: 1 }}>{slot.label}</span>
                  <span style={{ fontSize: 6, color: hasImage ? `${slot.color}88` : "rgba(255,255,255,0.15)", marginTop: 2, fontFamily: "'Space Mono',monospace" }}>{slot.role}</span>
                </div>

                {/* Preview thumbnail */}
                {hasImage ? (
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <img src={images[i].preview} alt={slot.tf}
                      style={{ width: 60, height: 38, objectFit: "cover", borderRadius: 6, border: `1px solid ${slot.color}44` }}/>
                    {/* Scan effect overlay */}
                    <div style={{ position: "absolute", inset: 0, borderRadius: 6, background: `linear-gradient(180deg, transparent 60%, ${slot.color}22)`, pointerEvents: "none" }}/>
                  </div>
                ) : (
                  <div style={{ width: 60, height: 38, flexShrink: 0, borderRadius: 6, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 16, color: "rgba(255,255,255,0.15)" }}>+</span>
                  </div>
                )}

                {/* Label */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: hasImage ? "#f0ecff" : "rgba(255,255,255,0.75)", marginBottom: 2 }}>{slot.tf} Chart</div>
                  <div style={{ fontSize: 13, color: hasImage ? `${slot.color}88` : "rgba(255,255,255,0.80)" }}>
                    {hasImage ? "✓ Uploaded" : "Waiting..."}
                  </div>
                </div>

                {/* Replace chip */}
                {hasImage && (
                  <div onClick={e => { e.stopPropagation(); document.getElementById(`bulk-slot-${i}`).click(); }}
                    style={{ fontSize: 8, fontWeight: 700, padding: "3px 8px", borderRadius: 5, border: `1px solid ${slot.color}33`, background: `${slot.color}08`, color: `${slot.color}99`, cursor: "pointer", flexShrink: 0 }}>
                    Replace
                  </div>
                )}

                <input type="file" accept="image/*" id={`bulk-slot-${i}`}
                  style={{ display: "none" }}
                  onChange={e => { if (e.target.files[0]) { readSlotFile(e.target.files[0], i); e.target.value = ""; } }}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* All ready glow indicator */}
      {allReady && (
        <div style={{ padding: "10px 14px", background: "rgba(127,255,107,0.06)", border: "1px solid rgba(127,255,107,0.3)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10, animation: "readyGlow 2s ease infinite" }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7fff6b" }}>All 5 charts ready</div>
            <div style={{ fontSize: 13, color: "rgba(127,255,107,0.6)", fontFamily: "'Space Mono',monospace" }}>Hit generate to build your session plan</div>
          </div>
          <button onClick={() => { setImages(Array(5).fill(null)); }}
            style={{ marginLeft: "auto", fontSize: 8, fontWeight: 700, padding: "3px 9px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "rgba(255,255,255,0.75)", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            Clear all
          </button>
        </div>
      )}

      {/* Progress bar */}
      {uploadedCount > 0 && uploadedCount < 5 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "#8878aa", fontFamily: "'Space Mono',monospace" }}>{uploadedCount} / 5 charts</span>
            <span style={{ fontSize: 13, color: "#8878aa", fontFamily: "'Space Mono',monospace" }}>{5 - uploadedCount} remaining</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(uploadedCount/5)*100}%`, background: "linear-gradient(90deg,#ff6bff,#00e5ff)", borderRadius: 2, transition: "width 0.4s ease" }}/>
          </div>
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// SESSION HISTORY PAGE
// ═══════════════════════════════════════════════════════════════════════════
function ChartSetupPage({ onClose }) {
  const [expanded, setExpanded] = React.useState(null);

  const TF = [
    {
      short: "D",   tf: "Daily",     lookback: "6 months",  color: "#ff6bff",
      shows: "Full macro trend + major levels",
      perfect: "Captures the complete trend cycle — every major high, low, and rejection is visible. Too little and you miss the macro trend. Too much and old levels confuse the read.",
      tooLittle: "1 month — misses macro trend",
      tooMuch: "1 year — old levels confuse analysis",
    },
    {
      short: "4H",  tf: "4-Hour",    lookback: "4–6 weeks", color: "#00e5ff",
      shows: "Intermediate structure + BRC phases",
      perfect: "Shows the full correction phase — lower highs, consolidation zones, and the setup forming between Daily and 1H. Less than 4 weeks and the structure disappears.",
      tooLittle: "1 week — misses intermediate structure",
      tooMuch: "3 months — too many old levels",
    },
    {
      short: "1H",  tf: "1-Hour",    lookback: "5–7 days",  color: "#7fff6b",
      shows: "Entry structure + current BRC sequence",
      perfect: "Shows active retest zones and the BRC sequence forming right now. This is where entry levels, stop zones, and the current phase are most readable.",
      tooLittle: "1 day — misses entry structure",
      tooMuch: "2 weeks — too much noise",
    },
    {
      short: "30M", tf: "30-Minute", lookback: "3–5 days",  color: "#ffd166",
      shows: "Trigger levels + Tier 1 / Tier 2 zones",
      perfect: "Shows current consolidation, swing highs and lows, and the exact levels for Tier 1 and Tier 2 confirmation. This is your entry trigger timeframe.",
      tooLittle: "1 day — misses consolidation zones",
      tooMuch: "1 week — stale levels pollute the read",
    },
    {
      short: "15M", tf: "15-Minute", lookback: "1–2 days",  color: "#ff9a3c",
      shows: "Current momentum + early warning only",
      perfect: "Early warning only. You need the last 24–48 hours of candle behavior to read current momentum. Nothing more is needed or useful on this timeframe.",
      tooLittle: "4 hours — not enough context",
      tooMuch: "3 days — analysis paralysis",
    },
  ];

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 20px", animation:"fadein 0.3s ease both" }}>
      <div style={{ maxWidth:560, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
          <div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:"rgba(255,209,102,0.7)", letterSpacing:"0.18em", marginBottom:5 }}>CHART SETUP</div>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:"#f0ecff", margin:0 }}>How far back to set each chart.</h2>
          </div>
          <button onClick={onClose} style={{ fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:700, color:"#8878aa", background:"none", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"6px 12px", cursor:"pointer" }}>
            ← Back
          </button>
        </div>

        {/* Tutorial video */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, fontWeight:900, letterSpacing:"0.14em", color:"#00e5ff", marginBottom:10 }}>▶️ CHART SETUP TUTORIAL</div>
          <div style={{ position:"relative", paddingBottom:"56.25%", height:0, borderRadius:10, overflow:"hidden", border:"1px solid rgba(0,229,255,0.15)" }}>
            <iframe
              src="https://www.youtube.com/embed/NQuieU-xdEs"
              title="OmniUSD Chart Setup Tutorial"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%" }}
            />
          </div>
        </div>

        {/* OmniLens indicator */}
        <div style={{ padding:"12px 14px", background:"rgba(255,209,102,0.04)", border:"1px solid rgba(255,209,102,0.18)", borderLeft:"3px solid #ffd166", borderRadius:0, marginBottom:20 }}>
          <div style={{ fontSize:9, fontWeight:900, letterSpacing:"0.14em", color:"#ffd166", fontFamily:"'Space Mono',monospace", marginBottom:6 }}>🔭 OMNI LENS — FREE TRADINGVIEW INDICATOR</div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.62)", lineHeight:1.8, marginBottom:10 }}>
            We built a free indicator that automatically marks your chart lookback periods, labels market structure (HH/HL/LH/LL), and shows 30M candle body strength. Makes the screenshot process foolproof.
          </div>
          <a href="https://www.tradingview.com/PLACEHOLDER_INDICATOR_LINK" target="_blank" rel="noopener noreferrer"
            style={{ display:"inline-block", fontSize:11, fontWeight:700, color:"#ffd166", fontFamily:"'Space Mono',monospace", textDecoration:"none", padding:"7px 14px", borderRadius:6, border:"1px solid rgba(255,209,102,0.3)", background:"rgba(255,209,102,0.06)", cursor:"pointer" }}>
            GET OMNI LENS ON TRADINGVIEW →
          </a>
        </div>

        {/* Warning */}
        <div style={{ padding:"9px 13px", background:"rgba(255,107,107,0.06)", border:"1px solid rgba(255,107,107,0.18)", borderLeft:"3px solid #ff6b6b", borderRadius:0, marginBottom:20 }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.62)", fontFamily:"'Space Mono',monospace", lineHeight:1.7 }}>
            Wrong lookback = bad analysis. <strong style={{ color:"#ff6b6b" }}>These are requirements, not suggestions.</strong>
          </div>
        </div>

        {/* ── QUICK REFERENCE TABLE — primary view ── */}
        <div style={{ background:"rgba(255,209,102,0.03)", border:"1px solid rgba(255,209,102,0.15)", borderRadius:10, overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"10px 16px", borderBottom:"1px solid rgba(255,209,102,0.1)" }}>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, fontWeight:900, letterSpacing:"0.14em", color:"#ffd166" }}>QUICK REFERENCE</div>
          </div>
          {TF.map((r, i) => (
            <div key={r.short} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom: i < TF.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div style={{ width:30, height:30, borderRadius:6, background:`${r.color}14`, border:`1px solid ${r.color}33`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, fontWeight:900, color:r.color }}>{r.short}</span>
              </div>
              <span style={{ fontSize:12, color:"rgba(255,255,255,0.55)", flex:1 }}>{r.tf}</span>
              <span style={{ fontSize:13, fontWeight:900, color:r.color, fontFamily:"monospace" }}>{r.lookback}</span>
            </div>
          ))}
        </div>

        {/* ── ACCORDION — expandable detail ── */}
        <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, fontWeight:900, letterSpacing:"0.14em", color:"rgba(255,255,255,0.3)", marginBottom:10 }}>
          TAP ANY TIMEFRAME FOR DETAILS
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:20 }}>
          {TF.map((r) => {
            const isOpen = expanded === r.short;
            return (
              <div key={r.short} style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${isOpen ? r.color+"44" : "rgba(255,255,255,0.06)"}`, borderRadius:10, overflow:"hidden", transition:"border 0.2s" }}>
                {/* Header */}
                <button onClick={() => setExpanded(isOpen ? null : r.short)}
                  style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                  <div style={{ width:28, height:28, borderRadius:6, background:`${r.color}14`, border:`1px solid ${r.color}33`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, fontWeight:900, color:r.color }}>{r.short}</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#f0ecff" }}>{r.tf}</div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)", fontFamily:"'Space Mono',monospace" }}>{r.shows}</div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0, marginRight:8 }}>
                    <span style={{ fontSize:13, fontWeight:900, color:r.color, fontFamily:"monospace" }}>{r.lookback}</span>
                  </div>
                  <span style={{ color:"rgba(255,255,255,0.3)", fontSize:13, flexShrink:0, transform:isOpen?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div style={{ padding:"0 14px 14px", animation:"fadein 0.2s ease both" }}>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,0.62)", lineHeight:1.8, marginBottom:10, paddingTop:4, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
                      {r.perfect}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                      <div style={{ padding:"6px 10px", background:"rgba(255,107,107,0.05)", border:"1px solid rgba(255,107,107,0.15)", borderRadius:7 }}>
                        <div style={{ fontSize:9, color:"#ff6b6b", fontFamily:"'Space Mono',monospace", fontWeight:700, marginBottom:3 }}>❌ TOO LITTLE</div>
                        <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>{r.tooLittle}</div>
                      </div>
                      <div style={{ padding:"6px 10px", background:"rgba(255,107,107,0.05)", border:"1px solid rgba(255,107,107,0.15)", borderRadius:7 }}>
                        <div style={{ fontSize:9, color:"#ff6b6b", fontFamily:"'Space Mono',monospace", fontWeight:700, marginBottom:3 }}>❌ TOO MUCH</div>
                        <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>{r.tooMuch}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <button onClick={onClose}
          style={{ width:"100%", padding:"14px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#ff6bff,#7b2fff)", color:"#fff", fontSize:13, fontWeight:700, letterSpacing:"0.1em", fontFamily:"inherit", cursor:"pointer", boxShadow:"0 4px 24px rgba(255,107,255,0.25)" }}>
          GOT IT — CONTINUE TO UPLOAD →
        </button>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TRADE LOGGER PAGE (owner-only, private)
// ═══════════════════════════════════════════════════════════════════════════
function TradeLoggerPage({ profile, onClose }) {
  const OWNER = "bailey.charles024@gmail.com";
  const isMobile = useWindowWidth() <= 768;
  const GRADES = ["A+","A","B","C","PASS"];
  const INSTRUMENTS = ["XAUUSD","BTCUSD","NAS100","US30","USOIL","US500"];
  const RESULTS = ["WIN","LOSS","BE","PASS","MISSED","CANCELLED"];

  const empty = { instrument:"XAUUSD", grade:"A+", direction:"LONG", entry:"", stop:"", tp1:"", rr:"", result_usd:"", outcome:"WIN", note:"", trade_date: new Date().toISOString().slice(0,10) };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  const tok = () => { try { return JSON.parse(localStorage.getItem("omniusd_session")||"{}").access_token || SUPABASE_KEY; } catch { return SUPABASE_KEY; } };

  async function loadTrades(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/trades?select=*&order=trade_date.desc,created_at.desc&limit=50`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok()}`, "Content-Type": "application/json" }
      });
      if (res.ok) { const d = await res.json(); setTrades(Array.isArray(d) ? d : []); }
    } catch {}
    if (!silent) setLoading(false);
  }

  useEffect(() => { if (profile?.email === OWNER) loadTrades(); }, []);

  async function saveTrade() {
    if (!form.entry || !form.stop) { setMsg({ type:"error", text:"Entry and stop are required." }); return; }
    setSaving(true); setMsg(null);
    try {
      const payload = {
        instrument: form.instrument, grade: form.grade, direction: form.direction,
        entry: parseFloat(form.entry) || null, stop: parseFloat(form.stop) || null,
        tp1: parseFloat(form.tp1) || null, rr: form.rr || null,
        result_usd: parseFloat(form.result_usd) || null, outcome: form.outcome,
        note: form.note || null, trade_date: form.trade_date, is_public: true,
      };
      let res;
      if (editingId) {
        res = await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${editingId}`, {
          method: "PATCH",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok()}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${SUPABASE_URL}/rest/v1/trades`, {
          method: "POST",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok()}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
          body: JSON.stringify(payload),
        });
      }
      if (res.ok || res.status === 201 || res.status === 204) {
        setMsg({ type:"success", text: editingId ? "Trade updated." : "Trade logged." });
        if (editingId) {
          // Update local state immediately so UI reflects change without waiting for refetch
          setTrades(prev => prev.map(t => t.id === editingId ? { ...t, ...payload } : t));
        }
        setForm({ ...empty, trade_date: new Date().toISOString().slice(0,10) });
        setEditingId(null);
        loadTrades(!!editingId); // silent refresh on edit, full reload on new log
      } else {
        const e = await res.json();
        setMsg({ type:"error", text: e?.message || "Save failed." });
      }
    } catch(e) { setMsg({ type:"error", text:"Network error." }); }
    setSaving(false);
  }

  function startEdit(t) {
    setForm({
      instrument: t.instrument || "XAUUSD",
      grade: t.grade || "A+",
      direction: t.direction || "LONG",
      entry: t.entry != null ? String(t.entry) : "",
      stop: t.stop != null ? String(t.stop) : "",
      tp1: t.tp1 != null ? String(t.tp1) : "",
      rr: t.rr || "",
      result_usd: t.result_usd != null ? String(t.result_usd) : "",
      outcome: t.outcome || "WIN",
      note: t.note || "",
      trade_date: t.trade_date || new Date().toISOString().slice(0,10),
    });
    setEditingId(t.id);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setForm({ ...empty, trade_date: new Date().toISOString().slice(0,10) });
    setEditingId(null);
    setMsg(null);
  }

  async function deleteTrade(id) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok()}` },
      });
      setTrades(t => t.filter(x => x.id !== id));
    } catch {}
  }

  if (profile?.email !== OWNER) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, color:"#ff6b6b" }}>Access restricted.</div>
    </div>
  );

  const inp = { width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"9px 12px", fontSize:13, color:"#f0ecff", fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
  const sel = { ...inp, appearance:"none", cursor:"pointer" };
  const outcomeColor = { WIN:"#7fff6b", LOSS:"#ff6b6b", BE:"#ffd166", PASS:"#8878aa", MISSED:"#ff9a3c", CANCELLED:"#00ccff" };

  return (
    <div style={{ flex:1, overflowY:"auto", padding: isMobile ? "20px 16px" : "32px 24px", animation:"fadein 0.3s ease both" }}>
      <div style={{ maxWidth:680, margin:"0 auto" }}>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
          <div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:"rgba(204,68,255,0.7)", letterSpacing:"0.18em", marginBottom:6 }}>TRADE LOGGER</div>
            <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"#f0ecff", margin:0 }}>{editingId ? "Edit Trade" : "Log a Trade"}</h2>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {editingId && (
              <button onClick={cancelEdit} style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:"#8878aa", background:"none", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"6px 12px", cursor:"pointer" }}>✕ Cancel</button>
            )}
            <button onClick={onClose} style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:"#8878aa", background:"none", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"6px 12px", cursor:"pointer" }}>← Back</button>
          </div>
        </div>

        {/* Form */}
        <div style={{ background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"22px 20px", marginBottom:28 }}>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>DATE</div>
              <input type="date" value={form.trade_date} onChange={e=>setForm(f=>({...f,trade_date:e.target.value}))} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>INSTRUMENT</div>
              <select value={form.instrument} onChange={e=>setForm(f=>({...f,instrument:e.target.value}))} style={sel}>
                {INSTRUMENTS.map(i=><option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>GRADE</div>
              <select value={form.grade} onChange={e=>setForm(f=>({...f,grade:e.target.value}))} style={sel}>
                {GRADES.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>DIRECTION</div>
              <select value={form.direction} onChange={e=>setForm(f=>({...f,direction:e.target.value}))} style={sel}>
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
                <option value="NEUTRAL">NEUTRAL</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>ENTRY</div>
              <input type="number" placeholder="0.00" value={form.entry} onChange={e=>setForm(f=>({...f,entry:e.target.value}))} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>STOP</div>
              <input type="number" placeholder="0.00" value={form.stop} onChange={e=>setForm(f=>({...f,stop:e.target.value}))} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>TP1</div>
              <input type="number" placeholder="0.00" value={form.tp1} onChange={e=>setForm(f=>({...f,tp1:e.target.value}))} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>R:R</div>
              <input type="text" placeholder="e.g. 2.1:1" value={form.rr} onChange={e=>setForm(f=>({...f,rr:e.target.value}))} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>RESULT ($)</div>
              <input type="number" placeholder="e.g. 94.50" value={form.result_usd} onChange={e=>setForm(f=>({...f,result_usd:e.target.value}))} style={inp}/>
            </div>
            <div>
              <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>OUTCOME</div>
              <select value={form.outcome} onChange={e=>setForm(f=>({...f,outcome:e.target.value}))} style={{...sel, color: outcomeColor[form.outcome]}}>
                {RESULTS.map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, color:"#8878aa", fontFamily:"'Space Mono',monospace", letterSpacing:"0.12em", marginBottom:6 }}>NOTE</div>
            <textarea value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
              placeholder="What happened? What did the setup look like? Anything to remember..."
              rows={3}
              style={{...inp, resize:"vertical", lineHeight:1.6}}/>
          </div>
          {msg && (
            <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:12, background: msg.type==="success" ? "rgba(127,255,107,0.06)" : "rgba(255,107,107,0.06)", border:`1px solid ${msg.type==="success" ? "rgba(127,255,107,0.25)" : "rgba(255,107,107,0.25)"}`, fontSize:13, color: msg.type==="success" ? "#7fff6b" : "#ff6b6b", fontFamily:"'Space Mono',monospace" }}>
              {msg.text}
            </div>
          )}
          {editingId && (
            <div style={{ padding:"8px 12px", borderRadius:7, marginBottom:10, background:"rgba(204,68,255,0.06)", border:"1px solid rgba(204,68,255,0.2)", fontFamily:"'Space Mono',monospace", fontSize:11, color:"#cc44ff" }}>
              ✏ Editing trade — make changes then click UPDATE TRADE
            </div>
          )}
          <button onClick={saveTrade} disabled={saving}
            style={{ width:"100%", padding:"12px", borderRadius:10, border:"none", background: saving ? "rgba(204,68,255,0.2)" : editingId ? "linear-gradient(135deg,#ffd166,#ff9a3c)" : "linear-gradient(135deg,#cc44ff,#00ccff)", color: saving ? "#8878aa" : "#1e1a35", fontSize:13, fontWeight:900, letterSpacing:"0.12em", fontFamily:"inherit", cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "SAVING..." : editingId ? "UPDATE TRADE →" : "LOG TRADE →"}
          </button>
        </div>

        {/* Recent trades */}
        <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:"#8878aa", letterSpacing:"0.14em", marginBottom:14 }}>RECENT TRADES</div>
        {loading ? (
          <div style={{ textAlign:"center", padding:"32px 0", color:"#8878aa", fontFamily:"'Space Mono',monospace", fontSize:13 }}>Loading...</div>
        ) : trades.length === 0 ? (
          <div style={{ textAlign:"center", padding:"32px 0", color:"#8878aa", fontFamily:"'Space Mono',monospace", fontSize:13 }}>No trades logged yet.</div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {trades.map(t => (
              <div key={t.id} style={{ padding:"12px 16px", background:"rgba(255,255,255,0.025)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:10, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:"#8878aa", minWidth:80 }}>{t.trade_date}</span>
                <span style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:"#cc44ff", minWidth:64 }}>{t.instrument}</span>
                <span style={{ fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:4, background:"rgba(204,68,255,0.1)", border:"1px solid rgba(204,68,255,0.2)", color:"#cc44ff" }}>{t.grade}</span>
                <span style={{ fontSize:11, fontWeight:700, padding:"2px 7px", borderRadius:4, background: t.direction==="LONG"?"rgba(127,255,107,0.08)":"rgba(255,107,107,0.08)", border:`1px solid ${t.direction==="LONG"?"rgba(127,255,107,0.2)":"rgba(255,107,107,0.2)"}`, color: t.direction==="LONG"?"#7fff6b":"#ff6b6b" }}>{t.direction}</span>
                <span style={{ fontSize:13, fontWeight:700, color: outcomeColor[t.outcome]||"#8878aa", marginLeft:"auto" }}>{t.outcome}{t.result_usd != null ? ` · $${parseFloat(t.result_usd).toFixed(2)}` : ""}</span>
                <button onClick={()=>startEdit(t)} style={{ fontSize:12, color:"rgba(0,204,255,0.5)", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", padding:"0 4px" }}>✏</button>
                <button onClick={()=>deleteTrade(t.id)} style={{ fontSize:12, color:"rgba(255,107,107,0.4)", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", padding:"0 4px" }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC RESULTS PAGE (no login required)
// ═══════════════════════════════════════════════════════════════════════════
function PublicResultsPage({ onClose, isStandalone = false }) {
  const isMobile = useWindowWidth() <= 768;
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTrade, setExpandedTrade] = useState(null);
  const isOwner = isDevMode();

  const tok = () => { try { return JSON.parse(localStorage.getItem("omniusd_session")||"{}").access_token || SUPABASE_KEY; } catch { return SUPABASE_KEY; } };

  async function deleteTrade(id) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/trades?id=eq.${id}`, {
        method: "DELETE",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok()}` },
      });
      setTrades(t => t.filter(x => x.id !== id));
    } catch {}
  }

  useEffect(() => {
    async function fetchPublic() {
      setLoading(true);
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/trades?select=*&is_public=eq.true&order=trade_date.desc,created_at.desc`,
          { headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" } }
        );
        if (!res.ok) throw new Error("Failed to load.");
        const d = await res.json();
        setTrades(Array.isArray(d) ? d : []);
      } catch(e) { setError("Could not load results. Try again shortly."); }
      setLoading(false);
    }
    fetchPublic();
  }, []);

  // ── Compute stats ──────────────────────────────────────────────────────
  const executed = trades.filter(t => t.outcome !== "MISSED" && t.outcome !== "PASS" && t.outcome !== "CANCELLED");
  const passes   = trades.filter(t => t.outcome === "PASS" || t.grade === "PASS");
  const missed   = trades.filter(t => t.outcome === "MISSED");
  const cancelled = trades.filter(t => t.outcome === "CANCELLED");
  const wins     = executed.filter(t => t.outcome === "WIN");
  const losses   = executed.filter(t => t.outcome === "LOSS");
  const be       = executed.filter(t => t.outcome === "BE");
  const winRate  = executed.length > 0 ? Math.round((wins.length / executed.length) * 100) : 0;
  const totalPnl = executed.reduce((s,t) => s + (parseFloat(t.result_usd)||0), 0);
  const gradeW   = { "A+":4, "A":3, "B":2, "C":1 };
  const gradedT  = executed.filter(t => gradeW[t.grade]);
  const avgGrade = gradedT.length > 0 ? (gradedT.reduce((s,t)=>s+(gradeW[t.grade]||0),0)/gradedT.length) : 0;
  const avgGradeStr = avgGrade >= 3.5 ? "A+" : avgGrade >= 2.5 ? "A" : avgGrade >= 1.5 ? "B" : avgGrade > 0 ? "C" : "—";

  // Group by week
  function weekKey(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    const day = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - ((day+6)%7));
    return mon.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
  }
  const byWeek = {};
  trades.forEach(t => {
    const wk = weekKey(t.trade_date);
    if (!byWeek[wk]) byWeek[wk] = [];
    byWeek[wk].push(t);
  });
  const weeks = Object.entries(byWeek);

  const outcomeColor = { WIN:"#7fff6b", LOSS:"#ff6b6b", BE:"#ffd166", MISSED:"#ff9a3c", PASS:"#8878aa", CANCELLED:"#00ccff" };
  const BG = "#0f0c1e";

  const statCard = (label, value, color="#f0ecff", sub=null) => (
    <div style={{ padding:"16px 18px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, textAlign:"center", flex:1, minWidth:90 }}>
      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:9, color:"#8878aa", letterSpacing:"0.16em", marginBottom:8 }}>{label}</div>
      <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:900, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:"#8878aa", marginTop:5 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", background: isStandalone ? BG : "transparent", minHeight: isStandalone ? "100vh" : "auto", animation:"fadein 0.3s ease both" }}>
      <div style={{ maxWidth:720, margin:"0 auto", padding: isMobile ? "24px 16px 40px" : "40px 24px 60px" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:32 }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <OmniLogo size={28}/>
              <div style={{ fontFamily:"'Space Mono',monospace", fontSize:11, color:"rgba(0,204,255,0.7)", letterSpacing:"0.2em" }}>OMNIUSD.PRO</div>
            </div>
            <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize: isMobile ? 24 : 30, fontWeight:900, color:"#f0ecff", margin:"0 0 6px", lineHeight:1.1 }}>Live Track Record</h1>
            <p style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:"#8878aa", margin:0, lineHeight:1.6 }}>
              Every trade logged in real time. No cherry-picking. No edits after entry.
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:"#8878aa", background:"none", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"6px 12px", cursor:"pointer", flexShrink:0 }}>← Back</button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding:"60px 0", fontFamily:"'Space Mono',monospace", fontSize:13, color:"#8878aa" }}>Loading results...</div>
        ) : error ? (
          <div style={{ textAlign:"center", padding:"60px 0", fontFamily:"'Space Mono',monospace", fontSize:13, color:"#ff6b6b" }}>{error}</div>
        ) : trades.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0" }}>
            <div style={{ fontSize:32, marginBottom:16 }}>📋</div>
            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:14, color:"#8878aa", lineHeight:1.8 }}>Track record starts in April 2026.<br/>Check back soon.</div>
          </div>
        ) : (<>

          {/* Stat summary */}
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:32 }}>
            {statCard("WIN RATE", executed.length > 0 ? `${winRate}%` : "—", winRate >= 60 ? "#7fff6b" : winRate >= 40 ? "#ffd166" : "#ff6b6b")}
            {statCard("RECORD", `${wins.length}-${losses.length}${be.length>0?`-${be.length}`:""}`, "#f0ecff", "W-L-BE")}
            {statCard("PASSES", passes.length, "#8878aa", "discipline wins")}
            {statCard("MISSED", missed.length, "#ff9a3c", "never retested")}
            {statCard("CANCELLED", cancelled.length, "#00ccff", "broker cancelled")}
            {statCard("AVG GRADE", avgGradeStr, "#cc44ff")}
            {statCard("NET P&L", (totalPnl >= 0 ? "+" : "") + "$" + Math.abs(totalPnl).toFixed(0), totalPnl >= 0 ? "#7fff6b" : "#ff6b6b", "USD")}
          </div>

          {/* Disclaimer */}
          <div style={{ padding:"10px 16px", background:"rgba(255,209,102,0.04)", border:"1px solid rgba(255,209,102,0.12)", borderLeft:"3px solid rgba(255,209,102,0.4)", borderRadius:0, marginBottom:28, fontFamily:"'Space Mono',monospace", fontSize:11, color:"rgba(255,209,102,0.65)", lineHeight:1.7 }}>
            Past results do not guarantee future performance. Trade at your own risk. All results shown are from a live account using the BRC methodology.
          </div>

          {/* Weekly trade log */}
          {weeks.map(([week, wTrades]) => {
            const wExec = wTrades.filter(t=>t.outcome!=="MISSED"&&t.outcome!=="PASS"&&t.outcome!=="CANCELLED");
            const wWins = wExec.filter(t=>t.outcome==="WIN").length;
            const wPnl  = wExec.reduce((s,t)=>s+(parseFloat(t.result_usd)||0),0);
            return (
              <div key={week} style={{ marginBottom:24 }}>
                {/* Week header */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <div style={{ fontFamily:"'Space Mono',monospace", fontSize:10, fontWeight:700, color:"#8878aa", letterSpacing:"0.14em" }}>
                    WEEK OF {week.toUpperCase()}
                  </div>
                  <div style={{ display:"flex", gap:10, fontFamily:"'Space Mono',monospace", fontSize:10 }}>
                    <span style={{ color:"#8878aa" }}>{wExec.length} trade{wExec.length!==1?"s":""}</span>
                    {wExec.length>0 && <span style={{ color: wWins/wExec.length>=0.5?"#7fff6b":"#ff6b6b" }}>{Math.round(wWins/wExec.length*100)}% win</span>}
                    {wPnl !== 0 && <span style={{ color: wPnl>=0?"#7fff6b":"#ff6b6b" }}>{wPnl>=0?"+":""}{wPnl.toFixed(2)}</span>}
                  </div>
                </div>

                {/* Trade rows */}
                <div style={{ border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, overflow:"hidden" }}>
                  {wTrades.map((t,i) => {
                    const isOpen = expandedTrade === t.id;
                    const hasNote = !!t.note;
                    return (
                      <div key={t.id} style={{ borderBottom: i<wTrades.length-1?"1px solid rgba(255,255,255,0.05)":"none", background: i%2===0?"rgba(255,255,255,0.01)":"transparent" }}>
                        {/* Main row — always visible */}
                        <div
                          onClick={() => hasNote && setExpandedTrade(isOpen ? null : t.id)}
                          style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 16px", flexWrap:"nowrap", cursor: hasNote ? "pointer" : "default" }}>
                          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:"#8878aa", minWidth:72, flexShrink:0 }}>{t.trade_date}</span>
                          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:700, color:"#cc44ff", minWidth:64, flexShrink:0 }}>{t.instrument}</span>
                          <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:4, background:"rgba(204,68,255,0.08)", border:"1px solid rgba(204,68,255,0.18)", color:"#cc44ff", flexShrink:0 }}>{t.grade}</span>
                          <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:4, flexShrink:0,
                            background: t.direction==="LONG"?"rgba(127,255,107,0.06)":"rgba(255,107,107,0.06)",
                            border:`1px solid ${t.direction==="LONG"?"rgba(127,255,107,0.18)":"rgba(255,107,107,0.18)"}`,
                            color: t.direction==="LONG"?"#7fff6b":"#ff6b6b" }}>{t.direction}</span>
                          {t.rr && <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:"#8878aa", flexShrink:0 }}>{t.rr}</span>}
                          {/* Note preview — single line truncated */}
                          {hasNote && !isOpen && (
                            <span style={{ fontFamily:"'Space Mono',monospace", fontSize:10, color:"rgba(255,255,255,0.3)", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.note}</span>
                          )}
                          {!hasNote && <span style={{ flex:1 }}/>}
                          <span style={{ fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:900, color: outcomeColor[t.outcome]||"#8878aa", flexShrink:0 }}>
                            {t.outcome}{t.result_usd != null ? ` · $${parseFloat(t.result_usd).toFixed(2)}` : ""}
                          </span>
                          {hasNote && (
                            <span style={{ fontSize:12, color:"rgba(255,255,255,0.25)", flexShrink:0, transition:"transform 0.2s", display:"inline-block", transform: isOpen?"rotate(180deg)":"rotate(0deg)" }}>▾</span>
                          )}
                          {isOwner && (
                            <button onClick={e=>{e.stopPropagation();deleteTrade(t.id);}} style={{ fontSize:12, color:"rgba(255,107,107,0.4)", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", padding:"0 4px", flexShrink:0 }}>✕</button>
                          )}
                        </div>
                        {/* Expanded note */}
                        {isOpen && hasNote && (
                          <div style={{ padding:"0 16px 14px 16px", borderTop:"1px solid rgba(255,255,255,0.04)" }}>
                            <div style={{ fontFamily:"'Space Mono',monospace", fontSize:12, color:"rgba(255,255,255,0.65)", lineHeight:1.8, paddingTop:10 }}>
                              {t.note}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Footer note */}
          <div style={{ marginTop:32, textAlign:"center", fontFamily:"'Space Mono',monospace", fontSize:11, color:"rgba(255,255,255,0.2)", lineHeight:1.8 }}>
            Trades logged manually after each NY session · <a href="https://omniusd.pro" style={{ color:"rgba(0,204,255,0.4)", textDecoration:"none" }}>omniusd.pro</a>
          </div>
        </>)}
      </div>
    </div>
  );
}

function HistoryPage({ uid, onClose }) {
  const SESSION_PLANS_KEY = `omniusd_session_plans_${uid}`;
  const EXEC_JOURNAL_KEY  = `omniusd_exec_journal_${uid}`;
  const THIRTY_DAYS_MS    = 30 * 24 * 60 * 60 * 1000;

  function pruneOld(arr) {
    return arr.filter(e => e.savedAt > Date.now() - THIRTY_DAYS_MS);
  }

  const [tab, setTab] = useState("plans"); // plans | journal
  const [plans, setPlans] = useState(() => {
    try { return pruneOld(JSON.parse(localStorage.getItem(SESSION_PLANS_KEY) || "[]")); } catch { return []; }
  });
  const [journal, setJournal] = useState(() => {
    try { return pruneOld(JSON.parse(localStorage.getItem(EXEC_JOURNAL_KEY) || "[]")); } catch { return []; }
  });
  const [expanded, setExpanded] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Restore from cloud on mount if localStorage is empty
  React.useEffect(() => {
    async function restore() {
      if (!uid || uid === "anon") return;
      try {
        const tok = JSON.parse(localStorage.getItem("omniusd_session")||"{}").access_token || SUPABASE_KEY;
        async function pull(type) {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/user_history?user_id=eq.${uid}&type=eq.${type}&select=data`,
            { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok}` } }
          );
          if (!res.ok) return null;
          const rows = await res.json();
          return rows?.length ? JSON.parse(rows[0].data) : null;
        }
        const localPlans = JSON.parse(localStorage.getItem(SESSION_PLANS_KEY) || "[]");
        if (localPlans.length === 0) {
          const cloud = await pull("session_plans");
          if (cloud?.length) { localStorage.setItem(SESSION_PLANS_KEY, JSON.stringify(cloud)); setPlans(pruneOld(cloud)); }
        }
        const localJournal = JSON.parse(localStorage.getItem(EXEC_JOURNAL_KEY) || "[]");
        if (localJournal.length === 0) {
          const cloud = await pull("exec_journal");
          if (cloud?.length) { localStorage.setItem(EXEC_JOURNAL_KEY, JSON.stringify(cloud)); setJournal(pruneOld(cloud)); }
        }
      } catch {}
    }
    restore();
  }, [uid]);

  const entries = tab === "plans" ? plans : journal;
  const storageKey = tab === "plans" ? SESSION_PLANS_KEY : EXEC_JOURNAL_KEY;

  function deleteEntry(id) {
    const updated = entries.filter(e => e.id !== id);
    if (tab === "plans") setPlans(updated);
    else setJournal(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
    setConfirmDelete(null);
    if (expanded === id) setExpanded(null);
  }

  const gradeColor = (g) => {
    if (g === "A+") return "#7fff6b";
    if (g === "PASS" || g === "HARD PASS") return "#ff6b6b";
    if (g === "SOFT PASS") return "#00e5ff";
    return "#ffd166";
  };
  const biasColor = (b) => b === "SHORT" ? "#ff6b6b" : b === "LONG" ? "#7fff6b" : "#ffd166";

  const daysLeft = (savedAt) => {
    const remaining = THIRTY_DAYS_MS - (Date.now() - savedAt);
    return Math.max(0, Math.ceil(remaining / (24*60*60*1000)));
  };

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"28px 20px", animation:"fadein 0.3s ease both" }}>
      <div style={{ maxWidth:600, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, color:"#f0ecff", margin:0 }}>History</h2>
          <button onClick={onClose} style={{ fontFamily:"'Space Mono',monospace", fontSize:12, fontWeight:700, color:"#8878aa", background:"none", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"6px 12px", cursor:"pointer" }}>
            ← Back
          </button>
        </div>

        {/* 30-day notice */}
        <div style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontFamily:"'Space Mono',monospace", marginBottom:20, lineHeight:1.6 }}>
          Plans are automatically saved for 30 days, then deleted. Export or screenshot anything you want to keep.
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:0, marginBottom:20, border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, overflow:"hidden" }}>
          {[
            { key:"plans",   label:"Session Plans",     count: plans.length },
            { key:"journal", label:"Execution Journal", count: journal.length },
          ].map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setExpanded(null); }}
              style={{ flex:1, padding:"10px 8px", border:"none", cursor:"pointer", fontFamily:"'Space Mono',monospace", fontSize:11, fontWeight:700, letterSpacing:"0.06em", transition:"all 0.2s",
                background: tab === t.key ? "rgba(255,107,255,0.12)" : "rgba(255,255,255,0.02)",
                color: tab === t.key ? "#ff6bff" : "rgba(255,255,255,0.4)",
                borderRight: t.key === "plans" ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
              {t.label}
              <span style={{ marginLeft:6, fontSize:10, padding:"1px 6px", borderRadius:10,
                background: tab === t.key ? "rgba(255,107,255,0.2)" : "rgba(255,255,255,0.06)",
                color: tab === t.key ? "#ff6bff" : "rgba(255,255,255,0.35)" }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Tab description */}
        <div style={{ fontSize:11, color:"rgba(255,255,255,0.38)", fontFamily:"'Space Mono',monospace", marginBottom:16, lineHeight:1.7 }}>
          {tab === "plans"
            ? "Every plan you've generated — all grades, auto-saved. One per instrument per day."
            : "Setups you went live with. Saved automatically when you start a live session."}
        </div>

        {/* Stats bar */}
        {entries.length > 0 && (
          <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
            {[
              { label:"TOTAL", val: entries.length, color:"#ff6bff" },
              { label:"A+",    val: entries.filter(e=>e.grade==="A+").length, color:"#7fff6b" },
              { label:"PASS",  val: entries.filter(e=>e.grade==="PASS"||e.grade==="HARD PASS").length, color:"#ff6b6b" },
              { label:"OTHER", val: entries.filter(e=>e.grade!=="A+"&&e.grade!=="PASS"&&e.grade!=="HARD PASS").length, color:"#ffd166" },
            ].filter(s => s.val > 0).map(s => (
              <div key={s.label} style={{ padding:"6px 12px", background:`${s.color}08`, border:`1px solid ${s.color}22`, borderRadius:7 }}>
                <div style={{ fontSize:8, color:`${s.color}99`, letterSpacing:"0.12em", fontFamily:"'Space Mono',monospace", marginBottom:2 }}>{s.label}</div>
                <div style={{ fontSize:15, fontWeight:900, color:s.color }}>{s.val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {entries.length === 0 && (
          <div style={{ textAlign:"center", padding:"48px 24px" }}>
            <div style={{ fontSize:32, marginBottom:16 }}>{tab === "plans" ? "📊" : "⚡"}</div>
            <div style={{ fontSize:13, fontWeight:700, color:"rgba(255,255,255,0.7)", marginBottom:8 }}>
              {tab === "plans" ? "No session plans yet" : "No live sessions yet"}
            </div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", fontFamily:"'Space Mono',monospace", lineHeight:1.8 }}>
              {tab === "plans"
                ? "Every plan you generate is automatically saved here."
                : "Plans you go live with are saved here automatically."}
            </div>
          </div>
        )}

        {/* Entry list */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {entries.map(entry => {
            const isOpen = expanded === entry.id;
            const gc = gradeColor(entry.grade);
            const bc = biasColor(entry.bias);
            const dl = daysLeft(entry.savedAt);
            return (
              <div key={entry.id} style={{ background:"rgba(255,255,255,0.03)", border:`1px solid ${isOpen ? `${gc}33` : "rgba(255,255,255,0.07)"}`, borderRadius:12, overflow:"hidden", transition:"border 0.2s" }}>

                {/* Row header */}
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 14px", cursor:"pointer" }}
                  onClick={() => setExpanded(isOpen ? null : entry.id)}>

                  {/* Grade badge */}
                  <div style={{ width:38, height:38, borderRadius:8, background:`${gc}12`, border:`1px solid ${gc}33`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <span style={{ fontSize:11, fontWeight:900, color:gc, fontFamily:"'Space Mono',monospace", textAlign:"center", lineHeight:1.1 }}>
                      {entry.grade === "SOFT PASS" ? "SOFT\nPASS" : entry.grade}
                    </span>
                  </div>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3, flexWrap:"wrap" }}>
                      <span style={{ fontSize:13, fontWeight:700, color:"#f0ecff" }}>{entry.instrument}</span>
                      <span style={{ fontSize:11, fontWeight:700, padding:"1px 6px", borderRadius:4, background:`${bc}14`, border:`1px solid ${bc}33`, color:bc }}>{entry.bias}</span>
                      {entry._scoutMode && <span style={{ fontSize:9, color:"#00e5ff", fontFamily:"'Space Mono',monospace" }}>🔭 SCOUT</span>}
                      {entry._londonMode && <span style={{ fontSize:9, color:"#00e5ff", fontFamily:"'Space Mono',monospace" }}>🌐 LONDON</span>}
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontFamily:"'Space Mono',monospace" }}>{entry.date}</span>
                      <span style={{ fontSize:9, color:"rgba(255,255,255,0.2)", fontFamily:"'Space Mono',monospace" }}>{entry.time} {getUserTZShort()}</span>
                    </div>
                  </div>

                  {/* Trigger + days left */}
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    {entry.trigger_level && (
                      <>
                        <div style={{ fontSize:8, color:"rgba(255,255,255,0.3)", fontFamily:"'Space Mono',monospace", marginBottom:1 }}>ENTRY</div>
                        <div style={{ fontSize:13, fontWeight:700, color:bc, fontFamily:"monospace" }}>{(entry.trigger_level||"").match(/^[\d,\.]+/)?.[0]||entry.trigger_level}</div>
                      </>
                    )}
                    <div style={{ fontSize:9, color: dl <= 3 ? "#ff9a3c" : "rgba(255,255,255,0.2)", fontFamily:"'Space Mono',monospace", marginTop:2 }}>
                      {dl <= 3 ? `⚠ ${dl}d left` : `${dl}d left`}
                    </div>
                  </div>

                  <span style={{ fontSize:13, color:"rgba(255,255,255,0.4)", flexShrink:0, transform:isOpen?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▾</span>
                </div>

                {/* Expanded */}
                {isOpen && (
                  <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", padding:"14px" }}>

                    {/* Summary */}
                    {entry.summary && (
                      <div style={{ padding:"10px 12px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, marginBottom:12, fontSize:12, color:"rgba(255,255,255,0.62)", lineHeight:1.8 }}>
                        {entry.summary}
                      </div>
                    )}

                    {/* Confidence + R:R */}
                    {entry.confidence_score && (
                      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
                        <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontFamily:"'Space Mono',monospace" }}>CONFIDENCE</span>
                        <span style={{ fontSize:13, fontWeight:700, color:"#ffd166", fontFamily:"monospace" }}>{entry.confidence_score}%</span>
                        {entry.session && <span style={{ fontSize:10, color:"rgba(255,255,255,0.3)", fontFamily:"'Space Mono',monospace" }}>· {entry.session} SESSION</span>}
                        {entry.risk_reward && <>
                          <span style={{ fontSize:10, color:"rgba(255,255,255,0.18)", fontFamily:"'Space Mono',monospace" }}>·</span>
                          <span style={{ fontSize:10, color:"rgba(255,255,255,0.35)", fontFamily:"'Space Mono',monospace" }}>R:R</span>
                          <span style={{ fontSize:13, fontWeight:700, color:"#00e5ff", fontFamily:"monospace" }}>{entry.risk_reward}</span>
                        </>}
                      </div>
                    )}

                    {/* Levels — Row 1: ENTRY / STOP / TP1 (price only) */}
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:5, marginBottom:5 }}>
                      {[
                        { label:"ENTRY",  val:(entry.trigger_level||"").match(/^[\d,\.]+/)?.[0]||entry.trigger_level, color:bc },
                        { label:"STOP",   val:entry.stop_loss,  color:"#ff6b6b" },
                        { label:"TP1",    val:entry.tp1,        color:"#7fff6b" },
                      ].filter(r => r.val).map(r => (
                        <div key={r.label} style={{ padding:"6px 8px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:7 }}>
                          <div style={{ fontSize:7, color:"rgba(255,255,255,0.35)", fontFamily:"'Space Mono',monospace", letterSpacing:"0.1em", marginBottom:2 }}>{r.label}</div>
                          <div style={{ fontSize:13, fontWeight:700, color:r.color, fontFamily:"monospace" }}>{r.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Levels — Row 2: TP2 / RUNNER (wider cards) */}
                    {(entry.tp2 || entry.runner) && (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:5, marginBottom:5 }}>
                        {[
                          { label:"TP2",    val:entry.tp2,    color:"#7fff6b", sub:"Second target" },
                          { label:"RUNNER", val:entry.runner, color:"#00e5ff", sub:"Full structure target" },
                        ].filter(r => r.val).map(r => (
                          <div key={r.label} style={{ padding:"6px 10px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:7, display:"flex", flexDirection:"column", gap:1 }}>
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                              <div style={{ fontSize:7, color:"rgba(255,255,255,0.35)", fontFamily:"'Space Mono',monospace", letterSpacing:"0.1em" }}>{r.label}</div>
                              <div style={{ fontSize:8, color:"rgba(255,255,255,0.2)", fontFamily:"'Space Mono',monospace" }}>{r.sub}</div>
                            </div>
                            <div style={{ fontSize:15, fontWeight:900, color:r.val?r.color:"rgba(255,255,255,0.2)", fontFamily:"monospace" }}>{r.val||"—"}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Retest — full text preserved */}
                    {entry.retest_zone && (
                      <div style={{ padding:"8px 10px", background:"rgba(255,209,102,0.04)", border:"1px solid rgba(255,209,102,0.14)", borderRadius:7, marginBottom:12 }}>
                        <div style={{ fontSize:7, color:"rgba(255,255,255,0.35)", fontFamily:"'Space Mono',monospace", letterSpacing:"0.1em", marginBottom:3 }}>RETEST</div>
                        <div style={{ fontSize:13, fontWeight:700, color:"#ffd166", fontFamily:"monospace", lineHeight:1.5 }}>{entry.retest_zone}</div>
                      </div>
                    )}

                    {/* Delete */}
                    {confirmDelete === entry.id ? (
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontSize:11, color:"rgba(255,107,107,0.8)", fontFamily:"'Space Mono',monospace" }}>Delete this entry?</span>
                        <button onClick={() => deleteEntry(entry.id)}
                          style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:6, border:"1px solid rgba(255,107,107,0.4)", background:"rgba(255,107,107,0.1)", color:"#ff6b6b", cursor:"pointer", fontFamily:"inherit" }}>
                          Delete
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:6, border:"1px solid rgba(255,255,255,0.1)", background:"none", color:"#8878aa", cursor:"pointer", fontFamily:"inherit" }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(entry.id)}
                        style={{ fontSize:11, color:"rgba(255,107,107,0.4)", background:"none", border:"none", cursor:"pointer", fontFamily:"'Space Mono',monospace" }}>
                        🗑 Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

function SoftPassScenariosPanel({ plan, onActivate }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(null);
  if (!plan?.soft_pass_scenarios) return null;
  const { bull, bear } = plan.soft_pass_scenarios;

  function handleActivate(s, bias) {
    if (confirming === bias) {
      setConfirming(null);
      onActivate && onActivate(s, bias);
    } else {
      setConfirming(bias);
    }
  }

  const ScenarioCard = ({ s, type }) => {
    if (!s?.trigger) return null;
    const isBull = type === "bull";
    const color = isBull ? "#7fff6b" : "#ff6b6b";
    const bias = isBull ? "LONG" : "SHORT";
    const dir = isBull ? "above" : "below";
    const isConfirming = confirming === bias;

    return (
      <div style={{ padding:"10px 14px", background:`${color}08`, border:`1px solid ${isConfirming ? color : color+"33"}`, borderRadius:10, marginBottom:8, transition:"border 0.2s" }}>
        {/* Header row */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <span style={{ fontSize:11, fontWeight:900, letterSpacing:"0.12em", color, fontFamily:"'Space Mono',monospace" }}>{isBull ? "🟢 BULL" : "🔴 BEAR"}</span>
          <span style={{ fontSize:11, padding:"2px 8px", borderRadius:4, background:`${color}14`, border:`1px solid ${color}33`, color, fontFamily:"'Space Mono',monospace", fontWeight:700 }}>{bias}</span>
        </div>
        {/* Trigger line — simplified */}
        <div style={{ fontSize:14, fontWeight:700, color, marginBottom:8, fontFamily:"monospace" }}>
          30M close {dir} {s.trigger} activates {bias}
        </div>
        {/* Level cards — tighter */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:5, marginBottom:10 }}>
          {s.stop && <div style={{ padding:"6px 10px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:7 }}>
            <div style={{ fontSize:9, color:"#8878aa", letterSpacing:"0.1em", marginBottom:2 }}>STOP</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#ff6b6b", fontFamily:"monospace" }}>{s.stop}</div>
          </div>}
          {s.tp1 && <div style={{ padding:"6px 10px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:7 }}>
            <div style={{ fontSize:9, color:"#8878aa", letterSpacing:"0.1em", marginBottom:2 }}>TP1</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#7fff6b", fontFamily:"monospace" }}>{s.tp1}</div>
          </div>}
        </div>
        {isConfirming && (
          <div style={{ padding:"8px 12px", background:"rgba(255,209,102,0.08)", border:"1px solid rgba(255,209,102,0.3)", borderRadius:8, marginBottom:8, fontSize:11, color:"rgba(255,209,102,0.9)", lineHeight:1.7, fontFamily:"'Space Mono',monospace" }}>
            ⚠ Based on pre-market structure. If price opens differently — trust the charts. Tap again to confirm.
          </div>
        )}
        <button onClick={() => handleActivate(s, bias)}
          style={{ width:"100%", padding:"10px", borderRadius:8,
            background: isConfirming ? (isBull ? "linear-gradient(135deg,#7fff6b,#00bb66)" : "linear-gradient(135deg,#ff6b6b,#bb0000)") : `${color}18`,
            color: isConfirming ? "#fff" : color,
            fontSize:12, fontWeight:700, letterSpacing:"0.06em",
            fontFamily:"inherit", cursor:"pointer",
            border: isConfirming ? "none" : `1px solid ${color}44`,
            transition:"all 0.2s" }}>
          {isConfirming ? `Confirm ${bias === "LONG" ? "Long" : "Short"} →` : `Confirm ${bias === "LONG" ? "Long" : "Short"} Scenario`}
        </button>
        {isConfirming && (
          <button onClick={() => setConfirming(null)}
            style={{ width:"100%", marginTop:5, padding:"6px", borderRadius:6, border:"none", background:"none", color:"rgba(255,255,255,0.48)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
            Cancel
          </button>
        )}
        {/* Alert pill */}
        {s.trigger && (
          <div style={{ marginTop:10, display:"inline-flex", alignItems:"center", gap:7, padding:"7px 14px", background:`${color}12`, border:`1px solid ${color}44`, borderRadius:20, cursor:"default" }}>
            <span style={{ fontSize:12 }}>🔔</span>
            <span style={{ fontSize:12, fontWeight:700, color, fontFamily:"'Space Mono',monospace", letterSpacing:"0.04em" }}>
              SET ALERT — {s.trigger}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginBottom:16 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius: open ? "10px 10px 0 0" : 10, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14 }}>🟡</span>
          <span style={{ fontSize:13, fontWeight:700, color:"#f0ecff", letterSpacing:"0.04em" }}>If Price Confirms</span>
          <span style={{ fontSize:11, color:"#8878aa", fontFamily:"'Space Mono',monospace" }}>Tap to {open ? "close" : "expand"}</span>
        </div>
        <span style={{ fontSize:16, color:"#00e5ff", transition:"transform 0.2s", transform: open ? "rotate(45deg)" : "none", display:"inline-block" }}>+</span>
      </button>
      {open && (
        <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)", borderTop:"none", borderRadius:"0 0 10px 10px", padding:"14px", animation:"fadein 0.25s ease both" }}>
          <ScenarioCard s={bull} type="bull" />
          <ScenarioCard s={bear} type="bear" />
          <div style={{ padding:"8px 12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, fontSize:11, color:"rgba(255,255,255,0.48)", fontFamily:"'Space Mono',monospace", lineHeight:1.7 }}>
            Only confirm after the 30M candle fully closes at the trigger. Wicks don't count.
          </div>
        </div>
      )}
    </div>
  );
}

function FullAnalysisPanel({ plan }) {
  const [open, setOpen] = useState(false);
  if (!plan) return null;

  const isBull = plan.bias === "LONG";
  const isShort = plan.bias === "SHORT";
  const biasColor = isBull ? "#7fff6b" : isShort ? "#ff6b6b" : "#ffd166";
  const biasEmoji = isBull ? "🟢" : isShort ? "🔴" : "🟡";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" });

  const Row = ({ label, value, color="#f0ecff" }) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontSize:14, color:"rgba(255,255,255,0.85)", fontFamily:"'Space Mono',monospace" }}>{label}</span>
      <span style={{ fontSize:14, fontWeight:700, color, fontFamily:"monospace" }}>{value || "—"}</span>
    </div>
  );

  const SectionHeader = ({ icon, label, color="#8878aa" }) => (
    <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.16em", color, marginBottom:12, marginTop:20, fontFamily:"'Space Mono',monospace", display:"flex", alignItems:"center", gap:6 }}>
      <span>{icon}</span> {label}
    </div>
  );

  const divider = <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"16px 0" }}/>;

  const StatusRow = ({ label, status }) => {
    const color = status === "✅" ? "#7fff6b" : status === "🔴" || status === "❌" ? "#ff6b6b" : "#ffd166";
    return (
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ fontSize:14, color:"rgba(255,255,255,0.8)", fontFamily:"'Space Mono',monospace" }}>{label}</span>
        <span style={{ fontSize:14, color }}>{status}</span>
      </div>
    );
  };

  return (
    <div style={{ marginTop:16 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius: open ? "10px 10px 0 0" : 10, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14 }}>📊</span>
          <span style={{ fontSize:14, fontWeight:700, color:"#f0ecff", letterSpacing:"0.04em" }}>Full Analysis & Breakdown</span>
          <span style={{ fontSize:13, color:"#8878aa", fontFamily:"'Space Mono',monospace" }}>Tap to {open ? "close" : "expand"}</span>
        </div>
        <span style={{ fontSize:16, color:"#ff6bff", transition:"transform 0.2s", transform: open ? "rotate(45deg)" : "none", display:"inline-block" }}>+</span>
      </button>

      {open && (
        <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.08)", borderTop:"none", borderRadius:"0 0 10px 10px", padding:"20px 18px", animation:"fadein 0.25s ease both" }}>

          {/* ── HEADER ── */}
          <div style={{ padding:"12px 16px", background:"rgba(255,107,255,0.05)", border:"1px solid rgba(255,107,255,0.2)", borderRadius:8, marginBottom:20, textAlign:"center" }}>
            <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.18em", color:"#ff6bff", marginBottom:4, fontFamily:"'Space Mono',monospace" }}>🏆 OMNIUSD — FULL ANALYSIS</div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.85)", fontFamily:"'Space Mono',monospace" }}>
              {plan.instrument} · {dateStr} · {plan.session_note?.split("—")[0]?.trim() || "NY Session"}
            </div>
          </div>

          {/* ── MARKET STRUCTURE & BRC PHASES ── */}
          <SectionHeader icon="📊" label="MARKET STRUCTURE & BRC PHASES" color="#00e5ff"/>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {[
              { tf:"Daily", key:"daily", color:"#ff6bff" },
              { tf:"4H",    key:"four_hour", color:"#00e5ff" },
              { tf:"1H",    key:"one_hour", color:"#7fff6b" },
              { tf:"30M",   key:"m30", color:"#ffd166" },
              { tf:"15M",   key:"m15", color:"#ff9a3c" },
            ].map(({ tf, key, color }) => {
              const tfData = plan.timeframe_reads?.[key] || plan.plain_english?.[key];
              const text = typeof tfData === "object"
                ? `${tfData.bias || ""} — ${tfData.structure || ""} ${tfData.key_level ? `| Key: ${tfData.key_level}` : ""}`.trim()
                : tfData || (tf === "Daily" ? plan.market_structure : null);
              if (!text) return null;
              return (
                <div key={tf} style={{ padding:"10px 14px", background:"rgba(255,255,255,0.02)", border:`1px solid ${color}22`, borderLeft:`3px solid ${color}`, borderRadius:0 }}>
                  <div style={{ fontSize:13, fontWeight:900, color, letterSpacing:"0.1em", marginBottom:4, fontFamily:"'Space Mono',monospace" }}>{tf}</div>
                  <div style={{ fontSize:14, color:"rgba(255,255,255,0.8)", lineHeight:1.8 }}>{text}</div>
                </div>
              );
            })}
          </div>

          {/* BRC Phase steps */}
          <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.12em", color:"#ff6bff", fontFamily:"'Space Mono',monospace", marginBottom:4 }}>BRC PHASE</div>
            {[
              { step:"Break",        price: plan.trigger_level, done: plan.brc_phase === "RETEST_COOKING" || plan.brc_phase === "CONTINUATION" },
              { step:"Correction",   price: plan.retest_zone,   done: plan.brc_phase === "CONTINUATION" },
              { step:"Continuation", price: plan.trigger_level, done: false },
            ].map(({ step, price, done }) => (
              <div key={step} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:14, flexShrink:0 }}>{done ? "✅" : "⏳"}</span>
                <span style={{ fontSize:14, color: done ? "#7fff6b" : "rgba(255,255,255,0.8)", fontFamily:"'Space Mono',monospace" }}>
                  {step}{price ? `: ${price}` : ""}
                </span>
              </div>
            ))}
          </div>

          {divider}

          {/* ── KEY LEVELS TABLE ── */}
          <SectionHeader icon="🎯" label="KEY LEVELS" color="#ffd166"/>
          <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
            {plan.key_levels && plan.key_levels.length > 0
              ? plan.key_levels.map((lvl, i) => {
                  const isRes = lvl.toLowerCase().includes("resistance") || lvl.toLowerCase().includes("resist");
                  const isSupp = lvl.toLowerCase().includes("support");
                  const isCrit = lvl.toLowerCase().includes("critical") || lvl.toLowerCase().includes("trigger");
                  const dot = isRes ? "🔴" : isSupp ? "🟢" : isCrit ? "🟡" : "→";
                  return (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 0", borderBottom: i < plan.key_levels.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <span style={{ flexShrink:0, fontSize:11 }}>{dot}</span>
                      <span style={{ fontSize:14, color:"rgba(255,255,255,0.8)", lineHeight:1.6 }}>{lvl}</span>
                    </div>
                  );
                })
              : [
                  plan.trigger_level && { label:"🟡 Trigger Level", val: plan.trigger_level },
                  plan.retest_zone   && { label:"🟡 Retest Zone",   val: plan.retest_zone },
                  plan.stop_loss     && { label:"🔴 Stop Loss",     val: plan.stop_loss },
                  plan.tp1           && { label:"🟢 TP1",           val: plan.tp1 },
                  plan.tp2           && { label:"🟢 TP2",           val: plan.tp2 },
                ].filter(Boolean).map((r, i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize:14, color:"rgba(255,255,255,0.85)" }}>{r.label}</span>
                    <span style={{ fontSize:14, fontWeight:700, color:"#ffd166", fontFamily:"monospace" }}>{r.val}</span>
                  </div>
                ))
            }
          </div>

          {divider}

          {/* ── TRADE PLAN ── */}
          {plan.grade !== "PASS" && plan.grade !== "SOFT PASS" && (
            <>
              <SectionHeader icon="⚔️" label="ACTIONABLE TRADE PLAN" color="#7fff6b"/>

              <div style={{ fontSize:14, fontWeight:700, color: biasColor, marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:14 }}>{biasEmoji}</span>
                BIAS: {plan.bias === "LONG" ? "BULLISH" : plan.bias === "SHORT" ? "BEARISH" : "NEUTRAL"}
              </div>

              {/* 3-step plan */}
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
                {[
                  { n:1, label:"Break",   desc:`30M closes ${isShort?"below":"above"} ${plan.trigger_level} → note it, do NOT enter` },
                  { n:2, label:"Retest",  desc:`Price returns to ${plan.retest_zone || "the retest zone"} → watch closely` },
                  { n:3, label:"Confirm", desc:`30M closes ${isShort?"below":"above"} ${plan.trigger_level} AGAIN → PLACE LIMIT` },
                ].map(({ n, label, desc }) => (
                  <div key={n} style={{ display:"flex", gap:12, padding:"10px 14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:"rgba(255,107,255,0.15)", border:"1px solid rgba(255,107,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <span style={{ fontSize:13, fontWeight:900, color:"#ff6bff" }}>{n}</span>
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#f0ecff", marginBottom:2, letterSpacing:"0.06em" }}>Step {n} — {label}</div>
                      <div style={{ fontSize:14, color:"rgba(255,255,255,0.8)", lineHeight:1.6 }}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Level table */}
              <div style={{ marginBottom:14 }}>
                <Row label={`📍 ${isShort?"SELL":"BUY"} LIMIT`}  value={plan.retest_zone || plan.trigger_level} color={biasColor} />
                <Row label="🛑 Stop Loss"  value={plan.stop_loss} color="#ff6b6b" />
                <Row label="🎯 TP1"        value={plan.tp1}       color="#7fff6b" />
                <Row label="🎯 TP2"        value={plan.tp2}       color="#7fff6b" />
                <Row label="🏃 Runner"     value={plan.runner}    color="#00e5ff" />
              </div>

              {/* Alert levels */}
              {plan.alert_levels && plan.alert_levels.length > 0 && (
                <div style={{ padding:"12px 14px", background:"rgba(255,209,102,0.04)", border:"1px solid rgba(255,209,102,0.15)", borderRadius:8, marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.12em", color:"#ffd166", marginBottom:8, fontFamily:"'Space Mono',monospace" }}>🔔 ALERT LEVELS</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    {plan.alert_levels.map((a, i) => (
                      <div key={i} style={{ fontSize:14, color:"rgba(255,255,255,0.85)", display:"flex", gap:8 }}>
                        <span style={{ color:"#ffd166", flexShrink:0 }}>Alert {i+1}:</span>
                        <span style={{ fontFamily:"monospace", fontWeight:700, color:"#ffd166" }}>{a}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {divider}
            </>
          )}

          {/* ── FINAL VERDICT ── */}
          <SectionHeader icon="✅" label="FINAL VERDICT" color="#7fff6b"/>

          <div style={{ padding:"12px 14px", background: plan.grade === "A+" ? "rgba(127,255,107,0.06)" : plan.grade === "PASS" ? "rgba(136,120,170,0.06)" : "rgba(255,209,102,0.06)", border:`1px solid ${plan.grade === "A+" ? "rgba(127,255,107,0.25)" : plan.grade === "PASS" ? "rgba(136,120,170,0.2)" : "rgba(255,209,102,0.2)"}`, borderRadius:8, marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <div style={{ fontSize:14, fontWeight:900, color: biasColor, letterSpacing:"0.1em", fontFamily:"'Space Mono',monospace" }}>
                GRADE: {plan.grade === "A+" ? "🟢 A+ EXECUTE" : plan.grade === "PASS" ? "🔴 HARD PASS" : plan.grade === "SOFT PASS" ? "🟡 SOFT PASS" : `🟡 ${plan.grade}`}
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:"#ffd166", fontFamily:"monospace" }}>
                {plan.confidence_score}%
              </div>
            </div>

            {/* Factor checklist */}
            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
              {[
                { label:"Daily macro bias",    status: plan.bias !== "NEUTRAL" ? "✅" : "⚠️" },
                { label:"3TF alignment",        status: plan.grade === "A+" ? "✅" : plan.grade === "B" ? "⚠️" : plan.grade === "PASS" ? "🔴" : "⚠️" },
                { label:"BRC sequence",         status: plan.brc_phase === "CONTINUATION" ? "✅" : plan.brc_phase === "RETEST_COOKING" ? "⏳" : "❌" },
                { label:"R:R minimum 1.5:1",    status: plan.grade === "A+" || plan.grade === "A" ? "✅" : "⚠️" },
                { label:"Session timing",       status: plan.session_note?.toLowerCase().includes("not") ? "⚠️" : "✅" },
                { label:"30M trigger defined",  status: plan.trigger_level ? "✅" : "❌" },
              ].map(({ label, status }) => (
                <StatusRow key={label} label={label} status={status} />
              ))}
            </div>
          </div>

          {/* THE WHY */}
          <div style={{ padding:"12px 14px", background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.15)", borderLeft:"3px solid #00e5ff", borderRadius:0, marginBottom:14 }}>
            <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.16em", color:"#00e5ff", marginBottom:8, fontFamily:"'Space Mono',monospace" }}>THE WHY</div>
            <div style={{ fontSize:14, color:"rgba(255,255,255,0.8)", lineHeight:1.9 }}>
              {plan.confidence_reason || plan.plain_english?.trade_plan || plan.plain_english?.verdict || plan.summary}
            </div>
          </div>

          {/* DEDUCTIONS */}
          {plan.what_still_needed && plan.what_still_needed.length > 0 && (
            <div style={{ padding:"12px 14px", background:"rgba(255,154,60,0.04)", border:"1px solid rgba(255,154,60,0.15)", borderLeft:"3px solid #ff9a3c", borderRadius:0, marginBottom:14 }}>
              <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.14em", color:"#ff9a3c", marginBottom:8, fontFamily:"'Space Mono',monospace" }}>DEDUCTIONS / WHAT STILL NEEDED</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {plan.what_still_needed.map((d, i) => (
                  <div key={i} style={{ display:"flex", gap:8, fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:1.6 }}>
                    <span style={{ color:"#ff9a3c", flexShrink:0 }}>→</span>
                    <span>{d}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {divider}

          {/* ── PSYCHOLOGICAL RULE ── */}
          <div style={{ padding:"14px 16px", background:"rgba(255,107,255,0.05)", border:"1px solid rgba(255,107,255,0.2)", borderRadius:8 }}>
            <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.16em", color:"#ff6bff", marginBottom:10, fontFamily:"'Space Mono',monospace" }}>🧠 PSYCHOLOGICAL RULE</div>
            <div style={{ fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:2, fontStyle:"italic" }}>
              "The 15-minute warning gets me ready. The 30-minute close puts me in the trade. No 30-minute close, no trade. Pre-market movement is information — not permission."
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function UnifiedDashboard({profile, onJournalEntry, onOpenJournal, onSignOut}) {
  // User-scoped storage keys — prevents session bleed between accounts on same device
  const _session = JSON.parse(localStorage.getItem("omniusd_session") || "{}");
  const _uid = _session.user?.id || _session.user_id || "anon";
  const SESSIONS_KEY = `omniusd_sessions_${_uid}`; // Map of instrument → session data

  // ── Cloud sync for active sessions ───────────────────────────────────────
  async function pushSessionsToCloud(data) {
    if (!_uid || _uid === "anon") return;
    try {
      const tok = JSON.parse(localStorage.getItem("omniusd_session")||"{}").access_token || SUPABASE_KEY;
      await fetch(`${SUPABASE_URL}/rest/v1/user_history`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok}`, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: _uid, type: "active_sessions", data: JSON.stringify(data), updated_at: new Date().toISOString() }),
      });
    } catch {}
  }

  async function pullSessionsFromCloud() {
    if (!_uid || _uid === "anon") return null;
    try {
      const tok = JSON.parse(localStorage.getItem("omniusd_session")||"{}").access_token || SUPABASE_KEY;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/user_history?user_id=eq.${_uid}&type=eq.active_sessions&select=data`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok}` } });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows?.length ? JSON.parse(rows[0].data) : null;
    } catch { return null; }
  }

  // Helpers for the sessions map
  function loadSessions() {
    try { return JSON.parse(localStorage.getItem(SESSIONS_KEY) || "{}"); } catch { return {}; }
  }
  function saveSession(instr, data) {
    try {
      const all = loadSessions();
      all[instr] = { ...data, savedAt: new Date().toISOString() };
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
      pushSessionsToCloud(all); // async fire-and-forget
    } catch(e) {}
  }
  function clearSession(instr) {
    try {
      const all = loadSessions();
      delete all[instr];
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
      pushSessionsToCloud(all);
    } catch(e) {}
  }
  function getSessionForInstrument(instr) {
    const all = loadSessions();
    return all[instr] || null;
  }
  // Cooldown check — 2 hours from savedAt
  const COOLDOWN_MS_LOCAL = 2 * 60 * 60 * 1000;

  // ── History helpers ─────────────────────────────────────────────────────────
  const SESSION_PLANS_KEY = `omniusd_session_plans_${_uid}`;
  const EXEC_JOURNAL_KEY  = `omniusd_exec_journal_${_uid}`;
  const THIRTY_DAYS_MS    = 30 * 24 * 60 * 60 * 1000;

  function pruneOld(entries) {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    return entries.filter(e => e.savedAt > cutoff);
  }

  // ── Supabase cloud sync helpers ───────────────────────────────────────────
  async function pushToCloud(type, data) {
    // type = "session_plans" | "exec_journal"
    if (!_uid || _uid === "anon") return;
    try {
      const tok = JSON.parse(localStorage.getItem("omniusd_session")||"{}").access_token || SUPABASE_KEY;
      await fetch(`${SUPABASE_URL}/rest/v1/user_history`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${tok}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          user_id: _uid,
          type,
          data: JSON.stringify(data),
          updated_at: new Date().toISOString(),
        }),
      });
    } catch {}
  }

  async function pullFromCloud(type) {
    if (!_uid || _uid === "anon") return null;
    try {
      const tok = JSON.parse(localStorage.getItem("omniusd_session")||"{}").access_token || SUPABASE_KEY;
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_history?user_id=eq.${_uid}&type=eq.${type}&select=data`,
        { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${tok}` } }
      );
      if (!res.ok) return null;
      const rows = await res.json();
      if (!rows?.length) return null;
      return JSON.parse(rows[0].data);
    } catch { return null; }
  }

  function autoSavePlan(planObj) {
    // Auto-saves every plan (all grades) as a lightweight summary
    if (!planObj || planObj._blocked || planObj.grade === "BLOCKED") return;
    try {
      const raw = JSON.parse(localStorage.getItem(SESSION_PLANS_KEY) || "[]");
      const pruned = pruneOld(raw);
      const entry = {
        id: Date.now(),
        savedAt: Date.now(),
        date: new Date().toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" }),
        time: getCTTime().str,
        instrument: planObj.instrument,
        grade: planObj.grade,
        bias: planObj.bias || "NEUTRAL",
        session: selectedSession,
        trigger_level: planObj.trigger_level || null,
        stop_loss: planObj.stop_loss || null,
        tp1: planObj.tp1 || null,
        retest_zone: planObj.retest_zone || null,
        confidence_score: planObj.confidence_score || null,
        summary: planObj.summary || planObj.pass_reason || null,
        brc_phase: planObj.brc_phase || null,
        _scoutMode: planObj._scoutMode || false,
        _londonMode: planObj._londonMode || false,
      };
      // Avoid duplicate saves for same instrument+date
      const today = new Date().toDateString();
      const alreadySaved = pruned.some(e =>
        e.instrument === entry.instrument &&
        new Date(e.savedAt).toDateString() === today
      );
      if (alreadySaved) return; // one plan per instrument per day
      const updated = [entry, ...pruned].slice(0, 90); // hard cap 90 entries
      localStorage.setItem(SESSION_PLANS_KEY, JSON.stringify(updated));
      pushToCloud("session_plans", updated); // async, fire-and-forget
    } catch(e) {}
  }

  function saveExecutionJournal(planObj) {
    // Saves when user starts a live session — any grade
    if (!planObj || planObj._blocked) return;
    try {
      const raw = JSON.parse(localStorage.getItem(EXEC_JOURNAL_KEY) || "[]");
      const pruned = pruneOld(raw);
      const entry = {
        id: Date.now(),
        savedAt: Date.now(),
        date: new Date().toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric", year:"numeric" }),
        time: getCTTime().str,
        instrument: planObj.instrument,
        grade: planObj.grade,
        bias: planObj.bias || "NEUTRAL",
        session: selectedSession,
        trigger_level: planObj.trigger_level || null,
        stop_loss: planObj.stop_loss || null,
        tp1: planObj.tp1 || null,
        tp2: planObj.tp2 || null,
        runner: planObj.runner || null,
        retest_zone: planObj.retest_zone || null,
        confidence_score: planObj.confidence_score || null,
        risk_reward: planObj.risk_reward || null,
        summary: planObj.summary || null,
        result: null, // filled in manually later
      };
      const updated = [entry, ...pruned].slice(0, 90);
      localStorage.setItem(EXEC_JOURNAL_KEY, JSON.stringify(updated));
      pushToCloud("exec_journal", updated); // async, fire-and-forget
    } catch(e) {}
  }

  function saveToHistory(planObj) {
    autoSavePlan(planObj);
  }

  // ── On mount: restore from cloud if localStorage is empty ─────────────────
  React.useEffect(() => {
    async function restoreFromCloud() {
      if (!_uid || _uid === "anon") return;
      try {
        const localPlans = JSON.parse(localStorage.getItem(SESSION_PLANS_KEY) || "[]");
        if (localPlans.length === 0) {
          const cloudPlans = await pullFromCloud("session_plans");
          if (cloudPlans?.length) localStorage.setItem(SESSION_PLANS_KEY, JSON.stringify(cloudPlans));
        }
        const localJournal = JSON.parse(localStorage.getItem(EXEC_JOURNAL_KEY) || "[]");
        if (localJournal.length === 0) {
          const cloudJournal = await pullFromCloud("exec_journal");
          if (cloudJournal?.length) localStorage.setItem(EXEC_JOURNAL_KEY, JSON.stringify(cloudJournal));
        }
      } catch {}
    }
    restoreFromCloud();
  }, []);

  function getCooldownRemaining(instr) {
    const s = getSessionForInstrument(instr);
    if (!s?.savedAt) return 0;
    const elapsed = Date.now() - new Date(s.savedAt).getTime();
    return Math.max(0, COOLDOWN_MS_LOCAL - elapsed);
  }
  function formatCountdown(ms) {
    if (ms <= 0) return "";
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  const [phase, setPhase] = useState("upload"); // upload | analyzing | plan | live
  const [appPage, setAppPage] = useState("dashboard"); // dashboard | settings | history
  const [selectedSession, setSelectedSession] = useState("NY");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const HISTORY_KEY = `omniusd_aplus_history_${_uid}`;
  const isMobile = useWindowWidth() <= 768;
  const isTablet = useWindowWidth() <= 1024;

  // Detect return from Stripe billing portal and reload profile
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") === "portal") {
      window.history.replaceState({}, "", window.location.pathname);
      // Wait 2 seconds for webhook to update Supabase before reloading
      setTimeout(() => window.location.reload(), 2000);
    }
  }, []);
  const [images, setImages] = useState(Array(5).fill(null)); // each slot: {file, preview} or null

  function readSlotFile(file, i) {
    if (!file) return;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      // ── Compress: max 1200px wide, JPEG 0.82 quality ──────────────────────
      // Full-res screenshots are 2-4MB on modern phones — this cuts to ~150-300KB
      // while keeping chart details fully readable for AI analysis
      const MAX_W = 1200;
      const scale = img.width > MAX_W ? MAX_W / img.width : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const jpeg = canvas.toDataURL("image/jpeg", 0.82);
      URL.revokeObjectURL(objectUrl);
      const syntheticFile = { type: "image/jpeg", name: file.name };
      setImages(prev => {
        const next = [...prev];
        next[i] = { file: syntheticFile, preview: jpeg };
        return next;
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImages(prev => {
          const next = [...prev];
          next[i] = { file, preview: e.target.result };
          return next;
        });
      };
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  }
  const [instrument, setInstrument] = useState(null);
  const [plan, setPlan] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tier1, setTier1] = useState(false);
  const [tier2, setTier2] = useState(false);
  const [sessionState, setSessionState] = useState("WATCHING");
  const [sessionHistory, setSessionHistory] = useState([]);
  const [ctTime, setCtTime] = useState(getCTTime().str);
  const [nextClose, setNextClose] = useState(getNextClose());
  const [dragOverSlot, setDragOverSlot] = useState(null);
  // Track uploads per instrument this session — allows one free re-upload, warns on second
  const [uploadCounts, setUploadCounts] = useState({}); // { "BTCUSD": 1, "XAUUSD": 2 }
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

  // ── Restore saved session on load ─────────────────────────────────────────
  React.useEffect(() => {
    async function restore() {
      try {
        const ctToday = new Date(new Date().toLocaleString("en-US", { timeZone:"America/Chicago" })).toDateString();
        function isToday(savedAt) {
          try {
            return new Date(new Date(savedAt).toLocaleString("en-US", { timeZone:"America/Chicago" })).toDateString() === ctToday;
          } catch { return false; }
        }
        function pruneStale(sessions) {
          const cleaned = {};
          Object.keys(sessions).forEach(k => { if (isToday(sessions[k]?.savedAt)) cleaned[k] = sessions[k]; });
          return cleaned;
        }

        // STEP 1: Always prune localStorage first — no exceptions
        const raw = loadSessions();
        const todayOnly = pruneStale(raw);
        // Write cleaned back immediately — before any async operations
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(todayOnly));

        // STEP 2: Only pull from cloud if we have NOTHING today
        let all = todayOnly;
        if (!Object.keys(all).length) {
          const cloud = await pullSessionsFromCloud();
          if (cloud) {
            all = pruneStale(cloud); // prune cloud data too
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
          }
        }

        // STEP 3: Push clean state back to cloud to overwrite stale cloud data
        await pushSessionsToCloud(all);

        // STEP 4: Restore if we have something from today
        const recent = Object.values(all)
          .filter(s => s.plan && s.phase && s.phase !== "upload")
          .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))[0];
        if (recent) {
          setPlan(recent.plan);
          setPhase(recent.phase);
          setInstrument(recent.instrument || recent.plan.instrument);
          setTier1(recent.tier1 || false);
          setTier2(recent.tier2 || false);
          setSessionState(recent.sessionState || "WATCHING");
          setMessages(recent.messages || []);
          setSessionHistory(recent.sessionHistory || []);
        }
      } catch(e) {}
    }
    restore();
  }, []);

  // ── Save session state whenever key values change ──────────────────────────
  React.useEffect(() => {
    if (!plan || !instrument || phase === "upload") return;
    saveSession(instrument, {
      plan, phase, instrument, tier1, tier2, sessionState, messages, sessionHistory,
    });
  }, [plan, phase, tier1, tier2, sessionState, messages]);

  // Live clock
  useEffect(() => {
    const id = setInterval(() => {
      setCtTime(getCTTime().str);
      setNextClose(getNextClose());
    }, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── STEP 1: Analyze charts ──────────────────────────────────────────────────
  async function analyzeCharts() {
    if (images.filter(Boolean).length < 5) return;
    const mktStatus = getMarketStatus(instrument, selectedSession);
    if (mktStatus.state === "closed" || mktStatus.state === "wrong_session") return;

    // ── Usage limit checks ────────────────────────────────────────────────
    const session = JSON.parse(localStorage.getItem("omniusd_session") || "{}");
    const token = session.access_token;
    const userId = session.user?.id || (token ? JSON.parse(atob(token.split(".")[1]))?.sub : null);
    const userTier = profile?.tier || "starter";

    if (userId && token) {
      const instrumentCount = (uploadCounts[instrument] || 0);
      const limitCheck = await checkUsageLimits(userId, token, instrument, userTier);

      // If cooldown active — check if user has already used their free re-upload
      if (!limitCheck.allowed && limitCheck.type === "cooldown") {
        const prevSession = getSessionForInstrument(instrument);
        if (instrumentCount >= 1) {
          // They've used their free re-upload — restore existing plan instead of hard blocking
          if (prevSession?.plan) {
            setPlan(prevSession.plan);
            setPhase(prevSession.phase || "plan");
            setTier1(prevSession.tier1 || false);
            setTier2(prevSession.tier2 || false);
            setSessionState(prevSession.sessionState || "WATCHING");
            setMessages(prevSession.messages || []);
            setSessionHistory(prevSession.sessionHistory || []);
            setPhase("plan");
          } else {
            setPlan({
              _blocked: true,
              _reason: limitCheck.detail,
              _limitType: limitCheck.type,
              _prevPlan: null,
              instrument,
              grade: "BLOCKED",
            });
            setPhase("plan");
          }
          return;
        }
        // First re-upload during cooldown — allow it, increment ONLY after successful analysis
      } else if (!limitCheck.allowed) {
        setPlan({
          _blocked: true,
          _reason: limitCheck.detail,
          _limitType: limitCheck.type,
          instrument,
          grade: "BLOCKED",
        });
        setPhase("plan");
        return;
      }
      // NOTE: uploadCounts is incremented AFTER successful instrument validation below
      // Wrong chart uploads do NOT count against the user
    }

    setPhase("analyzing");

    try {
      // Build image blocks
      const imgBlocks = await Promise.all(images.map(async (slot, i) => {
        const base64 = slot.preview.split(",")[1];
        return { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } };
      }));

      // ── Increment upload count — we're proceeding to analysis ────────────
      if (userId) {
        setUploadCounts(prev => ({ ...prev, [instrument]: (prev[instrument] || 0) + 1 }));
      }

      // ── STEP 1: MAIN ANALYSIS ─────────────────────────────────────────────
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: getAnalysisPrompt(instrument, selectedSession),
          messages: [{ role: "user", content: [...imgBlocks, { type: "text", text: `Analyze these ${instrument} charts. Daily first, then 4H, 1H, 30M, 15M. Return only the JSON.` }] }],
        }),
      });

      const data = await res.json();
      const text = data.content?.[0]?.text || "{}";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

      // Secondary check — only block on a CONFIRMED instrument mismatch, never on uncertainty
      if (parsed.instrument_valid === false) {
        const detected = (parsed.instrument_detected || "").toUpperCase().trim();
        const expected = (instrument || "").toUpperCase().trim();
        const isConfirmedMismatch = detected && detected !== expected && detected !== "UNKNOWN" && detected !== "UNREADABLE" && detected !== "NOT_VISIBLE";
        if (isConfirmedMismatch) {
          // Free retry — go back to upload, no cooldown hit
          setUploadCounts(prev => ({ ...prev, [instrument]: Math.max(0, (prev[instrument] || 1) - 1) }));
          setPlan(null);
          setImages(Array(5).fill(null));
          setPhase("upload");
          alert(`Wrong charts — these show ${detected}, not ${expected}. Upload your ${expected} charts and try again.`);
          return;
        }
        // Any other instrument_valid=false (uncertainty, unreadable) → proceed anyway
        // The analysis prompt already instructs the AI to handle uncertain cases gracefully
      }

      // ── WEEKEND HARD OVERRIDE ─────────────────────────────────────────────
      const _now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
      const _day = _now.getDay();
      const _mins = _now.getHours() * 60 + _now.getMinutes();
      const _isWeekend = _day === 6 || (_day === 0 && _mins < 20 * 60);
      if (_isWeekend && parsed.grade !== "PASS") {
        parsed.grade = "PASS";
        parsed.pass_reason = "Weekend — markets are thin and unreliable. No valid BRC execution window until Sunday Asian session or Monday NY session. Structure noted — come back when a proper session opens.";
      }

      // ── SESSION WINDOW GATE ────────────────────────────────────────────
      const _mktStatus = getMarketStatus(instrument, selectedSession);

      // London open — cap grade at B for BTCUSD/XAUUSD
      if (_mktStatus.state === "london" && parsed.grade === "A+") {
        parsed.grade = "B";
        parsed.what_still_needed = [
          "Wait for NY session open (8:30 AM CT) for A+ execution grade",
          "London open has lower institutional conviction than NY",
          "Re-upload charts at NY open for full A+ analysis",
          ...(parsed.what_still_needed || []),
        ];
        parsed._londonMode = true;
      }

      // Window closed — downgrade to SCOUT MODE
      if (_mktStatus.state === "closed" && parsed.grade === "A+") {
        parsed.grade = "PASS";
        parsed.pass_reason = `SCOUT MODE — Session window is closed. These levels are valid for your next NY session (8:30 AM CT). No execution today.`;
        parsed._scoutMode = true;
      }

      // Wrong session — hard block
      if (_mktStatus.state === "wrong_session") {
        parsed.grade = "PASS";
        parsed.pass_reason = `OmniUSD is built for NY session execution. The window opens at 8:30 AM CT. Come back then with fresh charts for A+ analysis. Pre-market scouting available from 7:00 AM CT.`;
        parsed._scoutMode = true;
      }

      parsed.instrument = instrument;

      // Strip any text from price fields — prices only in these fields
      function stripPrice(v) {
        if (!v || v === "—" || v === "null" || v === "N/A") return null;
        const m = String(v).match(/^([0-9,.\s–\-]+(?:\s*[–\-]\s*[0-9,.]+)?)/);
        return m ? m[1].trim() : v;
      }
      parsed.trigger_level = stripPrice(parsed.trigger_level);
      parsed.retest_zone   = stripPrice(parsed.retest_zone);
      parsed.stop_loss     = stripPrice(parsed.stop_loss);
      parsed.tp1           = stripPrice(parsed.tp1);
      parsed.tp2           = stripPrice(parsed.tp2);
      parsed.runner        = stripPrice(parsed.runner);

      setPlan(parsed);
      setPhase("plan");
      // Auto-save every plan to session history (all grades)
      autoSavePlan({ ...parsed, instrument });
      // Log successful analysis
      if (userId && token) logUsage(userId, token, instrument);
    } catch (e) {
      console.error("analyzeCharts error:", e);
      setPlan({
        _blocked: true,
        _reason: `Analysis failed: ${e.message || "Unknown error"}. Check your connection and try again.`,
        instrument,
        grade: "BLOCKED",
      });
      setPhase("plan");
    }
  }

  // ── STEP 2: Start live session ──────────────────────────────────────────────
  function startLiveSession(planOverride) {
    const activePlan = planOverride || plan;
    // Save to execution journal — user committed to this setup
    saveExecutionJournal(activePlan);
    setPhase("live");
    const ct = getCTTime();
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
    const day = now.getDay();
    const nowMins = ct.mins;
    const isSat = day === 6;
    const isSunEarly = day === 0 && nowMins < 20 * 60;

    const sessCfg = SESSION_CONFIG[selectedSession] || SESSION_CONFIG.NY;
    const direction = activePlan.bias === "SHORT" ? "below" : "above";
    const trigger = activePlan.trigger_level || "the trigger level";

    // Find next valid candle close for this session
    const candleObjs = sessCfg.candles || [];
    const candleMins = sessCfg.candleMins || [];
    let nextCandle = candleObjs[0]?.label || "9:30 AM ET";
    let nextCandleObj = candleObjs[0];
    let remainingCandles = [...candleObjs];
    for (let i = 0; i < candleMins.length; i++) {
      if (nowMins < candleMins[i]) {
        nextCandle = candleObjs[i]?.label || sessCfg.candles[i];
        nextCandleObj = candleObjs[i];
        remainingCandles = candleObjs.slice(i);
        break;
      }
    }

    const userTZShort = getUserTZShort();
    const isET = getUserTZ().startsWith("America/New_York") || getUserTZ().startsWith("America/Detroit");
    function candleDisplay(c) {
      if (!c) return "";
      return candleToUserTime(c);
    }
    const nextCandleDisplay = candleDisplay(nextCandleObj);
    const remainingDisplay = remainingCandles.map(c => candleDisplay(c)).join(" → ");

    const advisory = SESSION_ADVISORIES[activePlan.instrument]?.[selectedSession];

    const mktStatus = getMarketStatus(activePlan.instrument, selectedSession);
    const isPrep = mktStatus.state === "prep";
    const minsUntilOpen = mktStatus.minsUntilOpen || 0;
    const hUntil = Math.floor(minsUntilOpen / 60);
    const mUntil = minsUntilOpen % 60;
    const untilStr = hUntil > 0 ? `${hUntil}h ${mUntil}m` : `${mUntil}m`;

    let openingMsg = "";

    if (isSat) {
      openingMsg = `⛔ **Saturday — no entries.**\nCome back Sunday Asian (~9:00 PM) or Monday NY (~9:30 AM).`;
    } else if (isSunEarly) {
      openingMsg = `⛔ **Markets not yet open.**\nAsian session opens ~9:00 PM tonight.`;
    } else if (isPrep) {
      const h = sessCfg.openET?.h || 9;
      const m = sessCfg.openET?.m || 30;
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const openTimeET = `${h12}:${String(m).padStart(2,"0")} ${ampm} ET`;
      openingMsg = `📋 **PREP MODE — Session opens in ${untilStr}**\n\nPlan is locked. Study it now.\n\nTrigger: **${trigger}** · Stop: **${activePlan.stop_loss}** · TP1: **${activePlan.tp1}**\n\nCome back at **${openTimeET}** — I'll guide you candle by candle.\n\n🥷${profile?.preferredName ? ` ${profile.preferredName} —` : ""} Be ready. Not early.`;
    } else {
      // Live — show user's local time + minutes countdown
      const nextCandleET = nextCandleObj ? nextCandleObj.label : nextCandleDisplay;
      const ctNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
      const minsLeft = ctNow.getMinutes() < 30 ? 30 - ctNow.getMinutes() : 60 - ctNow.getMinutes();
      const isLastCandle = remainingCandles.length === 1;

      const nextCandleLocal = nextCandleObj ? candleToUserTime(nextCandleObj) : nextCandleET;

      openingMsg = `**NEXT ACTION**${profile?.preferredName ? ` — ${profile.preferredName}` : ""}\n\nWatch the next 30M **${activePlan.instrument}** close.\n\nIf it closes **${direction} ${trigger}** — send it now.\nIf not — send me the closing price.\n\nWicks don't count. Only closes.\n\n🕐 Next check: **${nextCandleLocal}** (in ${minsLeft}m)`;

      if (activePlan._activatedFromSoftPass) {
        openingMsg += `\n\n📋 Activated from Soft Pass scenario. If session opens with different structure — trust the charts over this plan.`;
      }

      if (isLastCandle) {
        openingMsg += `\n\n⚠️ **LATE SESSION ALERT**\nThis signal is valid but you have **ONE candle remaining** before ${sessCfg.cutoff} cutoff. Limit order ONLY. No chasing. If retest doesn't happen before ${sessCfg.cutoff} — order expires. **DO NOT carry this setup past cutoff.**`;
      }

      if (advisory) {
        openingMsg += `\n\n⚠️ ${advisory}`;
      }
    }

    setMessages([{
      role: "assistant",
      content: openingMsg,
      time: ct.str,
    }]);
  }

  // ── STEP 3: Live chat ───────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsgCount = messages.filter(m => m.role === "user").length;
    if (userMsgCount >= 30) return;
    const userMsg = input.trim();
    setInput("");
    const ct = getCTTime();

    // ── Build fresh time context injected into EVERY message ──────────────
    // This prevents the AI from using stale times from earlier in the conversation
    const ctNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
    const minsLeft = ctNow.getMinutes() < 30 ? 30 - ctNow.getMinutes() : 60 - ctNow.getMinutes();
    const nextCloseLocal = getNextClose();
    const tzShort = getUserTZShort();
    const freshTimeBlock = `[CURRENT TIME — UPDATED NOW]
Time: ${ct.str} ${tzShort} | Next 30M close: ${nextCloseLocal} (in ${minsLeft}m)
Use ONLY these times. All earlier time references in this conversation are stale.
---
`;

    // Inject fresh time at top of user message — visible to AI, hidden from user display
    const msgWithTime = `${freshTimeBlock}${userMsg}`;
    const newHistory = [...sessionHistory, { role: "user", content: msgWithTime }];
    setMessages(prev => [...prev, { role: "user", content: userMsg, time: ct.str }]); // display without time block
    setLoading(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          system: getLivePrompt(plan, selectedSession),
          messages: newHistory,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error?.message || data?.message || `API error ${res.status}`;
        setMessages(prev => [...prev, { role: "assistant", content: `⚠ ${errMsg}`, time: getCTTime().str }]);
        setLoading(false);
        return;
      }
      const reply = data.content?.[0]?.text;
      if (!reply) {
        setMessages(prev => [...prev, { role: "assistant", content: "⚠ Empty response from server. Check your connection and try again.", time: getCTTime().str }]);
        setLoading(false);
        return;
      }
      const updatedHistory = [...newHistory, { role: "assistant", content: reply }];
      setSessionHistory(updatedHistory);
      setSessionHistory(updatedHistory);

      // ── Tier detection — STRICT JSON signal only ──────────────────────────
      // The AI must explicitly emit a JSON signal block to confirm a tier.
      // Never trigger from natural language — prevents false positives when
      // users ask educational questions about tiers.
      // Format: <!--SIGNAL:{"tier1":true}-->  or  <!--SIGNAL:{"tier2":true}-->
      const signalMatch = reply.match(/<!--SIGNAL:(\{[^}]+\})-->/);
      if (signalMatch) {
        try {
          const sig = JSON.parse(signalMatch[1]);
          if (sig.tier1 === true && !tier1) { setTier1(true); setSessionState("BREAK_CONFIRMED"); }
          if (sig.tier2 === true && !tier2) { setTier2(true); setSessionState("READY_FOR_LIMIT"); }
          if (sig.invalidated === true) setSessionState("INVALIDATED");
          if (sig.retest === true) setSessionState("RETEST_FORMING");
        } catch(e) {}
      }

      // Strip the signal tag from the displayed message
      const displayReply = reply.replace(/<!--SIGNAL:[^>]+-->/g, "").trim();

      setMessages(prev => [...prev, { role: "assistant", content: displayReply, time: getCTTime().str }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "⚠ Network error — check your connection and resend.", time: getCTTime().str }]);
    }
    setLoading(false);
    inputRef.current?.focus();
  }

  // ── Derived state ───────────────────────────────────────────────────────────
  const ct = getCTTime();
  const nowMins = ct.mins;
  const windowOpen = nowMins >= 8*60+30 && nowMins <= 10*60+30;
  const windowClosed = nowMins > 10*60+30;
  const derivedState = windowClosed ? "WINDOW_CLOSED" : tier2 ? "READY_FOR_LIMIT" : tier1 ? "BREAK_CONFIRMED" : sessionState;
  const stateObj = SESSION_STATES[derivedState] || SESSION_STATES.WATCHING;

  function fmt(text) {
    return text
      .replace(/\*\*(NEXT ACTION)\*\*/g, '<strong style="font-size:10px;letter-spacing:0.16em;color:rgba(255,107,255,0.7)">NEXT ACTION</strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#00e5ff">$1</strong>')
      .replace(/send it now/gi, '<strong style="color:#ff6bff">send it now</strong>')
      .replace(/tell me immediately/gi, '<strong style="color:#ff6bff">tell me immediately</strong>')
      .replace(/\n/g, "<br/>");
  }

  const gradeColor = plan ? { "A+": "#7fff6b", "A": "#00e5ff", "B": "#ffd166", "C": "#ff9a3c", "PASS": "#8878aa", "SOFT PASS": "#00e5ff" }[plan.grade] || "#ffd166" : "#ffd166";
  const biasColor = plan?.bias === "SHORT" ? "#ff6b6b" : plan?.bias === "LONG" ? "#7fff6b" : "#ffd166";

  return (
    <div style={{ minHeight: "100vh", background: "#1e1a35", color: "#f0ecff", fontFamily: "'Space Mono', monospace", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        @media (max-width:768px){.omni-hide-mobile{display:none!important;}.omni-stack{flex-direction:column!important;}.omni-full{width:100%!important;}}
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,107,255,0.3); border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
        @keyframes slide { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadein { from{opacity:0}to{opacity:1} }
        @keyframes goldPulse { 0%,100%{box-shadow:0 0 6px rgba(255,209,102,0.2);border-color:rgba(255,209,102,0.35)} 50%{box-shadow:0 0 16px rgba(255,209,102,0.55);border-color:rgba(255,209,102,0.8)} }
      `}</style>

      {/* Subtle branded bg — grid + faint orbs */}
      <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(255,107,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,255,0.025) 1px,transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none", zIndex: 0 }}/>
      <div style={{ position: "fixed", width: 500, height: 500, borderRadius: "50%", background: "#7b2fff", top: -200, left: -200, filter: "blur(120px)", opacity: 0.11, pointerEvents: "none", zIndex: 0 }}/>
      <div style={{ position: "fixed", width: 320, height: 320, borderRadius: "50%", background: "#00e5ff", bottom: -100, right: -80, filter: "blur(100px)", opacity: 0.08, pointerEvents: "none", zIndex: 0 }}/>

      {/* ── NAV ── */}
      <header style={{ position: "relative", zIndex: 1, background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,107,255,0.22)", boxShadow: "0 1px 20px rgba(123,47,255,0.08)", flexShrink: 0 }}>

        {/* ── MOBILE COCKPIT HEADER ── */}
        {isMobile ? (<>
          {/* Row 1: Logo | Instrument | Bias | Status | ☰ */}
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* Left: logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <OmniLogo size={28} />
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", background: "linear-gradient(90deg,#ff6bff,#00e5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>OmniUSD</span>
              {/* Instrument + Bias — only when plan exists */}
              {plan && phase !== "upload" && (
                <div style={{ display: "flex", gap: 5, marginLeft: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#f0ecff" }}>{plan.instrument}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: `${biasColor}14`, border: `1px solid ${biasColor}44`, color: biasColor }}>{plan.bias}</span>
                </div>
              )}
            </div>
            {/* Right: status badge + hamburger */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {phase === "live" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 20, background: `${stateObj.color}14`, border: `1px solid ${stateObj.color}33` }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: stateObj.color, display: "inline-block", animation: stateObj.dot ? "pulse 1.5s ease infinite" : "none" }}/>
                  <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.06em", color: stateObj.color }}>{stateObj.label}</span>
                </div>
              )}
              {/* Hamburger ☰ */}
              <button onClick={() => setDrawerOpen(o => !o)}
                style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, padding: "5px 9px", cursor: "pointer", color: "#f0ecff", fontSize: 15, lineHeight: 1, fontFamily: "inherit" }}>
                ☰
              </button>
            </div>
          </div>

          {/* Row 2: grade + window status only during live session */}
          {plan && phase === "live" && (
            <div style={{ padding: "4px 14px 7px", display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontSize: 13, fontWeight: 700, padding: "1px 7px", background: `${gradeColor}14`, border: `1px solid ${gradeColor}33`, borderRadius: 4, color: gradeColor }}>{plan.grade}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: windowClosed ? "#ff6b6b" : "#7fff6b" }}>{windowClosed ? "⛔ CLOSED" : "✅ OPEN"}</span>
            </div>
          )}

          {/* Drawer overlay */}
          {drawerOpen && (
            <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setDrawerOpen(false)}>
              {/* Backdrop */}
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}/>
              {/* Drawer panel */}
              <div onClick={e => e.stopPropagation()}
                style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 240, background: "#1e1a35", borderLeft: "1px solid rgba(255,107,255,0.2)", display: "flex", flexDirection: "column", animation: "slide 0.2s ease both" }}>

                {/* Drawer header */}
                <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <OmniLogo size={24} />
                    <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", background: "linear-gradient(90deg,#ff6bff,#00e5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>OmniUSD</span>
                  </div>
                  <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", color: "#8878aa", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
                </div>

                {/* Drawer nav items */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 0" }}>
                  {[
                    { label: "Dashboard", icon: "◈", action: () => { setAppPage("dashboard"); setPhase("upload"); setImages(Array(5).fill(null)); setDrawerOpen(false); }, active: appPage === "dashboard" },
                    { label: "History", icon: "📋", action: () => { setAppPage("history"); setDrawerOpen(false); }, active: appPage === "history", color: "#7fff6b" },
                    { label: "Results", icon: "📈", action: () => { setAppPage("results"); setDrawerOpen(false); }, active: appPage === "results", color: "#00ccff" },
                    { label: "Settings", icon: "⚙", action: () => { setAppPage("settings"); setDrawerOpen(false); }, active: appPage === "settings", color: "#ff6bff" },
                    { label: "Chart Setup", icon: "📐", action: () => { setAppPage("chartsetup"); setDrawerOpen(false); }, active: appPage === "chartsetup", color: "#ffd166", badge: "NEW" },
                    { label: "Help & FAQ", icon: "?", action: () => { setAppPage("faq"); setDrawerOpen(false); }, active: appPage === "faq", color: "#00e5ff" },
                    ...(profile?.email === "bailey.charles024@gmail.com" ? [
                      { label: "Log Trade", icon: "✏", action: () => { setAppPage("tradelog"); setDrawerOpen(false); }, active: appPage === "tradelog", color: "#cc44ff" },
                    ] : []),
                    ...(phase === "live" ? [
                      { label: "View Plan", icon: "📄", action: () => { setPhase("plan"); setDrawerOpen(false); }, color: "#ffd166" },
                      { label: "New Analysis", icon: "↩", action: () => { setPhase("upload"); setImages(Array(5).fill(null)); setDrawerOpen(false); }, color: "rgba(255,255,255,0.75)" },
                    ] : []),
                  ].map((item, i) => (
                    <button key={i} onClick={item.action}
                      style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", background: item.active ? "rgba(255,107,255,0.08)" : "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", borderLeft: item.active ? "2px solid #ff6bff" : "2px solid transparent", transition: "all 0.15s" }}>
                      <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: item.active ? 700 : 500, color: item.active ? "#f0ecff" : (item.color || "#8878aa") }}>{item.label}</span>
                      {item.badge && !item.active && <span style={{ fontSize: 9, fontWeight: 900, padding: "1px 6px", borderRadius: 4, background: "rgba(255,209,102,0.15)", border: "1px solid rgba(255,209,102,0.4)", color: "#ffd166", fontFamily: "'Space Mono',monospace", letterSpacing: "0.06em", marginLeft: "auto" }}>{item.badge}</span>}
                    </button>
                  ))}
                </div>

                {/* Drawer footer — sign out */}
                <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {onSignOut && (
                    <button onClick={() => {
                      const allSess = loadSessions();
                      const hasActive = Object.values(allSess).some(s => s?.plan && s?.phase && s?.phase !== "upload");
                      if (hasActive) {
                        if (!window.confirm("⚠️ You have an active session today.\n\nLogging out will erase your current plans and charts. You will be in cooldown if you log back in and try to re-upload.\n\nAre you sure you want to log out?")) return;
                      }
                      onSignOut(); setDrawerOpen(false);
                    }}
                      style={{ fontSize: 13, color: "rgba(255,107,107,0.6)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em" }}>
                      Sign out
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </>) : (

        /* ── DESKTOP HEADER — unchanged ── */
        <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <OmniLogo size={32} />
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", background: "linear-gradient(90deg,#ff6bff,#00e5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>OmniUSD</span>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.1em", padding: "2px 8px", borderRadius: 4, background: `${(TIER_CONFIG[profile?.tier]||TIER_CONFIG.starter).color}18`, border: `1px solid ${(TIER_CONFIG[profile?.tier]||TIER_CONFIG.starter).color}44`, color: (TIER_CONFIG[profile?.tier]||TIER_CONFIG.starter).color }}>
              {(TIER_CONFIG[profile?.tier]||TIER_CONFIG.starter).label.toUpperCase()}
            </span>
            {plan && phase !== "upload" && (
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", background: `${gradeColor}14`, border: `1px solid ${gradeColor}44`, borderRadius: 4, color: gradeColor }}>{plan.grade}</span>
                <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", background: `${biasColor}14`, border: `1px solid ${biasColor}44`, borderRadius: 4, color: biasColor }}>{plan.bias}</span>
                <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#8878aa" }}>{plan.instrument}</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 13, color: "#8878aa" }}><span style={{ color: "#00e5ff", fontWeight: 700 }}>{ctTime}</span> {getUserTZShort()}</div>
            
            {phase === "live" && (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: windowClosed ? "#ff6b6b" : "#7fff6b", animation: windowOpen ? "pulse 1.5s ease infinite" : "none" }}/>
                <span style={{ fontSize: 13, fontWeight: 700, color: windowClosed ? "#ff6b6b" : "#7fff6b" }}>{windowClosed ? "WINDOW CLOSED" : "WINDOW OPEN"}</span>
              </div>
            )}
            <button onClick={() => setAppPage(appPage === "chartsetup" ? "dashboard" : "chartsetup")} style={{ fontSize: 13, fontWeight: 700, color: appPage === "chartsetup" ? "#ffd166" : "#ffd166", background: appPage === "chartsetup" ? "rgba(255,209,102,0.12)" : "rgba(255,209,102,0.06)", border: `1px solid rgba(255,209,102,${appPage === "chartsetup" ? "0.6" : "0.4"})`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", boxShadow: appPage === "chartsetup" ? "none" : "0 0 8px rgba(255,209,102,0.2)", animation: appPage === "chartsetup" ? "none" : "goldPulse 2s ease-in-out infinite" }}>Chart Setup</button>
            <button onClick={() => setAppPage(appPage === "history" ? "dashboard" : "history")} style={{ fontSize: 13, fontWeight: 700, color: appPage === "history" ? "#7fff6b" : "#8878aa", background: appPage === "history" ? "rgba(127,255,107,0.08)" : "none", border: `1px solid ${appPage === "history" ? "rgba(127,255,107,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>History</button>
            <button onClick={() => setAppPage(appPage === "results" ? "dashboard" : "results")} style={{ fontSize: 13, fontWeight: 700, color: appPage === "results" ? "#00ccff" : "#8878aa", background: appPage === "results" ? "rgba(0,204,255,0.08)" : "none", border: `1px solid ${appPage === "results" ? "rgba(0,204,255,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Results</button>
            {profile?.email === "bailey.charles024@gmail.com" && (
              <button onClick={() => setAppPage(appPage === "tradelog" ? "dashboard" : "tradelog")} style={{ fontSize: 13, fontWeight: 700, color: appPage === "tradelog" ? "#cc44ff" : "#8878aa", background: appPage === "tradelog" ? "rgba(204,68,255,0.1)" : "none", border: `1px solid ${appPage === "tradelog" ? "rgba(204,68,255,0.35)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Log Trade</button>
            )}
            <button onClick={() => setAppPage(appPage === "settings" ? "dashboard" : "settings")} style={{ fontSize: 13, fontWeight: 700, color: appPage === "settings" ? "#ff6bff" : "#8878aa", background: appPage === "settings" ? "rgba(255,107,255,0.1)" : "none", border: `1px solid ${appPage === "settings" ? "rgba(255,107,255,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Settings</button>
            <button onClick={() => setAppPage(appPage === "faq" ? "dashboard" : "faq")} style={{ fontSize: 13, fontWeight: 700, color: appPage === "faq" ? "#00e5ff" : "#8878aa", background: appPage === "faq" ? "rgba(0,229,255,0.08)" : "none", border: `1px solid ${appPage === "faq" ? "rgba(0,229,255,0.3)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>Help & FAQ</button>
            {phase === "live" && (<>
              <button onClick={() => setPhase("plan")} style={{ fontSize: 13, fontWeight: 700, color: "#ffd166", background: "rgba(255,209,102,0.08)", border: "1px solid rgba(255,209,102,0.25)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>View Plan</button>
              <button onClick={() => { setPhase("upload"); setImages(Array(5).fill(null)); }} style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.75)", background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>NEW ANALYSIS</button>
            </>)}
            {onSignOut && <button onClick={() => {
              const allSess = loadSessions();
              const hasActive = Object.values(allSess).some(s => s?.plan && s?.phase && s?.phase !== "upload");
              if (hasActive) {
                if (!window.confirm("⚠️ You have an active session today.\n\nLogging out will erase your current plans and charts. You will be in cooldown if you log back in and try to re-upload.\n\nAre you sure you want to log out?")) return;
              }
              onSignOut();
            }} style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 6px" }}>Sign out</button>}
          </div>
        </div>
        )}
      </header>

      {/* ══ SETTINGS PAGE ══════════════════════════════════════════════════════ */}
      {appPage === "settings" && (
        <SettingsPage profile={profile} onSignOut={onSignOut} onClose={() => setAppPage("dashboard")} />
      )}

      {/* ══ PUBLIC RESULTS PAGE ════════════════════════════════════════════════ */}
      {appPage === "results" && (
        <PublicResultsPage onClose={() => setAppPage("dashboard")} />
      )}

      {/* ══ TRADE LOGGER (owner only) ══════════════════════════════════════════ */}
      {appPage === "tradelog" && (
        <TradeLoggerPage profile={profile} onClose={() => setAppPage("dashboard")} />
      )}

      {/* ══ HISTORY PAGE ═══════════════════════════════════════════════════════ */}
      {appPage === "history" && (
        <HistoryPage uid={_uid} onClose={() => setAppPage("dashboard")} />
      )}

      {/* ══ CHART SETUP PAGE ═══════════════════════════════════════════════════ */}
      {appPage === "chartsetup" && (
        <ChartSetupPage onClose={() => setAppPage("dashboard")} />
      )}

      {/* ══ FAQ / HELP PAGE ════════════════════════════════════════════════════ */}
      {appPage === "faq" && (
        <div style={{ flex:1, overflowY:"auto", padding:isMobile?"20px 16px":"32px 24px", animation:"fadein 0.3s ease both" }}>
          <div style={{ maxWidth:680, margin:"0 auto" }}>

            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:28 }}>
              <div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, color:"rgba(0,229,255,0.7)", letterSpacing:"0.18em", marginBottom:6 }}>HELP & FAQ</div>
                <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"#f0ecff", margin:0 }}>Common Questions</h2>
              </div>
              <button onClick={() => setAppPage("dashboard")}
                style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, color:"#8878aa", background:"none", border:"1px solid rgba(255,255,255,0.08)", borderRadius:6, padding:"6px 12px", cursor:"pointer" }}>
                ← Back
              </button>
            </div>

            {/* Contact banner */}
            <div style={{ padding:"14px 18px", background:"rgba(255,107,255,0.05)", border:"1px solid rgba(255,107,255,0.15)", borderRadius:10, marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
              <div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:14, fontWeight:700, color:"#f0ecff", marginBottom:3 }}>Can't find your answer?</div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, color:"rgba(255,255,255,0.85)" }}>Reach out — we respond within 24 hours.</div>
              </div>
              <a href="mailto:support@omniusd.pro"
                style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, letterSpacing:"0.08em", padding:"8px 16px", borderRadius:7, border:"1px solid rgba(255,107,255,0.3)", background:"rgba(255,107,255,0.1)", color:"#ff6bff", textDecoration:"none" }}>
                Contact Us →
              </a>
            </div>

            {/* FAQ items */}
            <div style={{ display:"flex", flexDirection:"column", gap:0, border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, overflow:"hidden" }}>
              {[
                { q:"You only need to upload charts once per instrument per session.", a:"Select your instrument first, then upload all 5 timeframes (Daily, 4H, 1H, 30M, 15M). Your plan generates automatically. You do not need to re-upload unless you switch instruments or start a new session.", highlight:true },
                { q:"When should I upload the charts?", a:"Upload 30–60 minutes before your session opens. For the NY session, upload between 7:30–8:00 AM CT. Do not upload during the session — the plan is built on pre-session structure." },
                { q:"What timeframes does BRC use?", a:"Five timeframes: Daily (bias), 4H (structure), 1H (setup), 30M (trigger), 15M (refinement). The 30M candle close is the only valid entry signal. All five are required." },
                { q:"Every chart must show the instrument and timeframe.", a:"The ticker (e.g. BTCUSD) and timeframe (e.g. 1H, 30M) must be clearly visible in every screenshot. If either is not visible, your upload will be rejected. Take screenshots with labels showing.", highlight:true },
                { q:"What if the setup does not confirm?", a:"You do nothing. If the BRC sequence is incomplete, the result is PASS. No execution UI appears. A clean PASS protects your account. Not every session has a trade." },
                { q:"Can I use this for a prop firm challenge?", a:"Yes — this is one of the strongest use cases. Limit orders only, hard session cutoffs, A+ setups only. These are exactly the rules prop firms require." },
                { q:"How much should I risk per trade?", a:"2.5% per trade is the recommended risk. For prop firm challenges, check your drawdown rules — most allow 1–2% and you should adjust accordingly." },
                { q:"What sessions can I trade?", a:"NY session: 8:30–10:30 AM CT (last valid 30M close). London: 2:00–5:00 AM CT. Asian: 8:00–11:00 PM CT. NY produces the cleanest setups." },
                { q:"Do I need to watch charts all session?", a:"No. Upload before the session, review the plan, set your alerts. You only need to be present at the 30M candle closes. Between closes, there is nothing to act on." },
                { q:"What is the edge?", a:"Most traders enter at the Break. BRC waits for all three phases — Break, Retest, Continuation. You enter after confirmation, not during the move. That patience enforced by structure is the edge." },
                { q:"How do I request a new instrument?", a:"Email us at support@omniusd.pro with the subject 'Instrument Request' and tell us what you want to trade. We review all requests and add the most requested instruments to upcoming plan updates." },
              ].map((item, i, arr) => (
                <DashFaqRow key={i} item={item} isLast={i===arr.length-1} />
              ))}
            </div>

            <div style={{ textAlign:"center", marginTop:24, fontFamily:"'Space Mono',monospace", fontSize:13, color:"rgba(255,255,255,0.38)" }}>
              Want to suggest a new instrument? <a href="mailto:support@omniusd.pro?subject=Instrument Request" style={{ color:"rgba(255,107,255,0.5)", textDecoration:"none" }}>Email us →</a>
            </div>
          </div>
        </div>
      )}

      {/* ══ PHASE: UPLOAD ══════════════════════════════════════════════════════ */}
      {appPage === "dashboard" && phase === "upload" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: isMobile ? "28px 16px 32px" : "48px 24px 32px", animation: "fadein 0.3s ease both" }}>
          <div style={{ width: "100%", maxWidth: 560 }}>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              {profile?.preferredName && (
                <div style={{ fontSize:11, color:"rgba(255,107,255,0.7)", fontFamily:"'Space Mono',monospace", letterSpacing:"0.14em", marginBottom:6 }}>
                  {(() => {
                    const h = new Date().getHours();
                    const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
                    return `${greeting}, ${profile.preferredName}.`;
                  })()}
                </div>
              )}
              <h1 style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, marginBottom: 8, letterSpacing: "-0.01em" }}>
                Upload your charts.<br/>Start the session.
              </h1>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                Select one instrument and upload all 5 timeframes for the NY session.
              </div>
            </div>

            {/* Plan-aware upload timing block */}
            {(()=>{
              const tier = profile?.tier || "starter";
              const ct = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
              const mins = ct.getHours()*60 + ct.getMinutes();
              const tzShort = getUserTZShort();

              // Per-plan upload windows (CT minutes)
              const windows = {
                elite:   { recommend:7*60,       latest:7*60+30, label:"⭐ ELITE",   color:"#ff6bff", instruments:6 },
                pro:     { recommend:7*60+15,     latest:7*60+45, label:"💎 PRO",     color:"#00e5ff", instruments:4 },
                starter: { recommend:7*60+30,     latest:8*60,    label:"🔰 STARTER", color:"#ffd166", instruments:2 },
              };
              const w = windows[tier] || windows.starter;
              const nyOpen  = 8*60+30;
              const nyCutoff= 10*60+30;

              // Countdown helpers
              const minsUntil = (target) => Math.max(0, target - mins);
              const fmtMins = (m) => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;

              // State
              let dot = "#7fff6b", label = "", sub = "", warning = null;

              if (mins < w.recommend) {
                // Before recommended window
                dot = "#7fff6b";
                label = `${w.label} — Upload window opens in ${fmtMins(minsUntil(w.recommend))}`;
                sub = `Recommended: ${Math.floor(w.recommend/60)}:${String(w.recommend%60).padStart(2,"0")} ${nyOpen-w.recommend >= 60 ? "AM" : "AM"} CT · NY session at 8:30 AM CT`;
              } else if (mins < w.latest) {
                // Inside recommended window — perfect time
                dot = "#7fff6b";
                label = `${w.label} — Perfect upload time`;
                sub = `NY session opens in ${fmtMins(minsUntil(nyOpen))} · Upload now for full analysis`;
              } else if (mins < nyOpen) {
                // Past recommended, before NY open
                dot = "#ffd166";
                label = `${w.label} — Running behind optimal window`;
                sub = `NY opens in ${fmtMins(minsUntil(nyOpen))} · Upload now`;
                warning = tier === "elite"
                  ? `Uploading after 7:30 AM CT with 6 instruments leaves limited time. Prioritize your top 2–3 instruments first.`
                  : tier === "pro"
                  ? `Uploading after 7:45 AM CT leaves limited prep time. Focus on your highest priority instruments.`
                  : `NY session opens in 30 minutes. Upload now for a complete plan.`;
              } else if (mins < nyCutoff) {
                // NY session open
                dot = "#00e5ff";
                label = `NY SESSION OPEN — Limited analysis time`;
                sub = `Window closes in ${fmtMins(minsUntil(nyCutoff))} · Upload immediately`;
                warning = `NY session is already open. Upload and analyze your top instrument now — you have ${fmtMins(minsUntil(nyCutoff))} before cutoff.`;
              } else {
                // Closed
                dot = "#ff6b6b";
                label = `WINDOW CLOSED`;
                sub = `Come back tomorrow at 7:00 AM CT`;
              }

              const borderColor = dot === "#7fff6b" ? "rgba(127,255,107,0.15)" : dot === "#ffd166" ? "rgba(255,209,102,0.2)" : dot === "#00e5ff" ? "rgba(0,229,255,0.2)" : "rgba(255,107,107,0.2)";
              const bgColor = dot === "#7fff6b" ? "rgba(127,255,107,0.04)" : dot === "#ffd166" ? "rgba(255,209,102,0.04)" : dot === "#00e5ff" ? "rgba(0,229,255,0.04)" : "rgba(255,107,107,0.04)";

              return (
                <div style={{ marginBottom:20 }}>
                  <div style={{ padding:"10px 14px", background:bgColor, border:`1px solid ${borderColor}`, borderLeft:`3px solid ${dot}`, borderRadius:0 }}>
                    {/* Status row */}
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                      <div style={{ width:7, height:7, borderRadius:"50%", background:dot, flexShrink:0, boxShadow:`0 0 6px ${dot}` }}/>
                      <span style={{ fontSize:11, fontWeight:700, color:dot, fontFamily:"'Space Mono',monospace", letterSpacing:"0.08em" }}>{label}</span>
                    </div>
                    <div style={{ fontSize:10, color:"rgba(255,255,255,0.55)", fontFamily:"'Space Mono',monospace", marginBottom: warning ? 8 : 0 }}>{sub}</div>
                    {warning && (
                      <div style={{ fontSize:10, color:"rgba(255,209,102,0.85)", fontFamily:"'Space Mono',monospace", lineHeight:1.7, paddingTop:8, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                        ⚠ {warning}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Instrument pills */}
            {(() => {
              const userTier = profile?.tier || "starter";
              const tierCfg = TIER_CONFIG[userTier] || TIER_CONFIG.starter;
              const allInstruments = ["XAUUSD","BTCUSD","NAS100","US30","USOIL","US500"];
              const allowed = tierCfg.instruments;
              const allSessions = loadSessions();

              return (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                    {allInstruments.map(sym => {
                      const isLocked = !allowed.includes(sym);
                      const isSelected = instrument === sym;
                      const sess = allSessions[sym];
                      const hasActivePlan = sess?.plan && sess?.phase && sess?.phase !== "upload";
                      const cooldownMs = getCooldownRemaining(sym);
                      const inCooldown = cooldownMs > 0 && !hasActivePlan;
                      const cooldownLabel = formatCountdown(cooldownMs);

                      let borderColor, bgColor, textColor, cursor, label, subLabel;

                      if (isLocked) {
                        borderColor = "rgba(255,255,255,0.05)"; bgColor = "rgba(255,255,255,0.02)";
                        textColor = "rgba(255,255,255,0.22)"; cursor = "not-allowed";
                        label = `⊘ ${sym}`; subLabel = null;
                      } else if (hasActivePlan) {
                        const gradeC = sess.plan.grade === "A+" ? "#7fff6b" : sess.plan.grade === "PASS" ? "#ff6b6b" : "#ffd166";
                        borderColor = `${gradeC}55`; bgColor = `${gradeC}12`;
                        textColor = gradeC; cursor = "pointer";
                        label = sym; subLabel = `${sess.plan.grade} · RESUME`;
                      } else if (inCooldown) {
                        borderColor = "rgba(255,154,60,0.3)"; bgColor = "rgba(255,154,60,0.06)";
                        textColor = "rgba(255,154,60,0.6)"; cursor = "default";
                        label = sym; subLabel = `🔒 ${cooldownLabel}`;
                      } else {
                        borderColor = isSelected ? "rgba(255,107,255,0.6)" : "rgba(255,255,255,0.1)";
                        bgColor = isSelected ? "rgba(255,107,255,0.18)" : "rgba(255,255,255,0.04)";
                        textColor = isSelected ? "#ff6bff" : "rgba(255,255,255,0.7)";
                        cursor = "pointer"; label = sym; subLabel = null;
                      }

                      return (
                        <button key={sym} disabled={isLocked}
                          onClick={() => {
                            if (isLocked) return;
                            if (hasActivePlan) {
                              setPlan(sess.plan); setPhase(sess.phase); setInstrument(sym);
                              setTier1(sess.tier1 || false); setTier2(sess.tier2 || false);
                              setSessionState(sess.sessionState || "WATCHING");
                              setMessages(sess.messages || []); setSessionHistory(sess.sessionHistory || []);
                            } else {
                              setInstrument(sym); setPlan(null); setMessages([]);
                              setTier1(false); setTier2(false);
                            }
                          }}
                          style={{ fontSize: 13, fontWeight: 700, padding: subLabel ? "5px 10px 7px" : "6px 12px", borderRadius: 7, border: `1px solid ${borderColor}`, background: bgColor, color: textColor, cursor, fontFamily: "inherit", opacity: isLocked ? 0.4 : 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, boxShadow: isSelected && !hasActivePlan ? "0 0 12px rgba(255,107,255,0.15)" : "none", transition: "all 0.15s" }}>
                          <span>{label}</span>
                          {subLabel && <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.06em", opacity: 0.9 }}>{subLabel}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* London session toggle — only for BTC/XAU */}
            {(instrument === "BTCUSD" || instrument === "XAUUSD") && (
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 20 }}>
                {[
                  { key: "NY", label: "NY SESSION", sub: `${etToUserTime(8,30,false)}–${etToUserTime(10,30,false)} ${getUserTZShort()}`, color: "#7fff6b" },
                  { key: "LONDON", label: "LONDON", sub: `${etToUserTime(2,0,false)}–${etToUserTime(4,0,false)} ${getUserTZShort()} · MAX B+`, color: "#00e5ff" },
                ].map(s => (
                  <button key={s.key} onClick={() => setSelectedSession(s.key)}
                    style={{ fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 7, fontFamily: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      border: selectedSession === s.key ? `1px solid ${s.color}55` : "1px solid rgba(255,255,255,0.08)",
                      background: selectedSession === s.key ? `${s.color}14` : "rgba(255,255,255,0.03)",
                      color: selectedSession === s.key ? s.color : "rgba(255,255,255,0.4)" }}>
                    <span>{s.label}</span>
                    <span style={{ fontSize: 9, opacity: 0.7 }}>{s.sub}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Session status — only when not live */}
            {instrument && (() => {
              const status = getMarketStatus(instrument, selectedSession);
              if (status.state === "live") return null;
              const isWarn = status.state === "prep" || status.state === "london";
              const color = isWarn ? "#ffd166" : "#ff6b6b";
              const emoji = status.state === "prep" || status.state === "london" ? "🟡" : "🔴";
              return (
                <div style={{ padding: "10px 14px", background: `${color}08`, border: `1px solid ${color}22`, borderLeft: `3px solid ${color}`, borderRadius: 0, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 2 }}>{emoji} {status.reason}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>{status.comeback}</div>
                </div>
              );
            })()}

            {/* Re-upload warning */}
            {instrument && (uploadCounts[instrument] || 0) >= 1 && (
              <div style={{ padding: "10px 14px", background: "rgba(255,107,107,0.06)", border: "1px solid rgba(255,107,107,0.25)", borderLeft: "3px solid #ff6b6b", borderRadius: 0, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b6b", marginBottom: 2 }}>⚠ LAST FREE RE-UPLOAD</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                  Final upload for {instrument} this session — <strong style={{ color: "#ff6b6b" }}>cooldown activates after this.</strong>
                </div>
              </div>
            )}

            {/* Upload zone */}
            <BulkUploadZone images={images} setImages={setImages} readSlotFile={readSlotFile} dragOverSlot={dragOverSlot} setDragOverSlot={setDragOverSlot} />

            {/* Progress indicator — only shows after first chart added */}
            {images.filter(Boolean).length > 0 && images.filter(Boolean).length < 5 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(images.filter(Boolean).length / 5) * 100}%`, background: "linear-gradient(90deg,#ff6bff,#00e5ff)", borderRadius: 2, transition: "width 0.3s ease" }}/>
                </div>
                <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.48)", marginTop: 6 }}>
                  {images.filter(Boolean).length} of 5 charts added
                </div>
              </div>
            )}

            {/* CTA */}
            {(() => {
              const mkt = instrument ? getMarketStatus(instrument, selectedSession) : { state: "closed" };
              const chartsReady = images.filter(Boolean).length === 5;
              const canGenerate = chartsReady && instrument && (mkt.state === "live" || mkt.state === "prep" || mkt.state === "london");

              const btnLabel = !instrument ? "SELECT AN INSTRUMENT ABOVE"
                : !chartsReady ? (images.filter(Boolean).length === 0 ? "SELECT YOUR 5 CHARTS" : `ADD ${5 - images.filter(Boolean).length} MORE CHART${5 - images.filter(Boolean).length !== 1 ? "S" : ""}`)
                : mkt.state === "closed" ? "WINDOW CLOSED — COME BACK AT 8:30 AM CT"
                : mkt.state === "wrong_session" ? `${instrument} — NY SESSION ONLY`
                : mkt.state === "prep" ? "GENERATE SCOUT PLAN →"
                : mkt.state === "london" ? "GENERATE LONDON PLAN →"
                : "GENERATE SESSION PLAN →";

              return (
                <button onClick={canGenerate ? analyzeCharts : undefined} disabled={!canGenerate}
                  style={{ width: "100%", marginTop: 16, padding: "15px", borderRadius: 10,
                    border: canGenerate ? "none" : "1px solid rgba(255,107,255,0.15)",
                    background: canGenerate
                      ? mkt.state === "prep" ? "linear-gradient(135deg,#ffd166,#cc8800)"
                      : mkt.state === "london" ? "linear-gradient(135deg,#00e5ff,#0099bb)"
                      : "linear-gradient(135deg,#ff6bff,#7b2fff)"
                      : "rgba(255,107,255,0.06)",
                    color: canGenerate ? (mkt.state === "prep" || mkt.state === "london" ? "#1e1a35" : "#fff") : "rgba(255,107,255,0.35)",
                    fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", fontFamily: "inherit",
                    cursor: canGenerate ? "pointer" : "default",
                    boxShadow: canGenerate ? "0 4px 32px rgba(255,107,255,0.3)" : "none",
                    transition: "all 0.2s" }}>
                  {btnLabel}
                </button>
              );
            })()}

            {/* Requirement line */}
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              Screenshots must clearly show the instrument ticker and timeframe.
            </div>

          </div>
        </div>
      )}

      {/* ══ PHASE: ANALYZING ═══════════════════════════════════════════════════ */}
      {appPage === "dashboard" && phase === "analyzing" && (
        <ChessBoardAnalyzing instrument={instrument} onBack={() => { setPhase("upload"); }} />
      )}

      {/* ══ PHASE: PLAN SUMMARY ════════════════════════════════════════════════ */}
      {appPage === "dashboard" && phase === "plan" && plan && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: isMobile ? "20px 16px" : "32px 24px", animation: "slide 0.35s ease both" }}>
          <div style={{ width: "100%", maxWidth: 520 }}>

          {/* ── BLOCKED STATE — instrument mismatch or chart error ── */}
          {plan._blocked && (
            <div style={{ animation:"fadein 0.4s ease both" }}>
              <div style={{ textAlign:"center", marginBottom:24 }}>
                <div style={{ fontSize:52, marginBottom:14 }}>
                  {plan._limitType === "cap" ? "⏱" : plan._limitType === "cooldown" ? "🔒" : "🚫"}
                </div>
                <div style={{ fontFamily:"'Space Mono',monospace", fontSize:14, fontWeight:900, letterSpacing:"0.2em", color: plan._limitType ? "#ffd166" : "#ff6b6b", marginBottom:14 }}>
                  {plan._limitType === "cap" ? "DAILY LIMIT REACHED" : plan._limitType === "cooldown" ? "COOLDOWN ACTIVE" : "UPLOAD REJECTED"}
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:"#f0ecff", marginBottom:16, lineHeight:1.6 }}>{plan._reason}</div>
              </div>

              {/* Show previous plan during cooldown */}
              {plan._limitType === "cooldown" && plan._prevPlan && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.14em", color:"#8878aa", marginBottom:12, fontFamily:"'Space Mono',monospace" }}>YOUR LAST {plan.instrument} ANALYSIS</div>
                  <div style={{ padding:"12px 14px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, marginBottom:10, fontSize:14, color:"#ccc4e8", lineHeight:1.7 }}>
                    {plan._prevPlan.summary}
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:10 }}>
                    {[
                      { label:"TRIGGER", val:plan._prevPlan.trigger_level, color: plan._prevPlan.bias==="SHORT"?"#ff6b6b":"#7fff6b" },
                      { label:"STOP",    val:plan._prevPlan.stop_loss,     color:"#ff6b6b" },
                      { label:"TP1",     val:plan._prevPlan.tp1,           color:"#7fff6b" },
                    ].map(r => r.val && (
                      <div key={r.label} style={{ padding:"8px 10px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:7, opacity:0.75 }}>
                        <div style={{ fontSize:7, color:"#8878aa", letterSpacing:"0.1em", marginBottom:3 }}>{r.label}</div>
                        <div style={{ fontSize:14, fontWeight:700, color:r.color, fontFamily:"monospace" }}>{r.val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize:13, color:"rgba(255,255,255,0.38)", fontFamily:"'Space Mono',monospace", textAlign:"center" }}>
                    Grade: {plan._prevPlan.grade} · {plan._prevPlan.bias} · {plan._prevPlan.confidence_score}% confidence
                  </div>
                </div>
              )}

              {!plan._limitType && (
                <div style={{ padding:"12px 16px", background:"rgba(255,209,102,0.06)", border:"1px solid rgba(255,209,102,0.2)", borderRadius:8, marginBottom:24, textAlign:"left" }}>
                  <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.16em", color:"#ffd166", marginBottom:8 }}>HOW TO FIX THIS</div>
                  <div style={{ fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:1.8 }}>
                    1. Open your broker platform<br/>
                    2. Make sure the <span style={{ color:"#ffd166" }}>instrument ticker</span> is visible in the chart title<br/>
                    3. Make sure the <span style={{ color:"#ffd166" }}>timeframe</span> (D, 4H, 1H, 30M, 15M) is visible<br/>
                    4. Take a new screenshot and re-upload
                  </div>
                </div>
              )}
              {plan._limitType === "cap" && (
                <div style={{ marginBottom:20, textAlign:"center" }}>
                  <button onClick={() => window.open("https://omniusd.pro/#pricing","_blank")}
                    style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:700, letterSpacing:"0.1em", padding:"10px 22px", borderRadius:8, border:"none", background:"linear-gradient(135deg,#ff6bff,#7b2fff)", color:"#fff", cursor:"pointer" }}>
                    ↑ Upgrade for more analyses →
                  </button>
                </div>
              )}
              <div style={{ textAlign:"center" }}>
                <button onClick={() => { setPhase("upload"); setImages(Array(5).fill(null)); }}
                  style={{ fontFamily:"inherit", fontSize:14, fontWeight:700, letterSpacing:"0.1em", padding:"10px 24px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#8878aa", cursor:"pointer" }}>
                  ← Back
                </button>
              </div>
            </div>
          )}

          {!plan._blocked && (<>

            {/* Grade + bias header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              {/* Grade badge — A+ gets green glow, others get muted treatment */}
              <div style={{
                fontSize: plan.grade === "A+" ? 48 : 36,
                fontWeight: 900,
                color: gradeColor,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                opacity: plan.grade === "A+" ? 1 : 0.75,
              }}>{plan.grade}</div>
              <div>
                <div style={{ fontSize: plan.grade === "A+" ? 18 : 15, fontWeight: 700, color: plan.grade === "A+" ? "#f0ecff" : "rgba(255,255,255,0.75)", marginBottom: 4 }}>
                  {plan.grade === "PASS" ? "No active setup"
                    : plan.grade === "SOFT PASS" ? "Pre-market — two scenarios to watch"
                    : plan.grade === "A+" ? `${plan.bias.charAt(0)+plan.bias.slice(1).toLowerCase()} setup — ready to execute`
                    : `${plan.bias.charAt(0)+plan.bias.slice(1).toLowerCase()} setup — not yet A+`}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", background: `${biasColor}14`, border: `1px solid ${biasColor}44`, borderRadius: 4, color: biasColor }}>{plan.bias}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", background: "rgba(255,209,102,0.1)", border: "1px solid rgba(255,209,102,0.3)", borderRadius: 4, color: "#ffd166" }}>{plan.confidence} CONFIDENCE · {plan.confidence_score}%</span>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, marginBottom: 16, fontSize: 13, color: "#ccc4e8", lineHeight: 1.7 }}>
              {plan.summary}
            </div>

            {/* Session context note — always show on weekends */}
            {(()=>{
              const now = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
              const day = now.getDay();
              const isWeekend = day === 0 || day === 6;
              if (!isWeekend) return null;
              return (
                <div style={{ padding: "10px 14px", background: "rgba(0,229,255,0.05)", border: "1px solid rgba(0,229,255,0.2)", borderLeft: "3px solid #00e5ff", borderRadius: 0, marginBottom: 16, fontSize: 13, color: "#00e5ff", lineHeight: 1.7 }}>
                  <span style={{ fontWeight: 700 }}>Weekend session:</span> {plan.session_note || (day===6 ? "Next valid BRC window — Asian session Sunday ~8:00 PM CT or NY session Monday ~8:30 AM CT." : "Asian session opens tonight. NY session Monday morning.")}
                </div>
              );
            })()}

            {/* Friday note */}
            {plan.friday_note && (
              <div style={{ padding: "10px 14px", background: "rgba(255,154,60,0.06)", border: "1px solid rgba(255,154,60,0.2)", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#ff9a3c", fontWeight: 600 }}>
                ⚠ {plan.friday_note}
              </div>
            )}

            {plan.grade === "SOFT PASS" ? (
              <>
                {/* SOFT PASS header — always visible */}
                <div style={{ padding:"12px 16px", background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.2)", borderLeft:"3px solid #00e5ff", borderRadius:0, marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.16em", color:"#00e5ff", marginBottom:6, fontFamily:"'Space Mono',monospace" }}>👁 PRE-MARKET WATCH</div>
                  <div style={{ fontSize:14, color:"rgba(255,255,255,0.8)", lineHeight:1.7 }}>
                    No entry yet — structure is forming. Two scenarios to watch at session open. <strong style={{ color:"#f0ecff" }}>One activates. The other doesn't.</strong>
                  </div>
                </div>

                {/* Scenarios — collapsible dropdown (proper component, no IIFE) */}
                <SoftPassScenariosPanel plan={plan} onActivate={(scenario, bias) => {
                  // Build a live-session-compatible plan from the activated scenario
                  const activatedPlan = {
                    ...plan,
                    grade: "A+",
                    bias,
                    trigger_level: scenario.trigger,
                    stop_loss: scenario.stop,
                    tp1: scenario.tp1,
                    tp2: scenario.tp2 || "",
                    runner: scenario.runner || "",
                    retest_zone: scenario.trigger,
                    summary: scenario.plan || plan.summary,
                    _activatedFromSoftPass: true,
                  };
                  // Set plan first, then start session with the activated plan directly
                  setPlan(activatedPlan);
                  startLiveSession(activatedPlan);
                }} />

                {/* Nav buttons */}
                <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                  <button onClick={() => { setPhase("upload"); setImages(Array(5).fill(null)); }}
                    style={{ flex:1, padding:"11px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"rgba(255,255,255,0.8)", fontSize:14, fontWeight:700, letterSpacing:"0.08em", fontFamily:"inherit", cursor:"pointer" }}>
                    ↩ New Analysis
                  </button>
                </div>

                {/* Full Analysis collapsible */}
                <FullAnalysisPanel plan={plan} />
              </>

            ) : plan.grade !== "PASS" ? (
              <>
                {/* A+ — show trigger/stop/TP1 execution cards */}
                {plan.grade === "A+" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16 }}>
                    {[
                      { label: "TRIGGER", val: plan.trigger_level, color: plan.bias === "SHORT" ? "#ff6b6b" : "#7fff6b" },
                      { label: "STOP", val: plan.stop_loss, color: "#ff6b6b" },
                      { label: "TP1", val: plan.tp1, color: "#7fff6b" },
                    ].map(r => (
                      <div key={r.label} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                        <div style={{ fontSize: 8, color: "#8878aa", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>{r.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: r.color, fontFamily: "monospace" }}>{r.val}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* NON A+ — show "What this setup still needs" checklist */}
                {plan.grade !== "A+" && (
                  <div style={{ padding: "14px 16px", background: "rgba(255,209,102,0.04)", border: "1px solid rgba(255,209,102,0.18)", borderLeft: "3px solid #ffd166", borderRadius: 0, marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.16em", color: "#ffd166", marginBottom: 10, fontFamily: "'Space Mono',monospace" }}>⚠ WHAT THIS SETUP STILL NEEDS</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 10, lineHeight: 1.6 }}>
                      This is a <span style={{ color: gradeColor, fontWeight: 700 }}>{plan.grade} grade</span> setup — not yet A+. Do NOT execute until every condition below is met.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {(plan.what_still_needed && plan.what_still_needed.length > 0
                        ? plan.what_still_needed
                        : [
                            `30M candle close ${plan.bias === "SHORT" ? "below" : "above"} ${plan.trigger_level}`,
                            `Retest holds ${plan.bias === "SHORT" ? "below" : "above"} ${plan.trigger_level} on the pullback`,
                            `Full 3-timeframe alignment — Daily + 4H + 1H all agree`,
                            `NY session window — valid entries 8:30–10:30 AM CT only`,
                          ]
                      ).map((cond, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <span style={{ fontSize: 13, color: "#ffd166", flexShrink: 0, marginTop: 1 }}>□</span>
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>{cond}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 6, fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "'Space Mono',monospace", lineHeight: 1.7 }}>
                      When all boxes are checked — that is an A+ setup. Until then, this is for watching only.
                    </div>
                  </div>
                )}

                {/* START / RESUME LIVE SESSION */}
                {messages.length > 0 ? (
                  // Active session exists — show Resume button
                  <button onClick={() => setPhase("live")}
                    style={{ width: "100%", padding: "15px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#00e5ff,#0099bb)", color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "inherit", cursor: "pointer", boxShadow: "0 4px 28px rgba(0,229,255,0.25)" }}>
                    ← BACK TO LIVE SESSION
                  </button>
                ) : (
                  <button onClick={startLiveSession}
                    style={{ width: "100%", padding: "15px", borderRadius: 10, border: plan.grade === "A+" ? "none" : "1px solid rgba(255,255,255,0.1)", background: plan.grade === "A+" ? "linear-gradient(135deg,#ff6bff,#7b2fff)" : "rgba(255,255,255,0.04)", color: plan.grade === "A+" ? "#fff" : "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "inherit", cursor: "pointer", boxShadow: plan.grade === "A+" ? "0 4px 28px rgba(255,107,255,0.25)" : "none" }}>
                    {plan.grade === "A+" ? "START LIVE SESSION →" : "MONITOR SETUP →"}
                  </button>
                )}
                <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "#8878aa" }}>
                  {messages.length > 0 ? "Your live session is still active" : plan.grade === "A+" ? "Live session tracks tier confirmations in real time" : "Monitor until all A+ conditions are met"}
                </div>

                {/* Save to History — A+ only */}
                {plan.grade === "A+" && (() => {
                  const existing = (() => { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]"); } catch { return []; } })();
                  const alreadySaved = existing.some(e => e.instrument === plan.instrument && e.date === new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}));
                  return (
                    <button onClick={() => { if (!alreadySaved) saveToHistory(plan); }}
                      style={{ width:"100%", marginTop:8, padding:"10px", borderRadius:8, border:`1px solid ${alreadySaved ? "rgba(127,255,107,0.2)" : "rgba(127,255,107,0.35)"}`, background: alreadySaved ? "rgba(127,255,107,0.04)" : "rgba(127,255,107,0.08)", color: alreadySaved ? "rgba(127,255,107,0.45)" : "#7fff6b", fontSize:13, fontWeight:700, letterSpacing:"0.1em", fontFamily:"inherit", cursor: alreadySaved ? "default" : "pointer" }}>
                      {alreadySaved ? "✓ SAVED TO HISTORY" : "📋 SAVE TO HISTORY"}
                    </button>
                  );
                })()}

                {/* ── FULL ANALYSIS — collapsible ── */}
                <FullAnalysisPanel plan={plan} />

                {/* ── NAV ── */}
                <div style={{ display:"flex", gap:8, marginTop:12 }}>
                  <button onClick={() => setPhase("upload")}
                    style={{ padding:"11px 18px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#8878aa", fontSize:13, fontWeight:700, letterSpacing:"0.08em", fontFamily:"inherit", cursor:"pointer" }}>
                    ← Back
                  </button>
                  {messages.length > 0 && (
                    <button onClick={() => setPhase("live")}
                      style={{ flex:1, padding:"11px", borderRadius:8, border:"1px solid rgba(0,229,255,0.3)", background:"rgba(0,229,255,0.06)", color:"#00e5ff", fontSize:14, fontWeight:700, letterSpacing:"0.08em", fontFamily:"inherit", cursor:"pointer" }}>
                      ← Live Session
                    </button>
                  )}
                </div>
              </>
            ) : (
              (() => {
                const _n = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
                const _d = _n.getDay();
                const _m = _n.getHours()*60+_n.getMinutes();
                const isWeekendPass = (_d===6||(_d===0&&_m<20*60)) && plan.pass_reason && plan.pass_reason.includes("Weekend");
                const isScoutMode = plan._scoutMode === true;

                // SCOUT MODE — window closed, levels valid for next session
                if (isScoutMode) return (
                  <div style={{ animation:"fadein 0.4s ease both" }}>
                    <div style={{ padding:"16px 18px", background:"rgba(0,229,255,0.04)", border:"1px solid rgba(0,229,255,0.2)", borderLeft:"3px solid #00e5ff", borderRadius:0, marginBottom:16 }}>
                      <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.2em", color:"#00e5ff", marginBottom:10, fontFamily:"'Space Mono',monospace" }}>🔭 SCOUT MODE — SESSION CLOSED</div>
                      <div style={{ fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:1.9 }}>
                        {plan.pass_reason}
                      </div>
                    </div>
                    {/* Show key levels as watchlist */}
                    {plan.key_levels && plan.key_levels.length > 0 && (
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:13, fontWeight:900, letterSpacing:"0.14em", color:"#ffd166", marginBottom:10, fontFamily:"'Space Mono',monospace" }}>📋 WATCHLIST FOR NEXT SESSION</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                          {plan.key_levels.map((lvl,i) => (
                            <div key={i} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:1.6 }}>
                              <span style={{ color:"#ffd166", flexShrink:0 }}>→</span>
                              <span>{lvl}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {plan.trigger_level && (
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
                        {[
                          { label:"TRIGGER", val:plan.trigger_level, color: plan.bias==="SHORT"?"#ff6b6b":"#7fff6b" },
                          { label:"STOP",    val:plan.stop_loss,     color:"#ff6b6b" },
                          { label:"TP1",     val:plan.tp1,           color:"#7fff6b" },
                        ].map(r => r.val && (
                          <div key={r.label} style={{ padding:"10px 12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, opacity:0.6 }}>
                            <div style={{ fontSize:8, color:"#8878aa", letterSpacing:"0.1em", marginBottom:4 }}>{r.label}</div>
                            <div style={{ fontSize:14, fontWeight:700, color:r.color, fontFamily:"monospace" }}>{r.val}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ padding:"10px 14px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:8, fontSize:13, color:"rgba(255,255,255,0.75)", fontFamily:"'Space Mono',monospace", lineHeight:1.8 }}>
                      These levels are for reference only. No execution until the next valid session window opens.
                    </div>
                    <FullAnalysisPanel plan={plan} />
                  </div>
                );

                if (isWeekendPass) return (
                  <div style={{ animation: "fadein 0.4s ease both" }}>
                    {/* Header */}
                    <div style={{ textAlign:"center", marginBottom:24 }}>
                      <div style={{ fontSize:14, fontWeight:900, letterSpacing:"0.2em", color:"#ff6b6b", marginBottom:12, fontFamily:"'Space Mono',monospace" }}>PASS — WEEKEND SESSION</div>
                      <div style={{ fontSize:18, fontWeight:800, color:"#f0ecff", lineHeight:1.3, fontFamily:"'Syne',sans-serif" }}>
                        Our job is to protect you<br/>from bad trades — not just good ones.
                      </div>
                    </div>

                    {/* Why */}
                    <div style={{ padding:"16px 18px", background:"rgba(255,107,107,0.04)", border:"1px solid rgba(255,107,107,0.15)", borderLeft:"3px solid #ff6b6b", borderRadius:0, marginBottom:14, fontFamily:"'Space Mono',monospace", fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:1.9 }}>
                      Weekend crypto volume is thin, choppy, and driven by retail noise — not institutional structure. A setup that looks clean right now can completely reset before Monday's open. This is not a valid BRC execution window.
                    </div>

                    {/* FOMO section */}
                    <div style={{ padding:"16px 18px", background:"rgba(255,209,102,0.04)", border:"1px solid rgba(255,209,102,0.15)", borderLeft:"3px solid #ffd166", borderRadius:0, marginBottom:14 }}>
                      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:13, fontWeight:900, letterSpacing:"0.16em", color:"#ffd166", marginBottom:10 }}>ON FOMO</div>
                      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:1.9 }}>
                        The feeling that you are missing something right now is one of the most expensive emotions in trading. <span style={{ color:"#ffd166", fontWeight:700 }}>The market will always be there. Monday will always come.</span> The same structure you are looking at tonight will either still be valid when a real session opens — or it will have reset and protected you from a bad trade.
                      </div>
                      <div style={{ fontFamily:"'Space Mono',monospace", fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:1.9, marginTop:10, fontWeight:700 }}>
                        Either way, you win by waiting.
                      </div>
                    </div>

                    {/* The hard truth */}
                    <div style={{ padding:"14px 18px", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, marginBottom:20, fontFamily:"'Space Mono',monospace", fontSize:14, color:"rgba(255,255,255,0.75)", lineHeight:1.9, fontStyle:"italic" }}>
                      The traders who blow accounts do not lose on A+ setups. They lose on Saturday nights when they convinced themselves the setup was too good to wait.
                    </div>

                    {/* Come back times */}
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:20 }}>
                      {[
                        { label:"ASIAN SESSION", time:"Sunday ~8:00 PM CT", color:"#00e5ff" },
                        { label:"NY SESSION",    time:"Monday ~8:30 AM CT",  color:"#7fff6b" },
                      ].map(r=>(
                        <div key={r.label} style={{ padding:"12px 14px", background:`${r.color}08`, border:`1px solid ${r.color}22`, borderRadius:8, textAlign:"center" }}>
                          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:8, fontWeight:900, letterSpacing:"0.14em", color:r.color, marginBottom:6 }}>{r.label}</div>
                          <div style={{ fontFamily:"'Space Mono',monospace", fontSize:14, fontWeight:700, color:"#f0ecff" }}>{r.time}</div>
                        </div>
                      ))}
                    </div>

                    <button onClick={() => { setPhase("upload"); setImages(Array(5).fill(null)); }}
                      style={{ width:"100%", fontSize:13, fontWeight:700, letterSpacing:"0.1em", padding:"11px", borderRadius:8, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.03)", color:"#8878aa", cursor:"pointer", fontFamily:"inherit" }}>
                      ← New Analysis
                    </button>
                  </div>
                );

                // Standard weekday PASS
                return (
                  <div style={{ padding:"16px", background:"rgba(255,107,107,0.06)", border:"1px solid rgba(255,107,107,0.2)", borderRadius:10, textAlign:"center" }}>
                    <div style={{ fontSize:14, color:"#ff8080", fontWeight:700, marginBottom:6 }}>No valid entry — PASS</div>
                    <div style={{ fontSize:14, color:"#8878aa", marginBottom:14 }}>{plan.pass_reason || "No A+ BRC sequence formed. Wait for fresh structure."}</div>
                    <button onClick={() => { setPhase("upload"); setImages(Array(5).fill(null)); }}
                      style={{ fontSize:13, fontWeight:700, letterSpacing:"0.08em", padding:"8px 20px", borderRadius:8, border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.04)", color:"#8878aa", cursor:"pointer", fontFamily:"inherit" }}>
                      ← New Analysis
                    </button>
                    <FullAnalysisPanel plan={plan} />
                  </div>
                );
              })()
            )}
          </>)}
          </div>
        </div>
      )}

      {/* ══ PHASE: LIVE SESSION ════════════════════════════════════════════════ */}
      {appPage === "dashboard" && phase === "live" && plan && (
        <>
          {/* Progress strip — desktop only badge, mobile gets it in header already */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 16px", height: 32, borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, overflowX: "auto" }}>
            {[
              { label: "Break",       done: tier1,        active: !tier1 },
              { label: "Tier 1",      done: tier1,        active: !tier1 },
              { label: "Tier 2",      done: tier2,        active: tier1 && !tier2 },
              { label: "Limit Order", done: tier2,        active: tier1 && tier2 },
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: t.done ? "#7fff6b" : t.active ? "#00e5ff" : "rgba(255,255,255,0.15)", boxShadow: t.active ? "0 0 6px rgba(0,229,255,0.5)" : "none", animation: t.active ? "pulse 1.5s ease infinite" : "none", transition: "all 0.4s" }}/>
                <span style={{ fontSize: 13, fontWeight: 700, margin: "0 5px", color: t.done ? "#7fff6b" : t.active ? "#00e5ff" : "rgba(255,255,255,0.80)", whiteSpace: "nowrap" }}>{t.label}</span>
                {i < 3 && <div style={{ width: 14, height: 1, background: t.done ? "#7fff6b" : "rgba(255,255,255,0.08)", marginRight: 3 }}/>}
              </div>
            ))}
            {/* Status badge — desktop only, mobile already shows it in header */}
            {!isMobile && (
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 20, background: `${stateObj.color}14`, border: `1px solid ${stateObj.color}44`, flexShrink: 0 }}>
                {stateObj.dot && <span style={{ width: 4, height: 4, borderRadius: "50%", background: stateObj.color, animation: "pulse 1.5s ease infinite", display: "inline-block" }}/>}
                <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.1em", color: stateObj.color }}>{stateObj.label}</span>
              </div>
            )}
          </div>

          {/* ── TWO COLUMN BODY ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>

            {/* ── LEFT COLUMN — locked plan ── */}
            <div style={{ width: isMobile ? "100%" : 220, flexShrink: 0, borderRight: isMobile ? "none" : "1px solid rgba(255,255,255,0.09)", borderBottom: isMobile ? "1px solid rgba(255,255,255,0.08)" : "none", background: "rgba(123,47,255,0.04)", display: "flex", flexDirection: "column", overflowY: isMobile ? "hidden" : "auto" }}>

              {/* MOBILE: full-width status block */}
              {isMobile ? (
                <div style={{ padding: "10px 14px" }}>
                  {/* Status bar */}
                  <div style={{ padding: "10px 14px", background: tier2 ? "rgba(127,255,107,0.07)" : tier1 ? "rgba(255,209,102,0.07)" : "rgba(0,229,255,0.06)", border: `1px solid ${tier2 ? "rgba(127,255,107,0.3)" : tier1 ? "rgba(255,209,102,0.3)" : "rgba(0,229,255,0.2)"}`, borderLeft: `3px solid ${tier2 ? "#7fff6b" : tier1 ? "#ffd166" : "#00e5ff"}`, marginBottom: 10 }}>
                    <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.14em", color: tier2 ? "#7fff6b" : tier1 ? "#ffd166" : "#00e5ff", marginBottom: 4 }}>LIVE STATUS</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f0ecff", lineHeight: 1.5 }}>
                      {tier2 ? `Limit order ready at ${plan.retest_zone}.`
                        : tier1 ? `Tier 1 confirmed. Watching for Tier 2.`
                        : `Watching for 30M close ${plan.bias === "SHORT" ? "below" : "above"} ${plan.trigger_level}.`}
                    </div>
                    {!tier1 && <div style={{ fontSize: 13, color: "#8878aa", marginTop: 3 }}>No entry until candle fully closes.</div>}
                    {tier1 && !tier2 && <div style={{ fontSize: 13, color: "rgba(255,209,102,0.6)", marginTop: 3 }}>Do not enter yet. Wait for Tier 2.</div>}
                  </div>
                  {/* Mobile: horizontal scrollable key levels */}
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
                    {[
                      { l: "Trigger", v: plan.trigger_level, c: plan.bias === "SHORT" ? "#ff6b6b" : "#7fff6b" },
                      { l: "Stop",    v: plan.stop_loss,     c: "#ff6b6b" },
                      { l: "TP1",     v: plan.tp1,           c: "#7fff6b" },
                      { l: "TP2",     v: plan.tp2,           c: "#7fff6b" },
                      { l: "Runner",  v: plan.runner,        c: "#00e5ff" },
                    ].map((r, i) => (
                      <div key={i} style={{ flexShrink: 0, padding: "7px 11px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, textAlign: "center", minWidth: 70 }}>
                        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.75)", letterSpacing: "0.1em", marginBottom: 4 }}>{r.l}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: r.c, fontFamily: "monospace" }}>{r.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* DESKTOP: original vertical layout */}
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 8, color: "#8878aa", letterSpacing: "0.1em" }}>TIME</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#00e5ff", fontFamily: "monospace" }}>{ctTime} CT</span>
                      </div>
                      {!windowClosed && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <span style={{ fontSize: 8, color: "#8878aa", letterSpacing: "0.1em" }}>NEXT CLOSE</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#ffd166", fontFamily: "monospace" }}>{nextClose} CT</span>
                        </div>
                      )}
                      {windowClosed && <div style={{ fontSize: 13, color: "#ff6b6b", fontWeight: 700 }}>Window closed</div>}
                    </div>
                  </div>
                  <div style={{ margin: "10px 12px 0", padding: "10px 12px", background: tier2 ? "rgba(127,255,107,0.06)" : tier1 ? "rgba(255,209,102,0.06)" : "rgba(0,229,255,0.05)", border: `1px solid ${tier2 ? "rgba(127,255,107,0.25)" : tier1 ? "rgba(255,209,102,0.25)" : "rgba(0,229,255,0.18)"}`, borderLeft: `3px solid ${tier2 ? "#7fff6b" : tier1 ? "#ffd166" : "#00e5ff"}`, borderRadius: 0 }}>
                    <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.14em", color: tier2 ? "#7fff6b" : tier1 ? "#ffd166" : "#00e5ff", marginBottom: 5 }}>LIVE STATUS</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f0ecff", lineHeight: 1.5 }}>
                      {tier2 ? `Limit order ready at ${plan.retest_zone}.`
                        : tier1 ? `Tier 1 confirmed. Watching for Tier 2.`
                        : `Watching for 30M close ${plan.bias === "SHORT" ? "below" : "above"} ${plan.trigger_level}.`}
                    </div>
                    {!tier1 && <div style={{ fontSize: 13, color: "#8878aa", marginTop: 4, lineHeight: 1.5 }}>No entry until candle fully closes.</div>}
                    {tier1 && !tier2 && <div style={{ fontSize: 13, color: "rgba(255,209,102,0.6)", marginTop: 4, lineHeight: 1.5 }}>Do not enter yet. Wait for Tier 2.</div>}
                  </div>
                  <div style={{ padding: "14px 12px 0" }}>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.38)", letterSpacing: "0.14em", marginBottom: 10 }}>LOCKED PLAN</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {[
                        { l: "Trigger", v: plan.trigger_level, c: plan.bias === "SHORT" ? "#ff6b6b" : "#7fff6b" },
                        { l: "Retest",  v: plan.retest_zone,   c: "#ffd166" },
                        { l: "Stop",    v: plan.stop_loss,     c: "#ff6b6b" },
                        { l: "TP1",     v: plan.tp1,           c: "#7fff6b" },
                        { l: "TP2",     v: plan.tp2,           c: "#7fff6b" },
                        { l: "Runner",  v: plan.runner,        c: "#00e5ff" },
                      ].map((r, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{r.l}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: r.c, fontFamily: "monospace" }}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "14px 12px", marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.25)", color: "#ff6b6b" }}>{plan.instrument}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.25)", color: "#ff6b6b" }}>{plan.bias}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: "rgba(127,255,107,0.08)", border: "1px solid rgba(127,255,107,0.2)", color: "#7fff6b" }}>{plan.grade}</span>
                    </div>
                  </div>
                </>
              )}

            </div>

            {/* ── RIGHT COLUMN — chat ── */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 8px" }}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 10, animation: "slide 0.2s ease both" }}>
                    <div style={{ maxWidth: "88%", padding: "9px 13px", borderRadius: msg.role === "user" ? "10px 10px 3px 10px" : "10px 10px 10px 3px", background: msg.role === "user" ? "rgba(255,107,255,0.1)" : "rgba(255,255,255,0.04)", border: msg.role === "user" ? "1px solid rgba(255,107,255,0.2)" : "1px solid rgba(255,255,255,0.07)", fontSize: isMobile ? 13 : 12, lineHeight: 1.75, color: msg.role === "user" ? "#f0ecff" : "#ccc4e8" }} dangerouslySetInnerHTML={{ __html: fmt(msg.content) }}/>
                    <span style={{ fontSize: 8, color: "#8878aa", marginTop: 3, paddingLeft: 3, paddingRight: 3 }}>{msg.role === "user" ? "You" : "OmniUSD"} · {msg.time} CT</span>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: "flex", marginBottom: 10 }}>
                    <div style={{ padding: "9px 13px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px 10px 10px 3px" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[0,1,2].map(d => <span key={d} style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff6bff", animation: `pulse 1s ease ${d*0.2}s infinite`, display: "inline-block" }}/>)}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>

              {/* Live time strip — next candle countdown */}
              {(() => {
                const ctNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
                const minsLeft = ctNow.getMinutes() < 30 ? 30 - ctNow.getMinutes() : 60 - ctNow.getMinutes();
                const tzShort = getUserTZShort();
                return (
                  <div style={{ padding:"5px 16px 6px", display:"flex", alignItems:"center", gap:10, borderTop:"1px solid rgba(255,255,255,0.04)", background:"rgba(0,229,255,0.025)" }}>
                    <span style={{ width:6, height:6, borderRadius:"50%", background:"#00e5ff", display:"inline-block", animation:"pulse 1.5s ease infinite", flexShrink:0 }}/>
                    <span style={{ fontSize:13, fontWeight:700, color:"#00e5ff", fontFamily:"'Space Mono',monospace" }}>{ctTime} {tzShort}</span>
                    <span style={{ fontSize:13, color:"rgba(255,255,255,0.80)" }}>|</span>
                    <span style={{ fontSize:13, color:"rgba(255,255,255,0.75)", fontFamily:"'Space Mono',monospace" }}>
                      Next 30M close: <strong style={{ color:"#ffd166" }}>{nextClose}</strong> (in {minsLeft}m)
                    </span>
                  </div>
                );
              })()}

              {/* Input */}
              <div style={{ padding: "8px 16px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
                {messages.filter(m=>m.role==="user").length >= 30 ? (
                  <div style={{ flex:1, padding:"9px 13px", fontFamily:"'Space Mono',monospace", fontSize:13, color:"rgba(255,107,107,0.7)", background:"rgba(255,107,107,0.05)", border:"1px solid rgba(255,107,107,0.15)", borderRadius:8 }}>
                    Session limit reached (30 messages). Start a new analysis to continue.
                  </div>
                ) : (
                  <>
                    <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                      placeholder="Type what the candle closed at..."
                      style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, padding: "10px 14px", fontSize: isMobile ? 13 : 12, color: "#f0ecff", fontFamily: "inherit", outline: "none" }}/>
                    <button onClick={sendMessage} disabled={loading || !input.trim()}
                      style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: input.trim() && !loading ? "linear-gradient(135deg,#ff6bff,#7b2fff)" : "rgba(255,255,255,0.05)", color: input.trim() && !loading ? "#fff" : "#8878aa", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", cursor: input.trim() && !loading ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.2s" }}>
                      SEND →
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CopyPrice({val,big,color}){
  const [copied,setCopied]=useState(false);
  const c=color||"#00e5ff";
  if(!val||val==="—")return <span style={{fontSize:big?26:20,fontWeight:900,color:c}}>{val||"—"}</span>;
  function doCopy(){
    navigator.clipboard.writeText(String(val).replace(/[^0-9.,\- ]/g,"")).catch(()=>{});
    setCopied(true);setTimeout(()=>setCopied(false),1400);
  }
  return(
    <button onClick={doCopy} title="Tap to copy" style={{background:"none",border:"none",padding:0,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5,fontFamily:"inherit"}}>
      <span style={{fontSize:big?26:20,fontWeight:900,color:c}}>{val}</span>
      <span style={{fontSize:13,color:copied?"#7fff6b":"var(--t-muted5)",letterSpacing:"0.08em",transition:"color 0.3s"}}>{copied?"✓":"⊕"}</span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SESSION PLAN
// ═══════════════════════════════════════════════════════════════════════════
function SessionPlan({result,instrument,images,profile,onReset,onJournalEntry,selectedSession,T=DARK}){
  const pd    = result.primary_decision||{};
  const ep    = result.execution_plan||{};
  const why   = result.why||{};
  const pe    = result.plain_english||{};
  const grade = pd.grade||"PASS";
  const isSkip= grade==="PASS";
  const isActive= grade==="A+"||grade==="A";
  const isDev = grade==="B"||grade==="C";

  const [tradeState,setTradeState]=useState((isActive||isDev)?"ARMED_T1":"PRECHECK");
  const [showTracker,setShowTracker]=useState(false);
  const [showAlt,setShowAlt]=useState(false);
  const [showPE,setShowPE]=useState(false);
  const [showAlerts,setShowAlerts]=useState(false);
  const [showChart,setShowChart]=useState(false);
  const [checks,setChecks]=useState({closed:false,level:false,open:false});
  const allChecked=Object.values(checks).every(Boolean);
  const [now,setNow]=useState(Date.now());
  const [t1Time,setT1Time]=useState(null);

  useEffect(()=>{
    if(!showTracker)return;
    const id=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(id);
  },[showTracker]);

  function advanceTo(s){setTradeState(s);if(s==="ARMED_T1"){setT1Time(null);}}
  function elapsed(ms){
    if(!ms)return"—";
    const s=Math.floor((Date.now()-ms)/1000);
    return`${Math.floor(s/60)}m ${s%60}s`;
  }

  const stateColors={PRECHECK:"#ffd166",ARMED_T1:"#00e5ff",ARMED_T2:"#00e5ff",EXECUTABLE:"#7fff6b",IN_TRADE:"#ff6bff",INVALIDATED:"#ff6b6b",COMPLETE:"#7fff6b"};
  const stateLabels={PRECHECK:"Waiting for trigger",ARMED_T1:"⚡ Tier 1 — Watching",ARMED_T2:"⏱ Tier 2 — Timer running",EXECUTABLE:"✅ Ready to execute",IN_TRADE:"📈 In trade",INVALIDATED:"🚫 Invalidated",COMPLETE:"✓ Complete"};

  const session=selectedSession||profile?.session||null;
  const SESSION_CONTEXT={
    NY:{
      p1_note:"NY session has strong volume. The 30M close will be decisive. Wait for the full candle — do not jump on the wick.",
      p2_note:"Retests in NY are often fast and aggressive. Price may only touch the zone briefly. Have your limit order ready before the retest.",
      p3_note:"NY execution window is 8:30–10:30 AM CT. Best entries are at the 9:00 and 9:30 30M closes.",
      p3_warn:null,
    },
    LONDON:{
      p1_note:"London moves can be sharp and fast. The break may happen quickly at session open. Wait for the full 30M candle close — not the initial spike.",
      p2_note:"London retests can be shallow. Price sometimes only partially fills the zone before continuing. Set your limit early and let it work.",
      p3_note:"London execution window is 2:00–5:00 AM CT. Structure is real but spreads can be slightly wider than NY.",
      p3_warn:null,
    },
    LONDON_NY:{
      p1_note:"London-NY overlap is the highest volume window of the day. Fakeouts are common right at 8:30 CT open. The 9:00 or 9:30 candle close is the most reliable Phase 1 signal.",
      p2_note:"Retests in the overlap can be very fast. Volume is high and price can reverse sharply from the zone. Be ready — do not wait for the perfect tick.",
      p3_note:"This is the premium execution window. Best confluence, best follow-through. Size can be standard.",
      p3_warn:null,
    },
    ASIAN:{
      p1_note:"Asian session has low volume and wide spreads. Even a clean 30M close may not have follow-through. Be extra selective.",
      p2_note:"Asian retests are often slow and grinding. Price may sit in the zone for multiple candles. This can feel like confirmation but be cautious — volume is thin.",
      p3_note:"Consider reducing position size in the Asian session. Valid setups exist but follow-through risk is higher than NY or London.",
      p3_warn:"⚠ Low volume session — even a valid A+ setup carries higher no-follow-through risk. Consider waiting for London open confirmation.",
    },
  };
  const sctx = session ? (SESSION_CONTEXT[session]||null) : null;

  // TradingView — shared across all phases
  const TV_SYMBOLS={
    XAUUSD:"OANDA:XAUUSD",NAS100:"CAPITALCOM:US100",
    US30:"CAPITALCOM:US30",BTCUSD:"COINBASE:BTCUSD",
    USOIL:"TVC:USOIL",US500:"OANDA:SPX500USD",
  };
  const tvSym=TV_SYMBOLS[instrument]||`OANDA:${instrument}`;
  const tvInterval=tradeState==="EXECUTABLE"?"15":"30"; // Phase 3 → 15M, else 30M
  const tvUrl=`https://www.tradingview.com/chart/?symbol=${tvSym}&interval=${tvInterval}`;

  const bias=pd.bias||"NEUTRAL";
  const isShort=bias==="SHORT";
  const dirWord=isShort?"below":"above";
  const dirWordBack=isShort?"below":"above";
  const zoneType=isShort?"resistance":"support";
  const biasColor=bias==="LONG"?"#7fff6b":bias==="SHORT"?"#ff6b6b":"#ffd166";
  const tc=result.trigger_conditions||{};
  const cl=result.critical_levels||{};
  const sp=result.secondary_plan||{};
  const tr=result.timeframe_reads||{};

  // Shared price extraction — used in current state bar AND tracker
  const _stripFn=(v)=>{if(!v||v==="—")return v||"—";const m=v.match(/^([0-9,.\s–\-]+(?:\s*[–\-]\s*[0-9,.]+)?)/);return m?m[1].trim():v;};
  const triggerLevel=_stripFn(ep.break_trigger_level||(isShort?(cl.short_trigger||cl.long_trigger||"—"):(cl.long_trigger||cl.short_trigger||"—")));
  const retestZone  =_stripFn(ep.retest_zone||ep.entry||(isShort?cl.major_resistance:cl.major_support)||"—");
  const stopLevel   =ep.stop_tight||ep.stop_wide||"—";

  // Alt condition — strip leading "Activates if/on"
  const rawAlt=sp.condition||"";
  const altCondition=rawAlt.replace(/^(activates\s+(if|on|when)\s*)/i,"").replace(/^\w/,c=>c.toUpperCase());
  const hasAlt=sp.direction&&sp.direction!=="NONE"&&altCondition;

  // Why sentences — split on sentence boundary only
  function splitWhy(text){
    if(!text)return[];
    return text.match(/[^.!?]+[.!?]+/g)||[text];
  }

  const gradePalette={
    "A+":"#7fff6b","A":"#7fff6b","B":"#ffd166","C":"#ff9a3c","PASS":"#ff6b6b"
  };
  const gc=gradePalette[grade]||"#ffd166";

  return(
    <div style={{animation:"icc-fade 0.4s ease both"}}>
      {/* Top bar */}
      <div style={S.planTopBar}>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          {/* GRADE — dominant, largest chip */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 18px",
            background:gc+"20",border:`2px solid ${gc}70`,borderRadius:10,
            boxShadow:`0 0 16px ${gc}22`}}>
            <span style={{fontSize:13,fontWeight:900,letterSpacing:"0.16em",color:gc,opacity:0.8}}>GRADE</span>
            <span style={{fontSize:30,fontWeight:900,color:gc,lineHeight:1,letterSpacing:"-0.02em"}}>{grade}</span>
          </div>
          {/* BIAS — secondary */}
          <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 14px",background:biasColor+"14",border:`1px solid ${biasColor}40`,borderRadius:8}}>
            <span style={{fontSize:13,fontWeight:900,letterSpacing:"0.12em",color:biasColor,opacity:0.8}}>BIAS</span>
            <span style={{fontSize:18,fontWeight:900,color:biasColor}}>{bias}</span>
          </div>
          {/* INSTRUMENT — tertiary */}
          <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 14px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8}}>
            <span style={{fontSize:13,fontWeight:700,letterSpacing:"0.12em",color:"var(--t-muted4)"}}>INSTRUMENT</span>
            <span style={{fontSize:14,fontWeight:900,color:"var(--t-muted)"}}>{instrument}</span>
          </div>
          {pd.alignment&&(
            <div style={{fontSize:13,fontWeight:700,letterSpacing:"0.08em",color:"var(--t-muted4)",padding:"6px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8}}>
              {pd.alignment}
            </div>
          )}
        </div>
        <button onClick={onReset} style={S.resetBtn}>← New Analysis</button>
      </div>

      {/* Primary decision card */}
      <div style={{background:isSkip?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.04)",border:`1px solid ${isSkip?"rgba(255,107,107,0.15)":gc+"40"}`,borderRadius:16,padding:"18px 22px",marginBottom:isSkip?10:20,opacity:isSkip?0.85:1}}>
        <p style={{fontSize:13,fontWeight:900,letterSpacing:"0.2em",color:"var(--t-muted4)",margin:"0 0 10px"}}>{isSkip?"SESSION VERDICT":"PRIMARY DECISION"}</p>
        <div style={{display:"flex",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:6}}>
              {/* Grade badge */}
              <span style={{fontSize:isSkip?22:32,fontWeight:900,color:gc,lineHeight:1,letterSpacing:"-0.02em"}}>{grade}</span>
              {/* Setup label */}
              <span style={{fontSize:isSkip?13:18,fontWeight:isSkip?600:900,lineHeight:1.2,
                color:isActive?"#7fff6b":isSkip?"var(--t-muted3)":"#ffd166"}}>
                {isSkip?"No active setup — observe only"
                 :isActive?`${bias.charAt(0)+bias.slice(1).toLowerCase()} setup`
                 :`${grade}-grade ${bias.toLowerCase()} setup developing`}
              </span>
              {/* Bias pill — hide on PASS */}
              {!isSkip&&(
                <span style={{fontSize:14,fontWeight:900,color:biasColor,
                  background:biasColor+"18",border:`1px solid ${biasColor}40`,
                  padding:"3px 10px",borderRadius:6,letterSpacing:"0.06em"}}>
                  {bias}
                </span>
              )}
            </div>
            {pd.confidence_reason&&!isSkip&&(
              <p style={{fontSize:14,color:"var(--t-muted)",margin:0,lineHeight:1.65,fontWeight:500}}>{pd.confidence_reason}</p>
            )}
            {pd.confidence_reason&&isSkip&&(
              <p style={{fontSize:14,color:"var(--t-muted3)",margin:0,lineHeight:1.6,fontWeight:400}}>{pd.confidence_reason}</p>
            )}
          </div>
          {/* Only show confidence/BRC phase chips for active setups */}
          {!isSkip&&(
            <>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",flexShrink:0}}>
              {pd.confidence&&(
                <div style={{textAlign:"center",padding:"8px 14px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8}}>
                  <div style={{fontSize:13,color:"var(--t-muted4)",letterSpacing:"0.1em",marginBottom:3}}>ANALYSIS CONFIDENCE</div>
                  <div style={{fontSize:17,fontWeight:900,color:"#ffd166"}}>{pd.confidence}</div>
                  <div style={{fontSize:13,color:"var(--t-muted4)",marginTop:3,fontWeight:500}}>how clear the read is</div>
                </div>
              )}
              {pd.icc_phase&&(
                <div style={{textAlign:"center",padding:"8px 14px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8}}>
                  <div style={{fontSize:13,color:"var(--t-muted4)",letterSpacing:"0.1em",marginBottom:3}}>BRC PHASE</div>
                  <div style={{fontSize:14,fontWeight:900,color:"var(--t-text)"}}>{result.icc_phase||"—"}</div>
                </div>
              )}
            </div>
            {pd.confidence&&(
              <div style={{fontSize:14,color:"var(--t-muted3)",marginTop:10,fontWeight:500,lineHeight:1.6,maxWidth:420}}>
                <span style={{color:"var(--t-text)",fontWeight:700}}>Grade</span> = setup quality based on timeframe alignment.{" "}
                <span style={{color:"var(--t-text)",fontWeight:700}}>Confidence</span> = how clearly the charts support this read.
              </div>
            )}
            </>
          )}
        </div>
      </div>

      {/* Trigger conditions — for B/C/SKIP */}

      {/* ── CURRENT STATE SUMMARY ── */}
      {(()=>{
        // Check if execution window is closed (after 10:30 AM CT)
        const nowCT = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
        const nowMins = nowCT.getHours()*60+nowCT.getMinutes();
        const windowClosed = (session==="NY"||session==="LONDON_NY")&&nowMins>10*60+30;

        const stateConfig={
          PRECHECK:  {label:`Waiting for ${dirWord} break — watching ${triggerLevel}`, color:"#ffd166", dot:true},
          ARMED_T1:{
            label: isSkip ? `No valid entry — watching ${triggerLevel} trigger`
                  : isDev  ? `${grade}-grade ${bias.toLowerCase()} setup developing`
                  : `Waiting for 30M close ${dirWord} ${triggerLevel}`,
            color: isSkip?"var(--t-muted3)": isDev?"#ffd166":"#00e5ff",
            dot: !isSkip,
          },
          ARMED_T2:  {label:`Retest forming at ${retestZone} — do not enter yet`,  color:"#ffd166", dot:true},
          EXECUTABLE:{label:"Execution ready — place your limit order now",          color:"#7fff6b", dot:true},
          IN_TRADE:  {label:"In trade — manage your stops",                          color:"#ff6bff", dot:false},
          INVALIDATED:{label:"Setup invalidated — no trade taken",                   color:"#ff6b6b", dot:false},
          COMPLETE:  {label:"Session complete",                                       color:"#7fff6b", dot:false},
        };
        const cfg=stateConfig[tradeState]||{
          label: tradeState==="ARMED_T2"?"Waiting for retest"
               : tradeState==="EXECUTABLE"?"Ready to execute"
               : isDev?"Waiting for break confirmation"
               :"Analyzing...",
          color:"#ffd166",dot:true};

        // Override if execution window closed
        const activeCfg = windowClosed&&["PRECHECK","ARMED_T1","ARMED_T2"].includes(tradeState)
          ? {label:"Execution window closed — wait for next session", color:"#ff6b6b", dot:false}
          : cfg;

        return(
          <div style={{display:"flex",alignItems:"center",gap:8,
            padding:"9px 16px",marginBottom:16,
            background:"rgba(255,255,255,0.03)",
            border:`1px solid ${activeCfg.color}28`,
            borderLeft:`3px solid ${activeCfg.color}`,
            borderRadius:8}}>
            {activeCfg.dot&&<span style={{width:7,height:7,borderRadius:"50%",flexShrink:0,background:activeCfg.color,animation:"icc-pulse 1.5s ease infinite"}}/>}
            <span style={{fontSize:14,fontWeight:700,color:activeCfg.color,letterSpacing:"0.02em"}}>
              <span style={{color:"var(--t-muted4)",fontWeight:500,marginRight:6}}>Current state:</span>
              {activeCfg.label}
            </span>
          </div>
        );
      })()}
      {isSkip?(
        /* ── PASS / SCOUT STATE ── */
        <div style={{background:"rgba(255,107,107,0.04)",border:"1px solid rgba(255,107,107,0.15)",borderRadius:16,padding:"20px 24px",marginBottom:12}}>

          {/* ── SECTION 1: WHY IT'S A PASS ── */}
          <div style={{marginBottom:18}}>
            <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.18em",color:"#ff6b6b",marginBottom:10}}>WHY THIS IS A PASS</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {[
                pd.confidence_reason||"No valid BRC sequence has formed during the NY execution window.",
                "Timeframe alignment alone is not a trade signal — all three phases (Break · Retest · Continuation) must complete.",
              ].map((text,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:14,color:"#ff6b6b",flexShrink:0,marginTop:2,fontWeight:900}}>—</span>
                  <span style={{fontSize:14,color:"var(--t-muted2)",fontWeight:500,lineHeight:1.6}}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"rgba(255,255,255,0.06)",marginBottom:18}}/>

          {/* ── SECTION 2: WHAT TO DO NOW ── */}
          <div style={{marginBottom:18}}>
            <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.18em",color:"var(--t-muted4)",marginBottom:10}}>WHAT TO DO NOW</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {[
                "Stay flat. Do not enter in either direction.",
                "Keep your charts open. Do not close the session.",
                "Watch the live chart below for a fresh break forming.",
              ].map((text,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:14,color:"#7fff6b",flexShrink:0,marginTop:2,fontWeight:900}}>·</span>
                  <span style={{fontSize:14,color:"var(--t-muted2)",fontWeight:500,lineHeight:1.6}}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"rgba(255,255,255,0.06)",marginBottom:18}}/>

          {/* ── SECTION 3: WHAT TO WATCH NEXT ── */}
          <div style={{marginBottom:18}}>
            <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.18em",color:"var(--t-muted4)",marginBottom:10}}>WHAT TO WATCH NEXT</div>
            {/* Key levels */}
            {(cl.long_trigger||cl.short_trigger||cl.major_support||cl.major_resistance)&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:7,marginBottom:12}}>
                {[
                  {label:"Long Trigger",  val:cl.long_trigger,  color:"#7fff6b"},
                  {label:"Short Trigger", val:cl.short_trigger, color:"#ff6b6b"},
                  {label:"Support",       val:cl.major_support, color:"#00e5ff"},
                  {label:"Resistance",    val:cl.major_resistance,color:"#ffd166"},
                ].filter(r=>r.val&&r.val!=="—").map(row=>(
                  <div key={row.label} style={{padding:"8px 11px",background:"rgba(255,255,255,0.03)",border:`1px solid ${row.color}18`,borderRadius:7}}>
                    <div style={{fontSize:13,color:"var(--t-muted4)",fontWeight:700,letterSpacing:"0.08em",marginBottom:4}}>{row.label.toUpperCase()}</div>
                    <CopyPrice val={row.val} color={row.color}/>
                  </div>
                ))}
              </div>
            )}
            {/* Alt scenario */}
            {hasAlt&&(
              <div style={{padding:"10px 14px",background:"rgba(255,209,102,0.05)",border:"1px solid rgba(255,209,102,0.2)",borderRadius:8,marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.14em",color:"#ffd166",marginBottom:4}}>ALTERNATE SETUP ACTIVATES ONLY IF:</div>
                <span style={{fontSize:14,color:"var(--t-muted2)",fontWeight:500,lineHeight:1.6}}>{altCondition}</span>
              </div>
            )}
            {tc.risk_state&&(
              <div style={{padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7}}>
                <span style={{fontSize:14,color:"var(--t-muted3)",fontWeight:500}}>{tc.risk_state}</span>
              </div>
            )}
          </div>

          {/* Live chart */}
          <div style={{display:"flex",alignItems:"center",gap:10,
            padding:"8px 12px",background:"rgba(255,255,255,0.03)",
            border:"1px solid rgba(255,255,255,0.06)",borderRadius:7}}>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:13,color:"var(--t-muted3)",fontWeight:600}}>Live chart</span>
              <span style={{fontSize:13,color:"var(--t-muted4)",background:"rgba(255,255,255,0.05)",padding:"2px 6px",borderRadius:3}}>{tvSym}</span>
              <span style={{fontSize:13,color:"var(--t-muted4)",background:"rgba(255,255,255,0.05)",padding:"2px 6px",borderRadius:3}}>30M</span>
            </div>
            <a href={`https://www.tradingview.com/chart/?symbol=${tvSym}&interval=30`} target="_blank" rel="noopener noreferrer"
              style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,padding:"5px 12px",fontFamily:"inherit",fontSize:13,fontWeight:600,color:"var(--t-muted3)",textDecoration:"none",whiteSpace:"nowrap"}}>
              Open Chart →
            </a>
          </div>
          <button onClick={onReset} style={{...S.resetBtn}}>← Upload new charts</button>
        </div>
      ):(isActive||isDev)&&(
        /* ── 3-PHASE EXECUTION TRACKER ── */
        <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,107,255,0.28)",borderRadius:16,padding:"18px 20px",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <span style={S.sectionTag}>EXECUTION TRACKER</span>
            <span style={{fontSize:14,color:"var(--t-muted3)",fontWeight:500}}>Follow each phase in order. Do not skip ahead.</span>
          </div>

          {/* derive the correct trigger level from bias */}
          {(()=>{
            const isShort      = bias==="SHORT"; // already at component level — redundant but harmless

            // Use explicit structured fields first, fall back to critical_levels
            // triggerLevel, retestZone, stopLevel defined at component level
            const formatConfirmRule=(raw)=>{
              if(!raw)return null;
              return raw
                .replace(/^30M candle must close\s+(back\s+)?(above|below)\s+/i,(m,_,dir)=>`30M candle must close back ${dir} `)
                .replace(/\s+after retest to\s+/gi," after retesting ")
                .replace(/\s+after retesting to\s+/gi," after retesting ")
                .replace(/\s+zone\s*$/i,".")
                .replace(/\s+to confirm the hold\.?$/i,".")
                .replace(/\s+to confirm\s*/i,".")
                .replace(/\.+$/,".")
                .trim();
            };
            const confirmRuleFallback = isShort
              ? `30M close back below ${triggerLevel} confirms resistance holds.`
              : `30M close back above ${triggerLevel} confirms support holds.`;
            const confirmRule  = formatConfirmRule(ep.retest_confirmation_rule) || confirmRuleFallback;
            const sessionNote  = ep.session_restriction || null;

            return(<>

          {/* ── PHASE-AWARE RENDERING ── */}

          {/* PHASE 1 — collapsed if done, full if active */}
          {tradeState==="ARMED_T1"?(
            /* ACTIVE */
            <div style={{marginBottom:10}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,marginTop:1,
                  background:"rgba(0,229,255,0.15)",border:"2px solid #00e5ff",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:13,fontWeight:900,color:"#00e5ff"}}>1</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:900,letterSpacing:"0.08em",marginBottom:4,color:"#00e5ff"}}>
                    PHASE 1 — BREAK <span style={{marginLeft:8,fontSize:13,animation:"icc-pulse 1.5s ease infinite"}}>● WATCHING</span>
                  </div>
                  <div style={{fontSize:14,color:"var(--t-muted)",fontWeight:500,marginBottom:6}}>
                    Wait for 30M candle to fully close <strong>{dirWord}</strong> <strong style={{color:"#00e5ff"}}>{triggerLevel}</strong>
                  </div>
                  <div style={{padding:"10px 14px",background:"rgba(0,229,255,0.06)",border:"1px solid rgba(0,229,255,0.15)",borderLeft:"3px solid #00e5ff",borderRadius:8,marginBottom:10}}>
                    <span style={{fontSize:14,color:"#00e5ff",fontWeight:700}}>⚠ Do NOT enter yet. The break is step 1 of 3.</span>
                    {sctx?.p1_note&&(
                      session==="ASIAN"?(
                        <div style={{marginTop:8,padding:"7px 10px",background:"rgba(255,154,60,0.1)",border:"1px solid rgba(255,154,60,0.35)",borderLeft:"3px solid #ff9a3c",borderRadius:6}}>
                          <span style={{fontSize:14,color:"#ff9a3c",fontWeight:700}}>⚠ {sctx.p1_note}</span>
                        </div>
                      ):(
                        <p style={{fontSize:14,color:"var(--t-muted2)",margin:"5px 0 0",lineHeight:1.5,fontWeight:500}}>{sctx.p1_note}</p>
                      )
                    )}
                  </div>
                  {(session==="NY"||session==="LONDON_NY")&&(()=>{
                    // Get current Chicago time
                    const nowCT = new Date(new Date().toLocaleString("en-US",{timeZone:"America/Chicago"}));
                    const nowH = nowCT.getHours();
                    const nowM = nowCT.getMinutes();
                    const nowMins = nowH*60+nowM; // minutes since midnight CT

                    // Window definitions — time in CT minutes since midnight
                    const windows=[
                      {time:"9:00 AM CT",  mins:9*60,   label:"First valid close — watch for break",    isCutoff:false},
                      {time:"9:30 AM CT",  mins:9*60+30, label:"Second window — most reliable",          isCutoff:false},
                      {time:"10:00 AM CT", mins:10*60,  label:"Last high-quality window",               isCutoff:false},
                      {time:"10:30 AM CT", mins:10*60+30,label:"Cutoff — setup dead after this",         isCutoff:true},
                    ];

                    // Find next upcoming window (within next 30 min)
                    const nextIdx = windows.findIndex(w=>w.mins > nowMins);
                    const allPast = nextIdx === -1;
                    const executionClosed = nowMins > 10*60+30;

                    return(
                    <div style={{padding:"8px 12px",background:"rgba(255,209,102,0.05)",border:"1px solid rgba(255,209,102,0.2)",borderLeft:"3px solid #ffd166",borderRadius:8,marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                        <p style={{fontSize:13,fontWeight:900,color:"#ffd166",margin:0,letterSpacing:"0.1em"}}>30M CANDLE CLOSE WINDOWS</p>
                        {executionClosed
                          ? <span style={{fontSize:13,fontWeight:900,color:"#ff6b6b",background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",padding:"2px 8px",borderRadius:4,letterSpacing:"0.08em"}}>WINDOW CLOSED</span>
                          : <span style={{fontSize:13,fontWeight:700,color:"#00e5ff",fontFamily:"monospace"}}>{nowCT.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",timeZone:"America/Chicago"})} CT</span>
                        }
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {windows.map((r,i)=>{
                          const isPast = r.mins < nowMins;
                          const isNext = i === nextIdx;
                          const isLast = i === windows.length-1;
                          return(
                            <div key={r.time} style={{display:"flex",gap:10,alignItems:"center",
                              padding:"4px 8px",borderRadius:5,
                              background:isNext?"rgba(0,229,255,0.06)":isPast?"transparent":"transparent",
                              border:isNext?"1px solid rgba(0,229,255,0.2)":"1px solid transparent",
                              opacity:isPast?0.62:1,
                              transition:"all 0.2s"}}>
                              <span style={{fontSize:13,fontFamily:"monospace",fontWeight:900,
                                minWidth:84,flexShrink:0,
                                color:isPast?"var(--t-muted4)":isNext?"#00e5ff":isLast?"#ff8080":"#ffd166"}}>
                                {r.time}
                              </span>
                              <span style={{fontSize:13,fontWeight:isNext?700:400,
                                color:isPast?"var(--t-muted4)":isNext?"#00e5ff":isLast?"#ff8080":"var(--t-muted2)",
                                flex:1}}>
                                {isPast?"completed":r.label}
                              </span>
                              {isPast&&<span style={{fontSize:13,color:"var(--t-muted4)"}}>✓</span>}
                              {isNext&&!executionClosed&&<span style={{fontSize:13,fontWeight:900,color:"#00e5ff",letterSpacing:"0.06em",flexShrink:0}}>NEXT</span>}
                              {isLast&&isNext&&<span style={{fontSize:13,fontWeight:900,color:"#ff8080",letterSpacing:"0.06em",flexShrink:0}}>FINAL</span>}
                            </div>
                          );
                        })}
                      </div>
                      {executionClosed&&(
                        <div style={{marginTop:8,padding:"5px 8px",background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.2)",borderRadius:5}}>
                          <span style={{fontSize:13,color:"#ff8080",fontWeight:700}}>Execution window closed at 10:30 AM CT. No new entries. Wait for tomorrow's session.</span>
                        </div>
                      )}
                    </div>
                    );
                  })()}
                  {session==="ASIAN"&&(
                    <div style={{padding:"8px 12px",background:"rgba(255,154,60,0.05)",border:"1px solid rgba(255,154,60,0.2)",borderLeft:"3px solid #ff9a3c",borderRadius:8,marginBottom:10}}>
                      <p style={{fontSize:13,fontWeight:900,color:"#ff9a3c",margin:"0 0 6px",letterSpacing:"0.1em"}}>ASIAN SESSION CANDLE WINDOWS</p>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {[{time:"7:00 PM CT",label:"Session open — first watch"},{time:"8:00 PM CT",label:"First valid 30M close"},{time:"9:00 PM CT",label:"Best quality window"},{time:"11:00 PM CT",label:"Cutoff — session closes"}].map(r=>(
                          <div key={r.time} style={{display:"flex",gap:10,alignItems:"baseline"}}>
                            <span style={{fontSize:13,fontFamily:"monospace",fontWeight:900,color:"#ff9a3c",minWidth:90,flexShrink:0}}>{r.time}</span>
                            <span style={{fontSize:13,color:"var(--t-muted2)",fontWeight:400}}>{r.label}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:8,padding:"5px 8px",background:"rgba(255,154,60,0.08)",border:"1px solid rgba(255,154,60,0.2)",borderRadius:5}}>
                        <span style={{fontSize:13,color:"#ff9a3c",fontWeight:700}}>⚠ Asian session = reduced size. Half position recommended.</span>
                      </div>
                    </div>
                  )}
                  {session==="LONDON"&&(
                    <div style={{padding:"8px 12px",background:"rgba(255,107,255,0.05)",border:"1px solid rgba(255,107,255,0.2)",borderLeft:"3px solid #ff6bff",borderRadius:8,marginBottom:10}}>
                      <p style={{fontSize:13,fontWeight:900,color:"#ff6bff",margin:"0 0 6px",letterSpacing:"0.1em"}}>LONDON SESSION CANDLE WINDOWS</p>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {[{time:"2:00 AM CT",label:"Session open — first watch"},{time:"3:00 AM CT",label:"First valid 30M close"},{time:"4:00 AM CT",label:"Best quality window"},{time:"5:00 AM CT",label:"Cutoff — session closes"}].map(r=>(
                          <div key={r.time} style={{display:"flex",gap:10,alignItems:"baseline"}}>
                            <span style={{fontSize:13,fontFamily:"monospace",fontWeight:900,color:"#ff6bff",minWidth:90,flexShrink:0}}>{r.time}</span>
                            <span style={{fontSize:13,color:"var(--t-muted2)",fontWeight:400}}>{r.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{marginLeft:34,display:"flex",flexDirection:"column",gap:8}}>
                {/* Live chart */}
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:7}}>
                  <div style={{flex:1,display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:13,color:"#7fff6b",fontWeight:700}}>Live chart</span>
                    <span style={{fontSize:13,color:"#7fff6b",background:"rgba(127,255,107,0.1)",border:"1px solid rgba(127,255,107,0.25)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>{tvSym}</span>
                    <span style={{fontSize:13,color:"#7fff6b",background:"rgba(127,255,107,0.1)",border:"1px solid rgba(127,255,107,0.25)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>30M</span>
                  </div>
                  <a href={`https://www.tradingview.com/chart/?symbol=${tvSym}&interval=30`} target="_blank" rel="noopener noreferrer"
                    style={{background:"none",border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,padding:"5px 12px",fontFamily:"inherit",fontSize:13,fontWeight:700,color:"var(--t-muted3)",letterSpacing:"0.06em",textDecoration:"none",whiteSpace:"nowrap"}}>
                    Open Live Chart →
                  </a>
                </div>
                {/* Alert box — collapsible */}
                <div style={{border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,overflow:"hidden"}}>
                  <button onClick={()=>setShowAlerts(o=>!o)}
                    style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
                      background:"rgba(255,255,255,0.03)",padding:"7px 12px",
                      cursor:"pointer",fontFamily:"inherit",border:"none"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7}}>
                      <span style={{fontSize:14}}>📲</span>
                      <span style={{fontSize:14,fontWeight:800,color:"var(--t-muted2)",letterSpacing:"0.04em"}}>Set Alerts Now</span>
                      <span style={{fontSize:13,color:"var(--t-muted3)",fontWeight:500}}>(3 recommended)</span>
                    </div>
                    <span style={{fontSize:13,color:"var(--t-muted3)",transform:showAlerts?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block"}}>▼</span>
                  </button>
                  {showAlerts&&(
                    <div style={{padding:"10px 14px",background:"rgba(255,107,255,0.03)",animation:"icc-slide 0.2s ease both"}}>
                      <p style={{fontSize:13,color:"var(--t-muted4)",margin:"0 0 8px",fontWeight:500}}>Add to TradingView before the session opens.</p>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {[
                          {label:"Break Alert",  val:`${isShort?"Price crosses below":"Price crosses above"} ${triggerLevel}`,color:"#00e5ff"},
                          {label:"Retest Zone",  val:`Price enters ${retestZone}`,color:"#ffd166"},
                          {label:"Invalidation", val:result.invalidation||"Check invalidation level",color:"#ff6b6b"},
                        ].map(a=>(
                          <div key={a.label} style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${a.color}22`,borderRadius:6,padding:"7px 10px"}}>
                            <div style={{fontSize:13,fontWeight:900,color:a.color,letterSpacing:"0.08em",marginBottom:2}}>{a.label.toUpperCase()}</div>
                            <div style={{fontSize:14,color:"var(--t-muted)",fontWeight:600,lineHeight:1.4}}>{a.val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Checkboxes */}
                <div style={{background:"rgba(0,229,255,0.04)",border:"1px solid rgba(0,229,255,0.13)",borderRadius:8,padding:"11px 14px",display:"flex",flexDirection:"column",gap:8}}>
                  <p style={{fontSize:13,fontWeight:900,letterSpacing:"0.12em",color:"#00e5ff",margin:0}}>CONFIRM BEFORE ADVANCING</p>
                  {[
                    {key:"closed",label:"30M candle fully CLOSED — not a wick"},
                    {key:"level", label:`Close confirmed ${dirWord} ${triggerLevel}`},
                    {key:"open",  label:"Looking at a CLOSED candle — not a live one"},
                  ].map(item=>(
                    <div key={item.key} onClick={()=>setChecks(p=>({...p,[item.key]:!p[item.key]}))}
                      style={{display:"flex",alignItems:"flex-start",gap:9,cursor:"pointer"}}>
                      <div style={{width:16,height:16,borderRadius:3,flexShrink:0,marginTop:1,
                        border:`2px solid ${checks[item.key]?"#00e5ff":"rgba(255,255,255,0.80)"}`,
                        background:checks[item.key]?"rgba(0,229,255,0.15)":"transparent",
                        display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                        {checks[item.key]&&<span style={{fontSize:13,color:"#00e5ff",fontWeight:900}}>✓</span>}
                      </div>
                      <span style={{fontSize:14,color:checks[item.key]?"var(--t-muted)":"var(--t-muted3)",fontWeight:checks[item.key]?600:400,lineHeight:1.4,transition:"color 0.15s"}}>{item.label}</span>
                    </div>
                  ))}
                </div>
                {/* Helper text */}
                <p style={{fontSize:14,color:"var(--t-muted4)",margin:"0 0 10px",lineHeight:1.6,fontWeight:500,fontStyle:"italic"}}>
                  Waiting for price to return to the broken level before Phase 2 unlocks.
                </p>
                <button onClick={()=>{if(allChecked){advanceTo("ARMED_T2");setT1Time(Date.now());}}} disabled={!allChecked}
                  style={{alignSelf:"flex-start",
                    background:allChecked?"rgba(0,229,255,0.1)":"rgba(255,255,255,0.03)",
                    border:`1px solid ${allChecked?"rgba(0,229,255,0.35)":"rgba(255,255,255,0.08)"}`,
                    borderRadius:8,padding:"8px 18px",cursor:allChecked?"pointer":"not-allowed",fontFamily:"inherit",
                    fontSize:14,fontWeight:900,color:allChecked?"#00e5ff":"var(--t-muted4)",letterSpacing:"0.08em",transition:"all 0.2s"}}>
                  {allChecked?"✓ 30M CLOSE CONFIRMED — PHASE 1 COMPLETE":"Waiting for all 3 confirmations"}
                </button>
              </div>
            </div>
          ):(
            /* COLLAPSED — phase complete */
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",marginBottom:6,opacity:0.7}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:"rgba(127,255,107,0.15)",border:"2px solid #7fff6b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#7fff6b",flexShrink:0}}>✓</div>
              <span style={{fontSize:14,fontWeight:700,color:"#7fff6b"}}>Phase 1 — Break confirmed {dirWord} {triggerLevel}</span>
            </div>
          )}

          {tradeState!=="ARMED_T1"&&<div style={{width:2,height:10,background:"rgba(255,255,255,0.15)",marginLeft:9,marginBottom:8}}/>}

          {/* PHASE 2 — hidden until P1 done, collapsed if P2 done */}
          {tradeState==="ARMED_T1"?null:tradeState==="ARMED_T2"?(
            /* ACTIVE */
            <div style={{marginBottom:10,animation:"icc-slide 0.25s ease both"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,marginTop:1,
                  background:"rgba(255,209,102,0.15)",border:"2px solid #ffd166",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:13,fontWeight:900,color:"#ffd166"}}>2</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:900,letterSpacing:"0.08em",marginBottom:4,color:"#ffd166"}}>
                    PHASE 2 — RETEST <span style={{marginLeft:8,fontSize:13,color:"#ffd166",animation:"icc-pulse 1.5s ease infinite"}}>● WATCHING</span>
                  </div>
                  <div style={{display:"inline-flex",alignItems:"flex-start",gap:12,padding:"10px 14px",marginBottom:8,background:"rgba(255,209,102,0.08)",border:"1px solid rgba(255,209,102,0.3)",borderRadius:8,width:"100%",boxSizing:"border-box"}}>
                    <div style={{flexShrink:0}}>
                      <div style={{fontSize:13,fontWeight:900,color:"#ffd166",letterSpacing:"0.12em",marginBottom:2}}>{isShort?"RETEST RESISTANCE ZONE":"RETEST SUPPORT ZONE"}</div>
                      <div style={{fontSize:20,fontWeight:900,color:"#ffd166",lineHeight:1}}>{retestZone}</div>
                    </div>
                    <div style={{width:1,alignSelf:"stretch",background:"rgba(255,209,102,0.2)",flexShrink:0}}/>
                    <div style={{fontSize:14,color:"var(--t-muted3)",fontWeight:500,lineHeight:1.55}}>
                      {isShort?`Enter only after a 30M candle closes back below ${triggerLevel}.`:`Enter only after a 30M candle closes back above ${triggerLevel}.`}
                    </div>
                  </div>
                  <div style={{fontSize:14,color:"var(--t-muted)",fontWeight:500,marginBottom:6,lineHeight:1.6}}>
                    Wait for price to retest the <strong style={{color:"#ffd166"}}>{retestZone}</strong> {zoneType} zone after confirmed break {dirWord} <strong style={{color:"#00e5ff"}}>{triggerLevel}</strong>.
                  </div>
                  <div style={{fontSize:14,color:"var(--t-muted3)",fontWeight:500,marginBottom:6,lineHeight:1.55}}>
                    Valid retest: price tests <strong style={{color:"#ffd166"}}>{retestZone}</strong> and the 30M candle closes back {dirWordBack} the zone. A wick alone does not qualify.
                  </div>
                  {confirmRule&&<div style={{fontSize:14,color:"#00e5ff",fontWeight:600,marginBottom:6,padding:"6px 10px",background:"rgba(0,229,255,0.05)",border:"1px solid rgba(0,229,255,0.12)",borderRadius:6}}>{confirmRule}</div>}
                  {sessionNote&&(
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 12px",marginBottom:8,background:"rgba(255,209,102,0.05)",border:"1px solid rgba(255,209,102,0.15)",borderLeft:"3px solid rgba(255,209,102,0.5)",borderRadius:6}}>
                      <span style={{fontSize:14,flexShrink:0,marginTop:1}}>⏱</span>
                      <div>
                        <div style={{fontSize:13,fontWeight:900,color:"#ffd166",letterSpacing:"0.12em",marginBottom:3}}>VALID DURING SESSION</div>
                        <div style={{fontSize:14,color:"var(--t-muted2)",fontWeight:600,lineHeight:1.45,marginBottom:3}}>{sessionNote}</div>
                        <div style={{fontSize:13,color:"var(--t-muted4)",fontWeight:400,lineHeight:1.4}}>Confirmation quality and follow-through are strongest in this window. Do not execute outside it.</div>
                      </div>
                    </div>
                  )}
                  {sctx?.p2_note&&<div style={{fontSize:14,color:"var(--t-muted4)",marginBottom:6,lineHeight:1.5,fontStyle:"italic"}}>{sctx.p2_note}</div>}
                  {t1Time&&<div style={{fontSize:14,color:"var(--t-muted4)",marginBottom:8}}>Time since Phase 1: <strong style={{color:"#00e5ff"}}>{elapsed(t1Time)}</strong></div>}
                  {/* Live chart P2 */}
                  {(()=>{
                    const st={ARMED_T2:{msg:`Watching retest of ${retestZone} ${zoneType}`,color:"#ffd166"}};
                    const s=st.ARMED_T2;
                    return(
                      <div style={{marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                          <span style={{width:6,height:6,borderRadius:"50%",flexShrink:0,background:s.color,opacity:0.8,animation:"icc-pulse 1.5s ease infinite"}}/>
                          <span style={{fontSize:14,fontWeight:600,color:s.color,opacity:0.85}}>{s.msg}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:7}}>
                          <div style={{flex:1,display:"flex",alignItems:"center",gap:7}}>
                            <span style={{fontSize:13,color:"#7fff6b",fontWeight:700}}>Live chart</span>
                            <span style={{fontSize:13,color:"#7fff6b",background:"rgba(127,255,107,0.1)",border:"1px solid rgba(127,255,107,0.25)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>{tvSym}</span>
                            <span style={{fontSize:13,color:"#7fff6b",background:"rgba(127,255,107,0.1)",border:"1px solid rgba(127,255,107,0.25)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>{tvInterval}M</span>
                          </div>
                          <a href={tvUrl} target="_blank" rel="noopener noreferrer"
                            style={{background:"none",border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,padding:"5px 12px",fontFamily:"inherit",fontSize:13,fontWeight:700,color:"var(--t-muted3)",letterSpacing:"0.06em",textDecoration:"none",whiteSpace:"nowrap"}}>
                            Open Live Chart →
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div style={{marginLeft:34,display:"flex",gap:8}}>
                <button onClick={()=>advanceTo("EXECUTABLE")}
                  style={{background:"rgba(255,209,102,0.1)",border:"1px solid rgba(255,209,102,0.35)",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:900,color:"#ffd166",letterSpacing:"0.08em"}}>
                  ✓ RETEST CONFIRMED
                </button>
                <button onClick={()=>advanceTo("INVALIDATED")}
                  style={{background:"none",border:"1px solid rgba(255,107,107,0.25)",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700,color:"#ff8080"}}>
                  ✕ SETUP INVALIDATED
                </button>
              </div>
            </div>
          ):(["EXECUTABLE","IN_TRADE","COMPLETE","INVALIDATED"].includes(tradeState))?(
            /* COLLAPSED */
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",marginBottom:6,opacity:0.7}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:"rgba(127,255,107,0.15)",border:"2px solid #7fff6b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:"#7fff6b",flexShrink:0}}>✓</div>
              <span style={{fontSize:14,fontWeight:700,color:"#7fff6b"}}>Phase 2 — Retest confirmed at {retestZone}</span>
            </div>
          ):null}

          {["EXECUTABLE","IN_TRADE","COMPLETE","INVALIDATED"].includes(tradeState)&&<div style={{width:2,height:10,background:"rgba(255,255,255,0.15)",marginLeft:9,marginBottom:8}}/>}

          {/* PHASE 3 — hidden until P2 done */}
          {["EXECUTABLE","IN_TRADE","COMPLETE","INVALIDATED"].includes(tradeState)?(
            <div style={{animation:"icc-slide 0.25s ease both"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                <div style={{width:24,height:24,borderRadius:"50%",flexShrink:0,marginTop:1,
                  background:tradeState==="EXECUTABLE"?"rgba(127,255,107,0.2)":["IN_TRADE","COMPLETE"].includes(tradeState)?"rgba(127,255,107,0.15)":"rgba(255,255,255,0.04)",
                  border:`2px solid ${tradeState==="EXECUTABLE"?"#7fff6b":["IN_TRADE","COMPLETE"].includes(tradeState)?"#7fff6b":"rgba(255,255,255,0.12)"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,
                  color:tradeState==="EXECUTABLE"?"#7fff6b":["IN_TRADE","COMPLETE"].includes(tradeState)?"#7fff6b":"var(--t-muted4)"}}>
                  {["IN_TRADE","COMPLETE"].includes(tradeState)?"✓":"3"}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:900,letterSpacing:"0.08em",marginBottom:4,
                    color:tradeState==="EXECUTABLE"?"#7fff6b":["IN_TRADE","COMPLETE"].includes(tradeState)?"#7fff6b":"var(--t-muted4)"}}>
                    PHASE 3 — CONFIRM &amp; EXECUTE
                    {tradeState==="EXECUTABLE"&&<span style={{marginLeft:8,fontSize:13,color:"#7fff6b",animation:"icc-pulse 1.2s ease infinite"}}>● READY NOW</span>}
                  </div>
                  {tradeState==="EXECUTABLE"?(
                    <>
                      <div style={{fontSize:14,color:"var(--t-muted)",fontWeight:500,marginBottom:10}}>
                        Second 30M rejection close confirmed. <strong style={{color:"#7fff6b"}}>Place your limit order now.</strong>
                        {sctx?.p3_note&&<span style={{display:"block",fontSize:14,color:"var(--t-muted2)",marginTop:4,lineHeight:1.5,fontWeight:500}}>{sctx.p3_note}</span>}
                      </div>
                      {sctx?.p3_warn&&(
                        <div style={{padding:"7px 11px",background:"rgba(255,154,60,0.07)",border:"1px solid rgba(255,154,60,0.25)",borderLeft:"3px solid #ff9a3c",borderRadius:6,marginBottom:10}}>
                          <span style={{fontSize:14,color:"#ff9a3c",fontWeight:700}}>{sctx.p3_warn}</span>
                        </div>
                      )}
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:7,marginBottom:10}}>
                        {(()=>{
                          const stripFn2=(v)=>{if(!v||v==="—")return v||"—";const m=v.match(/^([0-9,.\s–\-]+(?:\s*[–\-]\s*[0-9,.]+)?)/);return m?m[1].trim():v;};
                          const cleanSub=(s)=>s.replace(/zone on retest confirmation/gi,"Valid after retest confirmation").replace(/on retest confirmation/gi,"Valid after retest confirmation").replace(/after retest and confirmation/gi,"Valid after retest confirmation").replace(/enter on retest/gi,"Enter at retest zone").replace(/on pullback confirmation/gi,"Valid after pullback").replace(/zone retest,?\s*/gi,"").replace(/structure cooking but not ready/gi,"Structure is improving but not confirmed yet.").replace(/setup cooking/gi,"Setup developing").replace(/cooking/gi,"developing").trim();
                          const parseVal=(raw,fallbackSub)=>{if(!raw||raw==="—")return{price:raw,sub:fallbackSub};const m=raw.match(/^([0-9,.\s–\-]+(?:\s*[–\-]\s*[0-9,.]+)?)/);const price=m?m[1].trim():raw;const rest=m?cleanSub(raw.slice(price.length).replace(/^[\s,.\-–;:()]+/,"").replace(/\)$/,"").trim()):"";return{price,sub:rest||fallbackSub};};
                          const entryRaw=ep.entry||"";const priceMatch=entryRaw.match(/^([0-9,.\s–\-]+(?:\s*[–\-]\s*[0-9,.]+)?)/);const entryPrice=priceMatch?priceMatch[1].trim():entryRaw;const entryRest=priceMatch?cleanSub(entryRaw.slice(entryPrice.length).replace(/^[\s,.\-–;:]+/,"").trim()):"";
                          const ent=parseVal(entryPrice,"Set limit here");const stp=parseVal(stripFn2(ep.stop_tight||ep.stop_wide||"—"),"Exit if hit");const t1=parseVal(ep.tp1,"First target");const t2=parseVal(ep.tp2,"Next structure target");const run=parseVal(ep.runner,"Extended support target");
                          const rawSize=ep.size||"";const sizeIsFullOrUnset=!rawSize||/full/i.test(rawSize)||/standard/i.test(rawSize);
                          const sz=sctx?.p3_warn?{price:sizeIsFullOrUnset?"HALF SIZE":rawSize,sub:"Reduced — low volume session"}:parseVal(rawSize,"Position size");
                          return[
                            {label:"Retest Zone",price:ent.price,sub:entryRest||ent.sub,color:"#7fff6b"},
                            {label:"Hard Stop",price:stp.price,sub:"Place this order with your broker",color:"#ff6b6b"},
                            {label:"TP1",price:t1.price,sub:t1.sub,color:"#7fff6b"},
                            {label:"TP2",price:t2.price,sub:t2.sub,color:"#7fff6b"},
                            {label:"Runner",price:run.price,sub:run.sub||"Extended support target",color:"#ffd166"},
                            {label:"Size",price:sz.price,sub:sz.sub,color:"#00e5ff"},
                          ].filter(r=>r.price&&r.price!=="—").map(row=>(
                            <div key={row.label} style={{padding:"9px 11px",background:"rgba(127,255,107,0.05)",border:`1px solid ${row.color}22`,borderRadius:7}}>
                              <CopyPrice val={row.price} color={row.color}/>
                              <div style={{fontSize:13,fontWeight:700,color:"var(--t-muted3)",marginTop:4,letterSpacing:"0.04em"}}>{row.label}</div>
                              {row.sub&&<div style={{fontSize:13,color:"var(--t-muted4)",marginTop:2,fontWeight:400,lineHeight:1.4}}>{row.sub}</div>}
                            </div>
                          ));
                        })()}
                      </div>
                      {result.invalidation&&(
                        <div style={{padding:"8px 12px",background:"rgba(255,107,107,0.05)",border:"1px solid rgba(255,107,107,0.18)",borderLeft:"3px solid #ff9a3c",borderRadius:6,marginBottom:10}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:13,fontWeight:900,color:"#ff9a3c",letterSpacing:"0.1em",flexShrink:0}}>STRUCTURAL INVALIDATION</span>
                            <span style={{fontSize:14,color:"var(--t-muted2)",fontWeight:600}}>{result.invalidation}</span>
                          </div>
                          <div style={{fontSize:13,color:"var(--t-muted4)",marginTop:4,fontWeight:500}}>If this occurs, the setup is dead — exit or cancel your order immediately.</div>
                        </div>
                      )}
                      <div style={{display:"flex",gap:8}}>
                        <button onClick={()=>{
                            advanceTo("IN_TRADE");
                            if(onJournalEntry) onJournalEntry({
                              date: new Date().toISOString(),
                              instrument,
                              direction: ep.direction||pd.bias||"—",
                              grade: pd.grade||"—",
                              entry: ep.entry||"—",
                              stop: ep.stop_tight||ep.stop_wide||"—",
                              tp1: ep.tp1||"—",
                              session: profile?.session||"—",
                              bias: pd.bias||"—",
                            });
                          }}
                          style={{...S.generateBtn,alignSelf:"flex-start",padding:"9px 20px",fontSize:14,
                            background:"rgba(127,255,107,0.12)",border:"1px solid rgba(127,255,107,0.35)",
                            color:"#7fff6b",letterSpacing:"0.08em",boxShadow:"none"}}>
                          📈 LIMIT ORDER ACTIVE
                        </button>
                        <button onClick={()=>advanceTo("INVALIDATED")}
                          style={{background:"none",border:"1px solid rgba(255,107,107,0.3)",borderRadius:10,padding:"9px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700,color:"#ff8080"}}>
                          ✕ MARK AS MISSED
                        </button>
                      </div>
                    </>
                  ):(["IN_TRADE","COMPLETE","INVALIDATED"].includes(tradeState))?(
                    <div style={{marginTop:4}}>
                      <p style={{fontSize:14,color:tradeState==="COMPLETE"?"#7fff6b":tradeState==="INVALIDATED"?"#ff6b6b":"#ff6bff",margin:"0 0 10px",fontWeight:700}}>
                        {tradeState==="IN_TRADE"?"📈 Trade is live — manage your stops":tradeState==="COMPLETE"?"✓ Session complete":"🚫 Setup invalidated — no trade taken"}
                      </p>
                      {tradeState==="IN_TRADE"&&(
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>advanceTo("COMPLETE")} style={{...S.generateBtn,alignSelf:"flex-start",padding:"10px 20px",fontSize:14,background:"linear-gradient(135deg,#7fff6b,#00c46b)",color:"#1e1a35"}}>✓ TRADE CLOSED</button>
                          <button onClick={()=>advanceTo("INVALIDATED")} style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",color:"#ff8080",padding:"10px 14px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:900}}>🚫 Stopped out</button>
                        </div>
                      )}
                      {(tradeState==="COMPLETE"||tradeState==="INVALIDATED")&&(
                        <button onClick={onReset} style={{...S.resetBtn}}>← New Analysis</button>
                      )}
                    </div>
                  ):null}
                </div>
              </div>
            </div>
          ):null}

            </>);
          })()}
        </div>
      )}





      {/* Plain English Breakdown */}
      {(pe.structure||pe.verdict)&&(
        <div style={{marginBottom:16}}>
          <button onClick={()=>setShowPE(o=>!o)}
            style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
              background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:showPE?"8px 8px 0 0":8,padding:"9px 14px",cursor:"pointer",
              fontFamily:"inherit",transition:"all 0.2s"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14,fontWeight:700,color:"var(--t-muted3)",letterSpacing:"0.04em"}}>📖 Plain English Breakdown</span>
              <span style={{fontSize:13,color:"var(--t-muted4)",fontWeight:400}}>Simple explanation — no jargon</span>
            </div>
            <span style={{fontSize:13,color:"var(--t-muted4)",transform:showPE?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block"}}>▼</span>
          </button>
          {showPE&&(
            <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",
              borderTop:"none",borderRadius:"0 0 12px 12px",padding:"16px 18px",
              animation:"icc-slide 0.25s ease both"}}>
              {[
                {label:"MARKET STRUCTURE & BRC PHASES",value:pe.structure},
                {label:"WHERE WE ARE IN THE BRC SEQUENCE",value:pe.brc_phase},
                {label:"KEY LEVELS",value:pe.key_levels},
                {label:"TRADE PLAN",value:pe.trade_plan},
                {label:"FINAL VERDICT",value:pe.verdict},
              ].filter(r=>r.value).map((row,i)=>(
                <div key={i} style={{marginBottom:i<4?14:0}}>
                  <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:5}}>{row.label}</div>
                  <p style={{fontSize:14,color:"var(--t-muted2)",margin:0,lineHeight:1.7,fontWeight:500}}>{row.value}</p>
                </div>
              ))}
              {pe.psychological_rule&&(
                <div style={{marginTop:14,padding:"10px 14px",background:"rgba(255,107,255,0.06)",
                  border:"1px solid rgba(255,107,255,0.15)",borderRadius:8}}>
                  <p style={{fontSize:14,color:"#ff6bff",margin:0,fontWeight:700,fontStyle:"italic",lineHeight:1.6}}>
                    "{pe.psychological_rule}"
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Alt scenario */}
      {hasAlt&&(
        <div style={{marginBottom:16}}>
          <button onClick={()=>setShowAlt(o=>!o)}
            style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",
              background:showAlt?"rgba(255,209,102,0.05)":"rgba(255,209,102,0.03)",
              border:`1px solid ${showAlt?"rgba(255,209,102,0.25)":"rgba(255,209,102,0.12)"}`,
              borderRadius:showAlt?"8px 8px 0 0":8,padding:"11px 16px",cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,fontWeight:900,color:"#ffd166",letterSpacing:"0.1em"}}>ALT SCENARIO</span>
              <span style={{fontSize:14,color:"var(--t-muted3)",fontWeight:500}}>if: {altCondition}</span>
            </div>
            <span style={{fontSize:13,color:"#ffd166",transform:showAlt?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block"}}>▼</span>
          </button>
          {showAlt&&(
            <div style={{background:"rgba(255,209,102,0.04)",border:"1px solid rgba(255,209,102,0.15)",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"16px 18px",animation:"icc-slide 0.25s ease both"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:8,marginBottom:8}}>
                {[
                  {label:"Direction",val:sp.direction,color:"#ffd166"},
                  {label:"Entry",val:sp.entry,color:"#ffd166"},
                  {label:"Stop",val:sp.stop,color:"#ff6b6b"},
                  {label:"TP1",val:sp.tp1,color:"#7fff6b"},
                  {label:"TP2",val:sp.tp2,color:"#7fff6b"},
                ].filter(r=>r.val&&r.val!=="NONE").map(row=>{
                  // Split "69,500 on retest after 30M close below 69,800"
                  // into mainVal="69,500" and sub="on retest after 30M close below 69,800"
                  const priceMatch=row.val.match(/^([0-9,.\s]+(?:\s*[–-]\s*[0-9,.]+)?)/);
                  const mainVal=priceMatch?priceMatch[1].trim():row.val;
                  const sub=priceMatch&&row.val.slice(mainVal.length).trim().replace(/^[^a-zA-Z]+/,"");
                  const hasContext=sub&&sub.length>0&&mainVal!==row.val;
                  return(
                    <div key={row.label} style={{padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8}}>
                      <div style={{fontSize:13,color:"var(--t-muted4)",fontWeight:700,letterSpacing:"0.1em",marginBottom:4}}>{row.label.toUpperCase()}</div>
                      <CopyPrice val={mainVal} color={row.color}/>
                      {hasContext&&(
                        <div style={{fontSize:13,color:"var(--t-muted4)",marginTop:4,lineHeight:1.4,fontWeight:500}}>{sub}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {sp.warning&&<p style={{fontSize:14,color:"#ffd166aa",margin:0,fontStyle:"italic"}}>{sp.warning}</p>}
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PSYCHOLOGY PAGE
// ═══════════════════════════════════════════════════════════════════════════
function PsychologyPage({anime}){
  const [tab,setTab]=useState("pre");
  return(
    <div style={{animation:"icc-fade 0.3s ease both"}}>
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <span style={{fontSize:28}}>🧠</span>
          <div>
            <h2 style={{fontSize:24,fontWeight:900,color:"var(--t-text)",letterSpacing:"0.08em",margin:0}}>Trading Psychology</h2>
            <p style={{fontSize:14,color:"#00e5ff",margin:0,letterSpacing:"0.08em"}}>Pre-session · Post-session · Mindset library</p>
          </div>
        </div>
        <p style={{fontSize:14,color:"var(--t-muted)",margin:0,lineHeight:1.8,maxWidth:600}}>Your mindset is either your biggest edge or your biggest liability. Use these tools before and after every session.</p>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:28,borderBottom:"1px solid rgba(255,107,255,0.1)",paddingBottom:0}}>
        {[["pre","🧠 Pre-Session Check"],["post","📋 Post-Session Debrief"],["library","📖 Mindset Library"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:"10px 20px",fontSize:14,fontWeight:900,letterSpacing:"0.08em",color:tab===k?"#ff6bff":"var(--t-muted)",borderBottom:tab===k?"2px solid #ff6bff":"2px solid transparent",marginBottom:-1,transition:"all 0.15s"}}>
            {l}
          </button>
        ))}
      </div>
      {tab==="pre"     && <PreSessionCheck anime={anime}/>}
      {tab==="post"    && <PostSessionDebrief anime={anime}/>}
      {tab==="library" && <MindsetLibrary anime={anime}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRE SESSION CHECK
// ═══════════════════════════════════════════════════════════════════════════
function PreSessionCheck({anime}){
  const [answers,setAnswers]=useState({sleep:null,emotion:null,distraction:null,ruleBreak:null});
  const [loading,setLoading]=useState(false);
  const [response,setResponse]=useState(null);
  const [error,setError]=useState(null);
  const allAnswered=Object.values(answers).every(v=>v!==null);

  const Q=[
    {key:"sleep",      label:"How did you sleep last night?",                        opts:["Great — 7+ hours","Decent — 5–6 hours","Poor — under 5 hours","Didn't sleep well at all"]},
    {key:"emotion",    label:"What's your emotional state right now?",               opts:["Calm and focused","Slightly anxious / excited","Frustrated or stressed","Angry or upset"]},
    {key:"distraction",label:"Any major distractions or life events today?",         opts:["None — fully focused","Minor stuff, manageable","Something big on my mind","Can't stop thinking about something"]},
    {key:"ruleBreak",  label:"Did you break any trading rules in your last session?", opts:["No — followed the plan","I moved my SL","I entered without confirmation","I revenge traded","I took a counter-trend trade"]},
  ];

  async function runCheck(){
    setLoading(true);setResponse(null);setError(null);
    try{
      const res=await fetch("/api/analyze",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:600,
          messages:[{role:"user",content:getPsychPrompt(anime,"pre",answers)}]})
      });
      const data=await res.json();
      if(data.error)throw new Error(typeof data.error.message==="string"?data.error.message:JSON.stringify(data.error));
      setResponse(data.content?.find(b=>b.type==="text")?.text||"");
    }catch(err){setError(err.message);}
    finally{setLoading(false);}
  }

  if(response){
    return(
      <div style={{animation:"icc-fade 0.3s ease both",maxWidth:680}}>
        <div style={{background:"var(--t-c3)",border:"1px solid rgba(0,229,255,0.25)",borderRadius:16,padding:"24px 28px",marginBottom:16}}>
          <p style={{fontSize:13,letterSpacing:"0.18em",color:"#00e5ff",fontWeight:900,margin:"0 0 14px"}}>READINESS VERDICT</p>
          <p style={{fontSize:14,color:"var(--t-text)",lineHeight:1.9,margin:0,whiteSpace:"pre-wrap"}}>{response}</p>
        </div>
        <button onClick={()=>{setResponse(null);setAnswers({sleep:null,emotion:null,distraction:null,ruleBreak:null});}}
          style={S.resetBtn}>Run Again</button>
      </div>
    );
  }

  return(
    <div style={{maxWidth:680,animation:"icc-fade 0.3s ease both"}}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {Q.map((q,qi)=>(
          <div key={q.key} style={{background:"var(--t-c2)",border:"1px solid rgba(255,107,255,0.1)",borderRadius:14,padding:"18px 22px"}}>
            <p style={{fontSize:14,fontWeight:900,color:"var(--t-text)",margin:"0 0 12px",lineHeight:1.4}}>
              <span style={{color:"#ff6bff",marginRight:8}}>{qi+1}.</span>{q.label}
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {q.opts.map(opt=>{
                const isSel=answers[q.key]===opt;
                return(
                  <button key={opt} onClick={()=>setAnswers(prev=>({...prev,[q.key]:opt}))}
                    style={{background:isSel?"rgba(255,107,255,0.12)":"var(--t-c3)",border:`1px solid ${isSel?"rgba(255,107,255,0.5)":"rgba(255,107,255,0.1)"}`,borderRadius:8,padding:"10px 14px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",fontSize:14,fontWeight:isSel?900:400,color:isSel?"#ff6bff":"var(--t-muted)",transition:"all 0.15s"}}>
                    {isSel?"✓  ":""}{opt}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button onClick={runCheck} disabled={!allAnswered||loading}
          style={{...S.generateBtn,opacity:allAnswered&&!loading?1:0.4,cursor:allAnswered&&!loading?"pointer":"not-allowed"}}>
          {loading?"Analyzing...":"GET READINESS VERDICT"}
        </button>
        {error&&<div style={S.errorBox}>{error}</div>}
      </div>
    </div>
  );
}


function PostSessionDebrief({anime}){
  const [text,setText]=useState("");
  const [loading,setLoading]=useState(false);
  const [response,setResponse]=useState(null);
  const [error,setError]=useState(null);

  async function runDebrief(){
    if(!text.trim())return;
    setLoading(true);setResponse(null);setError(null);
    try{
      const res=await fetch("/api/analyze",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,
          messages:[{role:"user",content:getPsychPrompt(anime,"post",{session:text})}]})
      });
      const data=await res.json();
      if(data.error){
        const e=data.error;
        if(e.type==="exceeded_limit"||e.type==="rate_limit_error"){
          const resetsAt=e.resetsAt||e.resets_at;
          const resetStr=resetsAt?new Date(resetsAt*1000).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"}):"soon";
          throw new Error(`Usage limit reached. Resets at ${resetStr} — try again then.`);
        }
        const msg=typeof e.message==="string"?e.message:typeof e.message==="object"?JSON.stringify(e.message):JSON.stringify(e);
        throw new Error(msg);
      }
      setResponse(data.content?.find(b=>b.type==="text")?.text||"");
    }catch(err){setError(err.message);}
    finally{setLoading(false);}
  }
  function reset(){setText("");setResponse(null);setError(null);}

  return(
    <div>
      {!response&&!loading&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{background:"var(--t-c2)",border:`1px solid ${anime.color}22`,borderRadius:14,padding:"20px 24px"}}>
            <p style={{fontSize:14,color:anime.color,fontWeight:900,letterSpacing:"0.15em",margin:"0 0 6px"}}>AFTER YOUR SESSION CLOSES</p>
            <p style={{fontSize:14,color:"var(--t-muted)",margin:0,lineHeight:1.7}}>Describe what happened in your session. What did you trade? Did you follow the plan? Did anything feel off? Be honest — {(anime.character||anime.label||"Coach")} can handle it.</p>
          </div>
          <textarea
            value={text} onChange={e=>setText(e.target.value)}
            placeholder={`Describe your session... (e.g. "I saw a setup on XAUUSD but the 1H wasn't aligned. I entered anyway because it looked strong on 30M. Got stopped out at the wide SL. Then I took another trade trying to make it back...")`}
            style={{width:"100%",minHeight:160,background:"var(--t-c3)",border:"1px solid rgba(255,107,255,0.18)",borderRadius:12,padding:"16px 18px",color:"#d0c8e8",fontSize:14,fontFamily:"'Courier New',Courier,monospace",lineHeight:1.7,resize:"vertical"}}
          />
          <button onClick={runDebrief} disabled={!text.trim()||loading}
            style={{...S.generateBtn,opacity:text.trim()?1:0.35,cursor:text.trim()?"pointer":"not-allowed"}}>
            {anime.emoji} DEBRIEF WITH {(anime.character||anime.label||"COACH").toUpperCase().split(" ")[0]}
          </button>
          {error&&<div style={S.errorBox}>{error}</div>}
        </div>
      )}
      {loading&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"60px 20px"}}>
          <span style={{fontSize:36,animation:"icc-pulse 1.2s ease infinite"}}>{anime.emoji}</span>
          <Spinner size={40}/>
          <p style={{fontSize:14,color:anime.color,fontWeight:900,letterSpacing:"0.12em",animation:"icc-pulse 1.4s ease infinite"}}>{(anime.character||anime.label||"Coach")} is analyzing your session...</p>
        </div>
      )}
      {response&&(
        <div style={{animation:"icc-slide 0.4s ease both"}}>
          <div style={{background:"var(--t-c3)",border:`2px solid ${anime.color}44`,borderRadius:16,padding:"28px 32px",marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <span style={{fontSize:28}}>{anime.emoji}</span>
              <div>
                <p style={{fontSize:14,letterSpacing:"0.18em",color:anime.color,fontWeight:900,margin:0}}>{(anime.character||anime.label||"COACH").toUpperCase()} DEBRIEF</p>
                <p style={{fontSize:13,color:"var(--t-muted3)",margin:0}}>Post-session analysis</p>
              </div>
            </div>
            <p style={{fontSize:14,color:"#d0c8e8",lineHeight:2,margin:0,whiteSpace:"pre-wrap"}}>{response}</p>
          </div>
          <button onClick={reset} style={{...S.resetBtn,display:"block"}}>↺ New Debrief</button>
        </div>
      )}
    </div>
  );
}

function MindsetLibrary({anime}){
  return(
    <div style={{animation:"icc-fade 0.3s ease both"}}>
      <div style={{background:`linear-gradient(135deg,${anime.color}12,rgba(255,255,255,0.02))`,border:`1px solid ${anime.color}33`,borderRadius:14,padding:"20px 24px",marginBottom:24,display:"flex",alignItems:"center",gap:16}}>
        <span style={{fontSize:36}}>{anime.emoji||"◈"}</span>
        <div>
          <p style={{fontSize:14,fontWeight:900,color:anime.color,margin:"0 0 4px",letterSpacing:"0.08em"}}>{anime.name||anime.label||"BRC"} · BRC RULES DECODED</p>
          <p style={{fontSize:14,color:"var(--t-muted)",margin:0}}>The 5 core trading rules explained through the BRC methodology. Read these before every session.</p>
        </div>
      </div>
      {(!anime.rules||anime.rules.length===0)?(
        <div style={{background:"var(--t-c2)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"24px",textAlign:"center"}}>
          <p style={{fontSize:14,color:"var(--t-muted3)",margin:0}}>Rules are unlocked with Anime Mode. Your current setup uses pure BRC methodology.</p>
        </div>
      ):(
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {anime.rules.map((r,i)=>(
          <div key={i} style={{background:"var(--t-c2)",border:`1px solid ${anime.color}22`,borderLeft:`4px solid ${anime.color}`,borderRadius:12,padding:"20px 24px",animation:`icc-slide 0.3s ease ${i*0.07}s both`}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <span style={{fontSize:13,letterSpacing:"0.2em",color:anime.color,fontWeight:900,background:anime.color+"15",padding:"3px 10px",borderRadius:4,border:`1px solid ${anime.color}33`}}>RULE {i+1}</span>
              <span style={{fontSize:14,fontWeight:900,color:"var(--t-text)",letterSpacing:"0.06em"}}>{r.rule}</span>
            </div>
            <p style={{fontSize:14,color:"#b0a0cc",lineHeight:1.85,margin:0}}>{r.lesson}</p>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════
function LockedPage({label}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:400,gap:16}}>
      <span style={{fontSize:52,opacity:0.25}}>🔒</span>
      <p style={{fontSize:18,fontWeight:900,letterSpacing:"0.2em",color:"#ff6bff",margin:0}}>{label} — Coming Soon</p>
    </div>
  );
}

function LevelBox({tag,price,sub,note,accent,big}){
  if(!price)return null;
  return(
    <div style={{flex:big?1.3:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"22px 12px",textAlign:"center",background:accent+"0a",borderBottom:`3px solid ${accent}`,borderRight:"1px solid rgba(255,107,255,0.08)"}}>
      <div style={{fontSize:13,letterSpacing:"0.16em",color:"var(--t-muted)",marginBottom:8,fontWeight:900}}>{tag}</div>
      <div style={{fontSize:big?28:22,fontWeight:900,color:accent,letterSpacing:"0.02em",marginBottom:6}}>{price}</div>
      {sub&&<div style={{fontSize:13,color:"var(--t-muted2)",lineHeight:1.5,marginBottom:note?4:0}}>{sub}</div>}
      {note&&<div style={{fontSize:13,color:"var(--t-muted3)",lineHeight:1.4,marginTop:2}}>{note}</div>}
    </div>
  );
}
function LevelDivider({dir,label}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 10px",flexShrink:0}}>
      <span style={{fontSize:16,color:"rgba(255,107,255,0.25)"}}>{dir}</span>
      <span style={{fontSize:8,letterSpacing:"0.14em",color:"rgba(255,107,255,0.2)",marginTop:4}}>{label}</span>
    </div>
  );
}
function TriggerChip({icon,label,val,color}){
  if(!val)return null;
  return(
    <div style={{flex:1,minWidth:150,background:color+"0a",border:`1px solid ${color}30`,borderRadius:10,padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><span style={{fontSize:14}}>{icon}</span><span style={{fontSize:13,letterSpacing:"0.18em",color,fontWeight:900}}>{label}</span></div>
      <p style={{fontSize:14,color:"var(--t-text)",margin:0,lineHeight:1.5}}>{val}</p>
    </div>
  );
}
function MetaChip({label,val,color}){
  if(!val)return null;
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--t-c3)",border:`1px solid ${color}30`,borderRadius:8,padding:"9px 14px"}}>
      <span style={{fontSize:13,letterSpacing:"0.15em",color:"var(--t-muted)"}}>{label}</span>
      <span style={{fontSize:14,fontWeight:900,color}}>{val}</span>
    </div>
  );
}
function Filters({label,opts,val,set}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <span style={{fontSize:14,color:"var(--t-muted)",letterSpacing:"0.1em"}}>{label}:</span>
      {opts.map(o=>(
        <button key={o} onClick={()=>set(o)} style={{...S.filterBtn,...(val===o?S.filterBtnActive:{})}}>{o}</button>
      ))}
    </div>
  );
}
function TradeTable({trades,compact}){
  return(
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead><tr>
          {!compact&&<th style={S.th}>Date</th>}
          <th style={S.th}>Pair</th><th style={S.th}>Dir</th><th style={S.th}>Phase</th>
          {!compact&&<><th style={S.th}>D</th><th style={S.th}>4H</th><th style={S.th}>1H</th></>}
          <th style={S.th}>Entry</th><th style={S.th}>Exit</th><th style={S.th}>P&L</th><th style={S.th}>Result</th>
        </tr></thead>
        <tbody>
          {trades.map((t,i)=>(
            <tr key={t.id} style={{background:i%2===0?"#1a0e2e":"#160b28",borderBottom:"1px solid rgba(255,107,255,0.06)"}}>
              {!compact&&<td style={S.td}><span style={{display:"block"}}>{t.date}</span><span style={{fontSize:14,color:"var(--t-muted2)"}}>{t.time}</span></td>}
              <td style={S.td}><span style={{fontSize:14,fontWeight:700,color:"#00e5ff",letterSpacing:"0.06em"}}>{t.instrument}</span></td>
              <td style={S.td}><span style={{fontSize:14,fontWeight:700,padding:"3px 8px",borderRadius:5,border:"1px solid",background:t.direction==="LONG"?"#7fff6b22":"#ff6b6b22",color:t.direction==="LONG"?"#7fff6b":"#ff6b6b",borderColor:t.direction==="LONG"?"#7fff6b55":"#ff6b6b55"}}>{t.direction==="LONG"?"▲ L":"▼ S"}</span></td>
              <td style={S.td}><span style={{fontSize:14,fontWeight:700,color:phaseColors[t.phase]||"#fff"}}>{t.phase}</span></td>
              {!compact&&<><td style={S.td}>{t.d}</td><td style={S.td}>{t.h4}</td><td style={S.td}>{t.h1}</td></>}
              <td style={S.td}><span style={{color:"#c0b0e0"}}>{t.entry}</span></td>
              <td style={S.td}><span style={{color:"#c0b0e0"}}>{t.exit}</span></td>
              <td style={S.td}><span style={{fontWeight:700,color:t.pnl>0?"#7fff6b":"#ff6b6b"}}>{t.pnl>0?"+":""}{t.pnl.toFixed(1)}</span></td>
              <td style={S.td}><span style={{fontSize:14,fontWeight:900,padding:"3px 10px",borderRadius:5,border:"1px solid",background:t.result==="WIN"?"#7fff6b22":"#ff6b6b22",color:t.result==="WIN"?"#7fff6b":"#ff6b6b",borderColor:t.result==="WIN"?"#7fff6b44":"#ff6b6b44"}}>{t.result}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Spinner({size=24}){
  return <span style={{display:"inline-block",width:size,height:size,border:`3px solid rgba(255,107,255,0.15)`,borderTop:`3px solid #ff6bff`,borderRadius:"50%",animation:"icc-spin 0.8s linear infinite"}}/>;
}

// ─── Theme tokens ───────────────────────────────────────────────────────────
const DARK={
  bg:"#1e1a35",
  navBg:"rgba(28,22,50,0.97)",
  text:"#fdf9ff",
  subtext:"#ede5ff",
  border:"rgba(255,107,255,0.16)",
  gridLine:"rgba(255,107,255,0.04)",
  c1:"rgba(255,255,255,0.07)",
  c2:"rgba(255,255,255,0.11)",
  c3:"rgba(255,255,255,0.15)",
  c4:"rgba(255,255,255,0.18)",
  c5:"rgba(255,255,255,0.10)",
  c6:"rgba(255,255,255,0.13)",
  c7:"rgba(255,255,255,0.15)",
  cardBg:"rgba(255,255,255,0.10)",
  cardBorder:"rgba(255,255,255,0.13)",
  inputBg:"rgba(255,255,255,0.12)",
  inputBorder:"rgba(255,107,255,0.22)",
  muted:"#fdf9ff",
  muted2:"#ede5ff",
  muted3:"#d8ccf4",
  muted4:"#c4b4e0",
  muted5:"#a080c8",
  navLinkColor:"#f8f4ff",
  tableBg:"#221d3a",
  scrollThumb:"rgba(255,107,255,0.3)",
};
const LIGHT={
  bg:"#f2f0f8",
  navBg:"rgba(255,255,255,0.97)",
  text:"#1a0e38",
  subtext:"#8070b0",
  border:"rgba(100,60,180,0.15)",
  gridLine:"rgba(100,60,180,0.05)",
  // card surfaces — light uses white with low opacity black shadows
  c1:"rgba(255,255,255,0.85)",
  c2:"rgba(255,255,255,0.85)",
  c3:"rgba(255,255,255,0.9)",
  c4:"rgba(255,255,255,0.95)",
  c5:"rgba(0,0,0,0.03)",
  c6:"rgba(100,60,180,0.08)",
  c7:"rgba(100,60,180,0.1)",
  cardBg:"rgba(255,255,255,0.9)",
  cardBorder:"rgba(100,60,180,0.12)",
  inputBg:"rgba(255,255,255,0.95)",
  inputBorder:"rgba(140,80,220,0.25)",
  // text tones — all shifted to readable purples on white
  muted:"var(--t-muted2)",
  muted2:"#6858a8",
  muted3:"#7868b0",
  muted4:"#8878b8",
  muted5:"#9888c0",
  navLinkColor:"var(--t-muted2)",
  // misc
  tableBg:"#ffffff",
  scrollThumb:"rgba(140,80,220,0.2)",
};

// ─── Styles ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// AUTH SCREEN — Sign Up / Log In
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// JOURNAL PAGE
// ═══════════════════════════════════════════════════════════════════════════
function JournalPage({journal, onUpdate, T=DARK}){
  const wins=journal.filter(t=>t.outcome==="WIN").length;
  const losses=journal.filter(t=>t.outcome==="LOSS").length;
  const be=journal.filter(t=>t.outcome==="BE").length;
  const missed=journal.filter(t=>t.outcome==="MISSED").length;
  const total=wins+losses+be;
  const winRate=total>0?Math.round((wins/total)*100):0;
  const gradeRank={"A+":4,"A":3,"B":2,"C":1};
  const gradedTrades=journal.filter(t=>t.grade&&gradeRank[t.grade]);
  const avgGradeNum=gradedTrades.length>0
    ?gradedTrades.reduce((acc,t)=>acc+(gradeRank[t.grade]||0),0)/gradedTrades.length
    :0;
  const avgGradeLabel=avgGradeNum>=3.5?"A+"
    :avgGradeNum>=2.5?"A"
    :avgGradeNum>=1.5?"B"
    :avgGradeNum>0?"C":"—";
  const avgGradeColor={"A+":"#7fff6b","A":"#00e5ff","B":"#ffd166","C":"#ff9a3c","—":"#8878aa"}[avgGradeLabel];

  const gradeColors={"A+":"#7fff6b","A":"#00e5ff","B":"#ffd166","C":"#ff9a3c","PASS":"#8878aa"};
  const outcomeColors={WIN:"#7fff6b",LOSS:"#ff6b6b",BE:"#ffd166"};

  function setOutcome(id, outcome){
    const updated=journal.map(t=>t.id===id?{...t,outcome}:t);
    onUpdate(updated);
  }

  function deleteEntry(id){
    const updated=journal.filter(t=>t.id!==id);
    onUpdate(updated);
  }

  return(
    <div style={{maxWidth:860,margin:"0 auto",padding:"32px 24px 0"}}>

      {/* Page header */}
      <div style={{marginBottom:28}}>
        <h1 style={{fontSize:28,fontWeight:900,color:"var(--t-text)",letterSpacing:"-0.01em",margin:"0 0 6px"}}>Execution Journal</h1>
        <p style={{fontFamily:"monospace",fontSize:14,color:"var(--t-muted4)",margin:0,letterSpacing:"0.04em"}}>The system only works if you log it.</p>
      </div>

      {/* Stats bar — 3 primary + 4 secondary */}
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
        {/* Primary row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {/* WIN RATE — softened for small samples */}
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,padding:"16px 18px"}}>
            <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:8}}>WIN RATE</div>
            {total<5?(
              <div>
                <div style={{fontSize:30,fontWeight:900,color:total===0?"#8878aa":"#7fff6b",fontFamily:"monospace",letterSpacing:"-0.02em"}}>{total===0?"—":`${winRate}%`}</div>
                {total>0&&<div style={{fontSize:13,color:"var(--t-muted4)",fontWeight:600,marginTop:3,fontFamily:"monospace"}}>small sample · {total} trade{total!==1?"s":""}</div>}
              </div>
            ):(
              <div style={{fontSize:30,fontWeight:900,color:"#7fff6b",fontFamily:"monospace",letterSpacing:"-0.02em"}}>{winRate}%</div>
            )}
          </div>
          {/* RECORD */}
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,padding:"16px 18px"}}>
            <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:8}}>RECORD</div>
            <div style={{fontSize:30,fontWeight:900,color:"#00e5ff",fontFamily:"monospace",letterSpacing:"-0.02em"}}>{wins}-{losses}{be>0?"-"+be:""}</div>
            {total<5&&total>0&&<div style={{fontSize:13,color:"var(--t-muted4)",fontWeight:600,marginTop:3,fontFamily:"monospace"}}>need 5+ trades for reliable data</div>}
          </div>
          {/* AVG GRADE */}
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,padding:"16px 18px"}}>
            <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:8}}>AVG GRADE</div>
            <div style={{fontSize:30,fontWeight:900,color:avgGradeColor,fontFamily:"monospace",letterSpacing:"-0.02em"}}>{avgGradeLabel}</div>
            {gradedTrades.length>0&&<div style={{fontSize:13,color:"var(--t-muted4)",fontWeight:600,marginTop:3,fontFamily:"monospace"}}>{gradedTrades.length} trade{gradedTrades.length!==1?"s":""} logged</div>}
          </div>
        </div>
        {/* Secondary row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[
            {label:"WINS",value:wins,color:"#7fff6b"},
            {label:"LOSSES",value:losses,color:"#ff6b6b"},
            {label:"BREAK EVEN",value:be,color:"#ffd166"},
            {label:"MISSED",value:missed,color:"#ff9a3c"},
          ].map(s=>(
            <div key={s.label} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 14px"}}>
              <div style={{fontSize:13,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:6}}>{s.label}</div>
              <div style={{fontSize:22,fontWeight:900,color:s.color,fontFamily:"monospace"}}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Grade breakdown */}
      {total>0&&(
        <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
          {["A+","A","B","C"].map(g=>{
            const count=journal.filter(t=>t.grade===g&&t.outcome).length;
            if(!count)return null;
            return(
              <div key={g} style={{padding:"4px 12px",background:`${gradeColors[g]}14`,border:`1px solid ${gradeColors[g]}44`,borderRadius:8,fontSize:14,fontWeight:700,color:gradeColors[g]}}>
                {g} setups logged: {count}
              </div>
            );
          })}
        </div>
      )}

      {/* Journal entries */}
      {journal.length===0?(
        <div style={{padding:"40px 0 0"}}>
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,padding:"28px 24px",textAlign:"center"}}>
            <div style={{fontSize:28,marginBottom:12}}>📓</div>
            <div style={{fontSize:15,fontWeight:900,color:"var(--t-muted3)",marginBottom:6}}>No sessions logged yet</div>
            <div style={{fontSize:14,color:"var(--t-muted4)",fontFamily:"monospace",lineHeight:1.7}}>
              Complete Phase 3 and click <strong style={{color:"#7fff6b"}}>LIMIT ORDER ACTIVE</strong><br/>
              to automatically log your next trade here.
            </div>
          </div>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {journal.map(trade=>(
            <div key={trade.id}
              style={{background:"rgba(255,255,255,0.03)",
                border:`1px solid ${trade.outcome?outcomeColors[trade.outcome]+"33":"rgba(255,255,255,0.07)"}`,
                borderLeft:`3px solid ${trade.outcome?outcomeColors[trade.outcome]:"rgba(255,255,255,0.15)"}`,
                borderRadius:12,padding:"16px 20px"}}>

              <div style={{display:"flex",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>

                {/* Left — trade info */}
                <div style={{flex:1,minWidth:200}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,fontWeight:900,color:"var(--t-text)"}}>{trade.instrument}</span>
                    <span style={{fontSize:14,fontWeight:700,padding:"2px 8px",borderRadius:4,
                      background:trade.direction==="LONG"?"rgba(127,255,107,0.12)":"rgba(255,107,107,0.12)",
                      color:trade.direction==="LONG"?"#7fff6b":"#ff6b6b"}}>
                      {trade.direction}
                    </span>
                    <span style={{fontSize:14,fontWeight:700,padding:"2px 8px",borderRadius:4,
                      background:`${gradeColors[trade.grade]||"#8878aa"}14`,
                      color:gradeColors[trade.grade]||"#8878aa"}}>
                      {trade.grade}
                    </span>
                    <span style={{fontSize:13,color:"var(--t-muted4)",fontFamily:"monospace"}}>
                      {new Date(trade.date).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                    {[{label:"Entry",val:trade.entry},{label:"Stop",val:trade.stop},{label:"TP1",val:trade.tp1},{label:"Session",val:trade.session}].map(f=>(
                      <div key={f.label}>
                        <div style={{fontSize:13,color:"var(--t-muted4)",fontWeight:700,letterSpacing:"0.1em",marginBottom:2}}>{f.label}</div>
                        <div style={{fontSize:14,fontWeight:700,color:"var(--t-muted)",fontFamily:"monospace"}}>{f.val||"—"}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right — outcome selector */}
                <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                  {!trade.outcome?(
                    <>
                      <div style={{fontSize:13,fontWeight:700,letterSpacing:"0.1em",color:"var(--t-muted4)",marginBottom:2}}>OUTCOME</div>
                      <div style={{display:"flex",gap:6}}>
                        {["WIN","LOSS","BE"].map(o=>(
                          <button key={o} onClick={()=>setOutcome(trade.id,o)}
                            style={{fontFamily:"inherit",fontSize:14,fontWeight:900,letterSpacing:"0.08em",
                              padding:"6px 14px",borderRadius:7,cursor:"pointer",border:"none",
                              background:o==="WIN"?"rgba(127,255,107,0.12)":o==="LOSS"?"rgba(255,107,107,0.12)":"rgba(255,209,102,0.12)",
                              color:o==="WIN"?"#7fff6b":o==="LOSS"?"#ff6b6b":"#ffd166"}}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </>
                  ):(
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:16,fontWeight:900,color:outcomeColors[trade.outcome]}}>{trade.outcome}</span>
                      <button onClick={()=>setOutcome(trade.id,null)}
                        style={{fontSize:14,fontWeight:700,letterSpacing:"0.06em",
                          color:"var(--t-muted3)",
                          background:"rgba(255,255,255,0.06)",
                          border:"1px solid rgba(255,255,255,0.14)",
                          borderRadius:7,padding:"5px 12px",
                          cursor:"pointer",fontFamily:"inherit",
                          transition:"all 0.15s"}}
                        onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.1)";e.currentTarget.style.color="var(--t-text)";}}
                        onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="var(--t-muted3)";}}>
                        ✎ Edit
                      </button>
                    </div>
                  )}
                  <button onClick={()=>deleteEntry(trade.id)}
                    title="Delete trade"
                    style={{fontSize:14,color:"rgba(255,255,255,0.80)",
                      background:"rgba(255,255,255,0.04)",
                      border:"1px solid rgba(255,255,255,0.08)",
                      borderRadius:7,padding:"5px 8px",
                      cursor:"pointer",lineHeight:1,
                      transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,107,107,0.7)";e.currentTarget.style.background="rgba(255,107,107,0.08)";e.currentTarget.style.borderColor="rgba(255,107,107,0.25)";}}
                    onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.80)";e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";}}>
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Coaching nudge — always visible at bottom */}
      {journal.length>0&&(
        <div style={{marginTop:16,padding:"16px 20px",
          background:"rgba(255,255,255,0.02)",
          border:"1px solid rgba(255,255,255,0.05)",
          borderRadius:10,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:16}}>📈</span>
          <span style={{fontSize:14,color:"var(--t-muted4)",fontFamily:"monospace",lineHeight:1.6}}>
            Start a live session to automatically log your setups here.
          </span>
        </div>
      )}
    </div>
  );
}

function ResetPasswordPage({ token, onDone }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function handleReset() {
    if (!pw || !confirm) { setError("Both fields are required."); return; }
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pw !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ password: pw }),
      });
      setLoading(false);
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => onDone(), 2500);
      } else {
        const d = await res.json();
        setError(d.msg || d.error_description || d.error || "Failed to reset password. The link may have expired.");
      }
    } catch(e) {
      setLoading(false);
      setError("Connection error. Try again.");
    }
  }

  const inputSt = {
    width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)",
    borderRadius:10, padding:"13px 16px", fontSize:15, color:"#f4f0ff",
    fontFamily:"inherit", outline:"none", boxSizing:"border-box",
  };

  return (
    <div style={{ minHeight:"100vh", background:"#1e1a35", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"24px", position:"relative" }}>
      <div style={{ position:"fixed", inset:0, backgroundImage:"linear-gradient(rgba(255,107,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,255,0.025) 1px,transparent 1px)", backgroundSize:"48px 48px", pointerEvents:"none" }}/>
      <div style={{ position:"fixed", width:500, height:500, borderRadius:"50%", background:"#7b2fff", top:-150, left:"50%", transform:"translateX(-50%)", filter:"blur(120px)", opacity:0.12, pointerEvents:"none" }}/>

      <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:420 }}>
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:16 }}>
            <OmniLogo size={32} />
            <div style={{ fontFamily:"monospace", fontSize:18, fontWeight:700, letterSpacing:"0.12em", background:"linear-gradient(90deg,#ff6bff,#00e5ff)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>OmniUSD</div>
          </div>
          <div style={{ fontSize:22, fontWeight:800, color:"#f4f0ff", marginBottom:6, letterSpacing:"-0.01em" }}>
            {success ? "Password updated." : "Set a new password"}
          </div>
          <div style={{ fontSize:14, color:"#8878aa", fontFamily:"monospace" }}>
            {success ? "Redirecting you to login..." : "Choose a strong password for your account."}
          </div>
        </div>

        {success ? (
          <div style={{ padding:"20px", background:"rgba(127,255,107,0.08)", border:"1px solid rgba(127,255,107,0.25)", borderRadius:12, textAlign:"center", fontSize:14, color:"#7fff6b" }}>
            ✅ Password updated successfully.
          </div>
        ) : (
          <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,107,255,0.15)", borderRadius:16, padding:"32px 28px" }}>

            {error && (
              <div style={{ padding:"10px 14px", background:"rgba(255,107,107,0.08)", border:"1px solid rgba(255,107,107,0.25)", borderRadius:8, marginBottom:16, fontSize:14, color:"#ff8080", fontFamily:"monospace", lineHeight:1.5 }}>
                {error}
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:20 }}>
              <div>
                <label style={{ fontSize:14, fontWeight:700, letterSpacing:"0.1em", color:"#8878aa", display:"block", marginBottom:6, fontFamily:"monospace" }}>NEW PASSWORD</label>
                <div style={{ position:"relative" }}>
                  <input type={showPw ? "text" : "password"} value={pw} onChange={e=>setPw(e.target.value)}
                    placeholder="Minimum 8 characters"
                    style={{ ...inputSt, paddingRight:48 }}
                    onKeyDown={e=>e.key==="Enter"&&handleReset()}
                  />
                  <button type="button" onClick={()=>setShowPw(p=>!p)}
                    style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#8878aa", padding:0 }}>
                    {showPw ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
              <div>
                <label style={{ fontSize:14, fontWeight:700, letterSpacing:"0.1em", color:"#8878aa", display:"block", marginBottom:6, fontFamily:"monospace" }}>CONFIRM PASSWORD</label>
                <div style={{ position:"relative" }}>
                  <input type={showPw ? "text" : "password"} value={confirm} onChange={e=>setConfirm(e.target.value)}
                    placeholder="Re-enter your password"
                    style={{ ...inputSt, paddingRight:48, borderColor: confirm && confirm!==pw ? "rgba(255,107,107,0.5)" : confirm && confirm===pw ? "rgba(127,255,107,0.4)" : "rgba(255,255,255,0.12)" }}
                    onKeyDown={e=>e.key==="Enter"&&handleReset()}
                  />
                  {confirm && (
                    <div style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", fontSize:14 }}>
                      {confirm===pw ? "✅" : "❌"}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button onClick={handleReset} disabled={loading}
              style={{ width:"100%", background:loading?"rgba(255,255,255,0.06)":"linear-gradient(135deg,#ff6bff,#7b2fff)", border:"none", color:loading?"#8878aa":"#fff", padding:"15px", borderRadius:10, fontSize:15, fontWeight:900, letterSpacing:"0.1em", fontFamily:"inherit", cursor:loading?"not-allowed":"pointer", boxShadow:loading?"none":"0 4px 28px rgba(255,107,255,0.22)", transition:"all 0.2s" }}>
              {loading ? "Updating..." : "SET NEW PASSWORD →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthScreen({onBack, supabase, initialTab="signup"}){
  const [tab,setTab]=useState(initialTab);
  const loginOnly=initialTab==="login";
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [preferredName,setPreferredName]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [success,setSuccess]=useState(null);
  const [showPass,setShowPass]=useState(false);
  const [showConfirm,setShowConfirm]=useState(false);
  const [resetSent,setResetSent]=useState(false);

  async function handleSignUp(){
    if(!preferredName.trim()){setError("Please enter your first name.");return;}
    if(!email||!password){setError("Email and password are required.");return;}
    if(password.length<8){setError("Password must be at least 8 characters.");return;}
    if(password!==confirmPassword){setError("Passwords do not match. Please check and try again.");return;}
    setLoading(true);setError(null);
    try{
      const res=await fetch(`${SUPABASE_URL}/auth/v1/signup`,{
        method:"POST",
        headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},
        body:JSON.stringify({
          email, password,
          data: { preferred_name: preferredName.trim() }
        }),
      });
      const data=await res.json();
      if(!res.ok){
        setError(data.msg||data.error_description||data.error||"Signup failed. Please try again.");
        setLoading(false);
        return;
      }
      // Auto-login after signup
      const loginRes=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{
        method:"POST",
        headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},
        body:JSON.stringify({email,password}),
      });
      const loginData=await loginRes.json();
      if(loginData.access_token){
        localStorage.setItem("omniusd_session",JSON.stringify(loginData));
        // Don't create profile here — let onboarding run first
        // Store the paid tier so onboarding knows which plan was purchased
        // Profile gets created when user completes onboarding via selectProfile()
        window.location.reload();
      } else {
        setSuccess("Account created! Check your email to confirm, then log in.");
        setTab("login");
      }
      setLoading(false);
    }catch(e){
      setError("Connection error: "+e.message);
      setLoading(false);
    }
  }

  async function handleLogin(){
    if(!email||!password){setError("Email and password are required.");return;}
    setLoading(true);setError(null);
    try{
      const res=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{
        method:"POST",
        headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},
        body:JSON.stringify({email,password}),
      });
      const data=await res.json();
      setLoading(false);
      if(!res.ok){
        setError(data.error_description||data.msg||data.error||"Login failed. Check your email and password.");
        return;
      }
      if(!data.access_token){
        setError("No session returned. Please confirm your email first.");
        return;
      }
      localStorage.setItem("omniusd_session",JSON.stringify(data));
      window.location.reload();
    }catch(e){
      setLoading(false);
      setError("Connection error: "+e.message);
    }
  }

  async function handleReset(){
    if(!email){setError("Enter your email address first.");return;}
    setLoading(true);setError(null);
    try{
      const res=await fetch(`${SUPABASE_URL}/auth/v1/recover`,{
        method:"POST",
        headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},
        body:JSON.stringify({email}),
      });
      setLoading(false);
      if(!res.ok){
        const d=await res.json();
        setError(d.msg||d.error||"Could not send reset email. Try again.");
        return;
      }
      setResetSent(true);
      setSuccess("Reset link sent. Check your inbox — it may take a minute.");
    }catch(e){
      setLoading(false);
      setError("Connection error: "+e.message);
    }
  }

  const inputStyle={
    width:"100%",background:"rgba(255,255,255,0.05)",
    border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,
    padding:"13px 16px",fontSize:15,color:"#f4f0ff",
    fontFamily:"inherit",outline:"none",boxSizing:"border-box",
    transition:"border 0.15s",
  };

  return(
    <div style={{minHeight:"100vh",background:"#1e1a35",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:"24px",position:"relative",overflowY:"auto"}}>

      {/* Grid bg */}
      <div style={{position:"fixed",inset:0,backgroundImage:"linear-gradient(rgba(255,107,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,255,0.025) 1px,transparent 1px)",backgroundSize:"48px 48px",pointerEvents:"none"}}/>
      {/* Orb */}
      <div style={{position:"fixed",width:500,height:500,borderRadius:"50%",background:"#7b2fff",top:-150,left:"50%",transform:"translateX(-50%)",filter:"blur(120px)",opacity:0.12,pointerEvents:"none"}}/>

      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:420}}>

        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:40}}>
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:8,marginBottom:16}}>
            <OmniLogo size={32} />
            <span style={{fontFamily:"monospace",fontSize:18,fontWeight:700,letterSpacing:"0.12em",background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>OmniUSD</span>
          </button>
          <div style={{fontSize:22,fontWeight:800,color:"#f4f0ff",marginBottom:6,letterSpacing:"-0.01em"}}>
            {tab==="reset"?"Forgot your password?":tab==="signup"?"Almost done.":"Welcome back"}
          </div>
          <div style={{fontSize:14,color:"#8878aa",fontFamily:"monospace"}}>
            {tab==="signup"
              ? (localStorage.getItem("omniusd_paid_tier")
                  ? "Payment confirmed. Create your password to access your dashboard."
                  : "Create your account to get started.")
              : tab==="login"?"Sign in to continue to your dashboard."
              :"Enter your email and we'll send a reset link."}
          </div>
        </div>

        {/* Card */}
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,107,255,0.15)",borderRadius:16,padding:"32px 28px"}}>

          {/* Tabs */}
          {!loginOnly&&(
            <div style={{display:"flex",gap:4,marginBottom:24,background:"rgba(255,255,255,0.04)",padding:4,borderRadius:10}}>
              {["signup","login"].map(t=>(
                <button key={t} onClick={()=>{setTab(t);setError(null);setSuccess(null);setResetSent(false);}}
                  style={{flex:1,padding:"9px",borderRadius:7,border:"none",fontFamily:"inherit",
                    fontSize:14,fontWeight:700,cursor:"pointer",letterSpacing:"0.04em",transition:"all 0.15s",
                    background:tab===t?"rgba(255,107,255,0.15)":"none",
                    color:tab===t?"#ff6bff":"#8878aa"}}>
                  {t==="signup"?"Sign Up":"Log In"}
                </button>
              ))}
            </div>
          )}

          {/* Success */}
          {success&&(
            <div style={{padding:"10px 14px",background:"rgba(127,255,107,0.08)",border:"1px solid rgba(127,255,107,0.25)",borderRadius:8,marginBottom:16,fontSize:14,color:"#7fff6b",fontFamily:"monospace",lineHeight:1.5}}>
              {success}
            </div>
          )}

          {/* Error */}
          {error&&(
            <div style={{padding:"10px 14px",background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.25)",borderRadius:8,marginBottom:16,fontSize:14,color:"#ff8080",fontFamily:"monospace",lineHeight:1.5}}>
              {error}
            </div>
          )}

          {/* Fields */}
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>

            {/* Preferred name — signup only */}
            {tab==="signup"&&(
              <div>
                <label style={{fontSize:14,fontWeight:700,letterSpacing:"0.1em",color:"#8878aa",display:"block",marginBottom:6,fontFamily:"monospace"}}>FIRST NAME</label>
                <input type="text" value={preferredName} onChange={e=>setPreferredName(e.target.value)}
                  placeholder="What should we call you?"
                  style={inputStyle}
                  onKeyDown={e=>e.key==="Enter"&&handleSignUp()}
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label style={{fontSize:14,fontWeight:700,letterSpacing:"0.1em",color:"#8878aa",display:"block",marginBottom:6,fontFamily:"monospace"}}>EMAIL</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="you@example.com" style={inputStyle}
                onKeyDown={e=>e.key==="Enter"&&(tab==="signup"?handleSignUp():tab==="login"?handleLogin():handleReset())}
              />
            </div>

            {/* Password */}
            {tab!=="reset"&&(
              <div>
                <label style={{fontSize:14,fontWeight:700,letterSpacing:"0.1em",color:"#8878aa",display:"block",marginBottom:6,fontFamily:"monospace"}}>PASSWORD</label>
                <div style={{position:"relative"}}>
                  <input type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                    placeholder={tab==="signup"?"Minimum 8 characters":"Enter your password"}
                    style={{...inputStyle,paddingRight:48}}
                    onKeyDown={e=>e.key==="Enter"&&(tab==="signup"?handleSignUp():handleLogin())}
                  />
                  <button type="button" onClick={()=>setShowPass(p=>!p)}
                    style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#8878aa",padding:0,lineHeight:1}}>
                    {showPass?"🙈":"👁"}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm password — signup only */}
            {tab==="signup"&&(
              <div>
                <label style={{fontSize:14,fontWeight:700,letterSpacing:"0.1em",color:"#8878aa",display:"block",marginBottom:6,fontFamily:"monospace"}}>CONFIRM PASSWORD</label>
                <div style={{position:"relative"}}>
                  <input type={showConfirm?"text":"password"} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    style={{...inputStyle,paddingRight:48,
                      borderColor: confirmPassword && confirmPassword!==password ? "rgba(255,107,107,0.5)" : confirmPassword && confirmPassword===password ? "rgba(127,255,107,0.4)" : "rgba(255,255,255,0.12)"
                    }}
                    onKeyDown={e=>e.key==="Enter"&&handleSignUp()}
                  />
                  <button type="button" onClick={()=>setShowConfirm(p=>!p)}
                    style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",cursor:"pointer",fontSize:16,color:"#8878aa",padding:0,lineHeight:1}}>
                    {showConfirm?"🙈":"👁"}
                  </button>
                  {/* Match indicator */}
                  {confirmPassword&&(
                    <div style={{position:"absolute",right:44,top:"50%",transform:"translateY(-50%)",fontSize:14}}>
                      {confirmPassword===password?"✅":"❌"}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Primary button */}
          {!resetSent&&(
            <button
              onClick={tab==="signup"?handleSignUp:tab==="login"?handleLogin:handleReset}
              disabled={loading}
              style={{width:"100%",background:loading?"rgba(255,255,255,0.06)":"linear-gradient(135deg,#ff6bff,#7b2fff)",
                border:"none",color:loading?"#8878aa":"#fff",padding:"15px",borderRadius:10,
                fontSize:15,fontWeight:900,letterSpacing:"0.1em",fontFamily:"inherit",
                cursor:loading?"not-allowed":"pointer",
                boxShadow:loading?"none":"0 4px 28px rgba(255,107,255,0.22)",transition:"all 0.2s",marginBottom:16}}>
              {loading?"Please wait..."
                :tab==="signup"?"CREATE ACCOUNT →"
                :tab==="login"?"SIGN IN →"
                :"SEND RESET LINK →"}
            </button>
          )}

          {/* Secondary links */}
          <div style={{textAlign:"center",fontSize:14,fontFamily:"monospace",color:"#8878aa",display:"flex",flexDirection:"column",gap:8}}>
            {tab==="login"&&!loginOnly&&(
              <button onClick={()=>{setTab("reset");setError(null);setSuccess(null);setResetSent(false);}}
                style={{background:"none",border:"none",color:"rgba(255,255,255,0.8)",cursor:"pointer",fontFamily:"monospace",fontSize:14,textDecoration:"underline"}}>
                Forgot your password?
              </button>
            )}
            {tab==="login"&&loginOnly&&(
              <button onClick={()=>{setTab("reset");setError(null);setSuccess(null);setResetSent(false);}}
                style={{background:"none",border:"none",color:"rgba(255,255,255,0.8)",cursor:"pointer",fontFamily:"monospace",fontSize:14,textDecoration:"underline"}}>
                Forgot your password?
              </button>
            )}
            {tab==="reset"&&(
              <button onClick={()=>{setTab("login");setError(null);setSuccess(null);setResetSent(false);}}
                style={{background:"none",border:"none",color:"rgba(255,255,255,0.8)",cursor:"pointer",fontFamily:"monospace",fontSize:14,textDecoration:"underline"}}>
                ← Back to log in
              </button>
            )}
          </div>
        </div>

        {/* Back to landing */}
        <div style={{textAlign:"center",marginTop:20}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#8878aa",cursor:"pointer",fontFamily:"monospace",fontSize:14,letterSpacing:"0.06em"}}>
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRICING PAGE — standalone plan picker, goes straight to Stripe
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PRIVACY POLICY
// ═══════════════════════════════════════════════════════════════════════════
function LegalPage({ onBack, type }) {
  const isPrivacy = type === "privacy";

  const privacySections = [
    { title: "1. Who We Are", body: "OmniUSD (omniusd.pro) is a trading analysis tool built on the BRC (Break-Retest-Continuation) methodology. We provide AI-powered chart analysis and session guidance for traders. References to 'we', 'us', or 'OmniUSD' in this policy refer to the operators of omniusd.pro." },
    { title: "2. What Information We Collect", bullets: ["Email address (required for account creation)", "Password (stored securely via Supabase, never in plain text)", "Chart screenshots you upload for analysis (used solely to generate your session plan, not stored permanently)", "Payment information (processed by Stripe — we never see or store your card details)", "Usage data — which instruments you analyze, session timing, and analysis count (used to enforce fair-use limits)", "Subscription tier and billing status"] },
    { title: "3. How We Use Your Information", body: "We use your information to provide and operate OmniUSD, generate AI-powered trading analysis from your uploaded charts, enforce usage limits to maintain service quality, process payments via Stripe, send transactional emails, and improve our analysis system. We do not sell your personal information to third parties. We do not use your data for advertising." },
    { title: "4. Chart Uploads", body: "When you upload chart screenshots for analysis, those images are sent to Anthropic's Claude API for processing. Images are used solely to generate your session plan and are not stored on our servers after analysis is complete. Anthropic's data handling is governed by their own privacy policy at anthropic.com/privacy." },
    { title: "5. Payment Processing", body: "All payments are processed by Stripe, Inc. OmniUSD does not store credit card numbers or payment details. When you subscribe, Stripe creates a customer record linked to your account. Your billing information is governed by Stripe's privacy policy at stripe.com/privacy." },
    { title: "6. Data Storage", body: "Your account data is stored on Supabase, a secure cloud database provider. Data is stored in the United States. We retain your account data for as long as your account is active. You may request deletion of your account and data at any time from Settings or by emailing support@omniusd.pro." },
    { title: "7. Cookies and Local Storage", body: "OmniUSD uses browser local storage to maintain your login session and save your active trading session between page visits. We do not use tracking cookies or third-party advertising cookies." },
    { title: "8. Your Rights", bullets: ["Access the personal data we hold about you", "Request correction of inaccurate data", "Request deletion of your account and associated data", "Export your data", "Withdraw consent at any time by cancelling your subscription and deleting your account"] },
    { title: "9. Children", body: "OmniUSD is not intended for users under the age of 18. We do not knowingly collect personal information from minors." },
    { title: "10. Changes to This Policy", body: "We may update this Privacy Policy from time to time. We will notify you of material changes by email or by displaying a notice on the platform. Continued use of OmniUSD after changes constitutes acceptance of the updated policy." },
    { title: "11. Contact", body: "For privacy-related questions or requests, contact us at: support@omniusd.pro" },
  ];

  const termsSections = [
    { title: "1. Acceptance of Terms", body: "By accessing or using OmniUSD (omniusd.pro), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the service." },
    { title: "2. Not Financial Advice", body: "IMPORTANT: OmniUSD is an execution framework and educational tool, not a financial advisory service. Analysis generated by OmniUSD is based on price action patterns and should not be construed as a guarantee of future performance. All trading decisions are made solely by you. Trading financial instruments involves significant risk of loss, including the potential loss of all invested capital. By using OmniUSD, you acknowledge that you trade entirely at your own risk." },
    { title: "3. Eligibility", body: "You must be at least 18 years old to use OmniUSD. By creating an account, you represent that you are of legal age and have the legal capacity to enter into these terms." },
    { title: "4. Account Responsibilities", bullets: ["Maintaining the confidentiality of your account credentials", "All activity that occurs under your account", "Ensuring your account information is accurate and up to date", "Notifying us immediately of any unauthorized use at support@omniusd.pro", "You may not share your account with others or use another person's account"] },
    { title: "5. Subscription and Billing", body: "OmniUSD is a paid subscription service. Subscriptions renew automatically unless cancelled before the renewal date. You may cancel at any time through the Settings page — access continues until the end of your paid period. Refunds are handled at our discretion. Contact support@omniusd.pro for refund requests. We reserve the right to change pricing with 30 days notice to active subscribers. All payments are processed by Stripe." },
    { title: "6. Fair Use and Abuse", body: "OmniUSD enforces usage limits to maintain service quality: Starter 3 analyses/day, Pro 5/day, Elite 10/day. A 2-hour cooldown applies per instrument per session. A 30-message limit applies per live session. Attempts to circumvent these limits may result in account suspension." },
    { title: "7. Acceptable Use", bullets: ["Use OmniUSD for any unlawful purpose", "Attempt to reverse engineer, scrape, or copy the platform or its methodology", "Share, resell, or redistribute session plans or analysis outputs commercially", "Impersonate another user or provide false information", "Attempt to gain unauthorized access to any part of the service"] },
    { title: "8. Intellectual Property", body: "All content, methodology, branding, and code comprising OmniUSD is the property of OmniUSD and its operators. The BRC execution framework as implemented in OmniUSD is proprietary. You are granted a limited, non-exclusive, non-transferable license to use OmniUSD for personal trading analysis only." },
    { title: "9. Disclaimer of Warranties", body: "OmniUSD is provided as-is without warranty of any kind. We do not warrant that the service will be uninterrupted, error-free, or that analysis will be accurate or profitable. To the fullest extent permitted by law, OmniUSD disclaims all warranties, express or implied." },
    { title: "10. Limitation of Liability", body: "To the fullest extent permitted by law, OmniUSD and its operators shall not be liable for any trading losses incurred using analysis from OmniUSD, indirect or consequential damages, or loss of profits or data. In no event shall our liability exceed the amount you paid for the service in the 3 months preceding the claim." },
    { title: "11. Termination", body: "We reserve the right to suspend or terminate your account at any time for violation of these terms or abuse of the service. You may delete your account at any time from Settings." },
    { title: "12. Governing Law", body: "These Terms are governed by the laws of the United States. Any disputes shall be resolved through binding arbitration rather than in court, except where prohibited by law." },
    { title: "13. Changes to Terms", body: "We may update these Terms at any time. Material changes will be communicated via email or in-app notice. Continued use of OmniUSD after changes constitutes acceptance." },
    { title: "14. Contact", body: "For questions about these Terms: support@omniusd.pro — omniusd.pro" },
  ];

  const sections = isPrivacy ? privacySections : termsSections;
  const title = isPrivacy ? "Privacy Policy" : "Terms of Service";

  return (
    <div style={{ minHeight:"100vh", background:"#1e1a35", color:"#f0ecff", fontFamily:"'Space Mono',monospace" }}>
      <div style={{ position:"fixed", inset:0, backgroundImage:"linear-gradient(rgba(255,107,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,255,0.025) 1px,transparent 1px)", backgroundSize:"48px 48px", pointerEvents:"none" }}/>
      <div style={{ maxWidth:720, margin:"0 auto", padding:"48px 24px 80px", position:"relative", zIndex:1 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", color:"rgba(255,107,255,0.6)", cursor:"pointer", fontFamily:"inherit", fontSize:14, marginBottom:32, letterSpacing:"0.08em" }}>
          {"← Back"}
        </button>
        <div style={{ fontSize:13, color:"rgba(255,107,255,0.6)", letterSpacing:"0.2em", marginBottom:12 }}>LEGAL</div>
        <h1 style={{ fontSize:28, fontWeight:700, marginBottom:8, letterSpacing:"-0.01em" }}>{title}</h1>
        <div style={{ fontSize:13, color:"rgba(255,255,255,0.75)", marginBottom:40 }}>Last updated: March 2026</div>

        {sections.map((section, i) => (
          <div key={i} style={{ marginBottom:32 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#ff6bff", marginBottom:10, letterSpacing:"0.04em" }}>{section.title}</div>
            {section.body && (
              <div style={{ fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:2 }}>{section.body}</div>
            )}
            {section.bullets && (
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:4 }}>
                {section.bullets.map((b, j) => (
                  <div key={j} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                    <span style={{ color:"#ff6bff", flexShrink:0, marginTop:2 }}>-</span>
                    <span style={{ fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:1.8 }}>{b}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:24, fontSize:13, color:"rgba(255,255,255,0.80)", lineHeight:1.8 }}>
          {`© ${new Date().getFullYear()} OmniUSD · Questions? Email support@omniusd.pro`}
        </div>
      </div>
    </div>
  );
}

function PrivacyPolicyPage({ onBack }) {
  return <LegalPage onBack={onBack} type="privacy" />;
}

function TermsOfServicePage({ onBack }) {
  return <LegalPage onBack={onBack} type="terms" />;
}

function PricingPage({onBack, onPaid}){
  const [selected,setSelected]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);

  const plans=[
    {key:"starter", label:"Starter", price:"$29", period:"/month", color:"#ffd166",
     instruments:["XAUUSD","BTCUSD"],
     features:["Full BRC 3-phase execution tracker","Session-aware guidance","AI session plans"],
     priceId:TIER_CONFIG.starter.priceId, popular:false},
    {key:"pro",     label:"Pro",     price:"$39", period:"/month", color:"#00e5ff",
     instruments:["XAUUSD","BTCUSD","NAS100","US30"],
     features:["Full BRC 3-phase execution tracker","Session-aware guidance","AI session plans","Priority access to new features"],
     priceId:TIER_CONFIG.pro.priceId, popular:true},
    {key:"elite",   label:"Elite",   price:"$59", period:"/month", color:"#ff6bff",
     instruments:["XAUUSD","BTCUSD","NAS100","US30","USOIL","US500"],
     features:["Full BRC 3-phase execution tracker","Session-aware guidance","AI session plans","Early access to all new features"],
     priceId:TIER_CONFIG.elite.priceId, popular:false},
  ];

  async function handleCheckout(){
    if(!selected){setError("Select a plan to continue.");return;}
    setLoading(true);setError(null);
    try{
      const plan=plans.find(p=>p.key===selected);
      const res=await fetch("/api/create-checkout",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          priceId:plan.priceId,
          tier:selected,
          successUrl:`https://omniusd.pro/?payment=success&tier=${selected}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl:`https://omniusd.pro/?payment=cancel`,
        }),
      });
      const data=await res.json();
      if(!res.ok||data.error){setError(data.error||"Checkout failed.");setLoading(false);return;}
      window.location.href=data.url;
    }catch(e){
      setError("Connection error. Please try again.");
      setLoading(false);
    }
  }

  return(
    <div style={{minHeight:"100vh",background:"#1e1a35",color:"#f4f0ff",fontFamily:"'Syne',sans-serif",position:"relative",overflowX:"hidden"}}>
      <div style={{position:"fixed",inset:0,backgroundImage:"linear-gradient(rgba(255,107,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,255,0.025) 1px,transparent 1px)",backgroundSize:"48px 48px",pointerEvents:"none"}}/>
      <div style={{position:"fixed",width:500,height:500,borderRadius:"50%",background:"#7b2fff",top:-150,left:"50%",transform:"translateX(-50%)",filter:"blur(120px)",opacity:0.12,pointerEvents:"none"}}/>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap');`}</style>

      {/* Nav */}
      <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 32px",height:64,background:"rgba(19,13,34,0.9)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,107,255,0.1)"}}>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
          <OmniLogo size={32} />
          <span style={{fontFamily:"'Space Mono',monospace",fontSize:15,fontWeight:700,letterSpacing:"0.1em",background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>OmniUSD</span>
        </button>
        <button onClick={onBack} style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:"#8878aa",background:"none",border:"none",cursor:"pointer"}}>
          ← Back
        </button>
      </nav>

      {/* Content */}
      <div style={{position:"relative",zIndex:1,maxWidth:1000,margin:"0 auto",padding:"100px 24px 80px"}}>
        <div style={{textAlign:"center",marginBottom:52}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.22em",color:"#ff6bff",marginBottom:16}}>CHOOSE YOUR PLAN</div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(32px,5vw,52px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-0.02em",marginBottom:12}}>
            Select your access level
          </h1>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#8878aa",lineHeight:1.7,maxWidth:480,margin:"0 auto"}}>
            Every plan includes the BRC execution tracker, session-aware guidance, and AI session plans.
          </p>
        </div>

        {/* Plan cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,marginBottom:32}}>
          {plans.map(p=>{
            const isSel=selected===p.key;
            return(
              <div key={p.key} onClick={()=>setSelected(p.key)}
                style={{position:"relative",cursor:"pointer",
                  background:isSel?`${p.color}0e`:"rgba(255,255,255,0.03)",
                  border:`${isSel?"2":"1"}px solid ${isSel?p.color+"80":"rgba(255,255,255,0.08)"}`,
                  borderRadius:16,padding:"32px 28px",
                  transition:"all 0.2s",
                  transform:isSel?"translateY(-3px)":"none",
                  boxShadow:isSel?`0 8px 40px ${p.color}18`:undefined}}>
                {p.popular&&(
                  <div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",
                    fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.12em",
                    color:"#0d0718",background:"#ff6bff",padding:"3px 14px",borderRadius:100,whiteSpace:"nowrap"}}>
                    MOST POPULAR
                  </div>
                )}
                {isSel&&(
                  <div style={{position:"absolute",top:14,right:14,width:22,height:22,borderRadius:"50%",
                    background:p.color,display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:14,color:"#0d0718",fontWeight:900}}>✓</div>
                )}
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.16em",color:p.color,marginBottom:12}}>{p.label.toUpperCase()}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:40,fontWeight:800,color:p.color,lineHeight:1,marginBottom:4}}>{p.price}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#8878aa",marginBottom:20}}>{p.period}</div>
                <div style={{height:1,background:"rgba(255,255,255,0.07)",marginBottom:18}}/>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:0}}>
                  {p.instruments.map(ins=>(
                    <div key={ins} style={{display:"flex",alignItems:"center",gap:8,fontFamily:"'Space Mono',monospace",fontSize:14,color:"#ccc4e8"}}>
                      <span style={{color:"#7fff6b",fontWeight:900}}>✓</span>{ins}
                    </div>
                  ))}
                  {p.features.map(f=>(
                    <div key={f} style={{display:"flex",alignItems:"center",gap:8,fontFamily:"'Space Mono',monospace",fontSize:14,color:"#8878aa"}}>
                      <span style={{color:"#8878aa"}}>·</span>{f}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error&&(
          <div style={{textAlign:"center",marginBottom:16,fontFamily:"'Space Mono',monospace",fontSize:14,color:"#ff8080",
            background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.2)",borderRadius:8,padding:"10px"}}>
            {error}
          </div>
        )}

        {/* CTA */}
        <div style={{textAlign:"center"}}>
          <button onClick={handleCheckout} disabled={loading||!selected}
            style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,letterSpacing:"0.12em",
              color:(!selected||loading)?"#8878aa":"#0d0718",
              background:(!selected||loading)?"rgba(255,255,255,0.06)":"linear-gradient(135deg,#ff6bff,#7b2fff)",
              border:"none",padding:"17px 52px",borderRadius:12,cursor:(!selected||loading)?"not-allowed":"pointer",
              boxShadow:selected&&!loading?"0 4px 28px rgba(255,107,255,0.25)":"none",
              transition:"all 0.2s",marginBottom:14}}>
            {loading?"Setting up checkout..."
              :!selected?"Select a plan above"
              :"CONTINUE TO PAYMENT →"}
          </button>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#8878aa"}}>
            Paid plans start at $29/month · Secure checkout via Stripe · Cancel anytime
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LANDING PAGE
// ═══════════════════════════════════════════════════════════════════════════
function FaqRow({q, a, isLast}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.06)"}}>
      <button onClick={() => setOpen(o => !o)}
        style={{width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"20px 28px", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", textAlign:"left", gap:16}}>
        <span style={{fontFamily:"'Space Mono',monospace", fontSize:14, fontWeight:700, color:"#f0ecff", lineHeight:1.4}}>{q}</span>
        <span style={{fontSize:16, color:"#ff6bff", flexShrink:0, transition:"transform 0.2s", transform: open ? "rotate(45deg)" : "rotate(0deg)", display:"inline-block"}}>+</span>
      </button>
      {open && (
        <div style={{padding:"0 28px 20px"}}>
          {a.split("\n\n").map((para,i) => (
            <p key={i} style={{fontFamily:"'Space Mono',monospace", fontSize:14, color:"rgba(255,255,255,0.85)", lineHeight:1.9, margin:i>0?"12px 0 0":0}}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function LandingPage({onEnterApp, onLogin, onPrivacy, onTerms}){
  const [hoveredPlan,setHoveredPlan]=useState(null);
  const isMobile = useWindowWidth() <= 768;
  const plans=[
    {tier:"STARTER",color:"#ffd166",price:"$29",instruments:["XAUUSD","BTCUSD"],popular:false},
    {tier:"PRO",color:"#00e5ff",price:"$39",instruments:["XAUUSD","BTCUSD","NAS100","US30"],popular:true},
    {tier:"ELITE",color:"#ff6bff",price:"$59",instruments:["XAUUSD","BTCUSD","NAS100","US30","USOIL","US500"],popular:false},
  ];
  const steps=[
    {n:"01",title:"Upload 5 charts",desc:"Daily · 4H · 1H · 30M · 15M. BRC needs all five to grade the setup correctly."},
    {n:"02",title:"Get your plan",desc:"Grade. Bias. Trigger. Retest zone. Stop. TP1. TP2. Runner. Size. From your actual charts."},
    {n:"03",title:"Execute the phases",desc:"Phase 1 confirms the break. Phase 2 confirms the retest. Phase 3 is the green light."},
  ];
  const features=[
    {icon:"🧠",title:"BRC Execution Logic",desc:"Break sets direction. Retest confirms the level. Continuation unlocks execution. The system enforces all three."},
    {icon:"🔒",title:"Phase-Locked Execution",desc:"You cannot advance to Phase 3 without completing Phase 2. Discipline enforced at the UI level."},
    {icon:"☑️",title:"Wick Protection Gate",desc:"Three confirmations before Phase 1 advances. The most common entry mistake — eliminated."},
    {icon:"📡",title:"Session-Aware Guidance",desc:"NY, London, Asia, London-NY Overlap. The tracker adjusts guidance based on your session."},
    {icon:"📲",title:"Pre-Built Alert Setup",desc:"Break alert. Retest zone. Invalidation level. Copy them into TradingView before the session opens."},
    {icon:"🚫",title:"PASS Mode",desc:"When there is no setup, the app says so and hides all execution UI. No ambiguity. No temptation."},
  ];

  return(
    <div style={{background:"#0e0920",color:"#f4f0ff",fontFamily:"'Syne',sans-serif",minHeight:"100vh",overflowX:"hidden",position:"relative"}}>

      {/* Grid bg */}
      <div style={{position:"fixed",inset:0,backgroundImage:"linear-gradient(rgba(255,107,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,255,0.025) 1px,transparent 1px)",backgroundSize:"48px 48px",pointerEvents:"none",zIndex:0}}/>

      {/* Orbs */}
      <div style={{position:"fixed",width:600,height:600,borderRadius:"50%",background:"#7b2fff",top:-200,left:-200,filter:"blur(120px)",opacity:0.18,pointerEvents:"none",zIndex:0,animation:"orbFloat 12s ease-in-out infinite alternate"}}/>
      <div style={{position:"fixed",width:400,height:400,borderRadius:"50%",background:"#00e5ff",bottom:-100,right:-100,filter:"blur(120px)",opacity:0.15,pointerEvents:"none",zIndex:0,animation:"orbFloat 15s ease-in-out infinite alternate-reverse"}}/>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700;800&display=swap');
        @keyframes orbFloat { from{transform:translate(0,0) scale(1)} to{transform:translate(30px,20px) scale(1.05)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .land-fade { animation: fadeUp 0.6s ease both; }
      `}</style>

      {/* Nav */}
      <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 16px",height:64,background:"rgba(7,4,15,0.88)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,107,255,0.1)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <OmniLogo size={36} />
          <span style={{fontFamily:"'Space Mono',monospace",fontSize:16,fontWeight:700,letterSpacing:"0.12em",background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>OmniUSD</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onLogin||onEnterApp} style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.1em",color:"var(--muted,#ccc4e8)",background:"none",border:"none",cursor:"pointer",padding:"8px 14px"}}>LOG IN</button>
          <button onClick={onEnterApp}
            style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.1em",color:"#1e1a35",background:"#ff6bff",border:"none",padding:"9px 18px",borderRadius:6,cursor:"pointer",transition:"all 0.2s"}}>
            CREATE ACCOUNT
          </button>
        </div>
      </nav>

      {/* Sticky section nav — second row */}
      <div style={{position:"fixed",top:64,left:0,right:0,zIndex:99,background:"rgba(7,4,15,0.95)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.06)",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{display:"flex",alignItems:"center",padding:"0 40px",height:40,gap:0,minWidth:"max-content"}}>
          {[
            {label:"Overview",    href:"#overview"},
            {label:"How It Works",href:"#how-it-works"},
            {label:"Live Session",href:"#live-session"},
            {label:"Why It Works",href:"#why-it-works"},
            {label:"Why OmniUSD", href:"#why-omniusd"},
            {label:"Pricing",     href:"#pricing"},
            {label:"FAQ",         href:"#faq"},
            {label:"Results",     href:"#results"},
          ].map((item,i)=>(
            <a key={item.label} href={item.href}
              style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.08em",color:"rgba(255,255,255,0.85)",textDecoration:"none",padding:"0 14px",height:40,display:"flex",alignItems:"center",borderRight:"1px solid rgba(255,255,255,0.05)",whiteSpace:"nowrap",transition:"color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.color="#ff6bff"}
              onMouseLeave={e=>e.currentTarget.style.color="rgba(255,255,255,0.85)"}>
              {item.label}
            </a>
          ))}
        </div>
      </div>

      {/* Hero — full width headline + mockup right */}
      <section id="overview" style={{position:"relative",zIndex:1,paddingTop:120,scrollMarginTop:110}}>

        {/* Hero — two column: headline left, mockup right */}
        <div style={{maxWidth:1100,margin:"0 auto",padding:"64px 40px 0",maxWidth:640}}>

          {/* Left — headline + steps + CTA */}
          <div>
            <div className="land-fade" style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.8)",letterSpacing:"0.22em",marginBottom:20}}>BUILT FOR THE NEW YORK SESSION</div>
            <h1 className="land-fade" style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(30px,4vw,50px)",fontWeight:800,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:18,animationDelay:"0.1s"}}>
              <span style={{display:"block",color:"#f4f0ff"}}>Stop reacting.</span>
              <span style={{display:"block",background:"linear-gradient(135deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Start executing.</span>
            </h1>
            <p className="land-fade" style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.85)",lineHeight:1.7,maxWidth:520,marginBottom:32,animationDelay:"0.2s",fontWeight:700}}>
              Upload 5 charts. Get a locked BRC plan. Execute with precision during the only window that matters — 8:30 to 10:30 AM CT.
            </p>
            <div className="land-fade" style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:44,animationDelay:"0.3s"}}>
              <button onClick={onEnterApp}
                style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,letterSpacing:"0.1em",color:"#fff",background:"linear-gradient(135deg,#ff6bff,#7b2fff)",border:"none",padding:"12px 24px",borderRadius:7,cursor:"pointer",boxShadow:"0 0 32px rgba(255,107,255,0.25)",transition:"all 0.2s"}}>
                CHOOSE YOUR PLAN →
              </button>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.38)"}}>From $29/month</span>
            </div>

            {/* 3-step product loop */}
            <div className="land-fade" style={{display:"flex",flexDirection:"column",gap:0,border:"1px solid rgba(255,255,255,0.07)",borderRadius:10,overflow:"hidden",animationDelay:"0.4s"}}>
              {[
                {n:"1",title:"Upload 5 charts before 8:30 AM CT",sub:"Daily · 4H · 1H · 30M · 15M. Pre-market scouting from 7:00 AM CT.",color:"#00e5ff"},
                {n:"2",title:"Get your locked NY session plan",sub:"Grade, bias, key levels, trigger, stops, and targets — built for the 8:30–10:30 AM CT window.",color:"#7fff6b"},
                {n:"3",title:"Execute candle by candle in NY session",sub:"OmniUSD tells you what to watch at 9:00 AM, 9:30 AM, and 10:00 AM CT. When a tier confirms — it tells you to act.",color:"#ff6bff"},
              ].map((r,i)=>(
                <div key={r.n} style={{display:"flex",alignItems:"flex-start",gap:14,padding:"14px 18px",background:i%2===0?"rgba(255,255,255,0.02)":"transparent",borderBottom:i<2?"1px solid rgba(255,255,255,0.06)":"none"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:`${r.color}18`,border:`1px solid ${r.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:r.color,flexShrink:0,marginTop:1}}>{r.n}</div>
                  <div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:"#f0ecff",marginBottom:3}}>{r.title}</div>
                    <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.85)",lineHeight:1.6}}>{r.sub}</div>
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>

      </section>

      {/* Live Session Mode section */}
      <div id="live-session" style={{position:"relative",zIndex:1,scrollMarginTop:110,maxWidth:1060,margin:"0 auto",padding:isMobile?"48px 16px 0":"80px 24px 0"}}>
        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(255,107,255,0.15),transparent)",marginBottom:64}}/>

        {/* Section header */}
        <div style={{marginBottom:40}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,107,255,0.7)",letterSpacing:"0.22em",marginBottom:16}}>LIVE SESSION MODE</div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(24px,3.5vw,40px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-0.02em",color:"#f0ecff",marginBottom:14}}>
            When the session starts,<br/>this is your screen.
          </h2>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.75)",lineHeight:1.9,maxWidth:520,margin:0}}>
            OmniUSD doesn't just generate a plan. It guides you through the NY session candle by candle — showing exactly when to wait, when a 30M close counts, and when execution becomes valid during the highest conviction window in the market.
          </p>
        </div>

        {/* App mockup — Tier 1 confirmed, watching for Tier 2 */}
        <div style={{background:"#130d22",borderRadius:12,overflow:"hidden",border:"1px solid rgba(255,255,255,0.08)",boxShadow:"0 32px 80px rgba(0,0,0,0.5)"}}>

          {/* Nav bar */}
          <div style={{padding:"10px 16px",background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:"#ff6bff"}}>◈ OmniUSD</span>
              {[{l:"BTCUSD",c:"#ff6b6b"},{l:"SHORT",c:"#ff6b6b"},{l:"A+",c:"#7fff6b"}].map(b=>(
                <span key={b.l} style={{fontFamily:"'Space Mono',monospace",fontSize:13,padding:"2px 7px",borderRadius:4,background:`${b.c}14`,border:`1px solid ${b.c}33`,color:b.c}}>{b.l}</span>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:"#7fff6b"}}/>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#7fff6b",fontWeight:700}}>OPEN</span>
            </div>
          </div>

          {/* Progress strip — simplified on mobile */}
          <div style={{padding:"0 16px",height:36,borderBottom:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.01)",overflowX:"auto"}}>
            <div style={{display:"flex",alignItems:"center",flexShrink:0}}>
              {[
                {l:"Break",done:true},
                {l:"Tier 1",done:true},
                {l:"Tier 2",done:false,active:true},
                {l:"Limit Order",done:false},
              ].map((t,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center"}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:t.done?"#7fff6b":t.active?"#00e5ff":"rgba(255,255,255,0.15)",boxShadow:t.active?"0 0 8px rgba(0,229,255,0.5)":"none",flexShrink:0}}/>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:t.done?"#7fff6b":t.active?"#00e5ff":"rgba(255,255,255,0.80)",margin:"0 5px",whiteSpace:"nowrap"}}>{t.l}</span>
                  {i<3&&<div style={{width:14,height:1,background:t.done?"#7fff6b":"rgba(255,255,255,0.08)",marginRight:3,flexShrink:0}}/>}
                </div>
              ))}
            </div>
            <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#00e5ff",fontWeight:700,flexShrink:0,marginLeft:8}}>9:32 AM CT</span>
          </div>

          {/* Body — stack on mobile */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"300px 1fr"}}>

            {/* Left — status + key levels — hidden on small mobile, shown on tablet+ */}
            {!isMobile && (
              <div style={{borderRight:"1px solid rgba(255,255,255,0.05)",padding:"16px"}}>
                <div style={{padding:"10px 12px",background:"rgba(255,209,102,0.06)",border:"1px solid rgba(255,209,102,0.2)",borderLeft:"3px solid #ffd166",borderRadius:0,marginBottom:14}}>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:8,color:"#ffd166",letterSpacing:"0.14em",fontWeight:700,marginBottom:5}}>CURRENT STATUS</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#f0ecff",lineHeight:1.5,fontWeight:700}}>Tier 1 confirmed.</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,209,102,0.7)",marginTop:3,lineHeight:1.5}}>Watching for second close below 70,200.</div>
                </div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:8,color:"rgba(255,255,255,0.38)",letterSpacing:"0.14em",marginBottom:8}}>LOCKED PLAN</div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {[{l:"Trigger",v:"70,200",c:"#ffd166"},{l:"Stop",v:"71,000",c:"#ff6b6b"},{l:"TP1",v:"69,200",c:"#7fff6b"}].map((r,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:i<2?7:0,borderBottom:i<2?"1px solid rgba(255,255,255,0.05)":"none"}}>
                      <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.85)"}}>{r.l}</span>
                      <span style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:r.c}}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Right — chat */}
            <div style={{display:"flex",flexDirection:"column"}}>
              {/* On mobile show a compact status bar */}
              {isMobile && (
                <div style={{padding:"10px 14px",background:"rgba(255,209,102,0.05)",borderBottom:"1px solid rgba(255,209,102,0.15)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#ffd166",fontWeight:700}}>Tier 1 confirmed — watching Tier 2</span>
                  <div style={{display:"flex",gap:10}}>
                    {[{l:"Trigger",v:"70,200",c:"#ffd166"},{l:"Stop",v:"71,000",c:"#ff6b6b"}].map(r=>(
                      <div key={r.l} style={{textAlign:"center"}}>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:7,color:"rgba(255,255,255,0.75)"}}>{r.l}</div>
                        <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:r.c}}>{r.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",justifyContent:"flex-start"}}>
                  <div style={{maxWidth:"90%",padding:"9px 12px",borderRadius:"10px 10px 10px 3px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",fontFamily:"'Space Mono',monospace",fontSize:13,color:"#ccc4e8",lineHeight:1.8}}>
                    Live session active — BTCUSD SHORT.<br/>
                    <span style={{color:"#00e5ff"}}>Wicks don't count. Only 30M closes trigger action.</span>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"flex-end"}}>
                  <div style={{maxWidth:"65%",padding:"9px 12px",borderRadius:"10px 10px 3px 10px",background:"rgba(255,107,255,0.08)",border:"1px solid rgba(255,107,255,0.18)",fontFamily:"'Space Mono',monospace",fontSize:13,color:"#f0ecff"}}>
                    9:30 AM closed at 69,858
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"flex-start"}}>
                  <div style={{maxWidth:"90%",padding:"9px 12px",borderRadius:"10px 10px 10px 3px",background:"rgba(255,209,102,0.05)",border:"1px solid rgba(255,209,102,0.15)",fontFamily:"'Space Mono',monospace",fontSize:13,color:"#ccc4e8",lineHeight:1.8}}>
                    <span style={{color:"#ffd166",fontWeight:700}}>Tier 1 confirmed — 69,858.</span>{isMobile ? " Watching 10:00 AM candle." : " Strong close, $342 below 70,200. Now watching the 10:00 AM candle."}
                  </div>
                </div>
              </div>
              <div style={{padding:"8px 14px 12px",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",gap:7}}>
                <div style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"7px 11px",fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.80)"}}>What did the 10:00 AM candle close at?</div>
                <div style={{padding:"7px 14px",borderRadius:7,background:"rgba(255,107,255,0.14)",border:"1px solid rgba(255,107,255,0.3)",fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:"#ff6bff",whiteSpace:"nowrap"}}>SEND →</div>
              </div>
            </div>

          </div>
        </div>
      </div>

      <section style={{position:"relative",zIndex:1,paddingTop:0}}>

        {/* Info row */}
        <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",borderBottom:"1px solid rgba(255,255,255,0.06)",marginTop:64,display:"grid",gridTemplateColumns:"1fr 1fr"}}>
          {[
            {val:"A+ only",desc:"The only grade that unlocks execution. All others show PASS."},
            {val:"30M closes",desc:"Wicks don't trigger. Only full candle closes count."},
            {val:"3 phases",desc:"Break. Retest. Continuation. Every trade. Every time."},
            {val:"0 signals",desc:"No alerts. No predictions. Structure only."},
          ].map((r,i)=>(
            <div key={i} style={{padding:"22px 32px",borderRight:i<3?"1px solid rgba(255,255,255,0.06)":"none"}}>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:17,fontWeight:700,color:"#ffffff",marginBottom:6}}>{r.val}</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.85)",lineHeight:1.7}}>{r.desc}</div>
            </div>
          ))}
        </div>

      </section>

      {/* Why This System Works */}
      <div id="why-it-works" style={{position:"relative",zIndex:1,scrollMarginTop:110,maxWidth:1060,margin:"0 auto",padding:isMobile?"48px 16px 0":"80px 24px 0"}}>
        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(255,107,255,0.15),transparent)",marginBottom:64}}/>

        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:isMobile?32:64,alignItems:"start"}}>

          {/* Left — headline */}
          <div style={{position:isMobile?"static":"sticky",top:100}}>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,107,255,0.7)",letterSpacing:"0.22em",marginBottom:16}}>THE METHODOLOGY</div>
            <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(26px,3.5vw,42px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-0.02em",color:"#f0ecff",marginBottom:16}}>
              Why this<br/>system works.
            </h2>
            <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.85)",lineHeight:1.9,maxWidth:340,marginBottom:16}}>
              Every rule exists because someone broke it and lost money during the NY session. These aren't guidelines. They are the system.
            </p>
            <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.38)",lineHeight:1.9,maxWidth:340}}>
              The system is strict on purpose. Every rule exists to stop avoidable mistakes before they become losses.
            </p>
          </div>

          {/* Right — numbered rules */}
          <div style={{display:"flex",flexDirection:"column",gap:0}}>
            {[
              {
                n:"01",
                rule:"The Daily is the General.",
                detail:"The fastest way to lose is to trade against the Daily trend. This rule removes that mistake.",
                color:"#00e5ff",
              },
              {
                n:"02",
                rule:"The 30M close is the only trigger.",
                detail:"Not a wick. Not a move. The full candle must close beyond the level. This one rule cuts out one of the most common amateur mistakes.",
                color:"#ffd166",
              },
              {
                n:"03",
                rule:"All three phases must confirm.",
                detail:"Break. Retest. Continuation. If any one is missing, there is no trade. If the sequence is broken, the setup is not real.",
                color:"#7fff6b",
              },
              {
                n:"04",
                rule:"Limit orders only. Never chase.",
                detail:"The order is placed at the retest zone and either fills or it doesn't. If price runs without retesting — you are protected, not missing out.",
                color:"#ff6bff",
              },
              {
                n:"05",
                rule:"NY session only. 8:30 to 10:30 AM CT.",
                detail:"OmniUSD doesn't trade every session. It trades the right one. The New York open is where institutional money is fully active and BRC setups have real follow-through.",
                color:"#ff9a3c",
              },
              {
                n:"06",
                rule:"A+ setups only. Six quality NY sessions per month.",
                detail:"Not thirty random trades across every session. Six clean A+ setups during NY open. Quality over quantity is what compounds a trading account.",
                color:"#00e5ff",
              },
            ].map((r,i)=>(
              <div key={i} style={{
                display:"flex",
                gap:20,
                padding:"24px 0",
                borderBottom:i<5?"1px solid rgba(255,255,255,0.06)":"none",
              }}>
                <span style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:r.color,opacity:0.5,flexShrink:0,marginTop:3,letterSpacing:"0.05em",minWidth:28}}>{r.n}</span>
                <div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:800,color:"#f0ecff",marginBottom:8,lineHeight:1.2}}>{r.rule}</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.75)",lineHeight:1.8}}>{r.detail}</div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Why Traders Use OmniUSD */}
      <div id="why-omniusd" style={{position:"relative",zIndex:1,scrollMarginTop:110,maxWidth:1060,margin:"0 auto",padding:isMobile?"48px 16px 0":"80px 24px 0"}}>
        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(255,107,255,0.15),transparent)",marginBottom:64}}/>

        <div style={{marginBottom:48}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,107,255,0.7)",letterSpacing:"0.22em",marginBottom:14}}>WHY TRADERS USE OMNIUSD</div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(20px,2.8vw,34px)",fontWeight:800,lineHeight:1.15,letterSpacing:"-0.02em",color:"#f0ecff",maxWidth:520}}>
            The methodology is yours.<br/>The execution is where it breaks down.
          </h2>
        </div>

        {/* 4 main cards — 2x2 grid */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:2,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,overflow:"hidden",marginBottom:2}}>
          {[
            {
              n:"01",
              title:"You know the rules. You still break them.",
              body:"Knowing BRC is one skill. Executing it under NY session pressure is another. OmniUSD is built for the second one.",
              color:"#ff6bff",
            },
            {
              n:"02",
              title:"The hardest part is not the analysis. It is the wait.",
              body:"Most traders lose discipline between 8:30 and the confirmation close. OmniUSD gives that wait structure — candle by candle — until the signal is valid.",
              color:"#00e5ff",
            },
            {
              n:"03",
              title:"You stop second-guessing at the worst moment.",
              body:"When price starts moving, doubt shows up fast. A locked plan with live session guidance removes decision fatigue when execution matters most.",
              color:"#ffd166",
            },
            {
              n:"04",
              title:"You trade A+ setups only — not boredom trades.",
              body:"OmniUSD does not let a B-grade setup get treated like an A+. The grade is locked. The rules are visible. The session stays honest.",
              color:"#7fff6b",
            },
          ].map((r,i)=>(
            <div key={i} style={{
              padding:"28px 32px",
              background:"rgba(255,255,255,0.01)",
              borderRight:i%2===0?"1px solid rgba(255,255,255,0.06)":"none",
              borderBottom:i<2?"1px solid rgba(255,255,255,0.06)":"none",
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:r.color,opacity:0.5,letterSpacing:"0.08em"}}>{r.n}</span>
                <div style={{flex:1,height:1,background:`${r.color}18`}}/>
              </div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:16,fontWeight:800,color:"#f0ecff",marginBottom:9,lineHeight:1.25}}>{r.title}</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.62)",lineHeight:1.8}}>{r.body}</div>
            </div>
          ))}
        </div>

        {/* Full-width closing statement */}
        <div style={{padding:"30px 32px",background:"rgba(255,107,255,0.04)",border:"1px solid rgba(255,107,255,0.12)",borderTop:"none",borderRadius:"0 0 16px 16px",display:"flex",alignItems:isMobile?"flex-start":"center",flexDirection:isMobile?"column":"row",justifyContent:"space-between",gap:16}}>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.85)",lineHeight:1.8,margin:0,maxWidth:640}}>
            OmniUSD is precision built for the NY session — the highest conviction, highest volume, most institutionally driven window in the entire market. We don't trade every session. We trade the right one.
          </p>
          <div style={{display:"flex",gap:16,flexShrink:0}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:"#ff9a3c",marginBottom:3}}>NY session only</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:8,color:"rgba(255,255,255,0.85)",letterSpacing:"0.08em"}}>8:30–10:30 AM CT</div>
            </div>
            <div style={{width:1,background:"rgba(255,255,255,0.08)"}}/>
            <div style={{textAlign:"center"}}>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:"#7fff6b",marginBottom:3}}>A+ only</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:8,color:"rgba(255,255,255,0.85)",letterSpacing:"0.08em"}}>Execution unlocks here</div>
            </div>
            <div style={{width:1,background:"rgba(255,255,255,0.08)"}}/>
            <div style={{textAlign:"center"}}>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:"#00e5ff",marginBottom:3}}>30M closes</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:8,color:"rgba(255,255,255,0.85)",letterSpacing:"0.08em"}}>No wick entries</div>
            </div>
          </div>
        </div>
      </div>

      {/* BRC Core Truth */}
      <div id="how-it-works" style={{position:"relative",zIndex:1,scrollMarginTop:110,maxWidth:1060,margin:"0 auto",padding:isMobile?"48px 16px":"80px 24px"}}>
        {/* Divider line */}
        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(255,107,255,0.2),transparent)",marginBottom:80}}/>

        <div style={{marginBottom:56}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.22em",color:"#ff6bff",marginBottom:20}}>THE BRC FRAMEWORK</div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(26px,4vw,46px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-0.02em",marginBottom:12}}>
            Break. Retest. Continuation.
          </h2>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.85)",lineHeight:1.8,maxWidth:480,margin:0}}>
            The sequence stays the same. The NY session is where it executes cleanest.
          </p>
        </div>

        {/* Three phases */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:2,background:"rgba(255,107,255,0.06)",border:"1px solid rgba(255,107,255,0.12)",borderRadius:16,overflow:"hidden",marginBottom:40}}>
          {[
            {
              phase:"B",
              name:"Break",
              color:"#00e5ff",
              meaning:"Price makes the first decisive move and breaks a key level.",
            },
            {
              phase:"R",
              name:"Retest",
              color:"#ffd166",
              meaning:"Price returns to the broken level. This is normal. This is where structure is tested.",
            },
            {
              phase:"C",
              name:"Continuation",
              color:"#7fff6b",
              meaning:"Price resumes in the original direction after the retest. This is where execution becomes valid.",
            },
          ].map((p,i)=>(
            <div key={i} style={{background:"#1a1535",padding:"36px 28px",position:"relative"}}>
              <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:20}}>
                <span style={{fontFamily:"'Syne',sans-serif",fontSize:56,fontWeight:800,lineHeight:1,color:p.color,opacity:0.25,letterSpacing:"-0.04em"}}>{p.phase}</span>
                <div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.18em",color:p.color,opacity:0.7,marginBottom:4}}>PHASE {i+1}</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:p.color}}>{p.name}</div>
                </div>
              </div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#ccc4e8",lineHeight:1.7}}>{p.meaning}</div>
            </div>
          ))}
        </div>

        {/* Truth callout */}
        <div style={{textAlign:"center",padding:"32px 40px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12}}>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#ccc4e8",lineHeight:1.9,maxWidth:640,margin:"0 auto"}}>
            They enter during the <span style={{color:"#ffd166",fontWeight:700}}>Retest</span> — confusing a pullback for the end of the move.<br/>
            <strong style={{color:"#f4f0ff",fontWeight:700}}>OmniUSD</strong> identifies where you are in the <span style={{color:"#00e5ff",fontWeight:700}}>Break</span> → <span style={{color:"#ffd166",fontWeight:700}}>Retest</span> → <span style={{color:"#7fff6b",fontWeight:700}}>Continuation</span> sequence<br/>and tells you exactly when execution is valid — and when it isn't.
          </p>
        </div>
      </div>


      {/* Social Proof */}
      <div id="results" style={{position:"relative",zIndex:1,scrollMarginTop:110,maxWidth:1060,margin:"0 auto",padding:isMobile?"48px 16px":"80px 24px"}}>
        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(255,107,255,0.15),transparent)",marginBottom:64}}/>

        {/* Header */}
        <div style={{textAlign:"center",marginBottom:56}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,107,255,0.7)",letterSpacing:"0.22em",marginBottom:14}}>SOCIAL PROOF</div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(22px,3vw,36px)",fontWeight:800,lineHeight:1.15,letterSpacing:"-0.02em",color:"#f0ecff",marginBottom:16}}>
            Real traders. Real sessions.
          </h2>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.85)",maxWidth:480,margin:"0 auto",lineHeight:1.8}}>
            Results from traders using the BRC execution system on OmniUSD.
          </p>
        </div>

        {/* Trade results ticker */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",marginBottom:56}}>
          {[
            {instr:"BTCUSD",dir:"LONG",grade:"A+",result:"+2.7R",date:"Mar 18"},
            {instr:"XAUUSD",dir:"SHORT",grade:"A+",result:"+2.1R",date:"Mar 14"},
            {instr:"BTCUSD",dir:"SHORT",grade:"A+",result:"+1.8R",date:"Mar 12"},
            {instr:"NAS100",dir:"LONG",grade:"A+",result:"+3.2R",date:"Mar 9"},
            {instr:"XAUUSD",dir:"LONG",grade:"A+",result:"+1.6R",date:"Mar 6"},
          ].map((t,i) => (
            <div key={i} style={{padding:"10px 16px",background:"rgba(127,255,107,0.05)",border:"1px solid rgba(127,255,107,0.15)",borderRadius:10,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.8)"}}>{t.instr}</span>
              <span style={{fontSize:13,padding:"1px 7px",borderRadius:4,background: t.dir==="LONG"?"rgba(127,255,107,0.12)":"rgba(255,107,107,0.12)",border:`1px solid ${t.dir==="LONG"?"rgba(127,255,107,0.3)":"rgba(255,107,107,0.3)"}`,color:t.dir==="LONG"?"#7fff6b":"#ff6b6b",fontFamily:"'Space Mono',monospace",fontWeight:700}}>{t.dir}</span>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:900,color:"#7fff6b"}}>{t.result}</span>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.38)"}}>{t.date}</span>
            </div>
          ))}
        </div>

        {/* Testimonial cards */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":isMobile?"1fr":"repeat(3,1fr)",gap:16,marginBottom:40}}>
          {[
            {
              quote:"I used to freeze at the trigger. OmniUSD just tells me exactly what to wait for and what to do when it happens. That clarity changed everything.",
              name:"Marcus T.",
              location:"Chicago, IL",
              detail:"BTCUSD trader · 3 months",
              initials:"MT",
              color:"#ff6bff",
            },
            {
              quote:"The SOFT PASS feature alone saved me from two bad trades last week. Knowing when NOT to trade is worth more than any signal.",
              name:"Danielle R.",
              location:"Atlanta, GA",
              detail:"XAUUSD trader · 5 weeks",
              initials:"DR",
              color:"#00e5ff",
            },
            {
              quote:"I've tried three other tools. None of them coached me step by step through execution the way OmniUSD does. The live session guidance is different.",
              name:"James K.",
              location:"Houston, TX",
              detail:"NAS100 trader · 2 months",
              initials:"JK",
              color:"#7fff6b",
            },
          ].map((t,i) => (
            <div key={i} style={{padding:"24px",background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,display:"flex",flexDirection:"column",gap:16}}>
              {/* Quote marks */}
              <div style={{fontSize:32,color:`${t.color}33`,fontFamily:"Georgia,serif",lineHeight:1,marginBottom:-8}}>"</div>
              {/* Quote */}
              <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"rgba(255,255,255,0.8)",lineHeight:1.9,flex:1,margin:0}}>
                {t.quote}
              </p>
              {/* Attribution */}
              <div style={{display:"flex",alignItems:"center",gap:12,paddingTop:12,borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:`${t.color}22`,border:`1px solid ${t.color}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:900,color:t.color}}>{t.initials}</span>
                </div>
                <div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:"#f0ecff"}}>{t.name}</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.75)"}}>{t.location} · {t.detail}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <div style={{textAlign:"center"}}>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.80)",lineHeight:1.8,maxWidth:560,margin:"0 auto"}}>
            * Trade results shown are illustrative examples of BRC methodology execution. Individual results vary. Trading involves risk. Past performance does not guarantee future results.
          </p>
        </div>
      </div>

      {/* Pricing */}
      <div id="pricing" style={{position:"relative",zIndex:1,scrollMarginTop:110,maxWidth:1060,margin:"0 auto",padding:"60px 24px"}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.24em",color:"#ff6bff",background:"rgba(255,107,255,0.08)",border:"1px solid rgba(255,107,255,0.2)",padding:"4px 12px",borderRadius:4,display:"inline-block",marginBottom:20}}>PRICING</div>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(30px,5vw,50px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-0.02em",marginBottom:12}}>Choose your plan.</h2>
        <p style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#ccc4e8",lineHeight:1.8,maxWidth:520,marginBottom:44}}>Every plan includes the BRC execution tracker, session-aware guidance, and AI session plans.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14}}>
          {plans.map(p=>(
            <div key={p.tier}
              onMouseEnter={()=>setHoveredPlan(p.tier)}
              onMouseLeave={()=>setHoveredPlan(null)}
              style={{position:"relative",background:p.popular?"rgba(255,107,255,0.05)":"rgba(255,255,255,0.03)",border:`1px solid ${p.popular?"rgba(255,107,255,0.3)":"rgba(255,255,255,0.08)"}`,borderRadius:14,padding:"32px 28px",transition:"all 0.2s",transform:hoveredPlan===p.tier?"translateY(-3px)":"none",boxShadow:p.popular?"0 0 40px rgba(255,107,255,0.1)":undefined}}>
              {p.popular&&<div style={{position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.12em",color:"#1e1a35",background:"#ff6bff",padding:"3px 14px",borderRadius:100,whiteSpace:"nowrap"}}>MOST POPULAR</div>}
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.16em",color:p.color,marginBottom:14}}>{p.tier}</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:42,fontWeight:800,lineHeight:1,color:p.color,marginBottom:4}}>{p.price}</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:14,color:"#8878aa",marginBottom:24}}>per month</div>
              <div style={{height:1,background:"rgba(255,255,255,0.07)",marginBottom:20}}/>
              <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:28}}>
                {p.instruments.map(ins=>(
                  <div key={ins} style={{display:"flex",alignItems:"center",gap:9,fontFamily:"'Space Mono',monospace",fontSize:14,color:"#ccc4e8"}}>
                    <span style={{color:"#7fff6b",fontWeight:900,flexShrink:0}}>✓</span>{ins}
                  </div>
                ))}
                {["Live session guidance — real time","Tier confirmation tracking","AI-generated session plans"].map(f=>(
                  <div key={f} style={{display:"flex",alignItems:"center",gap:9,fontFamily:"'Space Mono',monospace",fontSize:14,color:"#ccc4e8"}}>
                    <span style={{color:"#7fff6b",fontWeight:900,flexShrink:0}}>✓</span>{f}
                  </div>
                ))}
              </div>
              <button onClick={onEnterApp}
                style={{width:"100%",fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,letterSpacing:"0.1em",padding:13,borderRadius:8,cursor:"pointer",transition:"all 0.2s",
                  background:p.popular?"linear-gradient(135deg,#ff6bff,#7b2fff)":"none",
                  border:p.popular?"none":"1px solid rgba(255,255,255,0.15)",
                  color:p.popular?"#1e1a35":"#ccc4e8"}}>
                GET STARTED {p.popular&&"→"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div id="faq" style={{position:"relative",zIndex:1,scrollMarginTop:110,maxWidth:1060,margin:"0 auto",padding:isMobile?"48px 16px 0":"80px 24px 0"}}>
        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(255,107,255,0.15),transparent)",marginBottom:64}}/>

        <div style={{marginBottom:48}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,107,255,0.7)",letterSpacing:"0.22em",marginBottom:14}}>FAQ</div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(22px,3vw,36px)",fontWeight:800,lineHeight:1.15,letterSpacing:"-0.02em",color:"#f0ecff"}}>
            Common questions.
          </h2>
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:0,border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,overflow:"hidden"}}>
          {[
            {
              q:"Why only the New York session?",
              a:"The NY session is the only window where all three conditions for BRC are met simultaneously — institutional order flow, tight spreads, and reliable level respect. London creates the setup. Asian session creates noise. NY session executes the trade. We built OmniUSD around the one window that consistently produces A+ setups worth taking.",
            },
            {
              q:"Why does BRC work best during NY session?",
              a:"BRC depends on institutional participation to create clean breaks, clean retests, and clean continuation. Outside the NY session, retail volume dominates — levels break randomly, retests fail without follow-through, and false signals damage accounts. During NY open, the institutions that set those levels are actively defending and breaking them. That is what makes the BRC sequence reliable.",
            },
            {
              q:"Why not trade London, Asian, and NY for more opportunities?",
              a:"More sessions equals more trades equals more losses. Every session outside NY adds noise, not edge. Traders who chase every session spread their focus across four 90-minute windows — and get mediocre results in all of them. OmniUSD is built on a different philosophy: master one window, execute it perfectly, and compound the results. Six quality NY session trades per month outperforms thirty random trades across all sessions every time.",
            },
            {
              q:"What if I miss the NY session?",
              a:"You wait for tomorrow. OmniUSD is built on quality over quantity. If you miss today's window, the market will be there tomorrow. Chasing a setup outside the execution window is exactly how traders turn a good system into a losing one. The hard cutoff at 10:30 AM CT is not a limitation — it is the discipline that protects the account.",
            },
            {
              q:"Why not trade London for BTCUSD and XAUUSD?",
              a:"London open analysis is allowed for BTCUSD and XAUUSD because these two instruments maintain enough volume outside NY to produce readable structure. But the maximum grade is B+ — never A+. London creates the setup. NY confirms and executes it. Entering during London means entering before the institutional confirmation that makes BRC work. OmniUSD waits for the confirmation, not the setup.",
            },
            {
              q:"Is this just another signal service?",
              a:"No. You upload your own charts, the system reads the structure, and you decide. There are no alerts, no calls, and no black-box recommendations. If the setup is not valid, OmniUSD says PASS and shows nothing else.",
            },
            {
              q:"What if the setup does not confirm?",
              a:"You do nothing. If the BRC sequence is incomplete, the result is PASS. No execution UI appears, no pressure to trade. A clean PASS protects your account. Not every session has a trade — the system is honest about that.",
            },
            {
              q:"Can I use this for a prop firm challenge?",
              a:"Yes — this is one of the strongest use cases. OmniUSD prevents exactly what prop firms punish: chasing, late entries, and emotional decisions. Limit orders only, hard session cutoffs, A+ setups only — already aligned with most challenge rules.",
            },
            {
              q:"How much should I risk per trade?",
              a:"2.5% per trade is the recommended risk. For prop firm challenges, check your drawdown rules — most allow 1–2% and you should adjust accordingly. OmniUSD tells you when to execute. You control the size.",
            },
            {
              q:"Has this been tested?",
              a:"BRC is built on price action and market structure principles used by institutional traders. OmniUSD applies those principles with a structured, rules-based execution system. Results depend on how strictly you follow the process.",
            },
            {
              q:"When should I upload the charts?",
              a:"Upload during pre-market scouting — 7:00 to 8:30 AM CT. This gives you time to review the plan, study the levels, and set alerts before the 8:30 AM CT execution window opens. Do not upload charts during the session — you should be watching candles, not uploading.",
            },
            {
              q:"What timeframes does BRC use?",
              a:"Five timeframes: Daily (bias), 4H (structure), 1H (setup), 30M (trigger), 15M (refinement). The 30M candle close is the only valid entry signal. All five are required — missing one means the plan cannot be graded accurately.",
            },
            {
              q:"What sessions can I trade?",
              a:"OmniUSD is built exclusively for the New York session — 8:30 to 10:30 AM CT. This is the only window where institutional volume, level respect, and BRC follow-through are all aligned. Pre-market scouting opens at 7:00 AM CT. Hard cutoff is 10:30 AM CT — no new entries after that.\n\nException: BTCUSD and XAUUSD can be analyzed during London open (2:00–4:00 AM CT) with a maximum grade of B+. All other instruments are NY session only.",
            },
            {
              q:"What is the edge?",
              a:"Most traders enter at the Break. BRC waits for all three phases — Break, Retest, Continuation. You enter after confirmation, not during the move. That patience enforced by structure is the edge. OmniUSD holds that discipline when pressure says otherwise.",
            },
            {
              q:"Do I need to watch charts all session?",
              a:"No. Upload before the session, review the plan, set your alerts. You only need to be present at the 30M candle closes. Between closes, there is nothing to act on. OmniUSD is built for structure, not screen time.",
            },
            {
              q:"How do I take the correct screenshot?",
              a:"Watch the setup tutorial above, or follow these steps:\n\n1. Open TradingView and load your instrument\n2. Set each chart to the correct lookback (Daily=6mo, 4H=4-6wk, 1H=5-7d, 30M=3-5d, 15M=1-2d)\n3. Make sure the instrument ticker AND timeframe label are both clearly visible on screen\n4. Take a full screenshot of each chart\n5. Upload all 5 in OmniUSD\n\nPro tip: Install the free OmniLens indicator on TradingView. It automatically marks your lookback periods, labels market structure (HH/HL/LH/LL), and shows 30M candle body strength — making the screenshot process foolproof. Get it at tradingview.com (search OmniLens by OmniUSD).",
              highlight: true,
            },
            {
              q:"What broker do I need?",
              a:"Any broker that shows candlestick charts. OmniUSD reads screenshots — it is not connected to your broker. TradingView, MT4, MT5, cTrader, or any platform that displays OHLC candles works.",
            },
            {
              q:"What instruments are supported?",
              a:"BTCUSD and XAUUSD on Starter. Pro adds NAS100, US30, and more. Elite unlocks all instruments including US500 (S&P 500) and additional pairs. All instruments use the same BRC methodology.",
            },
            {
              q:"Do I need trading experience?",
              a:"You should understand candlestick charts and basic support and resistance. OmniUSD is not a beginner course — it is an execution system. If you have been trading for a few months or more, you will get value from it immediately.",
            },
            {
              q:"Is BRC scalp trading or swing trading?",
              a:"Neither exactly. It is intraday structured execution. The setup takes hours to form across multiple timeframes. The trade typically resolves within the same session or the next. You are not scalping ticks or holding for days — you are waiting for a confirmed structural move.",
            },
            {
              q:"How many trades per month should I expect?",
              a:"Six to seven A+ NY session setups per month across your instruments. Quality over quantity is a core rule. Six clean NY session trades per month beats thirty random trades across all sessions every single time. You will pass on far more setups than you take — that is by design.",
            },
          ].map((item,i,arr)=>(
            <FaqRow key={i} q={item.q} a={item.a} isLast={i===arr.length-1}/>
          ))}
        </div>
      </div>


            {/* Footer */}
      <div style={{position:"relative",zIndex:1,borderTop:"1px solid rgba(255,255,255,0.06)",padding:"24px 40px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
        <div style={{display:"flex",alignItems:"center",gap:8,fontFamily:"'Space Mono',monospace",fontSize:14,fontWeight:700,color:"#8878aa"}}><OmniLogo size={24} />OmniUSD</div>
        <div style={{display:"flex",gap:24,alignItems:"center"}}>
          <a href="mailto:support@omniusd.pro"
            style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,107,255,0.6)",textDecoration:"none",fontWeight:700,letterSpacing:"0.08em"}}>
            Contact Us
          </a>
          <a href="mailto:support@omniusd.pro?subject=Instrument Request"
            style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.75)",textDecoration:"none",letterSpacing:"0.06em"}}>
            Request an instrument
          </a>
          <button onClick={onPrivacy}
            style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.38)",background:"none",border:"none",cursor:"pointer",textDecoration:"none",letterSpacing:"0.06em"}}>
            Privacy Policy
          </button>
          <button onClick={onTerms}
            style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"rgba(255,255,255,0.38)",background:"none",border:"none",cursor:"pointer",textDecoration:"none",letterSpacing:"0.06em"}}>
            Terms of Service
          </button>
        </div>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#8878aa",textAlign:"right"}}>
          {new Date().getFullYear()} OmniUSD · BRC Execution System<br/>
          <span style={{opacity:0.5}}>Trade at your own risk · Results not guaranteed</span>
        </div>
      </div>
    </div>
  );
}

const WrappedOmniUSD = () => <ErrorBoundary><OmniUSDApp /></ErrorBoundary>;
export default WrappedOmniUSD;

const S={
  root:          {minHeight:"100vh",background:"var(--t-bg)",color:"var(--t-text)",fontFamily:"'Courier New',Courier,monospace",fontSize:"15px",position:"relative",overflowX:"hidden"},
  gridBg:        {position:"fixed",inset:0,backgroundImage:"linear-gradient(var(--t-gridLine) 1px,transparent 1px),linear-gradient(90deg,var(--t-gridLine) 1px,transparent 1px)",backgroundSize:"44px 44px",pointerEvents:"none",zIndex:0},
  nav:           {position:"sticky",top:0,zIndex:100,display:"flex",alignItems:"center",gap:16,padding:"0 28px",height:64,background:"var(--t-navBg)",backdropFilter:"blur(16px)",borderBottom:"1px solid var(--t-border)"},
  navLogo:       {display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit",flexShrink:0},
  logoGem:       {fontSize:24,color:"#ff6bff"},
  logoWord:      {fontSize:21,fontWeight:900,letterSpacing:"0.12em",background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  logoWord2:     {fontSize:21,fontWeight:900,letterSpacing:"0.12em",color:"#00e5ff"},
  navLinks:      {display:"flex",gap:2},
  navLink:       {background:"none",border:"none",color:"var(--t-muted)",padding:"8px 14px",cursor:"pointer",fontSize:14,letterSpacing:"0.08em",fontFamily:"inherit",borderRadius:8,transition:"all 0.15s"},
  navLinkActive: {color:"#ff6bff",background:"rgba(255,107,255,0.1)"},
  navRight:      {marginLeft:"auto",display:"flex",alignItems:"center",gap:10},
  animeChip:     {display:"flex",alignItems:"center",gap:6,background:"var(--t-c3)",border:"1px solid rgba(255,107,255,0.2)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit"},
  sessionPill:   {fontSize:14,letterSpacing:"0.12em",color:"#00e5ff",background:"rgba(0,229,255,0.08)",padding:"5px 12px",borderRadius:20,border:"1px solid rgba(0,229,255,0.2)"},
  main:          {position:"relative",zIndex:1,maxWidth:1320,margin:"0 auto",padding:"40px 24px 80px"},
  footer:        {position:"relative",zIndex:1,borderTop:"1px solid rgba(255,107,255,0.1)",padding:"18px 32px",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:14,letterSpacing:"0.06em",flexWrap:"wrap",gap:10},
  hero:          {marginBottom:32},
  heroTitle:     {fontSize:36,fontWeight:900,color:"#f8f4ff",margin:"0 0 4px",lineHeight:1.2,letterSpacing:"0.02em"},
  heroTitleAccent:{background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  heroSub:       {fontSize:14,color:"var(--t-muted)",lineHeight:1.9,margin:"0 0 4px",maxWidth:580},
  uploadSection: {background:"var(--t-c2)",border:"1px solid rgba(255,107,255,0.1)",borderRadius:16,padding:"24px",marginBottom:16},
  sectionTag:    {fontSize:13,letterSpacing:"0.2em",color:"#ff6bff",background:"rgba(255,107,255,0.1)",padding:"3px 10px",borderRadius:4,border:"1px solid rgba(255,107,255,0.25)",fontWeight:900},
  fiveSlots:     {display:"grid",gridTemplateColumns:"repeat(5,minmax(160px,1fr))",gap:12,overflowX:"auto"},
  slotCard:      {background:"var(--t-c2)",border:"1px solid",borderRadius:12,padding:11},
  dropZone:      {width:"100%",aspectRatio:"3/2",border:"1.5px dashed",borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:7,cursor:"pointer",transition:"all 0.15s",padding:"10px 8px",boxSizing:"border-box"},
  progressBar:   {display:"flex",gap:6,marginTop:16},
  generateWrap:  {background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,107,255,0.18)",borderRadius:16,padding:"18px 20px",display:"flex",flexDirection:"column",gap:8,marginTop:0},
  generateBtn:   {background:"linear-gradient(135deg,#ff6bff,#7b2fff)",border:"none",color:"#fff",padding:"18px 40px",borderRadius:12,fontSize:15,fontWeight:900,letterSpacing:"0.15em",fontFamily:"inherit",alignSelf:"stretch",transition:"all 0.25s",boxShadow:"0 0 0 0 transparent"},
  bannerRed:     {display:"flex",alignItems:"flex-start",gap:12,background:"rgba(255,107,107,0.05)",border:"1px solid rgba(255,107,107,0.2)",borderLeft:"3px solid rgba(255,107,107,0.5)",borderRadius:8,padding:"10px 14px"},
  bannerYellow:  {display:"flex",alignItems:"flex-start",gap:12,background:"rgba(255,209,102,0.03)",border:"1px solid rgba(255,209,102,0.18)",borderLeft:"3px solid rgba(255,209,102,0.4)",borderRadius:8,padding:"10px 14px"},
  planTopBar:    {display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28,flexWrap:"wrap",gap:12},
  levelStrip:    {display:"flex",background:"rgba(0,0,0,0.35)",border:"1px solid rgba(255,107,255,0.12)",borderRadius:16,overflow:"hidden",marginBottom:14},
  triggerRow:    {display:"flex",gap:10,flexWrap:"wrap"},
  detailsGrid:   {display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:24},
  detailCard:    {background:"var(--t-c3)",border:"1px solid rgba(255,107,255,0.1)",borderRadius:12,padding:20},
  cardLabel:     {fontSize:14,letterSpacing:"0.2em",color:"var(--t-muted)",margin:"0 0 14px"},
  resetBtn:      {background:"none",border:"1px solid rgba(255,107,255,0.25)",color:"var(--t-muted)",padding:"9px 20px",borderRadius:8,cursor:"pointer",fontSize:14,letterSpacing:"0.08em",fontFamily:"inherit"},
  instrBtn:      {background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.18)",color:"var(--t-muted2)",padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:700,letterSpacing:"0.06em",fontFamily:"inherit",transition:"all 0.15s",display:"flex",alignItems:"center"},
  instrBtnActive:{background:"rgba(255,107,255,0.14)",color:"#ff6bff",border:"1px solid rgba(255,107,255,0.5)"},
  filterBtn:     {background:"none",border:"1px solid rgba(255,107,255,0.15)",color:"var(--t-muted)",padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:13,letterSpacing:"0.08em",fontFamily:"inherit"},
  filterBtnActive:{background:"rgba(255,107,255,0.12)",color:"#ff6bff",borderColor:"rgba(255,107,255,0.4)"},
  tableWrap:     {overflowX:"auto",borderRadius:12,border:"1px solid rgba(255,107,255,0.1)"},
  table:         {width:"100%",borderCollapse:"collapse",fontSize:14},
  th:            {padding:"12px 14px",textAlign:"left",fontSize:13,letterSpacing:"0.15em",color:"var(--t-muted)",background:"var(--t-tableBg)",borderBottom:"1px solid rgba(255,107,255,0.1)",whiteSpace:"nowrap"},
  td:            {padding:"12px 14px",whiteSpace:"nowrap",verticalAlign:"middle"},
  errorBox:      {padding:"14px 18px",background:"rgba(255,107,107,0.07)",border:"1px solid rgba(255,107,107,0.25)",borderRadius:10,fontSize:15,color:"#ffaaaa",lineHeight:1.5,fontWeight:600},
  loadingScreen: {display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"70vh",gap:22,padding:40},
};

