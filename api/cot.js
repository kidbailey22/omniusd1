// /api/cot.js — CFTC COT data proxy (CommonJS)
// Commodities/Crypto  → Legacy dataset (jun7-fc8e): Commercials = smart money
// Indices/Forex       → TFF dataset   (gpe5-46if): Asset Managers = smart money

// ── Dataset routing ───────────────────────────────────────────────────────────
// Instruments using Legacy (jun7-fc8e) — Commercials as smart money
const LEGACY_MARKETS = {
  XAUUSD: "GOLD - COMMODITY EXCHANGE INC.",
  XAGUSD: "SILVER - COMMODITY EXCHANGE INC.",
  BTCUSD: "BITCOIN - CHICAGO MERCANTILE EXCHANGE",
  ETHUSD: "ETHER CASH SETTLED - CHICAGO MERCANTILE EXCHANGE",
};

// Instruments using TFF (gpe5-46if) — Asset Managers as smart money
const TFF_MARKETS = {
  NAS100: "NASDAQ MINI - CHICAGO MERCANTILE EXCHANGE",
  US500:  "E-MINI S&P 500 STOCK INDEX - CHICAGO MERCANTILE EXCHANGE",
  US30:   "DJIA x $5 - CHICAGO BOARD OF TRADE",
  EURUSD: "EURO FX - CHICAGO MERCANTILE EXCHANGE",
};

// Fallback name variants in case primary doesn't match
const TFF_FALLBACKS = {
  EURUSD: ["EURO FX - CHICAGO MERCANTILE EXCHANGE.", "Euro FX - Chicago Mercantile Exchange"],
  NAS100: ["NASDAQ-100 MINI - CHICAGO MERCANTILE EXCHANGE", "NASDAQ 100 MINI - CHICAGO MERCANTILE EXCHANGE"],
  US500:  ["E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE", "S&P 500 MINI - CHICAGO MERCANTILE EXCHANGE"],
  US30:   ["DJIA x $5 FUTURES - CHICAGO BOARD OF TRADE", "E-MINI DOW ($5) FUTURES - CHICAGO BOARD OF TRADE"],
};

