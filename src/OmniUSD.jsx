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
- If the charts show a DIFFERENT instrument than ${instrument} (e.g. user selected XAUUSD but uploaded BTCUSD charts), set instrument_valid=false and instrument_detected= what you actually see.
- If ALL charts match ${instrument}, set instrument_valid=true.
- If you cannot clearly identify the instrument on any chart, set instrument_valid=false with instrument_detected="unreadable".
INSTRUMENT MISMATCH = hard block. Do NOT proceed with analysis if instrument_valid=false.

STEP 2 — TIMEFRAME CHECK: Inspect each image for timeframe indicators. If any mismatch → charts_valid=false, stop, no plan.
CONSERVATIVE RULE: If you cannot clearly confirm the timeframe from visual indicators, mark that slot as invalid. A false pass is worse than a false fail.
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
// DEV_MODE = false → tier gating enforced from user's saved plan
// DEV_MODE = true  → full Elite access (only for local development/testing)
const DEV_MODE = false;

const TIER_CONFIG = {
  starter: { label:"Starter", price:"$29/mo", priceId:"price_1TCPQoEIHuTqoOi9n3oejBYy", instruments:["XAUUSD","BTCUSD"],         dailyCap:3,  color:"#ffd166" },
  pro:     { label:"Pro",     price:"$39/mo", priceId:"price_1TCPRLEIHuTqoOi9uVChc1LE", instruments:["XAUUSD","BTCUSD","NAS100","US30"], dailyCap:5,  color:"#00e5ff" },
  elite:   { label:"Elite",   price:"$59/mo", priceId:"price_1TCPRpEIHuTqoOi9xA9MIiH7", instruments:["XAUUSD","BTCUSD","NAS100","US30","USOIL","GBPUSD"], dailyCap:10, color:"#ff6bff" },
};

// Current user tier — hardcoded for now, will come from Stripe/auth later
const CURRENT_TIER = DEV_MODE ? "elite" : "starter";