const CFTC_HEADERS = {
  "Accept":     "application/json",
  "Referer":    "https://publicreporting.cftc.gov/",
  "Origin":     "https://publicreporting.cftc.gov",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

// ── Legacy parser (Commodities / Crypto) ─────────────────────────────────────
// Smart money = Commercials (producers, miners, hedgers)
function parseLegacy(data) {
  const latest = data[0];
  const prev   = data[1] || null;

  const commLong     = parseInt(latest.comm_positions_long_all     || 0);
  const commShort    = parseInt(latest.comm_positions_short_all    || 0);
  const specLong     = parseInt(latest.noncomm_positions_long_all  || 0);
  const specShort    = parseInt(latest.noncomm_positions_short_all || 0);
  const smallLong    = parseInt(latest.nonrept_positions_long_all  || 0);
  const smallShort   = parseInt(latest.nonrept_positions_short_all || 0);
  const openInterest = parseInt(latest.open_interest_all           || 1);
  const commNet      = commLong - commShort;
  const specNet      = specLong - specShort;

  let commChange = null;
  if (prev) {
    const pL = parseInt(prev.comm_positions_long_all  || 0);
    const pS = parseInt(prev.comm_positions_short_all || 0);
    commChange = commNet - (pL - pS);
  }

  const netPct     = (Math.abs(commNet) / openInterest) * 100;
  const specNetPct = (Math.abs(specNet) / openInterest) * 100;

  // Neutral zone — within 2% of 50/50 → avoid false signal
  const commLongPct = commLong / (commLong + commShort + 1) * 100;
  const isNeutral   = commLongPct >= 48 && commLongPct <= 52;

  let signal, advice;
  if (isNeutral) {
    signal = "NEUTRAL";
    advice = "Commercials are near 50/50 — no clear institutional bias. No COT edge this week.";
  } else if (commNet > 0) {
    signal = netPct > 20 ? "STRONG LONG" : "NET LONG";
    advice = netPct > 20
      ? "Commercials heavily net long — institutional accumulation. Longs have strong tailwind."
      : "Commercials net long — moderate institutional support for longs.";
  } else {
    signal = netPct > 20 ? "STRONG SHORT" : "NET SHORT";
    advice = netPct > 20
      ? "Commercials heavily net short — smart money is hedging upside. Size down on longs, shorts have tailwind."
      : "Commercials net short — institutional hedging in place. Be cautious on longs.";
  }

  let spec_warning = null;
  if (specNet > 0 && specNetPct > 25 && commNet < 0)
    spec_warning = "Large Speculators at extreme long while Commercials are short — classic reversal setup. High caution on longs.";
  else if (specNet < 0 && specNetPct > 25 && commNet > 0)
    spec_warning = "Large Speculators at extreme short while Commercials are long — potential bottom. Shorts may be crowded.";

  return {
    report_date:   latest.report_date_as_yyyy_mm_dd || "N/A",
    market_name:   latest.market_and_exchange_names || "",
    data_type:     "legacy",
    smart_money:   "Commercials",
    comm_long:     commLong,
    comm_short:    commShort,
    comm_net:      commNet,
    comm_change:   commChange,
    spec_long:     specLong,
    spec_short:    specShort,
    spec_net:      specNet,
    small_long:    smallLong,
    small_short:   smallShort,
    open_interest: openInterest,
    signal, advice, spec_warning,
  };
}

// ── TFF parser (Indices / Forex) ─────────────────────────────────────────────
// Smart money = Asset Managers (pension funds, institutional investors)
// Secondary    = Leveraged Funds (hedge funds) — used for spec_warning
function parseTFF(data) {
  const latest = data[0];
  const prev   = data[1] || null;

  // Asset Managers — primary institutional signal
  const commLong  = parseInt(latest.asset_mgr_positions_long_all  || 0);
  const commShort = parseInt(latest.asset_mgr_positions_short_all || 0);

  // Leveraged Funds — hedge funds, used as secondary/warning signal
  const specLong  = parseInt(latest.lev_money_positions_long_all  || 0);
  const specShort = parseInt(latest.lev_money_positions_short_all || 0);

  // Dealers — market makers (intentionally excluded from signal logic)
  const dealerLong  = parseInt(latest.dealer_positions_long_all   || 0);
  const dealerShort = parseInt(latest.dealer_positions_short_all  || 0);

  const openInterest = parseInt(latest.open_interest_all || 1);
  const commNet      = commLong - commShort;
  const specNet      = specLong - specShort;

  let commChange = null;
  if (prev) {
    const pL = parseInt(prev.asset_mgr_positions_long_all  || 0);
    const pS = parseInt(prev.asset_mgr_positions_short_all || 0);
    commChange = commNet - (pL - pS);
  }

  const netPct     = (Math.abs(commNet) / openInterest) * 100;
  const specNetPct = (Math.abs(specNet) / openInterest) * 100;

  // Neutral zone check
  const commLongPct = commLong / (commLong + commShort + 1) * 100;
  const isNeutral   = commLongPct >= 48 && commLongPct <= 52;

  let signal, advice;
  if (isNeutral) {
    signal = "NEUTRAL";
    advice = "Asset Managers are near 50/50 — no clear institutional bias. No COT edge this week.";
  } else if (commNet > 0) {
    signal = netPct > 15 ? "STRONG LONG" : "NET LONG";
    // Note: threshold 15% (not 20%) — TFF OI is larger so 15% = stronger conviction
    advice = netPct > 15
      ? "Asset Managers heavily net long — institutional funds are positioned long. Strong tailwind for longs."
      : "Asset Managers net long — institutional support for longs. Moderate tailwind.";
  } else {
    signal = netPct > 15 ? "STRONG SHORT" : "NET SHORT";
    advice = netPct > 15
      ? "Asset Managers heavily net short — institutional funds are positioned short. Longs face headwind."
      : "Asset Managers net short — institutional lean bearish. Be cautious on longs.";
  }

  // Warning: Asset Managers and Hedge Funds disagree = mixed signal
  let spec_warning = null;
  const agreeing = (commNet > 0 && specNet > 0) || (commNet < 0 && specNet < 0);
  if (!agreeing && specNetPct > 10) {
    const levDir  = specNet > 0 ? "LONG" : "SHORT";
    const instDir = commNet > 0 ? "LONG" : "SHORT";
    spec_warning = `Asset Managers ${instDir} but Hedge Funds ${levDir} — split institutional signal. Size down, wait for A+ clarity.`;
  }

  return {
    report_date:   latest.report_date_as_yyyy_mm_dd || "N/A",
    market_name:   latest.market_and_exchange_names || "",
    data_type:     "tff",
    smart_money:   "Asset Managers",
    comm_long:     commLong,
    comm_short:    commShort,
    comm_net:      commNet,
    comm_change:   commChange,
    spec_long:     specLong,
    spec_short:    specShort,
    spec_net:      specNet,
    small_long:    dealerLong,   // repurposed field — dealers stored here for UI display
    small_short:   dealerShort,
    open_interest: openInterest,
    signal, advice, spec_warning,
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { instrument } = req.query;
  if (!instrument) return res.status(400).json({ error: "instrument param required" });

  // Route to correct dataset
  const isLegacy   = !!LEGACY_MARKETS[instrument];
  const isTFF      = !!TFF_MARKETS[instrument];
  const marketName = LEGACY_MARKETS[instrument] || TFF_MARKETS[instrument];
  const datasetId  = isLegacy ? "jun7-fc8e" : "gpe5-46if";
  const parseFunc  = isLegacy ? parseLegacy : parseTFF;

  if (!marketName) {
    return res.status(400).json({ error: "No COT data for " + instrument });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(function() { controller.abort(); }, 9000);


  try {
    // Try primary name first, then fallbacks
    const namesToTry = [marketName, ...(TFF_FALLBACKS[instrument] || [])];
    let data = null;

    for (const name of namesToTry) {
      const encodedName = encodeURIComponent(name);
      const url = "https://publicreporting.cftc.gov/resource/" + datasetId + ".json"
        + "?market_and_exchange_names=" + encodedName
        + "&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=2";

      console.log("COT [" + instrument + "] trying: " + name);
      const response = await fetch(url, { signal: controller.signal, headers: CFTC_HEADERS });
      clearTimeout(timeoutId);

      if (!response.ok) { console.warn("HTTP " + response.status); continue; }
      const rows = await response.json();
      if (rows && rows.length > 0) {
        data = rows;
        console.log("COT [" + instrument + "] matched: " + name);
        break;
      }
      console.warn("COT [" + instrument + "] empty for: " + name);
    }

    // TFF returned nothing — fall back to Legacy
    if ((!data || data.length === 0) && isTFF) {
      console.warn("COT TFF all names failed for " + instrument + " — falling back to Legacy");
      const encodedFallback = encodeURIComponent(marketName);
      const legacyUrl = "https://publicreporting.cftc.gov/resource/jun7-fc8e.json"
        + "?market_and_exchange_names=" + encodedFallback
        + "&%24order=report_date_as_yyyy_mm_dd%20DESC&%24limit=2";
      const fallback = await fetch(legacyUrl, { headers: CFTC_HEADERS });
      if (!fallback.ok) throw new Error("CFTC fallback HTTP " + fallback.status);
      const fallbackData = await fallback.json();
      if (!fallbackData || fallbackData.length === 0) throw new Error("No COT data found for " + instrument);
      const result = parseLegacy(fallbackData);
      return res.status(200).json(Object.assign({ instrument, _fallback: "legacy" }, result));
    }

    if (!data || data.length === 0) throw new Error("No COT data found for " + instrument);

    const result = parseFunc(data);
    return res.status(200).json(Object.assign({ instrument }, result));


  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err.name === "AbortError" ? "CFTC API timeout" : err.message;
    console.error("COT [" + instrument + "]: " + msg);
    return res.status(500).json({ error: msg });
  }
};