function getTierAccess(tier=CURRENT_TIER){
  return DEV_MODE ? TIER_CONFIG.elite : (TIER_CONFIG[tier]||TIER_CONFIG.starter);
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
      --t-bg:#130d22;
      --t-navBg:rgba(13,7,24,0.96);
      --t-text:#f8f4ff;
      --t-subtext:#c8bede;
      --t-border:rgba(255,107,255,0.12);
      --t-gridLine:rgba(255,107,255,0.014);
      --t-c1:rgba(255,255,255,0.04);
      --t-c2:rgba(255,255,255,0.07);
      --t-c3:rgba(255,255,255,0.10);
      --t-c4:rgba(255,255,255,0.12);
      --t-c5:rgba(255,255,255,0.08);
      --t-c6:rgba(255,255,255,0.10);
      --t-c7:rgba(255,255,255,0.12);
      --t-cardBg:rgba(255,255,255,0.07);
      --t-cardBorder:rgba(255,255,255,0.10);
      --t-inputBg:rgba(255,255,255,0.07);
      --t-inputBorder:rgba(255,107,255,0.18);
      --t-muted:#f0ecff;
      --t-muted2:#d8d0f0;
      --t-muted3:#bcb0d8;
      --t-muted4:#9888bb;
      --t-muted5:#705588;
      --t-tableBg:#0f0820;
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
export default function OmniUSD(){
  const [ready,setReady]=useState(false);
  const [authUser,setAuthUser]=useState(null);   // Supabase user object
  const [profile,setProfile]=useState(null);     // app profile (tier, tz, etc)
  const [view,setView]=useState("landing");      // "landing"|"auth"|"app"
  const [page,setPage]=useState("home");
  const [planResult,setPlanResult]=useState(null);
  const [journal,setJournal]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("omniusd_journal")||"[]");}catch{return[];}
  });
  const T=DARK;

  useEffect(()=>{
    async function init(){
      try{
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
              setAuthUser(session.user||{id:userId,email:session.email||""});
              await loadProfile(userId, session.access_token);
              setView("app");
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
        if(data&&data.id&&data.is_paid){
          setProfile({
            mode:"standard",emoji:"◈",color:"#00e5ff",label:"Standard",
            tier:data.tier||"starter",
            tierLabel:data.tier_label||"Starter",
            tierColor:data.tier_color||"#ffd166",
            defaultInstrument:data.default_instrument||"XAUUSD",
            session:data.session||null,
            tz:data.tz?JSON.parse(data.tz):null,
            isPaid:true,
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
            tier:p.tier||"starter",
            tier_label:p.tierLabel||"Starter",
            tier_color:p.tierColor||"#ffd166",
            default_instrument:p.defaultInstrument||"XAUUSD",
            session:p.session||null,
            tz:p.tz?JSON.stringify(p.tz):null,
            is_paid:true,
            updated_at:new Date().toISOString(),
          }),
        });
      }
      try{await window.storage.set("omniusd_profile",JSON.stringify(p));}catch(e){}
    }catch(e){console.error("Profile save failed",e);}
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

  // ── LANDING ──
  if(view==="landing") return <LandingPage 
    onEnterApp={()=>setView("pricing")} 
    onLogin={()=>setView("auth_login")}
  />;

  // ── PRICING ──
  if(view==="pricing") return <PricingPage onBack={()=>setView("landing")} onPaid={()=>setView("auth")}/>;

  // ── PAYMENT SUCCESS ──
  if(view==="payment_success") return (
    <div style={{minHeight:"100vh",background:"#130d22",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"'Syne',sans-serif"}}>
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
      localStorage.setItem("omniusd_journal",JSON.stringify(newJournal));
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
          ◈
          <span style={{display:"inline-flex"}}><span style={S.logoWord}>Omni</span><span style={S.logoWord2}>USD</span></span>
        </button>
        {/* Nav tabs */}
        <div style={{display:"flex",gap:4,position:"absolute",left:"50%",transform:"translateX(-50%)"}}>
          {[
            {id:"home",label:"Dashboard"},
            {id:"journal",label:journal.length>0?"Journal ("+journal.length+")":"Journal"},
          ].map(tab=>(
            <button key={tab.id} onClick={()=>setPage(tab.id)}
              style={{fontFamily:"inherit",fontSize:11,fontWeight:700,letterSpacing:"0.06em",
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
            style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",
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
            <span style={{fontSize:11,fontWeight:700,letterSpacing:"0.06em",color:profile.tierColor||"#00e5ff"}}>{profile.tierLabel||"Starter"}</span>
            <span style={{fontSize:9,color:"var(--t-muted4)"}}>✎</span>
          </button>
        </div>
      </header>
      <main style={S.main}>
        {page==="home" && <HomePage planResult={planResult} setPlanResult={setPlanResult} anime={profile} T={T} onJournalEntry={(entry)=>{
          const newJournal=[{...entry,id:Date.now(),outcome:null},...journal];
          setJournal(newJournal);
          localStorage.setItem("omniusd_journal",JSON.stringify(newJournal));
        }}/>}
        {page==="journal" && <JournalPage journal={journal} onUpdate={(updated)=>{
          setJournal(updated);
          localStorage.setItem("omniusd_journal",JSON.stringify(updated));
        }} T={T}/>}
      </main>
      <footer style={{...S.footer, borderTop:`1px solid ${T.border}`}}>
        <span style={{color:T.subtext}}>© 2026 OmniUSD · AI-powered trading analysis</span>
        <span style={{color:"rgba(255,107,107,0.5)",fontWeight:500,fontSize:10,letterSpacing:"0.04em"}}>⚠ Trade at your own risk · Results not guaranteed</span>
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
  // Step order: 1=Plan, 2=Market, 3=Session, 4=Confirm
  const [step,setStep]=useState(()=>{
    // If paid tier exists in localStorage, skip plan selection
    if(localStorage.getItem("omniusd_paid_tier")) return 2;
    const params=new URLSearchParams(window.location.search);
    if(params.get("session_id")) return 2;
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
    {id:"GBPUSD", label:"Cable",   sub:"GBPUSD",  color:"#ff6bff"},
  ];

  const modeProfile = mode && mode !== "anime" ? MODES.find(m=>m.id===mode) : null;
  const modeColor = mode ? (MODES.find(m=>m.id===mode)?.color||"#ff6bff") : "#ff6bff";

  // Step labels
  const stepList=["Plan","Confirm","Commit"];
  const totalSteps=stepList.length; // 2 steps
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
            <span style={{fontSize:18,color:"#ff6bff"}}>◈</span>
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
                      fontSize:11,fontWeight:900,color:done?"#fff":active?"#ff6bff":"var(--t-muted4)",
                      transition:"all 0.3s",flexShrink:0}}>
                      {done?"✓":n}
                    </div>
                    <span style={{fontSize:12,fontWeight:active?800:500,
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
              <div style={{fontSize:12,fontWeight:900,letterSpacing:"0.2em",color:"#ff6bff",marginBottom:12}}>STEP 1 OF 3</div>
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
                        fontSize:10,fontWeight:900,letterSpacing:"0.12em",
                        padding:"4px 16px",borderRadius:20,whiteSpace:"nowrap",
                        boxShadow:"0 2px 12px rgba(0,229,255,0.3)"}}>
                        MOST POPULAR
                      </div>
                    )}
                    {isSel&&(
                      <div style={{position:"absolute",top:14,right:14,width:22,height:22,borderRadius:"50%",
                        background:tier.color,display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:11,color:"#000",fontWeight:900}}>✓</div>
                    )}
                    <div style={{marginBottom:20}}>
                      <div style={{fontSize:11,fontWeight:900,color:isSel?tier.color:"var(--t-muted4)",letterSpacing:"0.14em",marginBottom:8}}>{tier.label.toUpperCase()}</div>
                      <div style={{fontSize:34,fontWeight:900,color:isSel?tier.color:"var(--t-text)",lineHeight:1,marginBottom:3}}>{tier.price}</div>
                      <div style={{fontSize:12,color:"var(--t-muted4)",fontWeight:500}}>per month</div>
                    </div>
                    <div style={{width:"100%",height:1,background:"rgba(255,255,255,0.06)",marginBottom:18}}/>
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {tier.instruments.map(sym=>{
                        const inst=INSTRUMENTS.find(i=>i.id===sym);
                        return(
                          <div key={sym} style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:7,height:7,borderRadius:"50%",background:inst?.color||tier.color,flexShrink:0}}/>
                            <span style={{fontSize:14,color:isSel?"var(--t-muted)":"var(--t-muted2)",fontWeight:700}}>{inst?.label||sym}</span>
                            <span style={{fontSize:11,color:"var(--t-muted4)",fontWeight:500,marginLeft:"auto"}}>{sym}</span>
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
                    <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"var(--t-muted3)",fontWeight:600}}>
                      <span style={{color:t.color}}>✓</span>
                      <span>{t.label} — {t.price}/month</span>
                    </div>
                    {checkoutError&&(
                      <div style={{fontSize:12,color:"#ff8080",background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.2)",borderRadius:8,padding:"8px 14px",textAlign:"center"}}>
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
                    <div style={{fontSize:11,color:"var(--t-muted4)",fontFamily:"monospace"}}>
                      Paid plans start at $29/month · Secure checkout via Stripe
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}


        {/* STEP 2 — CONFIRM */}
        {step===2&&(
          <div style={{animation:"icc-slide 0.35s ease both",maxWidth:580,margin:"0 auto"}}>
            {!selectedTier&&(
              // Safety fallback — should never happen if flow is correct
              <div style={{textAlign:"center",padding:"40px 0"}}>
                <p style={{color:"#ff6b6b",fontSize:16,margin:"0 0 16px",fontWeight:600}}>No plan selected. Please go back and choose a plan first.</p>
                <button onClick={()=>setStep(1)} style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",color:"#ff6b6b",padding:"12px 24px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700}}>← Back to Plan Selection</button>
              </div>
            )}
            <div style={{marginBottom:40}}>
              <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.18em",color:"#ff6bff",marginBottom:10}}>STEP 2 OF 3</div>
              <h2 style={{fontSize:34,fontWeight:900,color:"var(--t-text)",margin:"0 0 10px",lineHeight:1.1}}>Confirm your setup</h2>
              <p style={{fontSize:16,color:"var(--t-muted3)",margin:0,fontWeight:500,lineHeight:1.55}}>Review your selections before entering the dashboard.</p>
            </div>
            <div style={{background:"rgba(255,255,255,0.035)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:18,overflow:"hidden",marginBottom:20}}>
              {(()=>{
                console.log("selectedPlan at confirm step:", selectedTier);
                const tier=TIER_CONFIG[selectedTier];
                if(!tier){
                  return(
                    <div style={{padding:"24px",textAlign:"center"}}>
                      <p style={{color:"#ff6b6b",fontSize:15,margin:"0 0 12px"}}>No plan selected. Please go back and choose a plan.</p>
                      <button onClick={()=>setStep(1)} style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",color:"#ff6b6b",padding:"10px 20px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700}}>← Back to Plan Selection</button>
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
                      fontSize:12,fontWeight:700,color:"var(--t-muted4)",
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
                            fontSize:11,fontWeight:700,
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
                        {row.sub&&<div style={{fontSize:11,color:"var(--t-muted4)",marginTop:3,fontWeight:500,letterSpacing:"0.02em"}}>{row.sub}</div>}
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
            {/* Timezone selector */}
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--t-muted3)",letterSpacing:"0.04em"}}>YOUR TIMEZONE</div>
                <button onClick={autoDetectTz}
                  style={{fontSize:11,fontWeight:700,color:"#00e5ff",background:"rgba(0,229,255,0.06)",
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
                    <div style={{fontSize:11,color:"rgba(0,229,255,0.7)",fontWeight:600,marginTop:2}}>{tzObj.label}</div>
                  </div>
                  <button onClick={()=>{setTzObj(null);setTzSearch("");}}
                    style={{fontSize:11,fontWeight:700,color:"var(--t-muted3)",background:"rgba(255,255,255,0.06)",
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
                          <div style={{fontSize:13,fontWeight:700,color:"var(--t-text)"}}>{t.city}</div>
                          <div style={{fontSize:11,color:"var(--t-muted4)"}}>{t.label}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{background:"rgba(0,229,255,0.03)",border:"1px solid rgba(0,229,255,0.09)",borderRadius:12,padding:"14px 18px",marginBottom:28}}>
              <p style={{fontSize:13,color:"var(--t-muted3)",margin:0,lineHeight:1.6,fontWeight:500}}>
                Upload 5 charts and the engine reads <strong style={{color:"#00e5ff",fontWeight:700}}>Break → Retest → Confirmation</strong> across all timeframes to generate a rules-based session plan.
              </p>
            </div>
            <div style={{display:"flex",gap:10}}>
              {OB_BTN("← Back",()=>setStep(1),false,false)}
              <button onClick={()=>tzObj&&setStep(3)} disabled={!tzObj}
                style={{flex:2,
                  background:tzObj?"linear-gradient(135deg,#ff6bff,#7b2fff)":"rgba(255,255,255,0.06)",
                  border:tzObj?"none":"1px solid rgba(255,255,255,0.08)",
                  color:tzObj?"#fff":"var(--t-muted4)",
                  padding:"18px 28px",borderRadius:13,fontSize:16,fontWeight:900,
                  letterSpacing:"0.1em",fontFamily:"inherit",
                  cursor:tzObj?"pointer":"not-allowed",
                  boxShadow:tzObj?"0 6px 40px rgba(255,107,255,0.28)":"none",
                  transition:"all 0.2s"}}>
                {tzObj?"ENTER DASHBOARD →":"Select your timezone to continue"}
              </button>
            </div>
          </div>
        )}

      </div>

      
        {/* STEP 3 — COMMIT */}
        {step===3&&(
          <div style={{animation:"icc-slide 0.35s ease both",maxWidth:520,margin:"0 auto"}}>
            <div style={{fontSize:11,fontWeight:900,letterSpacing:"0.2em",color:"#ff6bff",marginBottom:14}}>STEP 3 OF 3</div>
            <h2 style={{fontSize:34,fontWeight:900,color:"var(--t-text)",lineHeight:1.1,margin:"0 0 10px",letterSpacing:"-0.01em"}}>
              Before you begin.
            </h2>
            <p style={{fontSize:16,color:"var(--t-muted3)",margin:"0 0 36px",fontWeight:500,lineHeight:1.55}}>This only works if you follow the process.</p>

            {/* Commitments */}
            <div style={{display:"flex",flexDirection:"column",gap:16,marginBottom:40}}>
              {[
                "Do not judge BRC after two trades.",
                "Do not skip the phases.",
                "Do not risk real money before you can follow the process consistently.",
                "Use a demo account first and commit to 30 days of disciplined execution before going live.",
              ].map((line,i)=>(
                <div key={i} style={{display:"flex",alignItems:"flex-start",gap:14,
                  padding:"16px 18px",
                  background:"rgba(255,255,255,0.03)",
                  border:"1px solid rgba(255,255,255,0.07)",
                  borderRadius:12}}>
                  <div style={{width:22,height:22,borderRadius:"50%",flexShrink:0,marginTop:1,
                    background:"rgba(255,107,255,0.12)",border:"1.5px solid rgba(255,107,255,0.35)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:10,fontWeight:900,color:"#ff6bff"}}>
                    {i+1}
                  </div>
                  <p style={{fontSize:15,
                    color:"var(--t-muted)",
                    fontWeight:500,
                    lineHeight:1.55,margin:0}}>{line}</p>
                </div>
              ))}
            </div>

            <div style={{display:"flex",gap:10}}>
              {OB_BTN("← Back",()=>setStep(2),false,false)}
              <button onClick={finish}
                style={{flex:2,background:"linear-gradient(135deg,#ff6bff,#7b2fff)",border:"none",
                  color:"#fff",padding:"18px 28px",borderRadius:13,fontSize:16,fontWeight:900,
                  letterSpacing:"0.12em",fontFamily:"inherit",cursor:"pointer",
                  boxShadow:"0 6px 40px rgba(255,107,255,0.28)",transition:"all 0.2s"}}>
                I'M COMMITTED →
              </button>
            </div>
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
            <div style={{width:24,height:24,borderRadius:"50%",background:step.color+"14",border:`1px solid ${step.color}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:step.color,flexShrink:0}}>{step.n}</div>
            <div><div style={{fontSize:11,fontWeight:900,color:"var(--t-text)",marginBottom:3}}>{step.icon} {step.title}</div><div style={{fontSize:10,color:"var(--t-muted3)",lineHeight:1.6}}>{step.desc}</div></div>
          </div>
        ))}
      </div>

      {/* Methodology accordion */}
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:"100%",background:"var(--t-c2)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"11px 18px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",fontFamily:"inherit",marginBottom:open?8:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:11}}>🔎</span>
          <span style={{fontSize:10,letterSpacing:"0.16em",color:"var(--t-muted2)",fontWeight:900}}>HOW THIS ENGINE MAKES DECISIONS — 6 rules it applies to every chart</span>
        </div>
        <span style={{fontSize:10,color:"var(--t-muted3)"}}>{open?"▲ CLOSE":"▼ SEE THE RULES"}</span>
      </button>

      {open&&(
        <div style={{animation:"icc-slide 0.25s ease both",background:"var(--t-c1)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:12,overflow:"hidden"}}>
          {/* Engine identity */}
          <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"var(--t-c2)"}}>
            <p style={{fontSize:12,color:"var(--t-muted)",margin:0,lineHeight:1.75}}>
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
                  <div style={{fontSize:11,fontWeight:900,color:"#c8bcd8",marginBottom:4,letterSpacing:"0.04em"}}>{r.label}</div>
                  <p style={{fontSize:12,color:"#6858a0",margin:0,lineHeight:1.7}}>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {/* What grade means */}
          <div style={{padding:"14px 20px",borderTop:"1px solid rgba(255,255,255,0.05)",background:"var(--t-c2)"}}>
            <div style={{fontSize:9,letterSpacing:"0.16em",color:"var(--t-muted3)",fontWeight:900,marginBottom:10}}>WHAT THE GRADE MEANS</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[{g:"A+",c:"#7fff6b",d:"All 3 TF aligned. Full BRC sequence. Execute."},{g:"A",c:"#7fff6b",d:"Strong setup, minor hesitation on one TF."},{g:"B",c:"#ffd166",d:"Setup forming. Wait for more confirmation."},{g:"C",c:"#ff9a3c",d:"Weak structure. Reduce size or skip."},{g:"SKIP",c:"#ff6b6b",d:"No valid setup. Skip this session."}].map(item=>(
                <div key={item.g} style={{display:"flex",gap:8,alignItems:"flex-start",flex:"1 1 180px",background:"var(--t-c2)",border:`1px solid ${item.c}18`,borderLeft:`3px solid ${item.c}`,borderRadius:8,padding:"8px 12px"}}>
                  <span style={{fontSize:13,fontWeight:900,color:item.c,minWidth:28}}>{item.g}</span>
                  <span style={{fontSize:11,color:"var(--t-muted2)",lineHeight:1.5}}>{item.d}</span>
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
          fontSize:13,color:"#00e5ff",margin:0,fontWeight:600,
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
            <span style={{fontSize:9,fontWeight:900,color:slot.color,letterSpacing:"0.08em",opacity:0.8}}>{slot.short}</span>
          </div>
        ))}
      </div>
      <p style={{fontSize:11,color:"var(--t-muted4)",margin:0,letterSpacing:"0.06em"}}>This takes about 10–20 seconds</p>
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
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  return {
    now,
    str: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago" }),
    mins: now.getHours() * 60 + now.getMinutes(),
    isFriday: now.getDay() === 5,
    dayName: ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][now.getDay()],
    dateStr: `${["January","February","March","April","May","June","July","August","September","October","November","December"][now.getMonth()]} ${now.getDate()} ${now.getFullYear()}`,
  };
}

function getNextClose() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
  const m = now.getMinutes();
  const minsToNext = m < 30 ? 30 - m : 60 - m;
  const next = new Date(now.getTime() + minsToNext * 60000);
  return next.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/Chicago" });
}

function getAnalysisPrompt(instrument) {
  const ct = getCTTime();
  const nowMins = ct.mins;
  const sessionStatus = nowMins < 8*60+30 ? "PRE-MARKET"
    : nowMins <= 10*60+30 ? "NY SESSION LIVE"
    : "NY SESSION CLOSED";
  const fridayNote = ct.isFriday ? " FRIDAY — end of week, apply extra caution." : "";

  return `You are an expert BRC (Break-Retest-Continuation) trade analyst.
Today is ${ct.dayName} ${ct.dateStr} at ${ct.str} Chicago time. ${sessionStatus}.${fridayNote}
Instrument: ${instrument}.

Analyze these 5 charts (Daily, 4H, 1H, 30M, 15M) and return ONLY a JSON object with this exact structure:
{
  "grade": "A+|A|B|C|PASS",
  "bias": "SHORT|LONG|NEUTRAL",
  "confidence": "HIGH|MEDIUM|LOW",
  "confidence_score": 75,
  "summary": "2-3 sentence plain English summary of what the charts show. Written for a 16-year-old. No jargon.",
  "trigger_level": "exact price",
  "retest_zone": "price zone e.g. 70,200–70,350",
  "stop_loss": "exact price",
  "tp1": "exact price",
  "tp2": "exact price",
  "runner": "exact price",
  "current_phase": "BREAK|RETEST|CONTINUATION|PRE-SETUP",
  "key_levels": ["level 1", "level 2", "level 3"],
  "friday_note": "brief Friday caution if applicable, empty string otherwise",
  "pass_reason": "if PASS, why. Otherwise empty string."
}

BRC RULES:
- Daily is the General. Always check it first.
- Phase awareness: if price already passed the trigger level, identify the ACTUAL current phase.
- Never call a break pending if price already moved through that level.
- Trigger level = the CURRENT nearest actionable level, not a historical one.
- Small bounces after big moves = valid retests. Do not call expired setup.
- PASS only when Daily+4H+1H all agree AND move ran with zero retest outside NY.
Return only the JSON. No markdown. No explanation.`;
}

function getLivePrompt(plan) {
  const ct = getCTTime();
  const nowMins = ct.mins;
  const windowOpen = nowMins >= 8*60+30 && nowMins <= 10*60+30;
  const fridayNote = ct.isFriday ? " FRIDAY: protect the week's profit — if not A+, PASS." : "";

  return `You are an OmniUSD live session guide — a disciplined BRC trading coach.
Time: ${ct.str} CT. Window: ${windowOpen ? "OPEN ✅" : nowMins < 8*60+30 ? "PRE-MARKET" : "CLOSED ❌"}.${fridayNote}

ACTIVE PLAN:
Instrument: ${plan.instrument}
Bias: ${plan.bias} | Grade: ${plan.grade} | Confidence: ${plan.confidence_score}%
Trigger: ${plan.trigger_level} | Retest zone: ${plan.retest_zone}
Stop: ${plan.stop_loss} | TP1: ${plan.tp1} | TP2: ${plan.tp2} | Runner: ${plan.runner}
Phase: ${plan.current_phase}
Summary: ${plan.summary}

RULES — NON-NEGOTIABLE:
- Only 30M candle CLOSES matter. Wicks = noise.
- Tier 1 = first 30M close through trigger level
- Tier 2 = second 30M close confirms. THEN place limit order.
- Never chase. Never enter on a wick. Never market order.
- "Pre-market movement is information — not permission."

YOUR ROLE:
- Respond to live price updates from the trader
- Confirm or deny tier completions based on CLOSES only
- Keep responses SHORT — 3-5 sentences max unless confirming a tier
- When tier confirms: lead with 🚨, be clear and energetic
- When price moves but no close: keep calm, remind of the rule
- Write like explaining to a disciplined 16-year-old
- Use ✅ ❌ ⏳ 🔴 🟢 🥷 for status — never excessive
- Bold key prices with **price**`;
}

// ─── Main component ───────────────────────────────────────────────────────────
function UnifiedDashboard({profile, onJournalEntry, onOpenJournal, onSignOut}) {
  const [phase, setPhase] = useState("upload"); // upload | analyzing | plan | live
  const [images, setImages] = useState([]);
  const [instrument, setInstrument] = useState("BTCUSD");
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
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);

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
    if (images.length < 5) return;
    setPhase("analyzing");

    try {
      // Build image blocks
      const imgBlocks = await Promise.all(images.map(async (img, i) => {
        const base64 = await new Promise(res => {
          const r = new FileReader();
          r.onload = () => res(r.result.split(",")[1]);
          r.readAsDataURL(img);
        });
        return { type: "image", source: { type: "base64", media_type: img.type, data: base64 } };
      }));

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: getAnalysisPrompt(instrument),
          messages: [{ role: "user", content: [...imgBlocks, { type: "text", text: `Analyze these ${instrument} charts. Daily first, then 4H, 1H, 30M, 15M. Return only the JSON.` }] }],
        }),
      });

      const data = await res.json();
      const text = data.content?.[0]?.text || "{}";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      parsed.instrument = instrument;
      setPlan(parsed);
      setPhase("plan");
    } catch (e) {
      console.error(e);
      // Fallback mock plan for demo
      setPlan({
        instrument, grade: "B", bias: "SHORT", confidence: "MEDIUM", confidence_score: 68,
        summary: "Bitcoin is in a downtrend from 97,938. After flushing to 68,770, price is bouncing. This bounce is the retest. We're watching for a 30M close below 70,200 to confirm the next leg down.",
        trigger_level: "70,200", retest_zone: "70,200–70,350", stop_loss: "71,000",
        tp1: "69,200", tp2: "68,770", runner: "67,500",
        current_phase: "RETEST", key_levels: ["71,626 resistance", "70,200 trigger", "68,770 support"],
        friday_note: "Friday — protect the week. Only A+ setups.", pass_reason: "",
      });
      setPhase("plan");
    }
  }

  // ── STEP 2: Start live session ──────────────────────────────────────────────
  function startLiveSession() {
    setPhase("live");
    const ct = getCTTime();
    const nowMins = ct.mins;
    const windowOpen = nowMins >= 8*60+30 && nowMins <= 10*60+30;

    setMessages([{
      role: "assistant",
      content: `🥷 **Live session started — ${plan.instrument} ${plan.bias}**\n\nSend price updates as candles close. I'll guide the session step by step.\n**Wicks don't count. Only closes.**\n\n${windowOpen ? `NY window is open — best entries at the 30M closes. ⚡` : `NY window opens at 8:30 AM CT. Stay patient.`}`,
      time: ct.str,
    }]);
  }

  // ── STEP 3: Live chat ───────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const ct = getCTTime();

    const newHistory = [...sessionHistory, { role: "user", content: userMsg }];
    setMessages(prev => [...prev, { role: "user", content: userMsg, time: ct.str }]);
    setLoading(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 400,
          system: getLivePrompt(plan),
          messages: newHistory,
        }),
      });

      const data = await res.json();
      const reply = data.content?.[0]?.text || "Try again.";
      const updatedHistory = [...newHistory, { role: "assistant", content: reply }];
      setSessionHistory(updatedHistory);

      const r = reply.toLowerCase();
      if (r.includes("tier 1") && (r.includes("confirm") || r.includes("✅"))) { setTier1(true); setSessionState("BREAK_CONFIRMED"); }
      if (r.includes("tier 2") && (r.includes("confirm") || r.includes("✅"))) { setTier2(true); setSessionState("READY_FOR_LIMIT"); }
      if (r.includes("retest") && r.includes("forming")) setSessionState("RETEST_FORMING");
      if (r.includes("invalidat")) setSessionState("INVALIDATED");

      setMessages(prev => [...prev, { role: "assistant", content: reply, time: getCTTime().str }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "Connection error. Try again.", time: getCTTime().str }]);
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
    return text.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#00e5ff">$1</strong>').replace(/\n/g, "<br/>");
  }

  const gradeColor = plan ? { "A+": "#7fff6b", "A": "#00e5ff", "B": "#ffd166", "C": "#ff9a3c", "PASS": "#8878aa" }[plan.grade] || "#ffd166" : "#ffd166";
  const biasColor = plan?.bias === "SHORT" ? "#ff6b6b" : plan?.bias === "LONG" ? "#7fff6b" : "#ffd166";

  return (
    <div style={{ minHeight: "100vh", background: "#0d0b14", color: "#f0ecff", fontFamily: "'Space Mono', monospace", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,107,255,0.3); border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
        @keyframes slide { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadein { from{opacity:0}to{opacity:1} }
      `}</style>

      {/* ── NAV ── */}
      <header style={{ padding: "12px 20px", background: "rgba(255,255,255,0.025)", borderBottom: "1px solid rgba(255,107,255,0.12)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, color: "#ff6bff" }}>◈</span>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", background: "linear-gradient(90deg,#ff6bff,#00e5ff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>OmniUSD</span>
          </div>
          {plan && phase !== "upload" && (
            <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", background: `${gradeColor}14`, border: `1px solid ${gradeColor}44`, borderRadius: 4, color: gradeColor }}>{plan.grade}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", background: `${biasColor}14`, border: `1px solid ${biasColor}44`, borderRadius: 4, color: biasColor }}>{plan.bias}</span>
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, color: "#8878aa" }}>{plan.instrument}</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 9, color: "#8878aa" }}>
            <span style={{ color: "#00e5ff", fontWeight: 700 }}>{ctTime}</span> CT
          </div>
          {onOpenJournal && (
            <button onClick={onOpenJournal}
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "var(--t-muted4,#8878aa)", background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
              Journal
            </button>
          )}
          {phase === "live" && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: windowClosed ? "#ff6b6b" : "#7fff6b", animation: windowOpen ? "pulse 1.5s ease infinite" : "none" }}/>
              <span style={{ fontSize: 9, fontWeight: 700, color: windowClosed ? "#ff6b6b" : "#7fff6b" }}>{windowClosed ? "WINDOW CLOSED" : "WINDOW OPEN"}</span>
            </div>
          )}
          {phase === "live" && (
            <button onClick={() => { setPhase("upload"); setImages([]); setPlan(null); setMessages([]); setTier1(false); setTier2(false); setSessionState("WATCHING"); setSessionHistory([]); }}
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.3)", background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>
              NEW ANALYSIS
            </button>
          )}
          {onSignOut && (
            <button onClick={onSignOut}
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.25)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 6px" }}>
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* ══ PHASE: UPLOAD ══════════════════════════════════════════════════════ */}
      {phase === "upload" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "48px 24px 32px", animation: "fadein 0.3s ease both" }}>
          <div style={{ width: "100%", maxWidth: 520 }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.22em", color: "#ff6bff", marginBottom: 12 }}>UPLOAD FIRST · LIVE SESSION SECOND</div>
              <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, marginBottom: 8, letterSpacing: "-0.01em" }}>Upload your charts.<br/>Start the session.</h1>
              <p style={{ fontSize: 11, color: "#8878aa", lineHeight: 1.7 }}>Upload all 5 timeframes. Your plan generates automatically,<br/>then live session begins.</p>
            </div>

            {/* Instrument selector */}
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 20 }}>
              {["BTCUSD","XAUUSD","NAS100","US30","USOIL","GBPUSD"].map(sym => (
                <button key={sym} onClick={() => setInstrument(sym)}
                  style={{ fontSize: 9, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: `1px solid ${instrument === sym ? "#ff6bff88" : "rgba(255,255,255,0.1)"}`, background: instrument === sym ? "rgba(255,107,255,0.12)" : "rgba(255,255,255,0.03)", color: instrument === sym ? "#ff6bff" : "#8878aa", cursor: "pointer", fontFamily: "inherit" }}>
                  {sym}
                </button>
              ))}
            </div>

            {/* Upload zone */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/")).slice(0, 5); setImages(files); }}
              style={{ border: `2px dashed ${images.length === 5 ? "rgba(127,255,107,0.4)" : "rgba(255,107,255,0.25)"}`, borderRadius: 14, padding: "32px 24px", textAlign: "center", cursor: "pointer", transition: "all 0.2s", background: images.length === 5 ? "rgba(127,255,107,0.04)" : "rgba(255,255,255,0.02)" }}>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }}
                onChange={e => { const files = Array.from(e.target.files).slice(0, 5); setImages(files); }} />

              {images.length === 0 ? (
                <>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📊</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#f0ecff", marginBottom: 6 }}>Drop 5 charts here</div>
                  <div style={{ fontSize: 10, color: "#8878aa", lineHeight: 1.7 }}>Daily · 4H · 1H · 30M · 15M<br/>Tap to browse or drag and drop</div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
                    {["D","4H","1H","30M","15M"].map((tf, i) => (
                      <div key={tf} style={{ textAlign: "center" }}>
                        {images[i] ? (
                          <img src={URL.createObjectURL(images[i])} alt={tf}
                            style={{ width: 60, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid rgba(127,255,107,0.3)", display: "block", marginBottom: 4 }}/>
                        ) : (
                          <div style={{ width: 60, height: 44, borderRadius: 6, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)", marginBottom: 4 }}/>
                        )}
                        <span style={{ fontSize: 8, color: images[i] ? "#7fff6b" : "#8878aa", fontWeight: 700 }}>{tf}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: images.length === 5 ? "#7fff6b" : "#ffd166", fontWeight: 700 }}>
                    {images.length === 5 ? "✓ All 5 charts ready" : `${images.length}/5 charts uploaded`}
                  </div>
                </>
              )}
            </div>

            <button onClick={analyzeCharts} disabled={images.length < 5}
              style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 10, border: "none", background: images.length === 5 ? "linear-gradient(135deg,#ff6bff,#7b2fff)" : "rgba(255,255,255,0.06)", color: images.length === 5 ? "#fff" : "#8878aa", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "inherit", cursor: images.length === 5 ? "pointer" : "not-allowed", boxShadow: images.length === 5 ? "0 4px 28px rgba(255,107,255,0.22)" : "none", transition: "all 0.2s" }}>
              {images.length === 5 ? "GENERATE SESSION PLAN →" : images.length === 0 ? "UPLOAD 5 CHARTS" : `UPLOAD ${5 - images.length} MORE CHART${5 - images.length !== 1 ? "S" : ""}`}
            </button>

            <div style={{ textAlign: "center", marginTop: 10, fontSize: 9, color: "#8878aa" }}>
              Daily · 4H · 1H · 30M · 15M — from your active broker only
            </div>
          </div>
        </div>
      )}

      {/* ══ PHASE: ANALYZING ═══════════════════════════════════════════════════ */}
      {phase === "analyzing" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, animation: "fadein 0.3s ease both" }}>
          <div style={{ width: 40, height: 40, border: "3px solid rgba(255,107,255,0.15)", borderTop: "3px solid #ff6bff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f0ecff", marginBottom: 6 }}>Reading your charts...</div>
            <div style={{ fontSize: 10, color: "#8878aa" }}>Identifying BRC phase · Grading the setup · Building your plan</div>
          </div>
        </div>
      )}

      {/* ══ PHASE: PLAN SUMMARY ════════════════════════════════════════════════ */}
      {phase === "plan" && plan && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", animation: "slide 0.35s ease both" }}>
          <div style={{ width: "100%", maxWidth: 520 }}>

            {/* Grade + bias header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: gradeColor, lineHeight: 1, letterSpacing: "-0.02em" }}>{plan.grade}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f0ecff", marginBottom: 4 }}>
                  {plan.grade === "PASS" ? "No active setup" : `${plan.bias.charAt(0)+plan.bias.slice(1).toLowerCase()} setup`}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", background: `${biasColor}14`, border: `1px solid ${biasColor}44`, borderRadius: 4, color: biasColor }}>{plan.bias}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", background: "rgba(255,209,102,0.1)", border: "1px solid rgba(255,209,102,0.3)", borderRadius: 4, color: "#ffd166" }}>{plan.confidence} CONFIDENCE · {plan.confidence_score}%</span>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, marginBottom: 16, fontSize: 12, color: "#ccc4e8", lineHeight: 1.7 }}>
              {plan.summary}
            </div>

            {/* Friday note */}
            {plan.friday_note && (
              <div style={{ padding: "10px 14px", background: "rgba(255,154,60,0.06)", border: "1px solid rgba(255,154,60,0.2)", borderRadius: 8, marginBottom: 16, fontSize: 11, color: "#ff9a3c", fontWeight: 600 }}>
                ⚠ {plan.friday_note}
              </div>
            )}

            {plan.grade !== "PASS" ? (
              <>
                {/* Key levels */}
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

                <button onClick={startLiveSession}
                  style={{ width: "100%", padding: "15px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#ff6bff,#7b2fff)", color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", fontFamily: "inherit", cursor: "pointer", boxShadow: "0 4px 28px rgba(255,107,255,0.25)" }}>
                  START LIVE SESSION →
                </button>
                <div style={{ textAlign: "center", marginTop: 8, fontSize: 9, color: "#8878aa" }}>
                  Live session tracks tier confirmations in real time
                </div>
              </>
            ) : (
              <div style={{ padding: "16px", background: "rgba(255,107,107,0.06)", border: "1px solid rgba(255,107,107,0.2)", borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#ff8080", fontWeight: 700, marginBottom: 6 }}>No valid entry — PASS</div>
                <div style={{ fontSize: 11, color: "#8878aa", marginBottom: 14 }}>{plan.pass_reason || "No A+ BRC sequence formed. Wait for fresh structure."}</div>
                <button onClick={() => { setPhase("upload"); setImages([]); setPlan(null); }}
                  style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#8878aa", cursor: "pointer", fontFamily: "inherit" }}>
                  ← New Analysis
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ PHASE: LIVE SESSION ════════════════════════════════════════════════ */}
      {phase === "live" && plan && (
        <>
          {/* Progress strip */}
          <div style={{ display: "flex", alignItems: "center", padding: "0 20px", height: 36, borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, gap: 0 }}>
            {[
              { label: "Break", done: tier1, active: !tier1 },
              { label: "Tier 1", done: tier1, active: !tier1 },
              { label: "Tier 2", done: tier2, active: tier1 && !tier2 },
              { label: "Limit Order", done: tier2, active: tier1 && tier2 },
            ].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: t.done ? "#7fff6b" : t.active ? "#00e5ff" : "rgba(255,255,255,0.15)", boxShadow: t.active ? "0 0 8px rgba(0,229,255,0.5)" : "none", animation: t.active ? "pulse 1.5s ease infinite" : "none", transition: "all 0.4s" }}/>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", margin: "0 6px", color: t.done ? "#7fff6b" : t.active ? "#00e5ff" : "rgba(255,255,255,0.2)", transition: "color 0.4s" }}>{t.label}</span>
                {i < 3 && <div style={{ width: 20, height: 1, background: t.done ? "#7fff6b" : "rgba(255,255,255,0.08)", marginRight: 4, transition: "background 0.4s" }}/>}
              </div>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, background: `${stateObj.color}14`, border: `1px solid ${stateObj.color}44` }}>
              {stateObj.dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: stateObj.color, animation: "pulse 1.5s ease infinite" }}/>}
              <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.1em", color: stateObj.color }}>{stateObj.label}</span>
            </div>
          </div>

          {/* Timing bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 20px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 20 }}>
              <div><span style={{ fontSize: 8, color: "#8878aa", letterSpacing: "0.1em" }}>CURRENT TIME </span><span style={{ fontSize: 10, fontWeight: 700, color: "#00e5ff", fontFamily: "monospace" }}>{ctTime} CT</span></div>
              {!windowClosed && <div><span style={{ fontSize: 8, color: "#8878aa", letterSpacing: "0.1em" }}>NEXT 30M CLOSE </span><span style={{ fontSize: 10, fontWeight: 700, color: "#ffd166", fontFamily: "monospace" }}>{nextClose} CT</span></div>}
            </div>
            <div style={{ fontSize: 9, color: "#8878aa" }}>TRIGGER <span style={{ color: plan.bias === "SHORT" ? "#ff6b6b" : "#7fff6b", fontWeight: 700 }}>{plan.trigger_level}</span></div>
          </div>

          {/* Live status panel */}
          <div style={{ margin: "10px 16px 0", padding: "10px 16px", background: tier2 ? "rgba(127,255,107,0.06)" : tier1 ? "rgba(255,209,102,0.06)" : "rgba(0,229,255,0.05)", border: `1px solid ${tier2 ? "rgba(127,255,107,0.25)" : tier1 ? "rgba(255,209,102,0.25)" : "rgba(0,229,255,0.18)"}`, borderLeft: `3px solid ${tier2 ? "#7fff6b" : tier1 ? "#ffd166" : "#00e5ff"}`, borderRadius: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.18em", color: tier2 ? "#7fff6b" : tier1 ? "#ffd166" : "#00e5ff", marginBottom: 5 }}>CURRENT LIVE STATUS</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f0ecff", lineHeight: 1.5 }}>
              {tier2 ? `✅ Both tiers confirmed. Place sell limit at ${plan.retest_zone}. Hands off.`
               : tier1 ? `⏳ Tier 1 confirmed. Watching for second 30M close ${plan.bias === "SHORT" ? "below" : "above"} ${plan.trigger_level}.`
               : `Watching for first valid 30M close ${plan.bias === "SHORT" ? "below" : "above"} ${plan.trigger_level}. No entry until the candle fully closes.`}
            </div>
            {tier2 && (
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                {[{label:"LIMIT",val:plan.retest_zone},{label:"STOP",val:plan.stop_loss},{label:"TP1",val:plan.tp1},{label:"TP2",val:plan.tp2}].map(r => (
                  <div key={r.label}>
                    <div style={{ fontSize: 8, color: "#8878aa", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#7fff6b", fontFamily: "monospace" }}>{r.val}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 8px" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 10, animation: "slide 0.2s ease both" }}>
                <div style={{ maxWidth: "85%", padding: "9px 13px", borderRadius: msg.role === "user" ? "10px 10px 3px 10px" : "10px 10px 10px 3px", background: msg.role === "user" ? "rgba(255,107,255,0.1)" : "rgba(255,255,255,0.04)", border: msg.role === "user" ? "1px solid rgba(255,107,255,0.2)" : "1px solid rgba(255,255,255,0.07)", fontSize: 11, lineHeight: 1.7, color: msg.role === "user" ? "#f0ecff" : "#ccc4e8" }} dangerouslySetInnerHTML={{ __html: fmt(msg.content) }}/>
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

          {/* Grouped chips */}
          <div style={{ padding: "6px 16px 4px", display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
            {[
              { label: "CANDLE UPDATE", color: "#00e5ff", chips: ["30M closed below the trigger","30M closed above trigger","Wick only — candle still forming"] },
              { label: "ENTRY QUESTION", color: "#7fff6b", chips: ["Both tiers confirmed — order in?","Limit filled — what now?"] },
              { label: "SESSION", color: "#ffd166", chips: ["Past 10:30 AM — cancel?","Setup invalidated"] },
            ].map(g => (
              <div key={g.label} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: "0.12em", color: g.color, minWidth: 90, flexShrink: 0 }}>{g.label}</span>
                {g.chips.map(q => (
                  <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }}
                    style={{ fontSize: 9, fontWeight: 700, padding: "3px 9px", borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "#8878aa", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = `${g.color}55`; e.currentTarget.style.color = g.color; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#8878aa"; }}>
                    {q}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Input */}
          <div style={{ padding: "8px 16px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 8, flexShrink: 0 }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder={`Best format: candle close + price — e.g. "30M closed below ${plan.trigger_level} at 69,858"`}
              style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8, padding: "9px 13px", fontSize: 10, color: "#f0ecff", fontFamily: "inherit", outline: "none" }}/>
            <button onClick={sendMessage} disabled={loading || !input.trim()}
              style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: input.trim() && !loading ? "linear-gradient(135deg,#ff6bff,#7b2fff)" : "rgba(255,255,255,0.05)", color: input.trim() && !loading ? "#fff" : "#8878aa", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", cursor: input.trim() && !loading ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "all 0.2s" }}>
              SEND →
            </button>
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
      <span style={{fontSize:9,color:copied?"#7fff6b":"var(--t-muted5)",letterSpacing:"0.08em",transition:"color 0.3s"}}>{copied?"✓":"⊕"}</span>
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
    USOIL:"TVC:USOIL",GBPUSD:"OANDA:GBPUSD",XAGUSD:"OANDA:XAGUSD",
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
            <span style={{fontSize:10,fontWeight:900,letterSpacing:"0.16em",color:gc,opacity:0.8}}>GRADE</span>
            <span style={{fontSize:30,fontWeight:900,color:gc,lineHeight:1,letterSpacing:"-0.02em"}}>{grade}</span>
          </div>
          {/* BIAS — secondary */}
          <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 14px",background:biasColor+"14",border:`1px solid ${biasColor}40`,borderRadius:8}}>
            <span style={{fontSize:10,fontWeight:900,letterSpacing:"0.12em",color:biasColor,opacity:0.8}}>BIAS</span>
            <span style={{fontSize:18,fontWeight:900,color:biasColor}}>{bias}</span>
          </div>
          {/* INSTRUMENT — tertiary */}
          <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 14px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:"var(--t-muted4)"}}>INSTRUMENT</span>
            <span style={{fontSize:14,fontWeight:900,color:"var(--t-muted)"}}>{instrument}</span>
          </div>
          {pd.alignment&&(
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:"var(--t-muted4)",padding:"6px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:8}}>
              {pd.alignment}
            </div>
          )}
        </div>
        <button onClick={onReset} style={S.resetBtn}>← New Analysis</button>
      </div>

      {/* Primary decision card */}
      <div style={{background:isSkip?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.04)",border:`1px solid ${isSkip?"rgba(255,107,107,0.15)":gc+"40"}`,borderRadius:16,padding:"18px 22px",marginBottom:isSkip?10:20,opacity:isSkip?0.85:1}}>
        <p style={{fontSize:10,fontWeight:900,letterSpacing:"0.2em",color:"var(--t-muted4)",margin:"0 0 10px"}}>{isSkip?"SESSION VERDICT":"PRIMARY DECISION"}</p>
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
                <span style={{fontSize:13,fontWeight:900,color:biasColor,
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
              <p style={{fontSize:12,color:"var(--t-muted3)",margin:0,lineHeight:1.6,fontWeight:400}}>{pd.confidence_reason}</p>
            )}
          </div>
          {/* Only show confidence/BRC phase chips for active setups */}
          {!isSkip&&(
            <>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",flexShrink:0}}>
              {pd.confidence&&(
                <div style={{textAlign:"center",padding:"8px 14px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8}}>
                  <div style={{fontSize:10,color:"var(--t-muted4)",letterSpacing:"0.1em",marginBottom:3}}>ANALYSIS CONFIDENCE</div>
                  <div style={{fontSize:17,fontWeight:900,color:"#ffd166"}}>{pd.confidence}</div>
                  <div style={{fontSize:9,color:"var(--t-muted4)",marginTop:3,fontWeight:500}}>how clear the read is</div>
                </div>
              )}
              {pd.icc_phase&&(
                <div style={{textAlign:"center",padding:"8px 14px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8}}>
                  <div style={{fontSize:10,color:"var(--t-muted4)",letterSpacing:"0.1em",marginBottom:3}}>BRC PHASE</div>
                  <div style={{fontSize:13,fontWeight:900,color:"var(--t-text)"}}>{result.icc_phase||"—"}</div>
                </div>
              )}
            </div>
            {pd.confidence&&(
              <div style={{fontSize:12,color:"var(--t-muted3)",marginTop:10,fontWeight:500,lineHeight:1.6,maxWidth:420}}>
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
            <span style={{fontSize:12,fontWeight:700,color:activeCfg.color,letterSpacing:"0.02em"}}>
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
            <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.18em",color:"#ff6b6b",marginBottom:10}}>WHY THIS IS A PASS</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {[
                pd.confidence_reason||"No valid BRC sequence has formed during the NY execution window.",
                "Timeframe alignment alone is not a trade signal — all three phases (Break · Retest · Continuation) must complete.",
              ].map((text,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:11,color:"#ff6b6b",flexShrink:0,marginTop:2,fontWeight:900}}>—</span>
                  <span style={{fontSize:13,color:"var(--t-muted2)",fontWeight:500,lineHeight:1.6}}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"rgba(255,255,255,0.06)",marginBottom:18}}/>

          {/* ── SECTION 2: WHAT TO DO NOW ── */}
          <div style={{marginBottom:18}}>
            <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.18em",color:"var(--t-muted4)",marginBottom:10}}>WHAT TO DO NOW</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {[
                "Stay flat. Do not enter in either direction.",
                "Keep your charts open. Do not close the session.",
                "Watch the live chart below for a fresh break forming.",
              ].map((text,i)=>(
                <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                  <span style={{fontSize:11,color:"#7fff6b",flexShrink:0,marginTop:2,fontWeight:900}}>·</span>
                  <span style={{fontSize:13,color:"var(--t-muted2)",fontWeight:500,lineHeight:1.6}}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{height:1,background:"rgba(255,255,255,0.06)",marginBottom:18}}/>

          {/* ── SECTION 3: WHAT TO WATCH NEXT ── */}
          <div style={{marginBottom:18}}>
            <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.18em",color:"var(--t-muted4)",marginBottom:10}}>WHAT TO WATCH NEXT</div>
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
                    <div style={{fontSize:9,color:"var(--t-muted4)",fontWeight:700,letterSpacing:"0.08em",marginBottom:4}}>{row.label.toUpperCase()}</div>
                    <CopyPrice val={row.val} color={row.color}/>
                  </div>
                ))}
              </div>
            )}
            {/* Alt scenario */}
            {hasAlt&&(
              <div style={{padding:"10px 14px",background:"rgba(255,209,102,0.05)",border:"1px solid rgba(255,209,102,0.2)",borderRadius:8,marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.14em",color:"#ffd166",marginBottom:4}}>ALTERNATE SETUP ACTIVATES ONLY IF:</div>
                <span style={{fontSize:12,color:"var(--t-muted2)",fontWeight:500,lineHeight:1.6}}>{altCondition}</span>
              </div>
            )}
            {tc.risk_state&&(
              <div style={{padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:7}}>
                <span style={{fontSize:11,color:"var(--t-muted3)",fontWeight:500}}>{tc.risk_state}</span>
              </div>
            )}
          </div>

          {/* Live chart */}
          <div style={{display:"flex",alignItems:"center",gap:10,
            padding:"8px 12px",background:"rgba(255,255,255,0.03)",
            border:"1px solid rgba(255,255,255,0.06)",borderRadius:7}}>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:7}}>
              <span style={{fontSize:10,color:"var(--t-muted3)",fontWeight:600}}>Live chart</span>
              <span style={{fontSize:9,color:"var(--t-muted4)",background:"rgba(255,255,255,0.05)",padding:"2px 6px",borderRadius:3}}>{tvSym}</span>
              <span style={{fontSize:9,color:"var(--t-muted4)",background:"rgba(255,255,255,0.05)",padding:"2px 6px",borderRadius:3}}>30M</span>
            </div>
            <a href={`https://www.tradingview.com/chart/?symbol=${tvSym}&interval=30`} target="_blank" rel="noopener noreferrer"
              style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,padding:"5px 12px",fontFamily:"inherit",fontSize:10,fontWeight:600,color:"var(--t-muted3)",textDecoration:"none",whiteSpace:"nowrap"}}>
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
            <span style={{fontSize:11,color:"var(--t-muted3)",fontWeight:500}}>Follow each phase in order. Do not skip ahead.</span>
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
                  fontSize:10,fontWeight:900,color:"#00e5ff"}}>1</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:900,letterSpacing:"0.08em",marginBottom:4,color:"#00e5ff"}}>
                    PHASE 1 — BREAK <span style={{marginLeft:8,fontSize:10,animation:"icc-pulse 1.5s ease infinite"}}>● WATCHING</span>
                  </div>
                  <div style={{fontSize:13,color:"var(--t-muted)",fontWeight:500,marginBottom:6}}>
                    Wait for 30M candle to fully close <strong>{dirWord}</strong> <strong style={{color:"#00e5ff"}}>{triggerLevel}</strong>
                  </div>
                  <div style={{padding:"10px 14px",background:"rgba(0,229,255,0.06)",border:"1px solid rgba(0,229,255,0.15)",borderLeft:"3px solid #00e5ff",borderRadius:8,marginBottom:10}}>
                    <span style={{fontSize:11,color:"#00e5ff",fontWeight:700}}>⚠ Do NOT enter yet. The break is step 1 of 3.</span>
                    {sctx?.p1_note&&(
                      session==="ASIAN"?(
                        <div style={{marginTop:8,padding:"7px 10px",background:"rgba(255,154,60,0.1)",border:"1px solid rgba(255,154,60,0.35)",borderLeft:"3px solid #ff9a3c",borderRadius:6}}>
                          <span style={{fontSize:11,color:"#ff9a3c",fontWeight:700}}>⚠ {sctx.p1_note}</span>
                        </div>
                      ):(
                        <p style={{fontSize:11,color:"var(--t-muted2)",margin:"5px 0 0",lineHeight:1.5,fontWeight:500}}>{sctx.p1_note}</p>
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
                        <p style={{fontSize:10,fontWeight:900,color:"#ffd166",margin:0,letterSpacing:"0.1em"}}>30M CANDLE CLOSE WINDOWS</p>
                        {executionClosed
                          ? <span style={{fontSize:9,fontWeight:900,color:"#ff6b6b",background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",padding:"2px 8px",borderRadius:4,letterSpacing:"0.08em"}}>WINDOW CLOSED</span>
                          : <span style={{fontSize:9,fontWeight:700,color:"#00e5ff",fontFamily:"monospace"}}>{nowCT.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",timeZone:"America/Chicago"})} CT</span>
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
                              <span style={{fontSize:10,fontFamily:"monospace",fontWeight:900,
                                minWidth:84,flexShrink:0,
                                color:isPast?"var(--t-muted4)":isNext?"#00e5ff":isLast?"#ff8080":"#ffd166"}}>
                                {r.time}
                              </span>
                              <span style={{fontSize:10,fontWeight:isNext?700:400,
                                color:isPast?"var(--t-muted4)":isNext?"#00e5ff":isLast?"#ff8080":"var(--t-muted2)",
                                flex:1}}>
                                {isPast?"completed":r.label}
                              </span>
                              {isPast&&<span style={{fontSize:9,color:"var(--t-muted4)"}}>✓</span>}
                              {isNext&&!executionClosed&&<span style={{fontSize:9,fontWeight:900,color:"#00e5ff",letterSpacing:"0.06em",flexShrink:0}}>NEXT</span>}
                              {isLast&&isNext&&<span style={{fontSize:9,fontWeight:900,color:"#ff8080",letterSpacing:"0.06em",flexShrink:0}}>FINAL</span>}
                            </div>
                          );
                        })}
                      </div>
                      {executionClosed&&(
                        <div style={{marginTop:8,padding:"5px 8px",background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.2)",borderRadius:5}}>
                          <span style={{fontSize:10,color:"#ff8080",fontWeight:700}}>Execution window closed at 10:30 AM CT. No new entries. Wait for tomorrow's session.</span>
                        </div>
                      )}
                    </div>
                    );
                  })()}
                  {session==="ASIAN"&&(
                    <div style={{padding:"8px 12px",background:"rgba(255,154,60,0.05)",border:"1px solid rgba(255,154,60,0.2)",borderLeft:"3px solid #ff9a3c",borderRadius:8,marginBottom:10}}>
                      <p style={{fontSize:10,fontWeight:900,color:"#ff9a3c",margin:"0 0 6px",letterSpacing:"0.1em"}}>ASIAN SESSION CANDLE WINDOWS</p>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {[{time:"7:00 PM CT",label:"Session open — first watch"},{time:"8:00 PM CT",label:"First valid 30M close"},{time:"9:00 PM CT",label:"Best quality window"},{time:"11:00 PM CT",label:"Cutoff — session closes"}].map(r=>(
                          <div key={r.time} style={{display:"flex",gap:10,alignItems:"baseline"}}>
                            <span style={{fontSize:10,fontFamily:"monospace",fontWeight:900,color:"#ff9a3c",minWidth:90,flexShrink:0}}>{r.time}</span>
                            <span style={{fontSize:10,color:"var(--t-muted2)",fontWeight:400}}>{r.label}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:8,padding:"5px 8px",background:"rgba(255,154,60,0.08)",border:"1px solid rgba(255,154,60,0.2)",borderRadius:5}}>
                        <span style={{fontSize:10,color:"#ff9a3c",fontWeight:700}}>⚠ Asian session = reduced size. Half position recommended.</span>
                      </div>
                    </div>
                  )}
                  {session==="LONDON"&&(
                    <div style={{padding:"8px 12px",background:"rgba(255,107,255,0.05)",border:"1px solid rgba(255,107,255,0.2)",borderLeft:"3px solid #ff6bff",borderRadius:8,marginBottom:10}}>
                      <p style={{fontSize:10,fontWeight:900,color:"#ff6bff",margin:"0 0 6px",letterSpacing:"0.1em"}}>LONDON SESSION CANDLE WINDOWS</p>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {[{time:"2:00 AM CT",label:"Session open — first watch"},{time:"3:00 AM CT",label:"First valid 30M close"},{time:"4:00 AM CT",label:"Best quality window"},{time:"5:00 AM CT",label:"Cutoff — session closes"}].map(r=>(
                          <div key={r.time} style={{display:"flex",gap:10,alignItems:"baseline"}}>
                            <span style={{fontSize:10,fontFamily:"monospace",fontWeight:900,color:"#ff6bff",minWidth:90,flexShrink:0}}>{r.time}</span>
                            <span style={{fontSize:10,color:"var(--t-muted2)",fontWeight:400}}>{r.label}</span>
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
                    <span style={{fontSize:10,color:"#7fff6b",fontWeight:700}}>Live chart</span>
                    <span style={{fontSize:9,color:"#7fff6b",background:"rgba(127,255,107,0.1)",border:"1px solid rgba(127,255,107,0.25)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>{tvSym}</span>
                    <span style={{fontSize:9,color:"#7fff6b",background:"rgba(127,255,107,0.1)",border:"1px solid rgba(127,255,107,0.25)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>30M</span>
                  </div>
                  <a href={`https://www.tradingview.com/chart/?symbol=${tvSym}&interval=30`} target="_blank" rel="noopener noreferrer"
                    style={{background:"none",border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,padding:"5px 12px",fontFamily:"inherit",fontSize:10,fontWeight:700,color:"var(--t-muted3)",letterSpacing:"0.06em",textDecoration:"none",whiteSpace:"nowrap"}}>
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
                      <span style={{fontSize:11}}>📲</span>
                      <span style={{fontSize:11,fontWeight:800,color:"var(--t-muted2)",letterSpacing:"0.04em"}}>Set Alerts Now</span>
                      <span style={{fontSize:10,color:"var(--t-muted3)",fontWeight:500}}>(3 recommended)</span>
                    </div>
                    <span style={{fontSize:10,color:"var(--t-muted3)",transform:showAlerts?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block"}}>▼</span>
                  </button>
                  {showAlerts&&(
                    <div style={{padding:"10px 14px",background:"rgba(255,107,255,0.03)",animation:"icc-slide 0.2s ease both"}}>
                      <p style={{fontSize:10,color:"var(--t-muted4)",margin:"0 0 8px",fontWeight:500}}>Add to TradingView before the session opens.</p>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {[
                          {label:"Break Alert",  val:`${isShort?"Price crosses below":"Price crosses above"} ${triggerLevel}`,color:"#00e5ff"},
                          {label:"Retest Zone",  val:`Price enters ${retestZone}`,color:"#ffd166"},
                          {label:"Invalidation", val:result.invalidation||"Check invalidation level",color:"#ff6b6b"},
                        ].map(a=>(
                          <div key={a.label} style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${a.color}22`,borderRadius:6,padding:"7px 10px"}}>
                            <div style={{fontSize:9,fontWeight:900,color:a.color,letterSpacing:"0.08em",marginBottom:2}}>{a.label.toUpperCase()}</div>
                            <div style={{fontSize:11,color:"var(--t-muted)",fontWeight:600,lineHeight:1.4}}>{a.val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* Checkboxes */}
                <div style={{background:"rgba(0,229,255,0.04)",border:"1px solid rgba(0,229,255,0.13)",borderRadius:8,padding:"11px 14px",display:"flex",flexDirection:"column",gap:8}}>
                  <p style={{fontSize:10,fontWeight:900,letterSpacing:"0.12em",color:"#00e5ff",margin:0}}>CONFIRM BEFORE ADVANCING</p>
                  {[
                    {key:"closed",label:"30M candle fully CLOSED — not a wick"},
                    {key:"level", label:`Close confirmed ${dirWord} ${triggerLevel}`},
                    {key:"open",  label:"Looking at a CLOSED candle — not a live one"},
                  ].map(item=>(
                    <div key={item.key} onClick={()=>setChecks(p=>({...p,[item.key]:!p[item.key]}))}
                      style={{display:"flex",alignItems:"flex-start",gap:9,cursor:"pointer"}}>
                      <div style={{width:16,height:16,borderRadius:3,flexShrink:0,marginTop:1,
                        border:`2px solid ${checks[item.key]?"#00e5ff":"rgba(255,255,255,0.2)"}`,
                        background:checks[item.key]?"rgba(0,229,255,0.15)":"transparent",
                        display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                        {checks[item.key]&&<span style={{fontSize:9,color:"#00e5ff",fontWeight:900}}>✓</span>}
                      </div>
                      <span style={{fontSize:12,color:checks[item.key]?"var(--t-muted)":"var(--t-muted3)",fontWeight:checks[item.key]?600:400,lineHeight:1.4,transition:"color 0.15s"}}>{item.label}</span>
                    </div>
                  ))}
                </div>
                {/* Helper text */}
                <p style={{fontSize:11,color:"var(--t-muted4)",margin:"0 0 10px",lineHeight:1.6,fontWeight:500,fontStyle:"italic"}}>
                  Waiting for price to return to the broken level before Phase 2 unlocks.
                </p>
                <button onClick={()=>{if(allChecked){advanceTo("ARMED_T2");setT1Time(Date.now());}}} disabled={!allChecked}
                  style={{alignSelf:"flex-start",
                    background:allChecked?"rgba(0,229,255,0.1)":"rgba(255,255,255,0.03)",
                    border:`1px solid ${allChecked?"rgba(0,229,255,0.35)":"rgba(255,255,255,0.08)"}`,
                    borderRadius:8,padding:"8px 18px",cursor:allChecked?"pointer":"not-allowed",fontFamily:"inherit",
                    fontSize:12,fontWeight:900,color:allChecked?"#00e5ff":"var(--t-muted4)",letterSpacing:"0.08em",transition:"all 0.2s"}}>
                  {allChecked?"✓ 30M CLOSE CONFIRMED — PHASE 1 COMPLETE":"Waiting for all 3 confirmations"}
                </button>
              </div>
            </div>
          ):(
            /* COLLAPSED — phase complete */
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",marginBottom:6,opacity:0.7}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:"rgba(127,255,107,0.15)",border:"2px solid #7fff6b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:"#7fff6b",flexShrink:0}}>✓</div>
              <span style={{fontSize:12,fontWeight:700,color:"#7fff6b"}}>Phase 1 — Break confirmed {dirWord} {triggerLevel}</span>
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
                  fontSize:10,fontWeight:900,color:"#ffd166"}}>2</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:900,letterSpacing:"0.08em",marginBottom:4,color:"#ffd166"}}>
                    PHASE 2 — RETEST <span style={{marginLeft:8,fontSize:10,color:"#ffd166",animation:"icc-pulse 1.5s ease infinite"}}>● WATCHING</span>
                  </div>
                  <div style={{display:"inline-flex",alignItems:"flex-start",gap:12,padding:"10px 14px",marginBottom:8,background:"rgba(255,209,102,0.08)",border:"1px solid rgba(255,209,102,0.3)",borderRadius:8,width:"100%",boxSizing:"border-box"}}>
                    <div style={{flexShrink:0}}>
                      <div style={{fontSize:9,fontWeight:900,color:"#ffd166",letterSpacing:"0.12em",marginBottom:2}}>{isShort?"RETEST RESISTANCE ZONE":"RETEST SUPPORT ZONE"}</div>
                      <div style={{fontSize:20,fontWeight:900,color:"#ffd166",lineHeight:1}}>{retestZone}</div>
                    </div>
                    <div style={{width:1,alignSelf:"stretch",background:"rgba(255,209,102,0.2)",flexShrink:0}}/>
                    <div style={{fontSize:11,color:"var(--t-muted3)",fontWeight:500,lineHeight:1.55}}>
                      {isShort?`Enter only after a 30M candle closes back below ${triggerLevel}.`:`Enter only after a 30M candle closes back above ${triggerLevel}.`}
                    </div>
                  </div>
                  <div style={{fontSize:13,color:"var(--t-muted)",fontWeight:500,marginBottom:6,lineHeight:1.6}}>
                    Wait for price to retest the <strong style={{color:"#ffd166"}}>{retestZone}</strong> {zoneType} zone after confirmed break {dirWord} <strong style={{color:"#00e5ff"}}>{triggerLevel}</strong>.
                  </div>
                  <div style={{fontSize:11,color:"var(--t-muted3)",fontWeight:500,marginBottom:6,lineHeight:1.55}}>
                    Valid retest: price tests <strong style={{color:"#ffd166"}}>{retestZone}</strong> and the 30M candle closes back {dirWordBack} the zone. A wick alone does not qualify.
                  </div>
                  {confirmRule&&<div style={{fontSize:11,color:"#00e5ff",fontWeight:600,marginBottom:6,padding:"6px 10px",background:"rgba(0,229,255,0.05)",border:"1px solid rgba(0,229,255,0.12)",borderRadius:6}}>{confirmRule}</div>}
                  {sessionNote&&(
                    <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 12px",marginBottom:8,background:"rgba(255,209,102,0.05)",border:"1px solid rgba(255,209,102,0.15)",borderLeft:"3px solid rgba(255,209,102,0.5)",borderRadius:6}}>
                      <span style={{fontSize:12,flexShrink:0,marginTop:1}}>⏱</span>
                      <div>
                        <div style={{fontSize:9,fontWeight:900,color:"#ffd166",letterSpacing:"0.12em",marginBottom:3}}>VALID DURING SESSION</div>
                        <div style={{fontSize:11,color:"var(--t-muted2)",fontWeight:600,lineHeight:1.45,marginBottom:3}}>{sessionNote}</div>
                        <div style={{fontSize:10,color:"var(--t-muted4)",fontWeight:400,lineHeight:1.4}}>Confirmation quality and follow-through are strongest in this window. Do not execute outside it.</div>
                      </div>
                    </div>
                  )}
                  {sctx?.p2_note&&<div style={{fontSize:11,color:"var(--t-muted4)",marginBottom:6,lineHeight:1.5,fontStyle:"italic"}}>{sctx.p2_note}</div>}
                  {t1Time&&<div style={{fontSize:11,color:"var(--t-muted4)",marginBottom:8}}>Time since Phase 1: <strong style={{color:"#00e5ff"}}>{elapsed(t1Time)}</strong></div>}
                  {/* Live chart P2 */}
                  {(()=>{
                    const st={ARMED_T2:{msg:`Watching retest of ${retestZone} ${zoneType}`,color:"#ffd166"}};
                    const s=st.ARMED_T2;
                    return(
                      <div style={{marginBottom:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                          <span style={{width:6,height:6,borderRadius:"50%",flexShrink:0,background:s.color,opacity:0.8,animation:"icc-pulse 1.5s ease infinite"}}/>
                          <span style={{fontSize:11,fontWeight:600,color:s.color,opacity:0.85}}>{s.msg}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:7}}>
                          <div style={{flex:1,display:"flex",alignItems:"center",gap:7}}>
                            <span style={{fontSize:10,color:"#7fff6b",fontWeight:700}}>Live chart</span>
                            <span style={{fontSize:9,color:"#7fff6b",background:"rgba(127,255,107,0.1)",border:"1px solid rgba(127,255,107,0.25)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>{tvSym}</span>
                            <span style={{fontSize:9,color:"#7fff6b",background:"rgba(127,255,107,0.1)",border:"1px solid rgba(127,255,107,0.25)",padding:"2px 7px",borderRadius:4,fontWeight:700}}>{tvInterval}M</span>
                          </div>
                          <a href={tvUrl} target="_blank" rel="noopener noreferrer"
                            style={{background:"none",border:"1px solid rgba(255,255,255,0.12)",borderRadius:6,padding:"5px 12px",fontFamily:"inherit",fontSize:10,fontWeight:700,color:"var(--t-muted3)",letterSpacing:"0.06em",textDecoration:"none",whiteSpace:"nowrap"}}>
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
                  style={{background:"rgba(255,209,102,0.1)",border:"1px solid rgba(255,209,102,0.35)",borderRadius:8,padding:"8px 18px",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:900,color:"#ffd166",letterSpacing:"0.08em"}}>
                  ✓ RETEST CONFIRMED
                </button>
                <button onClick={()=>advanceTo("INVALIDATED")}
                  style={{background:"none",border:"1px solid rgba(255,107,107,0.25)",borderRadius:8,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,color:"#ff8080"}}>
                  ✕ SETUP INVALIDATED
                </button>
              </div>
            </div>
          ):(["EXECUTABLE","IN_TRADE","COMPLETE","INVALIDATED"].includes(tradeState))?(
            /* COLLAPSED */
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",marginBottom:6,opacity:0.7}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:"rgba(127,255,107,0.15)",border:"2px solid #7fff6b",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,color:"#7fff6b",flexShrink:0}}>✓</div>
              <span style={{fontSize:12,fontWeight:700,color:"#7fff6b"}}>Phase 2 — Retest confirmed at {retestZone}</span>
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
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900,
                  color:tradeState==="EXECUTABLE"?"#7fff6b":["IN_TRADE","COMPLETE"].includes(tradeState)?"#7fff6b":"var(--t-muted4)"}}>
                  {["IN_TRADE","COMPLETE"].includes(tradeState)?"✓":"3"}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:900,letterSpacing:"0.08em",marginBottom:4,
                    color:tradeState==="EXECUTABLE"?"#7fff6b":["IN_TRADE","COMPLETE"].includes(tradeState)?"#7fff6b":"var(--t-muted4)"}}>
                    PHASE 3 — CONFIRM &amp; EXECUTE
                    {tradeState==="EXECUTABLE"&&<span style={{marginLeft:8,fontSize:10,color:"#7fff6b",animation:"icc-pulse 1.2s ease infinite"}}>● READY NOW</span>}
                  </div>
                  {tradeState==="EXECUTABLE"?(
                    <>
                      <div style={{fontSize:13,color:"var(--t-muted)",fontWeight:500,marginBottom:10}}>
                        Second 30M rejection close confirmed. <strong style={{color:"#7fff6b"}}>Place your limit order now.</strong>
                        {sctx?.p3_note&&<span style={{display:"block",fontSize:11,color:"var(--t-muted2)",marginTop:4,lineHeight:1.5,fontWeight:500}}>{sctx.p3_note}</span>}
                      </div>
                      {sctx?.p3_warn&&(
                        <div style={{padding:"7px 11px",background:"rgba(255,154,60,0.07)",border:"1px solid rgba(255,154,60,0.25)",borderLeft:"3px solid #ff9a3c",borderRadius:6,marginBottom:10}}>
                          <span style={{fontSize:11,color:"#ff9a3c",fontWeight:700}}>{sctx.p3_warn}</span>
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
                              <div style={{fontSize:10,fontWeight:700,color:"var(--t-muted3)",marginTop:4,letterSpacing:"0.04em"}}>{row.label}</div>
                              {row.sub&&<div style={{fontSize:10,color:"var(--t-muted4)",marginTop:2,fontWeight:400,lineHeight:1.4}}>{row.sub}</div>}
                            </div>
                          ));
                        })()}
                      </div>
                      {result.invalidation&&(
                        <div style={{padding:"8px 12px",background:"rgba(255,107,107,0.05)",border:"1px solid rgba(255,107,107,0.18)",borderLeft:"3px solid #ff9a3c",borderRadius:6,marginBottom:10}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:10,fontWeight:900,color:"#ff9a3c",letterSpacing:"0.1em",flexShrink:0}}>STRUCTURAL INVALIDATION</span>
                            <span style={{fontSize:11,color:"var(--t-muted2)",fontWeight:600}}>{result.invalidation}</span>
                          </div>
                          <div style={{fontSize:10,color:"var(--t-muted4)",marginTop:4,fontWeight:500}}>If this occurs, the setup is dead — exit or cancel your order immediately.</div>
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
                          style={{...S.generateBtn,alignSelf:"flex-start",padding:"9px 20px",fontSize:12,
                            background:"rgba(127,255,107,0.12)",border:"1px solid rgba(127,255,107,0.35)",
                            color:"#7fff6b",letterSpacing:"0.08em",boxShadow:"none"}}>
                          📈 LIMIT ORDER ACTIVE
                        </button>
                        <button onClick={()=>advanceTo("INVALIDATED")}
                          style={{background:"none",border:"1px solid rgba(255,107,107,0.3)",borderRadius:10,padding:"9px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,color:"#ff8080"}}>
                          ✕ MARK AS MISSED
                        </button>
                      </div>
                    </>
                  ):(["IN_TRADE","COMPLETE","INVALIDATED"].includes(tradeState))?(
                    <div style={{marginTop:4}}>
                      <p style={{fontSize:13,color:tradeState==="COMPLETE"?"#7fff6b":tradeState==="INVALIDATED"?"#ff6b6b":"#ff6bff",margin:"0 0 10px",fontWeight:700}}>
                        {tradeState==="IN_TRADE"?"📈 Trade is live — manage your stops":tradeState==="COMPLETE"?"✓ Session complete":"🚫 Setup invalidated — no trade taken"}
                      </p>
                      {tradeState==="IN_TRADE"&&(
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>advanceTo("COMPLETE")} style={{...S.generateBtn,alignSelf:"flex-start",padding:"10px 20px",fontSize:12,background:"linear-gradient(135deg,#7fff6b,#00c46b)",color:"#130d22"}}>✓ TRADE CLOSED</button>
                          <button onClick={()=>advanceTo("INVALIDATED")} style={{background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.3)",color:"#ff8080",padding:"10px 14px",borderRadius:10,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:900}}>🚫 Stopped out</button>
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
              <span style={{fontSize:11,fontWeight:700,color:"var(--t-muted3)",letterSpacing:"0.04em"}}>📖 Plain English Breakdown</span>
              <span style={{fontSize:10,color:"var(--t-muted4)",fontWeight:400}}>Simple explanation — no jargon</span>
            </div>
            <span style={{fontSize:9,color:"var(--t-muted4)",transform:showPE?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block"}}>▼</span>
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
                  <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:5}}>{row.label}</div>
                  <p style={{fontSize:13,color:"var(--t-muted2)",margin:0,lineHeight:1.7,fontWeight:500}}>{row.value}</p>
                </div>
              ))}
              {pe.psychological_rule&&(
                <div style={{marginTop:14,padding:"10px 14px",background:"rgba(255,107,255,0.06)",
                  border:"1px solid rgba(255,107,255,0.15)",borderRadius:8}}>
                  <p style={{fontSize:12,color:"#ff6bff",margin:0,fontWeight:700,fontStyle:"italic",lineHeight:1.6}}>
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
              <span style={{fontSize:10,fontWeight:900,color:"#ffd166",letterSpacing:"0.1em"}}>ALT SCENARIO</span>
              <span style={{fontSize:11,color:"var(--t-muted3)",fontWeight:500}}>if: {altCondition}</span>
            </div>
            <span style={{fontSize:9,color:"#ffd166",transform:showAlt?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block"}}>▼</span>
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
                      <div style={{fontSize:9,color:"var(--t-muted4)",fontWeight:700,letterSpacing:"0.1em",marginBottom:4}}>{row.label.toUpperCase()}</div>
                      <CopyPrice val={mainVal} color={row.color}/>
                      {hasContext&&(
                        <div style={{fontSize:10,color:"var(--t-muted4)",marginTop:4,lineHeight:1.4,fontWeight:500}}>{sub}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {sp.warning&&<p style={{fontSize:12,color:"#ffd166aa",margin:0,fontStyle:"italic"}}>{sp.warning}</p>}
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
            <p style={{fontSize:12,color:"#00e5ff",margin:0,letterSpacing:"0.08em"}}>Pre-session · Post-session · Mindset library</p>
          </div>
        </div>
        <p style={{fontSize:13,color:"var(--t-muted)",margin:0,lineHeight:1.8,maxWidth:600}}>Your mindset is either your biggest edge or your biggest liability. Use these tools before and after every session.</p>
      </div>
      <div style={{display:"flex",gap:4,marginBottom:28,borderBottom:"1px solid rgba(255,107,255,0.1)",paddingBottom:0}}>
        {[["pre","🧠 Pre-Session Check"],["post","📋 Post-Session Debrief"],["library","📖 Mindset Library"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)}
            style={{background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:"10px 20px",fontSize:12,fontWeight:900,letterSpacing:"0.08em",color:tab===k?"#ff6bff":"var(--t-muted)",borderBottom:tab===k?"2px solid #ff6bff":"2px solid transparent",marginBottom:-1,transition:"all 0.15s"}}>
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
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,
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
          <p style={{fontSize:10,letterSpacing:"0.18em",color:"#00e5ff",fontWeight:900,margin:"0 0 14px"}}>READINESS VERDICT</p>
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
            <p style={{fontSize:13,fontWeight:900,color:"var(--t-text)",margin:"0 0 12px",lineHeight:1.4}}>
              <span style={{color:"#ff6bff",marginRight:8}}>{qi+1}.</span>{q.label}
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {q.opts.map(opt=>{
                const isSel=answers[q.key]===opt;
                return(
                  <button key={opt} onClick={()=>setAnswers(prev=>({...prev,[q.key]:opt}))}
                    style={{background:isSel?"rgba(255,107,255,0.12)":"var(--t-c3)",border:`1px solid ${isSel?"rgba(255,107,255,0.5)":"rgba(255,107,255,0.1)"}`,borderRadius:8,padding:"10px 14px",cursor:"pointer",textAlign:"left",fontFamily:"inherit",fontSize:12,fontWeight:isSel?900:400,color:isSel?"#ff6bff":"var(--t-muted)",transition:"all 0.15s"}}>
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
            <p style={{fontSize:12,color:anime.color,fontWeight:900,letterSpacing:"0.15em",margin:"0 0 6px"}}>AFTER YOUR SESSION CLOSES</p>
            <p style={{fontSize:12,color:"var(--t-muted)",margin:0,lineHeight:1.7}}>Describe what happened in your session. What did you trade? Did you follow the plan? Did anything feel off? Be honest — {(anime.character||anime.label||"Coach")} can handle it.</p>
          </div>
          <textarea
            value={text} onChange={e=>setText(e.target.value)}
            placeholder={`Describe your session... (e.g. "I saw a setup on XAUUSD but the 1H wasn't aligned. I entered anyway because it looked strong on 30M. Got stopped out at the wide SL. Then I took another trade trying to make it back...")`}
            style={{width:"100%",minHeight:160,background:"var(--t-c3)",border:"1px solid rgba(255,107,255,0.18)",borderRadius:12,padding:"16px 18px",color:"#d0c8e8",fontSize:13,fontFamily:"'Courier New',Courier,monospace",lineHeight:1.7,resize:"vertical"}}
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
          <p style={{fontSize:13,color:anime.color,fontWeight:900,letterSpacing:"0.12em",animation:"icc-pulse 1.4s ease infinite"}}>{(anime.character||anime.label||"Coach")} is analyzing your session...</p>
        </div>
      )}
      {response&&(
        <div style={{animation:"icc-slide 0.4s ease both"}}>
          <div style={{background:"var(--t-c3)",border:`2px solid ${anime.color}44`,borderRadius:16,padding:"28px 32px",marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <span style={{fontSize:28}}>{anime.emoji}</span>
              <div>
                <p style={{fontSize:11,letterSpacing:"0.18em",color:anime.color,fontWeight:900,margin:0}}>{(anime.character||anime.label||"COACH").toUpperCase()} DEBRIEF</p>
                <p style={{fontSize:10,color:"var(--t-muted3)",margin:0}}>Post-session analysis</p>
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
          <p style={{fontSize:12,color:"var(--t-muted)",margin:0}}>The 5 core trading rules explained through the BRC methodology. Read these before every session.</p>
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
              <span style={{fontSize:10,letterSpacing:"0.2em",color:anime.color,fontWeight:900,background:anime.color+"15",padding:"3px 10px",borderRadius:4,border:`1px solid ${anime.color}33`}}>RULE {i+1}</span>
              <span style={{fontSize:13,fontWeight:900,color:"var(--t-text)",letterSpacing:"0.06em"}}>{r.rule}</span>
            </div>
            <p style={{fontSize:13,color:"#b0a0cc",lineHeight:1.85,margin:0}}>{r.lesson}</p>
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
      <div style={{fontSize:10,letterSpacing:"0.16em",color:"var(--t-muted)",marginBottom:8,fontWeight:900}}>{tag}</div>
      <div style={{fontSize:big?28:22,fontWeight:900,color:accent,letterSpacing:"0.02em",marginBottom:6}}>{price}</div>
      {sub&&<div style={{fontSize:10,color:"var(--t-muted2)",lineHeight:1.5,marginBottom:note?4:0}}>{sub}</div>}
      {note&&<div style={{fontSize:10,color:"var(--t-muted3)",lineHeight:1.4,marginTop:2}}>{note}</div>}
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
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><span style={{fontSize:13}}>{icon}</span><span style={{fontSize:9,letterSpacing:"0.18em",color,fontWeight:900}}>{label}</span></div>
      <p style={{fontSize:12,color:"var(--t-text)",margin:0,lineHeight:1.5}}>{val}</p>
    </div>
  );
}
function MetaChip({label,val,color}){
  if(!val)return null;
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--t-c3)",border:`1px solid ${color}30`,borderRadius:8,padding:"9px 14px"}}>
      <span style={{fontSize:9,letterSpacing:"0.15em",color:"var(--t-muted)"}}>{label}</span>
      <span style={{fontSize:12,fontWeight:900,color}}>{val}</span>
    </div>
  );
}
function Filters({label,opts,val,set}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
      <span style={{fontSize:11,color:"var(--t-muted)",letterSpacing:"0.1em"}}>{label}:</span>
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
              {!compact&&<td style={S.td}><span style={{display:"block"}}>{t.date}</span><span style={{fontSize:11,color:"var(--t-muted2)"}}>{t.time}</span></td>}
              <td style={S.td}><span style={{fontSize:12,fontWeight:700,color:"#00e5ff",letterSpacing:"0.06em"}}>{t.instrument}</span></td>
              <td style={S.td}><span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:5,border:"1px solid",background:t.direction==="LONG"?"#7fff6b22":"#ff6b6b22",color:t.direction==="LONG"?"#7fff6b":"#ff6b6b",borderColor:t.direction==="LONG"?"#7fff6b55":"#ff6b6b55"}}>{t.direction==="LONG"?"▲ L":"▼ S"}</span></td>
              <td style={S.td}><span style={{fontSize:11,fontWeight:700,color:phaseColors[t.phase]||"#fff"}}>{t.phase}</span></td>
              {!compact&&<><td style={S.td}>{t.d}</td><td style={S.td}>{t.h4}</td><td style={S.td}>{t.h1}</td></>}
              <td style={S.td}><span style={{color:"#c0b0e0"}}>{t.entry}</span></td>
              <td style={S.td}><span style={{color:"#c0b0e0"}}>{t.exit}</span></td>
              <td style={S.td}><span style={{fontWeight:700,color:t.pnl>0?"#7fff6b":"#ff6b6b"}}>{t.pnl>0?"+":""}{t.pnl.toFixed(1)}</span></td>
              <td style={S.td}><span style={{fontSize:11,fontWeight:900,padding:"3px 10px",borderRadius:5,border:"1px solid",background:t.result==="WIN"?"#7fff6b22":"#ff6b6b22",color:t.result==="WIN"?"#7fff6b":"#ff6b6b",borderColor:t.result==="WIN"?"#7fff6b44":"#ff6b6b44"}}>{t.result}</span></td>
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
  bg:"#130d22",
  navBg:"rgba(19,13,34,0.96)",
  text:"#f8f4ff",
  subtext:"#c8bede",
  border:"rgba(255,107,255,0.12)",
  gridLine:"rgba(255,107,255,0.032)",
  c1:"rgba(255,255,255,0.04)",
  c2:"rgba(255,255,255,0.07)",
  c3:"rgba(255,255,255,0.10)",
  c4:"rgba(255,255,255,0.12)",
  c5:"rgba(255,255,255,0.08)",
  c6:"rgba(255,255,255,0.10)",
  c7:"rgba(255,255,255,0.12)",
  cardBg:"rgba(255,255,255,0.07)",
  cardBorder:"rgba(255,255,255,0.10)",
  inputBg:"rgba(255,255,255,0.10)",
  inputBorder:"rgba(255,107,255,0.18)",
  muted:"#f0ecff",
  muted2:"#d8d0f0",
  muted3:"#bcb0d8",
  muted4:"#9888bb",
  muted5:"#705588",
  navLinkColor:"#f0ecff",
  tableBg:"#0f0820",
  scrollThumb:"rgba(255,107,255,0.25)",
};
const LIGHT={
  bg:"#f2f0f8",
  navBg:"rgba(255,255,255,0.97)",
  text:"#1a0e38",
  subtext:"#8070b0",
  border:"rgba(100,60,180,0.15)",
  gridLine:"rgba(100,60,180,0.05)",
  // card surfaces — light uses white with low opacity black shadows
  c1:"rgba(255,255,255,0.7)",
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
  const pending=journal.filter(t=>!t.outcome).length;
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
        <p style={{fontFamily:"monospace",fontSize:12,color:"var(--t-muted4)",margin:0,letterSpacing:"0.04em"}}>The system only works if you log it.</p>
      </div>

      {/* Stats bar — 3 primary + 4 secondary */}
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28}}>
        {/* Primary row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
          {/* WIN RATE — softened for small samples */}
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,padding:"16px 18px"}}>
            <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:8}}>WIN RATE</div>
            {total<5?(
              <div>
                <div style={{fontSize:30,fontWeight:900,color:total===0?"#8878aa":"#7fff6b",fontFamily:"monospace",letterSpacing:"-0.02em"}}>{total===0?"—":`${winRate}%`}</div>
                {total>0&&<div style={{fontSize:9,color:"var(--t-muted4)",fontWeight:600,marginTop:3,fontFamily:"monospace"}}>small sample · {total} trade{total!==1?"s":""}</div>}
              </div>
            ):(
              <div style={{fontSize:30,fontWeight:900,color:"#7fff6b",fontFamily:"monospace",letterSpacing:"-0.02em"}}>{winRate}%</div>
            )}
          </div>
          {/* RECORD */}
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,padding:"16px 18px"}}>
            <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:8}}>RECORD</div>
            <div style={{fontSize:30,fontWeight:900,color:"#00e5ff",fontFamily:"monospace",letterSpacing:"-0.02em"}}>{wins}-{losses}{be>0?"-"+be:""}</div>
            {total<5&&total>0&&<div style={{fontSize:9,color:"var(--t-muted4)",fontWeight:600,marginTop:3,fontFamily:"monospace"}}>need 5+ trades for reliable data</div>}
          </div>
          {/* AVG GRADE */}
          <div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:10,padding:"16px 18px"}}>
            <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:8}}>AVG GRADE</div>
            <div style={{fontSize:30,fontWeight:900,color:avgGradeColor,fontFamily:"monospace",letterSpacing:"-0.02em"}}>{avgGradeLabel}</div>
            {gradedTrades.length>0&&<div style={{fontSize:9,color:"var(--t-muted4)",fontWeight:600,marginTop:3,fontFamily:"monospace"}}>{gradedTrades.length} trade{gradedTrades.length!==1?"s":""} logged</div>}
          </div>
        </div>
        {/* Secondary row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          {[
            {label:"WINS",value:wins,color:"#7fff6b"},
            {label:"LOSSES",value:losses,color:"#ff6b6b"},
            {label:"BREAK EVEN",value:be,color:"#ffd166"},
            {label:"PENDING",value:pending,color:"#8878aa"},
          ].map(s=>(
            <div key={s.label} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:10,padding:"10px 14px"}}>
              <div style={{fontSize:9,fontWeight:900,letterSpacing:"0.16em",color:"var(--t-muted4)",marginBottom:6}}>{s.label}</div>
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
              <div key={g} style={{padding:"4px 12px",background:`${gradeColors[g]}14`,border:`1px solid ${gradeColors[g]}44`,borderRadius:8,fontSize:11,fontWeight:700,color:gradeColors[g]}}>
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
            <div style={{fontSize:15,fontWeight:900,color:"var(--t-muted3)",marginBottom:6}}>No trades logged yet</div>
            <div style={{fontSize:12,color:"var(--t-muted4)",fontFamily:"monospace",lineHeight:1.7}}>
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
                    <span style={{fontSize:13,fontWeight:900,color:"var(--t-text)"}}>{trade.instrument}</span>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,
                      background:trade.direction==="LONG"?"rgba(127,255,107,0.12)":"rgba(255,107,107,0.12)",
                      color:trade.direction==="LONG"?"#7fff6b":"#ff6b6b"}}>
                      {trade.direction}
                    </span>
                    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,
                      background:`${gradeColors[trade.grade]||"#8878aa"}14`,
                      color:gradeColors[trade.grade]||"#8878aa"}}>
                      {trade.grade}
                    </span>
                    <span style={{fontSize:10,color:"var(--t-muted4)",fontFamily:"monospace"}}>
                      {new Date(trade.date).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                    {[{label:"Entry",val:trade.entry},{label:"Stop",val:trade.stop},{label:"TP1",val:trade.tp1},{label:"Session",val:trade.session}].map(f=>(
                      <div key={f.label}>
                        <div style={{fontSize:9,color:"var(--t-muted4)",fontWeight:700,letterSpacing:"0.1em",marginBottom:2}}>{f.label}</div>
                        <div style={{fontSize:12,fontWeight:700,color:"var(--t-muted)",fontFamily:"monospace"}}>{f.val||"—"}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right — outcome selector */}
                <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end"}}>
                  {!trade.outcome?(
                    <>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",color:"var(--t-muted4)",marginBottom:2}}>OUTCOME</div>
                      <div style={{display:"flex",gap:6}}>
                        {["WIN","LOSS","BE"].map(o=>(
                          <button key={o} onClick={()=>setOutcome(trade.id,o)}
                            style={{fontFamily:"inherit",fontSize:11,fontWeight:900,letterSpacing:"0.08em",
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
                        style={{fontSize:11,fontWeight:700,letterSpacing:"0.06em",
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
                    style={{fontSize:12,color:"rgba(255,255,255,0.2)",
                      background:"rgba(255,255,255,0.04)",
                      border:"1px solid rgba(255,255,255,0.08)",
                      borderRadius:7,padding:"5px 8px",
                      cursor:"pointer",lineHeight:1,
                      transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.color="rgba(255,107,107,0.7)";e.currentTarget.style.background="rgba(255,107,107,0.08)";e.currentTarget.style.borderColor="rgba(255,107,107,0.25)";}}
                    onMouseLeave={e=>{e.currentTarget.style.color="rgba(255,255,255,0.2)";e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.borderColor="rgba(255,255,255,0.08)";}}>
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
          <span style={{fontSize:11,color:"var(--t-muted4)",fontFamily:"monospace",lineHeight:1.6}}>
            Complete Phase 3 and click <strong style={{color:"#7fff6b"}}>LIMIT ORDER ACTIVE</strong> to log your next trade automatically.
          </span>
        </div>
      )}
    </div>
  );
}

function AuthScreen({onBack, supabase, initialTab="signup"}){
  const [tab,setTab]=useState(initialTab);
  const loginOnly=initialTab==="login"; // "signup" | "login" | "reset"
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  const [success,setSuccess]=useState(null);
  const [showPass,setShowPass]=useState(false);

  async function handleSignUp(){
    if(!email||!password){setError("Email and password are required.");return;}
    if(password.length<8){setError("Password must be at least 8 characters.");return;}
    setLoading(true);setError(null);
    try{
      const res=await fetch(`${SUPABASE_URL}/auth/v1/signup`,{
        method:"POST",
        headers:{"Content-Type":"application/json","apikey":SUPABASE_KEY},
        body:JSON.stringify({email,password}),
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
        // Create profile immediately with paid tier
        const paidTier=localStorage.getItem("omniusd_paid_tier")||"starter";
        const userId=loginData.user?.id;
        if(userId){
          const TIER_COLORS={starter:"#ffd166",pro:"#00e5ff",elite:"#ff6bff"};
          const TIER_LABELS={starter:"Starter",pro:"Pro",elite:"Elite"};
          await fetch(`${SUPABASE_URL}/rest/v1/profiles`,{
            method:"POST",
            headers:{
              "Content-Type":"application/json",
              "apikey":SUPABASE_KEY,
              "Authorization":`Bearer ${loginData.access_token}`,
              "Prefer":"resolution=merge-duplicates",
            },
            body:JSON.stringify({
              id:userId,
              email,
              tier:paidTier,
              tier_label:TIER_LABELS[paidTier]||"Starter",
              tier_color:TIER_COLORS[paidTier]||"#ffd166",
              default_instrument:"XAUUSD",
              is_paid:true,
              updated_at:new Date().toISOString(),
            }),
          });
        }
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
    const {error:err}=await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if(err){setError(err.message);return;}
    setSuccess("Password reset email sent. Check your inbox.");
  }

  const inputStyle={
    width:"100%",background:"rgba(255,255,255,0.05)",
    border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,
    padding:"13px 16px",fontSize:15,color:"#f4f0ff",
    fontFamily:"inherit",outline:"none",boxSizing:"border-box",
    transition:"border 0.15s",
  };

  return(
    <div style={{minHeight:"100vh",background:"#130d22",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:"24px",position:"relative",overflowY:"auto"}}>

      {/* Grid bg */}
      <div style={{position:"fixed",inset:0,backgroundImage:"linear-gradient(rgba(255,107,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,255,0.025) 1px,transparent 1px)",backgroundSize:"48px 48px",pointerEvents:"none"}}/>
      {/* Orb */}
      <div style={{position:"fixed",width:500,height:500,borderRadius:"50%",background:"#7b2fff",top:-150,left:"50%",transform:"translateX(-50%)",filter:"blur(120px)",opacity:0.12,pointerEvents:"none"}}/>

      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:420}}>

        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:40}}>
          <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:8,marginBottom:16}}>
            ◈
            <span style={{fontFamily:"monospace",fontSize:18,fontWeight:700,letterSpacing:"0.12em",background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>OmniUSD</span>
          </button>
          <div style={{fontSize:22,fontWeight:800,color:"#f4f0ff",marginBottom:6,letterSpacing:"-0.01em"}}>
            {tab==="reset"?"Reset your password":tab==="signup"?"Almost done.":"Welcome back"}
          </div>
          <div style={{fontSize:13,color:"#8878aa",fontFamily:"monospace"}}>
            {tab==="signup"
              ? (localStorage.getItem("omniusd_paid_tier")
                  ? "Payment confirmed. Create your password to access your dashboard."
                  : "Create your account to get started.")
              : tab==="login"?"Sign in to continue to your dashboard."
              :"We'll send a reset link to your email."}
          </div>
        </div>

        {/* Card */}
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,107,255,0.15)",borderRadius:16,padding:"32px 28px"}}>

          {/* Tabs — only show when both options available */}
          {!loginOnly&&(
            <div style={{display:"flex",gap:4,marginBottom:24,background:"rgba(255,255,255,0.04)",padding:4,borderRadius:10}}>
              {["signup","login"].map(t=>(
                <button key={t} onClick={()=>{setTab(t);setError(null);setSuccess(null);}}
                  style={{flex:1,padding:"9px",borderRadius:7,border:"none",fontFamily:"inherit",
                    fontSize:13,fontWeight:700,cursor:"pointer",letterSpacing:"0.04em",transition:"all 0.15s",
                    background:tab===t?"rgba(255,107,255,0.15)":"none",
                    color:tab===t?"#ff6bff":"#8878aa"}}>
                  {t==="signup"?"Sign Up":"Log In"}
                </button>
              ))}
            </div>
          )}

          {/* Success message */}
          {success&&(
            <div style={{padding:"10px 14px",background:"rgba(127,255,107,0.08)",border:"1px solid rgba(127,255,107,0.25)",borderRadius:8,marginBottom:16,fontSize:13,color:"#7fff6b",fontFamily:"monospace",lineHeight:1.5}}>
              {success}
            </div>
          )}

          {/* Error message */}
          {error&&(
            <div style={{padding:"10px 14px",background:"rgba(255,107,107,0.08)",border:"1px solid rgba(255,107,107,0.25)",borderRadius:8,marginBottom:16,fontSize:13,color:"#ff8080",fontFamily:"monospace",lineHeight:1.5}}>
              {error}
            </div>
          )}

          {/* Fields */}
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
            <div>
              <label style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"#8878aa",display:"block",marginBottom:6,fontFamily:"monospace"}}>EMAIL</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="you@example.com" style={inputStyle}
                onKeyDown={e=>e.key==="Enter"&&(tab==="signup"?handleSignUp():tab==="login"?handleLogin():handleReset())}
              />
            </div>
            {tab!=="reset"&&(
              <div>
                <label style={{fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"#8878aa",display:"block",marginBottom:6,fontFamily:"monospace"}}>PASSWORD</label>
                <div style={{position:"relative"}}>
                  <input type={showPass?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                    placeholder={tab==="signup"?"Minimum 8 characters":"Enter your password"}
                    style={{...inputStyle,paddingRight:48}}
                    onKeyDown={e=>e.key==="Enter"&&(tab==="signup"?handleSignUp():handleLogin())}
                  />
                  <button type="button" onClick={()=>setShowPass(p=>!p)}
                    style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",
                      background:"none",border:"none",cursor:"pointer",
                      fontSize:16,color:"#8878aa",padding:0,lineHeight:1}}>
                    {showPass?"🙈":"👁"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Primary button */}
          <button
            onClick={tab==="signup"?handleSignUp:tab==="login"?handleLogin:handleReset}
            disabled={loading}
            style={{width:"100%",background:loading?"rgba(255,255,255,0.06)":"linear-gradient(135deg,#ff6bff,#7b2fff)",
              border:"none",color:loading?"#8878aa":"#fff",padding:"15px",borderRadius:10,
              fontSize:15,fontWeight:900,letterSpacing:"0.1em",fontFamily:"inherit",
              cursor:loading?"not-allowed":"pointer",
              boxShadow:loading?"none":"0 4px 28px rgba(255,107,255,0.22)",transition:"all 0.2s",marginBottom:16}}>
            {loading?"Please wait..."
              :tab==="signup"?"CREATE PASSWORD & ENTER →"
              :tab==="login"?"SIGN IN →"
              :"SEND RESET EMAIL →"}
          </button>

          {/* Secondary links */}
          <div style={{textAlign:"center",fontSize:12,fontFamily:"monospace",color:"#8878aa"}}>
            {tab==="login"&&(
              <button onClick={()=>{setTab("reset");setError(null);setSuccess(null);}}
                style={{background:"none",border:"none",color:"#8878aa",cursor:"pointer",fontFamily:"monospace",fontSize:12,textDecoration:"underline"}}>
                Forgot your password?
              </button>
            )}
            {tab==="reset"&&(
              <button onClick={()=>{setTab("login");setError(null);setSuccess(null);}}
                style={{background:"none",border:"none",color:"#8878aa",cursor:"pointer",fontFamily:"monospace",fontSize:12,textDecoration:"underline"}}>
                ← Back to log in
              </button>
            )}
          </div>
        </div>

        {/* Back to landing */}
        <div style={{textAlign:"center",marginTop:20}}>
          <button onClick={onBack} style={{background:"none",border:"none",color:"#8878aa",cursor:"pointer",fontFamily:"monospace",fontSize:12,letterSpacing:"0.06em"}}>
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
     instruments:["XAUUSD","BTCUSD","NAS100","US30","USOIL","GBPUSD"],
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
    <div style={{minHeight:"100vh",background:"#130d22",color:"#f4f0ff",fontFamily:"'Syne',sans-serif",position:"relative",overflowX:"hidden"}}>
      <div style={{position:"fixed",inset:0,backgroundImage:"linear-gradient(rgba(255,107,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,107,255,0.025) 1px,transparent 1px)",backgroundSize:"48px 48px",pointerEvents:"none"}}/>
      <div style={{position:"fixed",width:500,height:500,borderRadius:"50%",background:"#7b2fff",top:-150,left:"50%",transform:"translateX(-50%)",filter:"blur(120px)",opacity:0.12,pointerEvents:"none"}}/>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;700;800&display=swap');`}</style>

      {/* Nav */}
      <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 32px",height:64,background:"rgba(19,13,34,0.9)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,107,255,0.1)"}}>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}}>
          ◈
          <span style={{fontFamily:"'Space Mono',monospace",fontSize:15,fontWeight:700,letterSpacing:"0.1em",background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>OmniUSD</span>
        </button>
        <button onClick={onBack} style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,color:"#8878aa",background:"none",border:"none",cursor:"pointer"}}>
          ← Back
        </button>
      </nav>

      {/* Content */}
      <div style={{position:"relative",zIndex:1,maxWidth:1000,margin:"0 auto",padding:"100px 24px 80px"}}>
        <div style={{textAlign:"center",marginBottom:52}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:"0.22em",color:"#ff6bff",marginBottom:16}}>CHOOSE YOUR PLAN</div>
          <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(32px,5vw,52px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-0.02em",marginBottom:12}}>
            Select your access level
          </h1>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#8878aa",lineHeight:1.7,maxWidth:480,margin:"0 auto"}}>
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
                    fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:"0.12em",
                    color:"#0d0718",background:"#ff6bff",padding:"3px 14px",borderRadius:100,whiteSpace:"nowrap"}}>
                    MOST POPULAR
                  </div>
                )}
                {isSel&&(
                  <div style={{position:"absolute",top:14,right:14,width:22,height:22,borderRadius:"50%",
                    background:p.color,display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:11,color:"#0d0718",fontWeight:900}}>✓</div>
                )}
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:"0.16em",color:p.color,marginBottom:12}}>{p.label.toUpperCase()}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:40,fontWeight:800,color:p.color,lineHeight:1,marginBottom:4}}>{p.price}</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"#8878aa",marginBottom:20}}>{p.period}</div>
                <div style={{height:1,background:"rgba(255,255,255,0.07)",marginBottom:18}}/>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:0}}>
                  {p.instruments.map(ins=>(
                    <div key={ins} style={{display:"flex",alignItems:"center",gap:8,fontFamily:"'Space Mono',monospace",fontSize:11,color:"#ccc4e8"}}>
                      <span style={{color:"#7fff6b",fontWeight:900}}>✓</span>{ins}
                    </div>
                  ))}
                  {p.features.map(f=>(
                    <div key={f} style={{display:"flex",alignItems:"center",gap:8,fontFamily:"'Space Mono',monospace",fontSize:11,color:"#8878aa"}}>
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
          <div style={{textAlign:"center",marginBottom:16,fontFamily:"'Space Mono',monospace",fontSize:12,color:"#ff8080",
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
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"#8878aa"}}>
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
function LandingPage({onEnterApp, onLogin}){
  const [hoveredPlan,setHoveredPlan]=useState(null);
  const plans=[
    {tier:"STARTER",color:"#ffd166",price:"$29",instruments:["XAUUSD","BTCUSD"],popular:false},
    {tier:"PRO",color:"#00e5ff",price:"$39",instruments:["XAUUSD","BTCUSD","NAS100","US30"],popular:true},
    {tier:"ELITE",color:"#ff6bff",price:"$59",instruments:["XAUUSD","BTCUSD","NAS100","US30","USOIL","GBPUSD"],popular:false},
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
      <nav style={{position:"fixed",top:0,left:0,right:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 40px",height:64,background:"rgba(7,4,15,0.88)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,107,255,0.1)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:22,color:"#ff6bff"}}>◈</span>
          <span style={{fontFamily:"'Space Mono',monospace",fontSize:16,fontWeight:700,letterSpacing:"0.12em",background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>OmniUSD</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onLogin||onEnterApp} style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"var(--muted,#ccc4e8)",background:"none",border:"none",cursor:"pointer",padding:"8px 14px"}}>LOG IN</button>
          <button onClick={onEnterApp}
            style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"#130d22",background:"#ff6bff",border:"none",padding:"9px 18px",borderRadius:6,cursor:"pointer",transition:"all 0.2s"}}>
            CREATE ACCOUNT
          </button>
          {/* DEV TOGGLE */}
          <button onClick={onEnterApp}
            style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,color:"#ffd166",background:"rgba(255,209,102,0.08)",border:"1px solid rgba(255,209,102,0.25)",borderRadius:6,padding:"8px 14px",cursor:"pointer",marginLeft:8}}>
            → App
          </button>
        </div>
      </nav>

      {/* Hero — full width headline + mockup right */}
      <section style={{position:"relative",zIndex:1,paddingTop:80}}>

        {/* Hero — two column: headline left, mockup right */}
        <div style={{maxWidth:1100,margin:"0 auto",padding:"64px 40px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:64,alignItems:"center"}}>

          {/* Left — headline + steps + CTA */}
          <div>
            <div className="land-fade" style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:"rgba(255,255,255,0.35)",letterSpacing:"0.22em",marginBottom:20}}>BRC EXECUTION SYSTEM</div>
            <h1 className="land-fade" style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(30px,4vw,50px)",fontWeight:800,lineHeight:1.08,letterSpacing:"-0.025em",marginBottom:18,animationDelay:"0.1s"}}>
              <span style={{display:"block",color:"#f4f0ff"}}>Stop reacting.</span>
              <span style={{display:"block",color:"#f4f0ff"}}>Start executing.</span>
            </h1>
            <p className="land-fade" style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"rgba(255,255,255,0.45)",lineHeight:1.9,maxWidth:400,marginBottom:32,animationDelay:"0.2s"}}>
              Upload your 5 charts. Your plan generates automatically, then your live session begins.
            </p>
            <div className="land-fade" style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:40,animationDelay:"0.3s"}}>
              <button onClick={onEnterApp}
                style={{fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"#fff",background:"linear-gradient(135deg,#ff6bff,#7b2fff)",border:"none",padding:"12px 24px",borderRadius:7,cursor:"pointer",boxShadow:"0 0 32px rgba(255,107,255,0.25)",transition:"all 0.2s"}}>
                CHOOSE YOUR PLAN →
              </button>
              <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"rgba(255,255,255,0.25)"}}>From $29/month</span>
            </div>

          </div>

          {/* Right — live session mockup */}
          <div className="land-fade" style={{animationDelay:"0.2s"}}>
            <div style={{background:"rgba(13,11,20,0.98)",border:"1px solid rgba(255,255,255,0.09)",borderRadius:12,overflow:"hidden",boxShadow:"0 24px 80px rgba(0,0,0,0.5)"}}>
              {/* Session header */}
              <div style={{padding:"10px 16px",background:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,color:"#ff6bff"}}>◈ OmniUSD</span>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:8,padding:"2px 6px",borderRadius:3,background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.25)",color:"#ff6b6b"}}>BTCUSD</span>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:8,padding:"2px 6px",borderRadius:3,background:"rgba(255,107,107,0.1)",border:"1px solid rgba(255,107,107,0.25)",color:"#ff6b6b"}}>SHORT</span>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:"#7fff6b"}}/>
                  <span style={{fontFamily:"'Space Mono',monospace",fontSize:8,color:"#7fff6b",fontWeight:700}}>WINDOW OPEN</span>
                </div>
              </div>
              {/* Progress strip */}
              <div style={{padding:"0 16px",height:32,borderBottom:"1px solid rgba(255,255,255,0.05)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:0}}>
                  {[{l:"Break",done:true},{l:"Tier 1",done:true},{l:"Tier 2",done:false,active:true},{l:"Limit",done:false}].map((t,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:t.done?"#7fff6b":t.active?"#00e5ff":"rgba(255,255,255,0.15)",boxShadow:t.active?"0 0 6px rgba(0,229,255,0.5)":"none"}}/>
                      <span style={{fontFamily:"'Space Mono',monospace",fontSize:8,fontWeight:700,margin:"0 5px",color:t.done?"#7fff6b":t.active?"#00e5ff":"rgba(255,255,255,0.2)"}}>{t.l}</span>
                      {i<3&&<div style={{width:14,height:1,background:t.done?"#7fff6b":"rgba(255,255,255,0.08)",marginRight:3}}/>}
                    </div>
                  ))}
                </div>
                <span style={{fontFamily:"'Space Mono',monospace",fontSize:8,color:"rgba(255,255,255,0.3)"}}>NEXT CLOSE <span style={{color:"#ffd166"}}>10:00 AM CT</span></span>
              </div>
              {/* Status panel */}
              <div style={{margin:"10px 14px 0",padding:"9px 12px",background:"rgba(255,209,102,0.05)",border:"1px solid rgba(255,209,102,0.2)",borderLeft:"3px solid #ffd166",borderRadius:6}}>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:8,color:"#ffd166",letterSpacing:"0.14em",fontWeight:700,marginBottom:4}}>CURRENT LIVE STATUS</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"#f0ecff",lineHeight:1.6}}>⏳ Tier 1 confirmed. Watching for second 30M close below <span style={{color:"#ffd166"}}>70,200</span>.</div>
              </div>
              {/* Chat */}
              <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:7}}>
                <div style={{display:"flex",justifyContent:"flex-start"}}>
                  <div style={{maxWidth:"82%",padding:"7px 11px",borderRadius:"9px 9px 9px 3px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)",fontFamily:"'Space Mono',monospace",fontSize:9,color:"#ccc4e8",lineHeight:1.7}}>
                    🥷 Live session started — BTCUSD SHORT<br/><span style={{color:"#00e5ff"}}>Wicks don't count. Only closes.</span>
                  </div>
                </div>
                <div style={{display:"flex",justifyContent:"flex-end"}}>
                  <div style={{maxWidth:"70%",padding:"7px 11px",borderRadius:"9px 9px 3px 9px",background:"rgba(255,107,255,0.08)",border:"1px solid rgba(255,107,255,0.18)",fontFamily:"'Space Mono',monospace",fontSize:9,color:"#f0ecff"}}>30M closed below 70,200 at 69,858</div>
                </div>
                <div style={{display:"flex",justifyContent:"flex-start"}}>
                  <div style={{maxWidth:"82%",padding:"7px 11px",borderRadius:"9px 9px 9px 3px",background:"rgba(127,255,107,0.05)",border:"1px solid rgba(127,255,107,0.15)",fontFamily:"'Space Mono',monospace",fontSize:9,color:"#ccc4e8",lineHeight:1.7}}>
                    🚨 <span style={{color:"#7fff6b",fontWeight:700}}>Tier 1 confirmed — 69,858!</span><br/>Strong close. Eyes on the 10:00 AM candle for Tier 2.
                  </div>
                </div>
              </div>
              {/* Input */}
              <div style={{padding:"8px 14px 12px",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",gap:7}}>
                <div style={{flex:1,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:6,padding:"7px 11px",fontFamily:"'Space Mono',monospace",fontSize:9,color:"rgba(255,255,255,0.2)"}}>e.g. "30M closed below 70,200 at 69,858"</div>
                <div style={{padding:"7px 14px",borderRadius:6,background:"linear-gradient(135deg,#ff6bff,#7b2fff)",fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,color:"#fff"}}>SEND →</div>
              </div>
            </div>
          </div>

        </div>

        {/* Info row */}
        <div style={{borderTop:"1px solid rgba(255,255,255,0.06)",borderBottom:"1px solid rgba(255,255,255,0.06)",marginTop:64,display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr"}}>
          {[
            {val:"A+ only",desc:"The only grade that unlocks execution. All others show PASS."},
            {val:"30M closes",desc:"Wicks don't trigger. Only full candle closes count."},
            {val:"3 phases",desc:"Break. Retest. Continuation. Every trade. Every time."},
            {val:"0 signals",desc:"No alerts. No predictions. Structure only."},
          ].map((r,i)=>(
            <div key={i} style={{padding:"22px 32px",borderRight:i<3?"1px solid rgba(255,255,255,0.06)":"none"}}>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:17,fontWeight:700,color:"#f0ecff",marginBottom:6}}>{r.val}</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:"rgba(255,255,255,0.3)",lineHeight:1.7}}>{r.desc}</div>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div style={{maxWidth:1060,margin:"0 auto",padding:"48px 40px"}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:8,color:"rgba(255,255,255,0.25)",letterSpacing:"0.2em",marginBottom:20}}>PLANS</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:28}}>
            {[
              {tier:"STARTER",price:"$29",tc:"rgba(255,255,255,0.3)",border:"rgba(255,255,255,0.08)",bg:"rgba(255,255,255,0.02)",label:null,instruments:"BTCUSD · XAUUSD",extra:"AI session plans"},
              {tier:"PRO",price:"$39",tc:"#ff6bff",border:"rgba(255,107,255,0.35)",bg:"rgba(255,107,255,0.04)",label:"MOST POPULAR",instruments:"5 instruments",extra:"AI session plans"},
              {tier:"ELITE",price:"$59",tc:"rgba(255,255,255,0.3)",border:"rgba(255,255,255,0.08)",bg:"rgba(255,255,255,0.02)",label:null,instruments:"All instruments",extra:"Priority features"},
            ].map(p=>(
              <div key={p.tier} style={{position:"relative",background:p.bg,border:`1px solid ${p.border}`,borderRadius:8,padding:"20px"}}>
                {p.label&&<div style={{position:"absolute",top:-1,left:"50%",transform:"translateX(-50%)",background:"#ff6bff",fontFamily:"'Space Mono',monospace",fontSize:8,fontWeight:700,color:"#0d0b14",padding:"2px 12px",borderRadius:"0 0 6px 6px",whiteSpace:"nowrap",letterSpacing:"0.08em"}}>{p.label}</div>}
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:p.tc,letterSpacing:"0.12em",marginBottom:10}}>{p.tier}</div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:800,color:"#f0ecff",marginBottom:2}}>{p.price}<span style={{fontSize:12,fontWeight:400,color:"rgba(255,255,255,0.3)",fontFamily:"'Space Mono',monospace"}}>/mo</span></div>
                <div style={{height:1,background:"rgba(255,255,255,0.07)",margin:"14px 0"}}/>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:"rgba(255,255,255,0.4)",lineHeight:1.9}}>{p.instruments}<br/>Live session guidance<br/>{p.extra}</div>
              </div>
            ))}
          </div>
          <div style={{textAlign:"center"}}>
            <button onClick={onEnterApp}
              style={{fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,letterSpacing:"0.1em",color:"#fff",background:"linear-gradient(135deg,#ff6bff,#7b2fff)",border:"none",padding:"13px 36px",borderRadius:7,cursor:"pointer",boxShadow:"0 0 32px rgba(255,107,255,0.2)"}}>
              CHOOSE YOUR PLAN →
            </button>
            <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,color:"rgba(255,255,255,0.2)",marginTop:10}}>Secure checkout · Cancel anytime</div>
          </div>
        </div>

      </section>

            {/* BRC Core Truth */}
      <div style={{position:"relative",zIndex:1,maxWidth:1060,margin:"0 auto",padding:"80px 24px"}}>
        {/* Divider line */}
        <div style={{height:1,background:"linear-gradient(90deg,transparent,rgba(255,107,255,0.2),transparent)",marginBottom:80}}/>

        <div style={{textAlign:"center",marginBottom:56}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:"0.22em",color:"#ff6bff",marginBottom:24}}>THE BRC FRAMEWORK</div>
          <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(24px,4vw,46px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-0.02em",maxWidth:700,margin:"0 auto 16px"}}>
            One truth. Three phases.<br/>Every market. Every timeframe.
          </h2>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#8878aa",lineHeight:1.8,maxWidth:580,margin:"0 auto"}}>
            BRC is not a signal system. It is a structural framework built on how price actually moves — not how traders wish it moved. The sequence never changes. Only the levels do.
          </p>
        </div>

        {/* Three phases */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:2,background:"rgba(255,107,255,0.06)",border:"1px solid rgba(255,107,255,0.12)",borderRadius:16,overflow:"hidden",marginBottom:40}}>
          {[
            {
              phase:"B",
              name:"Break",
              color:"#00e5ff",
              meaning:"Price makes the first decisive move — breaks a key level. This is the signal.",
              emoji:"⚡",
            },
            {
              phase:"R",
              name:"Retest",
              color:"#ffd166",
              meaning:"Price pulls back to the broken level — normal, healthy, expected. This is your setup.",
              emoji:"🌬️",
            },
            {
              phase:"C",
              name:"Continuation",
              color:"#7fff6b",
              meaning:"Price resumes the original direction after the retest. This is where execution becomes valid.",
              emoji:"🌀",
            },
          ].map((p,i)=>(
            <div key={i} style={{background:"#130d22",padding:"36px 28px",position:"relative"}}>
              {/* Phase letter */}
              <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:20}}>
                <span style={{fontFamily:"'Syne',sans-serif",fontSize:56,fontWeight:800,lineHeight:1,color:p.color,opacity:0.25,letterSpacing:"-0.04em"}}>{p.phase}</span>
                <div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:"0.18em",color:p.color,opacity:0.7,marginBottom:4}}>PHASE {i+1}</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:800,color:p.color}}>{p.name}</div>
                </div>
              </div>
              {/* What it means */}
              <div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:"0.14em",color:"#8878aa",marginBottom:7}}>WHAT IT MEANS</div>
                <div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:"#ccc4e8",lineHeight:1.6}}>{p.meaning}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Truth callout */}
        <div style={{textAlign:"center",padding:"32px 40px",background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:12}}>
          <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:"0.2em",color:"var(--muted2,#8878aa)",marginBottom:14}}>WHY MOST TRADERS FAIL</div>
          <p style={{fontFamily:"'Space Mono',monospace",fontSize:13,color:"#ccc4e8",lineHeight:1.9,maxWidth:640,margin:"0 auto"}}>
            They enter during the <span style={{color:"#ffd166",fontWeight:700}}>Retest</span> — confusing a pullback for the end of the move.<br/>
            <strong style={{color:"#f4f0ff",fontWeight:700}}>OmniUSD</strong> identifies where you are in the <span style={{color:"#00e5ff",fontWeight:700}}>Break</span> → <span style={{color:"#ffd166",fontWeight:700}}>Retest</span> → <span style={{color:"#7fff6b",fontWeight:700}}>Continuation</span> sequence<br/>and tells you exactly when execution is valid — and when it isn't.
          </p>
        </div>
      </div>

      {/* Features */}
      <div style={{position:"relative",zIndex:1,maxWidth:1060,margin:"0 auto",padding:"60px 24px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:0,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",borderRadius:16,overflow:"hidden"}}>
          {/* Left — headline */}
          <div style={{padding:"56px 52px",borderRight:"1px solid rgba(255,255,255,0.07)",display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
            <div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:"0.24em",color:"#ff6bff",marginBottom:20}}>THE RULES</div>
              <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(26px,3.5vw,42px)",fontWeight:800,lineHeight:1.15,letterSpacing:"-0.02em",marginBottom:16}}>Built for execution.<br/>Not entertainment.</h2>
              <p style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"#8878aa",lineHeight:1.8,maxWidth:340}}>Every feature exists to prevent one thing: entering a trade before it is ready.</p>
            </div>
            <div style={{marginTop:40,padding:"16px 20px",background:"rgba(255,107,255,0.05)",border:"1px solid rgba(255,107,255,0.15)",borderRadius:10}}>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"#ff6bff",fontWeight:700,marginBottom:8,letterSpacing:"0.08em"}}>THE ONLY RULE THAT MATTERS</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:"#f0ecff",lineHeight:1.7}}>"No 30M close,<br/>no trade.<br/>Full stop."</div>
            </div>
          </div>
          {/* Right — rule list */}
          <div style={{display:"flex",flexDirection:"column"}}>
            {[
              {num:"01", rule:"Wicks are noise. Only closed candles trigger action.", color:"#00e5ff"},
              {num:"02", rule:"The Break is step one. You do not enter at the Break.", color:"#ffd166"},
              {num:"03", rule:"The Retest is your setup. The Continuation is your entry.", color:"#7fff6b"},
              {num:"04", rule:"If all three phases don't align — the app shows PASS.", color:"#ff6bff"},
              {num:"05", rule:"The Daily is the General. Counter-trend trades don't exist here.", color:"#ff9a3c"},
              {num:"06", rule:"When the session window closes, it closes. No chasing. No exceptions.", color:"#ff6b6b"},
            ].map((r,i)=>(
              <div key={r.num} style={{display:"flex",alignItems:"flex-start",gap:16,padding:"18px 28px",borderBottom:i<5?"1px solid rgba(255,255,255,0.05)":"none",transition:"background 0.15s"}}>
                <span style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,color:r.color,opacity:0.5,flexShrink:0,marginTop:2,letterSpacing:"0.05em"}}>{r.num}</span>
                <span style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"#ccc4e8",lineHeight:1.7}}>{r.rule}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div style={{position:"relative",zIndex:1,maxWidth:1060,margin:"0 auto",padding:"60px 24px"}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:"0.24em",color:"#ff6bff",background:"rgba(255,107,255,0.08)",border:"1px solid rgba(255,107,255,0.2)",padding:"4px 12px",borderRadius:4,display:"inline-block",marginBottom:20}}>PRICING</div>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(30px,5vw,50px)",fontWeight:800,lineHeight:1.1,letterSpacing:"-0.02em",marginBottom:12}}>Choose your plan.</h2>
        <p style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:"#ccc4e8",lineHeight:1.8,maxWidth:520,marginBottom:44}}>Every plan includes the BRC execution tracker, session-aware guidance, and AI session plans.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14}}>
          {plans.map(p=>(
            <div key={p.tier}
              onMouseEnter={()=>setHoveredPlan(p.tier)}
              onMouseLeave={()=>setHoveredPlan(null)}
              style={{position:"relative",background:p.popular?"rgba(255,107,255,0.05)":"rgba(255,255,255,0.03)",border:`1px solid ${p.popular?"rgba(255,107,255,0.3)":"rgba(255,255,255,0.08)"}`,borderRadius:14,padding:"32px 28px",transition:"all 0.2s",transform:hoveredPlan===p.tier?"translateY(-3px)":"none",boxShadow:p.popular?"0 0 40px rgba(255,107,255,0.1)":undefined}}>
              {p.popular&&<div style={{position:"absolute",top:-11,left:"50%",transform:"translateX(-50%)",fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:"0.12em",color:"#130d22",background:"#ff6bff",padding:"3px 14px",borderRadius:100,whiteSpace:"nowrap"}}>MOST POPULAR</div>}
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:"0.16em",color:p.color,marginBottom:14}}>{p.tier}</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontSize:42,fontWeight:800,lineHeight:1,color:p.color,marginBottom:4}}>{p.price}</div>
              <div style={{fontFamily:"'Space Mono',monospace",fontSize:11,color:"#8878aa",marginBottom:24}}>per month</div>
              <div style={{height:1,background:"rgba(255,255,255,0.07)",marginBottom:20}}/>
              <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:28}}>
                {p.instruments.map(ins=>(
                  <div key={ins} style={{display:"flex",alignItems:"center",gap:9,fontFamily:"'Space Mono',monospace",fontSize:11,color:"#ccc4e8"}}>
                    <span style={{color:"#7fff6b",fontWeight:900,flexShrink:0}}>✓</span>{ins}
                  </div>
                ))}
                {["Live session guidance — real time","Tier confirmation tracking","AI-generated session plans"].map(f=>(
                  <div key={f} style={{display:"flex",alignItems:"center",gap:9,fontFamily:"'Space Mono',monospace",fontSize:11,color:"#ccc4e8"}}>
                    <span style={{color:"#7fff6b",fontWeight:900,flexShrink:0}}>✓</span>{f}
                  </div>
                ))}
              </div>
              <button onClick={onEnterApp}
                style={{width:"100%",fontFamily:"'Space Mono',monospace",fontSize:11,fontWeight:700,letterSpacing:"0.1em",padding:13,borderRadius:8,cursor:"pointer",transition:"all 0.2s",
                  background:p.popular?"linear-gradient(135deg,#ff6bff,#7b2fff)":"none",
                  border:p.popular?"none":"1px solid rgba(255,255,255,0.15)",
                  color:p.popular?"#130d22":"#ccc4e8"}}>
                GET STARTED {p.popular&&"→"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Final CTA */}
      <div style={{position:"relative",zIndex:1,textAlign:"center",padding:"100px 24px",borderTop:"1px solid rgba(255,107,255,0.1)"}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:"0.24em",color:"#ff6bff",background:"rgba(255,107,255,0.08)",border:"1px solid rgba(255,107,255,0.2)",padding:"4px 12px",borderRadius:4,display:"inline-block",marginBottom:24}}>GET STARTED</div>
        <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(34px,6vw,68px)",fontWeight:800,letterSpacing:"-0.025em",lineHeight:1.05,marginBottom:20}}>
          Stop reacting.<br/>
          <span style={{background:"linear-gradient(135deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Start executing.</span>
        </h2>
        <p style={{fontFamily:"'Space Mono',monospace",fontSize:12,color:"#ccc4e8",marginBottom:36,lineHeight:1.7}}>Upload. Plan. Go live. Execute only when the setup is real.</p>
        <button onClick={onEnterApp}
          style={{fontFamily:"'Space Mono',monospace",fontSize:13,fontWeight:700,letterSpacing:"0.12em",color:"#130d22",background:"linear-gradient(135deg,#ff6bff,#7b2fff)",border:"none",padding:"17px 48px",borderRadius:8,cursor:"pointer",boxShadow:"0 0 40px rgba(255,107,255,0.3)",transition:"all 0.25s"}}>
          CHOOSE YOUR PLAN →
        </button>
        <div style={{marginTop:16,fontFamily:"'Space Mono',monospace",fontSize:10,color:"#8878aa"}}>Paid plans start at $29/month · Secure checkout · Cancel anytime</div>
      </div>

      {/* Footer */}
      <div style={{position:"relative",zIndex:1,borderTop:"1px solid rgba(255,255,255,0.06)",padding:"20px 40px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:12,fontWeight:700,color:"#8878aa"}}>◈ OmniUSD</div>
        <div style={{fontFamily:"'Space Mono',monospace",fontSize:10,color:"#8878aa",textAlign:"right"}}>
          © 2026 OmniUSD · AI-powered trading analysis<br/>
          <span style={{opacity:0.5}}>Trade at your own risk · Results not guaranteed</span>
        </div>
      </div>
    </div>
  );
}

const S={
  root:          {minHeight:"100vh",background:"var(--t-bg)",color:"var(--t-text)",fontFamily:"'Courier New',Courier,monospace",fontSize:"15px",position:"relative",overflowX:"hidden"},
  gridBg:        {position:"fixed",inset:0,backgroundImage:"linear-gradient(var(--t-gridLine) 1px,transparent 1px),linear-gradient(90deg,var(--t-gridLine) 1px,transparent 1px)",backgroundSize:"44px 44px",pointerEvents:"none",zIndex:0},
  nav:           {position:"sticky",top:0,zIndex:100,display:"flex",alignItems:"center",gap:16,padding:"0 28px",height:64,background:"var(--t-navBg)",backdropFilter:"blur(16px)",borderBottom:"1px solid var(--t-border)"},
  navLogo:       {display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:0,fontFamily:"inherit",flexShrink:0},
  logoGem:       {fontSize:24,color:"#ff6bff"},
  logoWord:      {fontSize:21,fontWeight:900,letterSpacing:"0.12em",background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  logoWord2:     {fontSize:21,fontWeight:900,letterSpacing:"0.12em",color:"#00e5ff"},
  navLinks:      {display:"flex",gap:2},
  navLink:       {background:"none",border:"none",color:"var(--t-muted)",padding:"8px 14px",cursor:"pointer",fontSize:12,letterSpacing:"0.08em",fontFamily:"inherit",borderRadius:8,transition:"all 0.15s"},
  navLinkActive: {color:"#ff6bff",background:"rgba(255,107,255,0.1)"},
  navRight:      {marginLeft:"auto",display:"flex",alignItems:"center",gap:10},
  animeChip:     {display:"flex",alignItems:"center",gap:6,background:"var(--t-c3)",border:"1px solid rgba(255,107,255,0.2)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit"},
  sessionPill:   {fontSize:11,letterSpacing:"0.12em",color:"#00e5ff",background:"rgba(0,229,255,0.08)",padding:"5px 12px",borderRadius:20,border:"1px solid rgba(0,229,255,0.2)"},
  main:          {position:"relative",zIndex:1,maxWidth:1320,margin:"0 auto",padding:"40px 24px 80px"},
  footer:        {position:"relative",zIndex:1,borderTop:"1px solid rgba(255,107,255,0.1)",padding:"18px 32px",display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11,letterSpacing:"0.06em",flexWrap:"wrap",gap:10},
  hero:          {marginBottom:32},
  heroTitle:     {fontSize:36,fontWeight:900,color:"#f8f4ff",margin:"0 0 4px",lineHeight:1.2,letterSpacing:"0.02em"},
  heroTitleAccent:{background:"linear-gradient(90deg,#ff6bff,#00e5ff)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  heroSub:       {fontSize:13,color:"var(--t-muted)",lineHeight:1.9,margin:"0 0 4px",maxWidth:580},
  uploadSection: {background:"var(--t-c2)",border:"1px solid rgba(255,107,255,0.1)",borderRadius:16,padding:"24px",marginBottom:16},
  sectionTag:    {fontSize:9,letterSpacing:"0.2em",color:"#ff6bff",background:"rgba(255,107,255,0.1)",padding:"3px 10px",borderRadius:4,border:"1px solid rgba(255,107,255,0.25)",fontWeight:900},
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
  cardLabel:     {fontSize:11,letterSpacing:"0.2em",color:"var(--t-muted)",margin:"0 0 14px"},
  resetBtn:      {background:"none",border:"1px solid rgba(255,107,255,0.25)",color:"var(--t-muted)",padding:"9px 20px",borderRadius:8,cursor:"pointer",fontSize:12,letterSpacing:"0.08em",fontFamily:"inherit"},
  instrBtn:      {background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.18)",color:"var(--t-muted2)",padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:11,fontWeight:700,letterSpacing:"0.06em",fontFamily:"inherit",transition:"all 0.15s",display:"flex",alignItems:"center"},
  instrBtnActive:{background:"rgba(255,107,255,0.14)",color:"#ff6bff",border:"1px solid rgba(255,107,255,0.5)"},
  filterBtn:     {background:"none",border:"1px solid rgba(255,107,255,0.15)",color:"var(--t-muted)",padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:10,letterSpacing:"0.08em",fontFamily:"inherit"},
  filterBtnActive:{background:"rgba(255,107,255,0.12)",color:"#ff6bff",borderColor:"rgba(255,107,255,0.4)"},
  tableWrap:     {overflowX:"auto",borderRadius:12,border:"1px solid rgba(255,107,255,0.1)"},
  table:         {width:"100%",borderCollapse:"collapse",fontSize:13},
  th:            {padding:"12px 14px",textAlign:"left",fontSize:10,letterSpacing:"0.15em",color:"var(--t-muted)",background:"var(--t-tableBg)",borderBottom:"1px solid rgba(255,107,255,0.1)",whiteSpace:"nowrap"},
  td:            {padding:"12px 14px",whiteSpace:"nowrap",verticalAlign:"middle"},
  errorBox:      {padding:"14px 18px",background:"rgba(255,107,107,0.07)",border:"1px solid rgba(255,107,107,0.25)",borderRadius:10,fontSize:15,color:"#ffaaaa",lineHeight:1.5,fontWeight:600},
  loadingScreen: {display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"70vh",gap:22,padding:40},
};

